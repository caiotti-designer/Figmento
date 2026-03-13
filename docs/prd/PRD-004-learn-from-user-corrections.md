# PRD-004: Learn from User Corrections

**Status:** Draft
**Author:** @pm (Morgan)
**Date:** 2026-03-12
**Architecture by:** @architect (Aria)
**Epic:** LC — Learning & Corrections
**Priority:** High
**Target milestone:** M7 — Intelligence Phase 4

---

## 1. Problem Statement

Figmento repeats the same design choices every session. When a user manually edits AI-generated output — adjusting font sizes, swapping colors, changing corner radii, rearranging layout spacing — those corrections are lost. The next time the user asks for a similar design, the AI makes the same "wrong" choices, forcing the user to correct again.

This is the #1 friction source for power users who have established design preferences but must re-teach them every session.

### Evidence

- System prompt injects palette/font/blueprint recommendations, but these come from static knowledge files — not from the user's actual editing behavior.
- The `design-feedback` clientStorage key already exists in `code.ts` (lines 299–309) but is never read back or analyzed.
- Memory entries (`figmento-memory`) persist user preference notes (e.g., "User prefers serif fonts"), but these are AI-generated guesses — never grounded in observed edits.
- No mechanism exists to compare "what the AI created" vs. "what the user changed it to."

### Opportunity

Figmento already has the persistence layer (clientStorage), the injection points (system prompt), and the feedback skeleton. The missing piece is: **delta detection** (what changed?) + **aggregation** (is this a pattern?) + **preference injection** (tell the AI).

---

## 2. Vision

> Figmento learns from what you do, not just what you say. After 3 consistent corrections in the same direction, the AI adapts — automatically using your preferred font sizes, color choices, and spacing patterns.

### User Experience

1. User creates a design via AI
2. User manually edits it in Figma (bigger headline, different accent color, more padding)
3. User clicks "Learn from my edits" in the plugin — OR — the AI detects the edits on the next turn
4. Figmento compares before vs. after, extracts the delta
5. After N≥3 consistent corrections, the preference is stored
6. Next design session: the AI sees "User prefers headlines ≥80px on social posts" in its system prompt
7. User gets a design closer to their taste with zero re-teaching

---

## 3. Goals & Non-Goals

### Goals

| # | Goal | Success Metric |
|---|------|----------------|
| G1 | Detect user's manual edits to AI-generated designs | ≥80% of meaningful edits detected (font size, color, spacing, corner radius) |
| G2 | Aggregate corrections into durable preferences | Preferences persist across sessions via clientStorage |
| G3 | Inject preferences into AI system prompt | AI references learned preferences in ≥90% of subsequent designs |
| G4 | Maintain user trust through transparency | 100% of learned preferences visible and editable in UI |
| G5 | Zero false positives in production | No preference created from accidental nudges or sub-threshold changes |

### Non-Goals

| # | Non-Goal | Reason |
|---|----------|--------|
| NG1 | Real-time change detection via Figma API events | Figma has no change event API — all detection is snapshot-based |
| NG2 | Learning layout structure preferences | Too complex for Phase 4 — layout is multi-dimensional. Defer to Phase 5. |
| NG3 | Cross-file preference sync | Per-file storage first. Cross-file sync requires cloud backend (out of scope). |
| NG4 | Automatic preference application without user awareness | Must be opt-in. Preferences panel shows what's learned. |
| NG5 | Learning from non-AI-generated designs | Only compare AI output vs. user edits. Manual designs from scratch are not tracked. |

---

## 4. Architectural Constraints (from @architect)

These decisions are locked. Implementation stories must not deviate.

### C1 — Snapshot-Based Detection Only

Figma's Plugin API has **no change event listener**. The plugin cannot subscribe to `node.on('change')`. All correction detection must work by comparing two snapshots of the same node tree taken at different times.

**Implication:** The plugin takes a "before" snapshot after AI creates/modifies a node, then takes an "after" snapshot when triggered (explicitly or on next AI turn). The diff calculator runs on these two snapshots.

### C2 — Depth-1 Snapshots Only

