# Epic KI — Knowledge Injection into Chat Mode

> Close the design quality gap between Chat mode and MCP path by injecting the MCP server's design intelligence (blueprints, palettes, patterns, composition rules) into the plugin at build time, with optional bridge-enhanced capabilities at runtime.

## PO Validation — Epic Level

**Verdict:** :white_check_mark: GO — All 4 stories validated and transitioned to Ready
**Validated by:** @po (Pax) — 2026-03-03

### Story Scorecard

| Story | Score | Verdict | Critical Finding |
|-------|-------|---------|-----------------|
| KI-1 Compiler | 8/10 | GO | `yaml` dependency not in figmento/package.json — must be added or vendored. Dev note mentions MCP server has it, but compiler runs in plugin workspace |
| KI-2 Brief Detection | 8/10 | GO (conditional) | Signature change to `buildSystemPrompt()` affects 7 call sites across 4 files (chat.ts x3, text-layout.ts x2, screenshot.ts x1, presentation.ts x1) — only chat.ts is listed in File List. See observation 1. |
| KI-3 Local Tools | 9/10 | GO | Clean additive story. No blocking findings. |
| KI-4 Validation | 7/10 | GO (conditional) | AC4-AC6 are manual quality tests with subjective pass criteria ("comparable quality"). Needs baseline screenshots or a scoring rubric. See observation 4. |

### Epic-Level Observations (Cross-Cutting)

**1. CRITICAL — `buildSystemPrompt()` has 7 callers, not 1.**

KI-2 changes the signature from `buildSystemPrompt(memory?: string[])` to `buildSystemPrompt(brief?: DesignBrief, memory?: string[])`. The File List only shows `chat.ts` as modified. But I verified in the codebase:

```
chat.ts:238    buildSystemPrompt(memoryEntries)       ← passes memory
chat.ts:252    buildSystemPrompt(memoryEntries)       ← passes memory
chat.ts:266    buildSystemPrompt(memoryEntries)       ← passes memory
text-layout.ts:850   buildSystemPrompt()              ← no args
text-layout.ts:929   buildSystemPrompt()              ← no args
screenshot.ts:630    buildSystemPrompt()              ← no args
presentation.ts:766  buildSystemPrompt()              ← no args
```

The `brief` parameter is optional (`brief?: DesignBrief`) so existing zero-arg callers won't break at compile time. However, **they will miss the knowledge injection entirely.** Text-layout, screenshot, and presentation modes will still get the old static prompt.

**Required action for KI-2:** Add `text-layout.ts`, `screenshot.ts`, and `presentation.ts` to the File List. Dev Notes should specify: "These modes should also call `detectBrief()` on their input (user prompt or image description) and pass the result to `buildSystemPrompt()`. This extends the quality uplift beyond chat mode to ALL tool-use modes."

This is a scope expansion, not a blocker — it's 3-4 lines per file, same pattern as the chat.ts change. But it must be documented or the epic's north star ("MCP-quality output, no Claude Code required") only applies to chat mode, leaving 3 other modes behind.

**2. `yaml` dependency gap in KI-1.**

`scripts/compile-knowledge.ts` needs to parse YAML. The `yaml` package exists in `figmento-mcp-server/package.json` but NOT in `figmento/package.json`. The script runs in the figmento workspace context (`figmento/scripts/`), so it needs its own dependency.

Options (for @dev to decide):
- Add `yaml` as a devDependency in `figmento/package.json`
- Use `js-yaml` (lighter) as devDependency
- Run the script from the MCP server workspace and output to the plugin directory

Dev Note should mention this explicitly. Not a blocker, but will cause confusion during implementation if missed.

**3. No unit tests specified for KI-1 or KI-2.**

KI-1 creates a build script that transforms YAML into TypeScript. There are no ACs for testing the compiler itself (e.g., "given this YAML input, produces this TypeScript output"). KI-2 creates `detectBrief()` — a pure function that's highly testable but has no test ACs.

**Recommendation:** Add to KI-1 Dev Notes: "Consider a smoke test that verifies `compile-knowledge.ts` produces valid TypeScript (import the output and check exports are defined)." Add to KI-2 Dev Notes: "Consider unit tests for `detectBrief()` — at minimum: format detection for 6 formats, mood detection for 12 moods, design type detection for single vs multi-section."

This is advisory, not blocking. The epic-level validation tests (KI-A through KI-E) provide integration coverage.

**4. KI-4 quality parity tests need a scoring rubric.**

AC4-AC6 have pass criteria like "comparable quality" and "uses serif heading font." These are evaluatable but subjective. The MCP path doesn't produce deterministic output either, so a pixel-perfect comparison isn't realistic.

**Recommended addition to KI-4 Dev Notes:** "For each quality test, document: (a) screenshot of chat mode output, (b) screenshot of MCP path output for same prompt, (c) which of the 5 refinement checks pass/fail on each. 'Comparable quality' means: chat mode passes the same refinement checks that MCP path passes, and visual inspection confirms similar hierarchy/spacing/palette usage."

**5. Risk not documented: `$tokens.*` references in bundled patterns.**

Pattern recipes contain `$tokens.spacing.xl`, `$tokens.colors.primary`, etc. These references are resolved at runtime by the MCP server's `resolveTokens()` engine. When patterns are bundled into the plugin, who resolves them?

