import { randomUUID } from 'crypto';
import { mkdir, writeFile, readFile, unlink, access, rm } from 'fs/promises';
import { join, extname } from 'path';
import { and, desc, eq, inArray, like } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { artifacts, chatGeneratedFiles, knowledgeVaults } from '$lib/server/db/schema';
import { parseJsonRecord } from '$lib/server/utils/json';
import { createArtifactLink, createGeneratedOutputArtifact } from '$lib/server/services/knowledge';
import {
	buildGeneratedOutputDocumentMetadata,
	parseWorkingDocumentMetadata,
	resolveGeneratedDocumentFamilyContext,
} from '$lib/server/services/knowledge/store';
import { syncArtifactToHoncho } from '$lib/server/services/honcho';
import { extractDocumentText } from './document-extraction';

export interface ChatFile {
	id: string;
	conversationId: string;
	assistantMessageId: string | null;
	artifactId: string | null;
	documentFamilyId?: string | null;
	documentLabel?: string | null;
	documentRole?: string | null;
	versionNumber?: number | null;
	originConversationId?: string | null;
	originAssistantMessageId?: string | null;
	sourceChatFileId?: string | null;
	userId: string;
	filename: string;
	mimeType: string | null;
	sizeBytes: number;
	storagePath: string;
	createdAt: number;
}

export interface ChatFileSavedVaultLink {
	artifactId: string;
	filename: string;
	vaultId: string;
	vaultName: string;
}

export interface FileInput {
	filename: string;
	mimeType?: string;
	content: Buffer | Uint8Array;
	assistantMessageId?: string | null;
}

interface GeneratedFileVersionRecord {
	artifactId: string;
	version: number;
	updatedAt: number;
	summary: string | null;
	contentText: string | null;
	conversationId: string | null;
	documentFamilyId: string | null;
	documentLabel: string | null;
	documentRole: string | null;
}

function previewText(value: string | null | undefined, limit = 1200): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	return trimmed.length > limit ? `${trimmed.slice(0, limit)}...` : trimmed;
}

function buildGeneratedFileArtifactName(filename: string): string {
	return `${filename} generated file`;
}

function buildGeneratedFileVersionExcerpt(version: GeneratedFileVersionRecord): string | null {
	const summarySnippet = previewText(version.summary, 220);
	const contentSnippet = previewText(version.contentText, 320);
	return summarySnippet ?? contentSnippet;
}

function buildGeneratedFileMemoryContent(params: {
	file: ChatFile;
	extractedText: string | null;
	assistantResponse: string;
	versionNumber: number;
	recentVersions: GeneratedFileVersionRecord[];
}): string {
	const lines = [
		`Generated file: ${params.file.filename}`,
		`File type: ${params.file.mimeType ?? 'application/octet-stream'}`,
		`Chat file id: ${params.file.id}`,
		`Generated in conversation: ${params.file.conversationId}`,
		`Generated file version: v${params.versionNumber}`,
	];

	if (params.recentVersions.length > 0) {
		lines.push('', 'Recent prior versions:');
		for (const version of params.recentVersions) {
			const timestamp = new Date(version.updatedAt).toISOString();
			const location =
				version.conversationId && version.conversationId !== params.file.conversationId
					? ` in conversation ${version.conversationId}`
					: '';
			const excerpt = buildGeneratedFileVersionExcerpt(version);
			lines.push(
				excerpt
					? `- v${version.version} from ${timestamp}${location}: ${excerpt}`
					: `- v${version.version} from ${timestamp}${location}`
			);
		}
	}

	const responseSnippet = previewText(params.assistantResponse, 900);
	if (responseSnippet) {
		lines.push('', 'Assistant response context:', responseSnippet);
	}

	const extractedSnippet = previewText(params.extractedText, 6000);
	if (extractedSnippet) {
		lines.push('', 'Extracted file content:', extractedSnippet);
	} else {
		lines.push(
			'',
			'Extracted file content: No readable text could be extracted from this file. Use the filename, file type, and surrounding chat context when continuing it.'
		);
	}

	return lines.join('\n');
}

