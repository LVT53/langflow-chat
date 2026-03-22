# Project Overview: AlfyAI Chat Interface

## Introduction

This project is a **modern AI chat application** built with SvelteKit that provides a beautiful, warm, and focused interface for interacting with AI language models through Langflow. The design philosophy follows Anthropic's Claude interface principles: **warm minimalism** — calm, focused, and uncluttered.

---

## What This Project Is

**AlfyAI** is a full-stack chat application that acts as a frontend interface for Langflow AI workflows. It enables users to:

- Engage in natural conversations with AI
- View streaming responses in real-time
- Manage multiple conversations with persistent history
- Switch between light and dark themes
- Experience a reading-focused, distraction-free UI

---

## Core Capabilities

### 1. **AI-Powered Conversations**
- **Streaming Responses**: Real-time token-by-token streaming for natural-feeling AI responses
- **Thinking Block Support**: AI reasoning/thought process displayed separately from final responses
- **Session Management**: Each conversation maintains context through Langflow session IDs
- **Webhook Integration**: Receives streaming content via webhooks for efficient delivery

### 2. **Conversation Management**
- **Persistent History**: All conversations stored in SQLite database with full message history
- **Smart Titles**: AI-generated conversation titles using Nemotron Nano (summarizes first exchange)
- **List View**: Sidebar displays all conversations sorted by most recent activity
- **Quick Navigation**: Jump between conversations instantly

### 3. **User Authentication**
- **Secure Login/Logout**: Session-based authentication with bcrypt password hashing
- **Protected Routes**: All chat features require authentication
- **Session Persistence**: Secure session management with automatic expiration

### 4. **Modern UI/UX**
- **Responsive Design**: Optimized for desktop, tablet, and mobile
- **Theme Toggle**: Light and dark mode with warm, accessible color palettes
- **Typography**: Serif font for messages (warm, literary feel), sans-serif for UI elements
- **Code Highlighting**: Syntax-highlighted code blocks with copy functionality
- **Mobile-First**: Touch-friendly with proper keyboard handling on mobile devices

### 5. **Rich Content Rendering**
- **Markdown Support**: Full markdown rendering with GitHub Flavored Markdown
- **Code Blocks**: Syntax highlighting using Shiki with warm, muted themes
- **Inline Code**: Styled inline code snippets
- **Streaming Content**: Graceful handling of partial/incomplete markdown during streaming

---

## Technical Architecture

### Frontend Stack
| Technology | Purpose |
|------------|---------|
| **SvelteKit** | Full-stack framework (SSR + SPA capabilities) |
| **Svelte 5** | Component framework with runes |
| **Tailwind CSS 4** | Utility-first styling |
| **TypeScript** | Type safety throughout |
| **Marked** | Markdown parsing |
| **Shiki** | Syntax highlighting |
| **DOMPurify** | XSS protection for rendered content |

### Backend Stack
| Technology | Purpose |
|------------|---------|
| **SvelteKit** | Backend API routes (file-based routing) |
| **SQLite** | Database via better-sqlite3 |
| **Drizzle ORM** | Type-safe database queries |
| **bcryptjs** | Password hashing |

### AI Integration
| Service | Purpose |
|---------|---------|
| **Langflow** | Primary AI workflow engine |
| **Nemotron Nano** | Title generation (via NVIDIA API) |

---

## Database Schema

### Tables
1. **users**: User accounts (id, email, password_hash, name)
2. **sessions**: Active authentication sessions
3. **conversations**: Chat sessions (linked to users)
4. **messages**: Individual chat messages with role (user/assistant) and optional thinking content

### Key Features
- Cascade deletes for referential integrity
- Unix timestamps for created/updated times
- UUID primary keys for all entities
- Indexed for performance

---

## API Structure

### Authentication Endpoints
- `POST /api/auth/login` - User authentication
- `POST /api/auth/logout` - Session termination

### Conversation Endpoints
- `GET /api/conversations` - List user's conversations
- `POST /api/conversations` - Create new conversation
- `GET/DELETE /api/conversations/[id]` - Get or delete specific conversation
- `PATCH /api/conversations/[id]/title` - Update conversation title

### Chat Endpoints
- `POST /api/chat/send` - Non-streaming message send
- `POST /api/chat/stream` - Streaming message endpoint (SSE)

### Webhook Endpoints
- `POST /api/webhook/sentence` - Receive streaming sentence fragments
- `GET /api/stream/webhook/[sessionId]` - SSE endpoint for webhook-based streaming

### Utility Endpoints
- `GET /api/health` - Health check

---

## Key Services

### Server-Side Services
1. **langflow.ts**: Langflow API client with streaming support
2. **conversations.ts**: Conversation CRUD operations
3. **messages.ts**: Message management
4. **auth.ts**: Authentication logic
5. **title-generator.ts**: AI-powered title generation
6. **webhook-buffer.ts**: In-memory buffer for streaming webhooks
7. **translator.ts**: Content translation (optional feature)
8. **language.ts**: Language detection utilities

### Client-Side Services
1. **streaming.ts**: Browser-side streaming handler with SSE parsing
2. **streaming-markdown.ts**: Real-time markdown rendering during streaming
3. **unified-streaming.ts**: Unified interface for different streaming methods
4. **webhook-streaming.ts**: Webhook-based streaming client
5. **markdown.ts**: Markdown processing utilities

---

## Component Architecture

