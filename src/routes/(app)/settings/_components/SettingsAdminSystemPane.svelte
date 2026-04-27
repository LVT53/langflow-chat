<script lang="ts">
import {
	createProvider,
	deleteProvider,
	fetchProviders,
	updateProvider,
	validateProvider,
	type InferenceProvider,
} from "$lib/client/api/admin";
import { get } from "svelte/store";
import { t } from "$lib/i18n";
import ModelFormModal from "./ModelFormModal.svelte";

const tVal = get(t);

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
let modalModel = $state<
	| (InferenceProvider & {
			isBuiltIn?: boolean;
			flowId?: string;
			componentId?: string;
	  })
	| null
>(null);
let modalIsCreate = $state(false);
let modalSaving = $state(false);
let modalError = $state("");

async function loadProviders() {
	providersLoading = true;
	providersError = "";
	try {
		providers = await fetchProviders();
	} catch (e: any) {
		providersError = e.message ?? $t("admin.failedLoadProviders");
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
	const prefix = modelName === "model1" ? "MODEL_1" : "MODEL_2";
	modalModel = {
		id: modelName,
		name: modelName,
		displayName: adminConfig[`${prefix}_DISPLAY_NAME`] ?? "",
		baseUrl: adminConfig[`${prefix}_BASEURL`] ?? "",
		apiKey: adminConfig[`${prefix}_API_KEY`] ?? "",
		modelName: adminConfig[`${prefix}_NAME`] ?? "",
		reasoningEffort: null,
		thinkingType: null,
		enabled:
			modelName === "model2" ? adminConfig.MODEL_2_ENABLED !== "false" : true,
		sortOrder: 0,
		maxModelContext: adminConfig[`${prefix}_MAX_MODEL_CONTEXT`]
			? Number(adminConfig[`${prefix}_MAX_MODEL_CONTEXT`])
			: null,
		compactionUiThreshold: adminConfig[`${prefix}_COMPACTION_UI_THRESHOLD`]
			? Number(adminConfig[`${prefix}_COMPACTION_UI_THRESHOLD`])
			: null,
		targetConstructedContext: adminConfig[
			`${prefix}_TARGET_CONSTRUCTED_CONTEXT`
		]
			? Number(adminConfig[`${prefix}_TARGET_CONSTRUCTED_CONTEXT`])
			: null,
		maxMessageLength: adminConfig[`${prefix}_MAX_MESSAGE_LENGTH`]
			? Number(adminConfig[`${prefix}_MAX_MESSAGE_LENGTH`])
			: null,
		maxTokens: adminConfig[`${prefix}_MAX_TOKENS`]
			? Number(adminConfig[`${prefix}_MAX_TOKENS`])
			: null,
		createdAt: "",
		updatedAt: "",
		isBuiltIn: true,
		flowId: adminConfig[`${prefix}_FLOW_ID`] ?? "",
		componentId: adminConfig[`${prefix}_COMPONENT_ID`] ?? "",
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
			providersMessage = $t("admin.providerAdded");
		} else if (modalModel?.isBuiltIn) {
			// Save built-in model config via admin config keys
			const prefix = modalModel.name === "model1" ? "MODEL_1" : "MODEL_2";
			if (data.displayName !== undefined)
				adminConfig[`${prefix}_DISPLAY_NAME`] = data.displayName as string;
			if (data.baseUrl !== undefined)
				adminConfig[`${prefix}_BASEURL`] = data.baseUrl as string;
			if (data.apiKey !== undefined)
				adminConfig[`${prefix}_API_KEY`] = data.apiKey as string;
			if (data.modelName !== undefined)
				adminConfig[`${prefix}_NAME`] = data.modelName as string;
			if (data.flowId !== undefined)
				adminConfig[`${prefix}_FLOW_ID`] = data.flowId as string;
			if (data.componentId !== undefined)
				adminConfig[`${prefix}_COMPONENT_ID`] = data.componentId as string;
			if (data.maxTokens !== undefined)
				adminConfig[`${prefix}_MAX_TOKENS`] =
					data.maxTokens != null ? String(data.maxTokens) : "";
			if (data.enabled !== undefined)
				adminConfig[`${prefix}_ENABLED`] = (data.enabled as boolean)
					? "true"
					: "false";
			if (data.maxModelContext !== undefined)
				adminConfig[`${prefix}_MAX_MODEL_CONTEXT`] =
					data.maxModelContext != null ? String(data.maxModelContext) : "";
			if (data.compactionUiThreshold !== undefined)
				adminConfig[`${prefix}_COMPACTION_UI_THRESHOLD`] =
					data.compactionUiThreshold != null
						? String(data.compactionUiThreshold)
						: "";
			if (data.targetConstructedContext !== undefined)
				adminConfig[`${prefix}_TARGET_CONSTRUCTED_CONTEXT`] =
					data.targetConstructedContext != null
						? String(data.targetConstructedContext)
						: "";
			if (data.maxMessageLength !== undefined)
				adminConfig[`${prefix}_MAX_MESSAGE_LENGTH`] =
					data.maxMessageLength != null ? String(data.maxMessageLength) : "";
			await onSaveAdminConfig?.();
			providersMessage = `${modalModel.displayName || modelNameDisplay(modalModel.name)} ${$t("common.updated").toLowerCase()}`;
		} else if (modalModel) {
			await updateProvider(modalModel.id, data as any);
			providersMessage = $t("admin.providerUpdated");
		}
		closeModal();
		await loadProviders();
	} catch (e: any) {
		modalError = e.message ?? $t("admin.failedSave");
	} finally {
		modalSaving = false;
	}
}

