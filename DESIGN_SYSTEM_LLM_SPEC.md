# AlfyAI Design System Specification (LLM Reference Document)

## Document Purpose

This document provides a **deterministic, exhaustive specification** of the AlfyAI chat application's design system, intended for LLM consumption. Every value is exact—no approximations, no "around" values, no subjective descriptions. Use this document to generate code that matches the existing design system precisely.

---

## 1. Design Philosophy (Decision Framework)

**Core Principle**: Warm minimalism following Anthropic's Claude interface aesthetic.

**Key Constraints:**
- Every element must serve a purpose—no decorative elements
- Generous whitespace—never cramped layouts
- Interface stays out of the way—conversation is the focus
- Quiet, sophisticated reading environment—not a dashboard or control panel
- All spacing is multiples of 4px (base unit)
- Never use hardcoded hex values—all colors must use CSS custom properties

---

## 2. CSS Custom Properties (Design Tokens)

All design tokens are defined in `/Users/lvt53/Desktop/langflow-design/src/app.css` and mapped to Tailwind classes in `/Users/lvt53/Desktop/langflow-design/tailwind.config.ts`.

### 2.1 Spacing Scale (Exact Values)

| Token | Value | Tailwind Mapping | Usage |
|-------|-------|------------------|-------|
| `--space-xs` | `4px` | `xs` | Tight gaps (icon to label) |
| `--space-sm` | `8px` | `sm` | Inside compact elements (badge padding) |
| `--space-md` | `16px` | `md` | Standard padding, gap between messages |
| `--space-lg` | `24px` | `lg` | Section spacing, card padding |
| `--space-xl` | `32px` | `xl` | Major section gaps |
| `--space-2xl` | `48px` | `2xl` | Page-level margins on desktop |

**Usage Examples:**
- Message bubbles: `--space-md` (16px) internal padding
- Sidebar items: `--space-sm` (8px) vertical, `--space-md` (16px) horizontal
- Conversation area: `--space-2xl` (48px) horizontal padding on desktop, shrinks to `--space-md` (16px) on mobile
- Gap between messages: `--space-md` (16px)

### 2.2 Border Radius (Exact Values)

| Token | Value | Tailwind Mapping | Usage |
|-------|-------|------------------|-------|
| `--radius-sm` | `5px` | `rounded-sm` | Small buttons, badges, inline code |
| `--radius-md` | `0.375rem` (~6px) | `rounded-md` | Message bubbles, cards, input fields |
| `--radius-lg` | `0.5rem` (~8px) | `rounded-lg` | Modal windows, larger containers |
| `--radius-full` | `9999px` | `rounded-full` | Circular avatars, pill buttons |

### 2.3 Animation Durations (Exact Values)

| Token | Value | CSS Usage | Tailwind Class |
|-------|-------|-----------|------------------|
| `--duration-micro` | `100ms` | Micro-interactions (hover, focus) | `duration-micro` |
| `--duration-standard` | `150ms` | Standard transitions | `duration-150` |
| `--duration-emphasis` | `250ms` | Layout changes, sidebar open/close | `duration-250`, `duration-emphasis` |
| `--ease-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | All easing functions | N/A |

### 2.4 Color Tokens - Light Mode (Exact Hex Values)

#### Surface Colors
```css
--surface-page: #FFFFFF       /* Page background, message input area */
--surface-elevated: #F4F3EE   /* Sidebar background, elevated surfaces */
--surface-overlay: #FAFAF8    /* Modals, overlays, dropdown menus */
--surface-code: #F5F5F0       /* Code block background */
```

#### Text Colors
```css
--text-primary: #1A1A1A       /* Main body text, headings */
--text-muted: #6B6B6B         /* Timestamps, metadata, placeholder text */
--text-code: #1A1A1A          /* Code block text */
```

#### Icon Colors
```css
--icon-primary: #1A1A1A       /* Primary icons */
--icon-muted: #6B6B6B         /* Secondary/muted icons */
```

#### Accent Colors (Brand)
```css
--accent: #C15F3C             /* Primary accent—active states, links, focus rings */
--accent-hover: #AE5630       /* Accent on hover */
```

#### Border Colors
```css
--border-default: rgba(0,0,0,0.08)    /* Default borders, separators */
--border-subtle: rgba(0,0,0,0.04)     /* Subtle borders */
--border-focus: #C15F3C              /* Input focus ring */
```

#### Status Colors
```css
--danger: #B91C1C             /* Error states */
--danger-hover: #991B1B         /* Error hover */
--success: #15803D            /* Success states */
--success-hover: #166534      /* Success hover */
```

#### Shadows
```css
--shadow-sm: 0 1px 2px rgba(0,0,0,0.04)     /* Sidebar, subtle card lift */
--shadow-md: 0 2px 8px rgba(0,0,0,0.06)    /* Input area, floating elements */
--shadow-lg: 0 4px 16px rgba(0,0,0,0.08)   /* Modals, dropdowns */
```

#### Focus Ring
```css
--focus-ring: #C15F3C         /* All focus-visible states */
```

#### Legacy Colors (Backward Compatibility)
```css
--bg-primary: #FFFFFF         /* Same as --surface-page */
--bg-secondary: #F4F3EE     /* Same as --surface-elevated */
--bg-message-user: #F4F3EE   /* Same as --surface-elevated */
--bg-message-assistant: #FFFFFF  /* Same as --surface-page */
--bg-code: #F5F5F0           /* Same as --surface-code */
--bg-hover: #EEEDEA          /* Hover background */
--text-secondary: #6B6B6B    /* Same as --text-muted */
--border: rgba(0,0,0,0.08)   /* Same as --border-default */
```

### 2.5 Color Tokens - Dark Mode (Exact Hex Values)

When `.dark` class is applied to `document.documentElement`:

#### Surface Colors
```css
--surface-page: #1A1A1A       /* Page background */
--surface-elevated: #242424     /* Sidebar, elevated surfaces */
--surface-overlay: #2A2A2A     /* Modals, overlays */
--surface-code: #2A2A2A        /* Code blocks */
```

#### Text Colors
```css
--text-primary: #ECECEC       /* Main body text */
--text-muted: #A0A0A0         /* Timestamps, metadata */
--text-code: #ECECEC          /* Code text */
```

#### Icon Colors
```css
--icon-primary: #ECECEC       /* Primary icons */
--icon-muted: #A0A0A0         /* Muted icons */
```

#### Accent Colors (Warmer in Dark Mode)
```css
--accent: #D4836B             /* Softer, warmer terracotta */
--accent-hover: #C15F3C        /* Same as light mode accent */
```

#### Border Colors
```css
--border-default: rgba(255,255,255,0.08)   /* Borders in dark mode */
--border-subtle: rgba(255,255,255,0.04)    /* Subtle borders */
--border-focus: #D4836B                    /* Focus ring matches accent */
```

#### Status Colors
```css
--danger: #FF6B6B             /* Brighter red for dark backgrounds */
--danger-hover: #FF5757        /* Hover state */
--success: #22C55E             /* Brighter green */
--success-hover: #4ADE80       /* Hover state */
```

#### Shadows
```css
--shadow-sm: 0 1px 2px rgba(0,0,0,0.2)     /* Darker shadows */
--shadow-md: 0 2px 8px rgba(0,0,0,0.2)
--shadow-lg: 0 4px 16px rgba(0,0,0,0.2)
```

#### Focus Ring
```css
--focus-ring: #D4836B         /* Matches dark mode accent */
```

#### Legacy Colors (Backward Compatibility)
```css
--bg-primary: #1A1A1A
--bg-secondary: #242424
--bg-message-user: #2A2A2A
--bg-message-assistant: #1A1A1A
--bg-code: #2A2A2A
--bg-hover: #333333
--text-secondary: #8A8A8A
--border: rgba(255,255,255,0.08)
```

### 2.6 Color Mixing Patterns (Exact Formulas)

The design system extensively uses `color-mix()` for subtle variations:

**Hover Background on Secondary Buttons:**
```css
background: color-mix(in srgb, var(--surface-overlay) 78%, var(--surface-page) 22%);
```

**Menu/Dropdown Borders:**
```css
border-color: color-mix(in srgb, var(--border-default) 76%, var(--surface-page) 24%);
```

**Dark Mode Menu Borders:**
```css
border-color: color-mix(in srgb, var(--border-default) 84%, transparent 16%);
```

**Message Composer Background (Light):**
```css
background: color-mix(in srgb, var(--surface-elevated) 82%, var(--surface-page) 18%);
```

**Message Composer Background (Dark):**
```css
background: color-mix(in srgb, var(--surface-overlay) 88%, #3a3a3a 12%);
```

**Logout Button Hover:**
```css
background-color: color-mix(in srgb, var(--accent) 12%, var(--surface-page) 88%);
border-color: color-mix(in srgb, var(--accent) 38%, var(--border-default) 62%);
```

**Composer Border Top:**
```css
border-top: 1px solid color-mix(in srgb, var(--border-default) 72%, transparent 28%);
```

**Composer Shadow (Light):**
```css
box-shadow:
  0 1px 0 color-mix(in srgb, var(--border-default) 88%, transparent 12%),
  0 14px 30px color-mix(in srgb, var(--accent) 7%, transparent 93%),
  var(--shadow-lg);
```

**Composer Shadow (Dark):**
```css
box-shadow:
  0 1px 0 color-mix(in srgb, var(--border-default) 92%, transparent 8%),
  0 18px 38px rgba(0, 0, 0, 0.4),
  0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent 90%);
```

**Search Modal Shadow:**
```css
box-shadow:
  0 22px 52px rgba(0, 0, 0, 0.18),
  0 1px 0 color-mix(in srgb, var(--border-default) 85%, transparent 15%);