async function listRecentGeneratedFileVersions(
	userId: string,
	filename: string,
	limit = 4
): Promise<GeneratedFileVersionRecord[]> {
	const rows = await db
		.select({
			id: artifacts.id,
			conversationId: artifacts.conversationId,
			summary: artifacts.summary,
			contentText: artifacts.contentText,
			metadataJson: artifacts.metadataJson,
			updatedAt: artifacts.updatedAt,
		})
		.from(artifacts)
		.where(
			and(
				eq(artifacts.userId, userId),
				eq(artifacts.type, 'generated_output')
			)
		)
		.orderBy(desc(artifacts.updatedAt))
		.limit(Math.max(limit * 12, 24));

	const parsedRows = rows.map((row) => {
		const metadata = parseJsonRecord(row.metadataJson ?? null);
		return {
			row,
			metadata,
		};
	});
	const familyContext = resolveGeneratedDocumentFamilyContext({
		filename,
		candidates: parsedRows.map(({ row, metadata }) => ({
			artifactId: row.id,
			artifactName: row.name,
			updatedAt: row.updatedAt.getTime(),
			metadata,
		})),
	});

	const matchingRows = parsedRows
		.filter(({ row, metadata }) => {
			if (familyContext.matchingArtifactIds.length > 0) {
				return familyContext.matchingArtifactIds.includes(row.id);
			}

			const generatedFilename =
				typeof metadata?.generatedFilename === 'string' ? metadata.generatedFilename.trim() : null;
			const documentMetadata = parseWorkingDocumentMetadata(metadata);
			return (
				generatedFilename === filename ||
				documentMetadata.documentLabel === filename ||
				row.name === buildGeneratedFileArtifactName(filename)
			);
		})
		.slice(0, limit);

	return matchingRows.map(({ row, metadata }, index) => {
		const documentMetadata = parseWorkingDocumentMetadata(metadata);
		const storedVersion =
			typeof documentMetadata.versionNumber === 'number' && Number.isFinite(documentMetadata.versionNumber)
				? Math.trunc(documentMetadata.versionNumber)
				: typeof metadata?.generatedFileVersion === 'number' &&
					  Number.isFinite(metadata.generatedFileVersion)
					? Math.trunc(metadata.generatedFileVersion)
				: null;

		return {
			artifactId: row.id,
			version: storedVersion && storedVersion > 0 ? storedVersion : matchingRows.length - index,
			updatedAt: row.updatedAt.getTime(),
			summary: row.summary ?? null,
			contentText: row.contentText ?? null,
			conversationId: row.conversationId ?? null,
			documentFamilyId: documentMetadata.documentFamilyId ?? null,
			documentLabel: documentMetadata.documentLabel ?? null,
			documentRole: documentMetadata.documentRole ?? null,
		};
	});
}

function mapRowToChatFile(row: typeof chatGeneratedFiles.$inferSelect): ChatFile {
	return {
		id: row.id,
		conversationId: row.conversationId,
		assistantMessageId: row.assistantMessageId ?? null,
		artifactId: null,
		userId: row.userId,
		filename: row.filename,
		mimeType: row.mimeType ?? null,
		sizeBytes: row.sizeBytes,
		storagePath: row.storagePath,
		createdAt: row.createdAt.getTime(),
	};
}

async function listGeneratedOutputArtifactIdsByChatFile(
	conversationId: string
): Promise<
	Map<
		string,
		{
			artifactId: string;
			documentFamilyId: string | null;
			documentLabel: string | null;
			documentRole: string | null;
			versionNumber: number | null;
			originConversationId: string | null;
			originAssistantMessageId: string | null;
			sourceChatFileId: string | null;
		}
	>
