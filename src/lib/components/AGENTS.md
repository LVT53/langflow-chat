# Components — Hierarchy and Contracts

Parent: [AGENTS.md](../../../AGENTS.md) defines component categories and boundary rules. This file maps the **component hierarchy, store dependencies, and page-to-component usage** — what the parent doesn't document.

## Component Hierarchy

```
layout/
  Sidebar.svelte                    ← navigation shell, profile, new-chat button
    ├── search/SearchModal.svelte   ← global conversation + vault-file search (Ctrl+K)
    └── sidebar/ConversationList.svelte  ← list with drag/drop, project folders
          ├── sidebar/ProjectItem.svelte      ← folder row (event emitter only)
          └── sidebar/ConversationItem.svelte  ← conversation row (event emitter only)
  Header.svelte                     ← mobile header, sidebar toggle, user menu

chat/
  MessageInput.svelte               ← composer UI, attachments, local draft, onUploadReady callback
    ├── chat/ContextUsageRing.svelte     ← context usage % ring
    ├── chat/ComposerToolsMenu.svelte    ← translation toggle
    ├── chat/FileAttachment.svelte       ← attachment chip (viewable prop, onView callback)
    └── chat/DropZoneOverlay.svelte      ← full-page drag-and-drop overlay for file uploads
  MessageArea.svelte                ← message list scroll container (OWNS scroll)
    ├── chat/GeneratedFile.svelte       ← generated-file preview, download, and save-to-vault actions
    └── chat/MessageBubble.svelte       ← individual message (attachment viewing capability)
          ├── chat/MarkdownRenderer.svelte    ← markdown + Shiki highlighting
          ├── chat/CodeBlock.svelte           ← fenced code block
          ├── chat/ThinkingBlock.svelte       ← <thinking> content
          ├── chat/FileAttachment.svelte      ← inline attachment display
          ├── chat/MessageEvidenceDetails.svelte  ← evidence summary panel
          └── chat/AttachmentContentModal.svelte  ← modal for viewing extracted file text (contentText)
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
| `MessageInput.svelte` | `ui` | `currentConversationId` (draft clear on switch), `onUploadReady` callback |
| `MessageBubble.svelte` | `theme` | `isDark` (markdown dark mode), attachment viewing via `AttachmentContentModal` |
| `ModelSelector.svelte` | `settings` | `selectedModel`, `setSelectedModel` |
| `ComposerToolsMenu.svelte` | `settings` | `translationState`, `toggleTranslationState` |
| `SearchModal.svelte` | `conversations` | `conversations` (conversation search source) |
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
- `chat/DropZoneOverlay.svelte` — drag-and-drop file upload overlay
- `chat/AttachmentContentModal.svelte` — attachment content viewer
- Route-local `_components/` — `ChatComposerPanel`, `ChatMessagePane` (page scaffolding)

### Knowledge (`src/routes/(app)/knowledge/+page.svelte`)
- `ui/ConfirmDialog.svelte` — delete confirmations
- Route-local `_components/` — `KnowledgeLibraryView` (main-panel vault explorer and vault manager), `KnowledgeMemoryModal`, `KnowledgeUploadView`, `VaultFileUpload`

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
- `MessageArea.svelte` must also keep newly appended generated-file cards, including temporary `generate_file` loading placeholders, visible when the user remained near the bottom of the chat
- `MessageArea.svelte` also owns the quiet empty-conversation ready state for chat detail routes; do not reintroduce the landing-page hero copy inside the message pane
- `MessageInput.svelte` emits drafts and `onQueue` events — the **chat page** decides auto-send and restore behavior
- `MessageInput.svelte` must mirror a cleared `conversationId` prop back into its local `resolvedConversationId`; do not keep stale landing-page conversation ids alive inside the component after the parent resets them
- The chat page must treat route teardown/unmount as a local stream detach, not the same thing as the user pressing Stop. Only explicit stop UI should request `/api/chat/stream/stop`.
- The landing page may force a full document navigation after the first send so the browser cannot remain on the home-screen visual state while the new chat route is already executing on the server
- `MessageInput.svelte` accepts `onUploadReady` callback for external upload handling
- `FileAttachment.svelte` accepts `viewable` boolean and `onView` callback for content preview
- `AttachmentContentModal.svelte` fetches `/api/knowledge/{id}` to display extracted text with loading/error/empty states
- `SearchModal.svelte` pulls vault-file hits through `client/api/knowledge.ts` and reuses `AttachmentContentModal.svelte` so shell search shows the same AI-visible text path as the knowledge page
- `DropZoneOverlay.svelte` provides visual feedback during OS file manager drag operations
- `GeneratedFile.svelte` owns the compact generated-file row layout, preview/download/save-to-vault UI, and the shimmer-style generating state, and may lazy-load vault options through `client/api/knowledge.ts`
- Generated-file preview should reuse `knowledge/FilePreview.svelte` through the chat-file preview endpoint instead of maintaining a second lightweight preview modal
- `GeneratedFile.svelte` exposes a user-side save action only. The current model/tooling contract does not let the AI directly move a chat-generated file into a vault on its own
- Saved generated-file rows remain conversation-scoped after vault save; do not delete the underlying chat-file record just because a vault copy was created
- `src/routes/(app)/knowledge/_components/VaultFileUpload.svelte` accepts an optional `conversationId` because direct vault uploads from the knowledge page are not conversation-scoped
- `src/routes/(app)/knowledge/_components/KnowledgeLibraryView.svelte` is the knowledge-page vault surface; keep vault browsing/search/filter state, drag/drop upload targeting, and vault CRUD affordances there instead of reintroducing a separate sidebar rail
- Knowledge-memory UI should render server-derived persona classes and historical temporal phrasing as-is. Do not re-derive deadline freshness or topic lifecycle rules in Svelte components.
- `MarkdownRenderer.svelte` uses Shiki with 25+ language grammars — init is async; check `initHighlighter()`
- `ContextUsageRing.svelte` (656 lines) is large because it contains SVG rendering logic, not business logic

## Route-Local Components Convention

Pages may have `_components/` directories for page-scoped UI:
- `src/routes/(app)/chat/[conversationId]/_components/` — `ChatComposerPanel`, `ChatMessagePane`
- `src/routes/(app)/knowledge/_components/` — `KnowledgeLibrary`, `KnowledgeMemoryModal`, `KnowledgeUploadView`
- `src/routes/(app)/settings/_components/` — tab components

These are **page-internal** — do not import them from other pages. If logic becomes shared, move to `src/lib/components/` or `src/lib/client/api/`.

Chat-route presentation rule:
- `ChatComposerPanel` and `ChatMessagePane` are part of the chat-detail layout, not the landing-page hero. Keep the composer bottom-docked on the chat route and keep the message surface visible even when a brand-new conversation has no persisted messages yet.
- The app shell must not infer "current conversation was deleted" purely from the sidebar list. Empty bootstrap chats may be real before they become list-visible.
