import { expect, type Page, test } from "@playwright/test";
import {
	AI_SMOKE_API_KEY,
	AI_SMOKE_MODEL_ID,
	AI_SMOKE_STREAM_TEXT,
} from "../fixtures/ai/openai-compatible-scenarios";
import { createOpenAICompatibleProviderHarness } from "../mocks/ai-provider/openai-compatible-provider";
import {
	buildAiSdkUiStreamBody,
	login,
	openConversationComposer,
	sendMessage,
} from "./helpers";

const provider = createOpenAICompatibleProviderHarness();

type TemporaryProviderModel = {
	providerId: string;
	modelId: string;
	selectedModel: `provider:${string}:${string}`;
};

test.describe("Core user flows smoke", () => {
	test.beforeAll(async () => {
		await provider.start();
	});

	test.afterAll(async () => {
		await provider.stop();
	});

	test.beforeEach(async () => {
		await provider.reset();
	});

	test("logs in, sends from landing through the fake provider, and reloads the persisted response", async ({
		page,
	}) => {
		await login(page);
		const previousModelPreference = await snapshotUserModelPreference(page);
		const previousSelectedModel = await snapshotBrowserSelectedModel(page);
		let temporaryProvider: TemporaryProviderModel | null = null;

		try {
			temporaryProvider = await createTemporaryFakeProviderModel(page);
			await updateUserModelPreference(page, temporaryProvider.selectedModel);
			await setBrowserSelectedModel(page, temporaryProvider.selectedModel);

			await page.goto("/", { waitUntil: "domcontentloaded" });
			await openConversationComposer(page, { skipIfAlreadyOpen: true });

			await sendMessage(page, "Smoke test the main chat path.");
			await expect(page).toHaveURL(/\/chat\//, { timeout: 15000 });
			await expect(page.getByTestId("user-message").first()).toContainText(
				"Smoke test the main chat path.",
				{ timeout: 10000 },
			);
			await expect(page.getByTestId("assistant-message").first()).toContainText(
				AI_SMOKE_STREAM_TEXT,
				{ timeout: 30000 },
			);

			const chatUrl = page.url();
			await page.reload({ waitUntil: "domcontentloaded" });
			await expect(page).toHaveURL(chatUrl);
			await expect(page.getByTestId("assistant-message").first()).toContainText(
				AI_SMOKE_STREAM_TEXT,
				{ timeout: 15000 },
			);

			const streamedRequests = provider
				.requests()
				.filter((request) => request.path === "/v1/chat/completions");
			expect(
				streamedRequests.some((request) =>
					JSON.stringify(request.body).includes(
						"Smoke test the main chat path.",
					),
				),
			).toBe(true);
		} finally {
			await updateUserModelPreference(page, previousModelPreference);
			await setBrowserSelectedModel(page, previousSelectedModel);
			if (temporaryProvider) {
				await deleteTemporaryProvider(page, temporaryProvider.providerId);
			}
		}
	});

	test("shows a stream failure, retries, and replaces it with a visible assistant response", async ({
		page,
	}) => {
		await login(page);

		let streamAttempts = 0;
		await page.route("**/api/chat/stream", async (route) => {
			streamAttempts += 1;
			if (streamAttempts > 1) {
				await route.fulfill({
					status: 200,
					headers: {
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-cache",
						Connection: "keep-alive",
					},
					body: buildAiSdkUiStreamBody("Smoke retry recovered."),
				});
				return;
			}
			await route.fulfill({
				status: 500,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ error: "Smoke provider failure" }),
			});
		});
		await page.route("**/api/chat/retry", async (route) => {
			await route.fulfill({
				status: 200,
				headers: {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
				},
				body: buildAiSdkUiStreamBody("Smoke retry recovered."),
			});
		});

		await openConversationComposer(page, { skipIfAlreadyOpen: true });
		await sendMessage(page, "Trigger a retryable failure.");

		const retryButton = page.getByRole("button", { name: /retry/i });
		await expect(retryButton).toBeVisible({ timeout: 15000 });
		await retryButton.click();

		await expect(page.getByTestId("assistant-message").first()).toContainText(
			"Smoke retry recovered.",
			{ timeout: 15000 },
		);
	});

	test("searches and opens a knowledge document in the workspace", async ({
		page,
	}) => {
		await login(page);
		await page.goto("/knowledge", { waitUntil: "domcontentloaded" });
		await expect(
			page.getByRole("heading", { name: "Knowledge Base" }),
		).toBeVisible();
		const documentName = await seedKnowledgeDocumentViaUpload(page);

		const searchBox = page.getByRole("searchbox", {
			name: "Search documents",
		});
		await expect(searchBox).toBeVisible();

		await searchBox.fill(documentName);
		const filteredDocumentRow = page
			.locator("tbody tr", { hasText: documentName })
			.first();
		await expect(filteredDocumentRow).toBeVisible({ timeout: 10000 });
		await filteredDocumentRow.click();
		const workspace = page.locator(
			'aside.workspace-shell-desktop[aria-label="Document workspace"]',
		);
		await expect(workspace).toBeVisible({ timeout: 15000 });
		await expect(
			workspace.getByText(documentName, { exact: true }),
		).toBeVisible({
			timeout: 10000,
		});
	});

	test("validates an admin provider row and surfaces capability chips", async ({
		page,
	}) => {
		await login(page);
		const providerName = `smoke_provider_${Date.now()}`;
		const displayName = `Smoke Provider ${Date.now()}`;
		let providerId: string | null = null;

		try {
			const providerRow = await page.evaluate(
				async ({ name, baseUrl, displayName: nextDisplayName }) => {
					const response = await fetch("/api/admin/providers", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							name,
							displayName: nextDisplayName,
							baseUrl,
							apiKey: "fake-ai-smoke-key",
							modelName: "alfyai-fake-chat-model",
							enabled: true,
							sortOrder: 99,
							maxModelContext: 4096,
							compactionUiThreshold: 3000,
							targetConstructedContext: 2600,
							maxMessageLength: 2000,
							maxTokens: 512,
						}),
					});
					const body = (await response.json()) as {
						provider?: { id: string };
						error?: string;
					};
					return { ok: response.ok, status: response.status, body };
				},
				{
					name: providerName,
					displayName,
					baseUrl: provider.baseURL,
				},
			);
			expect(
				providerRow.ok,
				`provider create failed with ${providerRow.status}: ${providerRow.body.error ?? ""}`,
			).toBe(true);
			providerId = providerRow.body.provider?.id ?? null;
			expect(providerId).toBeTruthy();
			const modelResult = await page.evaluate(
				async ({ id, modelName }) => {
					const response = await fetch(
						`/api/admin/providers/${id}/models/batch`,
						{
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								models: [
									{
										name: modelName,
										displayName: "Smoke Provider Chat Model",
										contextLength: 8192,
										supportsChat: true,
										supportsTools: true,
									},
								],
							}),
						},
					);
					const body = (await response.json()) as { error?: string };
					return {
						ok: response.ok,
						status: response.status,
						error: body.error,
					};
				},
				{ id: providerId, modelName: AI_SMOKE_MODEL_ID },
			);
			expect(
				modelResult.ok,
				`provider model create failed with ${modelResult.status}: ${modelResult.error ?? ""}`,
			).toBe(true);

			await page.goto("/settings", { waitUntil: "domcontentloaded" });
			await page.waitForLoadState("networkidle");
			await page.getByRole("button", { name: "Administration" }).click();
			await expect(page.getByText("Add Provider")).toBeVisible({
				timeout: 10000,
			});
			const row = page
				.getByText(displayName)
				.locator(
					"xpath=ancestor::div[contains(@class, 'items-center') and contains(@class, 'justify-between')][1]",
				);
			await expect(row).toBeVisible({ timeout: 15000 });
			await row.getByRole("button", { name: "Manage models" }).click();
			const modelManager = page.locator(".fixed.inset-0").filter({
				has: page.getByRole("heading", { name: "Models", exact: true }),
			});
			await expect(
				modelManager.getByRole("heading", { name: "Models", exact: true }),
			).toBeVisible({ timeout: 10000 });
			await expect(
				modelManager.getByText("Smoke Provider Chat Model", { exact: true }),
			).toBeVisible({ timeout: 10000 });
		} finally {
			if (providerId) {
				await page.evaluate(async (id) => {
					await fetch(`/api/admin/providers/${id}`, { method: "DELETE" });
				}, providerId);
			}
		}
	});
});

