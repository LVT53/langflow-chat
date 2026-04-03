import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  role: text('role').notNull().default('user'),
  preferredModel: text('preferred_model').notNull().default('model1'),
  translationEnabled: integer('translation_enabled').notNull().default(0),
  theme: text('theme').notNull().default('system'),
  avatarId: integer('avatar_id'),
  profilePicture: text('profile_picture'),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  projectId: text('project_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  thinking: text('thinking'),
  toolCalls: text('tool_calls'),
  metadataJson: text('metadata_json'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const knowledgeVaults = sqliteTable('knowledge_vaults', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  userIdx: index('knowledge_vaults_user_idx').on(table.userId, table.sortOrder),
}));

export const artifacts = sqliteTable('artifacts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  conversationId: text('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  vaultId: text('vault_id').references(() => knowledgeVaults.id, { onDelete: 'set null' }),
  type: text('type').notNull(),
  retrievalClass: text('retrieval_class').notNull().default('durable'),
  name: text('name').notNull(),
  mimeType: text('mime_type'),
  extension: text('extension'),
  sizeBytes: integer('size_bytes'),
  binaryHash: text('binary_hash'),
  storagePath: text('storage_path'),
  contentText: text('content_text'),
  summary: text('summary'),
  metadataJson: text('metadata_json'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  userBinaryHashIdx: index('artifacts_user_binary_hash_idx').on(table.userId, table.binaryHash),
  userSizeIdx: index('artifacts_user_size_idx').on(table.userId, table.sizeBytes),
  vaultIdx: index('artifacts_vault_idx').on(table.vaultId),
}));

