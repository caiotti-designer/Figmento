/**
 * FN-17: Skill Export from Plugin
 *
 * Generates a Figma Skill markdown file from the designer's current
 * plugin configuration — design system cache, brand kit, format preferences,
 * learned preferences — and triggers a browser download.
 *
 * The exported skill follows the format established in FN-1
 * (skills/figmento-screenshot-to-layout.md) but replaces generic knowledge
 * with the designer's specific system.
 */

import {
  designSystemState,
  designSettings,
  modeState,
} from './state';
import { postMessage } from './utils';
import type { DesignSystemCache, DiscoveredComponent, LearnedPreference } from '../types';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface BrandKitData {
  name?: string;
  colors?: { primary?: string; secondary?: string; accent?: string; [key: string]: string | undefined };
  fonts?: { heading?: string; body?: string; [key: string]: string | undefined };
  voice?: string;
  logoInfo?: string;
}

interface SkillExportData {
  dsCache: DesignSystemCache | null;
  preferences: LearnedPreference[];
  brandKit: BrandKitData | null;
}

// ═══════════════════════════════════════════════════════════════
// MARKDOWN GENERATION
// ═══════════════════════════════════════════════════════════════

function getSkillTitle(brandKit: BrandKitData | null): string {
  if (brandKit?.name) return `${brandKit.name} Design System — Figma Skill`;
  return 'My Design Workflow — Figma Skill';
}

function getFileName(brandKit: BrandKitData | null): string {
  if (brandKit?.name) {
    const slug = brandKit.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return `${slug}-design-skill.md`;
  }
  return 'figmento-design-skill.md';
}

function buildPrerequisitesSection(): string {
  return `## Prerequisites

- Claude Code with \`use_figma\` MCP tool connected
- Figma file open with the design system loaded
`;
}

function buildBrandKitSection(brandKit: BrandKitData | null): string {
  const parts: string[] = [];

  // Always include designSettings data
  const hasFont = designSettings.selectedFontFamily && designSettings.selectedFontFamily !== 'Inter';
  const hasBrandColors = designSettings.brandColors.length > 0;
  const hasCustomPrompt = designSettings.customPrompt.trim().length > 0;
  const hasBrandKit = brandKit && (brandKit.name || brandKit.colors || brandKit.fonts || brandKit.voice);

  if (!hasFont && !hasBrandColors && !hasCustomPrompt && !hasBrandKit) {
    return `## Brand Identity

No brand kit configured. Set brand colors and fonts in the plugin Settings to enrich this section.
`;
  }

  parts.push('## Brand Identity\n');

  if (brandKit?.name) {
    parts.push(`**Brand:** ${brandKit.name}\n`);
  }

  // Colors
  const colorLines: string[] = [];
  if (brandKit?.colors) {
    for (const [role, hex] of Object.entries(brandKit.colors)) {
      if (hex) colorLines.push(`- **${role}:** \`${hex}\``);
    }
  }
  if (hasBrandColors) {
    const existing = new Set(colorLines.map(l => l.match(/`(#[^`]+)`/)?.[1]));
    for (const hex of designSettings.brandColors) {
      if (!existing.has(hex)) {
        colorLines.push(`- \`${hex}\``);
      }
    }
  }
  if (colorLines.length > 0) {
    parts.push('### Colors\n');
    parts.push(colorLines.join('\n'));
    parts.push('');
  }

  // Fonts
  const fontLines: string[] = [];
  if (brandKit?.fonts) {
    for (const [role, font] of Object.entries(brandKit.fonts)) {
      if (font) fontLines.push(`- **${role}:** ${font}`);
    }
  }
  if (hasFont && !fontLines.some(l => l.includes(designSettings.selectedFontFamily))) {
    fontLines.push(`- **Primary font:** ${designSettings.selectedFontFamily}`);
  }
  if (fontLines.length > 0) {
    parts.push('### Fonts\n');
    parts.push(fontLines.join('\n'));
    parts.push('');
  }

  // Voice / Custom Prompt
  if (brandKit?.voice) {
    parts.push(`### Brand Voice\n\n${brandKit.voice}\n`);
  }
  if (hasCustomPrompt) {
    parts.push(`### Custom Design Instructions\n\n${designSettings.customPrompt.trim()}\n`);
  }

  if (brandKit?.logoInfo) {
    parts.push(`### Logo\n\n${brandKit.logoInfo}\n`);
  }

  return parts.join('\n');
}