async function createTemporaryFakeProviderModel(
	page: Page,
): Promise<TemporaryProviderModel> {
	const result = await page.evaluate(
		async ({ apiKey, baseUrl, modelName }) => {
			const unique = Date.now();
			const providerResponse = await fetch("/api/admin/providers", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: `core_smoke_provider_${unique}`,
					displayName: `Core Smoke Provider ${unique}`,
					baseUrl,
					apiKey,
				}),
			});
			const providerBody = (await providerResponse.json()) as {
				provider?: { id: string };
				error?: string;
			};
			if (!providerResponse.ok || !providerBody.provider?.id) {
				return {
					ok: false,
					status: providerResponse.status,
					error: providerBody.error ?? "Provider creation failed",
				};
			}

			const modelResponse = await fetch(
				`/api/admin/providers/${providerBody.provider.id}/models/batch`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						models: [
							{
								name: modelName,
								displayName: "Core Smoke Chat Model",
								contextLength: 8192,
								supportsChat: true,
								supportsTools: true,
							},
						],
					}),
				},
			);
			const modelBody = (await modelResponse.json()) as {
				models?: Array<{ id: string }>;
				error?: string;
			};
			const modelId = modelBody.models?.[0]?.id;
			if (!modelResponse.ok || !modelId) {
				return {
					ok: false,
					status: modelResponse.status,
					error: modelBody.error ?? "Provider model creation failed",
					providerId: providerBody.provider.id,
				};
			}

			return {
				ok: true,
				providerId: providerBody.provider.id,
				modelId,
			};
		},
		{
			apiKey: AI_SMOKE_API_KEY,
			baseUrl: provider.baseURL,
			modelName: AI_SMOKE_MODEL_ID,
		},
	);

	expect(
		result.ok,
		`fake provider setup failed with ${"status" in result ? result.status : "unknown"}: ${"error" in result ? result.error : ""}`,
	).toBe(true);
	if (!("providerId" in result) || !("modelId" in result)) {
		throw new Error(
			"Fake provider setup did not return provider and model ids",
		);
	}
	return {
		providerId: result.providerId,
		modelId: result.modelId,
		selectedModel: `provider:${result.providerId}:${result.modelId}`,
	};
}