export const artifactChunks = sqliteTable('artifact_chunks', {
  id: text('id').primaryKey(),
  artifactId: text('artifact_id')
    .notNull()
    .references(() => artifacts.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  conversationId: text('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  contentText: text('content_text').notNull(),
  tokenEstimate: integer('token_estimate').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  artifactIdx: index('artifact_chunks_artifact_idx').on(table.artifactId, table.chunkIndex),
  userConversationIdx: index('artifact_chunks_user_conversation_idx').on(
    table.userId,
    table.conversationId
  ),
}));

export const artifactLinks = sqliteTable('artifact_links', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  artifactId: text('artifact_id')
    .notNull()
    .references(() => artifacts.id, { onDelete: 'cascade' }),
  relatedArtifactId: text('related_artifact_id').references(() => artifacts.id, { onDelete: 'cascade' }),
  conversationId: text('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
  messageId: text('message_id').references(() => messages.id, { onDelete: 'cascade' }),
  linkType: text('link_type').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const conversationContextStatus = sqliteTable('conversation_context_status', {
  conversationId: text('conversation_id')
    .primaryKey()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  estimatedTokens: integer('estimated_tokens').notNull().default(0),
  maxContextTokens: integer('max_context_tokens').notNull().default(262144),
  thresholdTokens: integer('threshold_tokens').notNull().default(209715),
  targetTokens: integer('target_tokens').notNull().default(157286),
  compactionApplied: integer('compaction_applied').notNull().default(0),
  compactionMode: text('compaction_mode').notNull().default('none'),
  routingStage: text('routing_stage').notNull().default('deterministic'),
  routingConfidence: integer('routing_confidence').notNull().default(0),
  verificationStatus: text('verification_status').notNull().default('skipped'),
  layersUsedJson: text('layers_used_json'),
  workingSetCount: integer('working_set_count').notNull().default(0),
  workingSetArtifactIdsJson: text('working_set_artifact_ids_json'),
  workingSetApplied: integer('working_set_applied').notNull().default(0),
  taskStateApplied: integer('task_state_applied').notNull().default(0),
  promptArtifactCount: integer('prompt_artifact_count').notNull().default(0),
  recentTurnCount: integer('recent_turn_count').notNull().default(0),
  summary: text('summary'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const conversationTaskStates = sqliteTable('conversation_task_states', {
  taskId: text('task_id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('active'),
  objective: text('objective').notNull(),
  confidence: integer('confidence').notNull().default(0),
  locked: integer('locked').notNull().default(0),
  lastConfirmedTurnMessageId: text('last_confirmed_turn_message_id'),
  constraintsJson: text('constraints_json'),
  factsToPreserveJson: text('facts_to_preserve_json'),
  decisionsJson: text('decisions_json'),
  openQuestionsJson: text('open_questions_json'),
  activeArtifactIdsJson: text('active_artifact_ids_json'),
  nextStepsJson: text('next_steps_json'),
  lastCheckpointAt: integer('last_checkpoint_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  conversationIdx: index('conversation_task_states_conversation_idx').on(
    table.conversationId,
    table.updatedAt
  ),
}));

export const taskStateEvidenceLinks = sqliteTable('task_state_evidence_links', {
  id: text('id').primaryKey(),
  taskId: text('task_id')
    .notNull()
    .references(() => conversationTaskStates.taskId, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  artifactId: text('artifact_id')
    .notNull()
    .references(() => artifacts.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index'),
  role: text('role').notNull(),
  origin: text('origin').notNull().default('system'),
  confidence: integer('confidence').notNull().default(0),
  reason: text('reason'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  taskIdx: index('task_state_evidence_links_task_idx').on(
    table.taskId,
    table.role,
    table.updatedAt
  ),
}));

export const taskCheckpoints = sqliteTable('task_checkpoints', {
  id: text('id').primaryKey(),
  taskId: text('task_id')
    .notNull()
    .references(() => conversationTaskStates.taskId, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  checkpointType: text('checkpoint_type').notNull(),
  content: text('content').notNull(),
  sourceTurnRange: text('source_turn_range'),
  sourceEvidenceIdsJson: text('source_evidence_ids_json'),
  verificationStatus: text('verification_status').notNull().default('skipped'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  taskIdx: index('task_checkpoints_task_idx').on(
    table.taskId,
    table.checkpointType,
    table.updatedAt
  ),
}));

export const conversationWorkingSetItems = sqliteTable('conversation_working_set_items', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  artifactId: text('artifact_id')
    .notNull()
    .references(() => artifacts.id, { onDelete: 'cascade' }),
  artifactType: text('artifact_type').notNull(),
  score: integer('score').notNull().default(0),
  state: text('state').notNull().default('cooling'),
  reasonCodesJson: text('reason_codes_json'),
  lastActivatedAt: integer('last_activated_at', { mode: 'timestamp' }),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const memoryProjects = sqliteTable('memory_projects', {
  projectId: text('project_id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  summary: text('summary'),
  status: text('status').notNull().default('active'),
  lastActiveAt: integer('last_active_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  userStatusIdx: index('memory_projects_user_status_idx').on(
    table.userId,
    table.status,
    table.updatedAt
  ),
}));

export const memoryProjectTaskLinks = sqliteTable('memory_project_task_links', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => memoryProjects.projectId, { onDelete: 'cascade' }),
  taskId: text('task_id')
    .notNull()
    .references(() => conversationTaskStates.taskId, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  taskIdx: uniqueIndex('memory_project_task_links_task_idx').on(table.taskId),
  projectIdx: index('memory_project_task_links_project_idx').on(
    table.projectId,
    table.updatedAt
  ),
}));

export const personaMemoryAttributions = sqliteTable('persona_memory_attributions', {
  id: text('id').primaryKey(),
  conclusionId: text('conclusion_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  scope: text('scope').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  conclusionConversationIdx: uniqueIndex(
    'persona_memory_attributions_conclusion_conversation_idx'
  ).on(table.conclusionId, table.conversationId),
  conversationIdx: index('persona_memory_attributions_conversation_idx').on(
    table.conversationId,
    table.updatedAt
  ),
}));

export const personaMemoryClusters = sqliteTable('persona_memory_clusters', {
  clusterId: text('cluster_id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  canonicalText: text('canonical_text').notNull(),
  memoryClass: text('memory_class').notNull(),
  state: text('state').notNull().default('active'),
  salienceScore: integer('salience_score').notNull().default(0),
  sourceCount: integer('source_count').notNull().default(0),
  firstSeenAt: integer('first_seen_at', { mode: 'timestamp' }),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
  lastDreamedAt: integer('last_dreamed_at', { mode: 'timestamp' }),
  decayAt: integer('decay_at', { mode: 'timestamp' }),
  archiveAt: integer('archive_at', { mode: 'timestamp' }),
  pinned: integer('pinned').notNull().default(0),
  metadataJson: text('metadata_json'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  userStateIdx: index('persona_memory_clusters_user_state_idx').on(
    table.userId,
    table.state,
    table.updatedAt
  ),
}));

export const personaMemoryOverviews = sqliteTable('persona_memory_overviews', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  overviewText: text('overview_text').notNull(),
  sourceFingerprint: text('source_fingerprint').notNull(),
  generatedAt: integer('generated_at', { mode: 'timestamp' }).notNull(),
  lastAttemptAt: integer('last_attempt_at', { mode: 'timestamp' }),
  lastFailureAt: integer('last_failure_at', { mode: 'timestamp' }),
  lastError: text('last_error'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const personaMemoryClusterMembers = sqliteTable('persona_memory_cluster_members', {
  id: text('id').primaryKey(),
  clusterId: text('cluster_id')
    .notNull()
    .references(() => personaMemoryClusters.clusterId, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  conclusionId: text('conclusion_id').notNull(),
  content: text('content').notNull(),
  scope: text('scope').notNull(),
  sessionId: text('session_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  conclusionIdx: uniqueIndex('persona_memory_cluster_members_conclusion_idx').on(
    table.userId,
    table.conclusionId
  ),
  clusterIdx: index('persona_memory_cluster_members_cluster_idx').on(
    table.clusterId,
    table.createdAt
  ),
}));

export const conversationDrafts = sqliteTable('conversation_drafts', {
  conversationId: text('conversation_id')
    .primaryKey()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  draftText: text('draft_text').notNull().default(''),
  selectedAttachmentIdsJson: text('selected_attachment_ids_json'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  userUpdatedIdx: index('conversation_drafts_user_updated_idx').on(table.userId, table.updatedAt),
}));

export const adminConfig = sqliteTable('admin_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedBy: text('updated_by').notNull(),
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const messageAnalytics = sqliteTable('message_analytics', {
	id: text('id').primaryKey(),
	messageId: text('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	model: text('model').notNull(),
	promptTokens: integer('prompt_tokens'),
	completionTokens: integer('completion_tokens'),
	reasoningTokens: integer('reasoning_tokens'),
	generationTimeMs: integer('generation_time_ms'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const chatGeneratedFiles = sqliteTable('chat_generated_files', {
	id: text('id').primaryKey(),
	conversationId: text('conversation_id')
		.notNull()
		.references(() => conversations.id, { onDelete: 'cascade' }),
	assistantMessageId: text('assistant_message_id')
		.references(() => messages.id, { onDelete: 'cascade' }),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	filename: text('filename').notNull(),
	mimeType: text('mime_type'),
	sizeBytes: integer('size_bytes').notNull().default(0),
	storagePath: text('storage_path').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
	assistantMessageIdx: index('chat_generated_files_assistant_message_idx').on(table.assistantMessageId, table.createdAt),
	conversationIdx: index('chat_generated_files_conversation_idx').on(table.conversationId, table.createdAt),
	userIdx: index('chat_generated_files_user_idx').on(table.userId, table.createdAt),
}));
