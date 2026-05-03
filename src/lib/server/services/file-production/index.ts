import type { FileProductionJob } from '$lib/types';
import { getChatFiles } from '$lib/server/services/chat-files';
import { db } from '$lib/server/db';
import { fileProductionJobFiles, fileProductionJobs } from '$lib/server/db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { ChatFile } from '$lib/server/services/chat-files';

function legacyJobId(fileId: string): string {
	return `legacy-file:${fileId}`;
}

function legacyJobFileLinkId(fileId: string): string {
	return `legacy-file-link:${fileId}`;
}

async function ensureLegacyJobs(files: ChatFile[]): Promise<void> {
	if (files.length === 0) {
		return;
	}

	const fileIds = files.map((file) => file.id);
	const existingLinks = await db
		.select({ chatGeneratedFileId: fileProductionJobFiles.chatGeneratedFileId })
		.from(fileProductionJobFiles)
		.where(inArray(fileProductionJobFiles.chatGeneratedFileId, fileIds));
	const linkedFileIds = new Set(existingLinks.map((link) => link.chatGeneratedFileId));
	const missingFiles = files.filter((file) => !linkedFileIds.has(file.id));

	for (const file of missingFiles) {
		const createdAt = new Date(file.createdAt);
		await db
			.insert(fileProductionJobs)
			.values({
				id: legacyJobId(file.id),
				conversationId: file.conversationId,
				assistantMessageId: file.assistantMessageId,
				userId: file.userId,
				title: file.documentLabel ?? file.filename,
				status: 'succeeded',
				stage: null,
				origin: 'legacy_generated_file',
				createdAt,
				updatedAt: createdAt,
			})
			.onConflictDoNothing({ target: fileProductionJobs.id });

		await db
			.insert(fileProductionJobFiles)
			.values({
				id: legacyJobFileLinkId(file.id),
				jobId: legacyJobId(file.id),
				chatGeneratedFileId: file.id,
				sortOrder: 0,
				createdAt,
			})
			.onConflictDoNothing({ target: fileProductionJobFiles.chatGeneratedFileId });
	}
}

function mapChatFileToProducedFile(file: ChatFile): FileProductionJob['files'][number] {
	return {
		id: file.id,
		filename: file.filename,
		mimeType: file.mimeType,
		sizeBytes: file.sizeBytes,
		downloadUrl: `/api/chat/files/${file.id}/download`,
		previewUrl: `/api/chat/files/${file.id}/preview`,
		artifactId: file.artifactId,
		documentFamilyId: file.documentFamilyId,
		documentFamilyStatus: file.documentFamilyStatus,
		documentLabel: file.documentLabel,
		documentRole: file.documentRole,
		versionNumber: file.versionNumber,
		originConversationId: file.originConversationId,
		originAssistantMessageId: file.originAssistantMessageId,
		sourceChatFileId: file.sourceChatFileId,
	};
}

export async function listConversationFileProductionJobs(
	userId: string,
	conversationId: string
): Promise<FileProductionJob[]> {
	const files = await getChatFiles(conversationId);
	const userFiles = files.filter((file) => file.userId === userId);
	await ensureLegacyJobs(userFiles);
	const fileById = new Map(userFiles.map((file) => [file.id, file]));
	const jobs = await db
		.select()
		.from(fileProductionJobs)
		.where(
			and(
				eq(fileProductionJobs.userId, userId),
				eq(fileProductionJobs.conversationId, conversationId)
			)
		)
		.orderBy(desc(fileProductionJobs.createdAt));

	if (jobs.length === 0) {
		return [];
	}

	const links = await db
		.select()
		.from(fileProductionJobFiles)
		.where(
			inArray(
				fileProductionJobFiles.jobId,
				jobs.map((job) => job.id)
			)
		);
	const linksByJobId = new Map<string, typeof links>();
	for (const link of links) {
		const next = linksByJobId.get(link.jobId) ?? [];
		next.push(link);
		linksByJobId.set(link.jobId, next);
	}

	return jobs
		.map((job) => {
			const jobLinks = (linksByJobId.get(job.id) ?? []).sort(
				(a, b) => a.sortOrder - b.sortOrder
			);
			return {
				id: job.id,
				conversationId: job.conversationId,
				assistantMessageId: job.assistantMessageId,
				title: job.title,
				status: job.status as FileProductionJob['status'],
				stage: job.stage,
				createdAt: job.createdAt.getTime(),
				updatedAt: job.updatedAt.getTime(),
				files: jobLinks
					.map((link) => fileById.get(link.chatGeneratedFileId))
					.filter((file): file is ChatFile => Boolean(file))
					.map(mapChatFileToProducedFile),
				warnings: [],
				error: null,
			};
		})
		.filter((job) => job.files.length > 0);
}
