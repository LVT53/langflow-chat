import { describe, expect, it } from "vitest";
import type { KnowledgeDocumentItem } from "$lib/types";
import {
	getWorkspaceDocumentForArtifact,
	normalizeKnowledgeMemoryOverviewBullets,
	toWorkspaceDocument,
} from "./_helpers";

function makeKnowledgeDocument(
	overrides: Partial<KnowledgeDocumentItem> = {},
): KnowledgeDocumentItem {
	return {
		id: overrides.id ?? overrides.displayArtifactId ?? "artifact-source",
		type: overrides.type ?? "source_document",
		displayArtifactId: overrides.displayArtifactId ?? "artifact-source",
		promptArtifactId: overrides.promptArtifactId ?? "artifact-normalized",
		familyArtifactIds: overrides.familyArtifactIds ?? [
			"artifact-source",
			"artifact-normalized",
		],
		name: overrides.name ?? "Brief.pdf",
		mimeType: overrides.mimeType ?? "application/pdf",
		sizeBytes: overrides.sizeBytes ?? 1234,
		conversationId: overrides.conversationId ?? null,
		summary: overrides.summary ?? null,
		normalizedAvailable: overrides.normalizedAvailable ?? true,
		documentOrigin: overrides.documentOrigin ?? "uploaded",
		documentFamilyId: overrides.documentFamilyId ?? null,
		documentFamilyStatus: overrides.documentFamilyStatus ?? null,
		documentLabel: overrides.documentLabel ?? null,
		documentRole: overrides.documentRole ?? null,
		versionNumber: overrides.versionNumber ?? null,
		isOriginal: overrides.isOriginal ?? null,
		originConversationId: overrides.originConversationId ?? null,
		originAssistantMessageId: overrides.originAssistantMessageId ?? null,
		sourceChatFileId: overrides.sourceChatFileId ?? null,
		createdAt: overrides.createdAt ?? 1,
		updatedAt: overrides.updatedAt ?? 2,
	};
}

describe("normalizeKnowledgeMemoryOverviewBullets", () => {
	it("turns timestamped Honcho observations into separate human-readable bullets", () => {
		const bullets = normalizeKnowledgeMemoryOverviewBullets(
			"Explicit Observations [2026-04-25 23:15:33] Levi is enrolled in the Communication & Multimedia Design (CMDWLD) bachelor's programme at NHL Stenden University of Applied Sciences in Leeuwarden for the academic year 2024/2025. [2026-05-14 12:25:20] Levi owns an eBike that arrived on May 13, 2026 [2026-05-14 12:31:53] Levi is interested in comparing insurance options.",
		);

		expect(bullets).toEqual([
			"Levi is enrolled in the Communication & Multimedia Design (CMDWLD) bachelor's programme at NHL Stenden University of Applied Sciences in Leeuwarden for the academic year 2024/2025.",
			"Levi owns an eBike that arrived on May 13, 2026",
			"Levi is interested in comparing insurance options.",
		]);
		expect(bullets.join(" ")).not.toContain("[2026-");
		expect(bullets.join(" ")).not.toContain("Explicit Observations");
	});

	it("strips heading and markdown markers without losing concrete facts", () => {
		const bullets = normalizeKnowledgeMemoryOverviewBullets(
			"## Memory Overview\n- Levi has front-end and back-end development skills.\n- Levi owns a Cube Kathmandu and has asked about getting insurance for it.",
		);

		expect(bullets).toEqual([
			"Levi has front-end and back-end development skills.",
			"Levi owns a Cube Kathmandu and has asked about getting insurance for it.",
		]);
		expect(bullets.join(" ")).not.toContain("##");
	});

	it("softens obvious sensitive values without dropping useful memory bullets", () => {
		const bullets = normalizeKnowledgeMemoryOverviewBullets(
			[
				"[2026-04-25 23:30:15] Levi has a phone number of 0642919770.",
				"[2026-04-25 23:30:15] Levi uses contact email futuredesigncenter@nhlstenden.com when discussing the programme.",
				"[2026-04-25 23:30:15] Levi has token: abcdefghijklmnop for a test integration.",
			].join(" "),
		);

		expect(bullets).toEqual([
			"Levi has a phone number of [phone number].",
			"Levi uses contact email [email address] when discussing the programme.",
			"Levi has token: [redacted] for a test integration.",
		]);
	});

	it("caps the display list at forty bullets", () => {
		const source = Array.from(
			{ length: 45 },
			(_, index) =>
				`[2026-04-25 23:15:33] Levi has durable memory item ${index + 1}.`,
		).join(" ");

		const bullets = normalizeKnowledgeMemoryOverviewBullets(source);

		expect(bullets).toHaveLength(40);
		expect(bullets[0]).toBe("Levi has durable memory item 1.");
		expect(bullets[39]).toBe("Levi has durable memory item 40.");
	});
});

describe("workspace document helpers", () => {
	it("uses source preview identity for source documents that have normalized prompt content", () => {
		const document = makeKnowledgeDocument({
			id: "source-pdf",
			displayArtifactId: "source-pdf",
			promptArtifactId: "normalized-pdf",
			familyArtifactIds: ["source-pdf", "normalized-pdf"],
			name: "Benefits.pdf",
			mimeType: "application/pdf",
			normalizedAvailable: true,
		});

		expect(toWorkspaceDocument(document)).toMatchObject({
			id: "artifact:source-pdf",
			filename: "Benefits.pdf",
			title: "Benefits.pdf",
			artifactId: "source-pdf",
			sourceChatFileId: null,
		});
	});

	it("opens a source workspace document from its normalized prompt artifact id", () => {
		const document = makeKnowledgeDocument({
			id: "source-docx",
			displayArtifactId: "source-docx",
			promptArtifactId: "normalized-docx",
			familyArtifactIds: ["source-docx", "normalized-docx"],
			name: "Contract.docx",
			mimeType:
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			normalizedAvailable: true,
		});

		expect(
			getWorkspaceDocumentForArtifact([document], "normalized-docx"),
		).toMatchObject({
			id: "artifact:source-docx",
			artifactId: "source-docx",
			filename: "Contract.docx",
		});
	});

	it("opens the current generated workspace document from a historical family artifact id", () => {
		const document = makeKnowledgeDocument({
			id: "generated-v2",
			type: "generated_output",
			displayArtifactId: "generated-v2",
			promptArtifactId: "generated-v2",
			familyArtifactIds: ["generated-v1", "generated-v2"],
			name: "Report v2.docx",
			mimeType:
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			documentOrigin: "generated",
			documentFamilyId: "family-report",
			sourceChatFileId: "chat-file-v2",
		});

		expect(
			getWorkspaceDocumentForArtifact([document], "generated-v1"),
		).toMatchObject({
			id: "artifact:generated-v2",
			artifactId: "generated-v2",
			sourceChatFileId: "chat-file-v2",
			documentFamilyId: "family-report",
		});
	});
});