Snapshots capture the root frame and its **direct children only** (depth 1). Recursively snapshotting an entire tree is too expensive for large designs (100+ nodes) and creates noise from deeply nested structural changes.

**Captured per node:**
```typescript
interface NodeSnapshot {
  id: string;
  name: string;
  type: string;                    // FRAME, TEXT, RECTANGLE, ELLIPSE
  x: number; y: number;
  width: number; height: number;
  fills: SerializedFill[];         // color hex + opacity
  fontSize?: number;               // TEXT nodes only
  fontFamily?: string;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  characters?: string;             // TEXT nodes only
  cornerRadius?: number;
  opacity: number;
  strokeWeight?: number;
  strokeColor?: string;
  effects?: SerializedEffect[];    // shadows, blurs
  layoutMode?: string;             // NONE, HORIZONTAL, VERTICAL
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
}
```

### C3 — Snapshot Expiry

Snapshots expire after **10 minutes** or on **page change** (`figma.on('currentpagechange')`). Stale snapshots are discarded — they can't be meaningfully compared if the user has done significant unrelated work.

### C4 — Minimum Delta Thresholds

To avoid false positives from accidental drags or sub-pixel rounding:

| Property | Min Delta | Rationale |
|----------|-----------|-----------|
| `width`, `height` | 8px | Below 8px is likely accidental resize |
| `x`, `y` | 8px | Below 8px is likely accidental drag |
| `fontSize` | 2px | Font size changes < 2px are rounding artifacts |
| `fills` (color) | ΔR+ΔG+ΔB ≥ 30 (sum of per-channel diffs) | #10 per channel minimum — avoids anti-aliasing noise |
| `cornerRadius` | 2px | Sub-2px is not an intentional choice |
| `opacity` | 0.05 | 5% opacity change minimum |
| `fontWeight` | 100 | One weight step (400→500) |
| `itemSpacing`, `padding*` | 4px | Half a grid unit |
| `letterSpacing` | 0.01em | Sub-0.01em is imperceptible |
| `lineHeight` | 2px | Below 2px is rounding |

### C5 — Opt-In Only

The system must **never silently learn**. Two trigger modes:

1. **Explicit:** User clicks "Learn from my edits" button in plugin UI
2. **Automatic (opt-in):** User enables "Auto-detect corrections" toggle in Settings. When enabled, the system compares snapshots at the start of every new AI turn.

Both modes require the toggle to be OFF by default.

### C6 — Confidence Threshold: N≥3

A preference is only created after **3 or more corrections in the same direction** within the same property category. Example:

- User increases headline fontSize 3 times across 3 designs → Preference created: "User prefers larger headlines"
- User changes primary color twice → No preference yet (N<3)

Direction consistency is required: 3 increases, or 3 decreases, or 3 changes to the same target value. Mixed directions (increase then decrease) reset the counter.

### C7 — Preference Categories

Preferences are scoped to **property + context** pairs:

| Category | Properties | Context Scope |
|----------|-----------|---------------|
| Typography | fontSize, fontFamily, fontWeight, lineHeight, letterSpacing | Per hierarchy level (display, h1, h2, body, caption) |
| Color | fills (primary, secondary, accent, background) | Per role (primary, background, text, accent) |
| Spacing | itemSpacing, padding*, margins | Per element type (root frame, card, section) |
| Shape | cornerRadius, strokeWeight | Per element type |

### C8 — Storage Architecture

```
figma.clientStorage (per-file, per-user):
├── figmento-snapshots          → Map<frameId, { snapshot: NodeSnapshot[], timestamp: number }>
├── figmento-corrections        → CorrectionEntry[] (raw deltas, max 200)
├── figmento-preferences        → LearnedPreference[] (aggregated, max 50)
└── figmento-learning-config    → { autoDetect: boolean, enabled: boolean }
```

No relay-side storage in Phase 4. Preferences travel to the relay only as system prompt text (injected at chat turn time).

---

## 5. User Stories

### US-1: Explicit Learning Trigger

**As a** designer using Figmento,
**I want to** click "Learn from my edits" after manually adjusting an AI-generated design,
**so that** the AI recognizes what I changed and remembers my preferences.