function buildDesignSystemSection(cache: DesignSystemCache | null): string {
  if (!cache) {
    return `## Design System

No design system scanned — scan your file first for richer export.
`;
  }

  const hasComponents = cache.components && cache.components.length > 0;
  const hasVariables = cache.variables && cache.variables.length > 0;
  const hasPaintStyles = (cache.paintStyles as unknown[])?.length > 0;
  const hasTextStyles = (cache.textStyles as unknown[])?.length > 0;
  const hasEffectStyles = (cache.effectStyles as unknown[])?.length > 0;

  if (!hasComponents && !hasVariables && !hasPaintStyles && !hasTextStyles && !hasEffectStyles) {
    return `## Design System

Design system scanned but no components, variables, or styles found.
`;
  }

  const sections: string[] = ['## Design System\n'];

  // Components (grouped by category, cap at 100)
  if (hasComponents) {
    sections.push('### Components\n');
    const grouped = new Map<string, DiscoveredComponent[]>();
    for (const c of cache.components) {
      const cat = c.category || 'other';
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(c);
    }

    let count = 0;
    const MAX = 100;
    for (const [cat, comps] of grouped.entries()) {
      if (count >= MAX) break;
      const remaining = MAX - count;
      const slice = comps.slice(0, remaining);
      count += slice.length;

      sections.push(`**${cat}:**`);
      for (const c of slice) {
        let line = `- \`${c.name}\``;
        if (c.nodeType === 'COMPONENT_SET' && c.variantProperties) {
          const variants = Object.entries(c.variantProperties)
            .map(([k, v]) => `${k}: ${v.join(' / ')}`)
            .join('; ');
          line += ` — variants: ${variants}`;
        }
        if (c.description) line += ` — ${c.description}`;
        sections.push(line);
      }
      sections.push('');
    }

    if (cache.components.length > MAX) {
      sections.push(`> ...and ${cache.components.length - MAX} more components\n`);
    }
  }

  // Variables (color + non-color, grouped by collection)
  if (hasVariables) {
    sections.push('### Variables\n');

    type VarEntry = {
      name?: string;
      resolvedValue?: string;
      resolvedType?: string;
      collectionName?: string;
    };
    const vars = cache.variables as VarEntry[];

    // Group by collection
    const byCollection = new Map<string, VarEntry[]>();
    for (const v of vars) {
      const col = v.collectionName || 'Default';
      if (!byCollection.has(col)) byCollection.set(col, []);
      byCollection.get(col)!.push(v);
    }

    let varCount = 0;
    const MAX_VARS = 100;
    for (const [col, colVars] of byCollection.entries()) {
      if (varCount >= MAX_VARS) break;
      const remaining = MAX_VARS - varCount;
      const slice = colVars.slice(0, remaining);
      varCount += slice.length;

      sections.push(`**${col}:**`);
      for (const v of slice) {
        if (v.name && v.resolvedValue) {
          sections.push(`- \`${v.name}\` = \`${v.resolvedValue}\` (${v.resolvedType || 'unknown'})`);
        } else if (v.name) {
          sections.push(`- \`${v.name}\` (${v.resolvedType || 'unknown'})`);
        }
      }
      sections.push('');
    }

    if (vars.length > MAX_VARS) {
      sections.push(`> ...and ${vars.length - MAX_VARS} more variables\n`);
    }
  }

  // Paint Styles
  if (hasPaintStyles) {
    sections.push('### Paint Styles\n');
    type StyleEntry = { name?: string; color?: string; type?: string };
    const styles = cache.paintStyles as StyleEntry[];
    const MAX_STYLES = 30;
    const slice = styles.slice(0, MAX_STYLES);
    for (const s of slice) {
      if (s.name) {
        const detail = s.color ? ` = \`${s.color}\`` : '';
        sections.push(`- \`${s.name}\`${detail}`);
      }
    }
    if (styles.length > MAX_STYLES) {
      sections.push(`> ...and ${styles.length - MAX_STYLES} more paint styles`);
    }
    sections.push('');
  }

  // Text Styles
  if (hasTextStyles) {
    sections.push('### Text Styles\n');
    type TextStyleEntry = { name?: string; fontFamily?: string; fontSize?: number; fontWeight?: number };
    const styles = cache.textStyles as TextStyleEntry[];
    const MAX_STYLES = 30;
    const slice = styles.slice(0, MAX_STYLES);
    for (const s of slice) {
      if (s.name) {
        const parts: string[] = [];
        if (s.fontFamily) parts.push(s.fontFamily);
        if (s.fontWeight && s.fontWeight >= 700) parts.push('Bold');
        else if (s.fontWeight && s.fontWeight >= 500) parts.push('Medium');
        if (s.fontSize) parts.push(`${s.fontSize}px`);
        const detail = parts.length > 0 ? ` — ${parts.join(' ')}` : '';
        sections.push(`- \`${s.name}\`${detail}`);
      }
    }
    if (styles.length > MAX_STYLES) {
      sections.push(`> ...and ${styles.length - MAX_STYLES} more text styles`);
    }
    sections.push('');
  }

  // Effect Styles
  if (hasEffectStyles) {
    sections.push('### Effect Styles\n');
    type EffectStyleEntry = { name?: string };
    const styles = cache.effectStyles as EffectStyleEntry[];
    const MAX_STYLES = 20;
    const slice = styles.slice(0, MAX_STYLES);
    for (const s of slice) {
      if (s.name) sections.push(`- \`${s.name}\``);
    }
    if (styles.length > MAX_STYLES) {
      sections.push(`> ...and ${styles.length - MAX_STYLES} more effect styles`);
    }
    sections.push('');
  }

  return sections.join('\n');
}

