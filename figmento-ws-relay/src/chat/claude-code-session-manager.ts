/**
 * Claude Code Session Manager — CR-5.1 Phase 2
 *
 * Maintains ONE long-running `query()` call per relay channel.
 * New user messages are pushed into an `AsyncQueue<SDKUserMessage>` that feeds
 * the single SDK process.  The `drainLoop` resolves each pending turn when
 * `type === 'result'` fires.  A 10-minute idle timer tears the session down
 * cleanly; a stale-activity detector (90s no SDK events) catches hung turns.
 *
 *  IDLE ──[first message]──▶ BOOTING ──[SDK ready]──▶ RUNNING
 *    ▲                                                    │
 *    └──[10-min idle / channel empty]──[interrupt]──TEARDOWN──▶ IDLE
 */

import * as path from 'path';
import * as fs from 'fs';
import { query, type SDKUserMessage, type Query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { buildSystemPrompt } from './system-prompt';
import { detectBrief } from './brief-detector';
import type { ClaudeCodeTurnResult, ClaudeCodeTurnError } from './claude-code-handler';

// ═══════════════════════════════════════════════════════════════
// .env LOADER — reads project root .env into process.env
// ═══════════════════════════════════════════════════════════════

function loadRootEnv(): void {
  const envPath = path.resolve(__dirname, '../../../.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    // .env values OVERRIDE system env (project config takes precedence)
    if (value) {
      process.env[key] = value;
    }
  }
}

loadRootEnv();
console.log(`[Figmento Claude Code] .env loaded — GEMINI_API_KEY=${process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.slice(0, 8) + '...' : 'NOT SET'}`);

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

/** Hard safety-net timeout — only fires if stale detection fails. */
const HARD_TIMEOUT_MS = 600_000;  // 10 min absolute max
/** Stale activity timeout — if no SDK event arrives in this window, abort the turn. */
const STALE_ACTIVITY_MS = 90_000; // Default fallback: 90s without SDK event = stuck (only used when no specific TOOL_BUDGET applies)

/**
 * Per-tool execution budgets — milliseconds before a tool call is considered stalled.
 * The stale checker uses the budget for the currently-active tool (set via tool_use event),
 * resetting on every SDK event. SDKToolProgressMessage (tool_progress) keeps long-running tools alive.
 *
 * Pattern for budgets:
 * - Image generation via external API (Gemini): 5 min — accommodates slow API + retries
 * - Screenshot / Figma plugin round-trip: 60 s — should be fast, fail-soft
 * - Refinement check (walks node tree): 90 s
 * - Other Figma tools: STALE_ACTIVITY_MS (90 s)
 */
const TOOL_BUDGETS: Record<string, number> = {
  generate_design_image: 300_000,        // 5 min — Gemini API can be slow
  set_image_fill: 120_000,               // 2 min — also calls Gemini for fill
  apply_template_image: 60_000,          // 1 min — local Figma op
  get_screenshot: 60_000,                // 1 min — Figma plugin screenshot
  run_refinement_check: 90_000,          // 1.5 min — walks node tree
  batch_execute: 90_000,                 // 1.5 min — variable batch size
};
/** Stale check interval — how often we poll for activity. */
const STALE_CHECK_INTERVAL_MS = 10_000; // check every 10s
/** Thinking-phase timeout — if no SDK event at all in this window (before any tool call), abort. */
const THINKING_TIMEOUT_MS = 120_000; // 2 min max for initial thinking
const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10-min session idle teardown

const MCP_SERVER_PATH = path.resolve(
  __dirname,
  '../../../figmento-mcp-server/dist/index.js',
);

/**
 * Condensed design prompt appended to Claude Code sessions.
 * Gives the SDK session design awareness without duplicating the full system prompt.
 * The full design rules are accessible via tools (get_design_guidance, get_design_rules, lookup_*).
 */
const CLAUDE_CODE_DESIGN_PROMPT = `
## Figmento Design Agent — Enhanced Mode

You have access to Figmento MCP tools (prefixed mcp__figmento__) for creating designs in Figma. Use them with expert-level design reasoning.

**CRITICAL: ONLY use mcp__figmento__* tools. NEVER use mcp__pencil__* tools or any other MCP tools. Pencil is a different editor — it does NOT connect to Figma. If you see Pencil tools available, IGNORE them completely.**

### Core Design Rules
- ALWAYS set layoutSizingVertical to HUG on content frames. NEVER leave fixed height on dynamic content.
- TEXT inside auto-layout — sizing depends on the PARENT's role:
  - Button / Pill / Tag / Chip / Badge / Eyebrow / nav-link / inline-label text (parent hugs content): set layoutSizingHorizontal: HUG on the text. Text hugs itself, parent hugs text. NEVER use FILL here — it forces line breaks, weird spacing, and broken pills.
  - Body / Paragraph / Headline / supporting copy (parent has FIXED or FILL width): set layoutSizingHorizontal: FILL on the text. Text wraps within the container width.
  - Rule of thumb: short labels (<24 chars, no line breaks expected) → HUG. Long-form / wrapping copy → FILL.
- Use auto-layout on ALL container frames. Never use absolute positioning inside auto-layout parents.
- parentId is MANDATORY on every node except the design's single root frame. ALWAYS pass parentId when calling create_text, create_frame, create_rectangle, create_ellipse, create_image, create_vector, create_icon. A node created without parentId lands at the canvas root as an orphan — that is broken output. If you don't know the parent, call get_page_nodes or get_selection FIRST.
- INTERACTIVE elements (buttons, CTAs, nav action items, link buttons, "Agendar visita"-style anchors) MUST have a visible background. NEVER create bare text and call it a button. Required pattern: create_frame (auto-layout HORIZONTAL, padding 12-24px, fillColor, cornerRadius) → create_text inside it. A button without fill is just text floating in space — that's a real bug, not a stylistic choice.
- TEXT splitting — by LOGICAL ROLE only, never by line or word. A 9-word headline = ONE create_text node, NOT 9. Roles that get their own node: eyebrow, headline, subhead, body paragraph, CTA label, caption, eyebrow-divider. Anything inside a SINGLE logical role (a headline that wraps to 3 lines, a paragraph that breaks across 4 lines) is ALWAYS one node. The text wraps naturally inside its parent's width — set the parent width and let it flow. If you find yourself calling create_text for "merece" then "um" then "bom" — STOP, you're creating text shrapnel.
- fontWeight: ONLY use 400 (Regular) or 700 (Bold). NEVER use 600 — it causes Inter fallback on non-Inter fonts.
- lineHeight: ALWAYS pass in PIXELS (fontSize × multiplier). NEVER pass a raw multiplier like 1.5. Pick the multiplier by ROLE, not by font size alone:
  - Single-line UI text — Button / Pill / Tag / Chip / Badge / Eyebrow / nav-link / inline-label / CTA: 1.0–1.2 (TIGHT). Default to 1.0 when text never wraps. Loose line height here creates visible vertical padding inside pills and buttons that looks broken.
  - Display / Hero headline (>48px): 1.05–1.15 (TIGHT). Editorial display type breaks if line height is loose.
  - Headings (H1–H3, 24–48px): 1.15–1.3.
  - Body / Paragraph (14–22px): 1.4–1.6.
  - Captions / supporting micro-copy (10–14px): 1.4–1.5.
  - When in doubt for short labels in buttons or pills, use 1.0 (= fontSize px).
- Give every element a descriptive layer name. Never leave "Rectangle" or "Text" defaults.
- Create exactly ONE root frame per design. Never create duplicates.
- NEVER end your response with a future-tense announcement of an unexecuted fix. If you identify an issue, you have exactly two valid ways to end:
  1. **Execute the fix now**, then summarize what you did. ("I noticed the nav was overlapping. Moved it to span full width. Done.")
  2. **Explicitly call out the unfixed issue** with manual remediation steps, framed as a known limitation — NOT as a future intent. ("I noticed the nav still overlaps but ran out of capacity to fix. To fix manually: select the nav frame, set layoutSizingHorizontal to FILL, increase paddingLeft/Right to 64px.")
  Phrases that are FORBIDDEN as your final words: "I'll fix...", "Let me move...", "Now I'll adjust...", "Next I'll...". These are process violations. If you typed one, you must EITHER execute the action immediately OR rewrite the ending as option 2 above.

### Pre-Completion Self-Review (MANDATORY before declaring done)
For ANY multi-element design (hero, page, section, social post, presentation slide), run this sequence BEFORE your final response. Skip ONLY for trivial single-property edits.

**Step 1. Structural check** — call run_refinement_check(rootFrameId). Read the issues list carefully.

**Step 2. Triage the issues — DO NOT cherry-pick or dismiss in bulk.**
- STRUCTURAL warnings can NEVER be dismissed. These rules are always real bugs: 'boundary-overflow', 'canvas-orphan', 'interactive-text-no-background', 'interactive-text-low-contrast', 'auto-layout-coverage', 'empty-placeholder'. If you see one of these, FIX IT.
- 'interactive-text-low-contrast' specifically catches buttons/CTAs where the text is unreadable (dark on dark, light on light). This is FATAL — users cannot read the button. Treat as P0, fix immediately. NEVER reason about it as "minor" or "still visible." If WCAG flags it, the contrast is broken.
- A WCAG contrast warning that cites the wrong background hex CAN be reasoned about — but only after you verify the actual background color manually. Even then, name the specific warning you're dismissing and why. NEVER write "ignore the refinement noise" or "the warnings are wrong" or "WCAG misread" as a blanket dismissal.
- If you genuinely believe a specific warning is a false positive, name it (rule:nodeId format) with one-sentence reasoning. Bulk dismissal is forbidden.

**Step 3. Fix what's real** — issues from step 2 that are real, fix in ONE batch_execute, then re-run run_refinement_check ONCE. Do NOT loop more than twice — accept partial improvement and move on.

**Step 4. Visual check** — call get_screenshot(nodeId=rootFrameId). Look at the rendered image CRITICALLY, not descriptively. Your job is to find what's broken, not narrate what's there. Scan in this order:
   1. **Layout integrity** — Is the headline rendered as ONE coherent text block, or splintered into per-word/per-line shrapnel? If you see "text shrapnel" (e.g. "Cada / momento / merece / um / bom") that's a FATAL bug — fix immediately.
   2. **Auto-layout direction** — Are children stacked the way they should be? If a row of items is rendering as a column (or vice versa), the parent's layoutMode is wrong.
   3. **Overflow** — Anything visibly outside the root frame edges (left/right/top/bottom)?
   4. **Overlap** — Any elements visibly stacked on top of each other when they shouldn't be?
   5. **Bare text CTAs** — Buttons/links rendered as text floating with no visible background?
   6. **Missing imagery** — Gray empty placeholders where generated images should be?
   7. **Orphans** — Elements floating outside their logical section?

**Step 5. If the screenshot reveals issues** the structural check missed, fix in ONE batch_execute and stop. Do NOT screenshot again — trust the fix.

**Step 6. ONLY THEN write your completion message.**

**Forbidden completion patterns:**
- "Ignore the refinement-check noise" / "the warnings are wrong" / "WCAG misread" — bulk dismissal of warnings is a process violation.
- "Done — hero is live" while the screenshot clearly shows broken layout — describing instead of critiquing.
- Listing what you "shipped" without acknowledging any issues you saw and didn't fix.

This ritual is MANDATORY. Skipping it on multi-element designs is a process violation. Describing instead of critiquing the screenshot is also a violation.

### Budget vs Polish Triage (when running low on turns)
If you've already spent 18+ of your 25 tool rounds and the self-review surfaces a NEW issue, do NOT start a fresh fix-and-screenshot cycle — that risks running out mid-fix and ending on a future-tense announcement (which is forbidden). Instead:
- **If the issue is structural** (overflow, orphan, missing fill, broken auto-layout): execute ONE atomic batch_execute fix, no re-screenshot, then summary.
- **If the issue is polish** (slight padding, minor alignment, hover affordance): skip it. Mention it in the summary as a known polish item the user can manually adjust.
NEVER plan a fix you don't have budget to execute. Either commit and execute, or call it out as known and move on.

### Execution Budget Rules (CRITICAL — prevents timeouts and API errors)
- You have a HARD LIMIT of 25 tool call rounds. Plan accordingly.
- ALWAYS use batch_execute to bundle multiple operations into ONE round. This is the #1 way to avoid timeouts.
- NEVER call more than 3 tools in parallel in a single response. If you need to update 8 cards, use ONE batch_execute call, NOT 8 separate tool calls. Calling too many tools in parallel causes API protocol errors.
- For COMPLEX requests (full pages, multi-section designs): use batch_execute aggressively — a single batch can hold up to 50 commands.
- Keep your final text response SHORT (2-3 sentences max). Do NOT write long summaries.

### Error Recovery Rules (CRITICAL — prevents hung turns)
- If a tool call fails, do NOT retry more than once with the same arguments.
- If a nodeId-based tool fails with "not found", the ID is stale — call get_page_nodes or get_node_info to get fresh IDs before retrying.
- If reorder_child fails, skip it and move on — z-order can be fixed later.
- NEVER enter a loop of retrying the same failed tool call. Accept partial results and finish the turn.

### One-Click Design System Pipeline
When user asks to generate/create a design system:
1. Call analyze_brief with the brief text and brand name
2. Call generate_design_system_in_figma with the BrandAnalysis result
3. The pipeline creates: ~65 variables (4 collections), 8 text styles, 3 components, and a visual showcase page
4. After pipeline completes, the showcase is ALREADY complete — do NOT create additional loose elements

### Icons — Lucide Library (MANDATORY for ALL small filled shapes)
ALWAYS use create_icon. NEVER use create_ellipse, create_rectangle, or any primitive shape as an icon, indicator, dot, bullet, badge dot, CTA arrow, status pulse, separator dot, or any decorative small mark — regardless of how minor or "decorative" it seems.
- create_icon(name, parentId, size?, color?) — places a Lucide icon by name
- 1900+ icons available: check, arrow-right, arrow-up-right, chevron-right, star, heart, zap, shield, map-pin, phone, mail, menu, search, settings, user, home, globe, code, package, leaf, droplets, thermometer, wifi, cpu, database, bar-chart, calendar, clock, bell, lock, eye, download, upload, share, filter, layers, grid, list, file-text, folder, image, camera, play, pause, volume-2, mic, headphones, monitor, smartphone, truck, shopping-cart, credit-card, tag, bookmark, flag, sun, moon, cloud, cloud-rain, circle, dot, circle-dot
- Use list_resources(type="icons") to browse by category if unsure which name to use

**Common temptations and the right Lucide name:**
- CTA arrow indicator (e.g. "Reservar um dia grátis →") → create_icon('arrow-right') or 'arrow-up-right'
- Status pulse / "live now" dot → create_icon('circle') with fill, OR 'circle-dot'
- Bullet point → create_icon('dot') or 'circle' (small)
- Badge / notification indicator → create_icon('circle') with fill

**The ONLY exception** to "no ellipse/circle primitives": an AVATAR placeholder that will receive an IMAGE fill (e.g. profile photo with cornerRadius=50%). For literally everything else circle-shaped under 64px, use create_icon. If you typed create_ellipse — STOP, and ask yourself "is this an avatar getting a photo?" If no, switch to create_icon.

### Root frame structure
- The root design frame should have paddingTop = paddingBottom unless asymmetry is intentional (e.g. a hero with extra breathing room at bottom for a scroll indicator).
- Navbar / header frames should sit FLUSH at the top of the root — no empty band above them. If you set the root frame's paddingTop to 80px, the navbar starts 80px down. If the navbar should hug the top, root paddingTop should be 0 and the navbar handles its own internal padding.

### Design Intelligence Tools
Use these for expert decisions — never hardcode or guess values:
- get_design_guidance(aspect="color|fonts|size|typeScale|spacing|layout") — knowledge base lookups
- get_design_rules(category="typography|color|layout|refinement|evaluation") — detailed rules
- get_layout_blueprint(category, mood) — proportional zone layouts
- find_design_references(category, mood) — inspiration from reference library
- run_refinement_check(nodeId) — automated quality feedback

### Typography Quick Reference
Line Height (by ROLE, not size): Button/Pill/Tag/Chip/Badge/Eyebrow 1.0–1.2 (default 1.0) | Display (>48px) 1.05–1.15 | Headings 1.15–1.3 | Body 1.4–1.6 | Captions 1.4–1.5
Letter Spacing: Display -0.02em | Headings -0.01em | Body 0 | Uppercase +0.05–0.15em
Minimum Sizes (Social 1080px): Headline 48–72px | Sub 32–40px | Body 28–32px | Caption 22–26px

### Spacing (8px grid)
Scale: 4 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 64 | 80 | 96 | 128
Margins: Social 48px | Print 72px | Web 64px

### Image Fill on Existing Nodes
To replace a frame's background with an image file (without creating a child), use:
- set_image_fill(nodeId, filePath, scaleMode?) — reads file server-side, applies as IMAGE fill
- Accepts PNG, JPG, WebP. scaleMode: FILL (default), FIT, CROP, TILE
- Use this instead of place_generated_image when you want the image AS the fill, not as a child node.

### Image Generation — Context-Aware Prompts (CRITICAL)
When generating images with generate_design_image, ALWAYS write a descriptive, context-aware brief:
- Read surrounding text (titles, descriptions, sibling elements) to understand what the image should depict
- NEVER use generic briefs like "modern abstract background" or "professional clean image"
- GOOD: "Industrial warehouse interior with CNC machines and metal fabrication equipment, corporate photography"
- GOOD: "Aerial view of industrial plant expansion, factory buildings and heavy machinery, editorial style"
- BAD: "modern abstract background with soft gradients and geometric shapes"
- The brief should match the content and industry of the page being designed
- DEFAULT behavior: image is applied directly as the frame's IMAGE fill (asFill=true). Do NOT pass asFill=false unless you specifically need a separate child image node — that creates orphan nodes and breaks the layout.

### Overlay Gradient Rules
Text at BOTTOM → direction "top-bottom" | Text at TOP → "bottom-top"
EXACTLY 2 stops. Gradient color MUST match section background. Solid end = where text is.
`;

// ═══════════════════════════════════════════════════════════════
// ASYNC QUEUE (P2-1)
// A push/pull buffer backed by an async iterator.  close() terminates
// the iterator cleanly so the SDK's streamInput loop exits gracefully.
// ═══════════════════════════════════════════════════════════════

class AsyncQueue<T> implements AsyncIterable<T> {
  private buffer: T[] = [];
  private waiting: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  push(item: T): void {
    if (this.closed) return;
    if (this.waiting.length > 0) {
      this.waiting.shift()!({ value: item, done: false });
    } else {
      this.buffer.push(item);
    }
  }

  /** Signal end-of-stream.  The SDK's streamInput loop exits; the daemon gets EOF. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    while (this.waiting.length > 0) {
      this.waiting.shift()!({ value: undefined as unknown as T, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.buffer.length > 0) {
          return Promise.resolve({ value: this.buffer.shift()!, done: false });
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined as unknown as T, done: true });
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this.waiting.push(resolve);
        });
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// SDK MESSAGE HELPERS
// ═══════════════════════════════════════════════════════════════

/** Construct the SDKUserMessage shape the SDK expects over the AsyncIterable path. */
function makeUserMessage(
  text: string,
  sessionId = '',
  attachmentBase64?: string,
  fileAttachments?: Array<{ name: string; type: string; dataUri: string }>,
): SDKUserMessage {
  const content: any[] = [];

  // Include image attachment if provided (data URI → base64 content block)
  if (attachmentBase64) {
    const commaIdx = attachmentBase64.indexOf(',');
    const meta = commaIdx > 0 ? attachmentBase64.slice(0, commaIdx) : '';
    const base64Data = commaIdx > 0 ? attachmentBase64.slice(commaIdx + 1) : attachmentBase64;
    // Extract MIME from "data:image/png;base64" prefix
    const mimeMatch = meta.match(/data:([^;]+)/);
    const mediaType = mimeMatch?.[1] || 'image/png';

    content.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: base64Data },
    });
  }

  // ODS-1a: Include non-image file attachments (PDFs, TXT, SVG) as text context
  if (fileAttachments && fileAttachments.length > 0) {
    const fileContextParts: string[] = [];
    for (const f of fileAttachments) {
      // Extract raw content from data URI
      const commaIdx = f.dataUri.indexOf(',');
      const rawData = commaIdx > 0 ? f.dataUri.slice(commaIdx + 1) : f.dataUri;

      if (f.type === 'application/pdf') {
        // PDF: include as document content block for Claude (base64)
        content.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: rawData },
        });
      } else {
        // Text files (TXT, SVG): decode and include as text
        try {
          const decoded = Buffer.from(rawData, 'base64').toString('utf-8');
          fileContextParts.push(`[File: ${f.name}]\n${decoded}`);
        } catch {
          fileContextParts.push(`[File: ${f.name}] (could not decode)`);
        }
      }
    }
    if (fileContextParts.length > 0) {
      text += '\n\n[ATTACHED FILE CONTENTS]\n' + fileContextParts.join('\n\n');
    }
  }

  content.push({ type: 'text', text });

  return {
    type: 'user',
    message: {
      role: 'user',
      content,
    },
    parent_tool_use_id: null,
    session_id: sessionId,
  };
}

