# Visual Design & Mobile Specification

This document defines the visual design system and responsive behavior for every
UI element. Follow these specifications exactly. Do not improvise colors, spacing,
fonts, or layout decisions — everything is defined here.

---

## Design Philosophy

The design follows the same principles as Anthropic's Claude interface: warm
minimalism. It should feel calm, focused, and uncluttered. Every element exists
because it serves a purpose. There is generous whitespace. The interface stays
out of the way and lets the conversation be the focus.

The overall feeling: a quiet, sophisticated reading environment — not a
dashboard, not a control panel, not a social media feed.

---

## Color Palette

### Light Mode (default)

| Token | Hex | Usage |
|---|---|---|
| `--bg-primary` | `#FFFFFF` | Page background, message input area |
| `--bg-secondary` | `#F4F3EE` | Sidebar background, subtle surface areas |
| `--bg-message-user` | `#F4F3EE` | User message bubble background |
| `--bg-message-assistant` | `#FFFFFF` | Assistant message background (no bubble — flat) |
| `--bg-code` | `#F5F5F0` | Code block background |
| `--bg-hover` | `#EEEDEA` | Hover state on sidebar items, buttons |
| `--text-primary` | `#1A1A1A` | Main body text, headings |
| `--text-secondary` | `#6B6B6B` | Timestamps, metadata, placeholder text |
| `--text-code` | `#1A1A1A` | Code block text |
| `--accent` | `#C15F3C` | Primary accent — active states, links, focus rings |
| `--accent-hover` | `#AE5630` | Accent on hover |
| `--border` | `rgba(0,0,0,0.08)` | Subtle borders, separators, card outlines |
| `--border-focus` | `#C15F3C` | Input focus ring |
| `--shadow` | `rgba(0,0,0,0.04)` | Subtle elevation shadows |

### Dark Mode

| Token | Hex | Usage |
|---|---|---|
| `--bg-primary` | `#1A1A1A` | Page background |
| `--bg-secondary` | `#242424` | Sidebar background |
| `--bg-message-user` | `#2A2A2A` | User message bubble |
| `--bg-message-assistant` | `#1A1A1A` | Assistant message |
| `--bg-code` | `#2A2A2A` | Code block background |
| `--bg-hover` | `#333333` | Hover states |
| `--text-primary` | `#ECECEC` | Body text |
| `--text-secondary` | `#8A8A8A` | Metadata, placeholders |
| `--text-code` | `#ECECEC` | Code text |
| `--accent` | `#D4836B` | Accent (warmer, softer in dark) |
| `--accent-hover` | `#C15F3C` | Accent hover |
| `--border` | `rgba(255,255,255,0.08)` | Borders |
| `--border-focus` | `#D4836B` | Focus ring |
| `--shadow` | `rgba(0,0,0,0.2)` | Shadows |

### Rules

- Default to system preference (`prefers-color-scheme`).
- Provide a toggle in the UI (icon in the header or sidebar footer).
- ALL colors must use the CSS custom property tokens above. No hardcoded
  hex values anywhere in component code.

---

## Typography