> {
	const rows = await db
		.select({
			id: artifacts.id,
			metadataJson: artifacts.metadataJson,
		})
		.from(artifacts)
		.where(
			and(
				eq(artifacts.conversationId, conversationId),
				eq(artifacts.type, 'generated_output')
			)
		)
		.orderBy(desc(artifacts.updatedAt));

	const artifactIdsByChatFile = new Map<
		string,
		{
			artifactId: string;
			documentFamilyId: string | null;
			documentLabel: string | null;
			documentRole: string | null;
			versionNumber: number | null;
			originConversationId: string | null;
			originAssistantMessageId: string | null;
			sourceChatFileId: string | null;
		}
	>();
	for (const row of rows) {
		const metadata = parseJsonRecord(row.metadataJson ?? null);
		const chatFileId =
			typeof metadata?.originalChatFileId === 'string' && metadata.originalChatFileId.trim()
				? metadata.originalChatFileId.trim()
				: null;
		if (!chatFileId || artifactIdsByChatFile.has(chatFileId)) {
			continue;
		}
		const documentMetadata = parseWorkingDocumentMetadata(metadata);
		artifactIdsByChatFile.set(chatFileId, {
			artifactId: row.id,
			documentFamilyId: documentMetadata.documentFamilyId ?? null,
			documentLabel: documentMetadata.documentLabel ?? null,
			documentRole: documentMetadata.documentRole ?? null,
			versionNumber:
				typeof documentMetadata.versionNumber === 'number' &&
				Number.isFinite(documentMetadata.versionNumber)
					? Math.trunc(documentMetadata.versionNumber)
					: null,
			originConversationId: documentMetadata.originConversationId ?? null,
			originAssistantMessageId: documentMetadata.originAssistantMessageId ?? null,
			sourceChatFileId: documentMetadata.sourceChatFileId ?? null,
		});
	}

	return artifactIdsByChatFile;
}

function getChatFilesDir(): string {
	return join(process.cwd(), 'data', 'chat-files');
}

function getConversationDir(conversationId: string): string {
	return join(getChatFilesDir(), conversationId);
}

function getFileExtension(filename: string): string {
	const ext = extname(filename).toLowerCase();
	return ext ? ext.slice(1) : 'bin';
}

/**
 * Store a generated file for a conversation.
 * Saves to data/chat-files/{conversationId}/{fileId}.{ext}
 */
export async function storeGeneratedFile(
	conversationId: string,
	userId: string,
	file: FileInput
): Promise<ChatFile> {
	const id = randomUUID();
	const ext = getFileExtension(file.filename);
	const storagePath = join(conversationId, `${id}.${ext}`);
	const fullPath = join(getChatFilesDir(), storagePath);
	const buffer = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);

	try {
		// Ensure directory exists
		const conversationDir = getConversationDir(conversationId);
		await mkdir(conversationDir, { recursive: true });

		// Write file to disk
		await writeFile(fullPath, buffer);

		// Create database record
		const [row] = await db
			.insert(chatGeneratedFiles)
			.values({
				id,
				conversationId,
				assistantMessageId: file.assistantMessageId ?? null,
				userId,
				filename: file.filename,
				mimeType: file.mimeType ?? null,
				sizeBytes: buffer.length,
				storagePath,
			})
			.returning();

		const storedFile = mapRowToChatFile(row);
		return storedFile;
	} catch (error) {
		console.error('[CHAT_FILES] Failed to store generated file', {
			conversationId,
			userId,
			fileId: id,
			filename: file.filename,
			storagePath,
			error,
		});
		throw error;
	}
}

/**
 * Get all files for a conversation.
 * Returns only files belonging to the specified conversation.
 */
export async function getChatFiles(conversationId: string): Promise<ChatFile[]> {
	try {
		const [rows, artifactIdsByChatFile] = await Promise.all([
			db
				.select()
				.from(chatGeneratedFiles)
				.where(eq(chatGeneratedFiles.conversationId, conversationId))
				.orderBy(desc(chatGeneratedFiles.createdAt)),
			listGeneratedOutputArtifactIdsByChatFile(conversationId),
		]);

		return rows.map((row) => ({
			...mapRowToChatFile(row),
			artifactId: artifactIdsByChatFile.get(row.id)?.artifactId ?? null,
			documentFamilyId: artifactIdsByChatFile.get(row.id)?.documentFamilyId ?? null,
			documentLabel: artifactIdsByChatFile.get(row.id)?.documentLabel ?? null,
			documentRole: artifactIdsByChatFile.get(row.id)?.documentRole ?? null,
			versionNumber: artifactIdsByChatFile.get(row.id)?.versionNumber ?? null,
			originConversationId: artifactIdsByChatFile.get(row.id)?.originConversationId ?? null,
			originAssistantMessageId:
				artifactIdsByChatFile.get(row.id)?.originAssistantMessageId ?? null,
			sourceChatFileId: artifactIdsByChatFile.get(row.id)?.sourceChatFileId ?? null,
		}));
	} catch (error) {
		console.error('[CHAT_FILES] Failed to list generated files', {
			conversationId,
			error,
		});
		throw error;
	}
}

