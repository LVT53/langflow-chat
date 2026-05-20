import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/config-store", () => ({
	getConfig: vi.fn(),
}));

vi.mock("$lib/server/auth/hooks", () => ({
	requireAuth: vi.fn(),
}));

vi.mock("$lib/server/services/skills/user-skills", () => ({
	createUserSkillDefinition: vi.fn(),
	createUserSkillVariantDefinition: vi.fn(),
	listEnabledSystemSkillSummaries: vi.fn(),
	listUserSkillDefinitions: vi.fn(),
	listUserSkillVariantDefinitions: vi.fn(),
	localizeSystemSkillSummary: vi.fn((skill) => skill),
	localizeUserSkillVariantDefinition: vi.fn((variant) => variant),
	seedBuiltInSystemSkillDefinitions: vi.fn(),
}));

import { requireAuth } from "$lib/server/auth/hooks";
import { getConfig } from "$lib/server/config-store";
import {
	createUserSkillDefinition,
	createUserSkillVariantDefinition,
	listEnabledSystemSkillSummaries,
	listUserSkillDefinitions,
	listUserSkillVariantDefinitions,
	localizeUserSkillVariantDefinition,
	seedBuiltInSystemSkillDefinitions,
} from "$lib/server/services/skills/user-skills";
import { GET, POST } from "./+server";

const mockGetConfig = getConfig as ReturnType<typeof vi.fn>;
const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;
const mockCreateUserSkillDefinition = createUserSkillDefinition as ReturnType<
	typeof vi.fn
>;
const mockCreateUserSkillVariantDefinition =
	createUserSkillVariantDefinition as ReturnType<typeof vi.fn>;
const mockListEnabledSystemSkillSummaries =
	listEnabledSystemSkillSummaries as ReturnType<typeof vi.fn>;
const mockListUserSkillDefinitions = listUserSkillDefinitions as ReturnType<
	typeof vi.fn
>;
const mockListUserSkillVariantDefinitions =
	listUserSkillVariantDefinitions as ReturnType<typeof vi.fn>;
const mockLocalizeUserSkillVariantDefinition =
	localizeUserSkillVariantDefinition as ReturnType<typeof vi.fn>;
const mockSeedBuiltInSystemSkillDefinitions =
	seedBuiltInSystemSkillDefinitions as ReturnType<typeof vi.fn>;

