import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface Issue {
  rule: string;
  severity: 'error' | 'warning';
  nodeId: string;
  message: string;
  suggestion: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NodeData = Record<string, any>;

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const SPACING_SCALE = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128];

// ─────────────────────────────────────────────────────────────
// Contrast + safe-zone helpers
// ─────────────────────────────────────────────────────────────

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function computeContrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

interface SafeZonePreset {
  width: number;
  height: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const SAFE_ZONE_PRESETS: Record<string, SafeZonePreset> = {
  'instagram-post':   { width: 1080, height: 1080, top: 150, bottom: 150, left: 60,  right: 60  },
  'instagram-story':  { width: 1080, height: 1920, top: 250, bottom: 250, left: 60,  right: 60  },
  'presentation':     { width: 1920, height: 1080, top: 60,  bottom: 60,  left: 80,  right: 80  },
};

function detectFormat(node: NodeData): string | null {
  const w = Number(node.width) || 0;
  const h = Number(node.height) || 0;
  if (w === 1080 && h === 1080) return 'instagram-post';
  if (w === 1080 && h === 1920) return 'instagram-story';
  if (w === 1920 && h === 1080) return 'presentation';
  return null;
}

// ─────────────────────────────────────────────────────────────
// Check functions (exported for unit testing)
// ─────────────────────────────────────────────────────────────

export function checkGradientDirection(node: NodeData, issues: Issue[]): void {
  if (!node) return;

  const fills: NodeData[] = Array.isArray(node.fills) ? node.fills : [];
  const hasLinearGradient = fills.some((f) => f.type === 'GRADIENT_LINEAR');

  if (hasLinearGradient) {
    const children: NodeData[] = Array.isArray(node.children) ? node.children : [];

    // Find all text children (direct or nested one level)
    const textNodes: NodeData[] = [];
    for (const child of children) {
      if (child.type === 'TEXT') textNodes.push(child);
      if (Array.isArray(child.children)) {
        for (const grandchild of child.children) {
          if (grandchild.type === 'TEXT') textNodes.push(grandchild);
        }
      }
    }

    if (textNodes.length === 0) {
      // No sibling text found — warn only
      issues.push({
        rule: 'gradient-direction',
        severity: 'warning',
        nodeId: String(node.id || ''),
        message: 'GRADIENT_LINEAR fill found but no sibling text nodes detected — cannot verify gradient direction.',
        suggestion: 'Ensure gradient solid end aligns with the text zone. If text is external to this node, verify manually.',
      });
      return;
    }

    const gradientFill = fills.find((f) => f.type === 'GRADIENT_LINEAR');
    const handles: NodeData[] = Array.isArray(gradientFill?.gradientHandlePositions)
      ? gradientFill.gradientHandlePositions
      : [];

    if (handles.length < 2) {
      // Can't analyze without handles
      return;
    }

    // handle[0] = start (transparent/low opacity end)
    // handle[1] = end (solid/high opacity end)
    const solidEnd = handles[1]; // { x, y } in 0–1 normalized space

    // Compute text centroid normalized position
    const nodeHeight: number = node.height || 1;
    const nodeWidth: number = node.width || 1;
    const textCentroidY = textNodes.reduce((sum: number, t: NodeData) => {
      return sum + ((t.y || 0) + (t.height || 0) / 2) / nodeHeight;
    }, 0) / textNodes.length;
    const textCentroidX = textNodes.reduce((sum: number, t: NodeData) => {
      return sum + ((t.x || 0) + (t.width || 0) / 2) / nodeWidth;
    }, 0) / textNodes.length;

    // Determine primary gradient axis
    const dy = Math.abs((handles[1].y || 0) - (handles[0].y || 0));
    const dx = Math.abs((handles[1].x || 0) - (handles[0].x || 0));

    if (dy >= dx) {
      // Vertical gradient — check y axis
      const solidAtBottom = (solidEnd.y || 0) > 0.5;
      const textAtBottom = textCentroidY > 0.5;
      if (solidAtBottom !== textAtBottom) {
        issues.push({
          rule: 'gradient-direction',
          severity: 'error',
          nodeId: String(node.id || ''),
          message: `Gradient solid end is ${solidAtBottom ? 'at bottom' : 'at top'} but text centroid is ${textAtBottom ? 'at bottom' : 'at top'} — gradient is facing away from text.`,
          suggestion: 'Flip the gradient direction or swap the opacity stop values so the solid end is behind the text zone.',
        });
      }
    } else {
      // Horizontal gradient — check x axis
      const solidAtRight = (solidEnd.x || 0) > 0.5;
      const textAtRight = textCentroidX > 0.5;
      if (solidAtRight !== textAtRight) {
        issues.push({
          rule: 'gradient-direction',
          severity: 'error',
          nodeId: String(node.id || ''),
          message: `Gradient solid end is ${solidAtRight ? 'at right' : 'at left'} but text centroid is ${textAtRight ? 'at right' : 'at left'} — gradient is facing away from text.`,
          suggestion: 'Flip the gradient direction or swap the opacity stop values so the solid end is behind the text zone.',
        });
      }
    }
  }

  // Recurse into children
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      checkGradientDirection(child, issues);
    }
  }
}

