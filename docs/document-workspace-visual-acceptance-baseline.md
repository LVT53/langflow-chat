# Document Workspace Visual Acceptance Baseline

This baseline is the visual contract for the corrected Document Workspace pass. It applies to the shared workspace used by Chat generated files, chat attachments, Knowledge Library opens, and Knowledge search handoffs.

## Required States

1. **Chat docked workspace**
   - Opens from chat rows/cards as a right-side workspace column.
   - Uses the compact header, active-document actions, and preview toolbar without modal chrome.
   - One open document does not show the Open Documents Rail.

2. **Chat docked workspace with many open documents**
   - Two or more open documents show a true vertical Open Documents Rail beside the preview.
   - The rail is readable with long filenames and remains scrollable when the document count exceeds the available height.
   - Selecting a rail item changes only the active document, not the shell entrance animation.

3. **Chat expanded workspace**
   - Expanded presentation uses the extra width as a workspace layout, not just a stretched docked column.
   - The rail, preview surface, compact active-document actions, version badges, compare mode, and toolbar remain visible and organized.
   - Opening a generated-document version from expanded mode preserves expanded mode.

4. **Knowledge expanded workspace**
   - Knowledge opens documents into expanded presentation by default.
   - The active document exposes preview and download affordances from the shared workspace.
   - Closing the workspace returns to the Knowledge Library state underneath.

## Visual Rules

- The rail is vertical on desktop/tablet, not a horizontal tab strip.
- The rail only appears for `2+` open documents.
- The rail uses restrained neutral styling, compact metadata, and no decorative color system.
- Version history uses compact chips or badges, with active/latest/current states visible at a glance.
- Source-message access is secondary to preview work and should not read as the primary action.
- Preview controls live in one toolbar per preview. Duplicate page counters or competing controls are not acceptable.
- PDF, PPTX, image, Markdown, HTML, DOCX, XLSX, and ODT previews must all keep normal workspace scrolling usable.
- Markdown renders as a readable document; raw Markdown remains available through download.
- HTML renders visually in a sandboxed iframe with scripts blocked and safe local styling preserved.
- Unsupported formats show a download path without introducing a second viewer shell.

## Verification

Each implementation slice that changes the workspace UI must include a focused component or e2e check for the state it owns, plus a manual or Playwright screenshot review for desktop-width Chat and Knowledge when layout changes are involved.