| Element | Font | Weight | Size | Line Height |
|---|---|---|---|---|
| Body text (messages) | System serif stack: `Georgia, 'Times New Roman', serif` | 400 (regular) | 16px | 1.6 |
| Headings in messages (h1–h3) | Same serif stack | 600 (semibold) | h1: 24px, h2: 20px, h3: 18px | 1.3 |
| UI chrome (sidebar, buttons, labels) | System sans-serif: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` | 400–500 | 14px | 1.4 |
| Code (inline and blocks) | `'JetBrains Mono', 'Fira Code', 'Consolas', monospace` | 400 | 14px | 1.5 |
| Timestamps, metadata | System sans-serif | 400 | 12px | 1.4 |
| Message input | System serif stack | 400 | 16px | 1.6 |

### Rules

- Message content uses serif. This is the defining typographic choice —
  it creates the warm, literary feel that distinguishes this interface from
  typical chat apps.
- UI elements (sidebar, buttons, status text) use sans-serif for clarity
  at small sizes.
- Code always uses monospace. Never apply the serif or sans-serif font to
  code content.
- Never go below 14px for any readable text. 12px is the absolute minimum,
  used only for timestamps and non-essential metadata.

---

## Spacing System

Base unit: 4px. All spacing values are multiples of 4.

| Token | Value | Usage |
|---|---|---|
| `--space-xs` | 4px | Tight gaps (icon to label) |
| `--space-sm` | 8px | Inside compact elements (badge padding) |
| `--space-md` | 16px | Standard padding, gap between messages |
| `--space-lg` | 24px | Section spacing, card padding |
| `--space-xl` | 32px | Major section gaps |
| `--space-2xl` | 48px | Page-level margins on desktop |

### Rules

- Message bubbles: `--space-md` internal padding, `--space-md` gap between
  consecutive messages.
- Sidebar items: `--space-sm` vertical padding, `--space-md` horizontal padding.
- The conversation area has `--space-2xl` horizontal padding on desktop,
  shrinking to `--space-md` on mobile.
- Maximum content width for messages: 720px, centered. On screens narrower
  than 720px, use full width minus `--space-md` on each side.

---

## Border Radius

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | 4px | Small buttons, badges, inline code |
| `--radius-md` | 8px | Message bubbles, cards, input fields |
| `--radius-lg` | 12px | Modal windows, larger containers |
| `--radius-full` | 9999px | Circular avatars, pill buttons |

---

## Shadows

Use sparingly. The design should feel flat with hints of depth, not layered.

| Token | Value | Usage |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.04)` | Sidebar, subtle card lift |
| `--shadow-md` | `0 2px 8px rgba(0,0,0,0.06)` | Input area, floating elements |
| `--shadow-lg` | `0 4px 16px rgba(0,0,0,0.08)` | Modals, dropdowns |

---

## Layout — Desktop (>1024px)

