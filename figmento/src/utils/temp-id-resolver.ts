/**
 * TempId resolution utility for batch_execute.
 *
 * The tempIdMap stores full result objects from each command.
 * - `$name`          → resolves to `result.nodeId` (backward compat)
 * - `$name.property` → resolves to `result[property]`
 *
 * Supports nested objects, arrays, and embedded references within strings
 * (e.g. "$card.width" as a standalone value, or mixed in expressions).
 */

export type TempIdMap = Map<string, Record<string, unknown>>;

/**
 * Resolve a single `$ref` or `$ref.prop` reference against the tempIdMap.
 * Returns the resolved value, or undefined if not found.
 */
function resolveRef(ref: string, tempIdMap: TempIdMap): unknown | undefined {
  // ref is the part after '$', e.g. "card" or "card.width"
  const dotIndex = ref.indexOf('.');
  if (dotIndex === -1) {
    // $name → resolve to nodeId for backward compat
    const entry = tempIdMap.get(ref);
    if (entry) return entry.nodeId;
    return undefined;
  }
  // $name.property
  const name = ref.substring(0, dotIndex);
  const property = ref.substring(dotIndex + 1);
  const entry = tempIdMap.get(name);
  if (entry && property in entry) return entry[property];
  return undefined;
}

export function resolveTempIds(params: Record<string, unknown>, tempIdMap: TempIdMap): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    resolved[key] = resolveValue(value, tempIdMap);
  }

  return resolved;
}

function resolveValue(value: unknown, tempIdMap: TempIdMap): unknown {
  if (typeof value === 'string') {
    return resolveStringValue(value, tempIdMap);
  }
  if (Array.isArray(value)) {
    return value.map(item => {
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        return resolveTempIds(item as Record<string, unknown>, tempIdMap);
      }
      if (typeof item === 'string') {
        return resolveStringValue(item, tempIdMap);
      }
      return item;
    });
  }
  if (typeof value === 'object' && value !== null) {
    return resolveTempIds(value as Record<string, unknown>, tempIdMap);
  }
  return value;
}

function resolveStringValue(value: string, tempIdMap: TempIdMap): unknown {
  // Exact match: entire string is a $ref (e.g. "$card" or "$card.width")
  if (value.startsWith('$')) {
    const refId = value.substring(1);
    const resolved = resolveRef(refId, tempIdMap);
    if (resolved !== undefined) return resolved;
  }
  return value;
}

export function isCreationAction(action: string): boolean {
  return action.startsWith('create_') || action === 'clone_node' || action === 'clone_with_overrides';
}
