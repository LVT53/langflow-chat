<script lang='ts'>
import {
	createProvider,
	deleteProvider,
	fetchProviders,
	updateProvider,
	validateProvider,
	type InferenceProvider,
} from "$lib/client/api/admin";

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

let showAddForm = $state(false);
let editingProvider = $state<string | null>(null);
let formName = $state("");
let formDisplayName = $state("");
let formBaseUrl = $state("");
let formApiKey = $state("");
let formModelName = $state("");
let formReasoningEffort = $state<"" | "low" | "medium" | "high">("");
let formThinkingType = $state<"" | "enabled" | "disabled">("");
let formEnabled = $state(true);
let formSaving = $state(false);
let formError = $state("");
let showApiKey = $state(false);

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

function openAddForm() {
	formName = "";
	formDisplayName = "";
	formBaseUrl = "https://api.fireworks.ai/inference/v1";
	formApiKey = "";
	formModelName = "";
	formReasoningEffort = "";
	formThinkingType = "";
	formEnabled = true;
	formError = "";
	showApiKey = false;
	editingProvider = null;
	showAddForm = true;
}

function openEditForm(provider: InferenceProvider) {
	formName = provider.name;
	formDisplayName = provider.displayName;
	formBaseUrl = provider.baseUrl;
	formApiKey = "";
	formModelName = provider.modelName;
	formReasoningEffort = provider.reasoningEffort ?? "";
	formThinkingType = provider.thinkingType ?? "";
	formEnabled = provider.enabled;
	formError = "";
	showApiKey = false;
	editingProvider = provider.id;
	showAddForm = true;
}

function closeForm() {
	showAddForm = false;
	editingProvider = null;
	formError = "";
}

