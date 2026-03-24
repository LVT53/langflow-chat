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