export async function getChatFilesForAssistantMessage(
	conversationId: string,
	assistantMessageId: string
): Promise<ChatFile[]> {
	try {
		const [rows, artifactIdsByChatFile] = await Promise.all([
			db
				.select()
				.from(chatGeneratedFiles)
				.where(
					and(
						eq(chatGeneratedFiles.conversationId, conversationId),
						eq(chatGeneratedFiles.assistantMessageId, assistantMessageId)
					)
				)
				.orderBy(desc(chatGeneratedFiles.createdAt)),
			listGeneratedOutputArtifactIdsByChatFile(conversationId),
		]);

		return rows.map((row) => ({
			...mapRowToChatFile(row),
			artifactId: artifactIdsByChatFile.get(row.id)?.artifactId ?? null,
			documentFamilyId: artifactIdsByChatFile.get(row.id)?.documentFamilyId ?? null,
			documentLabel: artifactIdsByChatFile.get(row.id)?.documentLabel ?? null,
			documentRole: artifactIdsByChatFile.get(row.id)?.documentRole ?? null,
			versionNumber: artifactIdsByChatFile.get(row.id)?.versionNumber ?? null,
			originConversationId: artifactIdsByChatFile.get(row.id)?.originConversationId ?? null,
			originAssistantMessageId:
				artifactIdsByChatFile.get(row.id)?.originAssistantMessageId ?? null,
			sourceChatFileId: artifactIdsByChatFile.get(row.id)?.sourceChatFileId ?? null,
		}));
	} catch (error) {
		console.error('[CHAT_FILES] Failed to list assistant-scoped generated files', {
			conversationId,
			assistantMessageId,
			error,
		});
		throw error;
	}
}

export async function assignGeneratedFilesToAssistantMessage(
	conversationId: string,
	assistantMessageId: string,
	fileIds: string[]
): Promise<void> {
	if (fileIds.length === 0) {
		return;
	}

	await db
		.update(chatGeneratedFiles)
		.set({ assistantMessageId })
		.where(
			and(
				eq(chatGeneratedFiles.conversationId, conversationId),
				inArray(chatGeneratedFiles.id, fileIds)
			)
		);
}

