/// <reference types="@figma/plugin-typings" />

import { hexToRgb } from '../color-utils';

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

  // Parent
  if (params.parentId) {
    const parent = figma.getNodeById(params.parentId as string);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(comp);
    }
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

  // Parent
  if (params.parentId) {
    const parent = figma.getNodeById(params.parentId as string);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(instance);
    }
  }

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
