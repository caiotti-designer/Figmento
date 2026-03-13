# Story LC-10: get_learned_preferences MCP Tool

**Status:** Ready for Review
**Priority:** Medium
**Complexity:** S (Small) — One new MCP tool in figmento-mcp-server. Sends existing `get-preferences` WS command to plugin, returns formatted result. Pattern identical to how `read_figma_context` works.
**Epic:** LC — Learning & Corrections (Phase 4c)
**PRD:** PRD-004 (Learn from User Corrections) §5 US-6
**Depends on:** LC-7 (get-preferences sandbox handler), LC-6 (LearnedPreference type)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean (figmento-mcp-server) + manual smoke test via MCP inspector
```

---

## Story

**As a** Claude Code user working through the MCP path,
**I want** an MCP tool to query the user's learned preferences,
**so that** the AI can incorporate them when generating designs via MCP tools.

---

## Description

The MCP server (`figmento-mcp-server`) exposes tools to Claude Code that route through the WS relay to the Figma plugin sandbox. This story adds `get_learned_preferences` following the same pattern used by `get_node_info`, `get_selection`, etc.

### How it works

1. Claude Code calls `get_learned_preferences({ category?: string })`
2. MCP tool sends `get_preferences` WS command to plugin sandbox
3. Plugin responds with `{ preferences: LearnedPreference[] }`
4. MCP tool filters by `category` if provided, formats and returns the result

### Tool location

New file: `figmento-mcp-server/src/tools/learning.ts`

Register in `figmento-mcp-server/src/index.ts` alongside other tool modules.

### Tool schema

```typescript
export const getLearnedPreferencesSchema = {
  category: z.string().optional().describe(
    'Optional filter: "typography", "color", "spacing", or "shape". Omit to return all preferences.'
  ),
};
```

**Note:** Use `z.string().optional()` not `z.enum()` — see project memory (MCP SDK + Zod Type Compatibility TS2589 gotcha).

### WS command

The tool sends action `get_preferences` (no params needed). The sandbox handler from LC-7 responds with `{ preferences: LearnedPreference[] }`.

### Response format

Return a structured text result:

```
3 learned preferences (all categories):

[HIGH] h1 fontSize — Prefers h1 font size ≥96px
  Direction: increase | Corrections: 9 | Last seen: 2026-03-10

[MEDIUM] card cornerRadius — Tends toward larger card corner radius
  Direction: increase | Corrections: 5 | Last seen: 2026-03-12

