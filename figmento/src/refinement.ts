/// <reference types="@figma/plugin-typings" />

// ═══════════════════════════════════════════════════════════════
// Post-Creation Refinement — MQ-8
// Runs automatically after createDesignFromAnalysis() to fix
// common structural issues before the user sees the result.
// No MCP or WebSocket calls — direct Figma Plugin API only.
// ═══════════════════════════════════════════════════════════════

const VALID_SPACING = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128];

function nearestValidSpacing(val: number): number {
  return VALID_SPACING.reduce((a, b) =>
    Math.abs(b - val) < Math.abs(a - val) ? b : a
  );
}

export function countNodes(node: SceneNode): number {
  let count = 1;
  if ('children' in node) {
    for (const child of (node as ChildrenMixin).children) {
      count += countNodes(child as SceneNode);
    }
  }
  return count;
}

export async function postCreationRefinement(rootNode: SceneNode): Promise<void> {
  const fixes: string[] = [];

  function walk(node: SceneNode): void {
    if (node.type === 'FRAME') {
      const frame = node as FrameNode;

      // Check 1: Auto-layout coverage — frame with 2+ children but no layout
      if ('children' in frame && frame.children.length >= 2 && frame.layoutMode === 'NONE') {
        frame.layoutMode = 'VERTICAL';
        frame.itemSpacing = 16;
        frame.primaryAxisAlignItems = 'MIN';
        frame.counterAxisAlignItems = 'MIN';
        fixes.push(`auto-layout set on "${frame.name}"`);
      }

      // Check 2: Spacing on 8px grid (auto-layout frames only)
      if (frame.layoutMode !== 'NONE') {
        if (!VALID_SPACING.includes(frame.itemSpacing)) {
          const fixed = nearestValidSpacing(frame.itemSpacing);
          const old = frame.itemSpacing;
          frame.itemSpacing = fixed; // MUST set before push — see MQ-8 bug fix warning
          fixes.push(`spacing ${old}→${fixed} on "${frame.name}"`);
        }
      }

      // Check 3: Gradient direction (v1: skip — matrix inversion not available)
      // Figma's gradientTransform is a 2×3 affine matrix. Reliably inverting it to
      // detect "which end is solid" requires utilities not yet in gradient-utils.ts.
      // Log awareness only when gradient + text children are both present.
      if ('fills' in frame && Array.isArray(frame.fills)) {
        const hasGradient = (frame.fills as Paint[]).some(f => f.type === 'GRADIENT_LINEAR');
        if (hasGradient && 'children' in frame) {
          const hasText = (frame.children as SceneNode[]).some(
            c => c.type === 'TEXT' ||
              ('children' in c && (c as ChildrenMixin).children.some(gc => gc.type === 'TEXT'))
          );
          if (hasText) {
            console.log(`MQ Refinement: gradient direction ambiguous, skipped on "${frame.name}"`);
          }
        }
      }
    }

    // Recurse into children
    if ('children' in node) {
      for (const child of (node as ChildrenMixin).children) {
        walk(child as SceneNode);
      }
    }
  }

  walk(rootNode);

  if (fixes.length > 0) {
    console.log(`MQ Refinement: ${fixes.join(', ')}`);
  }
}
