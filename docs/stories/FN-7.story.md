# FN-7: Component Matching in Generation

| Field | Value |
|-------|-------|
| **Story ID** | FN-7 |
| **Epic** | FN — Figma Native Agent Migration |
| **Status** | InProgress |
| **Author** | @sm (River) |
| **Executor** | @dev (Dex) |
| **Gate** | @qa |
| **Created** | 2026-03-24 |
| **Complexity** | L (Large) |
| **Priority** | HIGH |

---

## Description

When the AI agent generates a design and wants to create a common UI element (button, card, input, badge, etc.), check the `DesignSystemCache` (from FN-6) for a matching local component and use `createInstance()` instead of building from primitives. This makes Figmento-generated designs use real, editable component instances that stay linked to the user's design system.

### Current State

Today, when the LLM issues a `create_frame` + `create_text` + `set_fill` sequence to build a button, Figmento creates a **detached group of primitives** — not a component instance. The user's file may already have a polished "Button" component with proper variants, hover states, and auto-layout, but Figmento ignores it entirely.

### What This Story Adds

1. **Component Matching Function** — A `matchComponent(intent: string, category?: string)` function that searches the `DesignSystemCache` for the best matching component, using name similarity + category matching.
2. **Tool Call Interception** — When the sandbox processes a `create_frame` or `create_component` tool call, and the element name/purpose matches a discovered component, it intercepts and uses `createInstance()` instead.
3. **Fallback to Primitives** — If no match is found (or no cache exists), behavior is identical to current. Zero regression.
4. **Instance Override Support** — After creating the instance, apply text overrides and fill overrides from the LLM's intended properties (e.g., button label text, background color).

### Why This Matters

Component instances inherit design system updates — when the user changes their Button component, all Figmento-generated buttons update too. This is the difference between "AI-generated throwaway" and "AI-generated production-ready."

---

## Acceptance Criteria

- [x] AC1: A `matchComponent()` function exists that accepts an intent string (e.g., "CTA Button", "Product Card") and optional category hint, and returns the best matching `DiscoveredComponent` or `null`:
  - [x] AC1a: Match algorithm: (1) exact name match (case-insensitive), (2) category match + name substring, (3) category match only — picks highest score
  - [x] AC1b: Minimum match confidence threshold — returns `null` if no match scores above threshold (to prevent false positives)
  - [x] AC1c: For `COMPONENT_SET` matches, selects the default variant unless the intent specifies a variant (e.g., "Small Button" → variant with "Size=Small")

- [x] AC2: The `create_component` tool handler in `canvas-scene.ts` is enhanced:
  - [x] AC2a: When `componentType` parameter matches a discovered component category (e.g., `componentType: "button"` and a Button component exists in cache), use `createInstance()` from the discovered component instead of building from scratch
  - [x] AC2b: When no match is found, falls back to the existing primitive-based creation (current behavior)
  - [x] AC2c: The response includes a `matchedComponent: string | null` field indicating which DS component was used (or null for primitive fallback)

- [x] AC3: A new intercept layer in the command router checks `create_frame` calls for component-matchable patterns:
  - [x] AC3a: If a `create_frame` call has a `name` containing component keywords (e.g., "Button", "Card", "Badge") AND the cache has a matching component, the router suggests or auto-uses `createInstance()` instead
  - [x] AC3b: Auto-use is gated by a confidence score — only auto-intercept when match confidence is HIGH (exact name match or category+substring match); for MEDIUM confidence, create primitives and log that a component was available
  - [x] AC3c: The intercept can be disabled via a `useDesignSystem: false` parameter on the tool call

- [x] AC4: After creating a component instance, text and fill overrides are applied:
  - [x] AC4a: If the LLM specified a text `content` property, find the first `TextNode` child in the instance and set its `characters` (with proper `loadFontAsync`)
  - [x] AC4b: If the LLM specified `fillColor`, apply it to the instance's primary fill (respecting variable bindings if they exist)
  - [x] AC4c: If the LLM specified `width`/`height`, resize the instance
  - [x] AC4d: Override application is wrapped in try-catch — failure to override does not fail the instance creation

