import { beforeEach, describe, expect, it, vi } from 'vitest';

type EmbeddingRow = {
  id: string;
  userId: string;
  subjectType: string;
  subjectId: string;
  modelName: string;
  sourceTextHash: string;
  dimensions: number;
  embeddingJson: string;
  createdAt: Date;
  updatedAt: Date;
};

const { rows } = vi.hoisted(() => ({
  rows: [] as EmbeddingRow[],
}));

vi.mock('$lib/server/db', () => ({
  db: {
    insert: () => ({
      values: (value: EmbeddingRow) => ({
        onConflictDoUpdate: vi.fn(async () => {
          const existingIndex = rows.findIndex(
            (row) =>
              row.userId === value.userId &&
              row.subjectType === value.subjectType &&
              row.subjectId === value.subjectId &&
              row.modelName === value.modelName
          );

          if (existingIndex >= 0) {
            rows[existingIndex] = {
              ...rows[existingIndex],
              sourceTextHash: value.sourceTextHash,
              dimensions: value.dimensions,
              embeddingJson: value.embeddingJson,
              updatedAt: value.updatedAt,
            };
            return;
          }

          rows.push(value);
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => {
            const ordered = rows
              .slice()
              .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
            return {
              limit: async (count?: number) => ordered.slice(0, count ?? ordered.length),
              then: (onFulfilled: (value: EmbeddingRow[]) => unknown) =>
                Promise.resolve(onFulfilled(ordered)),
            } as PromiseLike<EmbeddingRow[]> & {
              limit: (count?: number) => Promise<EmbeddingRow[]>;
            };
          },
          then: undefined,
        }),
      }),
    }),
  },
}));

vi.mock('$lib/server/db/schema', () => ({
  semanticEmbeddings: {
    userId: { name: 'userId' },
    subjectType: { name: 'subjectType' },
    subjectId: { name: 'subjectId' },
    modelName: { name: 'modelName' },
    updatedAt: { name: 'updatedAt' },
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  desc: vi.fn(() => 'desc'),
  eq: vi.fn((field: { name: string }, value: string) => ({ field: field.name, value })),
  inArray: vi.fn((field: { name: string }, value: string[]) => ({ field: field.name, value })),
}));

describe('semantic-embeddings service', () => {
  beforeEach(() => {
    rows.splice(0, rows.length);
  });

  it('upserts a semantic embedding by subject identity', async () => {
    const { upsertSemanticEmbedding, getSemanticEmbedding } = await import('./semantic-embeddings');

    await upsertSemanticEmbedding({
      userId: 'user-1',
      subjectType: 'artifact',
      subjectId: 'artifact-1',
      modelName: 'bge-m3',
      sourceText: 'Original body',
      embedding: [0.1, 0.2],
    });
    await upsertSemanticEmbedding({
      userId: 'user-1',
      subjectType: 'artifact',
      subjectId: 'artifact-1',
      modelName: 'bge-m3',
      sourceText: 'Updated body',
      embedding: [0.5, 0.6, Number.NaN],
    });

    expect(rows).toHaveLength(1);
    const stored = await getSemanticEmbedding({
      userId: 'user-1',
      subjectType: 'artifact',
      subjectId: 'artifact-1',
      modelName: 'bge-m3',
    });

    expect(stored).toMatchObject({
      userId: 'user-1',
      subjectType: 'artifact',
      subjectId: 'artifact-1',
      modelName: 'bge-m3',
      dimensions: 2,
      embedding: [0.5, 0.6],
    });
  });

  it('returns the latest embedding per subject when listing a subject set', async () => {
    const { upsertSemanticEmbedding, listSemanticEmbeddingsBySubject } = await import(
      './semantic-embeddings'
    );

    await upsertSemanticEmbedding({
      userId: 'user-1',
      subjectType: 'persona_cluster',
      subjectId: 'cluster-a',
      modelName: 'bge-m3',
      sourceText: 'alpha',
      embedding: [0.1],
    });
    await upsertSemanticEmbedding({
      userId: 'user-1',
      subjectType: 'persona_cluster',
      subjectId: 'cluster-b',
      modelName: 'bge-m3',
      sourceText: 'beta',
      embedding: [0.2],
    });

    const mapped = await listSemanticEmbeddingsBySubject({
      userId: 'user-1',
      subjectType: 'persona_cluster',
      subjectIds: ['cluster-a', 'cluster-b'],
      modelName: 'bge-m3',
    });

    expect(Array.from(mapped.keys())).toEqual(expect.arrayContaining(['cluster-a', 'cluster-b']));
    expect(mapped.get('cluster-a')?.embedding).toEqual([0.1]);
    expect(mapped.get('cluster-b')?.embedding).toEqual([0.2]);
  });

  it('detects when a stored embedding should be refreshed', async () => {
    const { hashEmbeddingSourceText, needsSemanticEmbeddingRefresh } = await import(
      './semantic-embeddings'
    );

    const hash = hashEmbeddingSourceText('same text');
    expect(
      needsSemanticEmbeddingRefresh({
        current: { sourceTextHash: hash, dimensions: 2 },
        sourceText: 'same text',
        embedding: [0.1, 0.2],
      })
    ).toBe(false);
    expect(
      needsSemanticEmbeddingRefresh({
        current: { sourceTextHash: hash, dimensions: 2 },
        sourceText: 'different text',
        embedding: [0.1, 0.2],
      })
    ).toBe(true);
  });
});
