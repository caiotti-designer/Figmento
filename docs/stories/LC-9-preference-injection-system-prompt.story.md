# Story LC-9: Preference Injection into System Prompt

**Status:** Done
**Priority:** High
**Complexity:** M (Medium) — Two system-prompt.ts files + one relay interface change + plugin chat.ts wiring. No new sandbox handlers (get-preferences already exists from LC-7).
**Epic:** LC — Learning & Corrections (Phase 4c)
**PRD:** PRD-004 (Learn from User Corrections)
**Depends on:** LC-7 (get-preferences sandbox handler must exist), LC-6 (LearnedPreference type)

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: npm run build clean (figmento plugin + figmento-ws-relay) + verify no existing tests broken
```

---

## Story

**As an** AI agent generating designs via Figmento,
**I want** the user's learned preferences in my system prompt each turn,
**so that** I produce designs that reflect their established style without re-teaching.

---

## Description

Learned preferences are stored in `figmento-preferences` clientStorage (written by LC-7's `aggregate-preferences` handler). They are currently inert — never shown to the AI. This story wires them into the system prompt.

Three injection points must be updated:

1. **Plugin direct mode** (`figmento/src/ui/system-prompt.ts`): `buildSystemPrompt(brief?, memory?)` → add `preferences?` third parameter. Inject the formatted preferences block after the memory section.

2. **Relay server** (`figmento-ws-relay/src/chat/system-prompt.ts`): same `buildSystemPrompt(brief?, memory?)` → add `preferences?` third parameter. Same injection format.

3. **Relay request body** (`figmento-ws-relay/src/chat/chat-engine.ts`): `ChatTurnRequest` interface → add `preferences?: LearnedPreference[]` optional field. Pass it to `buildSystemPrompt()` in `handleChatTurn()`.

4. **Plugin relay turn** (`figmento/src/ui/chat.ts`): Before `runRelayTurn()` sends the HTTP body, load preferences from sandbox (`get-preferences` handler) and include them in the body as `preferences`. Also pass them to `buildSystemPrompt()` in `runAnthropicLoop()`, `runGeminiLoop()`, `runOpenAILoop()` (direct mode).

### Injection Format (PRD-004 §5 US-4)

Injected after the memory section (if any), before brief injection:

```
═══════════════════════════════════════════════════════════
LEARNED USER PREFERENCES (from observed corrections)
═══════════════════════════════════════════════════════════