**Acceptance Criteria:**
- Button visible in plugin UI below the chat input area
- Button only active when a "before" snapshot exists for a frame on the current page
- On click: takes "after" snapshot, runs diff, shows a summary of detected changes
- Summary shows: "Detected 3 changes: headline font size 64→96px, corner radius 8→16px, accent color #3B82F6→#8B5CF6"
- User can confirm or dismiss each detected change
- Confirmed changes are stored as correction entries

### US-2: Automatic Detection on Next Turn

**As a** power user who has enabled auto-detection,
**I want** the AI to notice my edits at the start of every new turn,
**so that** I don't need to manually trigger learning.

**Acceptance Criteria:**
- "Auto-detect corrections" toggle in Settings tab (default: OFF)
- When enabled, at the start of each `runRelayTurn()` / `runDirectLoop()`, the system compares stored snapshots vs. current state
- Detected corrections are silently logged (no popup interrupting the user)
- A subtle indicator shows in the chat: "Noticed 2 edits since last design"
- User can expand to see details and dismiss false positives

### US-3: Preference Aggregation

**As a** returning user,
**I want** my repeated corrections to become learned preferences,
**so that** the AI automatically applies my style in future designs.

**Acceptance Criteria:**
- After N≥3 corrections in the same direction for the same property+context, a preference is created
- Preference format: `{ property, context, direction, value, confidence, correctionCount, createdAt, lastSeenAt }`
- Preferences are deduped — same property+context updates existing preference
- Preference confidence increases with more corrections (3=low, 5=medium, 8+=high)

### US-4: Preference Injection into System Prompt

**As an** AI agent generating designs,
**I want** the user's learned preferences in my system prompt,
**so that** I produce designs closer to what they actually want.

**Acceptance Criteria:**
- Preferences injected into system prompt after memory entries, before palette/font recommendations
- Format:
  ```
  LEARNED USER PREFERENCES (from observed corrections):
  - Headlines: prefer ≥80px font size on social media designs (confidence: high, based on 7 corrections)
  - Corner radius: prefer 16px (confidence: medium, based on 5 corrections)
  - Accent color: prefer purple tones (#8B5CF6 range) over blue (confidence: low, based on 3 corrections)
  ```
- High-confidence preferences marked as "strong suggestion"
- Low-confidence preferences marked as "consider this tendency"
- AI can still override if the brief explicitly requests something different

### US-5: Preferences UI Panel

**As a** user who wants control over what Figmento has learned,
**I want** a Preferences panel showing all learned preferences,
**so that** I can review, edit, or delete any learned pattern.

**Acceptance Criteria:**
- New "Preferences" section in Settings tab (or dedicated sub-panel)
- Lists all learned preferences with: property, learned value, confidence level, correction count, last updated
- Each preference has: edit (change the learned value), delete (remove), reset (clear correction history)
- "Clear all preferences" button with confirmation
- "Export preferences" (JSON) and "Import preferences" for sharing across files
- Toggle per-preference: enabled/disabled (disabled preferences are not injected into system prompt)

### US-6: MCP Tool — get_learned_preferences

**As a** Claude Code user working through the MCP path,
**I want** an MCP tool to query the user's learned preferences,
**so that** the AI can incorporate them when generating designs via MCP tools.

**Acceptance Criteria:**
- New MCP tool: `get_learned_preferences`
- Parameters: `{ category?: string }` (optional filter: typography, color, spacing, shape)
- Returns: list of active preferences with confidence levels
- Tool sends WS command to plugin sandbox, which reads from clientStorage and returns
- Works identically to how `read_figma_context` returns variables/styles

---

## 6. Phased Delivery

### Phase 4a — Snapshot Tracker + Diff Calculator + Explicit Trigger

**Scope:** Infrastructure layer + the explicit "Learn from my edits" button.

