/// <reference types="@figma/plugin-typings" />

import { hexToRgb } from '../color-utils';
import { resolveParent } from './canvas-create';

// ═══════════════════════════════════════════════════════════════
// IC-1: Create Component + Convert to Component
// ═══════════════════════════════════════════════════════════════

export async function handleCreateComponent(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const comp = figma.createComponent();
  comp.name = (params.name as string) || 'Component';
  comp.resize(
    (params.width as number) || 100,
    (params.height as number) || 100
  );
  comp.x = (params.x as number) || 0;
  comp.y = (params.y as number) || 0;

  if (params.description) comp.description = params.description as string;

  // Corner radius
  if (params.cornerRadius !== undefined) {
    const cr = params.cornerRadius;
    if (typeof cr === 'number') {
      comp.cornerRadius = cr;
    } else if (Array.isArray(cr) && cr.length === 4) {
      comp.topLeftRadius = cr[0] as number;
      comp.topRightRadius = cr[1] as number;
      comp.bottomRightRadius = cr[2] as number;
      comp.bottomLeftRadius = cr[3] as number;
    }
  }

  // Fill color
  if (params.fillColor) {
    const rgb = hexToRgb(params.fillColor as string);
    comp.fills = [{ type: 'SOLID', color: rgb }];
  }

  // Auto-layout
  if (params.layoutMode) {
    const mode = (params.layoutMode as string).toUpperCase();
    if (mode === 'HORIZONTAL' || mode === 'VERTICAL') {
      comp.layoutMode = mode;
      if (params.itemSpacing !== undefined) comp.itemSpacing = params.itemSpacing as number;
      if (params.paddingTop !== undefined) comp.paddingTop = params.paddingTop as number;
      if (params.paddingRight !== undefined) comp.paddingRight = params.paddingRight as number;
      if (params.paddingBottom !== undefined) comp.paddingBottom = params.paddingBottom as number;
      if (params.paddingLeft !== undefined) comp.paddingLeft = params.paddingLeft as number;
      // Shorthand padding
      if (params.padding !== undefined) {
        const p = params.padding as number;
        comp.paddingTop = p;
        comp.paddingRight = p;
        comp.paddingBottom = p;
        comp.paddingLeft = p;
      }
      if (params.primaryAxisAlignItems) {
        comp.primaryAxisAlignItems = params.primaryAxisAlignItems as 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
      }
      if (params.counterAxisAlignItems) {
        comp.counterAxisAlignItems = params.counterAxisAlignItems as 'MIN' | 'CENTER' | 'MAX';
      }
      if (params.primaryAxisSizingMode) {
        comp.primaryAxisSizingMode = params.primaryAxisSizingMode as 'FIXED' | 'AUTO';
      }
      if (params.counterAxisSizingMode) {
        comp.counterAxisSizingMode = params.counterAxisSizingMode as 'FIXED' | 'AUTO';
      }
    }
  }

  // Clips content
  if (params.clipsContent !== undefined) comp.clipsContent = params.clipsContent as boolean;

  // Parent — throws if parentId is invalid
  const compParent = resolveParent(params.parentId);
  if (compParent) {
    compParent.appendChild(comp);
  } else {
    // Center in viewport if no explicit position
    if (params.x === undefined && params.y === undefined) {
      const center = figma.viewport.center;
      comp.x = center.x - comp.width / 2;
      comp.y = center.y - comp.height / 2;
    }
  }

  return {
    nodeId: comp.id,
    name: comp.name,
    type: comp.type,
    componentKey: comp.key,
  };
}

