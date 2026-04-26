import { randomUUID } from 'crypto';
import { and, asc, eq, like } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { artifacts } from '$lib/server/db/schema';
import type { Artifact } from '$lib/types';
import { mapArtifact } from './core';
import { parseWorkingDocumentMetadata } from './document-metadata';
import { parseJsonRecord } from '$lib/server/utils/json';

export function generateDocumentFamilyId(): string {
  return randomUUID();
}

export async function getDocumentVersions(
  familyId: string,
): Promise<Artifact[]> {
  const rows = await db
    .select()
    .from(artifacts)
    .where(like(artifacts.metadataJson, `%${familyId}%`))
    .orderBy(asc(artifacts.createdAt));

  const versions = rows.filter((row) => {
    const metadata = parseWorkingDocumentMetadata(
      parseJsonRecord(row.metadataJson),
    );
    return metadata.documentFamilyId === familyId;
  });

  return versions.map(mapArtifact);
}

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

export async function linkDuplicateDocument(params: {
  userId: string;
  originalArtifactId: string;
  duplicateArtifactId: string;
}): Promise<{
  familyId: string;
  originalSupersedesArtifactId: string | null;
  duplicateSupersedesArtifactId: string;
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

  if (!familyId) {
    familyId = generateDocumentFamilyId();

    const existingMetadata = parseJsonRecord(originalRow.metadataJson) ?? {};
    await db
      .update(artifacts)
      .set({
        metadataJson: JSON.stringify({
          ...existingMetadata,
          documentFamilyId: familyId,
        }),
        updatedAt: new Date(),
      })
      .where(eq(artifacts.id, params.originalArtifactId));
  }

  await db
    .update(artifacts)
    .set({
      metadataJson: JSON.stringify({
        documentFamilyId: familyId,
        supersedesArtifactId: params.originalArtifactId,
      }),
      updatedAt: new Date(),
    })
    .where(eq(artifacts.id, params.duplicateArtifactId));

  return {
    familyId,
    originalSupersedesArtifactId: originalMetadata.supersedesArtifactId ?? null,
    duplicateSupersedesArtifactId: params.originalArtifactId,
  };
}