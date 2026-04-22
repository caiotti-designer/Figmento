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

// Skills live at <figmento-mcp-server>/skills/ — parallel to knowledge/.
// Must match a directory that contains at least one .md file with YAML
// frontmatter — this prevents false matches against a legacy
// <repo-root>/skills/ directory one level above the package root.
function isValidSkillsDir(dir: string): boolean {
  if (!fs.existsSync(dir)) return false;
  try {
    const entries = fs.readdirSync(dir);
    // Our canonical skill filename — used as the unambiguous marker.
    return entries.includes('design-system.md');
  } catch {
    return false;
  }
}

function resolveSkillsBase(): string {
  // Candidate 1: __dirname/../skills — works when __dirname is the flat dist/ bundle
  const oneUp = nodePath.join(__dirname, '..', 'skills');
  if (isValidSkillsDir(oneUp)) return oneUp;
  // Candidate 2: __dirname/../../skills — intermediate fallback
  const twoUp = nodePath.join(__dirname, '..', '..', 'skills');
  if (isValidSkillsDir(twoUp)) return twoUp;
  // Candidate 3: __dirname/../../../skills — works when __dirname is src/tools/utils/ (ts-jest)
  const threeUp = nodePath.join(__dirname, '..', '..', '..', 'skills');
  if (isValidSkillsDir(threeUp)) return threeUp;
  // Fallback: return the most likely path even if empty (caller will get empty index)
  return oneUp;
}

export function getSkillsDir(): string {
  return resolveSkillsBase();
}
