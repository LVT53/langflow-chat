import { randomUUID } from 'crypto';
import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { inferenceProviders } from '../db/schema';
import { config } from '../env';
import { buildOpenAICompatibleUrl } from './openai-compatible-url';

export type ProviderReasoningEffort = 'low' | 'medium' | 'high';
export type ProviderThinkingType = 'enabled' | 'disabled';

export interface InferenceProvider {
  id: string;
  name: string;
  displayName: string;
  baseUrl: string;
  modelName: string;
  reasoningEffort: ProviderReasoningEffort | null;
  thinkingType: ProviderThinkingType | null;
  enabled: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InferenceProviderWithSecrets extends InferenceProvider {
  apiKeyEncrypted: string;
  apiKeyIv: string;
}

export interface CreateProviderInput {
  name: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  modelName: string;
  reasoningEffort?: ProviderReasoningEffort | null;
  thinkingType?: ProviderThinkingType | null;
  enabled?: boolean;
  sortOrder?: number;
}

export interface UpdateProviderInput {
  displayName?: string;
  baseUrl?: string;
  apiKey?: string;
  modelName?: string;
  reasoningEffort?: ProviderReasoningEffort | null;
  thinkingType?: ProviderThinkingType | null;
  enabled?: boolean;
  sortOrder?: number;
}

export function normalizeReasoningEffort(value: unknown): ProviderReasoningEffort | null {
  return value === 'low' || value === 'medium' || value === 'high' ? value : null;
}

export function normalizeThinkingType(value: unknown): ProviderThinkingType | null {
  return value === 'enabled' || value === 'disabled' ? value : null;
}

function deriveEncryptionKey(secret: string): Buffer {
  return pbkdf2Sync(secret, 'alfaai-inference-providers', 100000, 32, 'sha256');
}

export function encryptApiKey(plaintext: string): { encrypted: string; iv: string } {
  const sessionSecret = config.sessionSecret;
  const key = deriveEncryptionKey(sessionSecret);
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encrypted: Buffer.concat([encrypted, authTag]).toString('base64'),
    iv: iv.toString('base64'),
  };
}

export function decryptApiKey(encrypted: string, iv: string): string {
  const sessionSecret = config.sessionSecret;
  const key = deriveEncryptionKey(sessionSecret);
  const ivBuffer = Buffer.from(iv, 'base64');
  const encryptedBuffer = Buffer.from(encrypted, 'base64');
  const authTag = encryptedBuffer.slice(-16);
  const ciphertext = encryptedBuffer.slice(0, -16);
  const decipher = createDecipheriv('aes-256-gcm', key, ivBuffer);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}

export async function createProvider(input: CreateProviderInput): Promise<InferenceProvider> {
  const { encrypted, iv } = encryptApiKey(input.apiKey);
  const now = new Date();

  const [provider] = await db
    .insert(inferenceProviders)
    .values({
      id: randomUUID(),
      name: input.name,
      displayName: input.displayName,
      baseUrl: input.baseUrl,
      apiKeyEncrypted: encrypted,
      apiKeyIv: iv,
      modelName: input.modelName,
      reasoningEffort: input.reasoningEffort ?? null,
      thinkingType: input.thinkingType ?? null,
      enabled: input.enabled ?? true,
      sortOrder: input.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return mapRowToProvider(provider);
}

export async function getProvider(id: string): Promise<InferenceProvider | null> {
  const [provider] = await db
    .select()
    .from(inferenceProviders)
    .where(eq(inferenceProviders.id, id));

  return provider ? mapRowToProvider(provider) : null;
}

export async function getProviderWithSecrets(id: string): Promise<InferenceProviderWithSecrets | null> {
  const [provider] = await db
    .select()
    .from(inferenceProviders)
    .where(eq(inferenceProviders.id, id));

  return provider ? mapRowToProviderWithSecrets(provider) : null;
}

export async function getProviderByName(name: string): Promise<InferenceProvider | null> {
  const [provider] = await db
    .select()
    .from(inferenceProviders)
    .where(eq(inferenceProviders.name, name));

  return provider ? mapRowToProvider(provider) : null;
}

export async function listProviders(): Promise<InferenceProvider[]> {
  const providers = await db
    .select()
    .from(inferenceProviders)
    .orderBy(inferenceProviders.sortOrder);

  return providers.map(mapRowToProvider);
}

export async function listEnabledProviders(): Promise<InferenceProvider[]> {
  const providers = await db
    .select()
    .from(inferenceProviders)
    .where(eq(inferenceProviders.enabled, true))
    .orderBy(inferenceProviders.sortOrder);

  return providers.map(mapRowToProvider);
}

export async function updateProvider(
  id: string,
  input: UpdateProviderInput
): Promise<InferenceProvider | null> {
  const existing = await db
    .select()
    .from(inferenceProviders)
    .where(eq(inferenceProviders.id, id));

  if (!existing[0]) {
    return null;
  }

  const updates: Partial<typeof inferenceProviders.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.displayName !== undefined) {
    updates.displayName = input.displayName;
  }
  if (input.baseUrl !== undefined) {
    updates.baseUrl = input.baseUrl;
  }
  if (input.modelName !== undefined) {
    updates.modelName = input.modelName;
  }
  if (input.reasoningEffort !== undefined) {
    updates.reasoningEffort = input.reasoningEffort;
  }
  if (input.thinkingType !== undefined) {
    updates.thinkingType = input.thinkingType;
  }
  if (input.enabled !== undefined) {
    updates.enabled = input.enabled;
  }
  if (input.sortOrder !== undefined) {
    updates.sortOrder = input.sortOrder;
  }
  if (input.apiKey !== undefined) {
    const { encrypted, iv } = encryptApiKey(input.apiKey);
    updates.apiKeyEncrypted = encrypted;
    updates.apiKeyIv = iv;
  }

  const [updated] = await db
    .update(inferenceProviders)
    .set(updates)
    .where(eq(inferenceProviders.id, id))
    .returning();

  return updated ? mapRowToProvider(updated) : null;
}

export async function deleteProvider(id: string): Promise<boolean> {
  const result = await db
    .delete(inferenceProviders)
    .where(eq(inferenceProviders.id, id));

  return result.changes > 0;
}

export async function validateProviderConnection(
  baseUrl: string,
  apiKey: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const url = new URL(baseUrl);
    if (!url.protocol.startsWith('http')) {
      return { valid: false, error: 'Base URL must use HTTP or HTTPS protocol' };
    }

    const modelsUrl = buildOpenAICompatibleUrl(baseUrl, '/v1/models');
    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { valid: false, error: 'Invalid API key' };
      }
      return { valid: false, error: `Server returned ${response.status}` };
    }

    return { valid: true };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'TimeoutError') {
        return { valid: false, error: 'Connection timeout' };
      }
      return { valid: false, error: error.message };
    }
    return { valid: false, error: 'Unknown error' };
  }
}

function mapRowToProvider(row: typeof inferenceProviders.$inferSelect): InferenceProvider {
  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    baseUrl: row.baseUrl,
    modelName: row.modelName,
    reasoningEffort: normalizeReasoningEffort(row.reasoningEffort),
    thinkingType: normalizeThinkingType(row.thinkingType),
    enabled: row.enabled ?? true,
    sortOrder: row.sortOrder ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRowToProviderWithSecrets(
  row: typeof inferenceProviders.$inferSelect
): InferenceProviderWithSecrets {
  return {
    ...mapRowToProvider(row),
    apiKeyEncrypted: row.apiKeyEncrypted,
    apiKeyIv: row.apiKeyIv,
  };
}