export function checkAutoLayoutCoverage(node: NodeData, issues: Issue[]): void {
  if (!node) return;

  if (node.type === 'FRAME') {
    const children: NodeData[] = Array.isArray(node.children) ? node.children : [];
    const layoutMode: string = node.layoutMode || 'NONE';
    if (children.length > 2 && (layoutMode === 'NONE' || !layoutMode)) {
      issues.push({
        rule: 'auto-layout-coverage',
        severity: 'warning',
        nodeId: String(node.id || ''),
        message: `Frame "${node.name || node.id}" has ${children.length} children but no auto-layout (layoutMode: NONE).`,
        suggestion: 'Call set_auto_layout on this frame to establish a layout direction and spacing.',
      });
    }
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      checkAutoLayoutCoverage(child, issues);
    }
  }
}

export function checkSpacingScale(node: NodeData, issues: Issue[]): void {
  if (!node) return;

  const layoutMode: string = node.layoutMode || 'NONE';
  if (layoutMode !== 'NONE' && node.itemSpacing !== undefined && node.itemSpacing !== null) {
    const spacing: number = Number(node.itemSpacing);
    if (spacing !== 0 && !SPACING_SCALE.includes(spacing)) {
      issues.push({
        rule: 'spacing-scale',
        severity: 'warning',
        nodeId: String(node.id || ''),
        message: `Frame "${node.name || node.id}" has itemSpacing ${spacing}px which is not on the 8px grid scale.`,
        suggestion: `Update itemSpacing to the nearest value in [${SPACING_SCALE.join(', ')}].`,
      });
    }
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      checkSpacingScale(child, issues);
    }
  }
}

export function checkTypographyHierarchy(node: NodeData, issues: Issue[]): void {
  const fontSizes: number[] = [];

  function collectFontSizes(n: NodeData): void {
    if (!n) return;
    if (n.type === 'TEXT' && n.fontSize !== undefined) {
      fontSizes.push(Number(n.fontSize));
    }
    if (Array.isArray(n.children)) {
      for (const child of n.children) collectFontSizes(child);
    }
  }

  collectFontSizes(node);

  const unique = [...new Set(fontSizes)].sort((a, b) => a - b);

  if (unique.length < 2) return; // Can't analyze

  const minSize = unique[0];
  const maxSize = unique[unique.length - 1];

  if (maxSize < 2 * minSize) {
    issues.push({
      rule: 'typography-hierarchy',
      severity: 'error',
      nodeId: String(node.id || ''),
      message: `Typography lacks hierarchy — largest font (${maxSize}px) is less than 2× smallest (${minSize}px).`,
      suggestion: 'Increase the display/headline font size so the largest text is at least 2× the smallest body text.',
    });
  }

  // Check adjacent duplicate sizes
  for (let i = 1; i < unique.length; i++) {
    if (unique[i] === unique[i - 1]) {
      issues.push({
        rule: 'typography-hierarchy',
        severity: 'warning',
        nodeId: String(node.id || ''),
        message: `Two adjacent font sizes are identical (${unique[i]}px). Typography hierarchy requires distinct size steps.`,
        suggestion: 'Differentiate font sizes by at least 4–6px between adjacent hierarchy levels.',
      });
    }
  }
}

export function checkEmptyPlaceholders(node: NodeData, issues: Issue[]): void {
  if (!node) return;

  if (node.type === 'RECTANGLE' || node.type === 'FRAME') {
    const fills: NodeData[] = Array.isArray(node.fills) ? node.fills : [];
    const children: NodeData[] = Array.isArray(node.children) ? node.children : [];
    const width: number = Number(node.width) || 0;
    const height: number = Number(node.height) || 0;

    if (fills.length === 0 && children.length === 0 && width > 100 && height > 100) {
      issues.push({
        rule: 'empty-placeholder',
        severity: 'warning',
        nodeId: String(node.id || ''),
        message: `Node "${node.name || node.id}" (${width}×${height}px) has no fills and no children — potential unfilled image placeholder.`,
        suggestion: 'Resolve with place_generated_image or fetch_placeholder_image.',
      });
    }
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      checkEmptyPlaceholders(child, issues);
    }
  }
}

