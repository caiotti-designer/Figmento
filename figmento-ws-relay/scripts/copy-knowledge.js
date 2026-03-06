/**
 * Pre-build step: copy compiled knowledge from the plugin workspace.
 * The plugin's build runs compile-knowledge.ts which reads YAML from
 * figmento-mcp-server/knowledge/ and outputs TypeScript to figmento/src/knowledge/.
 * This script copies that output to the relay workspace so the chat engine
 * can access palettes, fonts, blueprints, etc.
 */
const fs = require('fs');
const path = require('path');

const PLUGIN_KNOWLEDGE_DIR = path.resolve(__dirname, '..', '..', 'figmento', 'src', 'knowledge');
const RELAY_KNOWLEDGE_DIR = path.resolve(__dirname, '..', 'src', 'knowledge');

// Only copy compiled-knowledge.ts — types.ts is maintained separately in the relay
// with relaxed field requirements (e.g. aspect?: string) to match the auto-generated data.
const FILES_TO_COPY = ['compiled-knowledge.ts'];

// Ensure target directory exists
if (!fs.existsSync(RELAY_KNOWLEDGE_DIR)) {
  fs.mkdirSync(RELAY_KNOWLEDGE_DIR, { recursive: true });
}

let copied = 0;
for (const file of FILES_TO_COPY) {
  const src = path.join(PLUGIN_KNOWLEDGE_DIR, file);
  const dst = path.join(RELAY_KNOWLEDGE_DIR, file);

  if (!fs.existsSync(src)) {
    console.warn(`[copy-knowledge] WARNING: ${src} not found. Run 'npm run build' in figmento/ first.`);
    continue;
  }

  fs.copyFileSync(src, dst);
  copied++;
  console.log(`[copy-knowledge] Copied ${file}`);
}

if (copied === FILES_TO_COPY.length) {
  console.log('[copy-knowledge] Knowledge files ready.');
} else {
  console.warn('[copy-knowledge] Some knowledge files missing — chat engine intelligence may be degraded.');
}
