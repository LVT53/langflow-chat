import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRows, mockDerivedRows, mockSelect } = vi.hoisted(() => {
  const mockRows: Array<Record<string, unknown>> = [];
  const mockDerivedRows: Array<Record<string, unknown>> = [];
  const mockSelect = vi.fn();

  return {
    mockRows,
    mockDerivedRows,
    mockSelect,
  };
});

vi.mock("$lib/server/db", () => ({
  db: {
    select: mockSelect,
  },
}));

vi.mock("$lib/server/db/schema", () => ({
  artifacts: {
    id: { name: "id" },
    userId: { name: "userId" },
    type: { name: "type" },
    retrievalClass: { name: "retrievalClass" },
    name: { name: "name" },
    mimeType: { name: "mimeType" },
    sizeBytes: { name: "sizeBytes" },
    conversationId: { name: "conversationId" },
    vaultId: { name: "vaultId" },
    summary: { name: "summary" },
    metadataJson: { name: "metadataJson" },
    createdAt: { name: "createdAt" },
    updatedAt: { name: "updatedAt" },
    contentText: { name: "contentText" },
  },
  artifactLinks: {
    artifactId: { name: "artifactId" },
    relatedArtifactId: { name: "relatedArtifactId" },
    userId: { name: "userId" },
    linkType: { name: "linkType" },
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  desc: vi.fn(() => "desc"),
  eq: vi.fn((field: { name: string }, value: unknown) => ({ field: field.name, value })),
  inArray: vi.fn((field: { name: string }, value: unknown[]) => ({ field: field.name, value })),
  like: vi.fn(),
  ne: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}));

describe("knowledge documents store", () => {
  beforeEach(() => {
    mockRows.length = 0;
    mockDerivedRows.length = 0;
    mockSelect.mockReset();
  });

  it("treats generated outputs as logical documents grouped by family metadata", async () => {
    mockRows.push(
      {
        id: "source-1",
        type: "source_document",
        retrievalClass: "durable",
        name: "notes.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        conversationId: null,
        vaultId: "vault-1",
        summary: "Uploaded notes",
        metadataJson: null,
        createdAt: new Date("2026-04-01T10:00:00Z"),
        updatedAt: new Date("2026-04-01T10:00:00Z"),
      },
      {
        id: "normalized-1",
        type: "normalized_document",
        retrievalClass: "durable",
        name: "notes.txt",
        mimeType: "text/plain",
        sizeBytes: 512,
        conversationId: null,
        vaultId: "vault-1",
        summary: "Normalized notes",
        metadataJson: JSON.stringify({ sourceArtifactId: "source-1" }),
        createdAt: new Date("2026-04-01T10:01:00Z"),
        updatedAt: new Date("2026-04-01T10:01:00Z"),
      },
      {
        id: "gen-1",
        type: "generated_output",
        retrievalClass: "durable",
        name: "brief-v1.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: 2048,
        conversationId: "conv-1",
        vaultId: null,
        summary: "First brief draft",
        metadataJson: JSON.stringify({
          documentFamilyId: "family-brief",
          documentLabel: "Project brief",
          documentRole: "brief",
          versionNumber: 1,
        }),
        createdAt: new Date("2026-04-02T10:00:00Z"),
        updatedAt: new Date("2026-04-02T10:00:00Z"),
      },
      {
        id: "gen-2",
        type: "generated_output",
        retrievalClass: "durable",
        name: "brief-v2.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: 3072,
        conversationId: "conv-2",
        vaultId: null,
        summary: "Second brief draft",
        metadataJson: JSON.stringify({
          documentFamilyId: "family-brief",
          documentLabel: "Project brief",
          documentRole: "brief",
          versionNumber: 2,
        }),
        createdAt: new Date("2026-04-03T10:00:00Z"),
        updatedAt: new Date("2026-04-03T10:00:00Z"),
      },
    );

    mockDerivedRows.push({
      normalizedArtifactId: "normalized-1",
      sourceArtifactId: "source-1",
    });

    let selectCall = 0;
    mockSelect.mockImplementation(() => {
      selectCall += 1;
      if (selectCall === 1) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(async () => mockRows),
            })),
          })),
        };
      }

      return {
        from: vi.fn(() => ({
          where: vi.fn(async () => mockDerivedRows),
        })),
      };
    });

    const { listLogicalDocuments } = await import("./documents");
    const documents = await listLogicalDocuments("user-1", {
      includeGeneratedOutputs: true,
    });

    const generatedDocument = documents.find(
      (document) => document.documentFamilyId === "family-brief",
    );

    expect(generatedDocument).toBeDefined();
    expect(generatedDocument).toMatchObject({
      displayArtifactId: "gen-2",
      promptArtifactId: "gen-2",
      name: "brief-v2.docx",
      documentOrigin: "generated",
      documentFamilyId: "family-brief",
      documentLabel: "Project brief",
      documentRole: "brief",
      versionNumber: 2,
      normalizedAvailable: true,
    });
    expect(generatedDocument?.familyArtifactIds).toEqual(
      expect.arrayContaining(["gen-1", "gen-2"]),
    );
  });
});