export async function handleConvertToComponent(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found`);
  if (!('type' in node)) throw new Error(`Node ${nodeId} is not a scene node`);

  const sceneNode = node as SceneNode;
  if (sceneNode.type === 'COMPONENT') throw new Error(`Node ${nodeId} is already a COMPONENT`);
  if (sceneNode.type === 'INSTANCE') throw new Error(`Cannot convert INSTANCE to component — use detach_instance first`);
  if (sceneNode.type === 'COMPONENT_SET') throw new Error(`Node ${nodeId} is already a COMPONENT_SET`);

  // Check if inside an instance (reparenting restriction)
  let parent = sceneNode.parent;
  while (parent) {
    if ('type' in parent && (parent as SceneNode).type === 'INSTANCE') {
      throw new Error(`Node is inside an instance — cannot convert to component`);
    }
    parent = parent.parent;
  }

  const comp = figma.createComponentFromNode(sceneNode);
  return {
    nodeId: comp.id,
    name: comp.name,
    type: comp.type,
    componentKey: comp.key,
  };
}

// ═══════════════════════════════════════════════════════════════
// IC-2: Combine as Variants
// ═══════════════════════════════════════════════════════════════

export async function handleCombineAsVariants(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeIds = params.componentIds as string[];
  const name = params.name as string | undefined;

  if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length < 2) {
    throw new Error('combine_as_variants requires componentIds array with at least 2 IDs');
  }

  const components: ComponentNode[] = [];
  for (const id of nodeIds) {
    const node = figma.getNodeById(id);
    if (!node) throw new Error(`Node ${id} not found`);

    const sceneNode = node as SceneNode;

    // Auto-convert frames/groups to components
    if (sceneNode.type === 'FRAME' || sceneNode.type === 'GROUP') {
      const comp = figma.createComponentFromNode(sceneNode);
      components.push(comp);
    } else if (sceneNode.type === 'COMPONENT') {
      components.push(sceneNode as ComponentNode);
    } else {
      throw new Error(`Node ${id} is type ${sceneNode.type} — expected COMPONENT or FRAME`);
    }
  }

  // Validate same parent
  const parentNode = components[0].parent;
  for (let i = 1; i < components.length; i++) {
    if (components[i].parent !== parentNode) {
      throw new Error('All components must share the same parent to combine as variants');
    }
  }

  // Check not inside an instance
  let ancestor = parentNode;
  while (ancestor) {
    if ('type' in ancestor && (ancestor as SceneNode).type === 'INSTANCE') {
      throw new Error('Cannot combine as variants — components are inside an instance');
    }
    ancestor = ancestor.parent;
  }

  const componentSet = figma.combineAsVariants(
    components,
    parentNode as BaseNode & ChildrenMixin
  );
  if (name) componentSet.name = name;

  // Match Figma's manual variant layout: vertical auto-layout with padding + spacing
  componentSet.layoutMode = 'VERTICAL';
  componentSet.paddingTop = 32;
  componentSet.paddingRight = 32;
  componentSet.paddingBottom = 32;
  componentSet.paddingLeft = 32;
  componentSet.itemSpacing = 16;
  componentSet.primaryAxisSizingMode = 'AUTO';
  componentSet.counterAxisSizingMode = 'AUTO';

  // Extract variant properties
  const variantProperties: Record<string, string[]> = {};
  for (const child of componentSet.children) {
    if (child.type === 'COMPONENT') {
      const variant = child as ComponentNode;
      const props = variant.variantProperties;
      if (props) {
        for (const [key, value] of Object.entries(props)) {
          if (!variantProperties[key]) variantProperties[key] = [];
          if (!variantProperties[key].includes(value)) variantProperties[key].push(value);
        }
      }
    }
  }

  return {
    nodeId: componentSet.id,
    name: componentSet.name,
    type: componentSet.type,
    variantProperties,
    childCount: componentSet.children.length,
  };
}

// ═══════════════════════════════════════════════════════════════
// IC-3: Create Instance + Detach
// ═══════════════════════════════════════════════════════════════

export async function handleCreateInstance(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const componentId = params.componentId as string;
  if (!componentId) throw new Error('componentId is required');

  const node = figma.getNodeById(componentId);
  if (!node) throw new Error(`Component ${componentId} not found`);

  const sceneNode = node as SceneNode;
  let instance: InstanceNode;

  if (sceneNode.type === 'COMPONENT') {
    instance = (sceneNode as ComponentNode).createInstance();
  } else if (sceneNode.type === 'COMPONENT_SET') {
    const componentSet = sceneNode as ComponentSetNode;
    const variantProps = params.variantProperties as Record<string, string> | undefined;

    // Find matching variant
    let targetComponent: ComponentNode | null = null;

    if (variantProps && Object.keys(variantProps).length > 0) {
      for (const child of componentSet.children) {
        if (child.type !== 'COMPONENT') continue;
        const variant = child as ComponentNode;
        const vProps = variant.variantProperties;
        if (!vProps) continue;

        const matches = Object.entries(variantProps).every(
          ([key, val]) => vProps[key] === val
        );
        if (matches) {
          targetComponent = variant;
          break;
        }
      }

      if (!targetComponent) {
        // List available variants for helpful error
        const available = componentSet.children
          .filter(c => c.type === 'COMPONENT')
          .map(c => {
            const vp = (c as ComponentNode).variantProperties;
            return vp ? JSON.stringify(vp) : c.name;
          });
        throw new Error(
          `No variant matches ${JSON.stringify(variantProps)}. Available variants: ${available.join(', ')}`
        );
      }
    } else {
      // Default: use first variant
      targetComponent = componentSet.children.find(c => c.type === 'COMPONENT') as ComponentNode | undefined ?? null;
      if (!targetComponent) throw new Error('Component set has no variants');
    }

    instance = targetComponent.createInstance();
  } else {
    throw new Error(`Node ${componentId} is type ${sceneNode.type} — expected COMPONENT or COMPONENT_SET`);
  }

  // Position
  if (params.x !== undefined) instance.x = params.x as number;
  if (params.y !== undefined) instance.y = params.y as number;

  // Parent — throws if parentId is invalid
  const instanceParent = resolveParent(params.parentId);
  if (instanceParent) instanceParent.appendChild(instance);

  return {
    nodeId: instance.id,
    name: instance.name,
    type: instance.type,
    mainComponentId: instance.mainComponent?.id ?? null,
  };
}

export async function handleDetachInstance(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found`);

  const sceneNode = node as SceneNode;
  if (sceneNode.type !== 'INSTANCE') {
    throw new Error(`Node ${nodeId} is type ${sceneNode.type} — expected INSTANCE`);
  }

  const detached = (sceneNode as InstanceNode).detachInstance();
  return {
    nodeId: detached.id,
    name: detached.name,
    type: detached.type,
  };
}

