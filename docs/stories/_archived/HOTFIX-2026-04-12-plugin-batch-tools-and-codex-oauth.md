# HOTFIX-2026-04-12: Batch Tools Expansion + Codex OAuth Hardening + GPT-5.4 Models

| Field | Value |
|-------|-------|
| **Hotfix ID** | HOTFIX-2026-04-12 |
| **Type** | Untracked dev work — retroactive documentation |
| **Author** | @dev (direct implementation, no story) |
| **Logged by** | @qa (Quinn) — flagged during 2026-04-12 batch QA session |
| **Status** | Shipped — committed in `088df66` (2026-04-12) |
| **Risk** | LOW — additive changes + bug fixes |
| **Branch** | feat/ad-analyzer-bridge-chat-core |

---

## Why This Doc Exists

These changes were implemented directly by @dev outside the standard story workflow (no @sm draft, no @po validation). Quinn flagged them during the LC epic batch gate session because they would otherwise be invisible to the audit trail. This document retroactively records what's in the working tree so future work can reference it.

**Action required:** @dev should commit these as a hotfix; @devops should push. No story file needed — this is bug-fix + integration work that shipped under "quick implements with dev no stories" mode.

---

## Files Changed (11 files, +371 / -31 lines)

### Plugin Sandbox

**[figmento/src/handlers/canvas-batch.ts](../../figmento/src/handlers/canvas-batch.ts)** (+5 lines)
- Wires 4 ODS Phase B tools into `executeSingleAction` so they work inside `batch_execute`:
  - `create_variable_collections`
  - `create_text_styles`
  - `create_ds_components`
  - `scan_frame_structure`
- Imports added to existing `canvas-query` import line

**[figmento/src/handlers/canvas-query.ts](../../figmento/src/handlers/canvas-query.ts)** (+2 / -1 line)
- Bug fix in `handleScanFrameStructure`: handles `figma.mixed` on `strokeWeight` — falls back to `1` instead of crashing on mixed-stroke nodes

### Plugin UI

**[figmento/src/ui.html](../../figmento/src/ui.html)** (+5 / -5 lines)
- Model dropdown refresh in chat header:
  - **OpenAI:** removed `gpt-5.2`, `gpt-5-mini` → added `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`
  - **Codex:** removed `gpt-5-codex`, `gpt-5.2-codex` → added `gpt-5.4-codex`, `gpt-5.4-mini-codex`, `gpt-5.3-codex`

**[figmento/src/ui/chat-settings.ts](../../figmento/src/ui/chat-settings.ts)** (+31 lines)
- DM-3 OAuth hardening — proactive token validation on plugin load:
  - Added imports: `refreshToken`, `isTokenExpired`, `isTokenExpiringSoon`
  - On plugin load, if saved Codex token is expired or expiring soon, refresh in background
  - If refresh fails, clear token and show disconnected state in UI
  - Prevents users from hitting an expired token mid-design session

**[figmento/src/ui/chat.ts](../../figmento/src/ui/chat.ts)** (+14 / -7 lines)
- DM-3 OAuth hardening — refresh retry logic in `runRelayTurn`:
  - Was: 1 attempt, no retry → throw "session expired"
  - Now: **2 attempts with 1s backoff** before throwing
  - Reduces false-positive disconnects from transient network failures

**[figmento/src/ui/oauth-flow.ts](../../figmento/src/ui/oauth-flow.ts)** (+1 / -1 line)
- `validateCodexToken` ping model bumped: `gpt-5-codex` → `gpt-5.4` (validation against current model)

### Shared Core

**[packages/figmento-core/src/types.ts](../../packages/figmento-core/src/types.ts)** (+3 / -3 lines)
- `PROVIDERS` config updated:
  - `openai.name`: `"GPT-4 Vision (OpenAI)"` → `"OpenAI"`
  - `openai.models`: `['gpt-4o']` → `['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano']`
  - `codex.models`: `['gpt-5-codex', 'gpt-5.2-codex']` → `['gpt-5.4-codex', 'gpt-5.4-mini-codex', 'gpt-5.3-codex']`

### Relay Server (figmento-ws-relay)