function buildPreferencesSection(preferences: LearnedPreference[]): string {
  const enabled = preferences.filter(p => p.enabled !== false);

  if (enabled.length === 0) {
    return `## Design Preferences

No preferences learned yet. Create designs and confirm corrections to build your preference profile.
`;
  }

  const CONFIDENCE_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sorted = enabled.slice().sort((a, b) => {
    const confDiff = (CONFIDENCE_ORDER[a.confidence] ?? 2) - (CONFIDENCE_ORDER[b.confidence] ?? 2);
    if (confDiff !== 0) return confDiff;
    return b.correctionCount - a.correctionCount;
  });

  const lines = sorted.map(p => {
    const badge = p.confidence === 'high' ? '**ALWAYS**' : p.confidence === 'medium' ? '**PREFER**' : '*consider*';
    return `- ${badge} ${p.context} ${p.property}: ${p.description}`;
  });

  return `## Design Preferences

These rules were learned from the designer's repeated corrections. Follow them as default behavior unless the brief explicitly requests something different.

${lines.join('\n')}
`;
}

function buildFormatDefaultsSection(): string {
  const parts: string[] = ['## Format Defaults\n'];

  const format = modeState.currentFormat;
  if (format && typeof format === 'object' && 'name' in format) {
    parts.push(`- **Preferred format:** ${(format as { name: string }).name} (${(format as { width: number }).width}x${(format as { height: number }).height})`);
  } else if (format && typeof format === 'string') {
    parts.push(`- **Preferred format:** ${format}`);
  }

  const theme = modeState.activeColorTheme;
  if (theme) {
    parts.push(`- **Color theme:** ${typeof theme === 'object' && 'name' in theme ? (theme as { name: string }).name : theme}`);
  }

  if (designSettings.enableGridSystem) {
    parts.push('- **Grid system:** Enabled (8px grid)');
  }

  if (parts.length === 1) {
    parts.push('Default settings — no custom format preferences configured.');
  }

  parts.push('');
  return parts.join('\n');
}

