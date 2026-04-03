import { randomUUID } from 'crypto';
import { mkdir, writeFile, readFile, unlink, access } from 'fs/promises';
import { join, extname } from 'path';
import { and, desc, eq, inArray, like } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { artifacts, chatGeneratedFiles, knowledgeVaults } from '$lib/server/db/schema';
import { parseJsonRecord } from '$lib/server/utils/json';

export interface ChatFile {
	id: string;
	conversationId: string;
	assistantMessageId: string | null;
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

function mapRowToChatFile(row: typeof chatGeneratedFiles.$inferSelect): ChatFile {
	return {
		id: row.id,
		conversationId: row.conversationId,
		assistantMessageId: row.assistantMessageId ?? null,
		userId: row.userId,
		filename: row.filename,
		mimeType: row.mimeType ?? null,
		sizeBytes: row.sizeBytes,
		storagePath: row.storagePath,
		createdAt: row.createdAt.getTime(),
	};
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

	console.info('[CHAT_FILES] Storing generated file', {
		conversationId,
		userId,
		fileId: id,
		filename: file.filename,
		mimeType: file.mimeType ?? null,
		sizeBytes: buffer.length,
		storagePath,
	});

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
		console.info('[CHAT_FILES] Stored generated file', {
			conversationId,
			userId,
			fileId: storedFile.id,
			filename: storedFile.filename,
			sizeBytes: storedFile.sizeBytes,
			storagePath: storedFile.storagePath,
		});

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
		const rows = await db
			.select()
			.from(chatGeneratedFiles)
			.where(eq(chatGeneratedFiles.conversationId, conversationId))
			.orderBy(desc(chatGeneratedFiles.createdAt));

		const files = rows.map(mapRowToChatFile);
		console.info('[CHAT_FILES] Listed generated files', {
			conversationId,
			count: files.length,
			files: files.map((file) => ({
				id: file.id,
				filename: file.filename,
				sizeBytes: file.sizeBytes,
				mimeType: file.mimeType,
			})),
		});
		return files;
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
		const rows = await db
			.select()
			.from(chatGeneratedFiles)
			.where(
				and(
					eq(chatGeneratedFiles.conversationId, conversationId),
					eq(chatGeneratedFiles.assistantMessageId, assistantMessageId)
				)
			)
			.orderBy(desc(chatGeneratedFiles.createdAt));

		const files = rows.map(mapRowToChatFile);
		console.info('[CHAT_FILES] Listed assistant-scoped generated files', {
			conversationId,
			assistantMessageId,
			count: files.length,
			files: files.map((file) => ({
				id: file.id,
				filename: file.filename,
				sizeBytes: file.sizeBytes,
				mimeType: file.mimeType,
			})),
		});
		return files;
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

	return deletedCount;
}
