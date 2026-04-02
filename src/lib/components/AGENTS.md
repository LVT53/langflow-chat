# Components — Hierarchy and Contracts

Parent: [AGENTS.md](../../../AGENTS.md) defines component categories and boundary rules. This file maps the **component hierarchy, store dependencies, and page-to-component usage** — what the parent doesn't document.

## Component Hierarchy

```
layout/
  Sidebar.svelte                    ← navigation shell, profile, new-chat button
    ├── search/SearchModal.svelte   ← global conversation search (Ctrl+K)
    └── sidebar/ConversationList.svelte  ← list with drag/drop, project folders
          ├── sidebar/ProjectItem.svelte      ← folder row (event emitter only)
          └── sidebar/ConversationItem.svelte  ← conversation row (event emitter only)
  Header.svelte                     ← mobile header, sidebar toggle, user menu

chat/
  MessageInput.svelte               ← composer UI, attachments, local draft
    ├── chat/ContextUsageRing.svelte     ← context usage % ring
    ├── chat/ComposerToolsMenu.svelte    ← translation toggle
    └── chat/FileAttachment.svelte       ← attachment chip
  MessageArea.svelte                ← message list scroll container (OWNS scroll)
    └── chat/MessageBubble.svelte       ← individual message
          ├── chat/MarkdownRenderer.svelte    ← markdown + Shiki highlighting
          ├── chat/CodeBlock.svelte           ← fenced code block
          ├── chat/ThinkingBlock.svelte       ← <thinking> content
          ├── chat/FileAttachment.svelte      ← inline attachment display
          └── chat/MessageEvidenceDetails.svelte  ← evidence summary panel
  ModelSelector.svelte              ← model dropdown
  EvidenceManager.svelte            ← evidence management sidebar
  ErrorMessage.svelte               ← error display
  LoadingIndicator.svelte           ← loading states
  LogoMark.svelte                   ← animated brand logo

ui/
  AvatarCircle.svelte               ← user avatar display
  ProfilePictureEditor.svelte       ← avatar upload/crop
  ConfirmDialog.svelte              ← confirmation modal
  TypewriterText.svelte             ← animated text display
```

## Store Dependencies by Component

| Component | Store | Imports Used |
|-----------|-------|-------------|
| `Sidebar.svelte` | `ui` | `sidebarOpen`, `sidebarCollapsed`, `currentConversationId` |
| `Sidebar.svelte` | `avatar` | `avatarState` |
| `Header.svelte` | `ui` | `sidebarOpen`, `sidebarCollapsed`, `currentConversationId` |
| `ConversationList.svelte` | `conversations` | `conversations`, CRUD actions |
| `ConversationList.svelte` | `projects` | `projects`, CRUD actions |
| `ConversationList.svelte` | `ui` | `currentConversationId`, `sidebarOpen` |
| `MessageInput.svelte` | `ui` | `currentConversationId` (draft clear on switch) |
| `MessageBubble.svelte` | `theme` | `isDark` (markdown dark mode) |
| `ModelSelector.svelte` | `settings` | `selectedModel`, `setSelectedModel` |
| `ComposerToolsMenu.svelte` | `settings` | `translationState`, `toggleTranslationState` |
| `SearchModal.svelte` | `conversations` | `conversations` (search source) |
| `SearchModal.svelte` | `projects` | `projects` (search source) |
| `SearchModal.svelte` | `ui` | `currentConversationId`, `sidebarOpen` |

## Page-to-Component Usage

### Landing (`src/routes/(app)/+page.svelte`)
- `chat/MessageInput.svelte` — composer for first message
- `chat/LogoMark.svelte` — brand display

### Chat (`src/routes/(app)/chat/[conversationId]/+page.svelte`)
- `chat/MessageArea.svelte` — message list
- `chat/MessageInput.svelte` — composer with queued follow-up
- `chat/ModelSelector.svelte` — model picker
- `chat/EvidenceManager.svelte` — evidence panel
- `chat/ContextUsageRing.svelte` — context indicator
- Route-local `_components/` — `ChatComposerPanel`, `ChatMessagePane` (page scaffolding)

### Knowledge (`src/routes/(app)/knowledge/+page.svelte`)
- `ui/ConfirmDialog.svelte` — delete confirmations
- Route-local `_components/` — `KnowledgeLibrary`, `KnowledgeMemoryModal`, `KnowledgeUploadView`

### Settings (`src/routes/(app)/settings/+page.svelte`)
- `ui/ProfilePictureEditor.svelte` — avatar management
- `ui/ConfirmDialog.svelte` — account deletion
- Route-local `_components/` — tab components (ProfileTab, AdminSystemTab, AdminUsersTab, AnalyticsTab, etc.)

### Shell (`src/routes/(app)/+layout.svelte`)
- `layout/Sidebar.svelte` — navigation
- `layout/Header.svelte` — mobile header

## Key Component Boundaries (not in parent)

- `ConversationList.svelte` owns drag/drop state — `ConversationItem` and `ProjectItem` are **event emitters**, not persistence actors
- `MessageArea.svelte` is the **sole scroll owner** for conversation content — do not add `overflow-y: auto` elsewhere
- `MessageInput.svelte` emits drafts and `onQueue` events — the **chat page** decides auto-send and restore behavior
- `MarkdownRenderer.svelte` uses Shiki with 25+ language grammars — init is async; check `initHighlighter()`
- `ContextUsageRing.svelte` (656 lines) is large because it contains SVG rendering logic, not business logic

## Route-Local Components Convention

Pages may have `_components/` directories for page-scoped UI:
- `src/routes/(app)/chat/[conversationId]/_components/` — `ChatComposerPanel`, `ChatMessagePane`
- `src/routes/(app)/knowledge/_components/` — `KnowledgeLibrary`, `KnowledgeMemoryModal`, `KnowledgeUploadView`
- `src/routes/(app)/settings/_components/` — tab components

These are **page-internal** — do not import them from other pages. If logic becomes shared, move to `src/lib/components/` or `src/lib/client/api/`.