- If the AI reads pattern recipes and uses them as **structural guidance** (not executing them), the `$tokens.*` strings are informational — fine.
- If chat mode tries to **execute** pattern recipes programmatically, it needs a token resolver — which doesn't exist in the plugin.

The epic's OUT of Scope says "Design system CRUD in chat mode (stays bridge-only)," which implies patterns are guidance-only. But this should be explicit in KI-1 Dev Notes: "Bundled pattern recipes are for AI prompt context only — the AI reads the structure and recreates it using tools. The `$tokens.*` references are NOT resolved in the plugin; they serve as hints for the AI to use design system colors/spacing."

### Recommended Sprint Sequencing

```
Sprint KI-1 (mandatory first):
  └── KI-1: Knowledge Compiler — build script + types + build.js integration

Sprint KI-2 (parallel):
  1. KI-3: Local Intelligence Tools (S — smallest, unblocks AI mid-design queries)
  2. KI-2: Brief Detection & Prompt Injection (M — larger, benefits from KI-3 being testable)
     Note: Update all 7 buildSystemPrompt() callers, not just chat.ts

Sprint KI-3:
  └── KI-4: Quality Parity Validation (M — manual testing + prompt tuning)
```

---

## Problem Statement

Figmento has two AI-driven design paths with a **measurable quality gap**:

| Dimension | MCP Path (Claude Code) | Chat Mode (Plugin) |
|---|---|---|
| Layout blueprints | 26 YAML files with proven zone breakdowns | 0 |
| Pattern recipes | 10 multi-format composition recipes | 0 |
| Composition rules | Background rhythm, section transitions, color continuity | 0 |
| Refinement automation | 5 checks, 100-point scoring | Manual 16-point checklist only |
| Anti-generic constraints | 5-8 per blueprint, context-specific | 20 generic anti-patterns |
| Memorable element guidance | Per-blueprint, explicit | Implicit/none |

**Root cause:** The knowledge base (113 YAML files in `figmento-mcp-server/knowledge/`) is only accessible to the MCP server. Chat mode runs inside the Figma plugin sandbox and cannot read the file system. The design intelligence in `system-prompt.ts` (537 lines) is a manually-maintained, compressed subset — it has palettes and font pairings but lacks the architectural frameworks (blueprints, patterns, composition) that produce professional-quality output.

**Impact on users:**
- Chat mode — the primary UX surface — produces 70-80/100 quality output
- MCP path produces 85-90/100 for the same prompts
- Users who discover the gap switch to Claude Code for serious work, defeating the purpose of a "quick and effective" co-pilot
- Multi-section designs (landing pages, carousels) suffer most — no composition rules means no visual rhythm

**North star:** User types a prompt in Chat mode and gets MCP-quality output. No Claude Code required.

## Strategy — Hybrid Approach (Architect's Option C)

**Bundle essential intelligence at build time. Query the MCP server for heavy/dynamic data only when the bridge is connected.**

```
                    +---------------------------------------------+
                    |           Chat Mode Runtime                  |
                    |                                              |
                    |  +--------------------------------------+    |
                    |  | Bundled Knowledge (~117 KB)           |    |
                    |  | - Palettes (12 mood sets)             |    |
                    |  | - Font pairings (10 sets)             |    |
                    |  | - Size presets (all formats)           |    |
                    |  | - Layout blueprints (30 compressed)    |    |
                    |  | - Pattern zone breakdowns              |    |
                    |  | - Composition rules                    |    |
                    |  | - Refinement check definitions         |    |
                    |  +------------------+-------------------+    |
                    |                     | always available        |
                    |                     v                         |
                    |  +--------------------------------------+    |
                    |  | Smart Prompt Builder                  |    |
                    |  | Detects brief intent -> injects       |    |
                    |  | only relevant ~1KB subset into prompt  |    |
                    |  +--------------------------------------+    |
                    |                                              |
                    |  +--------------------------------------+    |
                    |  | Local Intelligence Tools (0ms)        |    |
                    |  | lookup_blueprint, lookup_palette,      |    |
                    |  | lookup_fonts, lookup_size              |    |
                    |  +--------------------------------------+    |
                    |                                              |
                    |  +--------------------------------------+    |
                    |  | Bridge (optional, opportunistic)       |    |
                    |  | If connected: design system CRUD,      |    |
                    |  | reference analysis, pattern execution   |    |
                    |  +--------------------------------------+    |
                    +---------------------------------------------+
```

**Why hybrid over pure-bundle or pure-query:**
- Pure bundle: works offline, instant, but knowledge frozen at build time
- Pure query: always fresh, but requires MCP server running — defeats chat mode's independence
- Hybrid: instant for 95% of queries (bundled), bridge-enhanced for power features, graceful degradation

## Scope

### IN Scope

- New build script `scripts/compile-knowledge.ts` — reads MCP server YAML, outputs compressed TypeScript
- New directory `figmento/src/knowledge/` — auto-generated, gitignored compiled knowledge
- Refactor `system-prompt.ts` — `buildSystemPrompt()` accepts a `DesignBrief` and injects relevant knowledge subset
- New `detectBrief()` function — lightweight keyword parser (format, mood, design type from user message)
- 4 new local intelligence tools in `tools-schema.ts` and `onToolCall` routing
- Update `build.js` — add pre-build step to run knowledge compilation
- Version hash for sync validation (YAML hash embedded in compiled output)

### OUT of Scope