**[figmento-ws-relay/src/chat/chat-engine.ts](../../figmento-ws-relay/src/chat/chat-engine.ts)** (+110 lines, largest delta)
- Likely model routing for the new GPT-5.4 family + Codex variants
- Detail review deferred — out of @qa scope without a story

**[figmento-ws-relay/src/chat/chat-tools.ts](../../figmento-ws-relay/src/chat/chat-tools.ts)** (+177 lines, 2nd largest)
- Likely tool definitions for the 4 new DS pipeline tools (`create_variable_collections`, `create_text_styles`, `create_ds_components`, `scan_frame_structure`) being exposed to the relay
- Detail review deferred — out of @qa scope without a story

**[figmento-ws-relay/src/chat/claude-code-session-manager.ts](../../figmento-ws-relay/src/chat/claude-code-session-manager.ts)** (+34 lines)
- Likely session lifecycle improvements for the local Claude Code path

**[figmento-ws-relay/src/knowledge/compiled-knowledge.ts](../../figmento-ws-relay/src/knowledge/compiled-knowledge.ts)** (+2 / -2 lines, minor)
- Compiled knowledge regen — incidental

---

## Theme Summary

These changes represent **two parallel workstreams** that landed without stories:

1. **ODS Phase B → Batch DSL Integration**
   - Exposing the 4 one-click DS tools (variables, text styles, components, frame scan) so they can be called inside `batch_execute`
   - This is a natural extension of the ODS Phase B work (already Done) — the DS pipeline orchestrator can now produce its full DS in a single batched call instead of N sequential WS round-trips
   - **Should have been:** A small story under epic-ODS

2. **DM-3 Hardening + GPT-5.4 Model Refresh**
   - Codex OAuth flow gets proactive validation, retry logic, and current model validation
   - Model catalog updated to GPT-5.4 generation across UI, types, and validation
   - **Should have been:** A patch story under DM-3 (ChatGPT OAuth) + a config-only story for the model refresh

---

## Risk Assessment

| Aspect | Risk | Reasoning |
|--------|------|-----------|
| Batch tool wiring | LOW | Additive — adds 4 cases to existing switch. No existing behavior changed. |
| `figma.mixed` strokeWeight fix | LOW | Bug fix — replaces a runtime crash with a safe fallback (weight=1) |
| Model catalog refresh | LOW | Pure config change. Old model IDs would 404 on the API anyway. |
| Codex OAuth hardening | LOW-MEDIUM | More aggressive refresh + retry. Could mask legitimate auth failures behind 1s delay. Mitigated by 2-attempt cap. |
| Relay tool defs (chat-tools.ts +177 lines) | UNKNOWN | Unreviewed by @qa. Should be inspected before push. |
| Relay chat engine (+110 lines) | UNKNOWN | Unreviewed by @qa. Should be inspected before push. |

---

## Recommended Path Forward

1. **@dev:** Inspect the two large relay deltas (`chat-tools.ts` +177, `chat-engine.ts` +110) and confirm they only add the 4 tool definitions + GPT-5.4 routing — no incidental scope
2. **@dev:** Build all 3 packages clean (`npm run build` in `figmento/`, `figmento-ws-relay/`, `figmento-mcp-server/`)
3. **@dev:** Commit as a single hotfix:
   ```
   hotfix: batch DSL adds DS pipeline tools, Codex OAuth hardening, GPT-5.4 models

   - Wire create_variable_collections, create_text_styles, create_ds_components, scan_frame_structure into batch_execute
   - Fix figma.mixed strokeWeight crash in handleScanFrameStructure
   - Codex OAuth: proactive refresh on load, 2-attempt retry on turn, gpt-5.4 validation ping
   - Model catalog: GPT-5.4 family (UI dropdown, PROVIDERS config, Codex variants)
   ```
4. **@devops:** Push to feat/ad-analyzer-bridge-chat-core after @dev confirms

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-04-12 | @qa (Quinn) | Hotfix doc created retroactively. Untracked dev work flagged during LC epic batch QA session. Documents 11 files / +371 / -31 lines in working tree at the time of the audit. |