| Component | Work |
|-----------|------|
| Plugin sandbox (`code.ts`) | `take-snapshot` handler: captures depth-1 snapshot of a frame and stores in `figmento-snapshots` clientStorage |
| Plugin sandbox (`code.ts`) | `compare-snapshot` handler: loads stored snapshot, takes current snapshot, runs diff, returns `CorrectionEntry[]` |
| Plugin sandbox (`code.ts`) | Snapshot expiry: clear snapshots >10min old or on `currentpagechange` event |
| Plugin sandbox (`code.ts`) | Auto-snapshot hook: after any successful `create_frame`, `create_text`, `set_fill`, etc. command, auto-save a snapshot of the affected root frame |
| Shared types | `NodeSnapshot`, `CorrectionEntry`, `SnapshotDiff` type definitions |
| Diff calculator (new util) | `calculateDiff(before: NodeSnapshot[], after: NodeSnapshot[]): CorrectionEntry[]` — pure function, applies min delta thresholds from C4 |
| Plugin UI (`ui.html`) | "Learn from my edits" button below chat input, active only when snapshots exist |
| Plugin UI (`chat.ts`) | On button click: send `compare-snapshot` to sandbox, display diff summary, allow confirm/dismiss per change |
| Plugin sandbox (`code.ts`) | `save-corrections` handler: store confirmed `CorrectionEntry[]` in `figmento-corrections` clientStorage |

**Definition of Done:**
- User creates a design via AI
- User manually edits the design in Figma
- User clicks "Learn from my edits"
- Plugin shows: "Detected N changes: [list]"
- User confirms changes
- Changes stored in clientStorage
- Snapshots expire correctly (10min + page change)
- Build passes, existing functionality unaffected

**Stories:** 4–5 dev stories estimated

### Phase 4b — Auto-Detection + Aggregation + Preference Store

**Scope:** Automatic detection on AI turn + preference creation from repeated corrections.

| Component | Work |
|-----------|------|
| Plugin UI (`chat.ts`) | Before each `runRelayTurn()` / `runDirectLoop()`: if auto-detect enabled, send `compare-snapshot` and log corrections silently |
| Plugin UI (`chat.ts`) | Subtle notification in chat: "Noticed N edits since last design" with expandable details |
| Plugin UI (Settings) | "Auto-detect corrections" toggle in Settings tab (default: OFF), stored in `figmento-learning-config` |
| Plugin sandbox (`code.ts`) | `aggregate-preferences` handler: analyze `figmento-corrections` for patterns — same property+context corrected N≥3 times in same direction → create `LearnedPreference` |
| Preference engine (new util) | `aggregateCorrections(corrections: CorrectionEntry[]): LearnedPreference[]` — pure function, groups by property+context, checks direction consistency, calculates confidence |
| Plugin sandbox (`code.ts`) | `get-preferences` handler: read `figmento-preferences` from clientStorage |
| Plugin sandbox (`code.ts`) | `save-preferences` handler: write `figmento-preferences` to clientStorage |
| Shared types | `LearnedPreference`, `PreferenceCategory`, `ConfidenceLevel` type definitions |

**Definition of Done:**
- Auto-detect toggle works in Settings (default OFF)
- When ON: corrections detected silently at start of each AI turn
- After 3+ corrections in same direction: preference created
- Preferences stored in `figmento-preferences` clientStorage
- Confidence levels: 3=low, 5=medium, 8+=high
- Aggregation dedupes (same property+context updates existing)
- Build passes, no regression in chat flow

**Stories:** 3–4 dev stories estimated

### Phase 4c — Preference Injection + MCP Tool + Preferences UI

**Scope:** Wire preferences into the AI loop + user-facing management.

| Component | Work |
|-----------|------|
| Plugin UI (`system-prompt.ts`) | Load preferences from sandbox, format as system prompt section, inject after memory entries |
| Relay (`system-prompt.ts`) | Accept `preferences` field in `ChatTurnRequest`, inject into server-side system prompt |
| Plugin UI (`chat.ts`) | Pass preferences to relay in `runRelayTurn()` body |
| MCP server (new tool) | `get_learned_preferences` tool: sends WS command `get-preferences` to plugin, returns formatted list |
| MCP server (schema) | Zod schema for `get_learned_preferences` (optional `category` filter) |
| Plugin UI (new panel) | Preferences panel in Settings: list, edit, delete, toggle, clear all |
| Plugin UI (new panel) | Export/Import preferences as JSON |
| Plugin sandbox (`code.ts`) | `update-preference` handler: edit single preference |
| Plugin sandbox (`code.ts`) | `delete-preference` handler: remove single preference |
| Plugin sandbox (`code.ts`) | `clear-preferences` handler: remove all preferences |