- MCP server changes (knowledge YAML is the source of truth — no modifications)
- WebSocket relay changes
- Plugin sandbox (`code.ts`) changes
- New AI providers or model changes
- Reference image bundling (4.6 MB — too large, stays MCP-only)
- Design system CRUD in chat mode (stays bridge-only)
- Changes to `tool-use-loop.ts` (the loop engine is provider-agnostic and doesn't need modification)

## Dependencies

- Epic FC completed (tool-use loop extracted, all modes migrated) — KI builds on the shared engine
- Epic MQ completed (system-prompt.ts and tools-schema.ts at quality baseline)
- `figmento-mcp-server/knowledge/` directory stable and populated (113 YAML files)

## Technical Constraints

| Constraint | Detail | Source |
|---|---|---|
| Plugin sandbox | Cannot read filesystem, no arbitrary HTTP. All data must be inlined at build time. | Figma plugin model |
| Bundle size | Plugin is ~2-5 MB. Adding 117 KB is trivial (< 5% increase). | build.js esbuild output |
| System prompt tokens | Currently ~15K tokens. ~20-25K headroom. Injecting ~950 tokens per brief is safe. | Provider context limits |
| Build tool | esbuild bundles all TS/JSON imports into dist/ui.html. Can inline static data. | build.js |
| Knowledge sync | Two copies (YAML in MCP server, compiled TS in plugin). Must stay in sync via build script. | Hybrid approach tradeoff |

## Phase Structure

### Phase 1 — Build Pipeline (Blocker)
| Story | Name | Size | Blocks |
|---|---|---|---|
| KI-1 | Knowledge Compiler Build Script | M | KI-2, KI-3, KI-4 |

### Phase 2 — Intelligence Integration
| Story | Name | Size | Parallel? |
|---|---|---|---|
| KI-2 | Smart Brief Detection & Prompt Injection | M | With KI-3 |
| KI-3 | Local Intelligence Tools | S | With KI-2 |

### Phase 3 — Validation & Polish
| Story | Name | Size | Requires |
|---|---|---|---|
| KI-4 | Quality Parity Validation & Refinement Hook | M | KI-2, KI-3 |

---

## Stories

---

### KI-1: Knowledge Compiler Build Script

**Status:** Done
**Size:** M (Medium)
**Blocks:** KI-2, KI-3, KI-4
**Agent:** @dev

#### Description

Create a build-time script that reads the MCP server's knowledge YAML files and compiles them into a TypeScript module that the plugin can import. This is the foundation — without compiled knowledge, the other stories have nothing to inject.

The script reads from `figmento-mcp-server/knowledge/`, compresses blueprints to zone-only JSON, strips prose descriptions, and outputs `figmento/src/knowledge/compiled-knowledge.ts`. The build system (`build.js`) runs this script as a pre-build step.

#### Acceptance Criteria

- [x] **AC1:** `scripts/compile-knowledge.ts` exists and can be run via `npx tsx scripts/compile-knowledge.ts`
- [x] **AC2:** Script reads these YAML sources from `figmento-mcp-server/knowledge/`:
  - `color-system.yaml` (12 mood-based palettes)
  - `typography.yaml` (10 font pairings + type scale ratios)
  - `size-presets.yaml` (all format dimensions)
  - `layouts/**/*.yaml` (26+ layout blueprints)
  - `patterns/cross-format.yaml` (10 pattern recipes)
  - `patterns/composition-rules.yaml` (background rhythm rules)
  - `refinement-rules.yaml` (quality check definitions)
- [x] **AC3:** Script outputs `figmento/src/knowledge/compiled-knowledge.ts` with typed exports:
  ```typescript
  export const PALETTES: Record<string, Palette>;           // mood -> palette
  export const FONT_PAIRINGS: Record<string, FontPairing>;  // mood -> fonts
  export const SIZE_PRESETS: Record<string, SizePreset>;     // format -> dimensions
  export const BLUEPRINTS: Blueprint[];                      // compressed zone-only
  export const PATTERNS: Record<string, PatternRecipe>;      // pattern name -> recipe
  export const COMPOSITION_RULES: CompositionRules;          // rhythm + transitions
  export const REFINEMENT_CHECKS: RefinementCheck[];         // check definitions
  export const KNOWLEDGE_VERSION: string;                    // sha256 of all source YAML
  ```
- [x] **AC4:** Layout blueprints are compressed from full YAML (~132 KB) to zone-only JSON (~35 KB):
  - Keep: `id`, `name`, `category`, `mood`, `zones[]` (with `y_start_pct`, `y_end_pct`, `elements`), `anti_generic[]`, `memorable_element`, `whitespace_ratio`
  - Strip: verbose prose descriptions, design philosophy comments, duplicate metadata, canvas reference sizes
- [x] **AC5:** Pattern recipes are compressed (~44 KB -> ~26.5 KB):
  - Keep: recipe structure (frame hierarchy, `$tokens.*` references, format_adaptations zone breakdowns)
  - Strip: verbose prop descriptions, variant cosmetics, comments
- [x] **AC6:** Output file is gitignored (add `figmento/src/knowledge/compiled-knowledge.ts` to `.gitignore`)
- [x] **AC7:** `figmento/build.js` updated — runs `compile-knowledge.ts` as pre-build step before esbuild bundling
- [x] **AC8:** `KNOWLEDGE_VERSION` hash changes when any source YAML file changes (enables staleness detection)
- [x] **AC9:** Script handles missing YAML files gracefully — warns but does not fail build (degraded mode)
- [x] **AC10:** `cd figmento && npm run build` succeeds end-to-end (compile -> esbuild -> dist/ui.html)

#### Tasks

- [x] Task 1: Create `scripts/compile-knowledge.ts` with YAML reading + TypeScript codegen
- [x] Task 2: Define TypeScript interfaces for all compiled data types (`Blueprint`, `Palette`, `FontPairing`, etc.)
- [x] Task 3: Implement blueprint compression (full YAML -> zone-only JSON)
- [x] Task 4: Implement pattern recipe compression
- [x] Task 5: Add SHA-256 version hash computation across all source YAML
- [x] Task 6: Update `build.js` to run compiler as pre-build step
- [x] Task 7: Add `figmento/src/knowledge/` to `.gitignore`
- [x] Task 8: Verify full build pipeline end-to-end

#### Dev Notes

- **PO note (observation 2):** The `yaml` package is a dependency of `figmento-mcp-server`, NOT of `figmento`. The compiler runs in the `figmento/` workspace. @dev must add `yaml` (or `js-yaml`) as a devDependency in `figmento/package.json` before implementing.
- The MCP server path is `../figmento-mcp-server/knowledge/` relative to `figmento/scripts/`
- esbuild will inline the compiled TS module into `dist/ui.html` automatically — no loader config needed
- If `tsx` is not available, the script can be plain Node.js with `ts-node` or compiled separately
- Pattern `$tokens.*` references must be preserved verbatim — they're resolved at runtime by the design system engine
- Target total compiled size: ~117 KB uncompressed, ~35 KB gzipped (well within plugin limits)
- **PO note (observation 5):** Bundled pattern recipes with `$tokens.*` references are for AI prompt context only — the AI reads the structure and recreates it using tools. The `$tokens.*` references are NOT resolved in the plugin; they serve as hints for the AI to use design system colors/spacing. Do NOT attempt to build a token resolver in the plugin.
- **PO note (observation 3):** Consider a smoke test that imports the generated `compiled-knowledge.ts` and verifies all 7 exports are defined and non-empty.

#### File List

| File | Action | Notes |
|---|---|---|
| `figmento/scripts/compile-knowledge.ts` | CREATED | Build-time YAML -> TS compiler |
| `figmento/src/knowledge/compiled-knowledge.ts` | CREATED (generated) | Auto-generated, gitignored, 88.6 KB |
| `figmento/src/knowledge/types.ts` | CREATED | TypeScript interfaces for compiled data |
| `figmento/build.js` | MODIFIED | Added compileKnowledge() pre-build step + child_process import |
| `figmento/.gitignore` | MODIFIED | Added `src/knowledge/compiled-knowledge.ts` |
| `figmento/package.json` | MODIFIED | Added js-yaml, @types/js-yaml, tsx as devDependencies |

---

### KI-2: Smart Brief Detection & Prompt Injection

**Status:** Done
**Size:** M (Medium)
**Depends on:** KI-1
**Parallel with:** KI-3
**Agent:** @dev

#### Description

Refactor `buildSystemPrompt()` to accept a `DesignBrief` and inject only the relevant knowledge subset (~950 tokens) into the system prompt. Create `detectBrief()` — a lightweight keyword parser that extracts format, mood, and design type from the user's first message.

Today `buildSystemPrompt()` returns a static 537-line string with hardcoded knowledge. After this story, it returns a dynamic prompt that includes the specific blueprint, palette, fonts, and composition rules matching the user's intent. The prompt grows by ~950 tokens for a typical request — well within the 20-25K headroom.

#### Acceptance Criteria

- [x] **AC1:** New function `detectBrief(userMessage: string): DesignBrief` exists in `figmento/src/ui/brief-detector.ts`
- [x] **AC2:** `DesignBrief` interface defined:
  ```typescript
  interface DesignBrief {
    format: string | null;       // e.g. "instagram-post", "landing-page", "a4-flyer"
    mood: string | null;         // e.g. "luxury", "playful", "corporate"
    designType: 'single' | 'multi-section' | null;  // multi = landing page, carousel
    keywords: string[];          // raw extracted keywords for fallback matching
  }
  ```
- [x] **AC3:** `detectBrief()` handles these keyword patterns (at minimum):
  - Format detection: "instagram" -> ig-post, "landing page" -> landing-page, "presentation" -> slide-16-9, "poster" -> poster, "brochure" -> brochure, "business card" -> business-card
  - Mood detection: maps to the 12 palette mood keys in `color-system.yaml` (moody, fresh, corporate, luxury, playful, nature, tech, warm, minimal, retro, ocean, sunset)
  - Design type: "landing page", "carousel", "multi-section" -> multi-section; everything else -> single
- [x] **AC4:** `buildSystemPrompt()` signature updated to `buildSystemPrompt(brief?: DesignBrief, memory?: string[]): string`
- [x] **AC5:** When `brief` is provided with a matching blueprint:
  - The prompt includes the blueprint's zone breakdown, anti-generic rules, and memorable element hint
  - The prompt includes the matching palette (6 colors)
  - The prompt includes the matching font pairing (heading + body + weights)
  - The prompt includes composition rules (only when `designType === 'multi-section'`)
- [x] **AC6:** When `brief` is provided with NO matching blueprint, prompt falls back to existing hardcoded knowledge (no regression)
- [x] **AC7:** Injected knowledge adds no more than ~1,500 tokens to the system prompt (measured via rough `content.length / 4` estimate)
- [x] **AC8:** Chat mode calls `detectBrief()` on the user's first message and passes the result to `buildSystemPrompt()` — this happens in `chat.ts` at session initialization
- [x] **AC9:** Existing hardcoded palettes/fonts in `system-prompt.ts` are replaced by references to compiled knowledge (reduce duplication)
- [x] **AC10:** `cd figmento && npm run build` succeeds; no regressions in existing chat mode behavior

#### Tasks

- [x] Task 1: Create `figmento/src/ui/brief-detector.ts` with `detectBrief()` and `DesignBrief` interface
- [x] Task 2: Build keyword dictionaries for format, mood, and design type detection
- [x] Task 3: Refactor `buildSystemPrompt()` — add `brief` parameter, inject knowledge conditionally
- [x] Task 4: Replace hardcoded palettes/fonts in system-prompt.ts with compiled knowledge imports
- [x] Task 5: Wire `detectBrief()` into all 7 call sites across 4 files (chat.ts ×3, text-layout.ts ×2, screenshot.ts ×1, presentation.ts ×1)
- [x] Task 6: Test: same prompt with and without brief detection — verify injected context matches

#### Dev Notes

- `detectBrief()` is intentionally simple — keyword matching, not AI. It runs synchronously, no API calls. Accuracy matters less than coverage; false negatives just mean the prompt falls back to generic knowledge (which is what it does today).
- The injection point in `chat.ts` is where `buildSystemPrompt()` is called before the first AI message. The brief should be detected from the user's first message (available at that point).
- Don't remove ALL hardcoded knowledge from `system-prompt.ts` — keep the anti-patterns list, self-evaluation checklist, and general layout rules. Only replace what's now available from compiled knowledge (palettes, font pairings, size presets).
- `chat.ts` is 18,004 lines — touch minimally. The change should be ~5-10 lines: call `detectBrief()`, pass result to `buildSystemPrompt()`.
- **PO note (observation 1 — CRITICAL):** `buildSystemPrompt()` has **7 callers across 4 files**, not just chat.ts. The other callers are: `text-layout.ts` (lines 850, 929), `screenshot.ts` (line 630), `presentation.ts` (line 766). These modes currently call `buildSystemPrompt()` with no args. The new `brief` parameter is optional, so they won't break — but they **will miss the knowledge injection entirely**. @dev MUST update these callers to also call `detectBrief()` on their input (user prompt or image description) and pass the result. This is 3-4 lines per file, same pattern. Without this, the quality uplift only applies to chat mode, not the other 3 tool-use modes.
- **PO note (observation 3):** Consider unit tests for `detectBrief()` — at minimum: format detection for 6 formats, mood detection for 12 moods, design type detection for single vs multi-section. This is a pure function — highly testable.

#### File List

| File | Action | Notes |
|---|---|---|
| `figmento/src/ui/brief-detector.ts` | CREATE | detectBrief() + DesignBrief interface |
| `figmento/src/ui/system-prompt.ts` | MODIFY | Accept DesignBrief, inject knowledge, reduce hardcoded duplication |
| `figmento/src/ui/chat.ts` | MODIFY | Wire detectBrief() into session init (~5-10 lines, 3 call sites) |
| `figmento/src/ui/text-layout.ts` | MODIFY | Wire detectBrief() into prompt building (~3-4 lines, 2 call sites) |
| `figmento/src/ui/screenshot.ts` | MODIFY | Wire detectBrief() into prompt building (~3-4 lines, 1 call site) |
| `figmento/src/ui/presentation.ts` | MODIFY | Wire detectBrief() into prompt building (~3-4 lines, 1 call site) |

---

### KI-3: Local Intelligence Tools

**Status:** Done
**Size:** S (Small)
**Depends on:** KI-1
**Parallel with:** KI-2
**Agent:** @dev

#### Description

Add 4 local intelligence tools that resolve from bundled knowledge with zero network latency. These tools allow the AI to query specific knowledge mid-design — "I need the blueprint for a pricing section" or "what's the Instagram post size?" — without a WS round-trip.

Today, the AI in chat mode has 33 tools — all routed through the sandbox to Figma. After this story, it has 37 tools. The 4 new tools resolve locally in `onToolCall` before the bridge is ever hit.

#### Acceptance Criteria

- [x] **AC1:** 4 new tool definitions added to `FIGMENTO_TOOLS` in `tools-schema.ts`:
  - `lookup_blueprint` — input: `{ category: string, mood?: string, subcategory?: string }` — returns matching blueprint(s)
  - `lookup_palette` — input: `{ mood: string }` — returns palette object (primary, secondary, accent, background, text, muted)
  - `lookup_fonts` — input: `{ mood: string }` — returns font pairing (heading family/weight, body family/weight)
  - `lookup_size` — input: `{ format: string }` — returns size preset (width, height, safe zones)
- [x] **AC2:** Tool descriptions include the list of valid values (e.g., `lookup_palette` lists all 12 mood keys)
- [x] **AC3:** `onToolCall` in `chat.ts` routes these 4 tools to local resolution — NO WebSocket call, NO `sendCommandToSandbox`
- [x] **AC4:** Local resolution reads from compiled knowledge (imported from `compiled-knowledge.ts`)
- [x] **AC5:** Response time for local tools is <5ms (no async, no network)
- [x] **AC6:** If compiled knowledge is not available (build failure), tools return a helpful error message: "Knowledge base not available. Run `npm run build` to compile."
- [x] **AC7:** AI providers (Anthropic, Gemini, OpenAI) all receive the 4 new tools in their tool definitions
- [x] **AC8:** `cd figmento && npm run build` succeeds; existing 33 tools unaffected

#### Tasks

- [x] Task 1: Add 4 tool definitions to `FIGMENTO_TOOLS` in `tools-schema.ts`
- [x] Task 2: Create `figmento/src/ui/local-intelligence.ts` — resolver functions that query compiled knowledge
- [x] Task 3: Wire local tools into `onToolCall` in `chat.ts` with early return (before sandbox routing)
- [x] Task 4: Test each tool with sample inputs — verify correct data returned from compiled knowledge

#### Dev Notes

- The resolver functions are trivial: `findBestBlueprint(category, mood)` does a scored mood match against `BLUEPRINTS` array (same algorithm as `scoreMoodMatch()` in MCP server's `layouts.ts`). `findPalette(mood)` is a direct lookup in `PALETTES` map.
- The `onToolCall` routing should be a simple early-return check:
  ```typescript
  if (name in LOCAL_INTELLIGENCE_TOOLS) {
    return { content: JSON.stringify(LOCAL_INTELLIGENCE_TOOLS[name](args)), is_error: false };
  }
  // ... existing sandbox routing below
  ```
- This is additive — no existing tool routing changes. The 4 new names don't conflict with any existing tool names.
- Tool definitions must match the Anthropic/Gemini/OpenAI tool schema format already used in `tools-schema.ts`.

#### File List

| File | Action | Notes |
|---|---|---|
| `figmento/src/ui/tools-schema.ts` | MODIFIED | Added 4 tool definitions (lookup_blueprint, lookup_palette, lookup_fonts, lookup_size) — total 37 tools |
| `figmento/src/ui/local-intelligence.ts` | CREATED | Resolver functions: lookupBlueprint (scored mood match), lookupPalette, lookupFonts, lookupSize + LOCAL_TOOL_HANDLERS router |
| `figmento/src/ui/chat.ts` | MODIFIED | Added import + early-return routing for local tools in buildToolCallHandler (~8 lines) |

---

### KI-4: Quality Parity Validation & Refinement Hook

**Status:** Superseded by AE-1 (2026-04-14)

> **Why superseded:** KI-4 AC1 asked for a refinement block injected into the
> system prompt as post-creation instructions. AE-1 (Auto-Evaluate After Batch)
> shipped a better version: `batch_execute` and `create_design` now
> automatically run `run_refinement_check` + screenshot and return issues in
> the tool result. The AI sees concrete violations instead of reading generic
> instructions. `buildRefinementBlock()` in `figmento/src/ui/system-prompt.ts`
> intentionally returns `''` with a comment noting this. AC3 (multi-section
> composition rules) shipped independently and is live at `system-prompt.ts:162`.
> AC4/5 (manual quality parity tests) are out of scope for code — they become
> @qa validation work if ever prioritized.
**Size:** M (Medium)
**Depends on:** KI-2, KI-3
**Agent:** @dev

#### Description

Validate that Chat mode output quality now matches MCP path for the same prompts. Add a post-creation refinement prompt that leverages the bundled refinement check definitions to catch craft errors (gradient direction, spacing, typography hierarchy) without requiring the MCP server.

This is the "proof it worked" story. It includes side-by-side quality tests and wires the refinement knowledge into the AI's post-creation behavior.

#### Acceptance Criteria

- [x] **AC1:** Refinement check definitions from compiled knowledge are injected into the system prompt as a post-creation instruction block:
  ```
  ## After Creating Any Design (Auto-Refinement)
  Verify these checks and fix any issues before reporting completion:
  1. Gradient direction: solid end faces text, transparent end faces image
  2. Spacing scale: all itemSpacing values in [4,8,12,16,20,24,32,40,48,64,80,96,128]
  3. Typography hierarchy: largest font >= 2x smallest font
  4. Auto-layout coverage: frames with 2+ children use auto-layout
  5. Placeholder fills: no unfilled gray rectangles remain
  ```
- [x] **AC2:** The refinement block is ALWAYS included in the system prompt (not brief-dependent)
- [x] **AC3:** Composition rules are included when `brief.designType === 'multi-section'`:
  ```
  ## Multi-Section Composition
  Background rhythm: dark -> light -> light -> dark -> light -> dark
  Hero and CTA sections use primary color. Feature/testimonial sections alternate surface/background.
  Never use the same background color on 3+ consecutive sections.
  ```
- [ ] **AC4:** Quality parity test — Instagram ad prompt:
  ```
  "Instagram post for a luxury perfume brand. Dark editorial, gold accent.
   Headline: Essence of Night. Subheadline: A fragrance that lingers."
  ```
  - Chat mode output uses a blueprint zone breakdown (verified by inspecting tool calls for `lookup_blueprint`)
  - Chat mode output uses the luxury palette (gold/champagne accent on near-black)
  - Chat mode output uses serif heading font (Cormorant Garamond or Playfair Display)
  - Gradient direction is correct (solid end behind text)
- [ ] **AC5:** Quality parity test — landing page prompt:
  ```
  "Landing page for a SaaS analytics tool called DataPulse.
   Modern, tech mood. Hero + features + pricing + CTA sections."
  ```
  - Chat mode produces 4 distinct sections
  - Background colors alternate (not all the same)
  - Typography has 3+ distinct size levels
  - Composition rules are followed (hero=primary, features=surface, etc.)
- [ ] **AC6:** Quality parity test — simple social post:
  ```
  "Instagram post: Summer Sale - 50% off everything. Playful, colorful mood."
  ```
  - Chat mode output is comparable quality to MCP path output for same prompt
  - No regression from current chat mode behavior
- [x] **AC7:** `cd figmento && npm run build` succeeds

#### Tasks

- [x] Task 1: Add refinement check block to system prompt (always-on, not brief-dependent)
- [x] Task 2: Add composition rules injection for multi-section briefs in `buildSystemPrompt()` (done in KI-2)
- [ ] Task 3: Run quality parity test AC4 (Instagram ad) — document results
- [ ] Task 4: Run quality parity test AC5 (landing page) — document results
- [ ] Task 5: Run quality parity test AC6 (simple post) — document results
- [ ] Task 6: Fix any quality gaps found during testing (iterate on prompt injection content)

#### Dev Notes

- The refinement block replaces the manual 16-point self-evaluation checklist with a machine-checkable 5-point list. Keep the full 16-point checklist in the prompt too — it provides softer guidance (alignment, whitespace, balance) that can't be automated.
- Quality tests are manual — run each prompt in Chat mode, inspect the Figma output, compare against a reference MCP path output. Document screenshots or observations in this story file.
- If quality gaps persist after initial injection, the fix is almost always: adjust what's injected in the system prompt, not change the tools. The AI's behavior is driven by the prompt context.
- This story may require 2-3 iteration passes on prompt content. Budget time for tuning.
- **PO note (observation 4):** For each quality test (AC4-AC6), document: (a) screenshot of chat mode output, (b) screenshot of MCP path output for the same prompt (if available), (c) which of the 5 refinement checks pass/fail on each. "Comparable quality" means: chat mode passes the same refinement checks that MCP path passes, and visual inspection confirms similar hierarchy/spacing/palette usage. This makes the subjective tests auditable.

#### File List

| File | Action | Notes |
|---|---|---|
| `figmento/src/ui/system-prompt.ts` | MODIFIED | Added `buildRefinementBlock()` — always-on 5-check auto-refinement block + 5 high-impact micro-checks from compiled REFINEMENT_CHECKS. Injected via template literal before brief injection. |
| This story file | MODIFIED | Added scoring rubric, test procedures, AC checkboxes |

#### Quality Parity Scoring Rubric

Per @po observation 4, "comparable quality" is defined by this rubric. Each test (AC4-AC6) is scored on 5 structural checks + 3 visual checks = 8 total. **PASS** = 6/8 checks pass (75%). **PARITY** = chat mode score >= MCP path score - 1.

**Structural checks (automatable from tool call log + get_node_info):**

| # | Check | How to verify | Pass criteria |
|---|-------|---------------|---------------|
| S1 | Blueprint used | Tool call log contains `lookup_blueprint` call | Any blueprint returned (not error) |
| S2 | Palette matched | Tool call log contains `lookup_palette` or system prompt shows injected palette | Correct mood palette colors used in fills |
| S3 | Font pairing matched | Tool call log contains `lookup_fonts` or system prompt shows injected fonts | Correct heading/body fonts in text nodes |
| S4 | Gradient direction correct | `get_node_info` on overlay rectangle → gradient stops | Solid end (opacity=1) faces text zone |
| S5 | Spacing on-grid | `get_node_info` on all frames → itemSpacing, padding values | All values in [4,8,12,16,20,24,32,40,48,64,80,96,128] |

**Visual checks (manual inspection of Figma output):**

| # | Check | How to verify | Pass criteria |
|---|-------|---------------|---------------|
| V1 | Typography hierarchy | Visual: 3+ distinct size levels, headline >= 2x body | Clear reading order first-second-third |
| V2 | Whitespace balance | Visual: no cramped zones, no vast empty areas | Content density ~40-60% |
| V3 | Memorable element present | Visual: ONE disproportionate standout element | Can point to it; removing it would make design generic |

**Per-test additional criteria:**

- **AC4 (luxury ad):** S3 must show serif heading (Cormorant Garamond or Playfair Display). Palette must be luxury-premium (gold/champagne accent on near-black).
- **AC5 (landing page):** Must produce 4 distinct sections. Background colors must alternate (verify via get_node_info on section frames). Composition rules injected (multi-section detected).
- **AC6 (playful post):** Must not regress from current chat mode quality. Playful-fun palette applied.

---

## Definition of Done (Epic Level)

- [ ] All 4 stories implemented, tested, and Done
- [ ] `scripts/compile-knowledge.ts` compiles all 7 YAML sources into `compiled-knowledge.ts`
- [ ] `npm run build` in `figmento/` runs the knowledge compiler as a pre-build step
- [ ] `buildSystemPrompt()` dynamically injects blueprint + palette + fonts based on detected brief
- [ ] 4 local intelligence tools (`lookup_blueprint`, `lookup_palette`, `lookup_fonts`, `lookup_size`) resolve in <5ms
- [ ] Chat mode Instagram ad output follows a blueprint zone breakdown (not freeform)
- [ ] Chat mode landing page output has alternating background colors (composition rules applied)
- [ ] Chat mode refinement block catches gradient direction errors before user sees them
- [ ] No regressions in existing Chat mode, MCP path, or any migrated mode
- [ ] `cd figmento && npm run build` clean
- [ ] All 3 providers work (Anthropic, Gemini, OpenAI) with the enhanced prompt and local tools
- [ ] Knowledge version hash embedded — rebuild detects stale knowledge automatically

## Validation Tests (Epic Level)

**TEST KI-A: Knowledge Compilation**
```
Delete figmento/src/knowledge/compiled-knowledge.ts.
Run: cd figmento && npm run build
```
- [ ] compiled-knowledge.ts is regenerated
- [ ] Build succeeds
- [ ] File contains all 7 data exports + KNOWLEDGE_VERSION hash

**TEST KI-B: Brief Detection**
```
User message: "Create a luxury fashion Instagram ad with gold accents"
```
- [ ] `detectBrief()` returns: `{ format: "ig-post", mood: "luxury", designType: "single" }`
- [ ] System prompt includes: luxury palette, serif font pairing, ad blueprint zone breakdown

**TEST KI-C: Local Tool Resolution**
```
AI calls: lookup_blueprint({ category: "ads", mood: "luxury" })
```
- [ ] Returns a blueprint object with zones, anti_generic rules, memorable_element
- [ ] Response time <5ms
- [ ] No WebSocket traffic generated

**TEST KI-D: Chat vs MCP Quality Parity**
```
Same prompt in Chat mode AND MCP path (Claude Code):
"Instagram post for a specialty coffee brand called Ritual Roasters.
 Dark editorial, gold accent, headline: Every cup tells a story."
```
- [ ] Chat mode output quality is comparable to MCP path output
- [ ] Both use auto-layout, correct gradient direction, typography hierarchy
- [ ] Chat mode output is guided by a blueprint (visible in tool call log or prompt context)

**TEST KI-E: Multi-Section Composition**
```
Chat mode: "Landing page for DataPulse analytics. Modern tech. Hero, features, pricing, CTA."
```
- [ ] 4 sections created with alternating backgrounds
- [ ] Hero uses primary/dark color
- [ ] Features/pricing use surface/light color
- [ ] CTA uses primary/dark color
- [ ] No 3 consecutive sections share the same background

---

## Size Estimate

| Story | Size | LOC (est.) | Duration |
|---|---|---|---|
| KI-1 | M | ~250 | 1-2 days |
| KI-2 | M | ~200 | 1-2 days |
| KI-3 | S | ~120 | 0.5-1 day |
| KI-4 | M | ~80 + testing | 1-2 days |
| **Total** | | **~650 LOC** | **4-7 days** |

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Compiled knowledge drifts from YAML source | Medium | High | Version hash + CI validation (KI-1 AC8) |
| Brief detection misclassifies user intent | Medium | Low | Graceful fallback to generic knowledge (KI-2 AC6) |
| System prompt too large after injection | Low | Medium | Budget is ~950 tokens per brief; 20K headroom (KI-2 AC7) |
| Font pairings in compiled knowledge don't match what Figma loads | Low | High | Use same font names as existing system-prompt.ts (already validated) |
| Knowledge compilation slows build | Low | Low | YAML parsing is <500ms for 117 KB; acceptable |

---

## Change Log

| Date | Author | Change |
|---|---|---|
| 2026-03-03 | @pm (Morgan) | Epic created based on @architect Option C spec and @analyst priority analysis |
| 2026-03-03 | @po (Pax) | Epic validated — GO. 5 observations added. KI-2 File List expanded (3 mode files added). All 4 stories transitioned Draft -> Ready. |
| 2026-03-05 | @dev (Dex) | KI-1 implemented: compiler script, types, build.js integration, gitignore. All 10 ACs verified. Output: 88.6 KB (12 palettes, 10 font pairings, 39 size presets, 25 blueprints, 10 patterns, 25 refinement checks). Added js-yaml + tsx as devDeps. |
| 2026-03-05 | @dev (Dex) | KI-2 implemented: brief-detector.ts (detectBrief + DesignBrief), system-prompt.ts refactored (compiled knowledge imports, brief injection with blueprint/palette/fonts/composition rules), all 7 buildSystemPrompt() callers updated across 4 files (chat.ts ×3, text-layout.ts ×2, screenshot.ts ×1, presentation.ts ×1). Token delta: ~361 tokens for single designs, ~592 for multi-section. Build passes. |
| 2026-03-05 | @dev (Dex) | KI-3 implemented: local-intelligence.ts (4 resolver functions), tools-schema.ts (4 new tool definitions, 33→37 tools), chat.ts (early-return routing for local tools). Build passes. |
| 2026-03-05 | @dev (Dex) | KI-4 code work: Added `buildRefinementBlock()` to system-prompt.ts — always-on 5-check auto-refinement block + 5 high-impact micro-checks from compiled REFINEMENT_CHECKS. Composition rules (AC3) already done in KI-2. Added quality parity scoring rubric (8-point: 5 structural + 3 visual, PASS=6/8, PARITY=chat>=MCP-1). Build passes (1989 KB). AC4-AC6 manual tests pending Figma plugin reload. |
