# Story SU-2.3: Snapshot Test for Generated Tool Schemas

**Status:** Done (retroactive — @po audit 2026-04-14)
**Priority:** Medium
**Complexity:** S (Small — ~70 LOC new test file, no production code changes)
**Epic:** Schema Unification
**Depends on:** SU-2.2 (generated file must exist and prebuild must run)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm test (figmento) passing clean
```

---

## Story

**As a** developer shipping changes to the MCP server Zod schemas,
**I want** a snapshot test that catches unintentional regressions in the generated plugin tool schema,
**so that** any tool renamed, required field dropped, or property count change fails the test visibly rather than silently breaking chat-mode tool-use.

---

## Description

After SU-2.2, `figmento/src/ui/tools-schema.generated.ts` is auto-generated from the MCP server's Zod schemas. Without a test, a developer editing a Zod schema (e.g., accidentally making `width` optional in `createFrameSchema`) would not know the generated plugin schema changed until runtime breakage in Figma.

This story adds:

1. **A snapshot test** that captures `{ name, required, propCount }` for each tool in `FIGMENTO_TOOLS` — a lightweight structural fingerprint that catches renames, missing required fields, and property count regressions.

2. **Smoke tests** for `convertSchemaToGemini()` and `convertSchemaToOpenAI()` — verifying the conversion functions still produce valid output with generated schemas.

### What the snapshot captures

For each tool in `FIGMENTO_TOOLS`:
```typescript
{
  name: tool.name,
  required: (tool.input_schema.required as string[] | undefined)?.sort() ?? [],
  propCount: Object.keys((tool.input_schema.properties as object) ?? {}).length,
}
```

Example snapshot entry:
```json
{ "name": "create_frame", "required": ["height", "width"], "propCount": 14 }
{ "name": "set_fill", "required": ["nodeId"], "propCount": 3 }
{ "name": "batch_execute", "required": ["commands"], "propCount": 2 }
```

When a Zod schema changes (e.g., `create_frame` gains a new optional field), the snapshot diff clearly shows `propCount: 14 → 15` for `create_frame`, prompting the developer to consciously update the snapshot.

### Test file location

`figmento/src/ui/__tests__/tools-schema.test.ts`

(Create the `__tests__/` directory if it doesn't exist.)

### Finding the conversion functions

Before writing the test, search for `convertSchemaToGemini` and `convertSchemaToOpenAI` in `figmento/src/ui/`:
```bash
grep -r "convertSchemaToGemini\|convertSchemaToOpenAI" figmento/src/ui/
```

These functions convert a `ToolDefinition[]` to provider-specific formats (Gemini's `FunctionDeclaration[]` and OpenAI's `ChatCompletionTool[]`). If they don't exist by those exact names, search for the equivalent conversion logic and adjust test accordingly.

---

## What is NOT in scope

- No production code changes — test-only story
- No testing of tool handler behavior (that's Figma integration testing)
- No testing of the generator script itself (script correctness is covered by the prebuild + build gate in SU-2.2)
- No snapshot of full schema content (that would make snapshots too brittle) — only structural fingerprint (`name`, `required`, `propCount`)

---

## Acceptance Criteria

- [ ] **AC1:** `figmento/src/ui/__tests__/tools-schema.test.ts` exists and contains at minimum:
  - A `describe('FIGMENTO_TOOLS structure')` block with a snapshot test of `{ name, required, propCount }` per tool
  - A `describe('convertSchemaToGemini')` block with at least one smoke test
  - A `describe('convertSchemaToOpenAI')` block with at least one smoke test
- [ ] **AC2:** The snapshot test calls `expect(fingerprints).toMatchSnapshot()`. An initial snapshot file is committed alongside the test.
- [ ] **AC3:** The snapshot reflects the generated schemas from SU-2.2 — `create_frame` must show `required: ['height', 'width']` and a `propCount` matching the actual generated schema.
- [ ] **AC4:** The `convertSchemaToGemini` smoke test passes a subset of `FIGMENTO_TOOLS` (at least `create_frame` and `set_fill`) and asserts the output array is non-empty, each entry has a `name` field, and no entry has `undefined` as a parameter name.
- [ ] **AC5:** The `convertSchemaToOpenAI` smoke test applies the same pattern — non-empty, each entry has a `function.name` (or whatever structure OpenAI format uses), no undefined.
- [ ] **AC6:** `cd figmento && npm test` runs the test suite and all tests pass.
- [ ] **AC7:** The snapshot file (`__snapshots__/tools-schema.test.ts.snap`) is committed to the repo (it is NOT gitignored).
- [ ] **AC8:** No changes to any production file (`tools-schema.ts`, `tools-schema.generated.ts`, any handler, etc.).

---

## Tasks

- [ ] **Task 1: Locate conversion functions**
  - Run: `grep -r "convertSchema\|toGemini\|toOpenAI\|FunctionDeclaration\|ChatCompletionTool" figmento/src/ui/`
  - Identify exact function names and file paths
  - Note the import path for use in the test

- [ ] **Task 2: Verify Jest config is set up for `figmento/`**
  - Check if `figmento/jest.config.js` or equivalent exists
  - Check `figmento/package.json` for `jest` or `ts-jest` config
  - If missing: add minimal `jest.config.js` for `ts-jest` transformation of `src/ui/**/*.ts` files
  - Note: `figmento/package.json` already has `jest`, `ts-jest`, and `jest-environment-jsdom` in devDeps

- [ ] **Task 3: Create `figmento/src/ui/__tests__/tools-schema.test.ts`**

  ```typescript
  // figmento/src/ui/__tests__/tools-schema.test.ts
  import { FIGMENTO_TOOLS } from '../tools-schema';
  // Import conversion functions — adjust path based on Task 1 findings
  // import { convertSchemaToGemini, convertSchemaToOpenAI } from '../<file>';

  describe('FIGMENTO_TOOLS structure', () => {
    it('should match snapshot of { name, required, propCount } per tool', () => {
      const fingerprints = FIGMENTO_TOOLS.map((tool) => ({
        name: tool.name,
        required: ((tool.input_schema.required as string[] | undefined) ?? []).slice().sort(),
        propCount: Object.keys((tool.input_schema.properties as object) ?? {}).length,
      }));
      expect(fingerprints).toMatchSnapshot();
    });

    it('should contain exactly 37 tools', () => {
      expect(FIGMENTO_TOOLS).toHaveLength(37);
    });

    it('should have create_frame with required width and height', () => {
      const createFrame = FIGMENTO_TOOLS.find((t) => t.name === 'create_frame');
      expect(createFrame).toBeDefined();
      const required = (createFrame!.input_schema.required as string[]) ?? [];
      expect(required).toContain('width');
      expect(required).toContain('height');
    });

    it('should have set_fill with required nodeId', () => {
      const setFill = FIGMENTO_TOOLS.find((t) => t.name === 'set_fill');
      expect(setFill).toBeDefined();
      expect((setFill!.input_schema.required as string[]) ?? []).toContain('nodeId');
    });

    it('should have batch_execute with required commands', () => {
      const batchExecute = FIGMENTO_TOOLS.find((t) => t.name === 'batch_execute');
      expect(batchExecute).toBeDefined();
      expect((batchExecute!.input_schema.required as string[]) ?? []).toContain('commands');
    });
  });

  describe('convertSchemaToGemini', () => {
    it('should convert FIGMENTO_TOOLS to non-empty Gemini tool declarations', () => {
      // const geminiTools = convertSchemaToGemini(FIGMENTO_TOOLS);
      // expect(geminiTools.length).toBeGreaterThan(0);
      // expect(geminiTools[0]).toHaveProperty('name');
      // expect(geminiTools.every((t) => t.name !== undefined)).toBe(true);
      //
      // TODO: Uncomment after Task 1 finds the correct import path and function signature.
      expect(true).toBe(true); // placeholder — replace after Task 1
    });
  });

  describe('convertSchemaToOpenAI', () => {
    it('should convert FIGMENTO_TOOLS to non-empty OpenAI tool declarations', () => {
      // const openaiTools = convertSchemaToOpenAI(FIGMENTO_TOOLS);
      // expect(openaiTools.length).toBeGreaterThan(0);
      // expect(openaiTools[0].function).toHaveProperty('name');
      //
      // TODO: Uncomment after Task 1 finds the correct import path and function signature.
      expect(true).toBe(true); // placeholder — replace after Task 1
    });
  });
  ```

  After Task 1 resolves the import paths, replace the placeholder `expect(true).toBe(true)` lines with real assertions.

- [ ] **Task 4: Run tests and generate initial snapshot**
  - `cd figmento && npm test`
  - First run creates `__snapshots__/tools-schema.test.ts.snap`
  - Inspect the snapshot: verify `create_frame` shows expected `required` and `propCount`
  - If snapshot looks correct: commit the snapshot file

- [ ] **Task 5: Commit snapshot file**
  - Ensure `figmento/src/ui/__tests__/__snapshots__/tools-schema.test.ts.snap` is NOT in `.gitignore`
  - `git add figmento/src/ui/__tests__/__snapshots__/tools-schema.test.ts.snap`
  - This file is intentionally committed — it's the regression baseline

---

## Dev Notes

- **Prebuild must run before tests.** `tools-schema.generated.ts` is gitignored and only exists after `npm run build` runs the prebuild. If `npm test` is run in a clean checkout without running `npm run build` first, the import of `GENERATED_TOOLS` will fail (file doesn't exist).

  Options:
  1. Add a `pretest` script to `figmento/package.json`: `"pretest": "npx tsx ../scripts/generate-tool-schemas.ts"` — runs generator before tests
  2. Or check the generated file into git as an exception (add `!figmento/src/ui/tools-schema.generated.ts` to `.gitignore`)
  3. Or configure Jest to run the generator as a global setup script

  **Recommended: Option 1** — add `pretest` alongside `prebuild`. Document in the story Change Log.

- **`convertSchemaToGemini` / `convertSchemaToOpenAI` might not exist as standalone functions.** These conversions might be inline in the chat message builder or provider-specific API call code. If they're not exportable functions, the smoke test should instead import the chat mode tool resolver and test it produces a non-empty list:
  ```typescript
  import { chatToolResolver } from '../tools-schema';
  const resolver = chatToolResolver();
  const planTools = resolver({ toolsUsed: new Set(), iteration: 0 });
  expect(planTools.length).toBeGreaterThan(0);
  ```
  Adjust AC4 and AC5 to match the actual available test surface.

- **Snapshot stability.** The snapshot tests `propCount` (a number) and `required` (a sorted array). Neither depends on description text. This makes the snapshot stable across description wording changes while still catching structural regressions. Do NOT snapshot the full `input_schema` — that would be too brittle.

- **`jest-environment-jsdom` is in devDeps.** If the test runner complains about DOM APIs, add `@jest-environment node` comment at the top of the test file:
  ```typescript
  /**
   * @jest-environment node
   */
  ```

- **SU-2.3 gate.** This story can only run after SU-2.2 is complete and `npm run build` in `figmento/` succeeds, because the generated file must exist for `import { FIGMENTO_TOOLS }` to work. Do not start Task 3 until Task 4 of SU-2.2 (verify zod instance alignment) is confirmed passing.

---

## File List

| File | Action | Notes |
|---|---|---|
| `figmento/src/ui/__tests__/tools-schema.test.ts` | CREATE | ~70 LOC snapshot + smoke tests |
| `figmento/src/ui/__tests__/__snapshots__/tools-schema.test.ts.snap` | GENERATED + COMMITTED | Jest snapshot baseline — commit this |
| `figmento/package.json` | MODIFY | Add `"pretest"` script (Option 1) |
| `figmento/jest.config.js` | MODIFY (if needed) | Add ts-jest config if missing |

---

## Definition of Done

- [ ] `figmento/src/ui/__tests__/tools-schema.test.ts` contains snapshot test + `convertSchemaToGemini` smoke test + `convertSchemaToOpenAI` smoke test (or resolver equivalent)
- [ ] `__snapshots__/tools-schema.test.ts.snap` committed with correct `create_frame` and `set_fill` entries
- [ ] `cd figmento && npm test` passes with all tests green
- [ ] No production file changes
- [ ] `pretest` script (or equivalent) ensures the generated file exists before tests run

---

## Change Log

| Date | Author | Change |
|---|---|---|
| 2026-03-07 | @sm (River) | Story created. Structural snapshot (name + required + propCount per tool) + smoke tests for Gemini/OpenAI conversion functions. Gated on SU-2.2 complete. Key note: pretest hook needed because tools-schema.generated.ts is gitignored. |
| 2026-04-14 | @po (Pax) | **Retroactive Done + test updated.** Audit confirms `figmento/src/ui/__tests__/tools-schema.test.ts` exists with structural fingerprint snapshot + create_frame spot check + convertSchemaToGemini/OpenAI smoke tests. `__snapshots__/tools-schema.test.ts.snap` is committed. `pretest` hook runs the generator before tests. After SU-2.1 added 9 new schemas to the generated file, the existing hardcoded `toHaveLength(38)` assertion became stale — updated to `toHaveLength(47)` (40 generated + 7 plugin-only) and regenerated the snapshot. All 388 tests pass. Status: Ready → Done. |