async function saveProvider() {
	if (!formName || !formDisplayName || !formBaseUrl || !formModelName) {
		formError = "All fields except API key are required.";
		return;
	}
	if (!/^[a-zA-Z0-9_-]+$/.test(formName)) {
		formError =
			"Name must contain only letters, numbers, underscores, and hyphens.";
		return;
	}

	formSaving = true;
	formError = "";
	providersMessage = "";
	try {
		if (editingProvider) {
			await updateProvider(editingProvider, {
				displayName: formDisplayName,
				baseUrl: formBaseUrl,
				modelName: formModelName,
				reasoningEffort: formReasoningEffort || null,
				thinkingType: formThinkingType || null,
				enabled: formEnabled,
				...(formApiKey ? { apiKey: formApiKey } : {}),
			});
			providersMessage = "Provider updated.";
		} else {
			await createProvider({
				name: formName,
				displayName: formDisplayName,
				baseUrl: formBaseUrl,
				apiKey: formApiKey,
				modelName: formModelName,
				reasoningEffort: formReasoningEffort || null,
				thinkingType: formThinkingType || null,
				enabled: formEnabled,
			});
			providersMessage = "Provider added.";
		}
		closeForm();
		await loadProviders();
	} catch (e: any) {
		formError = e.message ?? "Failed to save provider.";
	} finally {
		formSaving = false;
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

$effect(() => {
	void loadProviders();
});

const CONFIG_LABELS: Record<string, string> = {
	MAX_MESSAGE_LENGTH: "Max Message Length",
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
	TITLE_GEN_URL: "Title Generator URL",
	TITLE_GEN_MODEL: "Title Generator Model",
	CONTEXT_SUMMARIZER_URL: "Context Summarizer URL",
	CONTEXT_SUMMARIZER_MODEL: "Context Summarizer Model",
	TITLE_GEN_SYSTEM_PROMPT_EN: "Title Generator Prompt (English)",
	TITLE_GEN_SYSTEM_PROMPT_HU: "Title Generator Prompt (Hungarian)",
	TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_EN:
		"Title Generator Code Appendix (English)",
	TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_HU:
		"Title Generator Code Appendix (Hungarian)",
	TRANSLATOR_URL: "Translator URL",
	TRANSLATOR_MODEL: "Translator Model",
	TRANSLATION_MAX_TOKENS: "Translation Max Tokens",
	TRANSLATION_TEMPERATURE: "Translation Temperature",
	HONCHO_CONTEXT_WAIT_MS: "Honcho Session Context Wait (ms)",
	HONCHO_OVERVIEW_WAIT_MS: "Honcho Overview Wait (ms)",
	DOCUMENT_PARSER_OCR_ENABLED: "Document Parser OCR Enabled",
	DOCUMENT_PARSER_OCR_SERVER_URL: "Document Parser OCR Server URL",
	DOCUMENT_PARSER_PADDLE_BACKEND_URL: "Paddle OCR Backend URL",
	DOCUMENT_PARSER_OCR_LANGUAGE: "Document Parser OCR Language",
	DOCUMENT_PARSER_NUM_WORKERS: "Document Parser OCR Workers",
	DOCUMENT_PARSER_MAX_PAGES: "Document Parser Max Pages",
	DOCUMENT_PARSER_DPI: "Document Parser DPI",
	DOCUMENT_PARSER_TIMEOUT_MS: "Document Parser Timeout (ms)",
	MAX_MODEL_CONTEXT: "Max Model Context (tokens)",
	COMPACTION_UI_THRESHOLD: "Compaction UI Threshold (tokens)",
	TARGET_CONSTRUCTED_CONTEXT: "Target Constructed Context (tokens)",
};

const NUMBER_KEYS = new Set([
	"MAX_MESSAGE_LENGTH",
	"TRANSLATION_MAX_TOKENS",
	"TRANSLATION_TEMPERATURE",
	"HONCHO_CONTEXT_WAIT_MS",
	"HONCHO_OVERVIEW_WAIT_MS",
	"MAX_MODEL_CONTEXT",
	"COMPACTION_UI_THRESHOLD",
	"TARGET_CONSTRUCTED_CONTEXT",
	"DOCUMENT_PARSER_NUM_WORKERS",
	"DOCUMENT_PARSER_MAX_PAGES",
	"DOCUMENT_PARSER_DPI",
	"DOCUMENT_PARSER_TIMEOUT_MS",
]);

function placeholderFor(key: string): string {
	return envDefaults[key] ?? "";
}
</script>

<section class='settings-card mb-4'>
	<h2 class='settings-section-title'>Model 1</h2>
	<div class='flex flex-col gap-3'>
		{#each ['MODEL_1_BASEURL', 'MODEL_1_NAME', 'MODEL_1_DISPLAY_NAME', 'MODEL_1_FLOW_ID', 'MODEL_1_COMPONENT_ID'] as key}
			<div>
				<label class='settings-label' for={key}>{CONFIG_LABELS[key]}</label>
				<input
					id={key}
					type='text'
					class='settings-input'
					bind:value={adminConfig[key]}
					placeholder={placeholderFor(key)}
				/>
				{#if key === 'MODEL_1_COMPONENT_ID'}
					<p class='mt-1 text-xs text-text-muted'>
						Langflow node ID that should receive the `model_name`, `api_base`, and `system_prompt` tweaks. Leave empty to keep the legacy flat tweaks payload.
					</p>
				{/if}
			</div>
		{/each}
		<div>
			<label class='settings-label' for='MODEL_1_SYSTEM_PROMPT'>{CONFIG_LABELS.MODEL_1_SYSTEM_PROMPT}</label>
			<textarea
				id='MODEL_1_SYSTEM_PROMPT'
				class='settings-input min-h-[120px]'
				bind:value={adminConfig.MODEL_1_SYSTEM_PROMPT}
				rows='5'
			></textarea>
			<p class='mt-1 text-xs text-text-muted'>Full prompt text. Leave empty to use the env value.</p>
		</div>
	</div>
</section>

<section class='settings-card mb-4'>
	<h2 class='settings-section-title'>Model 2</h2>
	<div class='flex flex-col gap-3'>
		<div class='flex items-center justify-between'>
			<div>
				<label class='settings-label mb-0' for='MODEL_2_ENABLED'>{CONFIG_LABELS.MODEL_2_ENABLED}</label>
				<p class='text-xs text-text-tertiary'>Hide model 2 from the app and force fallbacks to model 1</p>
			</div>
			<label class='relative inline-flex cursor-pointer items-center'>
				<input
					id='MODEL_2_ENABLED'
					type='checkbox'
					class='peer sr-only'
					checked={adminConfig.MODEL_2_ENABLED !== 'false'}
					onchange={(event) => {
						adminConfig.MODEL_2_ENABLED = event.currentTarget.checked ? 'true' : 'false';
					}}
				/>
				<div class='peer h-6 w-11 rounded-full bg-surface-secondary after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-accent peer-checked:after:translate-x-full'></div>
			</label>
		</div>
		{#each ['MODEL_2_BASEURL', 'MODEL_2_NAME', 'MODEL_2_DISPLAY_NAME', 'MODEL_2_FLOW_ID', 'MODEL_2_COMPONENT_ID'] as key}
			<div>
				<label class='settings-label' for={key}>{CONFIG_LABELS[key]}</label>
				<input
					id={key}
					type='text'
					class='settings-input'
					bind:value={adminConfig[key]}
					placeholder={placeholderFor(key)}
				/>
				{#if key === 'MODEL_2_COMPONENT_ID'}
					<p class='mt-1 text-xs text-text-muted'>
						Langflow node ID that should receive the `model_name`, `api_base`, and `system_prompt` tweaks. Leave empty to keep the legacy flat tweaks payload.
					</p>
				{/if}
			</div>
		{/each}
		<div>
			<label class='settings-label' for='MODEL_2_SYSTEM_PROMPT'>{CONFIG_LABELS.MODEL_2_SYSTEM_PROMPT}</label>
			<textarea
				id='MODEL_2_SYSTEM_PROMPT'
				class='settings-input min-h-[120px]'
				bind:value={adminConfig.MODEL_2_SYSTEM_PROMPT}
				rows='5'
			></textarea>
			<p class='mt-1 text-xs text-text-muted'>Full prompt text. Leave empty to use the env value.</p>
		</div>
	</div>
</section>

<section class='settings-card mb-4'>
	<h2 class='settings-section-title'>Third-Party Providers</h2>
	<div class='flex flex-col gap-3'>
		<p class='text-xs text-text-muted'>
			Add inference providers for additional model options. API keys are encrypted with AES-256-GCM.
		</p>

		{#if providersLoading}
			<p class='text-sm text-text-secondary'>Loading providers...</p>
		{:else if providersError}
			<p class='text-sm text-danger'>{providersError}</p>
		{:else if providers.length > 0}
			<div class='flex flex-col gap-2'>
				{#each providers as provider}
					<div class='flex items-center justify-between rounded-md border border-border bg-surface-page px-3 py-2'>
						<div class='flex flex-col'>
							<span class='text-sm font-medium text-text-primary'>{provider.displayName}</span>
							<span class='text-xs text-text-muted'>{provider.baseUrl} &bull; {provider.modelName}</span>
							{#if provider.reasoningEffort || provider.thinkingType}
								<span class='text-xs text-text-tertiary'>
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
						<div class='flex items-center gap-2'>
							<span class={`inline-block h-2 w-2 rounded-full ${provider.enabled ? 'bg-success' : 'bg-text-muted'}`}></span>
							<button class='btn-small' onclick={() => handleValidate(provider)}>Test</button>
							<button class='btn-small' onclick={() => openEditForm(provider)}>Edit</button>
							<button class='btn-small text-danger' onclick={() => handleDelete(provider)}>Delete</button>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<p class='text-sm text-text-muted'>No providers configured.</p>
		{/if}

		<button class='btn-secondary w-full' onclick={openAddForm}>
			Add Provider
		</button>

		{#if providersMessage}
			<p class='text-sm text-success'>{providersMessage}</p>
		{/if}
	</div>
</section>

{#if showAddForm}
	<section class='settings-card mb-4 border-accent'>
		<h2 class='settings-section-title'>{editingProvider ? 'Edit Provider' : 'Add Provider'}</h2>
		<div class='flex flex-col gap-3'>
			<div>
				<label class='settings-label' for='form-name'>Name (ID)</label>
				<input
					id='form-name'
					type='text'
					class='settings-input'
					bind:value={formName}
					disabled={!!editingProvider}
					placeholder='e.g. fireworks-ai'
				/>
				<p class='mt-1 text-xs text-text-muted'>Model options use provider IDs internally.</p>
			</div>
			<div>
				<label class='settings-label' for='form-display-name'>Display Name</label>
				<input
					id='form-display-name'
					type='text'
					class='settings-input'
					bind:value={formDisplayName}
					placeholder='e.g. Fireworks AI'
				/>
			</div>
			<div>
				<label class='settings-label' for='form-base-url'>Base URL</label>
				<input
					id='form-base-url'
					type='text'
					class='settings-input'
					bind:value={formBaseUrl}
					placeholder='https://api.fireworks.ai/inference/v1'
				/>
			</div>
			<div>
				<label class='settings-label' for='form-model-name'>Model Name</label>
				<input
					id='form-model-name'
					type='text'
					class='settings-input'
					bind:value={formModelName}
					placeholder='e.g. accounts/fireworks/models/llama-v3-70b'
				/>
			</div>
			<div>
				<label class='settings-label' for='form-api-key'>
					API Key {editingProvider ? '(leave empty to keep current)' : ''}
				</label>
				<div class='flex gap-2'>
					<input
						id='form-api-key'
						type={showApiKey ? 'text' : 'password'}
						class='settings-input flex-1'
						bind:value={formApiKey}
						placeholder={editingProvider ? '(unchanged)' : 'sk-...'}
					/>
					<button
						type='button'
						class='btn-secondary'
						onclick={() => (showApiKey = !showApiKey)}
					>
						{showApiKey ? 'Hide' : 'Show'}
					</button>
				</div>
			</div>
			<div>
				<label class='settings-label' for='form-reasoning-effort'>Reasoning Effort</label>
				<select
					id='form-reasoning-effort'
					class='settings-input'
					bind:value={formReasoningEffort}
				>
					<option value=''>Provider default</option>
					<option value='low'>Low</option>
					<option value='medium'>Medium</option>
					<option value='high'>High</option>
				</select>
			</div>
			<div>
				<label class='settings-label' for='form-thinking-type'>extra_body thinking.type</label>
				<select
					id='form-thinking-type'
					class='settings-input'
					bind:value={formThinkingType}
				>
					<option value=''>Do not send</option>
					<option value='enabled'>Enabled</option>
					<option value='disabled'>Disabled</option>
				</select>
			</div>
			<div class='flex items-center gap-2'>
				<input
					id='form-enabled'
					type='checkbox'
					bind:checked={formEnabled}
				/>
				<label class='settings-label mb-0' for='form-enabled'>Enabled</label>
			</div>

			{#if formError}
				<p class='text-sm text-danger'>{formError}</p>
			{/if}

			<div class='flex gap-2'>
				<button class='btn-primary flex-1' onclick={saveProvider} disabled={formSaving}>
					{formSaving ? 'Saving...' : editingProvider ? 'Update Provider' : 'Add Provider'}
				</button>
				<button class='btn-secondary' onclick={closeForm}>Cancel</button>
			</div>
		</div>
	</section>
{/if}

<section class='settings-card mb-4'>
	<h2 class='settings-section-title'>Title Generator</h2>
	<div class='flex flex-col gap-3'>
		{#each ['TITLE_GEN_URL', 'TITLE_GEN_MODEL'] as key}
			<div>
				<label class='settings-label' for={key}>{CONFIG_LABELS[key]}</label>
				<input
					id={key}
					type='text'
					class='settings-input'
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
				<label class='settings-label' for={key}>{CONFIG_LABELS[key]}</label>
				<textarea
					id={key}
					class='settings-input min-h-[120px]'
					bind:value={adminConfig[key]}
					rows='5'
				></textarea>
				{#if key === 'TITLE_GEN_SYSTEM_PROMPT_EN' || key === 'TITLE_GEN_SYSTEM_PROMPT_HU'}
					<p class='mt-1 text-xs text-text-muted'>Base prompt for that language. Leave empty to rely on few-shot examples only.</p>
				{:else}
					<p class='mt-1 text-xs text-text-muted'>Optional extra lines appended only when the conversation looks code-related.</p>
				{/if}
			</div>
		{/each}
	</div>
</section>

<section class=settings-card mb-4>
	<h2 class=settings-section-title>Context Summarizer</h2>
	<div class=flex flex-col gap-3>
		{#each ['CONTEXT_SUMMARIZER_URL', 'CONTEXT_SUMMARIZER_MODEL'] as key}
			<div>
				<label class=settings-label for={key}>{CONFIG_LABELS[key]}</label>
				<input id={key} type=text class=settings-input bind:value={adminConfig[key]} placeholder={placeholderFor(key)} />
				<p class=mt-1 text-xs text-text-muted>{key === 'CONTEXT_SUMMARIZER_URL' ? 'OpenAI-compatible endpoint. Uses the same vLLM server as the title generator. Leave empty to disable.' : 'Model name served by the endpoint above.'}</p>
			</div>
		{/each}
	</div>
</section>

<section class=settings-card mb-4>
	<h2 class=settings-section-title>Translator</h2>
	<div class=flex flex-col gap-3>
		{#each ['TRANSLATOR_URL', 'TRANSLATOR_MODEL', 'TRANSLATION_MAX_TOKENS', 'TRANSLATION_TEMPERATURE'] as key}
			<div>
				<label class='settings-label' for={key}>{CONFIG_LABELS[key]}</label>
				<input
					id={key}
					type={NUMBER_KEYS.has(key) ? 'number' : 'text'}
					class='settings-input'
					bind:value={adminConfig[key]}
					placeholder={placeholderFor(key)}
					step={key === 'TRANSLATION_TEMPERATURE' ? '0.01' : undefined}
				/>
			</div>
		{/each}
	</div>
</section>

<section class='settings-card mb-4'>
	<h2 class='settings-section-title'>Honcho Memory</h2>
	<div class='mb-3 flex items-center justify-between'>
		<div>
			<label class='settings-label mb-0' for='HONCHO_ENABLED'>Enable Honcho</label>
			<p class='text-xs text-text-tertiary'>Cross-conversation long-term memory via Honcho</p>
		</div>
		<label class='relative inline-flex cursor-pointer items-center'>
			<input
				id='HONCHO_ENABLED'
				type='checkbox'
				class='peer sr-only'
				checked={adminConfig.HONCHO_ENABLED === 'true'}
				onchange={(event) => {
					adminConfig.HONCHO_ENABLED = event.currentTarget.checked ? 'true' : 'false';
				}}
			/>
			<div class='peer h-6 w-11 rounded-full bg-surface-secondary after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-accent peer-checked:after:translate-x-full'></div>
		</label>
	</div>
	<div class='flex items-center gap-2 text-xs text-text-secondary'>
		<button class='text-accent hover:underline' onclick={onCheckHonchoHealth} disabled={honchoLoading}>
			{honchoLoading ? 'Checking...' : 'Check Connection'}
		</button>
		{#if honchoHealth}
			<span class='inline-flex items-center gap-1'>
				<span class={`inline-block h-2 w-2 rounded-full ${honchoHealth.connected ? 'bg-success' : 'bg-danger'}`}></span>
				{honchoHealth.connected ? 'Connected' : 'Disconnected'}
				{#if honchoHealth.workspace}
					<span class='text-text-tertiary'>({honchoHealth.workspace})</span>
				{/if}
			</span>
		{/if}
	</div>
	<div class='mt-4 flex flex-col gap-3'>
		{#each ['HONCHO_CONTEXT_WAIT_MS', 'HONCHO_PERSONA_CONTEXT_WAIT_MS', 'HONCHO_OVERVIEW_WAIT_MS'] as key}
			<div>
				<label class='settings-label' for={key}>{CONFIG_LABELS[key]}</label>
				<input
					id={key}
					type='number'
					class='settings-input'
					bind:value={adminConfig[key]}
					placeholder={placeholderFor(key)}
				/>
				{#if key === 'HONCHO_CONTEXT_WAIT_MS'}
					<p class='mt-1 text-xs text-text-muted'>
						How long chat waits for live Honcho session bootstrap, queue settling, and `session.context(...)` before falling back to the last good snapshot or persisted turns.
					</p>
				{:else if key === 'HONCHO_PERSONA_CONTEXT_WAIT_MS'}
					<p class='mt-1 text-xs text-text-muted'>
						Timeout for auxiliary Honcho persona enrichment during chat turns. Lower values keep the prompt path responsive because persona cluster refresh now happens in the background.
					</p>
				{:else}
					<p class='mt-1 text-xs text-text-muted'>
						Timeout for the Knowledge Base live Honcho overview refresh path. This can be longer than the chat-side persona enrichment timeout because the overview now has a cached fallback and a retry loop.
					</p>
				{/if}
			</div>
		{/each}
	</div>
</section>

<section class='settings-card mb-4'>
	<h2 class='settings-section-title'>Document Extraction</h2>
	<div class='mb-3 flex items-center justify-between'>
		<div>
			<label class='settings-label mb-0' for='DOCUMENT_PARSER_OCR_ENABLED'>{CONFIG_LABELS.DOCUMENT_PARSER_OCR_ENABLED}</label>
			<p class='text-xs text-text-tertiary'>Enable OCR during upload normalization via Liteparse.</p>
		</div>
		<label class='relative inline-flex cursor-pointer items-center'>
			<input
				id='DOCUMENT_PARSER_OCR_ENABLED'
				type='checkbox'
				class='peer sr-only'
				checked={adminConfig.DOCUMENT_PARSER_OCR_ENABLED !== 'false'}
				onchange={(event) => {
					adminConfig.DOCUMENT_PARSER_OCR_ENABLED = event.currentTarget.checked ? 'true' : 'false';
				}}
			/>
			<div class='peer h-6 w-11 rounded-full bg-surface-secondary after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-accent peer-checked:after:translate-x-full'></div>
		</label>
	</div>
	<div class='flex flex-col gap-3'>
		{#each [
			'DOCUMENT_PARSER_OCR_SERVER_URL',
			'DOCUMENT_PARSER_PADDLE_BACKEND_URL',
			'DOCUMENT_PARSER_OCR_LANGUAGE',
			'DOCUMENT_PARSER_NUM_WORKERS',
			'DOCUMENT_PARSER_MAX_PAGES',
			'DOCUMENT_PARSER_DPI',
			'DOCUMENT_PARSER_TIMEOUT_MS',
		] as key}
			<div>
				<label class='settings-label' for={key}>{CONFIG_LABELS[key]}</label>
				<input
					id={key}
					type={NUMBER_KEYS.has(key) ? 'number' : 'text'}
					class='settings-input'
					bind:value={adminConfig[key]}
					placeholder={placeholderFor(key)}
				/>
				{#if key === 'DOCUMENT_PARSER_OCR_SERVER_URL'}
					<p class='mt-1 text-xs text-text-muted'>
						Leave empty to use Liteparse built-in OCR (Tesseract path). Set <code>/api/ocr/paddle</code> only when routing through the optional Paddle adapter.
					</p>
				{:else if key === 'DOCUMENT_PARSER_PADDLE_BACKEND_URL'}
					<p class='mt-1 text-xs text-text-muted'>
						Optional upstream Paddle OCR endpoint (for example <code>http://127.0.0.1:5000/ocr</code>) used only when the local OCR adapter route is enabled.
					</p>
				{:else if key === 'DOCUMENT_PARSER_OCR_LANGUAGE'}
					<p class='mt-1 text-xs text-text-muted'>
						Built-in Tesseract works best with ISO-639-3 codes (for example <code>hun+eng+nld</code>). External adapters may still use profile-style values like <code>hu+en+nl</code>.
					</p>
				{/if}
			</div>
		{/each}
	</div>
</section>

<section class='settings-card mb-4'>
	<h2 class='settings-section-title'>General</h2>
	<div>
		<label class='settings-label' for='MAX_MESSAGE_LENGTH'>{CONFIG_LABELS.MAX_MESSAGE_LENGTH}</label>
		<input
			id='MAX_MESSAGE_LENGTH'
			type='number'
			class='settings-input'
			bind:value={adminConfig.MAX_MESSAGE_LENGTH}
			placeholder={placeholderFor('MAX_MESSAGE_LENGTH')}
		/>
	</div>
</section>

<section class='settings-card mb-4'>
	<h2 class='settings-section-title'>Context Management</h2>
	<div class='flex flex-col gap-3'>
		{#each ['MAX_MODEL_CONTEXT', 'COMPACTION_UI_THRESHOLD', 'TARGET_CONSTRUCTED_CONTEXT'] as key}
			<div>
				<label class='settings-label' for={key}>{CONFIG_LABELS[key]}</label>
				<input
					id={key}
					type='number'
					class='settings-input'
					bind:value={adminConfig[key]}
					placeholder={placeholderFor(key)}
					min='1000'
				/>
			</div>
		{/each}
		<p class='text-xs text-text-muted mt-2'>
			These values control context token limits. Must maintain: Target &lt; Threshold &lt; Max.
			Current defaults: 157286 &lt; 209715 &lt; 262144.
		</p>
	</div>
</section>

{#if adminMessage}
	<p class='mb-3 text-sm text-success'>{adminMessage}</p>
{/if}
{#if adminError}
	<p class='mb-3 text-sm text-danger'>{adminError}</p>
{/if}
<button class='btn-primary mb-8 w-full' onclick={onSaveAdminConfig} disabled={adminSaving}>
	{adminSaving ? 'Saving…' : 'Save Configuration'}
</button>

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