function buildDesignRulesSection(): string {
  return `## Design Rules

### Typography Hierarchy (Mandatory)

- Headline MUST be at least 2x body font size.
- At least 2 weight steps between headline and body (e.g., 700 headline + 400 body).
- Adjacent text elements MUST differ by at least 1 weight step AND 8px in size.
- Every design needs at least 3 distinct text sizes.
- Reinforce hierarchy with color: headline at full color, subheadline muted, caption light.

**Line Height** (multiply by fontSize to get pixel value):
Display (>48px): 1.1-1.2 | Headings: 1.3-1.4 | Body: 1.5-1.6 | Small: 1.6-1.8

**Weight Usage:**
400 Regular (body) | 500 Medium (nav, buttons) | 700 Bold (headings, CTA) | 800 ExtraBold (hero)

### Layout Rules (8px Grid)

**Spacing scale (only these values):** 4 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 64 | 80 | 96 | 128

**Spatial generosity:** Increase padding by 1.5x what feels "enough." Generous whitespace = premium feel.

### Overlay & Gradient Rules

When placing text over images, ALWAYS create an overlay rectangle first.

**Content-aware gradient direction — the solid end faces the text:**

| Text Position | Direction    | Stop 0 (transparent) | Stop 1 (solid)  |
|---------------|-------------|---------------------|-----------------|
| Bottom        | top-bottom  | Top: opacity 0      | Bottom: opacity 1|
| Top           | bottom-top  | Bottom: opacity 0   | Top: opacity 1   |
| Left          | right-left  | Right: opacity 0    | Left: opacity 1  |
| Right         | left-right  | Left: opacity 0     | Right: opacity 1 |

Rules: Exactly 2 stops. Solid zone at 40-50%. Gradient color MUST match the section background.

### Key Anti-Patterns (Never Do These)

- fontWeight 600 on non-Inter fonts — silently falls back to Inter. Use 400 or 700.
- Content frames with fixed height — clips text. Use \`layoutSizingVertical: 'HUG'\`.
- Gradient solid end facing away from text.
- Flat solid fills on hero sections — always use gradients or subtle depth.
`;
}

function buildCodeExamplesSection(): string {
  return `## use_figma Code Examples

### Hex-to-RGB Helper

\`\`\`javascript
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  return { r, g, b };
}
\`\`\`

### Gradient Transform Helper

\`\`\`javascript
function gradientTransform(direction) {
  switch (direction) {
    case "top-bottom":    return [[0,1,0],[1,0,0]];
    case "bottom-top":    return [[0,-1,1],[-1,0,1]];
    case "left-right":    return [[1,0,0],[0,1,0]];
    case "right-left":    return [[-1,0,1],[0,-1,1]];
    default:              return [[0,1,0],[1,0,0]];
  }
}
\`\`\`

### Creating a Root Frame

\`\`\`javascript
const frame = figma.createFrame();
frame.name = "My Design";
frame.resize(1080, 1350);
frame.fills = [{ type: 'SOLID', color: hexToRgb("#0A0A0F") }];
\`\`\`

### Creating Text with Font Loading

\`\`\`javascript
await figma.loadFontAsync({ family: "Playfair Display", style: "Bold" });
const text = figma.createText();
text.fontName = { family: "Playfair Display", style: "Bold" };
text.fontSize = 72;
text.lineHeight = { value: 72 * 1.15, unit: "PIXELS" };
text.characters = "Your Headline";
text.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
text.textAutoResize = "HEIGHT";
frame.appendChild(text);
\`\`\`

### Auto-Layout Container

\`\`\`javascript
const container = figma.createFrame();
container.layoutMode = "VERTICAL";
container.primaryAxisAlignItems = "CENTER";
container.counterAxisAlignItems = "CENTER";
container.paddingTop = 48;
container.paddingBottom = 48;
container.paddingLeft = 48;
container.paddingRight = 48;
container.itemSpacing = 24;
container.layoutSizingHorizontal = "FILL";
container.layoutSizingVertical = "HUG";
container.fills = [];
frame.appendChild(container);
\`\`\`

### Button (Auto-Layout Frame + Text)

\`\`\`javascript
await figma.loadFontAsync({ family: "Inter", style: "Bold" });
const button = figma.createFrame();
button.name = "CTA Button";
button.layoutMode = "HORIZONTAL";
button.primaryAxisAlignItems = "CENTER";
button.counterAxisAlignItems = "CENTER";
button.paddingTop = 16;
button.paddingBottom = 16;
button.paddingLeft = 32;
button.paddingRight = 32;
button.cornerRadius = 8;
button.fills = [{ type: 'SOLID', color: hexToRgb("#3366CC") }];
button.layoutSizingHorizontal = "HUG";
button.layoutSizingVertical = "HUG";

const label = figma.createText();
label.fontName = { family: "Inter", style: "Bold" };
label.fontSize = 18;
label.characters = "GET STARTED";
label.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
button.appendChild(label);
\`\`\`

### Gradient Overlay

\`\`\`javascript
const overlay = figma.createRectangle();
overlay.name = "Gradient Overlay";
overlay.resize(1080, 1350);
overlay.fills = [{
  type: 'GRADIENT_LINEAR',
  gradientTransform: gradientTransform("top-bottom"),
  gradientStops: [
    { position: 0, color: { r: 0.04, g: 0.04, b: 0.06, a: 0 } },
    { position: 0.5, color: { r: 0.04, g: 0.04, b: 0.06, a: 0.85 } }
  ]
}];
frame.appendChild(overlay);
\`\`\`
`;
}

