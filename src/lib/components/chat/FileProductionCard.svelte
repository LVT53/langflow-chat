<script lang="ts">
	import { t } from '$lib/i18n';
	import type { DocumentWorkspaceItem, FileProductionJob, FileProductionJobFile } from '$lib/types';
	import { formatByteSize } from '$lib/utils/format';

	let {
		job,
		onOpenDocument = undefined,
	}: {
		job: FileProductionJob;
		onOpenDocument?: ((document: DocumentWorkspaceItem) => void) | undefined;
	} = $props();

	function fileCountLabel(count: number): string {
		return count === 1
			? $t('fileProduction.oneFile')
			: $t('fileProduction.fileCount', { count });
	}

	function openFile(file: FileProductionJobFile) {
		if (!onOpenDocument || !file.previewUrl) return;
		onOpenDocument({
			id: file.id,
			source: 'chat_generated_file',
			filename: file.filename,
			title: file.documentLabel ?? file.filename,
			documentFamilyId: file.documentFamilyId ?? null,
			documentFamilyStatus: file.documentFamilyStatus ?? null,
			documentLabel: file.documentLabel ?? null,
			documentRole: file.documentRole ?? null,
			versionNumber: file.versionNumber ?? null,
			originConversationId: file.originConversationId ?? null,
			originAssistantMessageId: file.originAssistantMessageId ?? null,
			sourceChatFileId: file.sourceChatFileId ?? null,
			mimeType: file.mimeType,
			previewUrl: file.previewUrl,
			artifactId: file.artifactId ?? null,
			conversationId: job.conversationId,
			downloadUrl: file.downloadUrl,
		});
	}
</script>

<div class="file-production-card" data-testid="file-production-card">
	<div class="job-header">
		<div class="job-title-group">
			<div class="job-eyebrow">{$t('fileProduction.ready')}</div>
			<div class="job-title" title={job.title}>{job.title}</div>
		</div>
		<div class="job-count">{fileCountLabel(job.files.length)}</div>
	</div>

	<div class="produced-files" data-testid="file-production-files">
		{#each job.files as file (file.id)}
			<div class="produced-file-row">
				<button
					type="button"
					class="file-open"
					disabled={!file.previewUrl}
					onclick={() => openFile(file)}
					aria-label={$t('generatedFile.previewLabel', { filename: file.filename })}
				>
					<span class="file-name" title={file.filename}>{file.filename}</span>
					<span class="file-size">{formatByteSize(file.sizeBytes)}</span>
				</button>
				<a
					class="file-download"
					href={file.downloadUrl}
					download={file.filename}
					aria-label={$t('generatedFile.downloadLabel', { filename: file.filename })}
					title={$t('generatedFile.downloadLabel', { filename: file.filename })}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
						<polyline points="7 10 12 15 17 10" />
						<line x1="12" x2="12" y1="15" y2="3" />
					</svg>
				</a>
			</div>
		{/each}
	</div>
</div>

<style>
	.file-production-card {
		display: flex;
		width: 100%;
		max-width: 100%;
		flex-direction: column;
		gap: var(--space-sm);
		border: 1px solid color-mix(in srgb, var(--border-subtle) 78%, transparent 22%);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-elevated) 60%, transparent 40%);
		padding: 0.75rem;
	}

	.job-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-md);
		min-width: 0;
	}

	.job-title-group {
		min-width: 0;
	}

	.job-eyebrow {
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		color: color-mix(in srgb, var(--accent) 76%, var(--text-secondary) 24%);
	}

	.job-title {
		min-width: 0;
		overflow: hidden;
		color: var(--text-primary);
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.9rem;
		font-weight: 700;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.job-count {
		flex: 0 0 auto;
		color: var(--text-muted);
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.74rem;
	}

	.produced-files {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.produced-file-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-sm);
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--surface-page) 70%, transparent 30%);
		padding: 0.45rem 0.5rem;
	}

	.file-open {
		display: grid;
		min-width: 0;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: baseline;
		gap: var(--space-sm);
		border: 0;
		background: transparent;
		padding: 0;
		text-align: left;
	}

	.file-open:not(:disabled) {
		cursor: pointer;
	}

	.file-open:disabled {
		cursor: default;
	}

	.file-name {
		min-width: 0;
		overflow: hidden;
		color: var(--text-primary);
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.82rem;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file-size {
		color: var(--text-muted);
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.72rem;
	}

	.file-download {
		display: inline-flex;
		width: 30px;
		height: 30px;
		align-items: center;
		justify-content: center;
		border: 1px solid color-mix(in srgb, var(--border-subtle) 72%, transparent 28%);
		border-radius: 999px;
		background: color-mix(in srgb, var(--accent) 9%, var(--surface-page) 91%);
		color: color-mix(in srgb, var(--accent) 66%, var(--text-primary) 34%);
		text-decoration: none;
	}

	.file-download:hover {
		background: color-mix(in srgb, var(--accent) 15%, var(--surface-page) 85%);
	}
</style>