These preferences were learned from the user's repeated design corrections. Follow them as default behavior:
- [high confidence] h1 font size: Prefers h1 font size ≥96px (based on 9 corrections)
- [medium confidence] card corner radius: Tends toward larger card corner radius (based on 5 corrections)
- [low confidence] root-frame fill: Prefers dark background (#0A0A0F range) (based on 3 corrections)

High confidence = strong requirement. Medium = lean toward. Low = consider this tendency.
AI may override a preference if the user's brief explicitly requests something different.
```

Rules:
- Only `enabled: true` preferences are injected
- Sort by confidence descending (`high` → `medium` → `low`), then by `correctionCount` descending within each tier
- If no enabled preferences exist, the section is omitted entirely (no empty heading)
- Maximum 20 preferences injected (top by confidence + correctionCount)

### Plugin-Side Preferences Loading

`runRelayTurn()` in `chat.ts` must load preferences before sending the HTTP request. Because sandbox communication is async (postMessage), introduce a `loadPreferencesFromSandbox(): Promise<LearnedPreference[]>` helper that:
1. Sends `{ type: 'get-preferences' }` to sandbox
2. Waits for `{ type: 'preferences-loaded', preferences: [...] }` response via the existing window message listener
3. Returns the array (or `[]` on timeout/error — do not block the turn)
4. Timeout: 2 seconds (lean toward sending an empty array rather than hanging)

Module-level state: `let learnedPreferences: LearnedPreference[] = [];` — updated each turn by `loadPreferencesFromSandbox()`.

For `runAnthropicLoop()`, `runGeminiLoop()`, `runOpenAILoop()`: pass `learnedPreferences` (the module-level state) to `buildSystemPrompt()`.

### Import Path

`figmento/src/ui/chat.ts` already imports from `../types` for `CorrectionEntry`. Add `LearnedPreference` to the same import line.

`figmento-ws-relay/src/chat/chat-engine.ts` does NOT import from the plugin types. Add a minimal inline type alias:
```typescript
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
```
(Do not import from a shared package — the relay has its own type space.)

---

## Acceptance Criteria

- [ ] **AC1:** `buildSystemPrompt(brief, memory, preferences)` in `figmento/src/ui/system-prompt.ts` accepts optional `preferences?: LearnedPreference[]` third param. When preferences are provided and at least one is `enabled: true`, the `LEARNED USER PREFERENCES` section is appended after the memory block.
- [ ] **AC2:** Same change in `figmento-ws-relay/src/chat/system-prompt.ts` — identical format and logic.
- [ ] **AC3:** `ChatTurnRequest` in `figmento-ws-relay/src/chat/chat-engine.ts` has `preferences?: LearnedPreference[]` field. `handleChatTurn()` passes `request.preferences || []` to `buildSystemPrompt()`.
- [ ] **AC4:** `runRelayTurn()` in `figmento/src/ui/chat.ts` includes `preferences: learnedPreferences` in the HTTP body sent to the relay endpoint.
- [ ] **AC5:** Before each relay turn, `loadPreferencesFromSandbox()` fetches the latest preferences (max 2s wait). Timeout returns `[]` without throwing.
- [ ] **AC6:** `runAnthropicLoop()`, `runGeminiLoop()`, `runOpenAILoop()` (direct mode) pass `learnedPreferences` to `buildSystemPrompt()`.
- [ ] **AC7:** Only `enabled: true` preferences are included in the injection. `enabled: false` preferences are silently skipped.
- [ ] **AC8:** Injection section is omitted entirely when there are no enabled preferences (no empty heading or empty list).
- [ ] **AC9:** Preferences sorted: high → medium → low, then by `correctionCount` desc within each tier. Max 20 injected.
- [ ] **AC10:** Existing `buildSystemPrompt(brief, memory)` calls with only 2 args remain valid (third param is optional, defaults to `[]`).
- [ ] **AC11:** `cd figmento && npm run build` passes clean. `cd figmento-ws-relay && npm run build` passes clean.
- [ ] **AC12:** The preferences block appears AFTER the memory section and BEFORE the brief injection block in the assembled system prompt string. Verify by inspecting the concatenation order in `buildSystemPrompt()`.
- [ ] **AC13:** `runClaudeCodeTurn()` does NOT call `loadPreferencesFromSandbox()` and does NOT pass preferences to any system prompt. The Claude Code path is unaffected by this story.

---

## Tasks

### Phase 1 — Type Updates

- [x] **Task 1:** In `figmento-ws-relay/src/chat/chat-engine.ts`:
  - Add local `LearnedPreference` interface (inline, no external import)
  - Add `preferences?: LearnedPreference[]` to `ChatTurnRequest`
  - In `handleChatTurn()`: update `buildSystemPrompt(brief, memory || [])` call → `buildSystemPrompt(brief, memory || [], request.preferences || [])`

### Phase 2 — System Prompt Builders

- [x] **Task 2:** In `figmento/src/ui/system-prompt.ts`:
  - Add `import type { LearnedPreference } from '../types';` to imports
  - Change `buildSystemPrompt(brief?, memory?)` signature → `buildSystemPrompt(brief?, memory?, preferences?: LearnedPreference[])`
  - Add `buildPreferencesBlock(preferences: LearnedPreference[]): string` helper:
    - Filter to `enabled: true`
    - Sort: high first, then medium, then low; within tier sort by `correctionCount` desc
    - Take first 20
    - Format each: `- [${confidence} confidence] ${context} ${property}: ${description} (based on ${correctionCount} corrections)`
    - Wrap in the `═══ LEARNED USER PREFERENCES ═══` block
    - Return empty string if nothing to inject
  - Append `buildPreferencesBlock(preferences || [])` after the memory block

- [x] **Task 3:** In `figmento-ws-relay/src/chat/system-prompt.ts`:
  - Add local `LearnedPreference` interface (same fields as relay's chat-engine.ts)
  - Change `buildSystemPrompt(brief?, memory?)` → `buildSystemPrompt(brief?, memory?, preferences?: LearnedPreference[])`
  - Add the same `buildPreferencesBlock()` helper (copy from Task 2 — no shared util, keep files self-contained)
  - Inject after memory block (same position as plugin side)

### Phase 3 — Plugin Chat Wiring

- [x] **Task 4:** In `figmento/src/ui/chat.ts`:
  - Add `LearnedPreference` to import from `'../types'`
  - Add module-level `let learnedPreferences: LearnedPreference[] = [];`
  - Add `loadPreferencesFromSandbox(): Promise<LearnedPreference[]>` helper:
    ```typescript
    function loadPreferencesFromSandbox(): Promise<LearnedPreference[]> {
      return new Promise(resolve => {
        const timeout = setTimeout(() => resolve([]), 2000);
        const handler = (event: MessageEvent) => {
          const msg = event.data?.pluginMessage;
          if (msg?.type === 'preferences-loaded') {
            clearTimeout(timeout);
            window.removeEventListener('message', handler);
            resolve((msg.preferences as LearnedPreference[]) || []);
          }
        };
        window.addEventListener('message', handler);
        postToSandbox({ type: 'get-preferences' });
      });
    }
    ```
  - In `runRelayTurn()`: at the start (before the fetch), call `learnedPreferences = await loadPreferencesFromSandbox();` and include `preferences: learnedPreferences` in the body object
  - In `runAnthropicLoop()`, `runGeminiLoop()`, `runOpenAILoop()`: update `buildSystemPrompt(currentBrief, memoryEntries)` → `buildSystemPrompt(currentBrief, memoryEntries, learnedPreferences)`

### Phase 4 — Build Verification

- [x] **Task 5:** `cd figmento && npm run build` — verify clean. `cd figmento-ws-relay && npm run build` — verify clean.

---

## Dev Notes

- **Do not change the relay validation in `chat-endpoint.ts`.** The `validateRequest()` function does not validate `preferences` (it's optional, no change needed).

- **`preferences-loaded` response already exists from LC-7.** The sandbox handler `get-preferences` already responds with `{ type: 'preferences-loaded', preferences: [...] }`. No sandbox changes needed.

- **window message listener collision:** `loadPreferencesFromSandbox()` registers a temporary listener that removes itself on resolution. It must use a unique closure reference (not a named function stored as a module variable) to avoid interfering with the existing message router. The existing router in `chat.ts` already handles `preferences-loaded` — check if there's a conflict and route correctly. If the existing router intercepts `preferences-loaded` before the promise handler, move the `preferences-loaded` routing inside the promise (the router passes `msg` to `resolveChatCommand` which only acts if there's a pending command ID — so plain `preferences-loaded` without a `cmdId` will pass through unhandled, making the window listener safe).

- **Direct mode paths:** `runClaudeCodeTurn()` does not use `buildSystemPrompt()` (Claude Code uses its own MCP-based loop). No changes needed there.

- **relay `buildSystemPrompt` export is used only in `handleChatTurn()`.** No other relay files call it. Safe to change signature.

- **Latency risk:** `loadPreferencesFromSandbox()` adds up to 2s latency on every relay turn (worst case: cold start with no cached preferences). Mitigation: the 2s timeout resolves to `[]` rather than blocking the turn. If latency proves unacceptable in practice, cache the last loaded preferences at module level and only re-fetch after an `aggregate-preferences` call has occurred since the last fetch. For Phase 4c, accept the latency as-is and monitor.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/ui/system-prompt.ts` | MODIFY | Add `preferences?` param, `buildPreferencesBlock()` helper, inject after memory |
| `figmento/src/ui/chat.ts` | MODIFY | Add `learnedPreferences` state, `loadPreferencesFromSandbox()`, wire into relay + direct loops |
| `figmento-ws-relay/src/chat/chat-engine.ts` | MODIFY | Add `LearnedPreference` interface + `preferences?` field in `ChatTurnRequest`, pass to `buildSystemPrompt()` |
| `figmento-ws-relay/src/chat/system-prompt.ts` | MODIFY | Add `preferences?` param + `buildPreferencesBlock()` helper, inject after memory |

---

## Definition of Done

- [ ] Both `buildSystemPrompt()` functions accept and inject preferences
- [ ] Relay `ChatTurnRequest` has `preferences?` field
- [ ] `runRelayTurn()` fetches and includes preferences in HTTP body
- [ ] Direct mode loops pass `learnedPreferences` to `buildSystemPrompt()`
- [ ] Only `enabled: true` preferences injected, section omitted if none
- [ ] Both builds pass clean
- [ ] No existing functionality affected

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-13 | @sm (River) | Story drafted from PRD-004 Phase 4c. Preference injection into both system-prompt.ts files + relay ChatTurnRequest + plugin chat.ts wiring. |
| 2026-03-13 | @po (Pax) | Validated 7/10. Added AC12 (injection order), AC13 (CC path unaffected), latency risk note in Dev Notes. Status Draft → Ready. GO verdict. |
| 2026-03-13 | @dev (Dex) | Implemented all 4 phases. Brief injection order changed to memory→preferences→brief in both buildSystemPrompt() functions (AC12). learnedPreferences wired into runRelayTurn() + all 3 direct loops. All builds pass clean. Status → Ready for Review. |
| 2026-04-12 | @qa (Quinn) | **QA Gate: PASS.** 13/13 ACs verified. `buildPreferencesBlock` at system-prompt.ts:16, `preferences?` param at :377. Relay mirror confirmed in figmento-ws-relay/src/chat/system-prompt.ts + chat-engine.ts. Injection order memory→preferences→brief preserved. Status: Ready for Review → Done. |