function makeEvent(body?: unknown, uiLanguage: "en" | "hu" = "en") {
	return {
		request: new Request("http://localhost/api/skills", {
			method: body === undefined ? "GET" : "POST",
			headers: { "Content-Type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		}),
		locals: { user: { id: "owner-user", role: "user", uiLanguage } },
		params: {},
		url: new URL("http://localhost/api/skills"),
		route: { id: "/api/skills" },
	} as Parameters<typeof GET>[0] & Parameters<typeof POST>[0];
}

describe("/api/skills", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockReturnValue(undefined);
		mockGetConfig.mockReturnValue({ composerCommandRegistryEnabled: true });
		mockListUserSkillDefinitions.mockResolvedValue([]);
		mockListUserSkillVariantDefinitions.mockResolvedValue([]);
		mockListEnabledSystemSkillSummaries.mockResolvedValue([]);
		mockLocalizeUserSkillVariantDefinition.mockImplementation(
			(variant) => variant,
		);
	});

	it("rejects list access when Composer Command Registry is disabled", async () => {
		mockGetConfig.mockReturnValue({ composerCommandRegistryEnabled: false });

		const response = await GET(makeEvent());
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.errorKey).toBe("composerCommandRegistry.disabled");
		expect(mockSeedBuiltInSystemSkillDefinitions).not.toHaveBeenCalled();
		expect(mockListUserSkillDefinitions).not.toHaveBeenCalled();
		expect(mockListUserSkillVariantDefinitions).not.toHaveBeenCalled();
	});

	it("rejects create access when Composer Command Registry is disabled", async () => {
		mockGetConfig.mockReturnValue({ composerCommandRegistryEnabled: false });

		const response = await POST(
			makeEvent({ displayName: "Draft", instructions: "Review this." }),
		);
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.errorKey).toBe("composerCommandRegistry.disabled");
		expect(mockCreateUserSkillDefinition).not.toHaveBeenCalled();
		expect(mockCreateUserSkillVariantDefinition).not.toHaveBeenCalled();
	});

	it("reconciles built-ins before listing only the authenticated user's skills and variants", async () => {
		mockListUserSkillDefinitions.mockResolvedValue([
			{ id: "skill-1", displayName: "Skill" },
		]);
		mockListUserSkillVariantDefinitions.mockResolvedValue([
			{
				id: "variant-1",
				displayName: "Variant",
				skillKind: "skill_variant",
				baseSkillId: "system:pack",
				baseSkillDisplayName: "Pack",
				baseSkillLocalizedDefaults: {
					en: {
						displayName: "Pack",
						description: "Pack summary.",
					},
					hu: {
						displayName: "Csomag",
						description: "Csomagösszefoglaló.",
					},
				},
				instructions: "LEAKED_VARIANT_OVERLAY",
			},
		]);
		mockLocalizeUserSkillVariantDefinition.mockImplementation(
			(variant, language) => ({
				...variant,
				baseSkillDisplayName:
					language === "hu" ? "Csomag" : variant.baseSkillDisplayName,
			}),
		);
		mockListEnabledSystemSkillSummaries.mockResolvedValue([
			{
				id: "system:grill-with-docs",
				ownership: "system",
				displayName: "Plan Critic",
				description: "A safe summary.",
				instructions: "LEAKED_SYSTEM_INSTRUCTIONS",
				localizedDefaults: {
					en: {
						displayName: "Plan Critic",
						description: "A safe summary.",
						instructions: "LEAKED_EN_INSTRUCTIONS",
					},
					hu: {
						displayName: "Tervkritikus",
						description: "Biztonságos összefoglaló.",
						instructions: "LEAKED_HU_INSTRUCTIONS",
					},
				},
			},
		]);

		const response = await GET(makeEvent(undefined, "hu"));
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.skills).toEqual([{ id: "skill-1", displayName: "Skill" }]);
		expect(data.variants).toEqual([
			{
				id: "variant-1",
				displayName: "Variant",
				skillKind: "skill_variant",
				baseSkillId: "system:pack",
				baseSkillDisplayName: "Csomag",
				baseSkillLocalizedDefaults: {
					en: {
						displayName: "Pack",
						description: "Pack summary.",
					},
					hu: {
						displayName: "Csomag",
						description: "Csomagösszefoglaló.",
					},
				},
				instructions: "LEAKED_VARIANT_OVERLAY",
			},
		]);
		expect(data.systemSkills).toEqual([
			{
				id: "system:grill-with-docs",
				ownership: "system",
				displayName: "Plan Critic",
				description: "A safe summary.",
				localizedDefaults: {
					en: {
						displayName: "Plan Critic",
						description: "A safe summary.",
					},
					hu: {
						displayName: "Tervkritikus",
						description: "Biztonságos összefoglaló.",
					},
				},
			},
		]);
		const serializedSystemSkills = JSON.stringify(data.systemSkills);
		expect(serializedSystemSkills).not.toContain("instructions");
		expect(serializedSystemSkills).not.toContain("LEAKED_SYSTEM_INSTRUCTIONS");
		expect(serializedSystemSkills).not.toContain("LEAKED_EN_INSTRUCTIONS");
		expect(serializedSystemSkills).not.toContain("LEAKED_HU_INSTRUCTIONS");
		expect(mockSeedBuiltInSystemSkillDefinitions).toHaveBeenCalledWith(
			"owner-user",
		);
		expect(mockListUserSkillDefinitions).toHaveBeenCalledWith("owner-user");
		expect(mockListUserSkillVariantDefinitions).toHaveBeenCalledWith(
			"owner-user",
		);
		expect(mockListEnabledSystemSkillSummaries).toHaveBeenCalledWith(
			"owner-user",
		);
		expect(mockLocalizeUserSkillVariantDefinition).toHaveBeenCalledWith(
			expect.objectContaining({ id: "variant-1" }),
			"hu",
		);
	});

	it("creates a skill for the authenticated user and ignores body user ids", async () => {
		mockCreateUserSkillDefinition.mockResolvedValue({
			id: "skill-1",
			displayName: "Meeting critic",
		});

		const response = await POST(
			makeEvent({
				userId: "attacker-user",
				displayName: "Meeting critic",
				instructions: "Review meeting notes.",
			}),
		);
		const data = await response.json();

		expect(response.status).toBe(201);
		expect(data.skill).toEqual({
			id: "skill-1",
			displayName: "Meeting critic",
		});
		expect(mockCreateUserSkillDefinition).toHaveBeenCalledWith(
			"owner-user",
			expect.objectContaining({
				displayName: "Meeting critic",
				instructions: "Review meeting notes.",
			}),
		);
	});

	it("creates a user variant for an available pack and ignores policy fields", async () => {
		mockCreateUserSkillVariantDefinition.mockResolvedValue({
			id: "variant-1",
			displayName: "Pack variant",
			skillKind: "skill_variant",
			baseSkillId: "system:pack",
		});

		const response = await POST(
			makeEvent({
				skillKind: "skill_variant",
				baseSkillId: "system:pack",
				displayName: "Pack variant",
				instructions: "Use my tone.",
				durationPolicy: "session",
				notesPolicy: "create_private_notes",
			}),
		);
		const data = await response.json();

		expect(response.status).toBe(201);
		expect(data.variant).toEqual({
			id: "variant-1",
			displayName: "Pack variant",
			skillKind: "skill_variant",
			baseSkillId: "system:pack",
		});
		expect(mockCreateUserSkillDefinition).not.toHaveBeenCalled();
		expect(mockCreateUserSkillVariantDefinition).toHaveBeenCalledWith(
			"owner-user",
			expect.not.objectContaining({
				durationPolicy: "session",
				notesPolicy: "create_private_notes",
			}),
		);
		expect(mockCreateUserSkillVariantDefinition).toHaveBeenCalledWith(
			"owner-user",
			expect.objectContaining({
				baseSkillId: "system:pack",
				displayName: "Pack variant",
				instructions: "Use my tone.",
			}),
		);
	});
});
