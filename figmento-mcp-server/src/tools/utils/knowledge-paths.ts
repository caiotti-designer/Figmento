// ═══════════════════════════════════════════════════════════
// Knowledge Directory Path Utilities
// Two-candidate fallback for ts-jest + esbuild compatibility
// ═══════════════════════════════════════════════════════════

import * as fs from 'fs';
import * as nodePath from 'path';

function resolveKnowledgeBase(): string {
  // Candidate 1: __dirname/../knowledge (works when file is in tools/utils/ or tools/design-system/)
  const oneUp = nodePath.join(__dirname, '..', 'knowledge');
  if (fs.existsSync(oneUp)) return oneUp;
  // Candidate 2: __dirname/../../knowledge (works in ts-jest where __dirname is src/tools/utils/)
  const twoUp = nodePath.join(__dirname, '..', '..', 'knowledge');
  if (fs.existsSync(twoUp)) return twoUp;
  // Candidate 3: __dirname/../../../knowledge (works in dist/tools/utils/)
  const threeUp = nodePath.join(__dirname, '..', '..', '..', 'knowledge');
  if (fs.existsSync(threeUp)) return threeUp;
  // Fallback: assume one level up (original pattern)
  return oneUp;
}

export function getKnowledgeDir(): string {
  return resolveKnowledgeBase();
}

export function getDesignSystemsDir(): string {
  return nodePath.join(getKnowledgeDir(), 'design-systems');
}

export function getPresetsDir(): string {
  return nodePath.join(getKnowledgeDir(), 'presets');
}

export function getFormatsDir(): string {
  return nodePath.join(getKnowledgeDir(), 'formats');
}