```
┌──────────────────────────────────────────────────────────────────┐
│ ┌────────────┐ ┌──────────────────────────────────────────────┐  │
│ │            │ │                                              │  │
│ │  Sidebar   │ │         Conversation Area                   │  │
│ │  260px     │ │         (centered, max 720px content)       │  │
│ │            │ │                                              │  │
│ │ [New Chat] │ │  ┌────────────────────────────────┐         │  │
│ │            │ │  │ User message (right-aligned)   │         │  │
│ │ Conv 1     │ │  └────────────────────────────────┘         │  │
│ │ Conv 2     │ │                                              │  │
│ │ Conv 3     │ │  ┌────────────────────────────────────────┐ │  │
│ │ ...        │ │  │ Assistant message (left-aligned, full) │ │  │
│ │            │ │  └────────────────────────────────────────┘ │  │
│ │            │ │                                              │  │
│ │            │ │                                              │  │
│ │ ────────── │ │  ┌──────────────────────────────────────┐   │  │
│ │ [Settings] │ │  │  Message input area                  │   │  │
│ │ [Theme]    │ │  │  [📎] [                         ] [→] │   │  │
│ └────────────┘ │  └──────────────────────────────────────┘   │  │
│                └──────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

- Sidebar: fixed width 260px, full height, left side.
- Conversation area: fills remaining width. Messages centered with max-width 720px.
- Message input: pinned to bottom of conversation area. Full width of the
  conversation column minus padding.
- User messages: right-aligned with `--bg-message-user` bubble, `--radius-md`.
- Assistant messages: left-aligned, no bubble (flat on `--bg-primary`), full
  content width.

---

## Layout — Tablet (768px–1024px)

- Sidebar: collapsible overlay. Hidden by default. Toggle via hamburger icon
  in the header.
- When sidebar is open: slides in from left as an overlay with a semi-transparent
  backdrop. Width 260px (same as desktop).
- Conversation area: full width.
- Message max-width: 720px, centered. If screen is under 720px, messages
  use full width minus padding.
- Everything else identical to desktop.

---

## Layout — Mobile (<768px)

```
┌─────────────────────────────────┐
│ [≡]  AlfyAI          [◑] [⊕]  │  ← Header: hamburger, title, theme toggle, new chat
├─────────────────────────────────┤
│                                 │
│  ┌───────────────────────┐      │
│  │ User message          │      │  ← Right-aligned bubble, slight inset
│  └───────────────────────┘      │
│                                 │
│  Assistant message text here    │  ← Left-aligned, full width, no bubble
│  continues flowing naturally    │
│  across the full width.         │
│                                 │
│  ```python                      │  ← Code block: horizontal scroll,
│  def foo():                     │     full width, slightly inset
│      return 42                  │
│  ```                            │
│                                 │
│                                 │
├─────────────────────────────────┤
│ [📎] [Type a message...   ] [→] │  ← Input pinned to bottom
└─────────────────────────────────┘
```

### Mobile-specific rules

- **Header**: 48px height. Contains hamburger menu (left), app title or current
  conversation name (center), theme toggle and new chat button (right).
- **Sidebar**: full-screen overlay when open. Slides in from left. Has a close
  button (X) in the top right. Conversation list fills the space. Tapping a
  conversation closes the sidebar and loads that conversation.
- **Messages**: full width minus `--space-md` (16px) on each side. No max-width
  constraint on mobile — use all available horizontal space.
- **User messages**: right-aligned bubble with `--bg-message-user`, max-width
  85% of the screen width. This prevents very short messages from looking
  like tiny pills.
- **Assistant messages**: left-aligned, full width, no bubble. This gives code
  blocks and long prose maximum room.
- **Code blocks**: full width with horizontal scroll. Font size stays 14px
  (do NOT shrink code on mobile). Touch-scrollable horizontally.
- **Input area**: pinned to the bottom of the viewport (not the bottom of
  the scrollable content — it must stay visible when scrolling up through
  messages). Height: minimum 48px, expands up to 120px as the user types
  multi-line input. Contains:
  - File attachment button (left, grayed out / "coming soon")
  - Text input (center, fills available space)
  - Send button (right, accent color, only active when input is non-empty)
- **Touch targets**: all tappable elements must be at least 44×44px. This
  includes sidebar conversation items, buttons, the send button, the
  hamburger menu, and the theme toggle.
- **Keyboard handling**: when the software keyboard opens, the input area
  must remain visible. The conversation should scroll so the latest message
  stays visible above the keyboard. On iOS, account for the safe area inset
  at the bottom (the home indicator bar).
- **Pull-to-refresh**: not needed. New messages appear via the normal send/receive
  flow, not by refreshing.
- **Landscape orientation**: supported but not optimized. The same mobile layout
  applies. Sidebar remains an overlay.

---

## Component Specifications

### Message bubbles

- **User**: background `--bg-message-user`, border-radius `--radius-md`,
  padding `--space-md`, right-aligned, max-width 85% (mobile) or 80%
  (desktop). Text color `--text-primary`. Serif font.
- **Assistant**: no background (sits on `--bg-primary`), left-aligned,
  full content width (up to 720px on desktop). Text color `--text-primary`.
  Serif font. A subtle `--border` bottom separator between consecutive
  assistant messages is optional.
- **Timestamp**: below each message, `--text-secondary`, 12px, sans-serif.
  On mobile, show only time (e.g. "14:32"). On desktop, show relative time
  (e.g. "2 minutes ago") or date+time for older messages.

### Code blocks

- Background: `--bg-code`.
- Border: 1px `--border`.
- Border-radius: `--radius-md`.
- Padding: `--space-md`.
- Font: monospace, 14px.
- Horizontal scroll on overflow (never wrap code lines).
- **Copy button**: positioned top-right of the code block, appears on
  hover (desktop) or always visible (mobile). Small, subtle, uses
  `--text-secondary` color. Shows "Copied!" feedback for 2 seconds.
- **Language label**: if a language is specified (```python), show it as
  a small label top-left of the code block in `--text-secondary`, 12px.
- **Syntax highlighting**: use a warm, low-contrast theme that matches
  the color palette. Avoid neon or high-saturation highlight colors.
  Recommended: a muted variant of the "One Light" or "GitHub Light" theme
  for light mode, "One Dark" for dark mode.

### Inline code

- Background: `--bg-code`.
- Border-radius: `--radius-sm`.
- Padding: 2px 6px.
- Font: monospace, slightly smaller than surrounding text (14px if body is 16px).
- Do NOT add a border. The background tint is sufficient.

### Message input area