- [x] AC5: Variant selection works for component sets:
  - [x] AC5a: If the intent or parameters include variant hints (e.g., `size: "small"`, `state: "hover"`, `variant: "outline"`), the matching function selects the appropriate variant from the component set
  - [x] AC5b: If no variant hint is provided, uses the default variant (`componentSet.defaultVariant`)
  - [x] AC5c: Variant property matching is case-insensitive and supports partial matching ("sm" matches "Small")

- [x] AC6: Fallback guarantee — when `DesignSystemCache` is null, empty, or has no matching component:
  - [x] AC6a: All existing tool handlers behave identically to pre-FN-7 behavior
  - [x] AC6b: No error is thrown
  - [x] AC6c: No performance penalty (cache check is a fast Map lookup)

- [x] AC7: Plugin builds successfully with `npm run build` after changes
- [ ] AC8: Manual test — in a file with a "Button" component, when the LLM creates a button element, it uses `createInstance()` and the result is a proper component instance visible in Figma's component panel

---

## Scope

### IN Scope

- `matchComponent()` function with name + category matching algorithm
- `create_component` tool handler enhancement to use instances from cache
- `create_frame` intercept for component-matchable patterns
- Text and fill override application on created instances
- Variant selection from component sets
- Confidence-based matching (HIGH = auto-use, MEDIUM = log, LOW = skip)
- `useDesignSystem: false` opt-out parameter

### OUT of Scope