// ═══════════════════════════════════════════════════════════════
// IC-5: Set Reactions (Prototype Interactions)
// ═══════════════════════════════════════════════════════════════

/** Simplified reaction input from MCP */
interface SimplifiedReaction {
  trigger: string;       // ON_CLICK, ON_HOVER, ON_PRESS, ON_DRAG, MOUSE_ENTER, MOUSE_LEAVE, AFTER_TIMEOUT, MOUSE_UP, MOUSE_DOWN
  action: string;        // NODE, BACK, CLOSE, URL
  destination?: string;  // nodeId for NODE actions
  navigation?: string;   // NAVIGATE, SWAP, OVERLAY, SCROLL_TO, CHANGE_TO
  transition?: string;   // DISSOLVE, SMART_ANIMATE, MOVE_IN, MOVE_OUT, PUSH, SLIDE_IN, SLIDE_OUT, SCROLL_ANIMATE
  duration?: number;     // ms (default: 300)
  easing?: string;       // EASE_IN, EASE_OUT, EASE_IN_AND_OUT, LINEAR, GENTLE, QUICK, BOUNCY, SLOW
  delay?: number;        // ms for MOUSE_ENTER/LEAVE, MOUSE_UP/DOWN triggers (default: 0)
  timeout?: number;      // ms for AFTER_TIMEOUT trigger
  direction?: string;    // LEFT, RIGHT, TOP, BOTTOM for directional transitions
  url?: string;          // for URL actions
  openInNewTab?: boolean;
}

const SIMPLE_TRANSITIONS = new Set(['DISSOLVE', 'SMART_ANIMATE', 'SCROLL_ANIMATE']);
const DIRECTIONAL_TRANSITIONS = new Set(['MOVE_IN', 'MOVE_OUT', 'PUSH', 'SLIDE_IN', 'SLIDE_OUT']);

function buildEasing(easingType?: string): Easing {
  const type = (easingType || 'EASE_IN_AND_OUT') as Easing['type'];
  return { type } as Easing;
}

function buildTransition(simplified: SimplifiedReaction): Transition | null {
  if (!simplified.transition) return null;

  const transType = simplified.transition.toUpperCase();
  const duration = simplified.duration ?? 300;
  const easing = buildEasing(simplified.easing);

  if (SIMPLE_TRANSITIONS.has(transType)) {
    return {
      type: transType as SimpleTransition['type'],
      easing,
      duration,
    } as SimpleTransition;
  }

  if (DIRECTIONAL_TRANSITIONS.has(transType)) {
    return {
      type: transType as DirectionalTransition['type'],
      direction: (simplified.direction || 'LEFT') as DirectionalTransition['direction'],
      matchLayers: transType === 'SMART_ANIMATE',
      easing,
      duration,
    } as DirectionalTransition;
  }

  return null;
}

function buildTrigger(simplified: SimplifiedReaction): Trigger {
  const type = simplified.trigger.toUpperCase();

  switch (type) {
    case 'ON_CLICK':
    case 'ON_HOVER':
    case 'ON_PRESS':
    case 'ON_DRAG':
      return { type } as Trigger;

    case 'AFTER_TIMEOUT':
      return { type: 'AFTER_TIMEOUT', timeout: simplified.timeout ?? 1000 } as Trigger;

    case 'MOUSE_UP':
    case 'MOUSE_DOWN':
      return { type, delay: simplified.delay ?? 0 } as Trigger;

    case 'MOUSE_ENTER':
    case 'MOUSE_LEAVE':
      return { type, delay: simplified.delay ?? 0, deprecatedVersion: false } as Trigger;

    default:
      throw new Error(`Unknown trigger type: ${type}. Valid: ON_CLICK, ON_HOVER, ON_PRESS, ON_DRAG, AFTER_TIMEOUT, MOUSE_ENTER, MOUSE_LEAVE, MOUSE_UP, MOUSE_DOWN`);
  }
}

function buildAction(simplified: SimplifiedReaction): Action {
  const type = simplified.action.toUpperCase();

  switch (type) {
    case 'BACK':
    case 'CLOSE':
      return { type } as Action;

    case 'URL':
      if (!simplified.url) throw new Error('URL action requires "url" field');
      return { type: 'URL', url: simplified.url, openInNewTab: simplified.openInNewTab ?? true } as Action;

    case 'NODE':
      return {
        type: 'NODE',
        destinationId: simplified.destination || null,
        navigation: (simplified.navigation || 'NAVIGATE') as Navigation,
        transition: buildTransition(simplified),
        resetScrollPosition: false,
        resetInteractiveComponents: false,
      } as Action;

    default:
      throw new Error(`Unknown action type: ${type}. Valid: NODE, BACK, CLOSE, URL`);
  }
}