[LOW] root-frame fills — Prefers dark background (#0A0A0F range)
  Direction: change | Corrections: 3 | Last seen: 2026-03-13
```

If `category` is provided:

```
2 learned preferences (typography):

[HIGH] h1 fontSize — Prefers h1 font size ≥96px
  ...
```

If no preferences match:

```
No learned preferences found${category ? ` for category "${category}"` : ''}.
```

Only `enabled: true` preferences are returned. Sort: high → medium → low, then correctionCount desc.

### Error handling

- If the plugin sandbox is not connected or times out: return `{ content: [{ type: 'text', text: 'No plugin connected or timed out. Ensure Figma plugin is open.' }], isError: true }`
- If `category` is provided but not one of the four valid values: return a helpful error listing the valid options

---

## Acceptance Criteria

- [ ] **AC1:** `get_learned_preferences` tool is registered in the MCP server and appears in tool listings
- [ ] **AC2:** Tool accepts optional `category` parameter (string). Valid values: `typography`, `color`, `spacing`, `shape`
- [ ] **AC3:** Without `category`, returns all `enabled: true` preferences sorted high→medium→low
- [ ] **AC4:** With `category: "typography"`, returns only preferences where `preference.category === "typography"`
- [ ] **AC5:** Invalid `category` value returns a clear error message listing valid options (does not crash)
- [ ] **AC6:** Returns human-readable text result including confidence level, description, direction, correctionCount, lastSeenAt
- [ ] **AC7:** `enabled: false` preferences are excluded from the result
- [ ] **AC8:** Returns friendly "no preferences found" message when result is empty
- [ ] **AC9:** Plugin not connected → returns `isError: true` with a helpful message (does not throw)
- [ ] **AC10:** `cd figmento-mcp-server && npm run build` passes clean
- [ ] **AC11:** The WS action name used in `wsClient.sendCommand(...)` matches the exact message type key in `code.ts` switch statement for the `get-preferences` handler. Dev must cross-check before marking complete (verify whether it is `'get_preferences'` or `'get-preferences'` by inspecting the relay's WS routing layer).

---

## Tasks

### Phase 1 — Tool File

- [x] **Task 1:** Create `figmento-mcp-server/src/tools/learning.ts`:

  ```typescript
  import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
  import { z } from 'zod';
  import { FigmentoWSClient } from '../ws-client';

  interface LearnedPreference {
    id: string;
    property: string;
    category: string;
    context: string;
    direction: string;
    learnedValue?: unknown;
    learnedRange?: { min: unknown; max: unknown };
    description: string;
    confidence: 'low' | 'medium' | 'high';
    correctionCount: number;
    correctionIds: string[];
    enabled: boolean;
    createdAt: number;
    lastSeenAt: number;
  }

  const VALID_CATEGORIES = ['typography', 'color', 'spacing', 'shape'] as const;
  const CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 };

  export const getLearnedPreferencesSchema = {
    category: z.string().optional().describe(
      'Filter by category: "typography", "color", "spacing", or "shape". Omit to return all.'
    ),
  };

  export function registerLearningTools(server: McpServer, wsClient: FigmentoWSClient): void {
    server.tool(
      'get_learned_preferences',
      'Get learned design preferences from the user\'s correction history. Returns preferences the user has established through repeated manual edits to AI-generated designs.',
      getLearnedPreferencesSchema,
      async ({ category }) => {
        // Validate category if provided
        if (category && !VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) {
          return {
            content: [{
              type: 'text' as const,
              text: `Invalid category "${category}". Valid values: ${VALID_CATEGORIES.join(', ')}`,
            }],
            isError: true,
          };
        }

        let data: Record<string, unknown>;
        try {
          data = await wsClient.sendCommand('get_preferences', {});
        } catch (err) {
          return {
            content: [{
              type: 'text' as const,
              text: `No plugin connected or timed out. Ensure the Figmento plugin is open in Figma and connected to the relay.`,
            }],
            isError: true,
          };
        }

        let preferences = (data.preferences as LearnedPreference[]) || [];

        // Filter by category
        if (category) {
          preferences = preferences.filter(p => p.category === category);
        }

        // Only enabled preferences
        preferences = preferences.filter(p => p.enabled !== false);

        // Sort: high → medium → low, then correctionCount desc
        preferences.sort((a, b) => {
          const confDiff = CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence];
          if (confDiff !== 0) return confDiff;
          return b.correctionCount - a.correctionCount;
        });

        if (preferences.length === 0) {
          const scope = category ? ` for category "${category}"` : '';
          return {
            content: [{
              type: 'text' as const,
              text: `No learned preferences found${scope}.`,
            }],
          };
        }

        const scope = category ? ` (${category})` : ' (all categories)';
        const lines: string[] = [
          `${preferences.length} learned preference${preferences.length === 1 ? '' : 's'}${scope}:`,
          '',
        ];

        for (const pref of preferences) {
          const lastSeen = new Date(pref.lastSeenAt).toISOString().split('T')[0];
          lines.push(`[${pref.confidence.toUpperCase()}] ${pref.context} ${pref.property} — ${pref.description}`);
          lines.push(`  Direction: ${pref.direction} | Corrections: ${pref.correctionCount} | Last seen: ${lastSeen}`);
          lines.push('');
        }

        return {
          content: [{ type: 'text' as const, text: lines.join('\n').trimEnd() }],
        };
      }
    );
  }
  ```

### Phase 2 — Registration

- [x] **Task 2:** In `figmento-mcp-server/src/index.ts`:
  - Add `import { registerLearningTools } from './tools/learning';`
  - Call `registerLearningTools(server, wsClient);` alongside the other tool registrations

### Phase 3 — Build Verification

- [x] **Task 3:** `cd figmento-mcp-server && npm run build` — verify clean build, no TypeScript errors.

---

## Dev Notes

- **`wsClient.sendCommand('get_preferences', {})`** — the sandbox `get-preferences` handler (LC-7) responds with `{ preferences: [...] }`. The WS command name uses underscores (plugin sandbox uses hyphens in `type` but `sendCommand` maps to action names). Verify the exact action name by checking how other tools call the sandbox (e.g., `wsClient.sendCommand('get_selection', {})` in `connection.ts`). If the sandbox handler key is `'get-preferences'` in the message switch, the WS action name sent must be `'get_preferences'` (the relay translates `action` → handler lookup using the key directly). **Cross-check**: look at how LC-7 registered the handler in `code.ts` and what WS action the relay uses for other plugin commands.

- **Timeout handling:** `wsClient.sendCommand()` already throws on timeout (default timeout from the WS client). Wrapping in try/catch is sufficient.

- **No shared types across packages.** The MCP server has its own `LearnedPreference` interface inline — do not import from `packages/figmento-core`. The relay already does the same.

- **`z.string().optional()` not `z.enum()`.** The Zod/MCP SDK compatibility issue (TS2589) means enum types in tool schemas cause deep type instantiation errors. Use plain `z.string().optional()` and validate the value at runtime as shown in Task 1.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento-mcp-server/src/tools/learning.ts` | CREATE | `registerLearningTools()` with `get_learned_preferences` tool |
| `figmento-mcp-server/src/index.ts` | MODIFY | Import and call `registerLearningTools(server, wsClient)` |

---

## Definition of Done

- [ ] `get_learned_preferences` tool registered and callable via MCP
- [ ] Optional `category` filter works correctly (and validates input)
- [ ] Only `enabled` preferences returned, sorted high→medium→low
- [ ] Clear text response with confidence, description, correctionCount, lastSeenAt
- [ ] Graceful error when plugin not connected
- [ ] `cd figmento-mcp-server && npm run build` passes clean

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-13 | @sm (River) | Story drafted from PRD-004 Phase 4c §5 US-6. New MCP tool file following connection.ts pattern. |
| 2026-03-13 | @po (Pax) | Validated 8/10. Added AC11 (WS action name cross-check). Status Draft → Ready. GO verdict. |
| 2026-03-13 | @dev (Dex) | Created learning.ts with registerLearningTools(). Registered in server.ts (not index.ts — server.ts is where all tools are registered). Added case 'get_preferences' to executeCommand in code.ts (AC11 fix — relay path uses underscore action names). All builds pass clean. Status → Ready for Review. |