```

**Menu Item Hover (Gold Tint):**
```css
background: rgba(194, 166, 106, 0.24);
```

**Menu Item Hover (Dark Mode):**
```css
background: rgba(194, 166, 106, 0.3);
```

**Danger Menu Item Hover (Light):**
```css
background: rgba(186, 77, 77, 0.14);
```

**Danger Menu Item Hover (Dark):**
```css
background: rgba(186, 77, 77, 0.22);
```

**Icon Color Mixing:**
```css
color: color-mix(in srgb, var(--surface-overlay) 45%, var(--text-primary) 55%);
```

**Dark Mode Icon Color Mixing:**
```css
color: color-mix(in srgb, var(--surface-overlay) 62%, var(--text-primary) 38%);
```

---

## 3. Typography System

### 3.1 Font Families (Exact Stacks)

```javascript
// tailwind.config.ts
fontFamily: {
  sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
  serif: ["Georgia", "Times New Roman", "serif"],
  mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
}
```

**Usage Rules:**
- `font-serif`: Message content, literary text (the defining typographic choice)
- `font-sans`: UI chrome (sidebar, buttons, labels, timestamps)
- `font-mono`: Code blocks, inline code, technical content

### 3.2 Typography Scale (Exact Values)

| Element | Font | Weight | Size | Line Height | Letter Spacing |
|---------|------|--------|------|-------------|----------------|
| Body text (messages) | `font-serif` | 400 | 16px | 1.6 | normal |
| UI chrome (sidebar, buttons) | `font-sans` | 400-500 | 14px | 1.4 | normal |
| Code | `font-mono` | 400 | 14px | 1.5 | normal |
| Timestamps, metadata | `font-sans` | 400 | 12px | 1.4 | normal |
| Message input | `font-serif` | 400 | 16px | 1.35 | normal |
| Search results | `font-sans` | 400 | 15px | 1.4 | normal |
| Sidebar title | `font-sans` | 600 | 20px | 1.2 | -0.03em |
| Intro heading | `font-serif` | 500 | 32px (mobile) / 64px (desktop) | 1.1 | -0.05em |
| Dialog title | `font-sans` | 600 | 20px | 1.3 | normal |

**Minimum font size:** 12px (absolute minimum, only for timestamps and non-essential metadata)
**Never go below 14px** for any readable text.

---

## 4. Button Design System

All button classes are defined in `/Users/lvt53/Desktop/langflow-design/src/app.css` and are framework-agnostic CSS classes that can be used with any element.

### 4.1 Button Base (Applied to All Variants)

```css
.btn-primary, .btn-secondary, .btn-ghost, .btn-icon, .btn-danger {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  border-radius: var(--radius-md, 0.375rem);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-weight: 500;
  cursor: pointer;
  transition:
    color var(--duration-standard) var(--ease-out),
    background-color var(--duration-standard) var(--ease-out),
    border-color var(--duration-standard) var(--ease-out),
    box-shadow var(--duration-standard) var(--ease-out),
    opacity var(--duration-standard) var(--ease-out),
    transform var(--duration-standard) var(--ease-out);
  outline: none;
}
```

**Focus State (All Buttons):**
```css
.btn-primary:focus-visible, .btn-secondary:focus-visible, 
.btn-ghost:focus-visible, .btn-icon:focus-visible, 
.btn-icon-bare:focus-visible, .btn-danger:focus-visible {
  box-shadow: 0 0 0 2px var(--focus-ring);
}
```

### 4.2 Primary Button (`.btn-primary`)

```css
.btn-primary {
  background-color: var(--accent);           /* #C15F3C light, #D4836B dark */
  color: #FFFFFF;
  border: 1px solid transparent;
  padding: 0.625rem 1rem;
}
.btn-primary:hover {
  background-color: var(--accent-hover);     /* #AE5630 light, #C15F3C dark */
}
```

**Usage:** Main CTAs, send buttons, confirm actions

### 4.3 Secondary Button (`.btn-secondary`)

```css
.btn-secondary {
  background-color: transparent;
  border: 1px solid var(--border-default);
  color: var(--text-primary);
  padding: 0.625rem 1rem;
}
.btn-secondary:hover {
  background-color: color-mix(in srgb, var(--surface-overlay) 78%, var(--surface-page) 22%);
  border-color: var(--border-default);
}
```

**Usage:** Cancel buttons, alternative actions, search button in sidebar

### 4.4 Ghost Button (`.btn-ghost`)

```css
.btn-ghost {
  background-color: transparent;
  color: var(--text-primary);
  padding: 0.625rem 0.875rem;
  border: none;
}
.btn-ghost:hover {
  color: var(--icon-primary);
  opacity: 0.72;
}
```

**Usage:** Low-emphasis actions, subtle interactions

### 4.5 Icon Button (`.btn-icon`)

```css
.btn-icon {
  background-color: transparent;
  min-width: 44px;
  min-height: 44px;
  padding: 0.5rem;
  color: var(--icon-muted);
  border: none;
}
.btn-icon:hover {
  color: var(--icon-primary);
  opacity: 0.78;
}
```

**Usage:** Icon-only buttons with circular/square hit area

### 4.6 Bare Icon Button (`.btn-icon-bare`)

```css
.btn-icon-bare {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  min-width: 44px;
  padding: 0.5rem;
  background-color: transparent;
  border: none;
  border-radius: var(--radius-md, 0.375rem);
  color: var(--icon-muted);
  cursor: pointer;
  transition:
    color var(--duration-standard) var(--ease-out),
    opacity var(--duration-standard) var(--ease-out),
    box-shadow var(--duration-standard) var(--ease-out),
    transform var(--duration-standard) var(--ease-out);
}
.btn-icon-bare:hover {
  color: var(--icon-primary);
  opacity: 0.78;
}
```

**Usage:** Most icon buttons throughout the app—subtle, no background

### 4.7 Danger Button (`.btn-danger`)

```css
.btn-danger {
  background-color: var(--danger);           /* #B91C1C light, #FF6B6B dark */
  border: 1px solid transparent;
  color: #FFFFFF;
  padding: 0.625rem 1rem;
}
.btn-danger:hover {
  background-color: var(--danger-hover);       /* #991B1B light, #FF5757 dark */
}
```

**Usage:** Delete confirmations, destructive actions

---

## 5. Component Specifications

### 5.1 Message Bubble Component

**File:** `/Users/lvt53/Desktop/langflow-design/src/lib/components/chat/MessageBubble.svelte`

**Structure:**
```svelte
<div class="group flex w-full flex-col {isUser ? 'items-end' : 'items-start'} gap-md py-md fade-in">
  <!-- Message content -->
  <div class="...">
  </div>
  <!-- Copy action row -->
  <div class="copy-action-row ...">
  </div>
</div>
```

**User Message Bubble (Exact Classes):**
```svelte
<div 
  data-testid="user-message"
  class="relative flex flex-col font-serif max-w-[85%] rounded-md border border-border-subtle 
         bg-surface-elevated p-sm text-text-primary shadow-sm md:max-w-[80%]">
  <div class="whitespace-pre-wrap break-words text-[16px] leading-[1.6]">
    {message.content}
  </div>
</div>
```

**Assistant Message Bubble (Exact Classes):**
```svelte
<div 
  data-testid="assistant-message"
  class="relative flex flex-col font-serif w-full max-w-full rounded-none 
         bg-surface-page p-sm text-text-primary">
  <div class="prose-container w-full overflow-hidden text-[16px] leading-[1.6]">
    <MarkdownRenderer content={message.content} isDark={$isDark} isStreaming={...} />
  </div>
</div>
```

**Copy Action Row (Exact Classes):**
```svelte
<div class="copy-action-row flex w-full opacity-0 transition-opacity duration-[var(--duration-micro)] 
            group-hover:opacity-100"
     class:justify-end={isUser}
     class:justify-start={!isUser}>
  <button 
    type="button"
    class="btn-icon-bare sm:!min-h-[36px] sm:!min-w-[36px]"
    on:click={copyToClipboard}
    title="Copy message"
    aria-label="Copy message">
    <!-- Copy icon or checkmark -->
  </button>
