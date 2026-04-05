import { randomUUID } from "crypto";
import { and, asc, eq, inArray, like } from "drizzle-orm";
import { db } from "$lib/server/db";
import { artifacts } from "$lib/server/db/schema";
import type { Artifact } from "$lib/types";
import { mapArtifact } from "./core";
import { parseWorkingDocumentMetadata } from "./document-metadata";
import { parseJsonRecord } from "$lib/server/utils/json";

/**
 * Generates a unique document family ID for version linking
 */
export function generateDocumentFamilyId(): string {
  return randomUUID();
}

/**
 * Gets all artifacts that belong to a document family
 */
export async function getDocumentVersions(
  familyId: string,
): Promise<Artifact[]> {
  const rows = await db
    .select()
    .from(artifacts)
    .where(like(artifacts.metadataJson, `%"documentFamilyId":"${familyId}"%`))
    .orderBy(asc(artifacts.createdAt));

  const versions = rows.filter((row) => {
    const metadata = parseWorkingDocumentMetadata(
      parseJsonRecord(row.metadataJson),
    );
    return metadata.documentFamilyId === familyId;
  });

  return versions.map(mapArtifact);
}

/**
 * Gets the next version number for a document family
 */
export async function getNextVersionNumber(
  familyId: string,
): Promise<number> {
  const versions = await getDocumentVersions(familyId);
  if (versions.length === 0) return 1;

  const maxVersion = Math.max(
    ...versions.map((v) => {
      const metadata = parseWorkingDocumentMetadata(v.metadata);
      return metadata.versionNumber ?? 0;
    }),
  );

  return maxVersion + 1;
}

/**
 * Updates an artifact's metadata with version linking information
 */
export async function assignDocumentFamilyId(params: {
  artifactId: string;
  familyId: string;
  versionNumber: number;
  isOriginal: boolean;
}): Promise<void> {
  const [existing] = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.id, params.artifactId))
    .limit(1);

  if (!existing) {
    throw new Error(`Artifact ${params.artifactId} not found`);
  }

  const existingMetadata = parseJsonRecord(existing.metadataJson) ?? {};

  const updatedMetadata = {
    ...existingMetadata,
    documentFamilyId: params.familyId,
    versionNumber: params.versionNumber,
    isOriginal: params.isOriginal,
  };

  await db
    .update(artifacts)
    .set({
      metadataJson: JSON.stringify(updatedMetadata),
      updatedAt: new Date(),
    })
    .where(eq(artifacts.id, params.artifactId));
}

/**
 * Links multiple artifacts as versions of the same document family
 * 
 * This function:
 * 1. Generates a new family ID if none exists
 * 2. Assigns version numbers to each artifact
 * 3. Marks the first artifact as original
 * 
 * @param artifactIds - Array of artifact IDs to link as versions
 * @param existingFamilyId - Optional existing family ID to use
 */
export async function linkDocumentsAsVersions(params: {
  artifactIds: string[];
  existingFamilyId?: string | null;
}): Promise<{
  familyId: string;
  linkedArtifacts: Array<{
    artifactId: string;
    versionNumber: number;
    isOriginal: boolean;
  }>;
}> {
  if (params.artifactIds.length === 0) {
    throw new Error("At least one artifact ID is required");
  }

  const familyId = params.existingFamilyId ?? generateDocumentFamilyId();
  
  const rows = await db
    .select()
    .from(artifacts)
    .where(inArray(artifacts.id, params.artifactIds))
    .orderBy(asc(artifacts.createdAt));

  if (rows.length === 0) {
    throw new Error("No artifacts found for the provided IDs");
  }

  let nextVersion = 1;
  if (params.existingFamilyId) {
    nextVersion = await getNextVersionNumber(params.existingFamilyId);
  }

  const linkedArtifacts: Array<{
    artifactId: string;
    versionNumber: number;
    isOriginal: boolean;
  }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const isOriginal = i === 0 && nextVersion === 1;
    const versionNumber = nextVersion + i;

    await assignDocumentFamilyId({
      artifactId: row.id,
      familyId,
      versionNumber,
      isOriginal,
    });

    linkedArtifacts.push({
      artifactId: row.id,
      versionNumber,
      isOriginal,
    });
  }

  console.info("[DOCUMENT_VERSIONING] Linked artifacts as versions", {
    familyId,
    artifactCount: linkedArtifacts.length,
    originalArtifactId: linkedArtifacts.find((a) => a.isOriginal)?.artifactId,
  });

  return {
    familyId,
    linkedArtifacts,
  };
}

/**
 * Finds an existing artifact by name and returns its family ID if it has one
 */
export async function findExistingDocumentFamily(params: {
  userId: string;
  name: string;
}): Promise<{
  artifact: Artifact | null;
  familyId: string | null;
}> {
  const [row] = await db
    .select()
    .from(artifacts)
    .where(
      and(
        eq(artifacts.userId, params.userId),
        eq(artifacts.name, params.name),
      ),
    )
    .limit(1);

  if (!row) {
    return {
      artifact: null,
      familyId: null,
    };
  }

  const artifact = mapArtifact(row);
  const metadata = parseWorkingDocumentMetadata(artifact.metadata);
  
  return {
    artifact,
    familyId: metadata.documentFamilyId ?? null,
  };
}

/**
 * Creates version linking for a duplicate document upload
 * 
 * This should be called when auto-rename detects a duplicate.
 * It links the new artifact with the existing one as versions.
 */
export async function linkDuplicateDocument(params: {
  userId: string;
  originalArtifactId: string;
  duplicateArtifactId: string;
}): Promise<{
  familyId: string;
  originalVersionNumber: number;
  duplicateVersionNumber: number;
}> {
  const [originalRow] = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.id, params.originalArtifactId))
    .limit(1);

  if (!originalRow) {
    throw new Error(`Original artifact ${params.originalArtifactId} not found`);
  }

  const originalArtifact = mapArtifact(originalRow);
  const originalMetadata = parseWorkingDocumentMetadata(
    originalArtifact.metadata,
  );

  let familyId = originalMetadata.documentFamilyId;
  let originalVersionNumber = originalMetadata.versionNumber ?? 1;

  if (!familyId) {
    familyId = generateDocumentFamilyId();
    
    await assignDocumentFamilyId({
      artifactId: params.originalArtifactId,
      familyId,
      versionNumber: 1,
      isOriginal: true,
    });

    originalVersionNumber = 1;
  }

  const duplicateVersionNumber = await getNextVersionNumber(familyId);

  await assignDocumentFamilyId({
    artifactId: params.duplicateArtifactId,
    familyId,
    versionNumber: duplicateVersionNumber,
    isOriginal: false,
  });

  console.info("[DOCUMENT_VERSIONING] Linked duplicate document", {
    familyId,
    originalArtifactId: params.originalArtifactId,
    duplicateArtifactId: params.duplicateArtifactId,
    originalVersionNumber,
    duplicateVersionNumber,
  });

  return {
    familyId,
    originalVersionNumber,
    duplicateVersionNumber,
  };
}
