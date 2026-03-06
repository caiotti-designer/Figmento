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

// ─────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────

export function registerRefinementTools(
  server: McpServer,
  sendDesignCommand: SendDesignCommand
): void {
  // @ts-expect-error — TS2589: ZodRawShapeCompat deep instantiation with MCP SDK v1.26 + zod 3.25
  server.tool(
    'run_refinement_check',
    'Run automated quality checks on a design. Checks gradient direction vs text position, auto-layout coverage, spacing scale compliance, typography hierarchy, and unfilled image placeholders. Call after creating any design with 5+ elements.',
    {
      nodeId: z.string().describe('Root frame ID of the design to check'),
    },
    async (params) => {
      const tree = await sendDesignCommand('get_node_info', {
        nodeId: params.nodeId,
        depth: 5,
      });

      const issues: Issue[] = [];

      checkGradientDirection(tree, issues);
      checkAutoLayoutCoverage(tree, issues);
      checkSpacingScale(tree, issues);
      checkTypographyHierarchy(tree, issues);
      checkEmptyPlaceholders(tree, issues);

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
