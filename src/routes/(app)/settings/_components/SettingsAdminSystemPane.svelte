<script lang="ts">
	import {
		createProvider,
		deleteProvider,
		fetchProviders,
		updateProvider,
		validateProvider,
		type InferenceProvider,
	} from "$lib/client/api/admin";
	import ModelFormModal from "./ModelFormModal.svelte";

	let {
		adminConfig = $bindable(),
		envDefaults = {},
		adminSaving = false,
		adminMessage = "",
		adminError = "",
		honchoHealth = null,
		honchoLoading = false,
		onCheckHonchoHealth,
		onSaveAdminConfig,
	}: {
		adminConfig: Record<string, string>;
		envDefaults?: Record<string, string>;
		adminSaving?: boolean;
		adminMessage?: string;
		adminError?: string;
		honchoHealth?: {
			enabled: boolean;
			connected: boolean;
			workspace: string | null;
		} | null;
		honchoLoading?: boolean;
		onCheckHonchoHealth: () => void | Promise<void>;
		onSaveAdminConfig: () => void | Promise<void>;
	} = $props();

	let providers = $state<InferenceProvider[]>([]);
	let providersLoading = $state(false);
	let providersError = $state("");
	let providersMessage = $state("");

	// Modal state
	let showModal = $state(false);
	let modalModel = $state<(InferenceProvider & { isBuiltIn?: boolean; flowId?: string; componentId?: string }) | null>(null);
	let modalIsCreate = $state(false);
	let modalSaving = $state(false);
	let modalError = $state("");

	async function loadProviders() {
		providersLoading = true;
		providersError = "";
		try {
			providers = await fetchProviders();
		} catch (e: any) {
			providersError = e.message ?? "Failed to load providers.";
		} finally {
			providersLoading = false;
		}
	}

	function openAddProvider() {
		modalModel = null;
		modalIsCreate = true;
		modalError = "";
		modalSaving = false;
		showModal = true;
	}

	function openEditBuiltIn(modelName: string) {
		const prefix = modelName === 'model1' ? 'MODEL_1' : 'MODEL_2';
		modalModel = {
			id: modelName,
			name: modelName,
			displayName: adminConfig[`${prefix}_DISPLAY_NAME`] ?? '',
			baseUrl: adminConfig[`${prefix}_BASEURL`] ?? '',
			modelName: adminConfig[`${prefix}_NAME`] ?? '',
			reasoningEffort: null,
			thinkingType: null,
			enabled: modelName === 'model2' ? adminConfig.MODEL_2_ENABLED !== 'false' : true,
			sortOrder: 0,
			maxModelContext: adminConfig[`${prefix}_MAX_MODEL_CONTEXT`] ? Number(adminConfig[`${prefix}_MAX_MODEL_CONTEXT`]) : null,
			compactionUiThreshold: adminConfig[`${prefix}_COMPACTION_UI_THRESHOLD`] ? Number(adminConfig[`${prefix}_COMPACTION_UI_THRESHOLD`]) : null,
			targetConstructedContext: adminConfig[`${prefix}_TARGET_CONSTRUCTED_CONTEXT`] ? Number(adminConfig[`${prefix}_TARGET_CONSTRUCTED_CONTEXT`]) : null,
			maxMessageLength: adminConfig[`${prefix}_MAX_MESSAGE_LENGTH`] ? Number(adminConfig[`${prefix}_MAX_MESSAGE_LENGTH`]) : null,
			maxTokens: adminConfig[`${prefix}_MAX_TOKENS`] ? Number(adminConfig[`${prefix}_MAX_TOKENS`]) : null,
			createdAt: '',
			updatedAt: '',
			isBuiltIn: true,
			flowId: adminConfig[`${prefix}_FLOW_ID`] ?? '',
			componentId: adminConfig[`${prefix}_COMPONENT_ID`] ?? '',
		};
		modalIsCreate = false;
		modalError = "";
		modalSaving = false;
		showModal = true;
	}

	function openEditProvider(provider: InferenceProvider) {
		modalModel = { ...provider };
		modalIsCreate = false;
		modalError = "";
		modalSaving = false;
		showModal = true;
	}

	function closeModal() {
		showModal = false;
		modalModel = null;
		modalError = "";
	}

	async function handleModalSave(data: Record<string, unknown>) {
		modalSaving = true;
		modalError = "";
		providersMessage = "";
		try {
			if (modalIsCreate) {
				await createProvider(data as any);
				providersMessage = "Provider added.";
			} else if (modalModel?.isBuiltIn) {
				// Save built-in model config via admin config keys
				const prefix = modalModel.name === 'model1' ? 'MODEL_1' : 'MODEL_2';
				if (data.displayName) adminConfig[`${prefix}_DISPLAY_NAME`] = data.displayName as string;
				if (data.baseUrl) adminConfig[`${prefix}_BASEURL`] = data.baseUrl as string;
				if (data.modelName) adminConfig[`${prefix}_NAME`] = data.modelName as string;
				if (data.flowId !== undefined) adminConfig[`${prefix}_FLOW_ID`] = data.flowId as string;
				if (data.componentId !== undefined) adminConfig[`${prefix}_COMPONENT_ID`] = data.componentId as string;
				if (data.maxTokens !== undefined) adminConfig[`${prefix}_MAX_TOKENS`] = data.maxTokens != null ? String(data.maxTokens) : '';
				if (data.enabled !== undefined) adminConfig[`${prefix}_ENABLED`] = (data.enabled as boolean) ? 'true' : 'false';
				if (data.maxModelContext !== undefined) adminConfig[`${prefix}_MAX_MODEL_CONTEXT`] = data.maxModelContext != null ? String(data.maxModelContext) : '';
				if (data.compactionUiThreshold !== undefined) adminConfig[`${prefix}_COMPACTION_UI_THRESHOLD`] = data.compactionUiThreshold != null ? String(data.compactionUiThreshold) : '';
				if (data.targetConstructedContext !== undefined) adminConfig[`${prefix}_TARGET_CONSTRUCTED_CONTEXT`] = data.targetConstructedContext != null ? String(data.targetConstructedContext) : '';
				if (data.maxMessageLength !== undefined) adminConfig[`${prefix}_MAX_MESSAGE_LENGTH`] = data.maxMessageLength != null ? String(data.maxMessageLength) : '';
				providersMessage = `${modalModel.displayName || modelNameDisplay(modalModel.name)} updated.`;
			} else if (modalModel) {
				await updateProvider(modalModel.id, data as any);
				providersMessage = "Provider updated.";
			}
			closeModal();
			await loadProviders();
		} catch (e: any) {
			modalError = e.message ?? "Failed to save.";
		} finally {
			modalSaving = false;
		}
	}

	async function handleDelete(provider: InferenceProvider) {
		if (!confirm(`Delete provider "${provider.displayName}"?`)) return;
		providersMessage = "";
		try {
			await deleteProvider(provider.id);
			providersMessage = "Provider deleted.";
			await loadProviders();
		} catch (e: any) {
			providersError = e.message ?? "Failed to delete provider.";
		}
	}

	async function handleValidate(provider: InferenceProvider) {
		providersMessage = "";
		providersError = "";
		try {
			const result = await validateProvider(provider.id);
			if (result.valid) {
				providersMessage = `"${provider.displayName}" is valid.`;
			} else {
				providersError = `Validation failed: ${result.error ?? "Unknown error"}`;
			}
		} catch (e: any) {
			providersError = e.message ?? "Failed to validate provider.";
		}
	}

	function modelNameDisplay(name: string): string {
		return name === 'model1' ? (adminConfig.MODEL_1_DISPLAY_NAME || 'Model 1')
			: name === 'model2' ? (adminConfig.MODEL_2_DISPLAY_NAME || 'Model 2')
			: name;
	}

	$effect(() => {
		void loadProviders();
	});

	const CONFIG_LABELS: Record<string, string> = {
		MODEL_1_BASEURL: "Model 1 Base URL",
		MODEL_1_NAME: "Model 1 Name",
		MODEL_1_DISPLAY_NAME: "Model 1 Display Name",
		MODEL_1_SYSTEM_PROMPT: "Model 1 System Prompt",
		MODEL_1_FLOW_ID: "Model 1 Flow ID",
		MODEL_1_COMPONENT_ID: "Model 1 Component ID",
		MODEL_2_BASEURL: "Model 2 Base URL",
		MODEL_2_NAME: "Model 2 Name",
		MODEL_2_DISPLAY_NAME: "Model 2 Display Name",
		MODEL_2_SYSTEM_PROMPT: "Model 2 System Prompt",
		MODEL_2_FLOW_ID: "Model 2 Flow ID",
		MODEL_2_COMPONENT_ID: "Model 2 Component ID",
		MODEL_2_ENABLED: "Enable Model 2",
		TRANSLATOR_URL: "Translator URL",
		TRANSLATOR_MODEL: "Translator Model",
		TRANSLATION_MAX_TOKENS: "Translation Max Tokens",
		TRANSLATION_TEMPERATURE: "Translation Temperature",
		MODEL_1_MAX_MODEL_CONTEXT: "Model 1 Max Context",
		MODEL_1_COMPACTION_UI_THRESHOLD: "Model 1 Compaction Threshold",
		MODEL_1_TARGET_CONSTRUCTED_CONTEXT: "Model 1 Target Context",
		MODEL_1_MAX_MESSAGE_LENGTH: "Model 1 Max Message Length",
		MODEL_2_MAX_MODEL_CONTEXT: "Model 2 Max Context",
		MODEL_2_COMPACTION_UI_THRESHOLD: "Model 2 Compaction Threshold",
		MODEL_2_TARGET_CONSTRUCTED_CONTEXT: "Model 2 Target Context",
		MODEL_2_MAX_MESSAGE_LENGTH: "Model 2 Max Message Length",
		TITLE_GEN_URL: "Title Generator URL",
		TITLE_GEN_MODEL: "Title Generator Model",
		CONTEXT_SUMMARIZER_URL: "Context Summarizer URL",
		CONTEXT_SUMMARIZER_MODEL: "Context Summarizer Model",
		TITLE_GEN_SYSTEM_PROMPT_EN: "Title Generator Prompt (English)",
		TITLE_GEN_SYSTEM_PROMPT_HU: "Title Generator Prompt (Hungarian)",
		TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_EN: "Title Generator Code Appendix (English)",
		TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_HU: "Title Generator Code Appendix (Hungarian)",
		HONCHO_CONTEXT_WAIT_MS: "Honcho Session Context Wait (ms)",
		HONCHO_PERSONA_CONTEXT_WAIT_MS: "Honcho Persona Context Wait (ms)",
		HONCHO_OVERVIEW_WAIT_MS: "Honcho Overview Wait (ms)",
		MINERU_API_URL: "MinerU API URL",
		MINERU_TIMEOUT_MS: "MinerU Timeout (ms)",
		MAX_MODEL_CONTEXT: "Max Model Context (tokens)",
		COMPACTION_UI_THRESHOLD: "Compaction UI Threshold (tokens)",
		TARGET_CONSTRUCTED_CONTEXT: "Target Constructed Context (tokens)",
		MAX_MESSAGE_LENGTH: "Max Message Length (characters)",
		MAX_FILE_UPLOAD_SIZE: "Max File Upload Size (bytes)",
		REQUEST_TIMEOUT_MS: "Request Timeout (ms)",
		SYSTEM_PROMPT: "System Prompt",

	};

	const NUMBER_KEYS = new Set([
		"HONCHO_CONTEXT_WAIT_MS",
		"HONCHO_OVERVIEW_WAIT_MS",
		"MAX_MODEL_CONTEXT",
		"COMPACTION_UI_THRESHOLD",
		"TARGET_CONSTRUCTED_CONTEXT",
		"MAX_MESSAGE_LENGTH",
		"MINERU_TIMEOUT_MS",
		"HONCHO_PERSONA_CONTEXT_WAIT_MS",
		"TRANSLATION_MAX_TOKENS",
		"TRANSLATION_TEMPERATURE",
		"MAX_FILE_UPLOAD_SIZE",
		"REQUEST_TIMEOUT_MS",
	]);

	function placeholderFor(key: string): string {
		return envDefaults[key] ?? "";
	}
