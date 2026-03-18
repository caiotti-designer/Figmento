# Story MF-4: Auto-Analysis Orchestrator

**Status:** Ready
**Priority:** High (P1)
**Complexity:** L (8 points) — 3 files modify (chat.ts, system-prompt.ts, chat-engine.ts or claude-code-handler.ts)
**Epic:** MF — Multi-File Import Pipeline
**Depends on:** MF-1 (queue), MF-3 (file types)
**PRD:** PM gap analysis 2026-03-17 — G4 "No file-type routing" + G5 "No auto-analysis pipeline"

---

## Business Value

When a user uploads 5 files (1 PDF brief + 3 reference images + 1 SVG logo), the agent should automatically understand what each file is and analyze them all — not just see them as raw base64 blobs. This is the orchestration layer that makes multi-file upload actually useful: routing files to the right tools and producing a structured summary.

## Out of Scope

- New backend tools — all tools exist (store_temp_file, import_pdf, list_temp_files)
- UI changes beyond system prompt updates
- Brand asset auto-save (manual via agent commands)

## Risks

- **Token limits** — Multiple large images + PDF text in a single message may exceed context windows. Need to summarize PDF text rather than sending raw.
- **Latency** — Analyzing 5 files means 5+ tool calls before the agent can respond. User needs a progress indicator.
- **Claude Code path** — MCP tools are available in Claude Code mode but not in direct API mode. File routing logic differs per provider path.

---

## Executor Assignment

```yaml
executor: @dev (Dex)
quality_gate: "Plugin builds, multi-file messages trigger automatic file analysis, agent responds with structured summary"
quality_gate_tools: ["esbuild", "manual Figma plugin test"]
```

---

## Story

**As a** designer uploading project files into Figmento,
**I want** the agent to automatically analyze all my uploaded files and summarize what it found,
**so that** I don't have to manually explain each file — the agent understands the full context.

---

## Description

### Problem

When files are uploaded, they're sent as raw base64 in the message payload. Images get injected as vision content blocks (provider-specific). PDFs are sent as base64 which the AI can't read. There's no routing: PDFs should go through `store_temp_file` → `import_pdf`, images should get visual analysis, text files should be read as context.

### Solution

#### File Routing Logic (in system prompt or pre-processing)

When the message includes multiple attachments, inject a system instruction telling the agent to:

1. **Images** (PNG/JPG/WebP): Analyze visually — describe composition, colors, typography, mood
2. **PDF**: Call `store_temp_file` → `import_pdf` → read extracted text, colors, fonts
3. **SVG**: Call `store_temp_file` → treat as brand asset (logo)
4. **TXT**: Read content as project context / copy / brief

#### Auto-Analysis System Prompt Injection

When `attachments.length > 0`, prepend to the system prompt:

```
The user has attached ${N} files to this message. Before responding to their request:
1. Analyze each attached file based on its type
2. For PDFs: use store_temp_file then import_pdf to extract text and brand signals
3. For images: describe what you see (composition, colors, typography, mood)
4. For SVGs: treat as brand assets (logos, icons)
5. For text files: read as project context or copy
6. Summarize your findings in a structured format before proceeding
```

#### Structured Summary Format

```
PROJECT CONTEXT ANALYSIS
────────────────────────
📄 brief.pdf — 12 pages, product launch brief for "Café Noir"
   Colors detected: #2C1810, #D4A574, #F5E6D3
   Fonts mentioned: Cormorant Garamond, Inter
   Key details: Coffee brand, premium positioning, target 25-40

🖼 reference1.png — Minimalist coffee ad, warm earth tones, centered layout
🖼 reference2.png — Editorial style, serif typography, dark background
🎨 logo.svg — Café Noir wordmark, stored as brand asset

Ready to design. What format would you like?
```

#### Provider-Specific Implementation

| Provider | Images | PDFs/TXT/SVG |
|----------|--------|-------------|
| **Claude (direct)** | Vision content blocks (existing) | Include as text in user message + system prompt routing instructions |
| **Gemini (direct)** | inlineData blocks (existing) | Same as Claude |
| **Claude Code (relay)** | Vision + MCP tools available | Agent autonomously calls store_temp_file → import_pdf via MCP |
| **Relay (any provider)** | Handled by chat-engine.ts | Pre-process: store non-image files server-side, inject extracted text |