function buildReaction(simplified: SimplifiedReaction): Reaction {
  return {
    trigger: buildTrigger(simplified),
    actions: [buildAction(simplified)],
  };
}

export async function handleSetReactions(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found`);

  // Check if node supports reactions (has ReactionMixin)
  if (!('reactions' in node)) {
    throw new Error(`Node ${nodeId} (type ${(node as SceneNode).type}) does not support reactions`);
  }

  const reactionsInput = params.reactions as SimplifiedReaction[];
  if (!Array.isArray(reactionsInput)) {
    throw new Error('reactions must be an array');
  }

  // Empty array = clear all reactions
  if (reactionsInput.length === 0) {
    await (node as SceneNode & ReactionMixin).setReactionsAsync([]);
    return { nodeId, reactionsCount: 0 };
  }

  const reactions: Reaction[] = reactionsInput.map((r, i) => {
    try {
      return buildReaction(r);
    } catch (err) {
      throw new Error(`Reaction[${i}]: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  await (node as SceneNode & ReactionMixin).setReactionsAsync(reactions);
  return { nodeId, reactionsCount: reactions.length };
}

// ═══════════════════════════════════════════════════════════════
// IC-8: Get Reactions (Read current interactions)
// ═══════════════════════════════════════════════════════════════

function simplifyTrigger(trigger: Trigger | null): Record<string, unknown> | null {
  if (!trigger) return null;
  const result: Record<string, unknown> = { type: trigger.type };
  if ('delay' in trigger) result.delay = trigger.delay;
  if ('timeout' in trigger) result.timeout = trigger.timeout;
  return result;
}

function simplifyAction(action: Action): Record<string, unknown> {
  const result: Record<string, unknown> = { type: action.type };
  if (action.type === 'URL') {
    result.url = action.url;
  } else if (action.type === 'NODE') {
    result.destination = action.destinationId;
    result.navigation = action.navigation;
    if (action.transition) {
      result.transition = action.transition.type;
      result.duration = action.transition.duration;
      result.easing = action.transition.easing?.type;
      if ('direction' in action.transition) {
        result.direction = action.transition.direction;
      }
    }
  }
  return result;
}