### Layout Components
- **Sidebar**: Navigation drawer with conversation list, new chat button, user controls
- **Header**: Top bar with menu toggle, theme switcher, new chat button
- **ChatArea**: Main content area for messages
- **ThemeToggle**: Light/dark mode switch

### Chat Components
- **MessageArea**: Container for all messages in a conversation
- **MessageBubble**: Individual message display (user vs assistant styles)
- **MessageInput**: Text input with auto-resize and send button
- **ThinkingBlock**: Collapsible AI reasoning display
- **StreamingContent**: Real-time streaming text display
- **MarkdownRenderer**: Safe markdown rendering with code highlighting
- **CodeBlock**: Syntax-highlighted code with copy button
- **LoadingIndicator**: Animated typing indicator
- **ErrorMessage**: Error display with retry options

### UI Components
- **SearchModal**: Conversation search interface
- **ConfirmDialog**: Confirmation dialogs for destructive actions
- **Toast**: Notification system

---

## Design System

### Philosophy
- **Warm Minimalism**: Calm, sophisticated reading environment
- **Generous Whitespace**: Focus on content, not chrome
- **Typography Hierarchy**: Serif for content, sans-serif for UI
- **Subtle Interactions**: Animations that are "felt, not noticed"

### Color Palette

#### Light Mode
- Primary Background: `#FFFFFF`
- Secondary Background: `#F4F3EE`
- Accent: `#C15F3C` (warm terracotta)
- Text Primary: `#1A1A1A`
- Text Secondary: `#6B6B6B`

#### Dark Mode
- Primary Background: `#1A1A1A`
- Secondary Background: `#242424`
- Accent: `#D4836B` (softer, warmer)
- Text Primary: `#ECECEC`
- Text Secondary: `#8A8A8A`

### Responsive Breakpoints
- **Desktop**: >1024px (260px sidebar + chat area)
- **Tablet**: 768px–1024px (collapsible sidebar)
- **Mobile**: <768px (full-width, bottom input)

---

## Development & Testing

### Available Scripts
```bash
dev             # Start development server
build           # Production build
preview         # Preview production build
test            # Run unit tests (Vitest)
test:watch      # Watch mode for tests
test:e2e        # End-to-end tests (Playwright)
db:migrate      # Run database migrations
db:push         # Push schema changes
db:studio       # Open Drizzle Studio
seed            # Seed database with test user
```

### Testing Strategy
- **Unit Tests**: Vitest for services and utilities
- **Component Tests**: Testing Library for Svelte components
- **E2E Tests**: Playwright for critical user flows
- **Coverage**: Tests for streaming, auth, conversation management

---

## Security Features

1. **XSS Protection**: DOMPurify for all rendered content
2. **CSRF Protection**: SvelteKit's built-in CSRF handling
3. **Password Security**: bcryptjs with appropriate work factor
4. **Session Security**: HTTP-only cookies, secure in production
5. **Input Sanitization**: Zod validation for all API inputs
6. **SQL Injection Prevention**: Parameterized queries via Drizzle ORM

---

## Deployment Notes

### Environment Variables Required
```
LANGFLOW_API_URL          # Langflow API endpoint
LANGFLOW_API_KEY          # Langflow API key
LANGFLOW_FLOW_ID          # Default flow ID
TITLE_GEN_URL             # Title generation API endpoint
TITLE_GEN_API_KEY         # Title generation API key
DATABASE_URL             # SQLite database path
SESSION_SECRET           # Session encryption secret
```

### Production Build
- Uses `@sveltejs/adapter-node` for Node.js deployment
- Static assets optimized and hashed
- Environment validation at runtime

---

## Project Structure

```
/Users/lvt53/Desktop/langflow-design/
├── src/
│   ├── lib/
│   │   ├── components/        # Svelte components
│   │   │   ├── chat/         # Chat-specific components
│   │   │   ├── layout/       # Layout components
│   │   │   ├── sidebar/      # Sidebar components
│   │   │   ├── search/       # Search components
│   │   │   └── ui/           # Generic UI components
│   │   ├── server/           # Server-only code
│   │   │   ├── db/           # Database schema & connection
│   │   │   ├── services/     # Server services
│   │   │   └── env.ts        # Environment configuration
│   │   ├── services/         # Client-side services
│   │   ├── utils/            # Utility functions
│   │   └── types.ts          # Shared TypeScript types
│   ├── routes/               # SvelteKit routes
│   │   ├── (app)/            # Authenticated app routes
│   │   ├── api/              # API endpoints
│   │   ├── login/            # Login page
│   │   └── +layout.svelte    # Root layout
│   ├── app.html              # HTML template
│   └── hooks.server.ts       # Server hooks
├── drizzle/                  # Database migrations
├── package.json              # Dependencies & scripts
├── DESIGN_SPEC.md           # Detailed design specifications
└── tailwind.config.cjs      # Tailwind configuration
```

---

## Summary

This project represents a production-ready AI chat interface with:

✅ **Modern Architecture**: SvelteKit + TypeScript + Drizzle ORM
✅ **Rich AI Features**: Streaming, thinking blocks, title generation
✅ **Beautiful Design**: Warm minimalism with accessibility focus
✅ **Responsive**: Works seamlessly across all devices
✅ **Secure**: Comprehensive security measures
✅ **Tested**: Unit, component, and E2E test coverage
✅ **Production-Ready**: Optimized builds, health checks, error handling

The application provides a sophisticated yet simple interface for AI conversations, prioritizing the reading experience while maintaining full functionality across all device sizes.