function buildWorkflowSection(): string {
  return `## Workflow

When using this skill to create a design:

1. **Connect** — Ensure \`use_figma\` MCP tool is connected to Figma.
2. **Read context** — Call \`read_figma_context()\` to discover variables and styles in the file.
3. **Match the system** — Use the components, variables, and styles listed in the Design System section above. Prefer \`create_component\` for listed components and \`bind_variable\` for listed color variables.
4. **Follow brand identity** — Use the colors and fonts from the Brand Identity section. These are the designer's chosen palette.
5. **Respect preferences** — Follow the Design Preferences rules. These were learned from the designer's corrections over time.
6. **Apply design rules** — Use the typography hierarchy, spacing scale, and overlay rules from the Design Rules section.
7. **Self-evaluate** — After creating the design, verify typography hierarchy (3+ sizes), contrast (WCAG AA), spacing consistency, and that one memorable element stands out.
`;
}

/**
 * Generate the full skill markdown from all available data.
 */
export function generateSkillMarkdown(data: SkillExportData): string {
  const title = getSkillTitle(data.brandKit);
  const parts: string[] = [];

  parts.push(`# ${title}\n`);
  parts.push(buildPrerequisitesSection());
  parts.push(buildBrandKitSection(data.brandKit));
  parts.push(buildDesignSystemSection(data.dsCache));
  parts.push(buildPreferencesSection(data.preferences));
  parts.push(buildFormatDefaultsSection());
  parts.push(buildDesignRulesSection());
  parts.push(buildCodeExamplesSection());
  parts.push(buildWorkflowSection());

  // Footer
  parts.push(`---\n`);
  parts.push(`*Exported from Figmento on ${new Date().toISOString().split('T')[0]}*\n`);

  return parts.join('\n');
}

/**
 * Get the suggested filename for the skill export.
 */
export function getSkillFileName(brandKit: BrandKitData | null): string {
  return getFileName(brandKit);
}

// ═══════════════════════════════════════════════════════════════
// FILE DOWNLOAD
// ═══════════════════════════════════════════════════════════════

/**
 * Trigger a file download from the plugin iframe.
 * Uses Blob + createObjectURL. Falls back to data: URI in a new tab
 * if createObjectURL is not available (some Figma iframe contexts).
 */
function downloadMarkdownFile(content: string, filename: string): void {
  try {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    // Fallback: data URI in a new window
    try {
      const encoded = btoa(unescape(encodeURIComponent(content)));
      const dataUri = `data:text/markdown;charset=utf-8;base64,${encoded}`;
      const a = document.createElement('a');
      a.href = dataUri;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      // Last resort: copy to clipboard
      copyToClipboard(content);
      updateExportStatus('Copied to clipboard (download not available in this context)', 'warning');
    }
  }
}

