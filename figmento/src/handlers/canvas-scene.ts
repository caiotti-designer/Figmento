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

export async function handleBooleanOperation(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeIds = params.nodeIds as string[];
  if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length < 2) {
    throw new Error('Boolean operations require at least 2 node IDs');
  }

  const operation = (params.operation as string) || 'UNION';
  const nodes: SceneNode[] = [];
  for (const id of nodeIds) {
    const node = figma.getNodeById(id);
    if (!node) throw new Error(`Node not found: ${id}`);
    nodes.push(node as SceneNode);
  }

  const parent = nodes[0].parent || figma.currentPage;
  let result: SceneNode;

  switch (operation) {
    case 'UNION':
      result = figma.union(nodes, parent as BaseNode & ChildrenMixin);
      break;
    case 'SUBTRACT':
      result = figma.subtract(nodes, parent as BaseNode & ChildrenMixin);
      break;
    case 'INTERSECT':
      result = figma.intersect(nodes, parent as BaseNode & ChildrenMixin);
      break;
    case 'EXCLUDE':
      result = figma.exclude(nodes, parent as BaseNode & ChildrenMixin);
      break;
    default:
      throw new Error(`Unknown boolean operation: ${operation}. Must be UNION, SUBTRACT, INTERSECT, or EXCLUDE.`);
  }

  if (params.name) result.name = params.name as string;

  return { nodeId: result.id, name: result.name, type: result.type, width: Math.round(result.width), height: Math.round(result.height) };
}

export async function handleFlattenNodes(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeIds = params.nodeIds as string[];
  if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length < 1) {
    throw new Error('Flatten requires at least 1 node ID');
  }

  const nodes: SceneNode[] = [];
  for (const id of nodeIds) {
    const node = figma.getNodeById(id);
    if (!node) throw new Error(`Node not found: ${id}`);
    nodes.push(node as SceneNode);
  }

  const parent = nodes[0].parent || figma.currentPage;
  const result = figma.flatten(nodes, parent as BaseNode & ChildrenMixin);

  if (params.name) result.name = params.name as string;

  return { nodeId: result.id, name: result.name, type: result.type, width: Math.round(result.width), height: Math.round(result.height) };
}

export async function handleImportComponentByKey(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const key = params.key as string;
  if (!key) throw new Error('Component key is required');

  let component: ComponentNode | ComponentSetNode;
  try {
    component = await figma.importComponentByKeyAsync(key);
  } catch (e) {
    // Maybe it's a component set
    try {
      component = await figma.importComponentSetByKeyAsync(key);
    } catch (_e2) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      throw new Error(`Could not import component with key "${key}". Make sure the library is enabled. Error: ${msg}`);
    }
  }

  // If it's a component set, pick the right variant
  let targetComponent: ComponentNode;
  if (component.type === 'COMPONENT_SET') {
    const variantName = params.variantName as string | undefined;
    if (variantName) {
      const variant = component.children.find(c => c.name === variantName) ||
                       component.children.find(c => c.name.toLowerCase().includes(variantName.toLowerCase()));
      targetComponent = (variant || component.defaultVariant || component.children[0]) as ComponentNode;
    } else {
      targetComponent = (component.defaultVariant || component.children[0]) as ComponentNode;
    }
  } else {
    targetComponent = component as ComponentNode;
  }

  const instance = targetComponent.createInstance();
  instance.x = (params.x as number) || 0;
  instance.y = (params.y as number) || 0;
  if (params.name) instance.name = params.name as string;

  if (params.parentId) {
    const parent = figma.getNodeById(params.parentId as string);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(instance);
    }
  }

  // List variants if component set
  let variants: Array<{ id: string; name: string }> | null = null;
  if (component.type === 'COMPONENT_SET') {
    variants = component.children.map(v => ({ id: v.id, name: v.name }));
  }

  return {
    nodeId: instance.id,
    name: instance.name,
    componentName: component.name,
    width: Math.round(instance.width),
    height: Math.round(instance.height),
    variants,
  };
}

export async function handleImportStyleByKey(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const key = params.key as string;
  if (!key) throw new Error('Style key is required');

  try {
    const style = await figma.importStyleByKeyAsync(key);
    return { id: style.id, name: style.name, type: style.type };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    throw new Error(`Could not import style with key "${key}". Make sure the library is enabled. Error: ${msg}`);
  }
}

