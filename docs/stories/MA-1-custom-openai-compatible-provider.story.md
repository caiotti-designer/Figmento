# MA-1: Custom OpenAI-Compatible Provider — Model-Agnostic Chat

**Epic:** MA — Model-Agnostic Chat Support
**Status:** Ready
**Priority:** P3 (Low)
**Effort:** S (3pt)
**Owner:** @dev
**Dependencies:** None

---

## Story

**As a** Figmento user running local models (Ollama, LM Studio) or third-party OpenAI-compatible services (OpenRouter, Together, etc.),
**I want** to point the plugin's chat mode to any OpenAI-compatible endpoint,
**so that** I can use any model without API credits or vendor lock-in.

---

## Description

Today the plugin hardcodes four providers: Anthropic, Gemini, OpenAI, and Venice. Each has its own API caller in `chat-engine.ts` and its own settings fields. Any model that exposes an OpenAI-compatible `/v1/chat/completions` endpoint (Ollama, LM Studio, OpenRouter, vLLM, LocalAI, etc.) could work **without architecture changes** — the existing `callOpenAIAPI()` already speaks the right protocol.

The missing piece is a **"Custom (OpenAI-compatible)"** provider option in settings that exposes:

1. **Base URL** — e.g., `http://localhost:11434/v1` (Ollama) or `https://openrouter.ai/api/v1`
2. **Model name** — e.g., `gemma3:4b`, `llama3.2`, `mistral-7b-instruct`
3. **API key** — optional field (empty = no auth header, for local models)

The relay already has `callOpenAIAPI()` which uses fetch against `https://api.openai.com/v1/chat/completions`. The change is to make that base URL parameterizable and accept the new provider type `custom` in `ChatTurnRequest`.

### Why this is small

- `callOpenAIAPI()` already handles tool schemas in OpenAI format
- Venice provider (`callVeniceAPI()`) is already a copy of OpenAI with different URL — proves the pattern
- No changes needed in the relay WS layer, MCP server, or tool definitions
- System prompt and tool schemas are provider-agnostic

---

## Acceptance Criteria

- [ ] **AC1 — Provider option:** Settings panel shows "Custom (OpenAI-compatible)" as a selectable model/provider alongside existing options (Anthropic, Gemini, OpenAI, Venice, Claude Code).
- [ ] **AC2 — Base URL field:** When Custom provider is selected, a "Base URL" input appears with placeholder `http://localhost:11434/v1`. Value persisted to `figma.clientStorage`.
- [ ] **AC3 — Model name field:** When Custom provider is selected, a "Model Name" input appears with placeholder `gemma3:4b`. Value persisted to `figma.clientStorage`.
- [ ] **AC4 — Optional API key:** When Custom provider is selected, the API key field is shown but clearly marked as optional (helper text: "Leave empty for local models"). Empty value is valid — no auth header sent when blank.
- [ ] **AC5 — Relay request:** Plugin sends `provider: 'custom'` with `baseUrl` and `model` fields in `ChatTurnRequest`. The relay's `chat-endpoint.ts` accepts `'custom'` as a valid provider.
- [ ] **AC6 — Engine routing:** `chat-engine.ts` routes `provider: 'custom'` to a modified `callOpenAIAPI()` (or wrapper) that uses the provided `baseUrl` instead of `https://api.openai.com`. No auth header when `apiKey` is empty string.
- [ ] **AC7 — Ollama smoke test:** User selects Custom provider, enters `http://localhost:11434/v1` as base URL, `gemma3:4b` as model, leaves API key empty. Sends a message. Receives a response rendered in chat.
- [ ] **AC8 — Tool use works:** When the custom model supports tool use (function calling), MCP tools are invoked normally. When the model does not support tools, the chat degrades gracefully to text-only responses without errors.
- [ ] **AC9 — No regression:** Existing Anthropic, Gemini, OpenAI, and Venice providers continue working unchanged.

---

## Scope

