// ═══════════════════════════════════════════════════════════
// Token Resolution & Object Utilities
// ═══════════════════════════════════════════════════════════

// DS-04 helper: dot-path get/set on nested objects

export function getByDotPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const key of parts) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function setByDotPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

// DS-05: Token Resolution Engine

export function resolveTokens(
  recipe: Record<string, unknown>,
  tokens: Record<string, unknown>,
  props: Record<string, unknown>,
  componentName?: string,
): Record<string, unknown> {
  function resolveValue(value: unknown, key?: string): unknown {
    if (typeof value === 'string') {
      // $tokens.* reference
      if (value.startsWith('$tokens.')) {
        const tokenPath = value.slice('$tokens.'.length);
        const resolved = getByDotPath(tokens, tokenPath);
        if (resolved === undefined) {
          console.warn(`[design-system] Unknown token path: ${value}`);
          return value;
        }
        return resolved;
      }
      // {{propName}} substitution
      if (value.includes('{{') && value.includes('}}')) {
        return value.replace(/\{\{(\w+)\}\}/g, (_match, propName: string) => {
          if (props[propName] === undefined) {
            throw new Error(
              `Component '${componentName || 'unknown'}' requires prop '${propName}'`
            );
          }
          return String(props[propName]);
        });
      }
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item, i) => resolveValue(item, `${key || ''}[${i}]`));
    }
    if (typeof value === 'object' && value !== null) {
      return resolveObject(value as Record<string, unknown>);
    }
    return value;
  }

  function resolveObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = resolveValue(v, k);
    }
    return result;
  }

  return resolveObject(recipe);
}

// Deep merge: target values are overwritten by source values.
// Special handling for 'children' arrays: merge by index position.
export function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const [key, srcVal] of Object.entries(source)) {
    const tgtVal = result[key];
    if (key === 'children' && Array.isArray(tgtVal) && Array.isArray(srcVal)) {
      // Merge children by index: source overrides into corresponding target child
      result[key] = tgtVal.map((child, i) => {
        if (i < srcVal.length && typeof srcVal[i] === 'object' && srcVal[i] !== null) {
          if (typeof child === 'object' && child !== null) {
            return deepMerge(child as Record<string, unknown>, srcVal[i] as Record<string, unknown>);
          }
          return srcVal[i];
        }
        return child;
      });
    } else if (
      typeof srcVal === 'object' && srcVal !== null && !Array.isArray(srcVal) &&
      typeof tgtVal === 'object' && tgtVal !== null && !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(tgtVal as Record<string, unknown>, srcVal as Record<string, unknown>);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}