**Definition of Done:**
- AI system prompt includes learned preferences section
- Preferences formatted with confidence levels and natural language
- MCP tool `get_learned_preferences` works via WS bridge
- Preferences panel shows all learned patterns
- User can edit, delete, toggle, clear preferences
- Export/Import JSON works
- High-confidence preferences produce measurably different AI output (manual verification)
- Build passes, all existing tests green

**Stories:** 5–6 dev stories estimated

---

## 7. Data Model

### NodeSnapshot

```typescript
interface NodeSnapshot {
  id: string;
  name: string;
  type: 'FRAME' | 'TEXT' | 'RECTANGLE' | 'ELLIPSE' | 'GROUP' | 'COMPONENT' | 'INSTANCE';
  x: number;
  y: number;
  width: number;
  height: number;
  fills: Array<{ type: string; color?: string; opacity?: number }>;
  opacity: number;
  cornerRadius?: number;
  // Text-specific
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  characters?: string;
  // Layout-specific
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  // Stroke
  strokeWeight?: number;
  strokeColor?: string;
  // Effects
  effects?: Array<{ type: string; color?: string; offset?: { x: number; y: number }; radius?: number }>;
}
```

### CorrectionEntry

```typescript
interface CorrectionEntry {
  id: string;                          // UUID
  frameId: string;                     // Root frame that was AI-generated
  nodeId: string;                      // Specific child node that was edited
  nodeName: string;                    // For display ("Hero Title", "CTA Button")
  nodeType: string;                    // FRAME, TEXT, RECTANGLE, etc.
  property: string;                    // fontSize, fills.0.color, cornerRadius, etc.
  category: 'typography' | 'color' | 'spacing' | 'shape';
  context: string;                     // Hierarchy context: "display", "h1", "body", "root-frame", "card", etc.
  beforeValue: unknown;                // Value the AI set
  afterValue: unknown;                 // Value the user changed to
  direction: 'increase' | 'decrease' | 'change'; // For numeric: increase/decrease. For color/font: change
  magnitude: number;                   // Absolute delta (e.g., 32 for fontSize 64→96)
  timestamp: number;                   // Unix ms
  confirmed: boolean;                  // User confirmed this was intentional
}
```

### LearnedPreference

```typescript
interface LearnedPreference {
  id: string;                          // UUID
  property: string;                    // fontSize, fills.0.color, cornerRadius, etc.
  category: 'typography' | 'color' | 'spacing' | 'shape';
  context: string;                     // "display", "h1", "body", "root-frame", "card"
  direction: 'increase' | 'decrease' | 'change';
  learnedValue?: unknown;              // Target value if consistent (e.g., always 96px)
  learnedRange?: { min: unknown; max: unknown }; // Range if varies (e.g., 80–120px)
  description: string;                 // Human-readable: "Prefers headline font size ≥80px"
  confidence: 'low' | 'medium' | 'high';
  correctionCount: number;             // How many corrections contributed
  correctionIds: string[];             // References to CorrectionEntry IDs
  enabled: boolean;                    // User can disable without deleting
  createdAt: number;                   // Unix ms
  lastSeenAt: number;                  // Last correction that reinforced this
}
```

### LearningConfig

```typescript
interface LearningConfig {
  enabled: boolean;                    // Master switch for the feature
  autoDetect: boolean;                 // Auto-detect on AI turn (requires enabled=true)
  confidenceThreshold: number;         // Min corrections before preference (default: 3)
}
```

---