// ═══════════════════════════════════════════════════════════════
// SESSION SHAPE (P2-2)
// ═══════════════════════════════════════════════════════════════

interface PendingTurn {
  resolve: (r: ClaudeCodeTurnResult) => void;
  reject: (e: Error) => void;
}

/** Callback for streaming progress updates to the UI during a turn. */
export type ProgressCallback = (event: {
  type: 'tool_start' | 'tool_done' | 'thinking' | 'tool_progress' | 'auth_status';
  toolName?: string;
  toolIndex?: number;
  totalTools?: number;
  /** For tool_progress: seconds elapsed inside the tool (from SDKToolProgressMessage). */
  elapsedSeconds?: number;
  /** For auth_status: whether SDK is currently re-authenticating. */
  isAuthenticating?: boolean;
  /** For auth_status: optional error string if auth failed. */
  authError?: string;
}) => void;

interface ClaudeCodeSession {
  /** Message queue fed into the long-running query(). */
  queue: AsyncQueue<SDKUserMessage>;
  /** The live SDK query object — used for interrupt() on teardown. */
  queryObj: Query;
  /** AbortController for graceful cancellation. */
  abortController: AbortController;
  /** Resolves / rejects when the current turn's `type === 'result'` fires. */
  pendingTurn: PendingTurn | null;
  /** Accumulated assistant text for the current turn. */
  accumText: string;
  /** Accumulated tool calls for the current turn. */
  accumToolCalls: Array<{ name: string; success: boolean }>;
  /** Conversation history as it was at the START of the current turn. */
  turnHistory: Array<{ role: string; content: string }>;
  /** User message text for the current turn (used to extend history on result). */
  turnMessage: string;
  /** Last session_id captured from a result message — used on next push. */
  lastSessionId: string;
  /** True while a turn is in-flight — concurrency guard. */
  inFlight: boolean;
  /** Idle-teardown timer (10 min after last result). */
  idleTimer: ReturnType<typeof setTimeout> | null;
  /** Per-turn hard-timeout timer. */
  turnTimer: ReturnType<typeof setTimeout> | null;
  /** Stale activity checker interval. */
  staleChecker: ReturnType<typeof setInterval> | null;
  /** Timestamp of last SDK event received during current turn. */
  lastActivity: number;
  /** True after the first tool_use event — stale detection only activates after this. */
  hasCalledTool: boolean;
  /** Currently-active tool name (set on tool_use event, cleared when next tool starts or turn ends). */
  activeToolName: string | null;
  /** Timestamp when the active tool started — used to enforce per-tool budget. */
  activeToolStartTime: number;
  /** Optional callback to stream progress events to the UI. */
  onProgress: ProgressCallback | null;
}