</script>

<!-- Unified Models Section -->
<section class="settings-card mb-4">
	<h2 class="settings-section-title">Models</h2>
	<div class="flex flex-col gap-3">
		{#if providersLoading}
			<p class="text-sm text-text-secondary">Loading models...</p>
		{:else if providersError}
			<p class="text-sm text-danger">{providersError}</p>
		{:else}
			<div class="flex flex-col gap-2">
				<!-- Model 1 (built-in, always present) -->
				<div class="flex items-center justify-between rounded-md border border-border bg-surface-page px-3 py-2">
					<div class="flex flex-col">
						<span class="text-sm font-medium text-text-primary">{adminConfig.MODEL_1_DISPLAY_NAME || 'Model 1'}</span>
						<span class="text-xs text-text-muted">Langflow &bull; {adminConfig.MODEL_1_NAME || 'model-1'}</span>
					</div>
					<div class="flex items-center gap-2">
						<span class="inline-block h-2 w-2 rounded-full bg-success"></span>
						<span class="text-xs text-text-muted">Built-in</span>
						<button class="btn-small" onclick={() => openEditBuiltIn('model1')}>Edit</button>
					</div>
				</div>

				<!-- Model 2 (built-in, conditionally shown) -->
				{#if adminConfig.MODEL_2_ENABLED !== 'false'}
					<div class="flex items-center justify-between rounded-md border border-border bg-surface-page px-3 py-2">
						<div class="flex flex-col">
							<span class="text-sm font-medium text-text-primary">{adminConfig.MODEL_2_DISPLAY_NAME || 'Model 2'}</span>
							<span class="text-xs text-text-muted">Langflow &bull; {adminConfig.MODEL_2_NAME || 'model-2'}</span>
						</div>
						<div class="flex items-center gap-2">
							<span class="inline-block h-2 w-2 rounded-full bg-success"></span>
							<span class="text-xs text-text-muted">Built-in</span>
							<button class="btn-small" onclick={() => openEditBuiltIn('model2')}>Edit</button>
						</div>
					</div>
				{/if}

				<!-- Third-party providers -->
				{#each providers as provider}
					<div class="flex items-center justify-between rounded-md border border-border bg-surface-page px-3 py-2">
						<div class="flex flex-col">
							<span class="text-sm font-medium text-text-primary">{provider.displayName}</span>
							<span class="text-xs text-text-muted">{provider.baseUrl} &bull; {provider.modelName}</span>
							{#if provider.reasoningEffort || provider.thinkingType}
								<span class="text-xs text-text-tertiary">
									{#if provider.reasoningEffort}
										reasoning_effort: {provider.reasoningEffort}
									{/if}
									{#if provider.reasoningEffort && provider.thinkingType}
										&bull;
									{/if}
									{#if provider.thinkingType}
										extra_body.thinking.type: {provider.thinkingType}
									{/if}
								</span>
							{/if}
						</div>
						<div class="flex items-center gap-2">
							<span class={`inline-block h-2 w-2 rounded-full ${provider.enabled ? 'bg-success' : 'bg-text-muted'}`}></span>
							<button class="btn-small" onclick={() => handleValidate(provider)}>Test</button>
							<button class="btn-small" onclick={() => openEditProvider(provider)}>Edit</button>
							<button class="btn-small text-danger" onclick={() => handleDelete(provider)}>Delete</button>
						</div>
					</div>
				{/each}
				<p class="text-xs text-text-muted">
					Third-party models route through the shared Langflow Agent flow and use the same connected tools as built-in models.
				</p>
			</div>
		{/if}

		{#if providersMessage}
			<p class="text-sm text-success">{providersMessage}</p>
		{/if}

		<button class="btn-secondary w-full" onclick={openAddProvider}>
			Add Provider
		</button>
	</div>
</section>

<!-- Model 2 enable/disable toggle (separate from edit modal since it affects visibility) -->
<section class="settings-card mb-4">
	<h2 class="settings-section-title">Model 2 Visibility</h2>
	<div class="flex items-center justify-between">
		<div>
			<label class="settings-label mb-0" for="MODEL_2_ENABLED">{CONFIG_LABELS.MODEL_2_ENABLED}</label>
			<p class="text-xs text-text-tertiary">Hide model 2 from the app and force fallbacks to model 1</p>
		</div>
		<label class="relative inline-flex cursor-pointer items-center">
			<input
				id="MODEL_2_ENABLED"
				type="checkbox"
				class="peer sr-only"
				checked={adminConfig.MODEL_2_ENABLED !== 'false'}
				onchange={(event) => {
					adminConfig.MODEL_2_ENABLED = event.currentTarget.checked ? 'true' : 'false';
				}}
			/>
			<div class="peer h-6 w-11 rounded-full bg-surface-secondary after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-accent peer-checked:after:translate-x-full"></div>
		</label>
	</div>
</section>

<!-- Title Generator -->
<section class="settings-card mb-4">
	<h2 class="settings-section-title">Title Generator</h2>
	<div class="flex flex-col gap-3">
		{#each ['TITLE_GEN_URL', 'TITLE_GEN_MODEL'] as key}
			<div>
				<label class="settings-label" for={key}>{CONFIG_LABELS[key]}</label>
				<input
					id={key}
					type="text"
					class="settings-input"
					bind:value={adminConfig[key]}
					placeholder={placeholderFor(key)}
				/>
			</div>
		{/each}
		{#each [
			'TITLE_GEN_SYSTEM_PROMPT_EN',
			'TITLE_GEN_SYSTEM_PROMPT_HU',
			'TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_EN',
			'TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_HU',
		] as key}
			<div>
				<label class="settings-label" for={key}>{CONFIG_LABELS[key]}</label>
				<textarea
					id={key}
					class="settings-input min-h-[120px]"
					bind:value={adminConfig[key]}
					rows="5"
				></textarea>
				{#if key === 'TITLE_GEN_SYSTEM_PROMPT_EN' || key === 'TITLE_GEN_SYSTEM_PROMPT_HU'}
					<p class="mt-1 text-xs text-text-muted">Base prompt for that language. Leave empty to rely on few-shot examples only.</p>
				{:else}
					<p class="mt-1 text-xs text-text-muted">Optional extra lines appended only when the conversation looks code-related.</p>
				{/if}
			</div>
		{/each}
	</div>
</section>

<!-- Context Summarizer -->
<section class="settings-card mb-4">
	<h2 class="settings-section-title">Context Summarizer</h2>
	<div class="flex flex-col gap-3">
		{#each ['CONTEXT_SUMMARIZER_URL', 'CONTEXT_SUMMARIZER_MODEL'] as key}
			<div>
				<label class="settings-label" for={key}>{CONFIG_LABELS[key]}</label>
				<input id={key} type="text" class="settings-input" bind:value={adminConfig[key]} placeholder={placeholderFor(key)} />
				<p class="mt-1 text-xs text-text-muted">{key === 'CONTEXT_SUMMARIZER_URL' ? 'OpenAI-compatible endpoint. Uses the same vLLM server as the title generator. Leave empty to disable.' : 'Model name served by the endpoint above.'}</p>
			</div>
		{/each}
	</div>
</section>

<!-- Honcho Memory -->
<section class="settings-card mb-4">
	<h2 class="settings-section-title">Honcho Memory</h2>
	<div class="mb-3 flex items-center justify-between">
		<div>
			<label class="settings-label mb-0" for="HONCHO_ENABLED">Enable Honcho</label>
			<p class="text-xs text-text-tertiary">Cross-conversation long-term memory via Honcho</p>
		</div>
		<label class="relative inline-flex cursor-pointer items-center">
			<input
				id="HONCHO_ENABLED"
				type="checkbox"
				class="peer sr-only"
				checked={adminConfig.HONCHO_ENABLED === 'true'}
				onchange={(event) => {
					adminConfig.HONCHO_ENABLED = event.currentTarget.checked ? 'true' : 'false';
				}}
			/>
			<div class="peer h-6 w-11 rounded-full bg-surface-secondary after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-accent peer-checked:after:translate-x-full"></div>
		</label>
	</div>
	<div class="flex items-center gap-2 text-xs text-text-secondary">
		<button class="text-accent hover:underline" onclick={onCheckHonchoHealth} disabled={honchoLoading}>
			{honchoLoading ? 'Checking...' : 'Check Connection'}
		</button>
		{#if honchoHealth}
			<span class="inline-flex items-center gap-1">
				<span class={`inline-block h-2 w-2 rounded-full ${honchoHealth.connected ? 'bg-success' : 'bg-danger'}`}></span>
				{honchoHealth.connected ? 'Connected' : 'Disconnected'}
				{#if honchoHealth.workspace}
					<span class="text-text-tertiary">({honchoHealth.workspace})</span>
				{/if}
			</span>
		{/if}
	</div>
	<div class="mt-4 flex flex-col gap-3">
		{#each ['HONCHO_CONTEXT_WAIT_MS', 'HONCHO_PERSONA_CONTEXT_WAIT_MS', 'HONCHO_OVERVIEW_WAIT_MS'] as key}
			<div>
				<label class="settings-label" for={key}>{CONFIG_LABELS[key]}</label>
				<input
					id={key}
					type="number"
					class="settings-input"
					bind:value={adminConfig[key]}
					placeholder={placeholderFor(key)}
				/>
				{#if key === 'HONCHO_CONTEXT_WAIT_MS'}
					<p class="mt-1 text-xs text-text-muted">
						How long chat waits for live Honcho session bootstrap, queue settling, and `session.context(...)` before falling back to the last good snapshot or persisted turns.
					</p>
				{:else if key === 'HONCHO_PERSONA_CONTEXT_WAIT_MS'}
					<p class="mt-1 text-xs text-text-muted">
						Timeout for auxiliary Honcho persona enrichment during chat turns. Lower values keep the prompt path responsive because persona cluster refresh now happens in the background.
					</p>
				{:else}
					<p class="mt-1 text-xs text-text-muted">
						Timeout for the Knowledge Base live Honcho overview refresh path. This can be longer than the chat-side persona enrichment timeout because the overview now has a cached fallback and a retry loop.
					</p>
				{/if}
			</div>
		{/each}
	</div>
</section>

<!-- MinerU Document Extraction -->
<section class="settings-card mb-4">
	<h2 class="settings-section-title">MinerU Document Extraction</h2>
	<div class="flex flex-col gap-3">
		<div>
			<label class="settings-label" for="MINERU_API_URL">{CONFIG_LABELS.MINERU_API_URL}</label>
			<input
				id="MINERU_API_URL"
				type="text"
				class="settings-input"
				bind:value={adminConfig.MINERU_API_URL}
				placeholder={placeholderFor('MINERU_API_URL')}
			/>
			<p class="mt-1 text-xs text-text-muted">
				MinerU API server endpoint. Run <code>docker run -d --name mineru -p 8001:8001 opendatalab/mineru:latest</code> to start the service.
			</p>
		</div>
		<div>
			<label class="settings-label" for="MINERU_TIMEOUT_MS">{CONFIG_LABELS.MINERU_TIMEOUT_MS}</label>
			<input
				id="MINERU_TIMEOUT_MS"
				type="number"
				class="settings-input"
				bind:value={adminConfig.MINERU_TIMEOUT_MS}
				placeholder={placeholderFor('MINERU_TIMEOUT_MS')}
			/>
			<p class="mt-1 text-xs text-text-muted">
				Maximum time to wait for a response from MinerU. Increase for large documents.
			</p>
		</div>
	</div>
</section>

<!-- System Prompt -->
<section class="settings-card mb-4">
	<h2 class="settings-section-title">System Prompt</h2>
	<div>
		<label class="settings-label" for="SYSTEM_PROMPT">{CONFIG_LABELS.SYSTEM_PROMPT}</label>
		<textarea
			id="SYSTEM_PROMPT"
			class="settings-input min-h-[200px]"
			bind:value={adminConfig.SYSTEM_PROMPT}
			rows="10"
			placeholder={placeholderFor('SYSTEM_PROMPT')}
		></textarea>
		<p class="mt-1 text-xs text-text-muted">Set the system prompt used for all models. You can paste a full system prompt or use a reference key like <code>alfyai-nemotron</code>. Leave empty to use per-model defaults.</p>
	</div>
</section>

<!-- Rate & Size Limits -->
<section class="settings-card mb-4">
	<h2 class="settings-section-title">Rate & Size Limits</h2>
	<div class="flex flex-col gap-3">
		<div>
			<label class="settings-label" for="MAX_FILE_UPLOAD_SIZE">{CONFIG_LABELS.MAX_FILE_UPLOAD_SIZE}</label>
			<input
				id="MAX_FILE_UPLOAD_SIZE"
				type="number"
				class="settings-input"
				bind:value={adminConfig.MAX_FILE_UPLOAD_SIZE}
				placeholder={placeholderFor('MAX_FILE_UPLOAD_SIZE')}
			/>
			<p class="mt-1 text-xs text-text-muted">Maximum file upload size in bytes (default 104857600 = 100MB).</p>
		</div>
		<div>
			<label class="settings-label" for="REQUEST_TIMEOUT_MS">{CONFIG_LABELS.REQUEST_TIMEOUT_MS}</label>
			<input
				id="REQUEST_TIMEOUT_MS"
				type="number"
				class="settings-input"
				bind:value={adminConfig.REQUEST_TIMEOUT_MS}
				placeholder={placeholderFor('REQUEST_TIMEOUT_MS')}
			/>
			<p class="mt-1 text-xs text-text-muted">HTTP request and stream timeout in milliseconds (default 300000 = 5 minutes). Increase for multi-round search workloads.</p>
		</div>
	</div>
</section>


<!-- Save button -->
{#if adminMessage}
	<p class="mb-3 text-sm text-success">{adminMessage}</p>
{/if}
{#if adminError}
	<p class="mb-3 text-sm text-danger">{adminError}</p>
{/if}
<button class="btn-primary mb-8 w-full" onclick={onSaveAdminConfig} disabled={adminSaving}>
	{adminSaving ? 'Saving…' : 'Save Configuration'}
</button>

<!-- Modal -->
{#if showModal}
	<ModelFormModal
		error={modalError}
		model={modalModel}
		isCreate={modalIsCreate}
		saving={modalSaving}
		{adminConfig}
		onSave={handleModalSave}
		onClose={closeModal}
	/>
{/if}

<style>
	:global(.btn-small) {
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--border-default);
		background: var(--surface-page);
		color: var(--text-secondary);
		cursor: pointer;
		transition: all var(--duration-standard);
	}

	:global(.btn-small:hover) {
		border-color: var(--accent);
		color: var(--text-primary);
	}

	:global(.btn-secondary) {
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--border-default);
		background: var(--surface-page);
		color: var(--text-primary);
		cursor: pointer;
		transition: all var(--duration-standard);
	}

	:global(.btn-secondary:hover) {
		border-color: var(--accent);
		background: var(--surface-elevated);
	}

	:global(.btn-secondary:disabled) {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