export async function syncGeneratedFilesToMemory(params: {
	userId: string;
	conversationId: string;
	assistantMessageId: string;
	fileIds: string[];
	assistantResponse: string;
}): Promise<void> {
	if (params.fileIds.length === 0) {
		return;
	}

	const uniqueFileIds = Array.from(new Set(params.fileIds));

	for (const fileId of uniqueFileIds) {
		try {
			const file = await getChatFile(params.conversationId, fileId);
			if (!file) {
				continue;
			}

			const content = await readStoredChatFile(file);
			if (!content) {
				continue;
			}

			let extractedText: string | null = null;
			const isBinaryImage =
				file.mimeType?.startsWith('image/') === true && file.mimeType !== 'image/svg+xml';

			if (!isBinaryImage) {
				const extraction = await extractDocumentText(
					join(getChatFilesDir(), file.storagePath),
					file.mimeType,
					file.filename
				);
				extractedText = extraction.text;
			}

			const recentVersions = await listRecentGeneratedFileVersions(params.userId, file.filename, 4);
			const previousVersion = recentVersions[0] ?? null;
			const previousVersionNumbers = recentVersions
				.map((version) => version.version)
				.filter((version) => Number.isFinite(version) && version > 0);
			const versionNumber =
				previousVersionNumbers.length > 0 ? Math.max(...previousVersionNumbers) + 1 : 1;
			const documentFamilyId = previousVersion?.documentFamilyId ?? randomUUID();
			const documentLabel = previousVersion?.documentLabel ?? file.filename;
			const documentRole = previousVersion?.documentRole ?? null;
			const workingDocumentMetadata = buildGeneratedOutputDocumentMetadata({
				familyId: documentFamilyId,
				label: documentLabel,
				role: documentRole,
				versionNumber,
				supersedesArtifactId: previousVersion?.artifactId ?? null,
				originConversationId: params.conversationId,
				originAssistantMessageId: params.assistantMessageId,
				sourceChatFileId: file.id,
			});

			const memoryArtifact = await createGeneratedOutputArtifact({
				userId: params.userId,
				conversationId: params.conversationId,
				messageId: params.assistantMessageId,
				content: buildGeneratedFileMemoryContent({
					file,
					extractedText,
					assistantResponse: params.assistantResponse,
					versionNumber,
					recentVersions,
				}),
				sourceArtifactIds: [],
				nameOverride: buildGeneratedFileArtifactName(file.filename),
				metadata: {
					generatedFile: true,
					originalChatFileId: file.id,
					generatedFilename: file.filename,
					generatedMimeType: file.mimeType,
					assistantMessageId: params.assistantMessageId,
					generatedFileVersion: versionNumber,
					previousGeneratedArtifactId: previousVersion?.artifactId ?? null,
					recentGeneratedVersionIds: recentVersions.map((version) => version.artifactId),
					...workingDocumentMetadata,
				},
			});

			if (!memoryArtifact) {
				continue;
			}

			if (previousVersion) {
				await createArtifactLink({
					userId: params.userId,
					artifactId: memoryArtifact.id,
					relatedArtifactId: previousVersion.artifactId,
					conversationId: params.conversationId,
					messageId: params.assistantMessageId,
					linkType: 'supersedes',
				});
			}

			const binaryFile = new File([content], file.filename, {
				type: file.mimeType ?? 'application/octet-stream',
			});

			const syncResult = await syncArtifactToHoncho({
				userId: params.userId,
				conversationId: params.conversationId,
				artifact: memoryArtifact,
				file: binaryFile,
			});

			if (!syncResult.uploaded) {
				await syncArtifactToHoncho({
					userId: params.userId,
					conversationId: params.conversationId,
					artifact: memoryArtifact,
					fallbackTextArtifact: memoryArtifact,
				});
			}
		} catch (error) {
			console.error('[CHAT_FILES] Failed to sync generated file to memory', {
				conversationId: params.conversationId,
				assistantMessageId: params.assistantMessageId,
				fileId,
				error,
			});
		}
	}
}

/**
 * Get a specific file by ID within a conversation.
 * Verifies the file belongs to the conversation.
 */
export async function getChatFile(
	conversationId: string,
	fileId: string
): Promise<ChatFile | null> {
	const [row] = await db
		.select()
		.from(chatGeneratedFiles)
		.where(
			and(
				eq(chatGeneratedFiles.id, fileId),
				eq(chatGeneratedFiles.conversationId, conversationId)
			)
		)
		.limit(1);

	return row ? mapRowToChatFile(row) : null;
}

/**
 * Get a specific file by ID for a user, regardless of conversation.
 * Used by routes that already authenticate the current user.
 */
export async function getChatFileByUser(
	fileId: string,
	userId: string
): Promise<ChatFile | null> {
	const [row] = await db
		.select()
		.from(chatGeneratedFiles)
		.where(
			and(
				eq(chatGeneratedFiles.id, fileId),
				eq(chatGeneratedFiles.userId, userId)
			)
		)
		.limit(1);

	return row ? mapRowToChatFile(row) : null;
}

async function readStoredChatFile(file: ChatFile): Promise<Buffer | null> {
	const fullPath = join(getChatFilesDir(), file.storagePath);
	try {
		await access(fullPath);
		return await readFile(fullPath);
	} catch {
		return null;
	}
}