export async function handleFindNodes(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const name = params.name as string | undefined;
  const type = params.type as string | undefined;
  const textContent = params.text_content as string | undefined;
  const parentId = params.parentId as string | undefined;
  const maxResults = (params.max_results as number) || 50;

  if (!name && !type && !textContent) {
    throw new Error('At least one filter is required: name, type, or text_content');
  }

  let searchRoot: BaseNode & ChildrenMixin;
  if (parentId) {
    const parentNode = figma.getNodeById(parentId);
    if (!parentNode || !('findAll' in parentNode)) {
      throw new Error(`Parent node ${parentId} not found or cannot be searched`);
    }
    searchRoot = parentNode as BaseNode & ChildrenMixin;
  } else {
    searchRoot = figma.currentPage;
  }

  const nameLower = name?.toLowerCase();
  const textLower = textContent?.toLowerCase();

  // Single pass with findAll — check name, type, and text content together
  const seenIds = new Set<string>();
  const results: Array<Record<string, unknown>> = [];

  searchRoot.findAll((node: SceneNode) => {
    if (results.length >= maxResults) return false;
    if (seenIds.has(node.id)) return false;

    // Type filter
    if (type && node.type !== type) return false;

    // Name filter
    const nameMatch = !nameLower || node.name.toLowerCase().includes(nameLower);

    // Text content filter (only for TEXT nodes)
    let textMatch = true;
    if (textLower) {
      if (node.type === 'TEXT') {
        textMatch = (node as TextNode).characters.toLowerCase().includes(textLower);
      } else {
        // If text_content filter is set but node isn't text, check name instead
        textMatch = !nameLower ? false : nameMatch;
        if (!nameMatch) return false;
      }
    }

    if (!nameMatch && !textLower) return false;
    if (textLower && !textMatch) return false;
    if (nameLower && !textLower && !nameMatch) return false;

    seenIds.add(node.id);

    const entry: Record<string, unknown> = {
      id: node.id,
      name: node.name,
      type: node.type,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    };

    if (node.parent) {
      entry.parentId = node.parent.id;
      entry.parentName = node.parent.name;
    }

    if (node.type === 'TEXT') {
      entry.text = (node as TextNode).characters;
    }

    results.push(entry);
    return false; // Don't collect via findAll return — we build our own list
  });

  return { count: results.length, nodes: results };
}

export async function handleListAvailableFonts(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const query = (params.query as string)?.toLowerCase();
  const limit = (params.limit as number) || 50;

  // Get all available fonts
  const availableFonts = await figma.listAvailableFontsAsync();

  // Group by family
  const familyMap = new Map<string, string[]>();
  for (const font of availableFonts) {
    if (query && !font.fontName.family.toLowerCase().includes(query)) continue;

    const existing = familyMap.get(font.fontName.family);
    if (existing) {
      if (!existing.includes(font.fontName.style)) {
        existing.push(font.fontName.style);
      }
    } else {
      familyMap.set(font.fontName.family, [font.fontName.style]);
    }
  }

  // Sort alphabetically and limit
  const allFamilies = Array.from(familyMap.keys()).sort();
  const limitedFamilies = allFamilies.slice(0, limit);
  const fonts = limitedFamilies.map(family => ({
    family,
    styles: familyMap.get(family)!,
  }));

  // Get project fonts from local text styles
  const projectFonts: Array<Record<string, unknown>> = [];
  try {
    const textStyles = await figma.getLocalTextStylesAsync();
    for (const style of textStyles) {
      const fontName = style.fontName;
      if (fontName && typeof fontName === 'object' && 'family' in fontName) {
        if (query && !fontName.family.toLowerCase().includes(query)) continue;
        projectFonts.push({
          family: fontName.family,
          style: fontName.style,
          styleName: style.name,
          fontSize: style.fontSize,
        });
      }
    }
  } catch (_e) {
    // Text styles may not be available in all contexts
  }

  return {
    count: fonts.length,
    totalFamilies: allFamilies.length,
    fonts,
    projectFonts,
  };
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
