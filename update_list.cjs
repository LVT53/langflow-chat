const fs = require('fs');
const file = 'src/lib/components/sidebar/ConversationList.svelte';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/text-\[var\(--accent\)\]/g, 'text-danger');
fs.writeFileSync(file, content);
console.log('done');
