// Shared TypeScript types and interfaces used across client and server

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
}

// Conversation interface: id (Langflow session_id), title, createdAt, updatedAt (Unix timestamps)
export interface Conversation {
  id: string; // Langflow session_id
  title: string;
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
}

// MessageRole type: 'user' | 'assistant'
export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  thinking?: string;
  isThinkingStreaming?: boolean;
  tokenCount?: number;
  generationSpeed?: number;
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
