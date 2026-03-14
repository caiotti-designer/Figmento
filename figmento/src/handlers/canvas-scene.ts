/// <reference types="@figma/plugin-typings" />

import { hexToRgb, getFontStyle } from '../color-utils';
import { serializeNode, findChildByName } from '../utils/node-utils';

export async function handleDeleteNode(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const name = node.name;
  node.remove();

  return { deleted: true, name };
}

export async function handleMoveNode(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  if (params.x !== undefined) (node as SceneNode).x = params.x as number;
  if (params.y !== undefined) (node as SceneNode).y = params.y as number;

  return { nodeId, x: (node as SceneNode).x, y: (node as SceneNode).y };
}

export async function handleResizeNode(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node || !('resize' in node)) throw new Error(`Node ${nodeId} not found or cannot be resized`);

  const width = (params.width as number) || (node as SceneNode).width;
  const height = (params.height as number) || (node as SceneNode).height;
  (node as FrameNode).resize(width, height);

  return { nodeId, width, height };
}

export async function handleRenameNode(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const name = (params.name as string) || 'Renamed';
  node.name = name;

  return { nodeId, name };
}

export async function handleAppendChild(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const parentId = params.parentId as string;
  const childId = params.childId as string;
  if (!parentId || !childId) throw new Error('parentId and childId are required');

  const parent = figma.getNodeById(parentId);
  const child = figma.getNodeById(childId);
  if (!parent || !('appendChild' in parent)) throw new Error(`Parent ${parentId} not found or cannot have children`);
  if (!child) throw new Error(`Child ${childId} not found`);

  (parent as FrameNode).appendChild(child as SceneNode);

  return { parentId, childId, success: true };
}

export async function handleReorderChild(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const parentId = params.parentId as string;
  const childId = params.childId as string;
  if (!parentId || !childId) throw new Error('parentId and childId are required');

  const parent = figma.getNodeById(parentId);
  if (!parent || !('children' in parent)) {
    throw new Error(`NODE_NOT_FOUND: Parent ${parentId} not found or cannot have children`);
  }

  const child = figma.getNodeById(childId);
  if (!child) {
    throw new Error(`NODE_NOT_FOUND: Child ${childId} not found`);
  }

  const parentFrame = parent as FrameNode;
  const childNode = child as SceneNode;

  if (childNode.parent?.id !== parentFrame.id) {
    throw new Error(`PARENT_MISMATCH: Child ${childId} is not a child of parent ${parentId}`);
  }

  const index = params.index as number | undefined;
  if (index !== undefined) {
    parentFrame.insertChild(index, childNode);
  } else {
    parentFrame.appendChild(childNode);
  }

  const newIndex = parentFrame.children.indexOf(childNode);
  return { parentId, childId, newIndex };
}

export async function handleCloneNode(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node || !('clone' in node)) throw new Error(`Node not found: ${nodeId}`);

  const sourceNode = node as SceneNode;
  const clone = sourceNode.clone();

  let targetParent: FrameNode | null = null;

  if (params.parentId) {
    const target = figma.getNodeById(params.parentId as string);
    if (target && 'appendChild' in target) {
      targetParent = target as FrameNode;
      targetParent.appendChild(clone);
    }
  } else if (sourceNode.parent && sourceNode.parent.type !== 'PAGE' && 'appendChild' in sourceNode.parent) {
    targetParent = sourceNode.parent as FrameNode;
    targetParent.appendChild(clone);
  }

  // If the clone is an image placed into an auto-layout parent, set FILL sizing
  // so it stretches to cover the parent frame (e.g., background images).
  if (targetParent && 'layoutMode' in targetParent && targetParent.layoutMode !== 'NONE') {
    const isImageNode = 'fills' in clone && Array.isArray((clone as GeometryMixin).fills) &&
      ((clone as GeometryMixin).fills as ReadonlyArray<Paint>).some((f: Paint) => f.type === 'IMAGE');
    if (isImageNode && 'layoutSizingHorizontal' in clone) {
      (clone as FrameNode).layoutSizingHorizontal = 'FILL';
      (clone as FrameNode).layoutSizingVertical = 'FILL';
    }
  }

  const offsetX = (params.offsetX as number) || 0;
  const offsetY = (params.offsetY as number) || 0;
  if (offsetX !== 0 || offsetY !== 0) {
    clone.x += offsetX;
    clone.y += offsetY;
  }

  if (params.newName) {
    clone.name = params.newName as string;
  }

  return { nodeId: clone.id, name: clone.name };
}