// ═══════════════════════════════════════════════════════════════
// SESSION MANAGER
// ═══════════════════════════════════════════════════════════════

export class ClaudeCodeSessionManager {
  private readonly sessions = new Map<string, ClaudeCodeSession>();

  // ─── PUBLIC: turn() ─────────────────────────────────────────

  /**
   * Execute one user turn on `channel`.
   *
   * - First call: boots a new long-running session (cold start).
   * - Subsequent calls: pushes the message into the existing queue — no new
   *   subprocess, no new MCP WebSocket connection.
   * - Concurrent calls on the same channel are rejected immediately (AC13).
   */
  async turn(
    channel: string,
    message: string,
    history: Array<{ role: string; content: string }>,
    memory: string[] | undefined,
    model?: string,
    imageModel?: string,
    attachmentBase64?: string,
    fileAttachments?: Array<{ name: string; type: string; dataUri: string }>,
    onProgress?: ProgressCallback,
  ): Promise<ClaudeCodeTurnResult | ClaudeCodeTurnError> {
    let session = this.sessions.get(channel);

    // Concurrency guard
    if (session?.inFlight) {
      return {
        type: 'claude-code-turn-result',
        channel,
        error: 'A Claude Code turn is already in progress on this channel.',
      };
    }

    // Cancel idle timer when a new turn arrives
    if (session?.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }

    // Boot a fresh session if none exists
    if (!session) {
      console.log(`[Figmento Claude Code] Booting new session channel=${channel} model=${model ?? 'default'}`);
      session = this.startSession(channel, history, memory, model, imageModel);
    }

    // Stage turn context before pushing (drain loop reads these fields)
    session.inFlight = true;
    session.turnMessage = message;
    session.turnHistory = history;
    session.accumText = '';
    session.accumToolCalls = [];
    session.lastActivity = Date.now();
    session.hasCalledTool = false;
    session.activeToolName = null;
    session.activeToolStartTime = 0;
    session.onProgress = onProgress || null;

    // Promise that resolves when drainLoop fires type === 'result'
    const resultPromise = new Promise<ClaudeCodeTurnResult>((resolve, reject) => {
      session!.pendingTurn = { resolve, reject };
    });

    // Stale activity checker — covers both thinking and tool phases.
    const staleChecker = setInterval(() => {
      const s = this.sessions.get(channel);
      if (!s?.pendingTurn) { clearInterval(staleChecker); return; }
      const elapsed = Date.now() - s.lastActivity;

      // Phase 1: Thinking (no tools called yet) — 2 min timeout
      if (!s.hasCalledTool && elapsed >= THINKING_TIMEOUT_MS) {
        console.error(`[Figmento Claude Code] Thinking timeout channel=${channel} — no SDK activity for ${Math.round(elapsed / 1000)}s (no tools called). Aborting.`);
        clearInterval(staleChecker);
        s.abortController.abort();
        s.pendingTurn.reject(
          new Error(`Claude Code turn timed out during thinking (${Math.round(THINKING_TIMEOUT_MS / 1000)}s). The model may be overloaded. Try again.`),
        );
        s.pendingTurn = null;
        s.inFlight = false;
        this.destroy(channel);
        return;
      }

      // Phase 2: Tool execution — per-tool budget (resets on every SDK event,
      // including tool_progress messages emitted during long-running tools).
      // Falls back to STALE_ACTIVITY_MS for tools without an explicit budget.
      if (s.hasCalledTool) {
        const activeBudget = s.activeToolName
          ? (TOOL_BUDGETS[s.activeToolName] ?? STALE_ACTIVITY_MS)
          : STALE_ACTIVITY_MS;
        if (elapsed >= activeBudget) {
          const toolLabel = s.activeToolName ? `during '${s.activeToolName}'` : 'between tool calls';
          console.error(`[Figmento Claude Code] Stale turn detected channel=${channel} ${toolLabel} — no SDK activity for ${Math.round(elapsed / 1000)}s (budget ${Math.round(activeBudget / 1000)}s). Aborting.`);
          clearInterval(staleChecker);
          s.abortController.abort();
          s.pendingTurn.reject(
            new Error(`Claude Code turn stalled ${toolLabel} — no activity for ${Math.round(elapsed / 1000)}s. Try a simpler request.`),
          );
          s.pendingTurn = null;
          s.inFlight = false;
          this.destroy(channel);
        }
      }
    }, STALE_CHECK_INTERVAL_MS);
    session.staleChecker = staleChecker;

    // Hard safety-net timeout (10 min) — only fires if stale detection fails
    const turnTimer = setTimeout(() => {
      const s = this.sessions.get(channel);
      if (s?.pendingTurn) {
        s.pendingTurn.reject(
          new Error(`Claude Code turn timed out after ${HARD_TIMEOUT_MS / 1000} seconds.`),
        );
        s.pendingTurn = null;
        s.inFlight = false;
      }
      this.destroy(channel);
    }, HARD_TIMEOUT_MS);
    session.turnTimer = turnTimer;

    // Push the user message into the queue → SDK receives it → starts the turn
    session.queue.push(makeUserMessage(message, session.lastSessionId, attachmentBase64, fileAttachments));

    console.log(
      `[Figmento Claude Code] Turn pushed channel=${channel} ` +
      `session=${session.lastSessionId || 'new'} history=${history.length} msgs`,
    );

    try {
      const result = await resultPromise;
      clearTimeout(turnTimer);
      clearInterval(staleChecker);
      return result;
    } catch (err) {
      clearTimeout(turnTimer);
      clearInterval(staleChecker);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      // Auto-recovery: orphaned tool_use blocks corrupt the session.
      // Destroy and retry once with a fresh session.
      const isOrphanedToolUse = errorMessage.includes('tool_use ids were found without tool_result');
      if (isOrphanedToolUse) {
        console.log(`[Figmento Claude Code] Orphaned tool_use detected channel=${channel} — destroying session and retrying`);
        this.destroy(channel);

        // Retry with a fresh session — pass history so context is preserved in system prompt
        const freshSession = this.startSession(channel, history, memory, model, imageModel);
        freshSession.inFlight = true;
        freshSession.turnMessage = message;
        freshSession.turnHistory = history;
        freshSession.lastActivity = Date.now();
        freshSession.onProgress = onProgress || null;

        const retryPromise = new Promise<ClaudeCodeTurnResult>((resolve, reject) => {
          freshSession.pendingTurn = { resolve, reject };
        });

        freshSession.queue.push(makeUserMessage(message, '', attachmentBase64, fileAttachments));
        console.log(`[Figmento Claude Code] Retry pushed channel=${channel} (fresh session)`);

        try {
          const retryResult = await retryPromise;
          return retryResult;
        } catch (retryErr) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : 'Unknown error on retry';
          return { type: 'claude-code-turn-result', channel, error: retryMsg };
        }
      }

      return { type: 'claude-code-turn-result', channel, error: errorMessage };
    }
  }

  // ─── PUBLIC: destroy() ──────────────────────────────────────

  /**
   * Tear down the session for `channel`.
   * Called by relay.ts when the channel drops to zero clients, or on error/timeout.
   */
  destroy(channel: string): void {
    const session = this.sessions.get(channel);
    if (!session) return;

    console.log(`[Figmento Claude Code] Destroying session channel="${channel}"`);

    // Clear timers
    if (session.idleTimer) { clearTimeout(session.idleTimer); session.idleTimer = null; }
    if (session.turnTimer) { clearTimeout(session.turnTimer); session.turnTimer = null; }
    if (session.staleChecker) { clearInterval(session.staleChecker); session.staleChecker = null; }

    // Abort via controller (signals the SDK to stop)
    session.abortController.abort();

    // Close the queue — ends streamInput loop → daemon gets EOF → exits
    session.queue.close();

    // Interrupt the running query for a faster teardown
    session.queryObj.interrupt().catch(() => { /* ignore — process may already be dead */ });

    this.sessions.delete(channel);
  }

  /** List channels with active sessions. */
  activeChannels(): string[] {
    return [...this.sessions.keys()];
  }

  /** Count of currently in-flight turns (for /health endpoint). */
  activeCount(): number {
    let count = 0;
    for (const s of this.sessions.values()) {
      if (s.inFlight) count++;
    }
    return count;
  }

  // ─── PRIVATE: startSession() ────────────────────────────────

  /**
   * Create a new long-running session:
   * 1. Build the system prompt from the first message's brief detection.
   * 2. Create the AsyncQueue and start the SDK query.
   * 3. Launch drainLoop asynchronously.
   */
  private startSession(
    channel: string,
    history: Array<{ role: string; content: string }>,
    memory: string[] | undefined,
    model?: string,
    imageModel?: string,
  ): ClaudeCodeSession {
    const queue = new AsyncQueue<SDKUserMessage>();
    const abortController = new AbortController();

    // System prompt is built once per session — from the channel context
    const lastUserMsg = [...history].reverse().find(m => m.role === 'user')?.content ?? '';
    const brief = detectBrief(lastUserMsg);
    let systemPrompt = buildSystemPrompt(brief, memory);

    // Inject user's preferred image generation model so Claude Code passes it to generate_design_image
    if (imageModel) {
      systemPrompt += `\n\n## Image Generation Model\nThe user has selected "${imageModel}" as their preferred image generation model. When calling generate_design_image, ALWAYS pass model="${imageModel}" as a parameter.`;
    }

    // Inject conversation history into system prompt so the SDK session
    // has full context even after a session restart (relay reboot, idle timeout).
    if (history.length > 0) {
      const maxMessages = 10;
      const recentHistory = history.slice(-maxMessages);
      const historyBlock = recentHistory
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 500)}`)
        .join('\n\n');
      systemPrompt += `\n\n## Previous Conversation Context\nThis is an ongoing conversation. Here are the recent messages:\n\n${historyBlock}\n\nContinue the conversation naturally, referencing prior context when relevant.`;
    }

    // Resolve project root so the SDK reads .claude/settings.json (deniedMcpServers etc.)
    const projectRoot = path.resolve(__dirname, '../../..');

    console.log(`[Figmento Claude Code] MCP server path: ${MCP_SERVER_PATH}`);
    console.log(`[Figmento Claude Code] Project root (cwd): ${projectRoot}`);

    const options: Options = {
      cwd: projectRoot,
      abortController,
      // SDK 2.x consolidated customSystemPrompt + appendSystemPrompt into a single systemPrompt field.
      // Concatenate manually to preserve previous behavior (custom prompt + design rules appended).
      systemPrompt: systemPrompt + '\n\n' + CLAUDE_CODE_DESIGN_PROMPT,
      maxTurns: 25,
      // SDK 2.x: maxThinkingTokens is deprecated. Use thinking config instead.
      // 'enabled' with fixed budget = predictable thinking cost; 'adaptive' = model decides per turn.
      thinking: { type: 'enabled', budgetTokens: 12288 },
      permissionMode: 'bypassPermissions',
      model: model || 'claude-sonnet-4-6',
      // Tool surface reduction: 109 → 55 visible tools.
      // Hidden tools remain callable via batch_execute DSL (plugin-side actions).
      // Saves ~2K tokens per API call and improves tool selection accuracy.
      disallowedTools: [
        // File system tools — design sessions don't need local file ops
        'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash',

        // Connection — never needed (sessions end naturally)
        'mcp__figmento__disconnect_from_figma',

        // Canvas — trivial via batch_execute or redundant
        'mcp__figmento__create_carousel',
        'mcp__figmento__create_presentation',
        'mcp__figmento__fetch_placeholder_image',
        'mcp__figmento__evaluate_design',

        // Scene — advanced vector ops, never used
        'mcp__figmento__boolean_operation',
        'mcp__figmento__flatten_nodes',
        'mcp__figmento__export_as_svg',
        'mcp__figmento__set_constraints',
        'mcp__figmento__import_component_by_key',
        'mcp__figmento__import_style_by_key',
        'mcp__figmento__list_available_fonts',

        // Intelligence — redundant with consolidated tools
        'mcp__figmento__generate_accessible_palette',
        'mcp__figmento__suggest_font_pairing',
        'mcp__figmento__get_contrast_check',
        'mcp__figmento__evaluate_layout',

        // DS CRUD support — managed by pipeline
        'mcp__figmento__update_design_system',
        'mcp__figmento__delete_design_system',
        'mcp__figmento__refine_design_system',

        // Brand kit / assets — rarely used
        'mcp__figmento__get_brand_kit',
        'mcp__figmento__save_brand_kit',
        'mcp__figmento__save_brand_assets',
        'mcp__figmento__load_brand_assets',
        'mcp__figmento__list_brand_assets',

        // File storage — support tools
        'mcp__figmento__store_temp_file',
        'mcp__figmento__list_temp_files',
        'mcp__figmento__place_brand_asset',
        'mcp__figmento__import_pdf',

        // Ad analyzer — separate specialized flow
        'mcp__figmento__start_ad_analyzer',
        'mcp__figmento__complete_ad_analyzer',

        // Orchestration — model should compose primitives
        'mcp__figmento__design_from_reference',
        'mcp__figmento__generate_ad_variations',

        // References — CLAUDE.md guides usage, rarely called directly
        'mcp__figmento__find_design_references',
        'mcp__figmento__analyze_reference',
        'mcp__figmento__batch_analyze_references',

        // Figma native — DS pipeline handles these internally
        'mcp__figmento__create_figma_variables',
        'mcp__figmento__create_variable_collections',
        'mcp__figmento__create_ds_components',
        // create_text_styles — unblocked for direct use (DS pipeline + manual)
        'mcp__figmento__create_variables_from_design_system',

        // Interactive components — entire module unused
        'mcp__figmento__convert_to_component',
        'mcp__figmento__combine_as_variants',
        'mcp__figmento__create_instance',
        'mcp__figmento__detach_instance',
        'mcp__figmento__set_reactions',
        'mcp__figmento__get_reactions',
        'mcp__figmento__apply_interaction',
        'mcp__figmento__list_interaction_presets',
        'mcp__figmento__make_interactive',
        'mcp__figmento__create_prototype_flow',

        // DS analysis — low usage, pipeline handles
        'mcp__figmento__design_system_preview',
        'mcp__figmento__brand_consistency_check',
        'mcp__figmento__get_layout_blueprint',

        // Learning — never used
        'mcp__figmento__get_learned_preferences',

        // Template — deprecated (scan_frame_structure replaces)
        'mcp__figmento__scan_template',
      ],
      stderr: (data: string) => {
        const t = data.trim();
        if (t) console.error(`[SDK] ${t}`);
      },
      mcpServers: {
        figmento: {
          command: 'node',
          args: [MCP_SERVER_PATH],
          env: Object.fromEntries(
            Object.entries({
              FIGMENTO_CHANNEL: channel,
              FIGMENTO_RELAY_URL: 'ws://localhost:3055',
              GEMINI_API_KEY: process.env.GEMINI_API_KEY,
              ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
              IMAGE_OUTPUT_DIR: process.env.IMAGE_OUTPUT_DIR,
              PATH: process.env.PATH,
              NODE_PATH: process.env.NODE_PATH,
              SYSTEMROOT: process.env.SYSTEMROOT,
              TEMP: process.env.TEMP,
              TMP: process.env.TMP,
              APPDATA: process.env.APPDATA,
              USERPROFILE: process.env.USERPROFILE,
              HOME: process.env.HOME,
            }).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== ''),
          ),
        },
      },
    };

    // Single long-running query — feeds from the AsyncQueue
    const queryObj = query({ prompt: queue as unknown as AsyncIterable<SDKUserMessage>, options });

    const session: ClaudeCodeSession = {
      queue,
      queryObj,
      abortController,
      pendingTurn: null,
      accumText: '',
      accumToolCalls: [],
      turnHistory: history,
      turnMessage: '',
      lastSessionId: '',
      inFlight: false,
      idleTimer: null,
      turnTimer: null,
      staleChecker: null,
      lastActivity: Date.now(),
      hasCalledTool: false,
      activeToolName: null,
      activeToolStartTime: 0,
      onProgress: null,
    };

    this.sessions.set(channel, session);

    // drainLoop runs for the lifetime of the session (non-blocking)
    this.drainLoop(channel, queryObj).catch((err) => {
      console.error(`[Figmento Claude Code] Drain loop fatal error channel=${channel}:`, err);
      this.destroy(channel);
    });

    return session;
  }

  // ─── PRIVATE: drainLoop() ───────────────────────────────────

  /**
   * Consume the SDK's output stream for the lifetime of the session.
   *
   * - Accumulates text and tool calls for the current turn.
   * - On `type === 'result'`: resolves pendingTurn, resets turn state, starts
   *   the 10-min idle timer.
   * - On error: rejects pendingTurn, destroys the session.
   */
  private async drainLoop(channel: string, queryObj: Query): Promise<void> {
    try {
      for await (const msg of queryObj) {
        const session = this.sessions.get(channel);
        if (!session) break; // Session was destroyed while iterating

        // Reset stale activity timer on ANY SDK event
        session.lastActivity = Date.now();

        // Debug: log message types to understand SDK 2.x event timing
        if (process.env.FIGMENTO_SDK_DEBUG === '1') {
          console.log(`[SDK msg] type=${(msg as { type?: string }).type ?? 'unknown'} subtype=${(msg as { subtype?: string }).subtype ?? '-'}`);
        }

        if (msg.type === 'assistant') {
          const content = (msg as any).message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                session.accumText = block.text;
              } else if (block.type === 'tool_use') {
                const toolName = (block as any).name as string;
                session.accumToolCalls.push({ name: toolName, success: true });
                session.hasCalledTool = true;
                // Track active tool for per-tool budget (key by Figmento-stripped name to match TOOL_BUDGETS)
                session.activeToolName = toolName.replace('mcp__figmento__', '');
                session.activeToolStartTime = Date.now();
                // Stream progress to UI
                if (session.onProgress) {
                  try {
                    session.onProgress({
                      type: 'tool_start',
                      toolName: session.activeToolName,
                      toolIndex: session.accumToolCalls.length,
                    });
                  } catch { /* non-critical */ }
                }
              }
            }
          }
        } else if (msg.type === 'tool_progress') {
          // SDK 2.x emits tool_progress periodically during long-running tool calls.
          // The lastActivity reset (line above) already prevents stale timeout — we just
          // need to forward to the UI so it can show "still working..." feedback.
          const progressMsg = msg as { tool_name?: string; elapsed_time_seconds?: number };
          if (session.onProgress && progressMsg.tool_name) {
            try {
              session.onProgress({
                type: 'tool_progress',
                toolName: progressMsg.tool_name.replace('mcp__figmento__', ''),
                elapsedSeconds: progressMsg.elapsed_time_seconds,
              });
            } catch { /* non-critical */ }
          }
        } else if (msg.type === 'auth_status') {
          // SDK 2.x emits auth_status when re-authenticating (token rotation, OAuth refresh).
          // Surface to UI so it can show a status indicator instead of looking frozen.
          const authMsg = msg as { isAuthenticating?: boolean; error?: string };
          if (session.onProgress) {
            try {
              session.onProgress({
                type: 'auth_status',
                isAuthenticating: authMsg.isAuthenticating ?? false,
                authError: authMsg.error,
              });
            } catch { /* non-critical */ }
          }
        } else if (msg.type === 'result') {
          const resultMsg = msg as any;
          if (resultMsg.subtype === 'success' && resultMsg.result) {
            session.accumText = resultMsg.result;
          }

          // Capture session_id for the next message push
          if (resultMsg.session_id) session.lastSessionId = resultMsg.session_id;

          // Clear active tool tracking (turn done)
          session.activeToolName = null;
          session.activeToolStartTime = 0;

          // Clear per-turn timers
          if (session.turnTimer) { clearTimeout(session.turnTimer); session.turnTimer = null; }
          if (session.staleChecker) { clearInterval(session.staleChecker); session.staleChecker = null; }

          // Build updated history
          const updatedHistory = [
            ...session.turnHistory,
            { role: 'user', content: session.turnMessage },
            { role: 'assistant', content: session.accumText },
          ];

          const result: ClaudeCodeTurnResult = {
            type: 'claude-code-turn-result',
            channel,
            text: session.accumText,
            toolCalls: session.accumToolCalls,
            history: updatedHistory,
            completedCleanly: !resultMsg.is_error,
          };

          console.log(
            `[Figmento Claude Code] Turn complete channel=${channel} ` +
            `sessionId=${session.lastSessionId} toolCalls=${result.toolCalls.length} ` +
            `text=${result.text.length}c`,
          );

          // Resolve the waiting turn() Promise
          session.pendingTurn?.resolve(result);
          session.pendingTurn = null;
          session.inFlight = false;

          // Reset accumulation buffers
          session.accumText = '';
          session.accumToolCalls = [];

          // Start idle timer — destroy after 10 min of inactivity (AC11)
          session.idleTimer = setTimeout(() => {
            console.log(`[Figmento Claude Code] Idle timeout channel="${channel}" — destroying session`);
            this.destroy(channel);
          }, IDLE_TIMEOUT_MS);
        }
      }

      // Generator exhausted cleanly (queue closed or maxTurns reached)
      console.log(`[Figmento Claude Code] Session ended cleanly channel="${channel}"`);
    } catch (err) {
      // Error during drain — reject pending turn and destroy session (AC12)
      const session = this.sessions.get(channel);
      if (session?.pendingTurn) {
        session.pendingTurn.reject(err instanceof Error ? err : new Error(String(err)));
        session.pendingTurn = null;
      }
      console.error(`[Figmento Claude Code] Session error channel="${channel}":`, err);
      this.destroy(channel);
    }
  }
}

/** Module-level singleton — instantiated once at relay startup. */
export const sessionManager = new ClaudeCodeSessionManager();