export function checkContrastRatio(node: NodeData, issues: Issue[], ancestorBg?: string): void {
  if (!node) return;

  // Determine this node's background from its solid fill (if any)
  let currentBg = ancestorBg;
  const fills: NodeData[] = Array.isArray(node.fills) ? node.fills : [];
  const solidFill = fills.find((f) => f.type === 'SOLID' && f.visible !== false);
  if (solidFill?.color) {
    const { r, g, b } = solidFill.color;
    currentBg = rgbToHex(Number(r) || 0, Number(g) || 0, Number(b) || 0);
  }

  if (node.type === 'TEXT' && currentBg) {
    const textFills: NodeData[] = Array.isArray(node.fills) ? node.fills : [];
    const textSolid = textFills.find((f) => f.type === 'SOLID' && f.visible !== false);
    if (textSolid?.color) {
      const { r, g, b } = textSolid.color;
      const textHex = rgbToHex(Number(r) || 0, Number(g) || 0, Number(b) || 0);
      const ratio = computeContrastRatio(textHex, currentBg);
      const fontSize = Number(node.fontSize) || 0;
      // WCAG AA: 4.5:1 for normal text (<18px), 3:1 for large text (≥18px)
      const required = fontSize >= 18 ? 3.0 : 4.5;
      if (ratio < required) {
        issues.push({
          rule: 'wcag-contrast',
          severity: 'error',
          nodeId: String(node.id || ''),
          message: `Text "${String(node.characters || '').slice(0, 30)}" contrast ${ratio.toFixed(2)}:1 against ${currentBg} — below WCAG AA minimum ${required}:1 (${fontSize}px).`,
          suggestion: `Increase contrast between text ${textHex} and background ${currentBg}. Use a darker text color or lighter background.`,
        });
      }
    }
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      checkContrastRatio(child, issues, currentBg);
    }
  }
}

export function checkSafeZones(node: NodeData, issues: Issue[]): void {
  if (!node) return;

  const format = detectFormat(node);
  if (!format) return; // Only check known social/presentation formats

  const preset = SAFE_ZONE_PRESETS[format];
  const frameWidth = Number(node.width) || 0;
  const frameHeight = Number(node.height) || 0;

  function walkNode(n: NodeData): void {
    if (!n) return;
    if (n.type === 'TEXT') {
      const x = Number(n.x) || 0;
      const y = Number(n.y) || 0;
      const w = Number(n.width) || 0;
      const h = Number(n.height) || 0;
      const violations: string[] = [];
      if (y < preset.top) violations.push(`top (${y}px < safe zone ${preset.top}px)`);
      if (y + h > frameHeight - preset.bottom) violations.push(`bottom (${y + h}px > safe zone ${frameHeight - preset.bottom}px)`);
      if (x < preset.left) violations.push(`left (${x}px < safe zone ${preset.left}px)`);
      if (x + w > frameWidth - preset.right) violations.push(`right (${x + w}px > safe zone ${frameWidth - preset.right}px)`);
      if (violations.length > 0) {
        issues.push({
          rule: 'safe-zone',
          severity: 'warning',
          nodeId: String(n.id || ''),
          message: `Text "${String(n.characters || '').slice(0, 30)}" is outside the ${format} safe zone: ${violations.join(', ')}.`,
          suggestion: `Move text within safe margins: top ${preset.top}px, bottom ${preset.bottom}px, left ${preset.left}px, right ${preset.right}px.`,
        });
      }
    }
    if (Array.isArray(n.children)) {
      for (const child of n.children) walkNode(child);
    }
  }

  walkNode(node);
}

// ─────────────────────────────────────────────────────────────
// checkBoundaryOverflow — child bounds extend outside parent bounds
// (Universal — runs on any frame regardless of format. Catches text
// columns overflowing left edges, oversized images escaping containers, etc.)
// ─────────────────────────────────────────────────────────────

