const fs = require('fs');

const itemFile = 'src/lib/components/sidebar/ConversationItem.svelte';
let itemContent = fs.readFileSync(itemFile, 'utf8');

// Update ConversationItem.svelte
itemContent = itemContent.replace(
  /class="group relative flex cursor-pointer items-center justify-between py-sm px-md min-h-\[44px\] transition-colors hover:bg-surface-page dark:hover:bg-surface-page"\s+class:bg-surface-page=\{active\}\s+style="\{active \? 'border-left: 3px solid var\(--accent\);' : 'border-left: 3px solid transparent;'\}\"/,
  `class="group relative flex cursor-pointer items-center justify-between py-2 px-3 min-h-[44px] border-l-2 transition-colors hover:bg-surface-elevated border-transparent"\n  class:bg-surface-elevated={active}\n  class:border-accent={active}`
);

// Menu button
itemContent = itemContent.replace(
  /class="flex h-8 w-8 items-center justify-center rounded-sm text-muted opacity-0 transition-opacity hover:bg-surface-elevated hover:text-primary focus:opacity-100 group-hover:opacity-100 min-h-\[44px\] min-w-\[44px\] md:min-h-0 md:min-w-0"/,
  `class="flex h-11 w-11 items-center justify-center rounded-sm text-text-muted opacity-0 transition-opacity hover:bg-surface-elevated hover:text-text-primary focus:opacity-100 group-hover:opacity-100"`
);

// Options
itemContent = itemContent.replace(
  /class="w-full px-4 py-1\.5 text-left text-sm font-sans text-primary hover:bg-surface-elevated min-h-\[44px\]"/,
  `class="flex w-full items-center px-4 py-2 text-left text-sm font-sans text-text-primary hover:bg-surface-elevated min-h-[44px]"`
);
itemContent = itemContent.replace(
  /class="w-full px-4 py-1\.5 text-left text-sm font-sans text-accent hover:bg-surface-elevated min-h-\[44px\]"/,
  `class="flex w-full items-center px-4 py-2 text-left text-sm font-sans text-danger hover:bg-surface-elevated min-h-[44px]"`
);

// Truncation text
itemContent = itemContent.replace(
  /<div class="truncate text-\[14px\] font-sans text-primary">\s*\{conversation\.title\.length > 30 \? conversation\.title\.substring\(0, 30\) \+ '\.\.\.' : conversation\.title\}\s*<\/div>/,
  `<div class="truncate text-[14px] font-sans text-text-primary">\n\t\t\t\t{conversation.title}\n\t\t\t</div>`
);

// Muted text
itemContent = itemContent.replace(
  /class="mt-0\.5 text-\[12px\] font-sans text-muted"/,
  `class="mt-0.5 text-[12px] font-sans text-text-muted"`
);

// Input text
itemContent = itemContent.replace(
  /class="w-full rounded-sm border-default bg-surface-page px-1 py-0\.5 text-sm font-sans text-primary outline-none ring-1 focus-ring"/,
  `class="w-full rounded-sm border-default bg-surface-page px-2 py-1 min-h-[36px] text-sm font-sans text-text-primary outline-none ring-1 focus-ring"`
);

fs.writeFileSync(itemFile, itemContent);

const listFile = 'src/lib/components/sidebar/ConversationList.svelte';
let listContent = fs.readFileSync(listFile, 'utf8');

// Update ConversationList.svelte
listContent = listContent.replace(
  /text-text-secondary/g,
  `text-text-muted`
);

fs.writeFileSync(listFile, listContent);

console.log('done');