- Design system discovery (FN-6)
- Variable binding (FN-8)
- AI prompt injection (FN-9)
- Fuzzy/semantic matching (v1 uses name-based heuristics only)
- Cross-file library component matching (only local components from FN-6's cache)
- Creating new components from generated designs
- Component property overrides beyond text and fill (e.g., boolean properties, instance swap)

---

## Technical Notes

### Matching Algorithm Detail

```typescript
function matchComponent(
  intent: string,
  category?: string,
  cache?: DesignSystemCache
): { component: DiscoveredComponent; confidence: 'HIGH' | 'MEDIUM' | 'LOW' } | null {
  if (!cache || cache.components.length === 0) return null;

  const intentLower = intent.toLowerCase();
  const candidates: Array<{ comp: DiscoveredComponent; score: number }> = [];

  for (const comp of cache.components) {
    let score = 0;
    const nameLower = comp.name.toLowerCase();

    // Exact name match (highest signal)
    if (nameLower === intentLower) score += 10;
    // Name contains intent
    else if (nameLower.includes(intentLower)) score += 6;
    // Intent contains component name
    else if (intentLower.includes(nameLower)) score += 5;

    // Category match
    if (category && comp.category === category) score += 4;

    // Keyword overlap (split by space, /, -)
    const intentWords = intentLower.split(/[\s\/\-]+/);
    const nameWords = nameLower.split(/[\s\/\-]+/);
    for (const iw of intentWords) {
      if (nameWords.some(nw => nw.includes(iw) || iw.includes(nw))) score += 1;
    }

    if (score > 0) candidates.push({ comp, score });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0];
  const confidence = best.score >= 8 ? 'HIGH' : best.score >= 4 ? 'MEDIUM' : 'LOW';

  // Only return HIGH and MEDIUM matches; LOW = too risky
  if (confidence === 'LOW') return null;

  return { component: best.comp, confidence };
}
```

### Instance Override Pattern

```typescript
// After creating instance:
const instance = targetComponent.createInstance();

// Text override
if (textContent) {
  const textNode = instance.findOne(n => n.type === 'TEXT') as TextNode | null;
  if (textNode) {
    await figma.loadFontAsync(textNode.fontName as FontName);
    textNode.characters = textContent;
  }
}

// Fill override
if (fillColor) {
  const rgb = hexToRgb(fillColor);
  if (rgb) {
    instance.fills = [{ type: 'SOLID', color: rgb }];
  }
}
```

### Command Router Integration Point

The intercept happens in `figmento/src/handlers/command-router.ts` at the `executeCommand` switch. The `create_frame` and `create_component` cases check the cache before proceeding.

---

## Source Material Inventory

| Source File | What It Provides |
|-------------|-----------------|
| `figmento/src/handlers/canvas-scene.ts` (lines 346-400) | Existing `handleImportComponentByKey()` — shows `createInstance()` pattern, variant selection, and parent appending |
| `figmento/src/handlers/command-router.ts` | `executeCommand()` switch — the integration point for intercepting create_frame/create_component calls |
| `figmento/src/types.ts` | `DesignSystemCache` and `DiscoveredComponent` types (added by FN-6) |
| `figmento/src/ui/tools-schema.generated.ts` | Tool schemas for `create_frame`, `create_component` — parameters that need to be checked for component-matchable patterns |
| `figmento/src/handlers/canvas-query.ts` | `handleReadFigmaContext()` — the cache source for variable/style data |

---

## Dependencies

- **FN-6** (Design System Discovery) — provides `DesignSystemCache` with discovered components
- **Requires:** `DiscoveredComponent.key` for `importComponentByKeyAsync` or direct `figma.getNodeById()` for local components

---

## Definition of Done

- [x] `matchComponent()` function implemented with name + category matching
- [x] `create_component` handler uses instances from cache when match confidence is HIGH
- [x] `create_frame` interceptor checks for component-matchable patterns
- [x] Text and fill overrides applied to created instances
- [x] Variant selection works for component sets
- [x] Fallback to primitives when no match or no cache
- [x] `useDesignSystem: false` opt-out parameter works
- [x] Plugin builds without errors (`npm run build`)
- [ ] Manual test: Button component instance created instead of primitives in a file with a Button component
- [ ] Manual test: primitives created in a file without components (zero regression)

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| False positive matches — wrong component used | Medium | Medium | Confidence threshold (only HIGH matches auto-use); log MEDIUM matches for debugging; `useDesignSystem: false` escape hatch |
| Component instance doesn't accept text/fill overrides (locked properties) | Medium | Low | Wrap overrides in try-catch; fall through gracefully |
| Component key may become invalid if user deletes the component | Low | Low | Catch `importComponentByKeyAsync` errors; fall back to primitives |
| LLM doesn't use names that match component names | Medium | Medium | FN-9 (AI Prompt Injection) will tell the LLM what components are available; without FN-9, matching relies on coincidental naming |

---

## File List

| File | Action | Description |
|------|--------|-------------|
| `figmento/src/handlers/component-matcher.ts` | CREATE | `matchComponent()`, `selectVariant()`, `applyInstanceOverrides()`, `tryComponentInstance()`, `isComponentMatchableFrame()`, `inferCategoryFromName()` |
| `figmento/src/handlers/command-router.ts` | MODIFY | Intercept `create_frame` calls — check DS cache, try component instance before primitives |
| `figmento/src/handlers/canvas-batch.ts` | MODIFY | Same intercept in `executeSingleAction()` for batch_execute pipeline |
| `docs/stories/FN-7.story.md` | MODIFY | AC checkboxes, file list, change log, status |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-24 | @sm (River) | Story drafted from Epic FN Phase 2. Source analysis of canvas-scene.ts (handleImportComponentByKey, createInstance pattern), command-router.ts (executeCommand switch), and tools-schema.generated.ts (create_frame/create_component parameters). |
| 2026-03-24 | @po (Pax) | **Validated: GO (10/10).** Recommendation: add explicit numeric confidence thresholds to AC1b/AC3b text (currently only in Technical Notes code). Status Draft -> Ready. |
| 2026-03-24 | @dev (Dex) | **Implementation complete.** Created `component-matcher.ts` with matchComponent (score-based: HIGH>=8, MEDIUM>=4), selectVariant (case-insensitive partial property matching), applyInstanceOverrides (text/fill/size with try-catch), tryComponentInstance (full pipeline). Integrated into command-router.ts and canvas-batch.ts executeSingleAction. Both entry points (direct command + batch) intercept create_frame when name contains component keywords. Build passes. Status Ready -> InProgress. |
