// Shared TypeScript types and interfaces used across client and server

export type UserRole = 'user' | 'admin';

export type Theme = 'system' | 'light' | 'dark';

export type ModelId = 'model1' | 'model2';

export interface UserPreferences {
  preferredModel: ModelId;
  translationEnabled: boolean;
  theme: Theme;
  avatarId: number | null;
}

export interface UserSettings {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  preferences: UserPreferences;
  profilePicture: string | null;
}

// User interface: id, email, displayName
export interface User {
  id: string;
  email: string;
  displayName: string;
}

// SessionUser interface: id, email, displayName (for event.locals)
export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  avatarId: number | null;
  profilePicture: string | null;
  translationEnabled: boolean;
}

// Project interface: a named folder grouping conversations
export interface Project {
  id: string;
  name: string;
  color?: string | null;
  sortOrder: number;
  createdAt: number; // Unix timestamp
  updatedAt: number; // Unix timestamp
}

// Conversation interface: id (Langflow session_id), title, createdAt, updatedAt (Unix timestamps)
export interface Conversation {
  id: string; // Langflow session_id
  title: string;
  projectId?: string | null;
  createdAt: number; // Unix timestamp
  updatedAt: number; // Unix timestamp
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: ChatMessage[];
  attachedArtifacts?: ArtifactSummary[];
  activeWorkingSet?: ArtifactSummary[];
  contextStatus?: ConversationContextStatus | null;
  taskState?: TaskState | null;
  contextDebug?: ContextDebugState | null;
}

// ConversationListItem interface: id, title, updatedAt
export interface ConversationListItem {
  id: string;
  title: string;
  updatedAt: number; // Unix timestamp
  projectId?: string | null;
}

// MessageRole type: 'user' | 'assistant'
export type MessageRole = 'user' | 'assistant';

export interface ToolCallEntry {
  name: string;
  input: Record<string, unknown>;
  status: 'running' | 'done';
}

export type ThinkingSegment =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; name: string; input: Record<string, unknown>; status: 'running' | 'done' };

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  attachments?: ChatAttachment[];
  isStreaming?: boolean;
  thinking?: string;
  isThinkingStreaming?: boolean;
  thinkingTokenCount?: number;
  responseTokenCount?: number;
  totalTokenCount?: number;
  // Interleaved thinking text + tool call segments, built during streaming.
  // Not persisted to DB — falls back to flat `thinking` string on page reload.
  thinkingSegments?: ThinkingSegment[];
  // Display name of the model used for the response (assistant messages only)
  modelDisplayName?: string;
}

export type ArtifactType =
  | 'source_document'
  | 'normalized_document'
  | 'generated_output'
  | 'work_capsule';

export type ArtifactLinkType =
  | 'attached_to_conversation'
  | 'derived_from'
  | 'used_in_output'
  | 'supersedes'
  | 'captured_by_capsule';

export type MemoryLayer = 'session' | 'capsule' | 'documents' | 'outputs' | 'working_set' | 'task_state';

export type TaskStateStatus = 'active' | 'candidate' | 'revived' | 'archived';

export type CompactionMode = 'none' | 'deterministic' | 'llm_fallback';
export type RoutingStage = 'deterministic' | 'task_router' | 'evidence_rerank' | 'verification_fallback';
export type VerificationStatus = 'skipped' | 'passed' | 'failed' | 'fallback';
export type TaskEvidenceRole = 'selected' | 'pinned' | 'excluded' | 'checkpoint_source';
export type TaskEvidenceOrigin = 'system' | 'user';
export type TaskCheckpointType = 'micro' | 'stable';

export type WorkingSetState = 'active' | 'cooling';

export type WorkingSetReasonCode =
  | 'attached_this_turn'
  | 'recently_used_in_output'
  | 'latest_generated_output'
  | 'matched_current_turn'
  | 'persisted_from_previous_turn'
  | 'linked_from_work_capsule';

export interface ChatAttachment {
  id: string;
  artifactId: string;
  name: string;
  type: ArtifactType;
  mimeType: string | null;
  sizeBytes: number | null;
  conversationId: string | null;
  messageId?: string | null;
  createdAt: number;
}