/**
 * Read the actual file content from disk.
 * Returns null if file doesn't exist in database or on disk.
 */
export async function readChatFileContent(
	conversationId: string,
	fileId: string
): Promise<Buffer | null> {
	const file = await getChatFile(conversationId, fileId);
	if (!file) return null;

	return readStoredChatFile(file);
}

/**
 * Read the actual file content from disk for a user-owned file.
 * Returns null if the file doesn't exist in database or on disk.
 */
export async function readChatFileContentByUser(
	fileId: string,
	userId: string
): Promise<Buffer | null> {
	const file = await getChatFileByUser(fileId, userId);
	if (!file) return null;

	return readStoredChatFile(file);
}

export async function listSavedVaultsForChatFiles(
	userId: string,
	fileIds: string[]
): Promise<Map<string, ChatFileSavedVaultLink>> {
	if (fileIds.length === 0) {
		return new Map();
	}

	const fileIdSet = new Set(fileIds);
	const rows = await db
		.select({
			artifactId: artifacts.id,
			filename: artifacts.name,
			vaultId: artifacts.vaultId,
			vaultName: knowledgeVaults.name,
			metadataJson: artifacts.metadataJson,
		})
		.from(artifacts)
		.innerJoin(knowledgeVaults, eq(artifacts.vaultId, knowledgeVaults.id))
		.where(
			and(
				eq(artifacts.userId, userId),
				eq(artifacts.type, 'source_document'),
				like(artifacts.metadataJson, '%"uploadSource":"chat_generated_file"%')
			)
		)
		.orderBy(desc(artifacts.updatedAt));

	const savedLinks = new Map<string, ChatFileSavedVaultLink>();

	for (const row of rows) {
		const metadata = parseJsonRecord(row.metadataJson ?? null);
		const originalChatFileId =
			typeof metadata?.originalChatFileId === 'string' ? metadata.originalChatFileId : null;
		if (!originalChatFileId || !fileIdSet.has(originalChatFileId) || savedLinks.has(originalChatFileId)) {
			continue;
		}

		if (!(row.vaultId && row.vaultName)) {
			continue;
		}

		savedLinks.set(originalChatFileId, {
			artifactId: row.artifactId,
			filename: row.filename,
			vaultId: row.vaultId,
			vaultName: row.vaultName,
		});
	}

	return savedLinks;
}

export async function getSavedVaultForChatFile(
	userId: string,
	fileId: string
): Promise<ChatFileSavedVaultLink | null> {
	const links = await listSavedVaultsForChatFiles(userId, [fileId]);
	return links.get(fileId) ?? null;
}

/**
 * Delete a chat file.
 * Removes both the database record and the file from disk.
 */
export async function deleteChatFile(
	conversationId: string,
	fileId: string
): Promise<boolean> {
	const file = await getChatFile(conversationId, fileId);
	if (!file) return false;

	// Delete from database
	await db
		.delete(chatGeneratedFiles)
		.where(
			and(
				eq(chatGeneratedFiles.id, fileId),
				eq(chatGeneratedFiles.conversationId, conversationId)
			)
		);

	// Delete from disk
	const fullPath = join(getChatFilesDir(), file.storagePath);
	try {
		await unlink(fullPath);
	} catch {
		// File may not exist on disk, that's ok
	}

	return true;
}

/**
 * Delete all files for a conversation.
 * Used when a conversation is deleted.
 */
export async function deleteAllChatFilesForConversation(conversationId: string): Promise<number> {
	const files = await getChatFiles(conversationId);

	// Delete from database
	await db
		.delete(chatGeneratedFiles)
		.where(eq(chatGeneratedFiles.conversationId, conversationId));

	// Delete files from disk
	let deletedCount = 0;
	for (const file of files) {
		const fullPath = join(getChatFilesDir(), file.storagePath);
		try {
			await unlink(fullPath);
			deletedCount++;
		} catch {
			// File may not exist on disk
		}
	}

	try {
		await rm(getConversationDir(conversationId), { recursive: true, force: true });
	} catch {
		// Directory cleanup is best-effort
	}

	return deletedCount;
}
