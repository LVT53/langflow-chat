import JSZip from 'jszip';
import { basename, extname } from 'path';
import { createArtifact } from './store/core';
import type { Artifact } from '$lib/types';

export interface ImportResult {
	imported: number;
	failed: number;
	errors: string[];
	artifacts: Artifact[];
}

function stripHtmlTags(html: string): string {
	return html
		.replace(/<[^>]+>/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();
}

function toTextFileName(originalName: string): string {
	const stem = basename(originalName, extname(originalName));
	return `${stem || 'document'}.txt`;
}

function isMarkdownFile(path: string): boolean {
	return path.toLowerCase().endsWith('.md');
}

function isHtmlFile(path: string): boolean {
	return path.toLowerCase().endsWith('.html') || path.toLowerCase().endsWith('.htm');
}

function isCsvFile(path: string): boolean {
	return path.toLowerCase().endsWith('.csv');
}

function isTextFile(path: string): boolean {
	return isMarkdownFile(path) || isHtmlFile(path) || isCsvFile(path);
}

async function parseZipBuffer(zipBuffer: Buffer): Promise<JSZip | null> {
	try {
		const zip = await JSZip.loadAsync(zipBuffer);
		return zip;
	} catch {
		return null;
	}
}

async function createTextArtifact(params: {
	userId: string;
	conversationId: string;
	vaultId: string;
	originalPath: string;
	content: string;
}): Promise<Artifact> {
	const name = toTextFileName(params.originalPath);
	const sizeBytes = Buffer.byteLength(params.content, 'utf8');

	return createArtifact({
		userId: params.userId,
		conversationId: params.conversationId,
		vaultId: params.vaultId,
		type: 'source_document',
		name,
		mimeType: 'text/plain',
		sizeBytes,
		contentText: params.content,
		metadata: { originalPath: params.originalPath },
	});
}

export async function importObsidianVault(
	userId: string,
	conversationId: string,
	vaultId: string,
	zipBuffer: Buffer
): Promise<ImportResult> {
	const result: ImportResult = {
		imported: 0,
		failed: 0,
		errors: [],
		artifacts: [],
	};

	const zip = await parseZipBuffer(zipBuffer);
	if (!zip) {
		result.errors.push('Invalid ZIP file format');
		return result;
	}

	const markdownFiles: { path: string; content: string }[] = [];

	for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
		if (zipEntry.dir) continue;
		if (!isMarkdownFile(relativePath)) continue;

		const content = await zipEntry.async('string');
		if (content.trim()) {
			markdownFiles.push({ path: relativePath, content });
		}
	}

	for (const file of markdownFiles) {
		try {
			const artifact = await createTextArtifact({
				userId,
				conversationId,
				vaultId,
				originalPath: file.path,
				content: file.content,
			});
			result.artifacts.push(artifact);
			result.imported++;
		} catch (error) {
			result.failed++;
			const message = error instanceof Error ? error.message : String(error);
			result.errors.push(`Failed to import ${file.path}: ${message}`);
		}
	}

	return result;
}

export async function importNotionExport(
	userId: string,
	conversationId: string,
	vaultId: string,
	zipBuffer: Buffer
): Promise<ImportResult> {
	const result: ImportResult = {
		imported: 0,
		failed: 0,
		errors: [],
		artifacts: [],
	};

	const zip = await parseZipBuffer(zipBuffer);
	if (!zip) {
		result.errors.push('Invalid ZIP file format');
		return result;
	}

	const textFiles: { path: string; content: string }[] = [];

	for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
		if (zipEntry.dir) continue;
		if (!isTextFile(relativePath)) continue;

		const rawContent = await zipEntry.async('string');
		let content: string;

		if (isHtmlFile(relativePath)) {
			content = stripHtmlTags(rawContent);
		} else {
			content = rawContent.trim();
		}

		if (content) {
			textFiles.push({ path: relativePath, content });
		}
	}

	for (const file of textFiles) {
		try {
			const artifact = await createTextArtifact({
				userId,
				conversationId,
				vaultId,
				originalPath: file.path,
				content: file.content,
			});
			result.artifacts.push(artifact);
			result.imported++;
		} catch (error) {
			result.failed++;
			const message = error instanceof Error ? error.message : String(error);
			result.errors.push(`Failed to import ${file.path}: ${message}`);
		}
	}

	return result;
}