## 8. System Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ FIGMA CANVAS                                                            │
│                                                                         │
│  AI creates design → [auto-snapshot taken]                              │
│  User edits manually                                                    │
│  "Learn from my edits" OR next AI turn                                  │
│                                                                         │
└────────────────────────┬────────────────────────────────────────────────┘
                         │ postMessage
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PLUGIN SANDBOX (code.ts)                                                │
│                                                                         │
│  take-snapshot → depth-1 capture → figma.clientStorage (snapshots)      │
│  compare-snapshot → load before + capture after → diffCalculator()      │
│  save-corrections → figma.clientStorage (corrections)                   │
│  aggregate-preferences → correctionAggregator() → clientStorage (prefs) │
│  get-preferences → read from clientStorage → return to UI               │
│                                                                         │
└────────────────────────┬────────────────────────────────────────────────┘
                         │ postMessage
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PLUGIN UI (chat.ts, system-prompt.ts)                                   │
│                                                                         │
│  Loads preferences → formats as prompt text                             │
│  Injects into system prompt OR passes to relay as request field         │
│  "Learn from my edits" button → triggers compare-snapshot               │
│  Settings: auto-detect toggle, preferences panel                        │
│                                                                         │
└────────────────────────┬────────────────────────────────────────────────┘
                         │ HTTP POST / WebSocket
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ RELAY (chat-engine.ts) / MCP SERVER (intelligence tools)                │
│                                                                         │
│  Receives preferences as text in request → injects into system prompt   │
│  get_learned_preferences MCP tool → WS command → sandbox → response     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Where Code Lives

| Layer | File | New Code |
|-------|------|----------|
| Shared types | `figmento/src/types.ts` | `NodeSnapshot`, `CorrectionEntry`, `LearnedPreference`, `LearningConfig` |
| Diff calculator | `figmento/src/utils/diff-calculator.ts` | Pure function, testable in isolation |
| Correction aggregator | `figmento/src/utils/correction-aggregator.ts` | Pure function, testable in isolation |
| Plugin sandbox | `figmento/src/code.ts` | 6 new message handlers |
| Plugin UI | `figmento/src/ui/chat.ts` | "Learn" button, auto-detect hook, preference loading |
| Plugin UI | `figmento/src/ui/system-prompt.ts` | Preference injection section |
| Plugin UI | `figmento/src/ui/preferences-panel.ts` | New panel component |
| Plugin UI | `figmento/src/ui/chat-settings.ts` | Auto-detect toggle |
| Relay | `figmento-ws-relay/src/chat/system-prompt.ts` | Accept + inject preferences |
| Relay | `figmento-ws-relay/src/chat/chat-endpoint.ts` | Pass preferences field through |
| MCP server | `figmento-mcp-server/src/tools/intelligence.ts` | `get_learned_preferences` tool |

---

## 9. Risks & Mitigations

| # | Risk | Severity | Probability | Mitigation |
|---|------|----------|-------------|------------|
| R1 | **False positives** — accidental drags or rounding create noise | High | Medium | Min delta thresholds (C4) + user confirmation on explicit trigger + dismiss on auto-detect |
| R2 | **Conflicting preferences** — user increases font size on social posts but decreases on presentations | Medium | Medium | Scope preferences to property+context (C7). Social post fontSize is a different preference than presentation fontSize. |
| R3 | **Stale preferences** — user's style evolves but old preferences persist | Medium | High | Show `lastSeenAt` in UI. Preferences not reinforced in 30 days get demoted to "low" confidence. User can delete anytime. |
| R4 | **Snapshot storage bloat** — too many frames tracked | Low | Low | Max 10 active snapshots. FIFO eviction. Snapshots expire at 10min. |
| R5 | **Performance impact on AI turn** — auto-detect adds latency | Medium | Medium | Diff calculation is pure JS on <20 nodes (depth 1). Expected <5ms. If >50ms, skip and log warning. |
| R6 | **User distrust** — "the AI is watching my edits" | High | Low | Feature is OFF by default. Explicit opt-in. Clear UI showing what's learned. Full control to edit/delete. |
| R7 | **Preference injection dilutes system prompt** — too many preferences confuse the AI | Medium | Medium | Max 10 active preferences injected. Ordered by confidence (high first). Over 10: only inject high+medium. |
| R8 | **Cross-session context loss** — clientStorage cleared or plugin reinstalled | Low | Low | Export/Import JSON backup. Document that preferences are per-file, per-user. |