export function checkBoundaryOverflow(node: NodeData, issues: Issue[]): void {
  if (!node) return;

  const children: NodeData[] = Array.isArray(node.children) ? node.children : [];
  if (children.length === 0) return;

  const parentWidth = Number(node.width) || 0;
  const parentHeight = Number(node.height) || 0;

  // Skip if parent dimensions are unknown
  if (parentWidth <= 0 || parentHeight <= 0) {
    if (Array.isArray(node.children)) {
      for (const child of node.children) checkBoundaryOverflow(child, issues);
    }
    return;
  }

  // Tolerance for floating-point / sub-pixel rendering — anything beyond this is a real overflow.
  const TOLERANCE = 0.5;

  for (const child of children) {
    const cx = Number(child.x) || 0;
    const cy = Number(child.y) || 0;
    const cw = Number(child.width) || 0;
    const ch = Number(child.height) || 0;

    const violations: string[] = [];
    if (cx < -TOLERANCE) violations.push(`left edge by ${Math.abs(cx).toFixed(0)}px`);
    if (cy < -TOLERANCE) violations.push(`top edge by ${Math.abs(cy).toFixed(0)}px`);
    if (cx + cw > parentWidth + TOLERANCE) violations.push(`right edge by ${(cx + cw - parentWidth).toFixed(0)}px`);
    if (cy + ch > parentHeight + TOLERANCE) violations.push(`bottom edge by ${(cy + ch - parentHeight).toFixed(0)}px`);

    if (violations.length > 0) {
      issues.push({
        rule: 'boundary-overflow',
        severity: 'error',
        nodeId: String(child.id || ''),
        message: `Child "${child.name || child.id}" (${child.type}) extends outside parent "${node.name || node.id}" — overflowing ${violations.join(', ')}.`,
        suggestion: 'Reduce the child width/height, reposition it, or increase parent dimensions. If parent has auto-layout, set child layoutSizingHorizontal=HUG (short labels) or FILL (wrapping copy).',
      });
    }
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) checkBoundaryOverflow(child, issues);
  }
}

// ─────────────────────────────────────────────────────────────
// checkInteractiveTextBackground — CTA/button text without a visible fill
// (Detects bare text that looks like an interactive element but has no
// background rectangle/frame fill behind it.)
// ─────────────────────────────────────────────────────────────

const CTA_LABEL_PATTERNS = [
  // PT-BR
  /^(agendar|reservar|inscrever|comprar|saiba|saber|entrar|cadastrar|contat[ao]|enviar|baixar|criar|come[çc]ar|come[çc]ar agora|experimentar|assinar|come[çc]ar gr[aá]tis|ver mais|ver planos|conhe[çc]er|falar com|solicitar|pedir|adquirir|garantir)/i,
  // EN
  /^(get started|sign up|sign in|subscribe|buy now|buy|learn more|login|log in|submit|send|book|schedule|try|start|download|create|contact|join|register|continue|next|read more|see more|see plans|explore|discover|request|apply)/i,
];

const CTA_NAME_PATTERNS = /\b(btn|button|cta|action|primary|secondary)\b/i;

function nodeHasVisibleFill(node: NodeData): boolean {
  const fills: NodeData[] = Array.isArray(node.fills) ? node.fills : [];
  return fills.some((f) => {
    if (f.visible === false) return false;
    if (f.type === 'SOLID' || f.type === 'IMAGE' || f.type?.startsWith('GRADIENT_')) return true;
    return false;
  });
}

/** Extract the first visible SOLID fill color as a hex string, or null if not solid. */
function getSolidFillHex(node: NodeData): string | null {
  const fills: NodeData[] = Array.isArray(node.fills) ? node.fills : [];
  const solid = fills.find((f) => f.type === 'SOLID' && f.visible !== false);
  if (!solid?.color) return null;
  const { r, g, b } = solid.color;
  return rgbToHex(Number(r) || 0, Number(g) || 0, Number(b) || 0);
}