export interface ArtifactSummary {
  id: string;
  type: ArtifactType;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  conversationId: string | null;
  summary: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Artifact extends ArtifactSummary {
  userId: string;
  extension: string | null;
  storagePath: string | null;
  contentText: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ArtifactChunk {
  id: string;
  artifactId: string;
  userId: string;
  conversationId: string | null;
  chunkIndex: number;
  contentText: string;
  tokenEstimate: number;
  createdAt: number;
  updatedAt: number;
}

export interface TaskEvidenceLink {
  id: string;
  taskId: string;
  userId: string;
  conversationId: string;
  artifactId: string;
  chunkIndex: number | null;
  role: TaskEvidenceRole;
  origin: TaskEvidenceOrigin;
  confidence: number;
  reason: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TaskCheckpoint {
  id: string;
  taskId: string;
  userId: string;
  conversationId: string;
  checkpointType: TaskCheckpointType;
  content: string;
  sourceTurnRange: string | null;
  sourceEvidenceIds: string[];
  verificationStatus: VerificationStatus;
  createdAt: number;
  updatedAt: number;
}

export interface ArtifactLink {
  id: string;
  userId: string;
  artifactId: string;
  relatedArtifactId: string | null;
  conversationId: string | null;
  messageId: string | null;
  linkType: ArtifactLinkType;
  createdAt: number;
}

export interface WorkCapsule {
  artifact: ArtifactSummary;
  conversationId: string | null;
  taskSummary: string | null;
  workflowSummary: string | null;
  keyConclusions: string[];
  reusablePatterns: string[];
  sourceArtifactIds: string[];
  outputArtifactIds: string[];
}

export interface ConversationWorkingSetItem {
  id: string;
  userId: string;
  conversationId: string;
  artifactId: string;
  artifactType: Exclude<ArtifactType, 'work_capsule'>;
  score: number;
  state: WorkingSetState;
  reasonCodes: WorkingSetReasonCode[];
  lastActivatedAt: number | null;
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ConversationContextStatus {
  conversationId: string;
  userId: string;
  estimatedTokens: number;
  maxContextTokens: number;
  thresholdTokens: number;
  targetTokens: number;
  compactionApplied: boolean;
  compactionMode: CompactionMode;
  routingStage: RoutingStage;
  routingConfidence: number;
  verificationStatus: VerificationStatus;
  layersUsed: MemoryLayer[];
  workingSetCount: number;
  workingSetArtifactIds: string[];
  workingSetApplied: boolean;
  taskStateApplied: boolean;
  promptArtifactCount: number;
  recentTurnCount: number;
  summary: string | null;
  updatedAt: number;
}

export interface TaskState {
  taskId: string;
  userId: string;
  conversationId: string;
  status: TaskStateStatus;
  objective: string;
  confidence: number;
  locked: boolean;
  lastConfirmedTurnMessageId: string | null;
  constraints: string[];
  factsToPreserve: string[];
  decisions: string[];
  openQuestions: string[];
  activeArtifactIds: string[];
  nextSteps: string[];
  lastCheckpointAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ContextDebugEvidenceItem {
  artifactId: string;
  name: string;
  role: TaskEvidenceRole;
  origin: TaskEvidenceOrigin;
  confidence: number;
  reason: string | null;
}

export interface ContextDebugState {
  activeTaskId: string | null;
  activeTaskObjective: string | null;
  taskLocked: boolean;
  routingStage: RoutingStage;
  routingConfidence: number;
  verificationStatus: VerificationStatus;
  selectedEvidence: ContextDebugEvidenceItem[];
  pinnedEvidence: ContextDebugEvidenceItem[];
  excludedEvidence: ContextDebugEvidenceItem[];
}

export type TaskSteeringAction =
  | 'lock_task'
  | 'unlock_task'
  | 'start_new_task'
  | 'pin_artifact'
  | 'unpin_artifact'
  | 'exclude_artifact'
  | 'include_artifact';

// Langflow types
export interface LangflowMessage {
  text: string;
}

export interface LangflowRunRequest {
  input_value: string;
  input_type: string;
  output_type: string;
  session_id?: string;
  background_color?: string;
  background_icon?: string;
}

export interface LangflowRunResponse {
  outputs: Array<{
    outputs: Array<{
      results: {
        message?: LangflowMessage;
        [key: string]: any;
      };
      [key: string]: any;
    }>;
    [key: string]: any;
  }>;
}

// Webhook types
export interface WebhookSentencePayload {
  session_id: string;
  sentence?: string;
  index: number;
  is_final: boolean;
}