---

## 10. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Correction detection accuracy | ≥80% of meaningful edits detected | Manual QA: create design, make 10 known edits, verify ≥8 detected |
| False positive rate | <10% of detected changes are noise | Manual QA: count unintentional changes detected |
| Preference creation accuracy | N≥3 rule consistently applied | Unit tests on aggregation engine |
| User satisfaction (qualitative) | Users report "AI remembers my style" | Manual testing with 3+ correction cycles |
| Performance overhead | <50ms added to AI turn start | Performance logging in auto-detect path |
| Preference injection coverage | ≥90% of designs reference preferences | Check system prompt includes preferences section |

---

## 11. Open Questions

| # | Question | Owner | Status |
|---|----------|-------|--------|
| Q1 | Should preferences transfer when duplicating a Figma file? | @architect | Open — clientStorage is per-file, so duplicates get a copy. Verify behavior. |
| Q2 | Should the relay store preferences server-side for cross-device sync? | @pm | Deferred to Phase 5. Per-file clientStorage is sufficient for Phase 4. |
| Q3 | How to handle conflicting preferences from different team members on the same file? | @architect | Open — clientStorage is per-user, so no conflict. But shared preferences (Phase 5) would need resolution. |
| Q4 | Should corrections from the MCP path (Claude Code) also trigger learning? | @architect | Phase 4: No. MCP path doesn't have the "before" snapshot. Phase 5: Consider adding snapshot commands to MCP. |
| Q5 | What happens when a preference contradicts the brief? (e.g., user prefers blue but brief says "warm tones") | @pm | Brief wins. Preference injection text says "unless the brief explicitly requests otherwise." |

---

## 12. Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| DS-1 (design-system monolith split) | Story | Done — utils extracted, module boundaries clean |
| Plugin sandbox message handlers | Existing | Working — `save-memory`, `save-feedback` patterns exist |
| clientStorage API | Figma Platform | Stable — async, JSON-serializable, per-user per-plugin |
| System prompt injection | Existing | Working — `buildBriefInjection()` + memory injection |
| Relay chat endpoint | Existing | Working — accepts memory field, can accept preferences |

---

## 13. Appendix: Preference Injection Format

The following text block is injected into the system prompt when preferences exist:

```
═══════════════════════════════════════════════
LEARNED USER PREFERENCES
(From observed corrections — apply unless brief explicitly overrides)
═══════════════════════════════════════════════

TYPOGRAPHY:
  • Display headlines: prefer ≥96px (high confidence — 8 corrections)
  • Body text line-height: prefer 1.6× multiplier (medium confidence — 5 corrections)
  • Font family: tend toward Cormorant Garamond for headings (low confidence — 3 corrections)

COLOR:
  • Accent color: prefer purple range (#8B5CF6–#7C3AED) over default blue (medium confidence — 5 corrections)
  • Background: prefer near-black (#0A0A0F) over dark gray (high confidence — 9 corrections)

SPACING:
  • Root frame padding: prefer 64px over 48px (medium confidence — 4 corrections)
  • Card corner radius: prefer 16px (high confidence — 7 corrections)

Note: These preferences reflect the user's editing patterns. High confidence = strong signal.
Apply them as defaults, but the current brief takes priority if it specifies different values.
```

---

## 14. Timeline Estimate

| Phase | Stories | Estimated Effort | Dependencies |
|-------|---------|-----------------|--------------|
| 4a — Snapshot + Diff + Explicit Trigger | 4–5 | 1 sprint | None |
| 4b — Auto-Detect + Aggregation + Preferences | 3–4 | 1 sprint | 4a complete |
| 4c — Injection + MCP Tool + UI Panel | 5–6 | 1.5 sprints | 4b complete |
| **Total** | **12–15** | **~3.5 sprints** | |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-12 | @pm (Morgan) | PRD created. Architecture constraints from @architect assessment locked. 3-phase delivery plan defined. |

---

*— Morgan, planejando o futuro 📊*