async function handleDelete(provider: InferenceProvider) {
	if (
		!confirm($t("admin.deleteProviderConfirm", { name: provider.displayName }))
	)
		return;
	providersMessage = "";
	try {
		await deleteProvider(provider.id);
		providersMessage = $t("admin.providerDeleted");
		await loadProviders();
	} catch (e: any) {
		providersError = e.message ?? $t("admin.failedDeleteProvider");
	}
}

async function handleValidate(provider: InferenceProvider) {
	providersMessage = "";
	providersError = "";
	try {
		const result = await validateProvider(provider.id);
		if (result.valid) {
			providersMessage = $t("admin.providerValid", {
				name: provider.displayName,
			});
		} else {
			providersError = $t("admin.validationFailed", {
				error: result.error ?? "Unknown error",
			});
		}
	} catch (e: any) {
		providersError = e.message ?? $t("admin.failedValidateProvider");
	}
}

function modelNameDisplay(name: string): string {
	return name === "model1"
		? adminConfig.MODEL_1_DISPLAY_NAME || "Model 1"
		: name === "model2"
			? adminConfig.MODEL_2_DISPLAY_NAME || "Model 2"
			: name;
}

$effect(() => {
	void loadProviders();
});

function configLabelKey(key: string): string {
	const map: Record<string, string> = {
		MODEL_1_BASEURL: "admin.model1BaseUrl",
		MODEL_1_API_KEY: "admin.model1ApiKey",
		MODEL_1_NAME: "admin.model1Name",
		MODEL_1_DISPLAY_NAME: "admin.model1DisplayName",
		MODEL_1_SYSTEM_PROMPT: "admin.model1SystemPrompt",
		MODEL_1_FLOW_ID: "admin.model1FlowId",
		MODEL_1_COMPONENT_ID: "admin.model1ComponentId",
		MODEL_2_BASEURL: "admin.model2BaseUrl",
		MODEL_2_API_KEY: "admin.model2ApiKey",
		MODEL_2_NAME: "admin.model2Name",
		MODEL_2_DISPLAY_NAME: "admin.model2DisplayName",
		MODEL_2_SYSTEM_PROMPT: "admin.model2SystemPrompt",
		MODEL_2_FLOW_ID: "admin.model2FlowId",
		MODEL_2_COMPONENT_ID: "admin.model2ComponentId",
		MODEL_2_ENABLED: "admin.model2Enabled",
		TRANSLATOR_URL: "admin.translatorUrl",
		TRANSLATOR_MODEL: "admin.translatorModel",
		TRANSLATION_MAX_TOKENS: "admin.translationMaxTokens",
		TRANSLATION_TEMPERATURE: "admin.translationTemperature",
		MODEL_1_MAX_MODEL_CONTEXT: "admin.model1MaxModelContext",
		MODEL_1_COMPACTION_UI_THRESHOLD: "admin.model1CompactionThreshold",
		MODEL_1_TARGET_CONSTRUCTED_CONTEXT: "admin.model1TargetContext",
		MODEL_1_MAX_MESSAGE_LENGTH: "admin.model1MaxMessageLength",
		MODEL_2_MAX_MODEL_CONTEXT: "admin.model2MaxModelContext",
		MODEL_2_COMPACTION_UI_THRESHOLD: "admin.model2CompactionThreshold",
		MODEL_2_TARGET_CONSTRUCTED_CONTEXT: "admin.model2TargetContext",
		MODEL_2_MAX_MESSAGE_LENGTH: "admin.model2MaxMessageLength",
		TITLE_GEN_URL: "admin.titleGenUrl",
		TITLE_GEN_MODEL: "admin.titleGenModel",
		CONTEXT_SUMMARIZER_URL: "admin.contextSummarizerUrl",
		CONTEXT_SUMMARIZER_MODEL: "admin.contextSummarizerModel",
		TITLE_GEN_SYSTEM_PROMPT_EN: "admin.titleGenPromptEn",
		TITLE_GEN_SYSTEM_PROMPT_HU: "admin.titleGenPromptHu",
		TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_EN: "admin.titleGenCodeAppendixEn",
		TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_HU: "admin.titleGenCodeAppendixHu",
		HONCHO_CONTEXT_WAIT_MS: "admin.honchoContextWaitMs",
		HONCHO_PERSONA_CONTEXT_WAIT_MS: "admin.honchoPersonaContextWaitMs",
		HONCHO_OVERVIEW_WAIT_MS: "admin.honchoOverviewWaitMs",
		MINERU_API_URL: "admin.mineruApiUrl",
		MINERU_TIMEOUT_MS: "admin.mineruTimeoutMs",
		MAX_MODEL_CONTEXT: "admin.maxModelContext",
		COMPACTION_UI_THRESHOLD: "admin.compactionUiThreshold",
		TARGET_CONSTRUCTED_CONTEXT: "admin.targetConstructedContext",
		MAX_MESSAGE_LENGTH: "admin.maxMessageLength",
		MAX_FILE_UPLOAD_SIZE: "admin.maxFileUploadSize",
		REQUEST_TIMEOUT_MS: "admin.requestTimeoutMs",
		SYSTEM_PROMPT: "admin.systemPromptLabel",
	};
	return map[key] ?? key;
}

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
	<h2 class="settings-section-title">{$t('admin.models')}</h2>
	<div class="flex flex-col gap-3">
		{#if providersLoading}
			<p class="text-sm text-text-secondary">{$t('admin.loadingModels')}</p>
		{:else if providersError}
			<p class="text-sm text-danger">{providersError}</p>
		{:else}
			<div class="flex flex-col gap-2">
				<!-- Model 1 (built-in, always present) -->
				<div class="flex items-center justify-between rounded-md border border-border bg-surface-page px-3 py-2">
					<div class="flex flex-col">
						<span class="text-sm font-medium text-text-primary">{adminConfig.MODEL_1_DISPLAY_NAME || $t('admin.model1')}</span>
						<span class="text-xs text-text-muted">{$t('admin.langflow')} &bull; {adminConfig.MODEL_1_NAME || 'model-1'}</span>
					</div>
					<div class="flex items-center gap-2">
						<span class="inline-block h-2 w-2 rounded-full bg-success"></span>
						<span class="text-xs text-text-muted">{$t('admin.builtIn')}</span>
						<button class="btn-small" onclick={() => openEditBuiltIn('model1')}>{$t('common.edit')}</button>
					</div>
				</div>

				<!-- Model 2 (built-in, conditionally shown) -->
				{#if adminConfig.MODEL_2_ENABLED !== 'false'}
					<div class="flex items-center justify-between rounded-md border border-border bg-surface-page px-3 py-2">
						<div class="flex flex-col">
							<span class="text-sm font-medium text-text-primary">{adminConfig.MODEL_2_DISPLAY_NAME || $t('admin.model2')}</span>
							<span class="text-xs text-text-muted">{$t('admin.langflow')} &bull; {adminConfig.MODEL_2_NAME || 'model-2'}</span>
						</div>
						<div class="flex items-center gap-2">
							<span class="inline-block h-2 w-2 rounded-full bg-success"></span>
							<span class="text-xs text-text-muted">{$t('admin.builtIn')}</span>
							<button class="btn-small" onclick={() => openEditBuiltIn('model2')}>{$t('common.edit')}</button>
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
							<button class="btn-small" onclick={() => handleValidate(provider)}>{$t('common.test')}</button>
							<button class="btn-small" onclick={() => openEditProvider(provider)}>{$t('common.edit')}</button>
							<button class="btn-small text-danger" onclick={() => handleDelete(provider)}>{$t('common.delete')}</button>
						</div>
					</div>
				{/each}
				<p class="text-xs text-text-muted">
					{$t('admin.thirdPartyDescription')}
				</p>
			</div>
		{/if}

		{#if providersMessage}
			<p class="text-sm text-success">{providersMessage}</p>
		{/if}

		<button class="btn-secondary w-full" onclick={openAddProvider}>
			{$t('admin.addProvider')}
		</button>
	</div>
</section>

<!-- Model 2 enable/disable toggle (separate from edit modal since it affects visibility) -->
<section class="settings-card mb-4">
	<h2 class="settings-section-title">{$t('admin.model2Visibility')}</h2>
	<div class="flex items-center justify-between">
		<div>
			<label class="settings-label mb-0" for="MODEL_2_ENABLED">{$t('admin.model2Enabled')}</label>
			<p class="text-xs text-text-tertiary">{$t('admin.model2VisibilityDescription')}</p>
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
	<h2 class="settings-section-title">{$t('admin.titleGenerator')}</h2>
	<div class="flex flex-col gap-3">
		{#each ['TITLE_GEN_URL', 'TITLE_GEN_MODEL'] as key}
			<div>
				<label class="settings-label" for={key}>{$t(configLabelKey(key))}</label>
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
				<label class="settings-label" for={key}>{$t(configLabelKey(key))}</label>
				<textarea
					id={key}
					class="settings-input min-h-[120px]"
					bind:value={adminConfig[key]}
					rows="5"
				></textarea>
				{#if key === 'TITLE_GEN_SYSTEM_PROMPT_EN' || key === 'TITLE_GEN_SYSTEM_PROMPT_HU'}
					<p class="mt-1 text-xs text-text-muted">{$t('admin.basePromptDescription')}</p>
				{:else}
					<p class="mt-1 text-xs text-text-muted">{$t('admin.codeAppendixDescription')}</p>
				{/if}
			</div>
		{/each}
	</div>
</section>

<!-- Context Summarizer -->
<section class="settings-card mb-4">
	<h2 class="settings-section-title">{$t('admin.contextSummarizer')}</h2>
	<div class="flex flex-col gap-3">
		{#each ['CONTEXT_SUMMARIZER_URL', 'CONTEXT_SUMMARIZER_MODEL'] as key}
			<div>
				<label class="settings-label" for={key}>{$t(configLabelKey(key))}</label>
				<input id={key} type="text" class="settings-input" bind:value={adminConfig[key]} placeholder={placeholderFor(key)} />
				<p class="mt-1 text-xs text-text-muted">{key === 'CONTEXT_SUMMARIZER_URL' ? $t('admin.summarizerUrlDescription') : $t('admin.summarizerModelDescription')}</p>
			</div>
		{/each}
	</div>
</section>

<!-- Honcho Memory -->
<section class="settings-card mb-4">
	<h2 class="settings-section-title">{$t('admin.honchoMemory')}</h2>
	<div class="mb-3 flex items-center justify-between">
		<div>
			<label class="settings-label mb-0" for="HONCHO_ENABLED">{$t('admin.enableHoncho')}</label>
			<p class="text-xs text-text-tertiary">{$t('admin.honchoDescription')}</p>
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
			{honchoLoading ? $t('admin.checking') : $t('admin.checkConnection')}
		</button>
		{#if honchoHealth}
			<span class="inline-flex items-center gap-1">
				<span class={`inline-block h-2 w-2 rounded-full ${honchoHealth.connected ? 'bg-success' : 'bg-danger'}`}></span>
				{honchoHealth.connected ? $t('admin.connected') : $t('admin.disconnected')}
				{#if honchoHealth.workspace}
					<span class="text-text-tertiary">({honchoHealth.workspace})</span>
				{/if}
			</span>
		{/if}
	</div>
	<div class="mt-4 flex flex-col gap-3">
		{#each ['HONCHO_CONTEXT_WAIT_MS', 'HONCHO_PERSONA_CONTEXT_WAIT_MS', 'HONCHO_OVERVIEW_WAIT_MS'] as key}
			<div>
				<label class="settings-label" for={key}>{$t(configLabelKey(key))}</label>
				<input
					id={key}
					type="number"
					class="settings-input"
					bind:value={adminConfig[key]}
					placeholder={placeholderFor(key)}
				/>
				{#if key === 'HONCHO_CONTEXT_WAIT_MS'}
					<p class="mt-1 text-xs text-text-muted">
						{$t('admin.honchoContextWaitDescription')}
					</p>
				{:else if key === 'HONCHO_PERSONA_CONTEXT_WAIT_MS'}
					<p class="mt-1 text-xs text-text-muted">
						{$t('admin.honchoPersonaWaitDescription')}
					</p>
				{:else}
					<p class="mt-1 text-xs text-text-muted">
						{$t('admin.honchoOverviewWaitDescription')}
					</p>
				{/if}
			</div>
		{/each}
	</div>
</section>

<!-- MinerU Document Extraction -->
<section class="settings-card mb-4">
	<h2 class="settings-section-title">{$t('admin.mineruDocumentExtraction')}</h2>
	<div class="flex flex-col gap-3">
		<div>
			<label class="settings-label" for="MINERU_API_URL">{$t('admin.mineruApiUrl')}</label>
			<input
				id="MINERU_API_URL"
				type="text"
				class="settings-input"
				bind:value={adminConfig.MINERU_API_URL}
				placeholder={placeholderFor('MINERU_API_URL')}
			/>
			<p class="mt-1 text-xs text-text-muted">
				{$t('admin.mineruApiDescription')}
			</p>
		</div>
		<div>
			<label class="settings-label" for="MINERU_TIMEOUT_MS">{$t('admin.mineruTimeoutMs')}</label>
			<input
				id="MINERU_TIMEOUT_MS"
				type="number"
				class="settings-input"
				bind:value={adminConfig.MINERU_TIMEOUT_MS}
				placeholder={placeholderFor('MINERU_TIMEOUT_MS')}
			/>
			<p class="mt-1 text-xs text-text-muted">
				{$t('admin.mineruTimeoutDescription')}
			</p>
		</div>
	</div>
</section>

<!-- System Prompt -->
<section class="settings-card mb-4">
	<h2 class="settings-section-title">{$t('admin.systemPrompt')}</h2>
	<div>
		<label class="settings-label" for="SYSTEM_PROMPT">{$t('admin.systemPromptLabel')}</label>
		<textarea
			id="SYSTEM_PROMPT"
			class="settings-input min-h-[200px]"
			bind:value={adminConfig.SYSTEM_PROMPT}
			rows="10"
			placeholder={placeholderFor('SYSTEM_PROMPT')}
		></textarea>
		<p class="mt-1 text-xs text-text-muted">{$t('admin.systemPromptDescription')}</p>
	</div>
</section>

<!-- Rate & Size Limits -->
<section class="settings-card mb-4">
	<h2 class="settings-section-title">{$t('admin.rateSizeLimits')}</h2>
	<div class="flex flex-col gap-3">
		<div>
			<label class="settings-label" for="MAX_FILE_UPLOAD_SIZE">{$t('admin.maxFileUploadSize')}</label>
			<input
				id="MAX_FILE_UPLOAD_SIZE"
				type="number"
				class="settings-input"
				bind:value={adminConfig.MAX_FILE_UPLOAD_SIZE}
				placeholder={placeholderFor('MAX_FILE_UPLOAD_SIZE')}
			/>
			<p class="mt-1 text-xs text-text-muted">{$t('admin.maxFileUploadDescription')}</p>
		</div>
		<div>
			<label class="settings-label" for="REQUEST_TIMEOUT_MS">{$t('admin.requestTimeoutMs')}</label>
			<input
				id="REQUEST_TIMEOUT_MS"
				type="number"
				class="settings-input"
				bind:value={adminConfig.REQUEST_TIMEOUT_MS}
				placeholder={placeholderFor('REQUEST_TIMEOUT_MS')}
			/>
			<p class="mt-1 text-xs text-text-muted">{$t('admin.requestTimeoutDescription')}</p>
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
	{adminSaving ? $t('common.saving') : $t('admin.saveConfiguration')}
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
