export function resolveTempIds(params: Record<string, unknown>, tempIdMap: Map<string, string>): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.startsWith('$')) {
      const refId = value.substring(1);
      const actualId = tempIdMap.get(refId);
      if (actualId) {
        resolved[key] = actualId;
      } else {
        resolved[key] = value;
      }
    } else if (Array.isArray(value)) {
      resolved[key] = value.map(item => {
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          return resolveTempIds(item as Record<string, unknown>, tempIdMap);
        }
        if (typeof item === 'string' && item.startsWith('$')) {
          const refId = item.substring(1);
          return tempIdMap.get(refId) || item;
        }
        return item;
      });
    } else if (typeof value === 'object' && value !== null) {
      resolved[key] = resolveTempIds(value as Record<string, unknown>, tempIdMap);
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

export function isCreationAction(action: string): boolean {
  return action.startsWith('create_') || action === 'clone_node' || action === 'clone_with_overrides';
}