export function checkInteractiveTextBackground(node: NodeData, issues: Issue[], parent: NodeData | null = null): void {
  if (!node) return;

  if (node.type === 'TEXT') {
    const chars = String(node.characters || '').trim();
    const name = String(node.name || '').trim();

    const looksLikeCTAByLabel = chars.length > 0 && chars.length < 40 && CTA_LABEL_PATTERNS.some((rx) => rx.test(chars));
    const looksLikeCTAByName = CTA_NAME_PATTERNS.test(name);
    const parentLooksLikeButton = parent ? CTA_NAME_PATTERNS.test(String(parent.name || '')) : false;

    const looksInteractive = looksLikeCTAByLabel || looksLikeCTAByName || parentLooksLikeButton;

    if (looksInteractive) {
      // Walk up — does the immediate parent (or its parent if a wrapper) carry a visible fill?
      const parentHasFill = parent ? nodeHasVisibleFill(parent) : false;

      if (!parentHasFill) {
        issues.push({
          rule: 'interactive-text-no-background',
          severity: 'warning',
          nodeId: String(node.id || ''),
          message: `Text "${chars.slice(0, 30)}" looks like an interactive element (CTA/button/nav action) but its parent has no visible background fill.`,
          suggestion: 'Wrap the text in a frame with auto-layout HORIZONTAL, padding 12-24px, fillColor, and cornerRadius. Or apply a fill to the existing parent. Bare text is not a valid button.',
        });
      } else {
        // Parent HAS a fill — verify the text contrast against the button background.
        // Critical case: dark text on dark button = invisible CTA.
        const parentBgHex = parent ? getSolidFillHex(parent) : null;
        const textHex = getSolidFillHex(node);
        if (parentBgHex && textHex) {
          const ratio = computeContrastRatio(textHex, parentBgHex);
          const fontSize = Number(node.fontSize) || 0;
          // WCAG AA: 4.5:1 normal text, 3.0:1 for ≥18px. Buttons typically 14-18px so use 4.5 by default.
          const required = fontSize >= 18 ? 3.0 : 4.5;
          if (ratio < required) {
            issues.push({
              rule: 'interactive-text-low-contrast',
              severity: 'error',
              nodeId: String(node.id || ''),
              message: `Interactive element "${chars.slice(0, 30)}" has invisible/low-contrast text — ratio ${ratio.toFixed(2)}:1 (text ${textHex} on background ${parentBgHex}, requires ${required}:1). This is a fatal usability bug — users cannot read the button label.`,
              suggestion: `Change the text fill to a high-contrast color against ${parentBgHex}. For dark backgrounds use white/cream text; for light backgrounds use black/dark text. Test that the label is clearly readable.`,
            });
          }
        }
      }
    }
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) checkInteractiveTextBackground(child, issues, node);
  }
}

// ─────────────────────────────────────────────────────────────
// checkAutoLayoutPadding — asymmetric padding on auto-layout frames
// (Both top/bottom and left/right pairs differ by > tolerance and both nonzero
// = likely sloppy. One-sided padding (zero on one side) is intentional and skipped.)
// ─────────────────────────────────────────────────────────────

export function checkAutoLayoutPadding(node: NodeData, issues: Issue[]): void {
  if (!node) return;

  const layoutMode: string = node.layoutMode || 'NONE';
  if (layoutMode !== 'NONE') {
    const pt = Number(node.paddingTop) || 0;
    const pb = Number(node.paddingBottom) || 0;
    const pl = Number(node.paddingLeft) || 0;
    const pr = Number(node.paddingRight) || 0;
    const TOLERANCE = 4;

    // Only flag when BOTH values in a pair are nonzero AND differ — pure one-sided padding (e.g. pt=0, pb=20) is intentional.
    if (pt > 0 && pb > 0 && Math.abs(pt - pb) > TOLERANCE) {
      issues.push({
        rule: 'asymmetric-padding',
        severity: 'warning',
        nodeId: String(node.id || ''),
        message: `Frame "${node.name || node.id}" has asymmetric vertical padding (top: ${pt}px, bottom: ${pb}px). Difference of ${Math.abs(pt - pb)}px looks unintentional.`,
        suggestion: `Use equal padding (${Math.round((pt + pb) / 2)}px on both sides) unless the asymmetry is a deliberate design choice (e.g. extra bottom space for a CTA below).`,
      });
    }
    if (pl > 0 && pr > 0 && Math.abs(pl - pr) > TOLERANCE) {
      issues.push({
        rule: 'asymmetric-padding',
        severity: 'warning',
        nodeId: String(node.id || ''),
        message: `Frame "${node.name || node.id}" has asymmetric horizontal padding (left: ${pl}px, right: ${pr}px). Difference of ${Math.abs(pl - pr)}px looks unintentional.`,
        suggestion: `Use equal padding (${Math.round((pl + pr) / 2)}px on both sides) unless the asymmetry is a deliberate design choice.`,
      });
    }
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) checkAutoLayoutPadding(child, issues);
  }
}

// ─────────────────────────────────────────────────────────────
// checkCanvasOrphanage — siblings of the design root frame whose bounds
// fall geometrically inside the design root (= probably should be its
// children, not page-level siblings).
// ─────────────────────────────────────────────────────────────

interface BBox { x: number; y: number; width: number; height: number; }