interface CloneCopySpec {
  offsetX?: number;
  offsetY?: number;
  newName?: string;
  overrides?: Array<{
    childName: string;
    properties: {
      content?: string;
      color?: string;
      fontSize?: number;
      fontWeight?: number;
      opacity?: number;
    };
  }>;
}

export async function handleCloneWithOverrides(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node || !('clone' in node)) throw new Error(`Node not found: ${nodeId}`);

  const copies = params.copies as CloneCopySpec[];
  if (!copies || !Array.isArray(copies) || copies.length === 0) {
    throw new Error('copies array is required and must not be empty');
  }

  const sourceNode = node as SceneNode;
  const results: Array<{ nodeId: string; name: string }> = [];

  for (const spec of copies) {
    const clone = sourceNode.clone();

    if (sourceNode.parent && sourceNode.parent.type !== 'PAGE' && 'appendChild' in sourceNode.parent) {
      (sourceNode.parent as FrameNode).appendChild(clone);
    }

    const offsetX = spec.offsetX || 0;
    const offsetY = spec.offsetY || 0;
    if (offsetX !== 0 || offsetY !== 0) {
      clone.x += offsetX;
      clone.y += offsetY;
    }

    if (spec.newName) {
      clone.name = spec.newName;
    }

    if (spec.overrides && spec.overrides.length > 0) {
      for (const override of spec.overrides) {
        const child = findChildByName(clone, override.childName);
        if (!child) continue;

        const props = override.properties;

        if (props.content !== undefined && child.type === 'TEXT') {
          const textNode = child as TextNode;
          const existingFont = textNode.fontName as FontName;
          try {
            await figma.loadFontAsync(existingFont);
          } catch (_e) {
            await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
          }
          textNode.characters = props.content;

          if (props.fontSize !== undefined) {
            textNode.fontSize = props.fontSize;
          }

          if (props.fontWeight !== undefined) {
            const family = (textNode.fontName as FontName).family;
            const style = getFontStyle(props.fontWeight);
            try {
              await figma.loadFontAsync({ family, style });
              textNode.fontName = { family, style };
            } catch (_e) {
              // Keep existing font weight if load fails
            }
          }
        }

        if (props.color !== undefined && 'fills' in child) {
          (child as GeometryMixin).fills = [{
            type: 'SOLID',
            color: hexToRgb(props.color),
          }];
        }

        if (props.opacity !== undefined && 'opacity' in child) {
          (child as BlendMixin).opacity = props.opacity;
        }
      }
    }

    results.push({ nodeId: clone.id, name: clone.name });
  }

  return { clones: results, count: results.length };
}

export async function handleGroupNodes(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeIds = params.nodeIds as string[];
  if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length < 2) {
    throw new Error('nodeIds must be an array with at least 2 node IDs');
  }

  const nodes: SceneNode[] = [];
  for (const id of nodeIds) {
    const node = figma.getNodeById(id);
    if (!node) throw new Error(`Node not found: ${id}`);
    nodes.push(node as SceneNode);
  }

  const parent = nodes[0].parent;
  if (!parent) throw new Error(`Node ${nodeIds[0]} has no parent`);
  for (let i = 1; i < nodes.length; i++) {
    if (nodes[i].parent !== parent) {
      throw new Error(`PARENT_MISMATCH: Nodes must share the same parent. "${nodes[i].name}" (${nodeIds[i]}) has a different parent than "${nodes[0].name}" (${nodeIds[0]})`);
    }
  }

  const group = figma.group(nodes, parent as BaseNode & ChildrenMixin);

  if (params.name) {
    group.name = params.name as string;
  }

  return { nodeId: group.id, name: group.name, childCount: group.children.length };
}

export async function handleGetSelection(): Promise<Record<string, unknown>> {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    return { count: 0, nodes: [] };
  }

  const nodes = selection.map(node => ({
    nodeId: node.id,
    name: node.name,
    type: node.type,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  }));

  return { count: selection.length, nodes };
}

export async function handleGetNodeInfo(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const depth = (params.depth as number) || 1;
  return serializeNode(node, 0, depth);
}

export async function handleGetPageNodes(): Promise<Record<string, unknown>> {
  const children = figma.currentPage.children;
  const nodes = children.map(node => ({
    nodeId: node.id,
    name: node.name,
    type: node.type,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  }));

  return { pageName: figma.currentPage.name, count: nodes.length, nodes };
}
