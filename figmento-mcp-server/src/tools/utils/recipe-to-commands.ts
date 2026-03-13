// ═══════════════════════════════════════════════════════════
// DS-07 helper: Convert resolved recipe → batch_execute commands
// ═══════════════════════════════════════════════════════════

import type { BatchCommand } from '../design-system/ds-types';

export function recipeToCommands(
  resolved: Record<string, unknown>,
  opts: { parentId?: string; x?: number; y?: number; componentName?: string; variant?: string },
): BatchCommand[] {
  const commands: BatchCommand[] = [];
  const componentName = opts.componentName || 'Component';
  const variant = opts.variant || 'default';

  // Map recipe type to Figma create action
  const actionMap: Record<string, string> = {
    frame: 'create_frame',
    text: 'create_text',
    rectangle: 'create_rectangle',
    ellipse: 'create_ellipse',
  };

  const skipKeys = new Set(['type', 'children', 'stroke', 'effects']);

  // Recursive helper — processes a single node and all its descendants
  function processNode(
    node: Record<string, unknown>,
    parentTempId: string | null,
    tempId: string,
  ): void {
    const nodeType = node.type as string;
    const action = actionMap[nodeType];
    if (!action) return;

    const nodeChildren = node.children as Array<Record<string, unknown>> | undefined;
    const params: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(node)) {
      if (skipKeys.has(key)) continue;
      if (key === 'content' && nodeType === 'text') {
        params.text = val;
      } else {
        params[key] = val;
      }
    }

    if (parentTempId) {
      params.parentId = `$${parentTempId}`;
    } else {
      // Root node: apply canvas positioning
      if (opts.x !== undefined) params.x = opts.x;
      if (opts.y !== undefined) params.y = opts.y;
      if (opts.parentId) params.parentId = opts.parentId;
      params.name = (node.name as string) || `${componentName}_${variant}`;
    }

    if (!params.name) {
      params.name = (node.name as string) || `${componentName}_node`;
    }

    commands.push({ action, params, tempId });

    // Stroke (applied after creation)
    const stroke = node.stroke as Record<string, unknown> | undefined;
    if (stroke?.color) {
      commands.push({
        action: 'set_stroke',
        params: { nodeId: `$${tempId}`, color: stroke.color, width: stroke.width || 1 },
      });
    }

    // Effects (applied after creation)
    const effects = node.effects as Array<Record<string, unknown>> | undefined;
    if (effects?.length) {
      commands.push({
        action: 'set_effects',
        params: {
          nodeId: `$${tempId}`,
          effects: effects.map(e => ({
            type: e.type || 'DROP_SHADOW',
            color: e.color as string,
            opacity: e.opacity as number,
            offset: e.offset || { x: 0, y: 0 },
            blur: e.blur || 0,
            spread: e.spread || 0,
          })),
        },
      });
    }

    // Auto-layout for frames
    if (nodeType === 'frame' && node.layoutMode) {
      commands.push({
        action: 'set_auto_layout',
        params: {
          nodeId: `$${tempId}`,
          layoutMode: node.layoutMode,
          primaryAxisSizingMode: node.primaryAxisSizingMode,
          counterAxisSizingMode: node.counterAxisSizingMode,
          itemSpacing: node.itemSpacing,
          paddingTop: node.paddingTop,
          paddingRight: node.paddingRight,
          paddingBottom: node.paddingBottom,
          paddingLeft: node.paddingLeft,
          primaryAxisAlignItems: node.primaryAxisAlignItems,
          counterAxisAlignItems: node.counterAxisAlignItems,
        },
      });
    }

    // Recurse into children
    if (nodeChildren?.length) {
      for (let i = 0; i < nodeChildren.length; i++) {
        processNode(nodeChildren[i], tempId, `${tempId}_c${i}`);
      }
    }
  }

  const rootNodeType = resolved.type as string;
  if (!actionMap[rootNodeType]) {
    throw new Error(`Unknown recipe element type: ${rootNodeType}`);
  }

  processNode(resolved, null, 'comp_root');
  return commands;
}