- Background: `--bg-primary`.
- Border: 1px `--border`, becomes `--border-focus` on focus.
- Border-radius: `--radius-md`.
- Shadow: `--shadow-md` (gives it slight lift from the page).
- Padding: `--space-sm` inside.
- The input is a textarea, not a single-line input. It grows vertically
  as the user types, up to a maximum height (120px on mobile, 200px on
  desktop), then scrolls internally.
- Placeholder text: "Type a message..." in `--text-secondary`, serif font.
- **Send button**: circle or rounded rectangle, `--accent` background,
  white arrow icon. Disabled state: `--bg-hover` background, no icon color
  change. Only enabled when the input is non-empty.
- **File attachment button**: left side of input. Icon only (paperclip).
  `--text-secondary` color. Disabled/grayed for now. Tooltip: "File uploads
  coming soon".

### Sidebar

- Background: `--bg-secondary`.
- Width: 260px (desktop and tablet overlay).
- Full height of viewport.
- Top section: "New chat" button, full width, `--accent` text or outline style.
- Middle section: scrollable conversation list.
  - Each item: conversation title (truncated to one line with ellipsis),
    timestamp below in `--text-secondary`, 12px.
  - Active conversation: `--bg-hover` background, `--accent` left border (3px).
  - Hover: `--bg-hover` background.
  - Touch: 44px minimum height per item.
- Bottom section: user info (name or avatar), settings link, theme toggle.
- Separator between sections: 1px `--border`.

### Loading / status indicator

- Positioned where the next assistant message would appear (left-aligned,
  below the user's message).
- Three animated dots (typing indicator), using `--accent` color.
- Below the dots: status text in `--text-secondary`, 14px, sans-serif.
  E.g. "Thinking..." or "Translating response..."
- The dots animate with a gentle pulsing or bouncing motion (not a spinner).
- On mobile, the indicator scrolls into view automatically when it appears.

### Buttons (general)

- **Primary**: `--accent` background, white text, `--radius-md`, padding
  `--space-sm --space-md`. Hover: `--accent-hover`.
- **Secondary/ghost**: transparent background, `--text-primary` text,
  1px `--border` border. Hover: `--bg-hover`.
- **Icon buttons**: 36×36px (desktop), 44×44px (mobile). No text label.
  `--text-secondary` color, hover `--text-primary`.
- No drop shadows on buttons. Keep them flat.

### Modals and dialogs

- Centered overlay with semi-transparent backdrop (`rgba(0,0,0,0.4)`).
- White card (or `--bg-primary` in dark mode) with `--radius-lg`,
  `--shadow-lg`, padding `--space-lg`.
- Max-width: 480px. On mobile, nearly full width with `--space-md` margin.
- Use for: delete confirmation, settings, rename conversation.

---

## Animations and Transitions

- **Duration**: 150ms for micro-interactions (hover, focus), 250ms for
  layout changes (sidebar open/close), 300ms for modals.
- **Easing**: `ease-out` for enter animations, `ease-in` for exit.
- **Sidebar slide**: translateX from -100% to 0, with backdrop fade.
- **Message appear**: subtle fade-in (opacity 0→1 over 200ms). No slide,
  no bounce, no scale. Just a gentle fade.
- **Typing indicator dots**: staggered opacity pulse, 600ms cycle per dot,
  100ms stagger between dots.
- **Avoid**: spring physics, bouncing, overshooting, rotation, scale
  transforms on messages, and any animation that draws attention to
  itself. The animations should be felt, not noticed.

---

## Accessibility

- All interactive elements must be keyboard navigable (Tab, Enter, Escape).
- Focus rings: 2px `--border-focus` with 2px offset. Visible in both themes.
- Color contrast: all text meets WCAG AA (4.5:1 for body text, 3:1 for
  large text). The palette above is designed to meet this — do not modify
  the text/background combinations.
- Screen reader: all icon buttons must have `aria-label`. Messages must
  be in an ARIA live region so new messages are announced.
- Reduced motion: respect `prefers-reduced-motion`. Disable all animations
  when this is set. Status indicators should still be visible, just static.

---

## What This Document Does NOT Cover

- Backend technology choices (framework, language, database).
- API integration details (see UI_HANDOFF.md for that).
- Feature logic or business rules.
- Deployment or infrastructure.

This document covers only visual design, layout, typography, color, spacing,
responsiveness, and component appearance. Use it as the single source of truth
for every visual decision in the application.