async function deleteTemporaryProvider(
	page: Page,
	providerId: string,
): Promise<void> {
	await page.evaluate(async (id) => {
		await fetch(`/api/admin/providers/${id}`, { method: "DELETE" });
	}, providerId);
}

async function seedKnowledgeDocumentViaUpload(page: Page): Promise<string> {
	const unique = Date.now();
	const documentName = `core-smoke-document-${unique}.txt`;

	const result = await page.evaluate(async (name) => {
		const body = "Core smoke knowledge document body.";
		const file = new File([body], name, { type: "text/plain" });
		const intentResponse = await fetch("/api/knowledge/upload/intent", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				fileName: file.name,
				fileSize: file.size,
				mimeType: file.type,
				conversationId: null,
			}),
		});
		const intent = (await intentResponse.json()) as {
			traceId?: string;
			error?: string;
		};
		if (!intentResponse.ok || !intent.traceId) {
			return {
				ok: false,
				status: intentResponse.status,
				error: intent.error ?? "Upload intent failed",
			};
		}

		const uploadResponse = await fetch("/api/knowledge/upload/raw", {
			method: "POST",
			headers: {
				"Content-Type": file.type,
				"X-AlfyAI-Upload-Name": encodeURIComponent(file.name),
				"X-AlfyAI-Upload-Size": String(file.size),
				"X-AlfyAI-Upload-Trace-Id": intent.traceId,
			},
			body: file,
		});
		const uploadBody = (await uploadResponse.json()) as { error?: string };
		return {
			ok: uploadResponse.ok,
			status: uploadResponse.status,
			error: uploadBody.error,
		};
	}, documentName);

	expect(
		result.ok,
		`knowledge upload failed with ${result.status}: ${result.error ?? ""}`,
	).toBe(true);
	await page.goto("/knowledge", { waitUntil: "domcontentloaded" });
	await expect(page.getByText(documentName)).toBeVisible({ timeout: 10000 });

	return documentName;
}

async function snapshotUserModelPreference(page: Page): Promise<string | null> {
	return page.evaluate(async () => {
		const response = await fetch("/api/settings");
		if (!response.ok) {
			throw new Error(`Failed to snapshot user settings: ${response.status}`);
		}
		const data = (await response.json()) as {
			preferences?: { preferredModel?: string | null };
		};
		return data.preferences?.preferredModel ?? null;
	});
}

async function updateUserModelPreference(
	page: Page,
	preferredModel: string | null,
): Promise<void> {
	const result = await page.evaluate(async (nextPreferredModel) => {
		const response = await fetch("/api/settings/preferences", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ preferredModel: nextPreferredModel }),
		});
		return { ok: response.ok, status: response.status };
	}, preferredModel);

	expect(
		result.ok,
		`User model preference update failed with ${result.status}`,
	).toBe(true);
}

async function snapshotBrowserSelectedModel(
	page: Page,
): Promise<string | null> {
	return page.evaluate(() => localStorage.getItem("selectedModel"));
}

async function setBrowserSelectedModel(
	page: Page,
	selectedModel: string | null,
): Promise<void> {
	await page.evaluate((nextSelectedModel) => {
		if (nextSelectedModel === null) {
			localStorage.removeItem("selectedModel");
			return;
		}
		localStorage.setItem("selectedModel", nextSelectedModel);
	}, selectedModel);
}