function copyToClipboard(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
  } catch { /* ignore */ }
  document.body.removeChild(textarea);
}

// ═══════════════════════════════════════════════════════════════
// EXPORT FLOW (async data gathering + generation + download)
// ═══════════════════════════════════════════════════════════════

let pendingExport: {
  preferences: LearnedPreference[] | null;
  brandKit: BrandKitData | null;
  waitingFor: Set<string>;
} | null = null;

function updateExportStatus(text: string, type: 'info' | 'success' | 'warning' = 'info'): void {
  const el = document.getElementById('skill-export-status');
  if (el) {
    el.textContent = text;
    el.className = 'skill-export-status ' + type;
    // Auto-clear after 5s
    if (type !== 'info') {
      setTimeout(() => {
        if (el.textContent === text) {
          el.textContent = '';
          el.className = 'skill-export-status';
        }
      }, 5000);
    }
  }
}

function setExportButtonLoading(loading: boolean): void {
  const btn = document.getElementById('skill-export-btn') as HTMLButtonElement | null;
  if (btn) {
    btn.disabled = loading;
    btn.textContent = loading ? 'Generating...' : 'Share My Workflow as a Skill';
  }
}

function finishExport(): void {
  if (!pendingExport) return;

  const data: SkillExportData = {
    dsCache: designSystemState.cache,
    preferences: pendingExport.preferences || [],
    brandKit: pendingExport.brandKit,
  };

  const markdown = generateSkillMarkdown(data);
  const filename = getSkillFileName(data.brandKit);

  downloadMarkdownFile(markdown, filename);

  setExportButtonLoading(false);
  updateExportStatus(`Exported as ${filename}`, 'success');
  pendingExport = null;
}

function onExportDataReceived(key: string): void {
  if (!pendingExport) return;
  pendingExport.waitingFor.delete(key);
  if (pendingExport.waitingFor.size === 0) {
    finishExport();
  }
}

/**
 * Start the skill export flow. Requests async data from clientStorage,
 * then generates and downloads the skill markdown.
 */
export function startSkillExport(): void {
  if (pendingExport) return; // already in progress

  setExportButtonLoading(true);
  updateExportStatus('Gathering data...');

  pendingExport = {
    preferences: null,
    brandKit: null,
    waitingFor: new Set(['preferences', 'brand-kit']),
  };

  // Request preferences from clientStorage
  postMessage({ type: 'get-preferences' });

  // Request brand kit from clientStorage
  postMessage({ type: 'get-brand-kit' });

  // Timeout: if data doesn't arrive in 3s, proceed with what we have
  setTimeout(() => {
    if (pendingExport && pendingExport.waitingFor.size > 0) {
      // Proceed with whatever we have
      pendingExport.waitingFor.clear();
      finishExport();
    }
  }, 3000);
}

/**
 * Handle messages from the sandbox that provide data for the export.
 * Call this from the message handler in index.ts.
 */
export function handleSkillExportMessage(msg: { type: string; [key: string]: unknown }): boolean {
  if (!pendingExport) return false;

  if (msg.type === 'preferences-loaded') {
    pendingExport.preferences = (msg.preferences as LearnedPreference[]) || [];
    onExportDataReceived('preferences');
    return true;
  }

  if (msg.type === 'brand-kit-loaded') {
    pendingExport.brandKit = (msg.brandKit as BrandKitData) || null;
    onExportDataReceived('brand-kit');
    return true;
  }

  // If get-brand-kit has no handler and returns an error, treat as no brand kit
  if (msg.type === 'get-brand-kit-error') {
    pendingExport.brandKit = null;
    onExportDataReceived('brand-kit');
    return true;
  }

  return false;
}

/**
 * Initialize the skill export button listener.
 */
export function initSkillExport(): void {
  const btn = document.getElementById('skill-export-btn');
  if (btn) {
    btn.addEventListener('click', startSkillExport);
  }

  // Listen for async data responses
  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data?.pluginMessage;
    if (!msg) return;
    handleSkillExportMessage(msg);
  });
}