**IN:**
- New "Custom" provider option in `chat-settings.ts` UI
- Base URL + model name input fields in settings
- Optional API key handling (skip Authorization header when empty)
- `ChatTurnRequest` type update to accept `provider: 'custom'` + `baseUrl`
- `ChatSettings` type update with `customBaseUrl` and `customModel` fields
- `callOpenAIAPI()` parameterization to accept custom base URL
- Plugin-side provider routing in `chat.ts`

**OUT:**
- Streaming support (existing providers also don't stream — future epic)
- Custom provider model listing/discovery (user types model name manually)
- Custom provider-specific system prompt adjustments
- Non-OpenAI-compatible APIs (e.g., custom REST formats)
- Changes to MCP server, WS relay transport, or tool definitions
- UI for testing/validating the connection before first message

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Local model doesn't support tool use / function calling | AC8 — graceful degradation: catch tool-related errors, fall back to text-only response |
| Non-standard OpenAI-compatible responses (partial compliance) | Validate only the standard `/v1/chat/completions` response shape. Document known-compatible providers in Dev Notes |
| CORS issues with local servers from plugin context | Non-issue: chat goes through the relay (Node.js fetch), not browser fetch |
| User enters wrong URL format (missing `/v1`, trailing slash) | Normalize URL in `saveChatSettings()`: trim trailing slash, validate starts with `http` |

---

## Dev Notes

### Known compatible endpoints

| Service | Base URL | API Key |
|---------|----------|---------|
| Ollama | `http://localhost:11434/v1` | Not required |
| LM Studio | `http://localhost:1234/v1` | Not required |
| OpenRouter | `https://openrouter.ai/api/v1` | Required |
| Together AI | `https://api.together.xyz/v1` | Required |
| vLLM | `http://localhost:8000/v1` | Not required |

### Implementation hint

`callVeniceAPI()` in `chat-engine.ts` is essentially `callOpenAIAPI()` with a different base URL and model prefix. The Custom provider can reuse the same code path — just parameterize the URL:

```typescript
// Before (hardcoded)
const response = await fetch('https://api.openai.com/v1/chat/completions', { ... });

// After (parameterized)
const baseUrl = request.baseUrl || 'https://api.openai.com/v1';
const response = await fetch(`${baseUrl}/chat/completions`, { ... });
```

When `apiKey` is empty, skip the `Authorization: Bearer ${apiKey}` header entirely.

### ChatSettings additions

```typescript
interface ChatSettings {
  // ... existing fields
  customBaseUrl: string;   // e.g., "http://localhost:11434/v1"
  customModel: string;     // e.g., "gemma3:4b"
}
```

### ChatTurnRequest additions

```typescript
interface ChatTurnRequest {
  // ... existing fields
  provider: 'claude' | 'gemini' | 'openai' | 'venice' | 'custom';
  baseUrl?: string;  // only used when provider === 'custom'
}
```

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/ui/chat-settings.ts` | MODIFY | Add Custom provider option, base URL field, model name field, optional API key UX |
| `figmento/src/ui/chat.ts` | MODIFY | Handle `custom` provider in model selection, pass `baseUrl` to relay request |
| `figmento-ws-relay/src/chat/chat-engine.ts` | MODIFY | Accept `baseUrl` in request, parameterize `callOpenAIAPI()` URL, skip auth header when key empty |
| `figmento-ws-relay/src/chat/chat-endpoint.ts` | MODIFY | Accept `'custom'` in provider validation |

---

## Definition of Done

- [ ] Custom provider selectable in settings UI
- [ ] Base URL and model name fields visible and persisted
- [ ] Chat works with Ollama local endpoint (manual test)
- [ ] Existing providers unaffected (AC9)
- [ ] No TypeScript errors (`npm run typecheck`)
- [ ] Lint passes (`npm run lint`)

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-04-03 | @pm (Morgan) | Story created — Draft |
| 2026-04-13 | @po (Pax) | **Validation GO — 9.5/10.** Clear ACs, explicit IN/OUT, risks with mitigations, Ollama smoke test in AC7, graceful degradation for non-tool-use models in AC8, no-regression guard in AC9. Known compatible endpoints documented. Status: Draft → Ready. |