function getAbsoluteBox(node: NodeData): BBox | null {
  const abs = node.absoluteBoundingBox;
  if (abs && typeof abs === 'object') {
    return {
      x: Number(abs.x) || 0,
      y: Number(abs.y) || 0,
      width: Number(abs.width) || 0,
      height: Number(abs.height) || 0,
    };
  }
  if (typeof node.x === 'number' && typeof node.y === 'number') {
    return {
      x: Number(node.x) || 0,
      y: Number(node.y) || 0,
      width: Number(node.width) || 0,
      height: Number(node.height) || 0,
    };
  }
  return null;
}

function bboxIntersectsCenter(siblingBox: BBox, rootBox: BBox): boolean {
  // True if the sibling's center point is inside the root's bbox.
  const cx = siblingBox.x + siblingBox.width / 2;
  const cy = siblingBox.y + siblingBox.height / 2;
  return cx >= rootBox.x && cx <= rootBox.x + rootBox.width && cy >= rootBox.y && cy <= rootBox.y + rootBox.height;
}

export function checkCanvasOrphanage(rootNode: NodeData, pageNodes: NodeData[], issues: Issue[]): void {
  if (!rootNode || !Array.isArray(pageNodes) || pageNodes.length === 0) return;

  const rootBox = getAbsoluteBox(rootNode);
  if (!rootBox) return;

  const rootId = String(rootNode.id || '');

  for (const sibling of pageNodes) {
    const sibId = String(sibling.id || '');
    if (sibId === rootId) continue;
    const sibBox = getAbsoluteBox(sibling);
    if (!sibBox) continue;

    if (bboxIntersectsCenter(sibBox, rootBox)) {
      issues.push({
        rule: 'canvas-orphan',
        severity: 'error',
        nodeId: sibId,
        message: `Node "${sibling.name || sibId}" (${sibling.type}) is at canvas root but its center point falls inside design frame "${rootNode.name || rootId}". It is almost certainly an orphan that should be a child of the design frame.`,
        suggestion: `Move "${sibling.name || sibId}" inside "${rootNode.name || rootId}" using append_child(parentId="${rootId}", nodeId="${sibId}"). If it was intentionally separate, ignore this warning.`,
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────

export const runRefinementCheckSchema = {
  nodeId: z.string().describe('Root frame ID of the design to check'),
};

export function registerRefinementTools(
  server: McpServer,
  sendDesignCommand: SendDesignCommand
): void {
  // @ts-expect-error — TS2589: ZodRawShapeCompat deep instantiation with MCP SDK v1.26 + zod 3.25
  server.tool(
    'run_refinement_check',
    'Run automated quality checks on a design: contrast, spacing, typography hierarchy, gradient direction, and more.',
    runRefinementCheckSchema,
    async (params) => {
      const tree = await sendDesignCommand('get_node_info', {
        nodeId: params.nodeId,
        depth: 5,
      });

      // Fetch page-level nodes for canvas-orphan detection (siblings of the design root)
      let pageNodes: NodeData[] = [];
      try {
        const pageResult = await sendDesignCommand('get_page_nodes', {});
        const raw = (pageResult as Record<string, unknown>)['nodes'] ?? pageResult;
        pageNodes = Array.isArray(raw) ? (raw as NodeData[]) : [];
      } catch {
        // get_page_nodes unavailable — skip orphan check, continue with the rest.
      }

      const issues: Issue[] = [];

      checkGradientDirection(tree, issues);
      checkAutoLayoutCoverage(tree, issues);
      checkSpacingScale(tree, issues);
      checkTypographyHierarchy(tree, issues);
      checkEmptyPlaceholders(tree, issues);
      checkContrastRatio(tree, issues);
      checkSafeZones(tree, issues);
      checkBoundaryOverflow(tree, issues);
      checkInteractiveTextBackground(tree, issues);
      checkAutoLayoutPadding(tree, issues);
      if (pageNodes.length > 0) checkCanvasOrphanage(tree, pageNodes, issues);

      const errorCount = issues.filter((i) => i.severity === 'error').length;
      const warnCount = issues.filter((i) => i.severity === 'warning').length;
      const score = Math.max(0, 100 - errorCount * 15 - warnCount * 5);

      const summary =
        score >= 80
          ? 'Good — minor refinements suggested'
          : score >= 50
          ? 'Needs work — several quality issues found'
          : 'Poor — major structural issues, redesign sections';

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ score, issueCount: issues.length, issues, summary }, null, 2),
          },
        ],
      };
    }
  );
}