</div>
```

**Custom CSS for MessageBubble:**
```css
<style lang="postcss">
  .prose-container :global(p) {
    margin-top: 0;
    margin-bottom: var(--space-md);
  }
  .prose-container :global(p:last-child) {
    margin-bottom: 0;
  }
  .fade-in {
    animation: fadeIn var(--duration-micro) var(--ease-out) forwards;
  }
  .copy-action-row {
    margin-top: calc(var(--space-sm) * -1);
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
```

### 5.2 Message Input Component

**File:** `/Users/lvt53/Desktop/langflow-design/src/lib/components/chat/MessageInput.svelte`

**Composer Container (Exact Classes):**
```svelte
<div class="message-composer flex min-h-[78px] flex-col rounded-[1.25rem] border border-border 
            px-5 py-4 transition-all duration-150 focus-within:border-focus-ring">
```

**Custom CSS for Composer:**
```css
<style>
  .message-composer {
    background: color-mix(in srgb, var(--surface-elevated) 82%, var(--surface-page) 18%);
    box-shadow:
      0 1px 0 color-mix(in srgb, var(--border-default) 88%, transparent 12%),
      0 14px 30px color-mix(in srgb, var(--accent) 7%, transparent 93%),
      var(--shadow-lg);
  }

  :global(.dark) .message-composer {
    background: color-mix(in srgb, var(--surface-overlay) 88%, #3a3a3a 12%);
    box-shadow:
      0 1px 0 color-mix(in srgb, var(--border-default) 92%, transparent 8%),
      0 18px 38px rgba(0, 0, 0, 0.4),
      0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent 90%);
  }

  .composer-actions {
    border-top: 1px solid color-mix(in srgb, var(--border-default) 72%, transparent 28%);
  }
</style>
```

**Textarea (Exact Classes):**
```svelte
<textarea
  data-testid="message-input"
  class="composer-textarea min-h-[40px] w-full resize-none overflow-y-auto border-0 
         bg-transparent px-[16px] py-[12px] text-left text-[16px] leading-[1.35] font-serif 
         text-text-primary placeholder:font-sans placeholder:text-text-muted 
         focus:outline-none focus:ring-0"
  rows="1"
></textarea>
```

**Attach Button (Exact Classes):**
```svelte
<button
  type="button"
  class="btn-icon-bare composer-icon flex-shrink-0 text-text-muted 
         disabled:cursor-not-allowed disabled:opacity-40"
  disabled
  title="File uploads coming soon"
  aria-label="Attach file">
  <!-- Paperclip icon -->
</button>
```

**Send Button (Exact Classes):**
```svelte
<button
  data-testid="send-button"
  type="button"
  on:click={send}
  disabled={!canSend}
  aria-label="Send message"
  class="btn-primary composer-send min-h-[50px] min-w-[50px] flex-shrink-0 rounded-[15px] !px-0 
         shadow-sm disabled:cursor-not-allowed disabled:border-border 
         disabled:bg-surface-elevated disabled:text-icon-muted">
  <!-- Send icon -->
</button>
```

**Character Count (Exact Classes):**
```svelte
{#if showCharCount}
  <div class="mt-1 flex justify-end px-2">
    <span class="text-[12px] font-sans {charCountColor}">
      {message.length}/{maxLength}
    </span>
  </div>
{/if}
```
Where `charCountColor` is:
- `'text-danger'` when `message.length > maxLength`
- `'text-text-muted'` otherwise

### 5.3 Sidebar Component

**File:** `/Users/lvt53/Desktop/langflow-design/src/lib/components/layout/Sidebar.svelte`

**Mobile Overlay (Exact Classes):**
```svelte
{#if open}
  <div
    class="mobile-overlay fixed inset-0 z-40 bg-surface-overlay/50 backdrop-blur-sm"
    transition:fade={{ duration: 250 }}
    on:click={() => sidebarOpen.set(false)}>
  </div>
{/if}
```

**Sidebar Panel (Exact Classes):**
```svelte
<aside
  class="sidebar-panel fixed inset-y-0 left-0 z-50 flex h-screen max-w-[100vw] flex-col 
         border-r border-border bg-surface-overlay shadow-lg"
  class:-translate-x-[105%]={!open}
  class:translate-x-0={open}
  class:opacity-0={!open && !isDesktop}
  class:opacity-100={open || isDesktop}
  class:pointer-events-none={!open && !isDesktop}
  class:sidebar-collapsed={isCollapsed}>
```

**Custom CSS for Sidebar:**
```css
<style>
  .sidebar-panel {
    max-width: 100vw;
    width: 100vw;
    transition:
      width 240ms cubic-bezier(0.22, 1, 0.36, 1),
      transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 180ms cubic-bezier(0.22, 1, 0.36, 1),
      background-color 150ms cubic-bezier(0.4, 0, 0.2, 1),
      border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
    will-change: transform, width, opacity;
  }

  .sidebar-panel.sidebar-collapsed {
    width: 48px;
    overflow: hidden;
  }

  .sidebar-rail-button {
    min-height: 48px !important;
    min-width: 48px !important;
    border-radius: 0 !important;
  }

  @media (min-width: 1024px) {
    .sidebar-panel {
      position: static !important;
      transform: translateX(0) !important;
      opacity: 1 !important;
      width: 360px;
    }
    .sidebar-panel.sidebar-collapsed {
      width: 48px;
    }
    .mobile-overlay {
      display: none !important;
    }
    .mobile-only {
      display: none !important;
    }
    .desktop-only {
      display: inline-flex !important;
    }
  }

  @media (max-width: 1023px) {
    .desktop-only {
      display: none !important;
    }
    .mobile-only {
      display: inline-flex !important;
    }
  }
</style>
```

**Sidebar Header (Exact Classes):**
```svelte
<div
  class="sidebar-header flex h-[64px] shrink-0 items-center border-b border-border"
  class:justify-between={!isCollapsed}
  class:justify-center={isCollapsed}
  class:px-lg={!isCollapsed}
  class:px-0={isCollapsed}>
```

**Sidebar Title (Exact Classes):**
```svelte
<div class="overflow-hidden whitespace-nowrap text-[20px] font-sans font-semibold 
            tracking-[-0.03em] text-text-primary opacity-90 transition-opacity duration-150">
  AlfyAI
</div>
```

**New Chat Button - Expanded (Exact Classes):**
```svelte
<button
  data-testid="new-conversation"
  class="btn-primary mb-2 flex w-full items-center justify-center gap-3 rounded-lg text-sm shadow-sm">
  <!-- Plus icon -->
  New chat
</button>
```

**New Chat Button - Collapsed (Exact Classes):**
```svelte
<button
  data-testid="new-conversation"
  class="btn-icon-bare sidebar-rail-button w-full text-accent hover:text-accent-hover"
  title="New chat"
  aria-label="New chat">
  <!-- Plus icon -->
</button>
```

**Search Button - Expanded (Exact Classes):**
```svelte
<button
  type="button"
  class="btn-secondary flex w-full items-center justify-start gap-4 rounded-lg px-4 text-sm">
  <!-- Search icon -->
  <span>Search</span>
</button>
```

**Search Button - Collapsed (Exact Classes):**
```svelte
<button
  type="button"
  class="btn-icon-bare sidebar-rail-button w-full text-icon-muted hover:text-icon-primary"
  title="Search"
  aria-label="Search conversations">
  <!-- Search icon -->
</button>
```

**Search Modal (Exact Classes):**
```svelte
<div
  class="fixed inset-0 z-[80] flex items-center justify-center bg-surface-overlay/65 p-4 backdrop-blur-sm"
  transition:fade={{ duration: 180 }}>
  <div
    class="search-modal w-full max-w-[560px] rounded-[1.1rem] border border-border 
           bg-surface-overlay shadow-lg">
```

**Search Modal Custom CSS:**
```css
.search-modal {
  box-shadow:
    0 22px 52px rgba(0, 0, 0, 0.18),
    0 1px 0 color-mix(in srgb, var(--border-default) 85%, transparent 15%);
}
```

**Search Input Container (Exact Classes):**
```svelte
<div class="flex items-center gap-3 rounded-[0.9rem] border border-border bg-surface-page px-3">
```

**Search Input (Exact Classes):**
```svelte
<input
  type="text"
  placeholder="Search conversations"
  class="h-12 w-full bg-transparent text-[15px] font-sans text-text-primary 
         outline-none placeholder:text-text-muted">
```

**Search Results (Exact Classes):**
```svelte
<button
  type="button"
  class="search-result-row flex w-full items-center rounded-[0.95rem] px-3 py-3 text-left 
         transition-colors duration-150 hover:bg-surface-page">
  <div class="min-w-0 flex-1">
    <div class="truncate text-[15px] font-sans text-text-primary">
      {conversation.title}
    </div>
  </div>
</button>
```

**Search Result Spacing:**
```css
.search-result-row + .search-result-row {
  margin-top: 2px;
}
```

### 5.4 Header Component

**File:** `/Users/lvt53/Desktop/langflow-design/src/lib/components/layout/Header.svelte`

**Header Container (Exact Classes):**
```svelte
<header
  class="z-10 box-border flex h-[52px] w-full max-w-full flex-none items-center border-b border-border 
         bg-surface-page pl-4 pr-8 pt-[max(0.35rem,env(safe-area-inset-top))] 
         pb-[max(0.5rem,env(safe-area-inset-bottom))]
         md:h-[60px] md:pl-7 md:pr-12 lg:h-[68px] lg:pl-10 lg:pr-16">
```

**Mobile Sidebar Toggle (Exact Classes):**
```svelte
<button
  class="btn-icon-bare mobile-sidebar-toggle"
  on:click={toggleSidebar}
  aria-label="Toggle sidebar">
  <!-- Hamburger icon (3 horizontal lines) -->
</button>
```

**User Display Name (Exact Classes):**
```svelte
<span class="hide-on-mobile max-w-[150px] truncate text-[14px] font-sans text-text-muted">
  {user.displayName}
</span>
```

**Mobile Menu Trigger (Exact Classes):**
```svelte
<button
  class="btn-icon-bare mobile-user-trigger"
  on:click={toggleMobileMenu}
  aria-label="Open user menu"
  aria-expanded={mobileMenuOpen}>
  <!-- User icon -->
</button>
```

**Mobile Menu Portal (Exact Classes):**
```svelte
<div
  class="header-menu z-[9999] overflow-hidden rounded-[0.75rem] border p-[5px]"
  style={`${menuPositionStyle} --header-menu-bg: ${menuBaseBackground}; background: ${menuBaseBackground};`}>
```

**Menu Base Background Values:**
- Light mode: `'rgb(241 239 235 / 1)'`
- Dark mode: `'rgb(33 35 38 / 1)'`

**Header Menu Custom CSS:**
```css
<style>
  .header-menu {
    border-color: color-mix(in srgb, var(--border-default) 76%, var(--surface-page) 24%);
    isolation: isolate;
    pointer-events: auto;
    box-shadow:
      0 14px 30px rgba(0, 0, 0, 0.14),
      0 1px 0 color-mix(in srgb, var(--border-default) 88%, transparent 12%);
  }

  :global(.dark) .header-menu {
    border-color: color-mix(in srgb, var(--border-default) 84%, transparent 16%);
    box-shadow:
      0 16px 32px rgba(0, 0, 0, 0.4),
      0 0 0 1px color-mix(in srgb, var(--border-default) 88%, transparent 12%);
  }

  .header-option {
    border: 0;
    border-radius: 0.75rem;
    background: var(--header-menu-bg);
    padding-inline: 0.65rem;
    gap: 0.8rem;
  }

  .header-option:hover,
  .header-option:focus-visible {
    background: rgba(194, 166, 106, 0.24) !important;
  }

  .header-option-accent:hover,
  .header-option-accent:focus-visible {
    background: rgba(194, 166, 106, 0.28) !important;
  }

  .header-option-danger:hover,
  .header-option-danger:focus-visible {
    background: rgba(186, 77, 77, 0.14) !important;
  }

  .header-option-icon {
    margin-right: 7px;
    color: color-mix(in srgb, var(--surface-overlay) 45%, var(--text-primary) 55%);
  }

  .header-option-icon-accent {
    color: var(--accent);
  }

  :global(.dark) .header-option:hover,
  :global(.dark) .header-option:focus-visible {
    background: rgba(194, 166, 106, 0.3) !important;
  }

  :global(.dark) .header-option-accent:hover,
  :global(.dark) .header-option-accent:focus-visible {
    background: rgba(194, 166, 106, 0.3) !important;
  }

  :global(.dark) .header-option-danger:hover,
  :global(.dark) .header-option-danger:focus-visible {
    background: rgba(186, 77, 77, 0.22) !important;
  }

  :global(.dark) .header-option-icon,
  :global(.dark) .header-option-icon-danger {
    color: color-mix(in srgb, var(--surface-overlay) 62%, var(--text-primary) 38%);
  }

  :global(.dark) .header-option-icon-accent {
    color: var(--accent);
  }

  .mobile-user-trigger {
    color: var(--accent);
  }
  .mobile-user-trigger:hover,
  .mobile-user-trigger:focus-visible {
    color: var(--accent-hover);
  }

  .logout-button:hover {
    background-color: color-mix(in srgb, var(--accent) 12%, var(--surface-page) 88%);
    border-color: color-mix(in srgb, var(--accent) 38%, var(--border-default) 62%);
    color: var(--text-primary);
  }

  @media (max-width: 767px) {
    .hide-on-mobile {
      display: none !important;
    }
  }

  @media (min-width: 768px) {
    .hide-on-desktop-md {
      display: none !important;
    }
  }

  @media (min-width: 1024px) {
    .mobile-sidebar-toggle {
      display: none !important;
    }
  }
</style>
```

### 5.5 Theme Toggle Component

**File:** `/Users/lvt53/Desktop/langflow-design/src/lib/components/layout/ThemeToggle.svelte`

**Structure (Exact Classes):**
```svelte
<button
  data-testid="theme-toggle"
  class="btn-icon relative"
  on:click={toggleTheme}
  title={tooltipText}
  aria-label="Toggle theme">
  <div class="relative flex h-[20px] w-[20px] items-center justify-center overflow-hidden">
    <!-- Sun Icon -->
    <svg
      class="absolute h-full w-full transition-all duration-[var(--duration-emphasis)]
             {$isDark ? '-rotate-90 opacity-0 scale-50' : 'rotate-0 opacity-100 scale-100'}">
      <!-- Sun SVG paths -->
    </svg>
    <!-- Moon Icon -->
    <svg
      class="absolute h-full w-full transition-all duration-[var(--duration-emphasis)]
             {$isDark ? 'rotate-0 opacity-100 scale-100' : 'rotate-90 opacity-0 scale-50'}">
      <!-- Moon SVG path -->
    </svg>
  </div>
</button>
```

**Animation Details:**
- Duration: `var(--duration-emphasis)` (250ms)
- Sun: `-rotate-90 opacity-0 scale-50` when dark mode
- Moon: `rotate-0 opacity-100 scale-100` when dark mode
- Easing: default CSS ease

### 5.6 Conversation Item Component

**File:** `/Users/lvt53/Desktop/langflow-design/src/lib/components/sidebar/ConversationItem.svelte`

**Item Container (Exact Classes):**
```svelte
<div
  data-testid="conversation-item"
  class="group relative flex min-h-[40px] cursor-pointer items-center justify-between 
         rounded-xl border border-transparent transition-colors duration-150 
         hover:border-border-subtle hover:bg-surface-elevated focus-visible:bg-surface-elevated 
         focus-visible:outline-none"
  style="padding: 0 3px 0 10px;"
  class:bg-surface-elevated={active}
  class:border-accent={active}
  class:shadow-sm={active}>
```

**Title Text (Exact Classes):**
```svelte
<div class="truncate px-2 text-[14px] font-sans text-text-primary">
  {conversation.title}
</div>
```

**Edit Input (Exact Classes):**
```svelte
<input
  data-testid="title-input"
  class="min-h-[44px] w-full rounded-sm border border-border bg-surface-page px-2 py-1 
         text-sm font-sans text-text-primary outline-none 
         focus-visible:ring-2 focus-visible:ring-accent">
```

**Options Menu Trigger (Exact Classes):**
```svelte
<button
  class="btn-icon-bare flex min-h-[36px] min-w-[36px] flex-shrink-0 items-center justify-center 
         rounded-lg text-icon-muted opacity-100 transition-colors duration-150 
         hover:bg-surface-page hover:text-icon-primary hover:opacity-100 
         focus-visible:bg-surface-page focus-visible:opacity-100 focus-visible:outline-none 
         md:opacity-0 md:group-hover:opacity-100 cursor-pointer"
  class:opacity-100={menuOpen || active}
  class:md:opacity-100={menuOpen || active}
  aria-label="Conversation options">
  <!-- Three dots icon -->
</button>
```

**Dropdown Menu (Exact Classes):**
```svelte
<div
  class="conversation-menu z-[9999] overflow-hidden rounded-[0.75rem] border p-[5px]"
  style={`${menuPositionStyle} --conversation-menu-bg: ${menuBaseBackground}; background: ${menuBaseBackground};`}>
```

**Menu Option (Exact Classes):**
```svelte
<button
  data-testid="rename-option"
  class="conversation-option flex min-h-[38px] w-full items-center px-[3px] py-[3px] 
         text-left text-sm font-sans text-text-primary transition-colors duration-150 
         focus-visible:outline-none cursor-pointer">
  <svg class="conversation-option-icon">
    <!-- Icon -->
  </svg>
  <span>Rename</span>
</button>
```

**Menu Option Danger (Exact Classes):**
```svelte
<button
  data-testid="delete-option"
  class="conversation-option conversation-option-danger flex min-h-[38px] w-full items-center 
         px-[3px] py-[3px] text-left text-sm font-sans text-text-primary 
         transition-colors duration-150 focus-visible:outline-none cursor-pointer">
  <svg class="conversation-option-icon conversation-option-icon-danger">
    <!-- Trash icon -->
  </svg>
  <span>Delete</span>
</button>
```

**Conversation Item Custom CSS:**
```css
<style>
  .conversation-menu {
    border-color: color-mix(in srgb, var(--border-default) 76%, var(--surface-page) 24%);
    isolation: isolate;
    pointer-events: auto;
    box-shadow:
      0 14px 30px rgba(0, 0, 0, 0.14),
      0 1px 0 color-mix(in srgb, var(--border-default) 88%, transparent 12%);
  }

  :global(.dark) .conversation-menu {
    border-color: color-mix(in srgb, var(--border-default) 84%, transparent 16%);
    box-shadow:
      0 16px 32px rgba(0, 0, 0, 0.4),
      0 0 0 1px color-mix(in srgb, var(--border-default) 88%, transparent 12%);
  }

  .conversation-option {
    border: 0;
    border-radius: 0.75rem;
    background: var(--conversation-menu-bg);
    padding-inline: 0.65rem;
    gap: 0.8rem;
  }

  .conversation-option:hover,
  .conversation-option:focus-visible {
    background: rgba(194, 166, 106, 0.24) !important;
  }

  .conversation-option-danger:hover,
  .conversation-option-danger:focus-visible {
    background: rgba(186, 77, 77, 0.14) !important;
  }

  .conversation-option-icon {
    margin-right: 7px;
    color: color-mix(in srgb, var(--surface-overlay) 45%, var(--text-primary) 55%);
  }

  :global(.dark) .conversation-option:hover,
  :global(.dark) .conversation-option:focus-visible {
    background: rgba(194, 166, 106, 0.3) !important;
  }

  :global(.dark) .conversation-option-danger:hover,
  :global(.dark) .conversation-option-danger:focus-visible {
    background: rgba(186, 77, 77, 0.22) !important;
  }

  :global(.dark) .conversation-option-icon,
  :global(.dark) .conversation-option-icon-danger {
    color: color-mix(in srgb, var(--surface-overlay) 62%, var(--text-primary) 38%);
  }
</style>
```

### 5.7 Code Block Component

**File:** `/Users/lvt53/Desktop/langflow-design/src/lib/components/chat/CodeBlock.svelte`

**Container (Exact Classes):**
```svelte
<div
  class="group relative my-md w-full overflow-hidden rounded-lg border border-border 
         bg-surface-code shadow-sm font-mono text-[14px]">
```

**Header (Exact Classes):**
```svelte
<div
  class="flex items-center justify-between border-b border-border bg-surface-elevated 
         px-md py-sm text-[12px] font-sans text-text-muted">
  {#if language}
    <span class="lowercase">{language}</span>
  {/if}
  <button
    type="button"
    class="btn-icon-bare gap-1.5 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
    aria-label="Copy code">
    <!-- Copy icon or "Copied!" text -->
  </button>
</div>
```

**Code Content (Exact Classes):**
```svelte
<div class="code-content w-full overflow-x-auto p-md text-[14px] leading-[1.5]">
  <slot></slot>
</div>
```

**CodeBlock Custom CSS:**
```css
<style lang="postcss">
  .code-content :global(pre) {
    margin: 0 !important;
    padding: 0 !important;
    background: transparent !important;
    min-width: 100%;
    width: max-content;
  }
  .code-content :global(code) {
    font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  }
</style>
```

### 5.8 Loading Indicator Component

**File:** `/Users/lvt53/Desktop/langflow-design/src/lib/components/chat/LoadingIndicator.svelte`

**Structure (Exact Classes):**
```svelte
<div class="flex items-center gap-2 py-4 text-text-muted dark:text-text-muted">
  <div class="flex items-center gap-1 h-4" aria-hidden="true">
    <div class="dot"></div>
    <div class="dot"></div>
    <div class="dot"></div>
  </div>
  <span class="text-xs font-medium">{message}</span>
</div>
```

**Animation CSS:**
```css
<style>
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: currentColor;
    animation: bounce 1.4s infinite ease-in-out both;
  }
  .dot:nth-child(1) {
    animation-delay: -0.32s;
  }
  .dot:nth-child(2) {
    animation-delay: -0.16s;
  }

  @keyframes bounce {
    0%, 80%, 100% {
      transform: scale(0);
    }
    40% {
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dot {
      animation: none;
      transform: scale(1);
      opacity: 0.7;
    }
  }
</style>
```

### 5.9 Message Loading Component

**File:** `/Users/lvt53/Desktop/langflow-design/src/lib/components/chat/MessageLoading.svelte`

**Structure (Exact Classes):**
```svelte
<div class="flex flex-col items-start gap-sm p-md">
  <div class="flex items-center gap-xs h-[24px]">
    <div class="h-2 w-2 rounded-full bg-accent dot-pulse" style="animation-delay: 0ms"></div>
    <div class="h-2 w-2 rounded-full bg-accent dot-pulse" style="animation-delay: 100ms"></div>
    <div class="h-2 w-2 rounded-full bg-accent dot-pulse" style="animation-delay: 200ms"></div>
  </div>
  <div class="text-[14px] font-sans text-text-muted">{label}</div>
</div>
```

**Animation CSS:**
```css
<style>
  .dot-pulse {
    animation: pulse 600ms infinite;
    opacity: 0.4;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.4; transform: scale(0.8); }
    50% { opacity: 1; transform: scale(1); }
  }

  @media (prefers-reduced-motion: reduce) {
    .dot-pulse {
      animation: none;
      opacity: 1;
    }
  }
</style>
```

### 5.10 Error Message Component

**File:** `/Users/lvt53/Desktop/langflow-design/src/lib/components/chat/ErrorMessage.svelte`

**Structure (Exact Classes):**
```svelte
<div class="mb-5 flex items-center gap-3 rounded-md border border-danger border-t 
            bg-surface-elevated p-[10px] shadow-sm">
  <div class="flex-shrink-0">
    <svg class="h-5 w-5 text-icon-primary" viewBox="0 0 20 20" fill="currentColor">
      <!-- Error icon (circle with X) -->
    </svg>
  </div>
  <div>
    <p class="text-sm text-text-primary">{error}</p>
  </div>
  <div class="ml-auto">
    <button on:click={onRetry} class="btn-primary">Retry</button>
  </div>
</div>
```

### 5.11 Confirm Dialog Component

**File:** `/Users/lvt53/Desktop/langflow-design/src/lib/components/ui/ConfirmDialog.svelte`

**Backdrop (Exact Classes):**
```svelte
<div class="fixed inset-0 z-50 flex items-center justify-center p-md">
  <div class="absolute inset-0 bg-surface-page opacity-80 backdrop-blur-sm">
```

**Dialog Container (Exact Classes):**
```svelte
<div
  role="dialog"
  aria-modal="true"
  class="relative w-full max-w-[480px] rounded-lg border border-border bg-surface-page 
         p-lg shadow-lg">
```

**Title (Exact Classes):**
```svelte
<h2 id="dialog-title" class="mb-sm text-xl font-semibold text-text-primary">
  {title}
</h2>
```

**Message (Exact Classes):**
```svelte
<p id="dialog-message" class="mb-lg text-text-muted">
  {message}
</p>
```

**Button Row (Exact Classes):**
```svelte
<div class="flex justify-end gap-md">
  <button type="button" class="btn-secondary" on:click={handleCancel}>
    {cancelText}
  </button>
  <button
    type="button"
    class={confirmVariant === 'danger' ? 'btn-danger' : 'btn-primary'}
    on:click={handleConfirm}>
    {confirmText}
  </button>
</div>
```

### 5.12 Toast Component

**File:** `/Users/lvt53/Desktop/langflow-design/src/lib/components/layout/Toast.svelte`

**Structure (Exact Classes):**
```svelte
<div
  class="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-[var(--text-primary)] 
         text-[var(--bg-primary)] px-6 py-3 rounded-lg shadow-[var(--shadow-lg)] 
         opacity-0 transition-opacity duration-[var(--duration-emphasis)] ease-out z-50"
  class:opacity-100={$toast.visible}
  role="alert"
  aria-live="polite">
  {$toast.message}
</div>
```

### 5.13 Message Area Component

**File:** `/Users/lvt53/Desktop/langflow-design/src/lib/components/chat/MessageArea.svelte`

**Scroll Container (Exact Classes):**
```svelte
<div
  bind:this={scrollContainer}
  on:scroll={handleScroll}
  class="h-full min-h-0 overflow-y-auto px-sm py-lg md:px-lg md:py-xl lg:px-xl"
  style="touch-action: pan-y;"
  aria-live="polite"
  aria-atomic="false">
```

**Message List (Exact Classes):**
```svelte
<div class="mx-auto flex min-h-full w-full max-w-[760px] flex-col gap-lg">
  {#each messages as message (message.id)}
    <MessageBubble {message} />
  {/each}
  <div class="scroll-clearance" aria-hidden="true"></div>
</div>
```

**Custom CSS:**
```css
<style>
  .scroll-clearance {
    height: 9rem;
    flex: 0 0 auto;
  }

  @media (min-width: 768px) {
    .scroll-clearance {
      height: 11rem;
    }
  }
</style>
```

### 5.14 Markdown Renderer Component

**File:** `/Users/lvt53/Desktop/langflow-design/src/lib/components/chat/MarkdownRenderer.svelte`

**Container (Exact Classes):**
```svelte
<div aria-hidden="false">
  {#each blocks as block}
    {#if block.type === 'html'}
      <div class="prose max-w-none dark:prose-invert markdown-html">
        {@html block.html}
      </div>
    {:else}
      <CodeBlock code={block.code} language={block.language}>
        {@html block.html}
      </CodeBlock>
    {/if}
  {/each}
  {#if isStreaming}<span class="streaming-cursor">▌</span>{/if}
</div>
```

**Streaming Cursor CSS:**
```css
<style>
  .markdown-html :global(*:last-child) {
    margin-bottom: 0;
  }

  .streaming-cursor {
    display: inline-block;
    animation: blink 1s step-start infinite;
    color: currentColor;
    user-select: none;
  }

  @keyframes blink {
    0%, 50% { opacity: 1 }
    51%, 100% { opacity: 0 }
  }
</style>
```

### 5.15 Chat Page Layout

**File:** `/Users/lvt53/Desktop/langflow-design/src/routes/(app)/chat/[conversationId]/+page.svelte`

**Chat Stage (Exact Classes):**
```svelte
<div class="chat-page flex h-full min-w-0 flex-col bg-surface-page pb-2 md:pb-4 lg:pb-6">
  <div class="chat-stage relative flex min-h-0 flex-1 overflow-hidden rounded-lg">
```

**Message Layer (Exact Classes):**
```svelte
<div class="message-layer min-h-0 flex-1" class:message-layer-active={hasMessages}>
  <MessageArea messages={$messages} />
</div>
```

**Composer Layer (Exact Classes):**
```svelte
<div class="composer-layer" class:composer-layer-active={hasMessages}>
  <div class="mx-auto flex w-full max-w-[780px] flex-col gap-4 px-1">
    <div class="intro-copy text-center" class:intro-copy-hidden={hasMessages}>
      <h1 class="text-balance text-[2rem] font-serif font-medium tracking-[-0.05em] md:text-[4rem]"
          style="color: color-mix(in srgb, var(--text-primary) 60%, var(--accent) 40%); font-weight: 500;">
        What can I help you with?
      </h1>
    </div>
    {#if sendError}
      <ErrorMessage error={sendError} onRetry={handleRetry} />
    {/if}
    <MessageInput on:send={handleSend} disabled={isSending} />
  </div>
</div>
```

**Chat Page Custom CSS:**
```css
<style>
  .chat-stage {
    padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
  }

  .message-layer {
    opacity: 0;
    transform: translateY(18px);
    pointer-events: none;
    transition:
      opacity 220ms cubic-bezier(0.22, 1, 0.36, 1),
      transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .message-layer-active {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  .composer-layer {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    transition:
      top 320ms cubic-bezier(0.22, 1, 0.36, 1),
      transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .composer-layer-active {
    top: 100%;
    transform: translateY(calc(-100% - max(1.5rem, env(safe-area-inset-bottom))));
  }

  .intro-copy {
    max-height: 10rem;
    opacity: 1;
    transform: translateY(0);
    transition:
      opacity 220ms cubic-bezier(0.22, 1, 0.36, 1),
      transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
      max-height 240ms cubic-bezier(0.22, 1, 0.36, 1),
      margin 240ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .intro-copy-hidden {
    max-height: 0;
    margin: 0;
    opacity: 0;
    transform: translateY(-12px);
    overflow: hidden;
    pointer-events: none;
  }
</style>
```

### 5.16 Login Page

**File:** `/Users/lvt53/Desktop/langflow-design/src/routes/login/+page.svelte`

**Page Container (Exact Classes):**
```svelte
<div class="flex min-h-[100svh] w-full items-center justify-center bg-surface-page px-4 py-6 md:px-8 md:py-10">
```

**Card Container (Exact Classes):**
```svelte
<div class="mx-auto w-full max-w-[448px] rounded-lg border border-border bg-surface-elevated 
            p-xl md:p-2xl shadow-lg">
```

**Title (Exact Classes):**
```svelte
<h1 class="mb-3 text-4xl font-serif font-bold text-text-primary md:text-5xl">Sign In</h1>
```

**Subtitle (Exact Classes):**
```svelte
<p class="mb-[30px] text-lg text-text-muted font-serif">Welcome back. Please enter your details.</p>
```

**Input Field (Exact Classes):**
```svelte
<input
  id="email"
  type="email"
  class="box-border block w-full min-h-[48px] rounded-md border border-border bg-surface-page 
         px-md py-sm font-serif text-base text-text-primary shadow-sm transition-shadow 
         focus:border-focus-ring focus:bg-surface-overlay focus:outline-none 
         focus:ring-2 focus:ring-focus-ring disabled:opacity-50"
  placeholder="you@example.com">
```

**Submit Button (Exact Classes):**
```svelte
<button
  type="submit"
  disabled={loading}
  class="mt-8 flex min-h-[56px] w-full cursor-pointer items-center justify-center rounded-md 
         border border-transparent bg-accent px-md py-sm text-lg font-serif font-bold 
         text-surface-page shadow-sm transition-all hover:bg-accent-hover focus:outline-none 
         focus:ring-2 focus:ring-offset-2 focus:ring-focus-ring disabled:cursor-not-allowed 
         disabled:opacity-70">
  {#if loading}
    <!-- Loading spinner -->
    Signing in...
  {:else}
    Sign In
  {/if}
</button>
```

### 5.17 App Layout

**File:** `/Users/lvt53/Desktop/langflow-design/src/routes/(app)/+layout.svelte`

**App Shell (Exact Classes):**
```svelte
<div class="flex h-screen w-full flex-col overflow-hidden bg-primary text-text-primary">
  <Header user={data.user} />
  <div class="flex h-full flex-1 overflow-hidden">
    <Sidebar open={$sidebarOpen} on:new-conversation={() => {}} />
    <main class="relative flex h-full flex-1 flex-col overflow-hidden min-w-0">
      <slot />
    </main>
  </div>
</div>
```

---

## 6. Theme System Implementation

### 6.1 Theme Store

**File:** `/Users/lvt53/Desktop/langflow-design/src/lib/stores/theme.ts`

**Theme Type:**
```typescript
export type Theme = 'light' | 'dark' | 'system';
```

**Store Definition:**
```typescript
export const theme = writable<Theme>('system');

export const isDark = derived(theme, ($theme) => {
  if (typeof window === 'undefined') return false;
  if ($theme === 'dark') return true;
  if ($theme === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches;
  return false;
});
```

**Theme Application:**
```typescript
function applyTheme(t: Theme) {
  if (typeof window === 'undefined') return;

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const shouldBeDark = t === 'dark' || (t === 'system' && prefersDark);

  if (shouldBeDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}
```

**Initialization:**
```typescript
export function initTheme() {
  if (typeof window === 'undefined') return;

  const stored = localStorage.getItem('theme') as Theme | null;
  const initialTheme: Theme = stored && ['light', 'dark', 'system'].includes(stored) 
    ? stored 
    : 'system';

  theme.set(initialTheme);
  applyTheme(initialTheme);

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (get(theme) === 'system') {
      applyTheme('system');
    }
  });
}
```

**Setting Theme:**
```typescript
export function setTheme(t: Theme) {
  theme.set(t);
  localStorage.setItem('theme', t);
  applyTheme(t);
}
```

### 6.2 Tailwind Configuration

**Dark Mode Setting:**
```javascript
// tailwind.config.ts
darkMode: 'class'
```

This enables manual dark mode toggling by adding/removing the `.dark` class on `document.documentElement`.

---

## 7. Responsive Design System

### 7.1 Breakpoints

**Tailwind Default Breakpoints:**
| Name | Value | Usage |
|------|-------|-------|
| `sm` | 640px | Small tablets |
| `md` | 768px | Tablet breakpoint |
| `lg` | 1024px | Desktop breakpoint (sidebar always visible) |
| `xl` | 1280px | Large desktop |

**JavaScript Breakpoint Reference:**
```typescript
// src/lib/stores/ui.ts
export const SIDEBAR_DESKTOP_BREAKPOINT = 1024;
```

### 7.2 Sidebar Behavior

| Viewport | Width | Behavior |
|----------|-------|----------|
| `< 1024px` | 100vw | Overlay, slides from left, can be toggled |
| `>= 1024px` | 360px (expanded) / 48px (collapsed) | Static position, always visible |

### 7.3 Common Responsive Patterns

**Hide on Mobile (`< 768px`):**
```css
@media (max-width: 767px) {
  .hide-on-mobile {
    display: none !important;
  }
}
```

**Hide on Desktop Medium (`>= 768px`):**
```css
@media (min-width: 768px) {
  .hide-on-desktop-md {
    display: none !important;
  }
}
```

**Hide Mobile Sidebar Toggle on Desktop:**
```css
@media (min-width: 1024px) {
  .mobile-sidebar-toggle {
    display: none !important;
  }
}
```

### 7.4 Container Widths

| Container | Mobile | Tablet | Desktop |
|-----------|--------|--------|---------|
| Sidebar | 100vw | 100vw (overlay) | 360px / 48px |
| Message content | 100% - 32px | 100% - 32px | max-width: 760px |
| Chat composer | 100% - 32px | 100% - 32px | max-width: 780px |
| Search modal | 100% - 32px | 560px max | 560px max |
| Confirm dialog | 100% - 32px | 480px max | 480px max |
| Login card | 100% - 32px | 448px max | 448px max |

---

## 8. Accessibility Requirements

### 8.1 Focus Management

**Focus Ring (All Interactive Elements):**
```css
box-shadow: 0 0 0 2px var(--focus-ring);
```

Applied via `:focus-visible` pseudo-class.

**Focus Restoration:**
- Dialogs must restore focus to the triggering element on close
- Use `previousFocus` variable to store active element before opening modal

### 8.2 Reduced Motion Support

**Global Reduced Motion:**
```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }

  :root {
    --duration-micro: 0.01ms;
    --duration-standard: 0.01ms;
    --duration-emphasis: 0.01ms;
  }
}
```

**Component-Specific (Loading Indicators):**
```css
@media (prefers-reduced-motion: reduce) {
  .dot {
    animation: none;
    transform: scale(1);
    opacity: 0.7;
  }
}
```

### 8.3 ARIA Requirements

**Live Regions:**
```svelte
<!-- Message area announces new messages -->
<div aria-live="polite" aria-atomic="false">
```

**Toast Notifications:**
```svelte
<div role="alert" aria-live="polite">
```

**Icon Buttons:**
All icon-only buttons must have `aria-label`:
```svelte
<button aria-label="Close sidebar">
  <!-- Icon -->
</button>
```

**Dialogs:**
```svelte
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="dialog-title"
  aria-describedby="dialog-message">
```

### 8.4 Touch Targets

**Minimum Size:** 44px × 44px

All tappable elements must meet this minimum:
- Sidebar conversation items
- Buttons
- Send button
- Hamburger menu
- Theme toggle
- Options menu triggers

---

## 9. Layout Architecture

### 9.1 Scroll Ownership Contract

From `/Users/lvt53/Desktop/langflow-design/src/app.css`:

```css
/**
 * SCROLL OWNERSHIP CONTRACT
 * =========================
 * 
 * - BODY: Never scrolls (overscroll-behavior: none)
 * - APP ROOT: h-screen overflow-hidden (contains the entire app)
 * - SIDEBAR LIST: overflow-y-auto (scrollable conversation list)
 * - MESSAGE AREA: overflow-y-auto (scrollable message list)
 * - MAIN CONTENT: No scroll (contained by message area)
 */
```

**Body Styles:**
```css
body {
  margin: 0;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  overflow: hidden;
  overscroll-behavior: none;
}
```

### 9.2 Safe Area Insets (Mobile)

**CSS Custom Properties:**
```css
.pt-safe {
  padding-top: env(safe-area-inset-top);
}

.px-safe {
  padding-left: max(1rem, env(safe-area-inset-left));
  padding-right: max(1rem, env(safe-area-inset-right));
}

.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}
```

**Header Safe Area:**
```svelte
<header class="pt-[max(0.35rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
```

**Chat Stage Safe Area:**
```css
.chat-stage {
  padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
}
```

**Composer Safe Area:**
```css
.composer-layer-active {
  transform: translateY(calc(-100% - max(1.5rem, env(safe-area-inset-bottom))));
}
```

---

## 10. Icon Specifications

### 10.1 Icon Sizes

| Usage | Size | Stroke Width |
|-------|------|--------------|
| Small (menu items) | 16px | 2 |
| Medium (buttons) | 18px | 2 |
| Large (sidebar toggle) | 20px | 2 |
| Extra Large (header) | 24px | 2 |

### 10.2 Common Icons

**Hamburger Menu (3 horizontal lines):**
```svg
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <line x1="3" x2="21" y1="6" y2="6" />
  <line x1="3" x2="21" y1="12" y2="12" />
  <line x1="3" x2="21" y1="18" y2="18" />
</svg>
```

**Plus (New Chat):**
```svg
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <line x1="12" x2="12" y1="5" y2="19" />
  <line x1="5" x2="19" y1="12" y2="12" />
</svg>
```

**Search:**
```svg
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1">
  <circle cx="11" cy="11" r="7"></circle>
  <path d="m20 20-3.5-3.5"></path>
</svg>
```

**Three Dots (Options):**
```svg
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <circle cx="12" cy="12" r="1" />
  <circle cx="12" cy="5" r="1" />
  <circle cx="12" cy="19" r="1" />
</svg>
```

**Sun (Light Mode):**
```svg
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <circle cx="12" cy="12" r="5" />
  <line x1="12" y1="1" x2="12" y2="3" />
  <line x1="12" y1="21" x2="12" y2="23" />
  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
  <line x1="1" y1="12" x2="3" y2="12" />
  <line x1="21" y1="12" x2="23" y2="12" />
  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
</svg>
```

**Moon (Dark Mode):**
```svg
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
</svg>
```

**Paperclip (Attach):**
```svg
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
</svg>
```

**Send:**
```svg
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <line x1="22" x2="11" y1="2" y2="13" />
  <polygon points="22 2 15 22 11 13 2 9 22 2" />
</svg>
```

**Copy:**
```svg
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
</svg>
```

**Checkmark (Copied):**
```svg
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <polyline points="20 6 9 17 4 12"></polyline>
</svg>
```

**Close (X):**
```svg
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <line x1="18" x2="6" y1="6" y2="18" />
  <line x1="6" x2="18" y1="6" y2="18" />
</svg>
```

**Chevron Left:**
```svg
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
  <polyline points="15 18 9 12 15 6" />
</svg>
```

**Chevron Right:**
```svg
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
  <polyline points="9 18 15 12 9 6" />
</svg>
```

**User:**
```svg
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M20 21a8 8 0 0 0-16 0" />
  <circle cx="12" cy="8" r="5" />
</svg>
```

**Logout:**
```svg
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1">
  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
  <polyline points="16 17 21 12 16 7"></polyline>
  <line x1="21" y1="12" x2="9" y2="12"></line>
</svg>
```

**Rename:**
```svg
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M12 20h9" />
  <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
</svg>
```

**Trash (Delete):**
```svg
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M3 6h18" />
  <path d="M8 6V4h8v2" />
  <path d="M19 6l-1 14H6L5 6" />
  <path d="M10 11v6" />
  <path d="M14 11v6" />
</svg>
```

**Error Circle:**
```svg
<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd" />
</svg>
```

**Chat Bubble:**
```svg
<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
</svg>
```

---

## 11. Syntax Highlighting

### 11.1 Shiki Configuration

**File:** `/Users/lvt53/Desktop/langflow-design/src/lib/services/markdown.ts`

**Highlighter Initialization:**
```typescript
highlighter = await createHighlighter({
  themes: ['github-light', 'github-dark'],
  langs: ['javascript', 'typescript', 'python', 'bash', 'json', 'html', 'css', 'yaml', 'markdown']
});
```

**Theme Selection:**
```typescript
const theme = isDark ? 'github-dark' : 'github-light';
```

---

## 12. Prose/Markdown Styles

### 12.1 Typography Plugin Configuration

**Tailwind Plugin:**
```javascript
plugins: [require('@tailwindcss/typography')]
```

### 12.2 Prose Styles (from app.css)

**Code Blocks:**
```css
.prose pre {
  background-color: var(--surface-code);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  overflow-x: auto;
  margin: var(--space-md) 0;
}
```

**Inline Code:**
```css
.prose code {
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  background-color: var(--surface-code);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-size: 14px;
}
```

**Code in Pre (No Extra Styling):**
```css
.prose pre code {
  background-color: transparent;
  padding: 0;
  font-size: 14px;
}
```

### 12.3 Markdown Renderer Classes

**Container:**
```svelte
<div class="prose max-w-none dark:prose-invert markdown-html">
```

**Dark Mode Inversion:**
The `dark:prose-invert` class automatically inverts prose colors for dark mode.

---

## 13. Animation Specifications

### 13.1 Keyframe Definitions

**Fade In:**
```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

**Pulse (Loading):**
```css
@keyframes pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1); }
}
```

**Bounce (Three Dots):**
```css
@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}
```

**Blink (Cursor):**
```css
@keyframes blink {
  0%, 50% { opacity: 1 }
  51%, 100% { opacity: 0 }
}
```

### 13.2 Svelte Transitions

**Fade:**
```svelte
transition:fade={{ duration: 250 }}
```

**Scale (Modals):**
```svelte
transition:scale={{ duration: 150, start: 0.95 }}
```

### 13.3 Custom Easing Functions

**Primary Easing:**
```css
cubic-bezier(0.22, 1, 0.36, 1)  /* Smooth deceleration */
```

Used for:
- Sidebar transitions (240ms)
- Message layer transitions (220ms, 280ms)
- Composer layer transitions (320ms)
- Intro copy transitions (220ms, 240ms)

**Standard Ease Out:**
```css
cubic-bezier(0.4, 0, 0.2, 1)  /* Material Design standard */
```

Used for:
- Button transitions
- Color transitions
- Opacity transitions

---

## 14. File Locations Reference

### 14.1 Configuration Files

| File | Purpose |
|------|---------|
| `/Users/lvt53/Desktop/langflow-design/tailwind.config.ts` | Tailwind CSS configuration with custom theme tokens |
| `/Users/lvt53/Desktop/langflow-design/src/app.css` | Global CSS, CSS variables, button design system |
| `/Users/lvt53/Desktop/langflow-design/postcss.config.js` | PostCSS configuration |

### 14.2 Component Files

| Component | File |
|-----------|------|
| Sidebar | `/Users/lvt53/Desktop/langflow-design/src/lib/components/layout/Sidebar.svelte` |
| Header | `/Users/lvt53/Desktop/langflow-design/src/lib/components/layout/Header.svelte` |
| ThemeToggle | `/Users/lvt53/Desktop/langflow-design/src/lib/components/layout/ThemeToggle.svelte` |
| Toast | `/Users/lvt53/Desktop/langflow-design/src/lib/components/layout/Toast.svelte` |
| ChatArea | `/Users/lvt53/Desktop/langflow-design/src/lib/components/layout/ChatArea.svelte` |
| MessageBubble | `/Users/lvt53/Desktop/langflow-design/src/lib/components/chat/MessageBubble.svelte` |
| MessageInput | `/Users/lvt53/Desktop/langflow-design/src/lib/components/chat/MessageInput.svelte` |
| MessageArea | `/Users/lvt53/Desktop/langflow-design/src/lib/components/chat/MessageArea.svelte` |
| MarkdownRenderer | `/Users/lvt53/Desktop/langflow-design/src/lib/components/chat/MarkdownRenderer.svelte` |
| CodeBlock | `/Users/lvt53/Desktop/langflow-design/src/lib/components/chat/CodeBlock.svelte` |
| LoadingIndicator | `/Users/lvt53/Desktop/langflow-design/src/lib/components/chat/LoadingIndicator.svelte` |
| MessageLoading | `/Users/lvt53/Desktop/langflow-design/src/lib/components/chat/MessageLoading.svelte` |
| ErrorMessage | `/Users/lvt53/Desktop/langflow-design/src/lib/components/chat/ErrorMessage.svelte` |
| ConversationItem | `/Users/lvt53/Desktop/langflow-design/src/lib/components/sidebar/ConversationItem.svelte` |
| ConversationList | `/Users/lvt53/Desktop/langflow-design/src/lib/components/sidebar/ConversationList.svelte` |
| ConfirmDialog | `/Users/lvt53/Desktop/langflow-design/src/lib/components/ui/ConfirmDialog.svelte` |

### 14.3 Page Files

| Page | File |
|------|------|
| Login | `/Users/lvt53/Desktop/langflow-design/src/routes/login/+page.svelte` |
| Chat | `/Users/lvt53/Desktop/langflow-design/src/routes/(app)/chat/[conversationId]/+page.svelte` |
| App Layout | `/Users/lvt53/Desktop/langflow-design/src/routes/(app)/+layout.svelte` |

### 14.4 Store Files

| Store | File |
|-------|------|
| Theme | `/Users/lvt53/Desktop/langflow-design/src/lib/stores/theme.ts` |
| UI | `/Users/lvt53/Desktop/langflow-design/src/lib/stores/ui.ts` |
| Toast | `/Users/lvt53/Desktop/langflow-design/src/lib/stores/toast.ts` |
| Conversations | `/Users/lvt53/Desktop/langflow-design/src/lib/stores/conversations.ts` |

### 14.5 Service Files

| Service | File |
|---------|------|
| Markdown | `/Users/lvt53/Desktop/langflow-design/src/lib/services/markdown.ts` |

---

## 15. Implementation Checklist for New Components

When creating a new component, verify:

### 15.1 Colors
- [ ] All colors use CSS custom properties, not hardcoded hex values
- [ ] Use semantic tokens (`--surface-*`, `--text-*`, `--accent`, etc.)
- [ ] Test both light and dark modes
- [ ] Focus states use `--focus-ring`

### 15.2 Spacing
- [ ] All spacing is in multiples of 4px
- [ ] Use `--space-xs` through `--space-2xl` tokens
- [ ] Touch targets are minimum 44px × 44px

### 15.3 Typography
- [ ] `font-serif` for content/text
- [ ] `font-sans` for UI elements
- [ ] `font-mono` for code
- [ ] Minimum readable size is 14px
- [ ] Metadata can use 12px

### 15.4 Buttons
- [ ] Use appropriate button class (`.btn-primary`, `.btn-secondary`, etc.)
- [ ] Minimum height 44px
- [ ] Focus-visible ring applied
- [ ] Hover state defined

### 15.5 Animations
- [ ] Use `--duration-micro` (100ms) for hover/focus
- [ ] Use `--duration-standard` (150ms) for standard transitions
- [ ] Use `--duration-emphasis` (250ms) for layout changes
- [ ] Reduced motion support included

### 15.6 Accessibility
- [ ] ARIA labels on icon buttons
- [ ] Focus trap in modals
- [ ] Focus restoration on modal close
- [ ] Color contrast meets WCAG AA

### 15.7 Responsive
- [ ] Mobile-first approach
- [ ] Test at 768px and 1024px breakpoints
- [ ] Safe area insets for mobile
- [ ] Touch targets work on mobile

---

## 16. Common Tailwind Patterns

### 16.1 Conditional Classes in Svelte

```svelte
<div class="base-classes"
     class:conditional-class={condition}
     class:another-class={otherCondition}>
```

### 16.2 Dark Mode Classes

```svelte
<div class="light-classes dark:dark-classes">
```

### 16.3 Responsive Classes

```svelte
<div class="mobile-classes md:tablet-classes lg:desktop-classes">
```

### 16.4 Custom Values in Brackets

```svelte
<div class="text-[16px] leading-[1.6] tracking-[-0.03em]">
```

---

## Document Version

**Generated:** 2026-03-18
**Project:** AlfyAI Chat Application
**Framework:** SvelteKit + Tailwind CSS
**Design System:** Warm Minimalism (Claude-inspired)

---

**END OF SPECIFICATION**

---

## Appendix A: CSS Variable Definitions (from app.css)

This is the exact content of `/Users/lvt53/Desktop/langflow-design/src/app.css` showing all CSS custom property definitions:

```css
@config "../tailwind.config.ts";
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --space-xs: 4px;
    --space-sm: 8px;
    --space-md: 16px;
    --space-lg: 24px;
    --space-xl: 32px;
    --space-2xl: 48px;

    --ease-out: cubic-bezier(0.4, 0, 0.2, 1);

    /* Legacy Colors (kept for backward compatibility) */
    --bg-primary: #FFFFFF;
    --bg-secondary: #F4F3EE;
    --bg-message-user: #F4F3EE;
    --bg-message-assistant: #FFFFFF;
    --bg-code: #F5F5F0;
    --bg-hover: #EEEDEA;
    
    --text-primary: #1A1A1A;
    --text-secondary: #6B6B6B;
    --text-code: #1A1A1A;
    
    --accent: #C15F3C;
    --accent-hover: #AE5630;
    
    --border: rgba(0,0,0,0.08);
    --border-focus: #C15F3C;
    
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
    --shadow-md: 0 2px 8px rgba(0,0,0,0.06);
    --shadow-lg: 0 4px 16px rgba(0,0,0,0.08);

    /* Semantic Tokens - Surface */
    --surface-page: #FFFFFF;
    --surface-elevated: #F4F3EE;
    --surface-overlay: #FAFAF8;
    --surface-code: #F5F5F0;
    
    /* Semantic Tokens - Text */
    --text-primary: #1A1A1A;
    --text-muted: #6B6B6B;
    
    /* Semantic Tokens - Icon */
    --icon-primary: #1A1A1A;
    --icon-muted: #6B6B6B;
    
    /* Semantic Tokens - Border */
    --border-default: rgba(0,0,0,0.08);
    --border-subtle: rgba(0,0,0,0.04);
    --border-focus: #C15F3C;
    
    /* Semantic Tokens - Status */
    --danger: #B91C1C;
    --danger-hover: #991B1B;
    --success: #15803D;
    --success-hover: #166534;
    
    /* Semantic Tokens - Interactive */
    --accent: #C15F3C;
    --accent-hover: #AE5630;
    --focus-ring: #C15F3C;
    
    /* Semantic Tokens - Radius */
    --radius-sm: 5px;
    --radius-md: 0.375rem;
    --radius-lg: 0.5rem;
    --radius-full: 9999px;
    
    /* Semantic Tokens - Duration */
    --duration-micro: 100ms;
    --duration-standard: 150ms;
    --duration-emphasis: 250ms;
  }

  .dark {
    /* Legacy Colors (kept for backward compatibility) */
    --bg-primary: #1A1A1A;
    --bg-secondary: #242424;
    --bg-message-user: #2A2A2A;
    --bg-message-assistant: #1A1A1A;
    --bg-code: #2A2A2A;
    --bg-hover: #333333;
    
    --text-primary: #ECECEC;
    --text-secondary: #8A8A8A;
    --text-code: #ECECEC;
    
    --accent: #D4836B;
    --accent-hover: #C15F3C;
    
    --border: rgba(255,255,255,0.08);
    --border-focus: #D4836B;
    
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.2);
    --shadow-md: 0 2px 8px rgba(0,0,0,0.2);
    --shadow-lg: 0 4px 16px rgba(0,0,0,0.2);

    /* Semantic Tokens - Surface */
    --surface-page: #1A1A1A;
    --surface-elevated: #242424;
    --surface-overlay: #2A2A2A;
    --surface-code: #2A2A2A;
    
    /* Semantic Tokens - Text */
    --text-primary: #ECECEC;
    --text-muted: #A0A0A0;
    
    /* Semantic Tokens - Icon */
    --icon-primary: #ECECEC;
    --icon-muted: #A0A0A0;
    
    /* Semantic Tokens - Border */
    --border-default: rgba(255,255,255,0.08);
    --border-subtle: rgba(255,255,255,0.04);
    --border-focus: #D4836B;
    
    /* Semantic Tokens - Status */
    --danger: #FF6B6B;
    --danger-hover: #FF5757;
    --success: #22C55E;
    --success-hover: #4ADE80;
    
    /* Semantic Tokens - Interactive */
    --accent: #D4836B;
    --accent-hover: #C15F3C;
    --focus-ring: #D4836B;
  }
}

body {
  margin: 0;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  overflow: hidden;
  overscroll-behavior: none;
}
```

---

## Appendix B: Tailwind Configuration (tailwind.config.ts)

This is the complete Tailwind configuration showing how custom tokens map to Tailwind classes:

```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic Color Tokens - Surface
        'surface-page': 'var(--surface-page)',
        'surface-elevated': 'var(--surface-elevated)',
        'surface-overlay': 'var(--surface-overlay)',
        'surface-code': 'var(--surface-code)',

        // Semantic Color Tokens - Text
        'text-primary': 'var(--text-primary)',
        'text-muted': 'var(--text-muted)',
        'text-code': 'var(--text-code)',

        // Semantic Color Tokens - Icon
        'icon-primary': 'var(--icon-primary)',
        'icon-muted': 'var(--icon-muted)',

        // Semantic Color Tokens - Border
        'border-default': 'var(--border-default)',
        'border-subtle': 'var(--border-subtle)',
        'border-focus': 'var(--border-focus)',
        'border': 'var(--border-default)',

        // Semantic Color Tokens - Status
        'danger': 'var(--danger)',
        'danger-hover': 'var(--danger-hover)',
        'success': 'var(--success)',
        'success-hover': 'var(--success-hover)',

        // Semantic Color Tokens - Interactive
        'accent': 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'focus-ring': 'var(--focus-ring)',

        // Legacy color support
        'primary': 'var(--bg-primary)',
        'secondary': 'var(--bg-secondary)',
      },
      spacing: {
        'xs': 'var(--space-xs)',    // 4px
        'sm': 'var(--space-sm)',    // 8px
        'md': 'var(--space-md)',    // 16px
        'lg': 'var(--space-lg)',    // 24px
        'xl': 'var(--space-xl)',    // 32px
        '2xl': 'var(--space-2xl)',  // 48px
      },
      borderRadius: {
        'sm': 'var(--radius-sm)',   // 5px
        'md': 'var(--radius-md)',   // 0.375rem
        'lg': 'var(--radius-lg)',   // 0.5rem
      },
      transitionDuration: {
        'micro': 'var(--duration-micro)',       // 100ms
        'standard': 'var(--duration-standard)', // 150ms
        'emphasis': 'var(--duration-emphasis)', // 250ms
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        serif: ['Georgia', 'Times New Roman', 'serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
} satisfies Config;
```

---

## Appendix C: Implementation Guide for AI Agents

This section provides step-by-step instructions for building new components that perfectly match the existing design system.

### C.1 Component Template (Copy This)

```svelte
<script lang="ts">
	// 1. IMPORTS - Order: Svelte, Stores, Types, Components
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';
	import { isDark, theme } from '$lib/stores/theme';
	import { sidebarOpen, currentConversationId } from '$lib/stores/ui';
	import { showToast } from '$lib/stores/toast';
	import type { ConversationListItem } from '$lib/types';
	
	// 2. PROPS - Use export let with types and defaults
	export let title: string = 'Default Title';
	export let active: boolean = false;
	export let maxItems: number = 10;
	
	// 3. EVENT DISPATCHER - Define event types
	const dispatch = createEventDispatcher<{
		select: { id: string };
		confirm: void;
	}>();
	
	// 4. LOCAL STATE
	let isLoading = false;
	let inputRef: HTMLInputElement;
	
	// 5. REACTIVE STATEMENTS
	$: isEmpty = !title || title.trim().length === 0;
	$: themeClass = $isDark ? 'dark-theme' : 'light-theme';
	
	// 6. HANDLER FUNCTIONS
	function handleClick() {
		dispatch('select', { id: '123' });
	}
	
	// 7. LIFECYCLE
	onMount(() => {
		// Initialize
	});
</script>

<!-- 8. TEMPLATE -->
<div 
	data-testid="my-component"
	class="my-component {themeClass}"
	class:active
	class:loading={isLoading}
>
	{#if isLoading}
		<div>Loading...</div>
	{:else}
		<button
			type="button"
			class="btn-primary"
			on:click={handleClick}
			disabled={isEmpty}
		>
			{displayTitle}
		</button>
	{/if}
</div>

<!-- 9. STYLES - Use lang="postcss" -->
<style lang="postcss">
	.my-component {
		padding: var(--space-md);
		background: var(--surface-elevated);
		border-radius: var(--radius-md);
	}
	
	:global(.dark) .my-component {
		background: var(--surface-overlay);
	}
</style>
```

### C.2 Step-by-Step Component Creation

**Step 1: Determine Location**
- Chat components → `src/lib/components/chat/`
- Layout components → `src/lib/components/layout/`
- Sidebar components → `src/lib/components/sidebar/`
- Reusable UI → `src/lib/components/ui/`

**Step 2: Create File**
```bash
touch src/lib/components/chat/MyComponent.svelte
```

**Step 3: Copy Template**
Use the template above. Modify:
1. Change component name in `data-testid`
2. Update props for your use case
3. Define your event types

**Step 4: Apply Button Classes**
| Type | Class | Use Case |
|------|-------|----------|
| Primary CTA | `btn-primary` | Main actions |
| Secondary | `btn-secondary` | Alternative actions |
| Ghost | `btn-ghost` | Low-emphasis |
| Icon button | `btn-icon` | Standalone icons |
| Icon bare | `btn-icon-bare` | Icons in groups |
| Danger | `btn-danger` | Destructive actions |

**Step 5: Add Dark Mode**
CSS variables auto-switch. For custom overrides:
```css
:global(.dark) .my-component {
	background: var(--surface-overlay);
}
```

**Step 6: Make Responsive**
```svelte
<div class="w-full md:w-[80%] lg:w-[60%]">
<div class="hidden md:block">Desktop only</div>
<div class="md:hidden">Mobile only</div>
```

### C.3 Store Usage Pattern

**Import Stores:**
```typescript
import { isDark, setTheme } from '$lib/stores/theme';
import { sidebarOpen, currentConversationId } from '$lib/stores/ui';
import { showToast } from '$lib/stores/toast';
```

**Template Usage ($ prefix):**
```svelte
<div class:dark={$isDark}>
<span>Current: {$currentConversationId}</span>
{#if $sidebarOpen}
	<div>Sidebar open</div>
{/if}
```

**Script Usage (get function):**
```typescript
import { get } from 'svelte/store';
const currentValue = get(sidebarOpen);
```

### C.4 Common Implementation Patterns

**Adding a Button:**
```svelte
<button
	type="button"
	class="btn-primary"
	on:click={handleAction}
	disabled={isDisabled}
	data-testid="action-button"
>
	<span>Button Text</span>
</button>
```

**Adding an Icon (Inline SVG):**
```svelte
<svg 
	xmlns="http://www.w3.org/2000/svg" 
	width="20" 
	height="20" 
	viewBox="0 0 24 24" 
	fill="none" 
	stroke="currentColor" 
	stroke-width="2"
	class="text-icon-muted"
>
	<circle cx="12" cy="12" r="10"/>
</svg>
```

**Loading State:**
```svelte
{#if isLoading}
	<div class="flex items-center gap-2">
		<div class="animate-spin h-4 w-4 border-2 border-accent border-t-transparent rounded-full"></div>
		<span class="text-text-muted">Loading...</span>
	</div>
{/if}
```

**Error State:**
```svelte
{#if error}
	<div class="text-danger text-sm">{error}</div>
{/if}
```

### C.5 Testing Requirements

**Every component MUST have:**
- `data-testid` on the container element
- `data-testid` on all interactive elements

**Example:**
```svelte
<div data-testid="my-component">
	<button data-testid="submit-button">Submit</button>
	<input data-testid="search-input" />
</div>
```

---

## Appendix D: Quick Reference Tables

### D.1 CSS Variable Quick Reference

| Variable | Light | Dark | Tailwind Class |
|----------|-------|------|----------------|
| `--surface-page` | #FFFFFF | #1A1A1A | `bg-surface-page` |
| `--surface-elevated` | #F4F3EE | #242424 | `bg-surface-elevated` |
| `--surface-overlay` | #FAFAF8 | #2A2A2A | `bg-surface-overlay` |
| `--text-primary` | #1A1A1A | #ECECEC | `text-text-primary` |
| `--text-muted` | #6B6B6B | #A0A0A0 | `text-text-muted` |
| `--accent` | #C15F3C | #D4836B | `text-accent` / `bg-accent` |
| `--border-default` | rgba(0,0,0,0.08) | rgba(255,255,255,0.08) | `border-border` |
| `--danger` | #B91C1C | #FF6B6B | `text-danger` / `bg-danger` |
| `--space-md` | 16px | 16px | `p-md` / `gap-md` / `m-md` |

### D.2 Spacing Quick Reference

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| `--space-xs` | 4px | `xs` | Icon gaps |
| `--space-sm` | 8px | `sm` | Compact padding |
| `--space-md` | 16px | `md` | Standard spacing |
| `--space-lg` | 24px | `lg` | Section spacing |
| `--space-xl` | 32px | `xl` | Major gaps |
| `--space-2xl` | 48px | `2xl` | Page margins |

### D.3 Border Radius Quick Reference

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| `--radius-sm` | 5px | `rounded-sm` | Buttons, badges |
| `--radius-md` | 6px | `rounded-md` | Cards, inputs |
| `--radius-lg` | 8px | `rounded-lg` | Modals |

### D.4 Animation Quick Reference

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| `--duration-micro` | 100ms | `duration-micro` | Hover, focus |
| `--duration-standard` | 150ms | `duration-150` | Standard transitions |
| `--duration-emphasis` | 250ms | `duration-emphasis` | Layout changes |

---

## Appendix E: Design Decision Framework

When building a new component, answer these questions:

### E.1 Color Decisions
1. Is this a surface/background? → Use `--surface-*` tokens
2. Is this text content? → Use `--text-*` tokens
3. Is this an icon? → Use `--icon-*` tokens
4. Is this an interactive element? → Use `--accent` for primary actions
5. Is this a border? → Use `--border-default` or `--border-subtle`
6. Is this an error state? → Use `--danger`

### E.2 Spacing Decisions
1. Is this inside a compact element? → `xs` (4px) or `sm` (8px)
2. Is this standard spacing? → `md` (16px)
3. Is this between sections? → `lg` (24px) or `xl` (32px)
4. Is this page-level? → `2xl` (48px)

### E.3 Typography Decisions
1. Is this message/content text? → `font-serif` (Georgia)
2. Is this UI chrome? → `font-sans` (System)
3. Is this code? → `font-mono` (JetBrains Mono)
4. Minimum size for body text: 14px
5. Minimum size for metadata: 12px

### E.4 Button Decisions
1. Is this the primary action? → `btn-primary`
2. Is this a secondary/cancel action? → `btn-secondary`
3. Is this a low-emphasis action? → `btn-ghost`
4. Is this an icon button? → `btn-icon` or `btn-icon-bare`
5. Is this destructive? → `btn-danger`

### E.5 Responsive Decisions
1. Mobile default (first)
2. Tablet adjustments: `md:` prefix (768px+)
3. Desktop adjustments: `lg:` prefix (1024px+)
4. Sidebar breakpoint: 1024px

---

## FINAL VERIFICATION CHECKLIST

Before considering this document complete, verify:

- [x] All CSS variable values are exact hex codes or rgba values
- [x] All spacing values are in pixels (4px, 8px, 16px, 24px, 32px, 48px)
- [x] All animation durations are in milliseconds (100ms, 150ms, 250ms)
- [x] Complete app.css CSS variable definitions included
- [x] Complete tailwind.config.ts included
- [x] Component template provided with all sections
- [x] Step-by-step creation workflow documented
- [x] Store usage patterns documented
- [x] Common patterns (button, icon, loading, error) documented
- [x] Testing requirements (data-testid) documented
- [x] Quick reference tables for all tokens
- [x] File location guide for different component types
- [x] Import/export patterns documented
- [x] Dark mode implementation patterns documented
- [x] Responsive design patterns documented
- [x] Design decision framework provided

**Status: COMPLETE** - This document now contains everything an AI agent needs to build components that perfectly match the existing design system.

---

**END OF DESIGN SYSTEM SPECIFICATION**