export async function handleGetReactions(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found`);

  if (!('reactions' in node)) {
    return { nodeId, reactions: [] };
  }

  const reactions = (node as SceneNode & ReactionMixin).reactions;
  const simplified = reactions.map(r => ({
    trigger: simplifyTrigger(r.trigger),
    actions: (r.actions || (r.action ? [r.action] : [])).map(simplifyAction),
  }));

  return { nodeId, reactions: simplified };
}

// ═══════════════════════════════════════════════════════════════
// IC-10: Make Interactive — AI Element Detection + Auto-Wiring
// ═══════════════════════════════════════════════════════════════

/** Detect element type by heuristics: auto-layout + text + fill + corner radius = button, etc. */
type DetectedType = 'button' | 'card' | 'nav-link' | 'unknown';

interface DetectedElement {
  node: SceneNode;
  elementType: DetectedType;
}

function detectElementType(node: SceneNode): DetectedType {
  // Must be a frame-like node
  if (!('children' in node)) return 'unknown';
  const frame = node as FrameNode;

  const hasText = frame.children.some(c => c.type === 'TEXT');
  const hasFill = Array.isArray(frame.fills) && (frame.fills as ReadonlyArray<Paint>).length > 0 &&
    (frame.fills as ReadonlyArray<Paint>).some(f => f.type === 'SOLID' && f.visible !== false);
  const hasCornerRadius = typeof frame.cornerRadius === 'number' && frame.cornerRadius > 0;
  const hasAutoLayout = frame.layoutMode === 'HORIZONTAL' || frame.layoutMode === 'VERTICAL';
  const childCount = frame.children.length;

  // Button detection: auto-layout + text + fill + corner radius, small child count
  if (hasAutoLayout && hasText && hasFill && hasCornerRadius && childCount <= 3) {
    return 'button';
  }

  // Card detection: vertical layout, multiple children, has fill or elevation
  const hasEffects = 'effects' in frame && Array.isArray(frame.effects) && frame.effects.length > 0;
  if (frame.layoutMode === 'VERTICAL' && childCount >= 2 && (hasFill || hasEffects)) {
    // Rough size check: cards tend to be larger
    if (frame.width >= 150 && frame.height >= 100) {
      return 'card';
    }
  }

  // Nav-link detection: text node with link-like name
  if (node.type === 'TEXT') {
    const name = node.name.toLowerCase();
    const linkPatterns = ['nav', 'link', 'menu', 'home', 'about', 'contact', 'pricing', 'sign', 'log'];
    if (linkPatterns.some(p => name.includes(p))) {
      return 'nav-link';
    }
  }

  return 'unknown';
}

function scanForInteractiveElements(node: SceneNode, results: DetectedElement[]): void {
  const detected = detectElementType(node);
  if (detected !== 'unknown') {
    results.push({ node, elementType: detected });
    // Don't recurse into detected elements (they're already identified)
    return;
  }

  // Recurse into children
  if ('children' in node) {
    for (const child of (node as FrameNode).children) {
      scanForInteractiveElements(child, results);
    }
  }
}

/** Adjust a Figma 0-1 RGB color by a factor. Positive = lighten, negative = darken. */
function adjustColor(rgb: { r: number; g: number; b: number }, factor: number): { r: number; g: number; b: number } {
  if (factor > 0) {
    return { r: rgb.r + (1 - rgb.r) * factor, g: rgb.g + (1 - rgb.g) * factor, b: rgb.b + (1 - rgb.b) * factor };
  }
  return { r: Math.max(0, rgb.r * (1 + factor)), g: Math.max(0, rgb.g * (1 + factor)), b: Math.max(0, rgb.b * (1 + factor)) };
}

export async function handleMakeInteractive(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const rootNode = figma.getNodeById(nodeId);
  if (!rootNode) throw new Error(`Node ${nodeId} not found`);

  const sceneNode = rootNode as SceneNode;
  const detected: DetectedElement[] = [];
  scanForInteractiveElements(sceneNode, detected);

  if (detected.length === 0) {
    return { processed: 0, interactions: [], message: 'No interactive elements detected' };
  }

  const results: Array<{ nodeId: string; name: string; elementType: string; presetApplied: string; skipped?: boolean }> = [];

  for (const { node, elementType } of detected) {
    // Idempotency check: skip if already has reactions
    if ('reactions' in node) {
      const existing = (node as SceneNode & ReactionMixin).reactions;
      if (existing && existing.length > 0) {
        results.push({ nodeId: node.id, name: node.name, elementType, presetApplied: 'none', skipped: true });
        continue;
      }
    }

    if (elementType === 'button') {
      // Create hover + pressed variants, combine, wire
      const frame = node as FrameNode;
      const fills = frame.fills as ReadonlyArray<Paint>;
      const solidFill = fills.find(f => f.type === 'SOLID' && f.visible !== false) as SolidPaint | undefined;
      if (!solidFill) {
        results.push({ nodeId: node.id, name: node.name, elementType, presetApplied: 'none' });
        continue;
      }

      const baseRgb = solidFill.color;

      // Convert to component if not already
      let comp: ComponentNode;
      if (frame.type === 'COMPONENT') {
        comp = frame;
      } else {
        comp = figma.createComponentFromNode(frame);
      }
      comp.name = 'state=default';

      // Load fonts for cloning text
      for (const child of comp.children) {
        if (child.type === 'TEXT') {
          const fontName = (child as TextNode).fontName as FontName;
          try { await figma.loadFontAsync(fontName); } catch { /* skip */ }
        }
      }

      // Create hover variant
      const hoverComp = figma.createComponent();
      hoverComp.name = 'state=hover';
      hoverComp.resize(comp.width, comp.height);
      hoverComp.layoutMode = comp.layoutMode;
      hoverComp.primaryAxisAlignItems = comp.primaryAxisAlignItems;
      hoverComp.counterAxisAlignItems = comp.counterAxisAlignItems;
      hoverComp.paddingTop = comp.paddingTop;
      hoverComp.paddingRight = comp.paddingRight;
      hoverComp.paddingBottom = comp.paddingBottom;
      hoverComp.paddingLeft = comp.paddingLeft;
      hoverComp.itemSpacing = comp.itemSpacing;
      hoverComp.cornerRadius = comp.cornerRadius as number;
      hoverComp.layoutSizingVertical = comp.layoutSizingVertical;
      hoverComp.layoutSizingHorizontal = comp.layoutSizingHorizontal;
      const hoverRgb = adjustColor(baseRgb, 0.15);
      hoverComp.fills = [{ type: 'SOLID', color: hoverRgb }];

      // Create pressed variant
      const pressedComp = figma.createComponent();
      pressedComp.name = 'state=pressed';
      pressedComp.resize(comp.width, comp.height);
      pressedComp.layoutMode = comp.layoutMode;
      pressedComp.primaryAxisAlignItems = comp.primaryAxisAlignItems;
      pressedComp.counterAxisAlignItems = comp.counterAxisAlignItems;
      pressedComp.paddingTop = comp.paddingTop;
      pressedComp.paddingRight = comp.paddingRight;
      pressedComp.paddingBottom = comp.paddingBottom;
      pressedComp.paddingLeft = comp.paddingLeft;
      pressedComp.itemSpacing = comp.itemSpacing;
      pressedComp.cornerRadius = comp.cornerRadius as number;
      pressedComp.layoutSizingVertical = comp.layoutSizingVertical;
      pressedComp.layoutSizingHorizontal = comp.layoutSizingHorizontal;
      const pressedRgb = adjustColor(baseRgb, -0.15);
      pressedComp.fills = [{ type: 'SOLID', color: pressedRgb }];

      // Clone text into variants
      for (const child of comp.children) {
        if (child.type === 'TEXT') {
          const srcText = child as TextNode;
          for (const target of [hoverComp, pressedComp]) {
            const tn = figma.createText();
            const fontName = srcText.fontName as FontName;
            try { await figma.loadFontAsync(fontName); } catch { await figma.loadFontAsync({ family: 'Inter', style: 'Regular' }); }
            tn.fontName = fontName;
            tn.characters = srcText.characters;
            tn.fontSize = srcText.fontSize as number;
            if (srcText.lineHeight && typeof (srcText.lineHeight as LineHeight).value === 'number') {
              tn.lineHeight = srcText.lineHeight as LineHeight;
            }
            tn.fills = JSON.parse(JSON.stringify(srcText.fills));
            tn.layoutSizingHorizontal = srcText.layoutSizingHorizontal;
            target.appendChild(tn);
          }
        }
      }

      // Place variants next to original
      const parent = comp.parent as BaseNode & ChildrenMixin;
      parent.appendChild(hoverComp);
      parent.appendChild(pressedComp);
      hoverComp.x = comp.x;
      hoverComp.y = comp.y + comp.height + 16;
      pressedComp.x = comp.x;
      pressedComp.y = hoverComp.y + hoverComp.height + 16;

      // Combine
      const componentSet = figma.combineAsVariants([comp, hoverComp, pressedComp], parent);
      componentSet.name = node.name || 'Button';
      componentSet.layoutMode = 'VERTICAL';
      componentSet.paddingTop = 32;
      componentSet.paddingRight = 32;
      componentSet.paddingBottom = 32;
      componentSet.paddingLeft = 32;
      componentSet.itemSpacing = 16;
      componentSet.primaryAxisSizingMode = 'AUTO';
      componentSet.counterAxisSizingMode = 'AUTO';

      // Find variants
      const defV = componentSet.children.find(c => c.type === 'COMPONENT' && (c as ComponentNode).variantProperties?.state === 'default') as ComponentNode | undefined;
      const hovV = componentSet.children.find(c => c.type === 'COMPONENT' && (c as ComponentNode).variantProperties?.state === 'hover') as ComponentNode | undefined;
      const preV = componentSet.children.find(c => c.type === 'COMPONENT' && (c as ComponentNode).variantProperties?.state === 'pressed') as ComponentNode | undefined;

      if (defV && hovV && preV) {
        await defV.setReactionsAsync([
          { trigger: { type: 'ON_HOVER' } as Trigger, actions: [{ type: 'NODE', destinationId: hovV.id, navigation: 'CHANGE_TO' as Navigation, transition: { type: 'SMART_ANIMATE', easing: { type: 'EASE_OUT' }, duration: 300 } as SimpleTransition, resetScrollPosition: false, resetInteractiveComponents: false } as Action] },
          { trigger: { type: 'MOUSE_DOWN', delay: 0 } as Trigger, actions: [{ type: 'NODE', destinationId: preV.id, navigation: 'CHANGE_TO' as Navigation, transition: { type: 'SMART_ANIMATE', easing: { type: 'EASE_IN' }, duration: 80 } as SimpleTransition, resetScrollPosition: false, resetInteractiveComponents: false } as Action] },
          { trigger: { type: 'MOUSE_UP', delay: 0 } as Trigger, actions: [{ type: 'NODE', destinationId: defV.id, navigation: 'CHANGE_TO' as Navigation, transition: { type: 'SMART_ANIMATE', easing: { type: 'EASE_OUT' }, duration: 120 } as SimpleTransition, resetScrollPosition: false, resetInteractiveComponents: false } as Action] },
        ]);
      }

      results.push({ nodeId: componentSet.id, name: componentSet.name, elementType, presetApplied: 'button-full' });

    } else if (elementType === 'card') {
      // Card: hover variant only (shadow/lift via smart animate)
      const frame = node as FrameNode;
      const fills = frame.fills as ReadonlyArray<Paint>;
      const solidFill = fills.find(f => f.type === 'SOLID' && f.visible !== false) as SolidPaint | undefined;

      let comp: ComponentNode;
      if (frame.type === 'COMPONENT') {
        comp = frame;
      } else {
        comp = figma.createComponentFromNode(frame);
      }
      comp.name = 'state=default';

      // Load fonts
      for (const child of comp.children) {
        if (child.type === 'TEXT') {
          try { await figma.loadFontAsync((child as TextNode).fontName as FontName); } catch { /* skip */ }
        }
      }

      // Create hover variant with subtle shadow
      const hoverComp = figma.createComponent();
      hoverComp.name = 'state=hover';
      hoverComp.resize(comp.width, comp.height);
      hoverComp.layoutMode = comp.layoutMode;
      hoverComp.primaryAxisAlignItems = comp.primaryAxisAlignItems;
      hoverComp.counterAxisAlignItems = comp.counterAxisAlignItems;
      hoverComp.paddingTop = comp.paddingTop;
      hoverComp.paddingRight = comp.paddingRight;
      hoverComp.paddingBottom = comp.paddingBottom;
      hoverComp.paddingLeft = comp.paddingLeft;
      hoverComp.itemSpacing = comp.itemSpacing;
      hoverComp.cornerRadius = comp.cornerRadius as number;
      hoverComp.layoutSizingVertical = comp.layoutSizingVertical;
      hoverComp.layoutSizingHorizontal = comp.layoutSizingHorizontal;

      if (solidFill) {
        const hoverRgb = adjustColor(solidFill.color, 0.08);
        hoverComp.fills = [{ type: 'SOLID', color: hoverRgb }];
      } else {
        hoverComp.fills = JSON.parse(JSON.stringify(comp.fills));
      }

      // Add elevation shadow to hover state
      hoverComp.effects = [
        { type: 'DROP_SHADOW', visible: true, blendMode: 'NORMAL', color: { r: 0, g: 0, b: 0, a: 0.12 }, offset: { x: 0, y: 4 }, radius: 12, spread: 0 } as DropShadowEffect,
      ];

      // Clone text children
      for (const child of comp.children) {
        if (child.type === 'TEXT') {
          const srcText = child as TextNode;
          const tn = figma.createText();
          const fontName = srcText.fontName as FontName;
          try { await figma.loadFontAsync(fontName); } catch { await figma.loadFontAsync({ family: 'Inter', style: 'Regular' }); }
          tn.fontName = fontName;
          tn.characters = srcText.characters;
          tn.fontSize = srcText.fontSize as number;
          if (srcText.lineHeight && typeof (srcText.lineHeight as LineHeight).value === 'number') {
            tn.lineHeight = srcText.lineHeight as LineHeight;
          }
          tn.fills = JSON.parse(JSON.stringify(srcText.fills));
          tn.layoutSizingHorizontal = srcText.layoutSizingHorizontal;
          hoverComp.appendChild(tn);
        }
      }

      const parent = comp.parent as BaseNode & ChildrenMixin;
      parent.appendChild(hoverComp);
      hoverComp.x = comp.x;
      hoverComp.y = comp.y + comp.height + 16;

      const componentSet = figma.combineAsVariants([comp, hoverComp], parent);
      componentSet.name = node.name || 'Card';
      componentSet.layoutMode = 'VERTICAL';
      componentSet.paddingTop = 32;
      componentSet.paddingRight = 32;
      componentSet.paddingBottom = 32;
      componentSet.paddingLeft = 32;
      componentSet.itemSpacing = 16;
      componentSet.primaryAxisSizingMode = 'AUTO';
      componentSet.counterAxisSizingMode = 'AUTO';

      const defV = componentSet.children.find(c => c.type === 'COMPONENT' && (c as ComponentNode).variantProperties?.state === 'default') as ComponentNode | undefined;
      const hovV = componentSet.children.find(c => c.type === 'COMPONENT' && (c as ComponentNode).variantProperties?.state === 'hover') as ComponentNode | undefined;

      if (defV && hovV) {
        await defV.setReactionsAsync([
          { trigger: { type: 'ON_HOVER' } as Trigger, actions: [{ type: 'NODE', destinationId: hovV.id, navigation: 'CHANGE_TO' as Navigation, transition: { type: 'SMART_ANIMATE', easing: { type: 'GENTLE' as Easing['type'] }, duration: 300 } as SimpleTransition, resetScrollPosition: false, resetInteractiveComponents: false } as Action] },
        ]);
      }

      results.push({ nodeId: componentSet.id, name: componentSet.name, elementType, presetApplied: 'card-hover' });

    } else if (elementType === 'nav-link') {
      // Nav links: just mark them — prototype flow generator (IC-12) wires actual navigation
      results.push({ nodeId: node.id, name: node.name, elementType, presetApplied: 'none (wired by create_prototype_flow)' });
    }
  }

  return {
    processed: results.filter(r => !r.skipped).length,
    skipped: results.filter(r => r.skipped).length,
    interactions: results,
  };
}

// ═══════════════════════════════════════════════════════════════
// IC-12: Prototype Flow Generator
// ═══════════════════════════════════════════════════════════════

/** Find clickable elements (buttons, text links, CTAs) inside a frame. */
function findClickableElements(frame: SceneNode): SceneNode[] {
  const clickables: SceneNode[] = [];

  function scan(node: SceneNode): void {
    // Buttons: auto-layout frame with text + fill + corner radius
    if ('children' in node) {
      const f = node as FrameNode;
      const hasText = f.children.some(c => c.type === 'TEXT');
      const hasFill = Array.isArray(f.fills) && (f.fills as ReadonlyArray<Paint>).some(p => p.type === 'SOLID' && p.visible !== false);
      const hasRadius = typeof f.cornerRadius === 'number' && f.cornerRadius > 0;
      const isAutoLayout = f.layoutMode === 'HORIZONTAL' || f.layoutMode === 'VERTICAL';

      if (isAutoLayout && hasText && hasFill && hasRadius && f.children.length <= 3) {
        clickables.push(node);
        return; // Don't recurse into buttons
      }
    }

    // CTA text: text nodes with action-like names
    if (node.type === 'TEXT') {
      const name = node.name.toLowerCase();
      const text = (node as TextNode).characters.toLowerCase();
      const ctaPatterns = ['cta', 'button', 'get started', 'sign up', 'learn more', 'buy', 'shop', 'next', 'continue', 'submit', 'back', 'previous', 'return', 'arrow'];
      if (ctaPatterns.some(p => name.includes(p) || text.includes(p))) {
        clickables.push(node);
        return;
      }
    }

    // Recurse
    if ('children' in node) {
      for (const child of (node as FrameNode).children) {
        scan(child);
      }
    }
  }

  scan(frame);
  return clickables;
}

/** Determine if a clickable element suggests backward navigation. */
function isBackElement(node: SceneNode): boolean {
  const name = (node.name || '').toLowerCase();
  let text = '';
  if (node.type === 'TEXT') {
    text = (node as TextNode).characters.toLowerCase();
  } else if ('children' in node) {
    const firstText = (node as FrameNode).children.find(c => c.type === 'TEXT');
    if (firstText) text = (firstText as TextNode).characters.toLowerCase();
  }
  const backPatterns = ['back', 'previous', 'return', 'arrow-left', 'chevron-left', '←'];
  return backPatterns.some(p => name.includes(p) || text.includes(p));
}

export async function handleCreatePrototypeFlow(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const frameIds = params.frameIds as string[];
  const flowName = (params.flowName as string) || 'Flow 1';

  if (!frameIds || !Array.isArray(frameIds) || frameIds.length < 2) {
    throw new Error('frameIds requires an ordered array with at least 2 frame IDs');
  }

  // Resolve frames
  const frames: (FrameNode | ComponentNode)[] = [];
  for (const id of frameIds) {
    const node = figma.getNodeById(id);
    if (!node) throw new Error(`Frame ${id} not found`);
    const scene = node as SceneNode;
    if (scene.type !== 'FRAME' && scene.type !== 'COMPONENT') {
      throw new Error(`Node ${id} is type ${scene.type} — expected FRAME or COMPONENT`);
    }
    frames.push(scene as FrameNode | ComponentNode);
  }

  // Set first frame as flow starting point
  const firstFrame = frames[0] as FrameNode;
  if ('flowStartingPoints' in firstFrame || firstFrame.type === 'FRAME') {
    // Use reactions on first frame to mark it as a starting point
    // Figma's flowStartingPoints is set at the page level, not on the frame
    // We'll set it via the page if possible
    const page = findPageForNode(firstFrame);
    if (page) {
      const existingFlows = page.flowStartingPoints || [];
      const alreadyExists = existingFlows.some(f => f.nodeId === firstFrame.id);
      if (!alreadyExists) {
        page.flowStartingPoints = [...existingFlows, { nodeId: firstFrame.id, name: flowName }];
      }
    }
  }

  const connections: Array<{ from: string; fromName: string; to: string; toName: string; trigger: string; transition: string }> = [];

  // Wire connections between consecutive frames
  for (let i = 0; i < frames.length; i++) {
    const currentFrame = frames[i];
    const nextFrame = i < frames.length - 1 ? frames[i + 1] : null;
    const prevFrame = i > 0 ? frames[i - 1] : null;

    const clickables = findClickableElements(currentFrame);

    for (const clickable of clickables) {
      // Check if already has reactions — preserve existing, non-destructive
      if ('reactions' in clickable) {
        const existing = (clickable as SceneNode & ReactionMixin).reactions;
        if (existing && existing.length > 0) continue;
      }

      if (isBackElement(clickable) && prevFrame) {
        // Wire back navigation
        await (clickable as SceneNode & ReactionMixin).setReactionsAsync([{
          trigger: { type: 'ON_CLICK' } as Trigger,
          actions: [{ type: 'BACK' } as Action],
        }]);
        connections.push({
          from: clickable.id,
          fromName: clickable.name,
          to: prevFrame.id,
          toName: prevFrame.name,
          trigger: 'ON_CLICK',
          transition: 'BACK',
        });
      } else if (nextFrame) {
        // Wire forward navigation with PUSH transition
        await (clickable as SceneNode & ReactionMixin).setReactionsAsync([{
          trigger: { type: 'ON_CLICK' } as Trigger,
          actions: [{
            type: 'NODE',
            destinationId: nextFrame.id,
            navigation: 'NAVIGATE' as Navigation,
            transition: { type: 'PUSH', direction: 'LEFT', matchLayers: false, easing: { type: 'EASE_IN_AND_OUT' }, duration: 300 } as DirectionalTransition,
            resetScrollPosition: false,
            resetInteractiveComponents: false,
          } as Action],
        }]);
        connections.push({
          from: clickable.id,
          fromName: clickable.name,
          to: nextFrame.id,
          toName: nextFrame.name,
          trigger: 'ON_CLICK',
          transition: 'PUSH',
        });
      }
    }
  }

  return {
    flowName,
    frameCount: frames.length,
    connections,
    startingPoint: { nodeId: frames[0].id, name: frames[0].name },
  };
}

/** Walk up the node tree to find the containing PageNode. */
function findPageForNode(node: BaseNode): PageNode | null {
  let current: BaseNode | null = node;
  while (current) {
    if (current.type === 'PAGE') return current as PageNode;
    current = current.parent;
  }
  return null;
}