---

## Acceptance Criteria

- [ ] **AC1:** Messages with attachments inject file-analysis instructions into the system prompt
- [ ] **AC2:** The agent automatically analyzes each file based on its type
- [ ] **AC3:** PDFs are routed through `store_temp_file` → `import_pdf` (in Claude Code mode)
- [ ] **AC4:** Images are analyzed visually (composition, colors, mood)
- [ ] **AC5:** The agent produces a structured summary before proceeding with the user's request
- [ ] **AC6:** Non-image files (PDF, TXT) are sent as text content (not image blocks) to avoid API errors
- [ ] **AC7:** The analysis works in Claude Code mode (MCP tools available)
- [ ] **AC8:** The analysis works in direct API mode (Gemini/Claude — vision for images, text extraction for PDFs in system prompt)
- [ ] **AC9:** A progress indicator shows while files are being analyzed
- [ ] **AC10:** `npm run build` succeeds in `figmento/`

---

## Tasks

### Phase 1: System Prompt Injection (AC1)

- [ ] In `buildSystemPrompt()` or `sendMessage()`, detect if attachments are present
- [ ] Inject file-analysis instructions listing each attachment by name and type
- [ ] Instructions tell the agent to analyze before responding

### Phase 2: Non-Image File Handling (AC6)

- [ ] In the direct API paths (Claude, Gemini, OpenAI), only inject images as vision content blocks
- [ ] PDFs and TXT files: extract text client-side if possible, or include filename + instructions for the agent
- [ ] For the relay path: send non-image files as base64 in `attachments[]` array, let chat-engine handle routing

### Phase 3: Claude Code Path (AC3, AC7)

- [ ] In the Claude Code path, attachments are already accessible via MCP tools
- [ ] The system prompt injection (Phase 1) tells the agent to use `store_temp_file` → `import_pdf`
- [ ] No additional code needed — the agent handles tool calls autonomously

### Phase 4: Direct API Path (AC4, AC8)

- [ ] For direct Gemini/Claude: images go as vision blocks (existing behavior)
- [ ] For PDFs: read file client-side using a minimal PDF text extractor, include extracted text in the user message
- [ ] For TXT: read file as text, include in user message as a code block
- [ ] Fallback: if client-side PDF parsing unavailable, include filename + "Please ask the user to share the content"

### Phase 5: Progress Indicator (AC9)

- [ ] Show "Analyzing N files..." loading state while the agent processes
- [ ] Reuse existing `chat-loading` indicator with updated text

### Phase 6: Build & Verify (AC10)

- [ ] Run `npm run build` in `figmento/`
- [ ] Test: upload PDF + 2 images → Claude Code mode → agent calls import_pdf + analyzes images → structured summary
- [ ] Test: upload PDF + image → Gemini mode → images analyzed visually, PDF text extracted
- [ ] Test: upload TXT → content included as context

---

## Dev Notes

- `buildSystemPrompt()` is in `system-prompt.ts` — this is where to inject the file analysis instructions
- `sendMessage()` in chat.ts handles provider routing — the attachment handling differs per path (relay, direct Claude, direct Gemini, Claude Code)
- For client-side PDF text extraction: `pdf.js` is too large for the plugin. Consider a minimal approach: just send the base64 to the relay and let server-side `pdf-parse` handle it
- The Claude Code path is the cleanest — MCP tools handle everything autonomously. Direct API paths need more pre-processing.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `figmento/src/ui/chat.ts` | MODIFY | Attachment routing in sendMessage(), progress indicator |
| `figmento/src/ui/system-prompt.ts` | MODIFY | File analysis instructions injection |
| `figmento-ws-relay/src/chat/chat-engine.ts` | MODIFY | Server-side non-image file handling for relay path |

---

## Definition of Done

- [ ] Multi-file messages trigger automatic analysis
- [ ] Agent produces structured summary
- [ ] Works in Claude Code and direct API modes
- [ ] PDFs are parsed (not sent as images)
- [ ] Plugin builds

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-17 | @pm (Morgan) | Initial draft |
| 2026-03-17 | @po (Pax) | Validation GO (10/10). Status Draft → Ready |
