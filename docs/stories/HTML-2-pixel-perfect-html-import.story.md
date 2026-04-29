# HTML-2 — Pixel-perfect HTML import via computed-style extraction

## Status: Draft — not started

> Builds on `HTML-1` (shipped in commit `0e2886b`, 2026-04-28) which provides interpretive HTML import: drop a .html file, agent reads markup as text and recreates the layout using its design discipline. HTML-2 upgrades that to **1:1 fidelity** by extracting computed CSS values from a real headless browser before the agent touches the canvas.

## Story
**As a** Figmento user with an HTML/CSS landing page already designed in code,
**I want** Figmento to recreate it in Figma with **exact** colors, font sizes, positions, and spacing — not an interpretation,
**so that** I can use Figma as a downstream editing surface for designs that originated in code (or in tools like Webflow / Framer that export HTML).

## Background

HTML-1 ships a fast, useful, but interpretive path: the agent reads the markup as text, picks out the visual tokens it can see in `<style>` blocks, and recreates the layout applying its own design discipline. Output is "designed-in-the-spirit-of" the input — fonts, copy, structure all carry over, but exact pixel positions / computed font sizes / inherited colors are derived from the agent's judgment, not from the actual rendered DOM.

For mockup-style inputs that's fine. For users who already have a polished, working HTML page (e.g. a Tailwind landing page, a Webflow export, a designed email template) and want **exactly that page in Figma**, the V1 approach drifts.

The fix: render the HTML in a headless browser and extract the **computed style** of every visible element — actual rendered fontSize, lineHeight, color (resolved through CSS variables, inheritance, media queries), background, border, position, dimensions. Feed that structured tree to a new MCP tool that maps it 1:1 to Figma primitives.

## Target Flow

```
1. User drops example.html in chat
2. Plugin sends file content + mode='pixel-perfect' to relay
3. New MCP tool: import_html_layout(htmlContent, viewportWidth)
4. MCP tool spawns Puppeteer, loads the HTML in a virtual viewport,
   walks every visible element and extracts:
     - tag, role, text content, computed bounding box (x/y/w/h)
     - computed: fontFamily, fontSize, fontWeight, lineHeight, color,
       backgroundColor, borderRadius, padding, margin, opacity
     - resolved <img> URLs (or base64 if local)
     - z-index / stacking context
5. Tool returns a flat tree of "layout nodes" — each with everything
   needed to create one Figma frame/text/image, no inference required
6. Agent walks the tree top-down, calling create_frame / create_text /
   place_generated_image with the extracted values verbatim
7. Same orphan-cleanup + run_refinement_check ritual at the end
```

## Acceptance Criteria

| # | AC |
|---|---|
| 1 | New MCP tool `import_html_layout(htmlContent: string, viewportWidth?: number, includeImages?: boolean)` registered in figmento-mcp-server, returning structured `{nodes: LayoutNode[]}` JSON. |
| 2 | Puppeteer (already a dep — `scripts/render-html.js` uses it for HTML→PNG) is reused; no new heavy dependency. |
| 3 | Computed styles are extracted via `getComputedStyle(el)` for every visible element with non-zero dimensions. Hidden / `display:none` / `visibility:hidden` / zero-area elements are skipped. |
| 4 | Color values are returned as 6-digit hex (alpha as separate `opacity` field). `rgb()` / `rgba()` / `hsl()` / CSS variables / `currentColor` all resolve correctly. |
| 5 | Font sizes / line-heights / paddings / borders are returned in **device-pixels** at the chosen viewport (default 1440). Rounded to integers; sub-pixel precision dropped. |
| 6 | `<img>` elements: src URLs are resolved (relative → absolute relative to the HTML doc); local file: paths are read and base64-encoded; remote URLs are fetched (with 5s timeout per image, fail-soft to placeholder). When `includeImages: false`, only the bounding box + alt text is returned. |
| 7 | Background images extracted from `background-image: url(...)` are returned alongside element-level images. |
| 8 | The plugin's HTML detection injects a `[FIGMENTO HTML PIXEL-PERFECT MODE]` directive (instead of the V1 interpretive directive) when the user attaches a .html with size > N KB or contains computed indicators of complexity, OR when the user explicitly types "pixel-perfect" / "1:1" / "exato" in the prompt. Otherwise V1 path stays the default. |
| 9 | The agent receives the tree, walks it once with `batch_execute` calls (not turn-by-turn), creates the design with values verbatim, runs the standard cleanup + refinement ritual. |
| 10 | Roundtrip test: export an existing Figma frame as HTML (out of scope for HTML-2 — assume hand-written test fixtures), import it via this tool, screenshot — visual diff against the original ≤ 5% per WCAG-style structural comparison. |
| 11 | Performance: a 200-element HTML page (typical landing page) extracts in < 5 seconds end-to-end. Recreation in Figma uses ≤ 5 batch_execute calls (≈ 200 ops batched). |
| 12 | Graceful failure modes: malformed HTML → tool returns partial tree + warning; missing images → placeholder rectangles labeled with the failed src; absurdly large HTML (> 1000 elements) → tool returns first 1000 + warning to split. |

## Technical sketch

```ts
// figmento-mcp-server/src/tools/html-import.ts (new)

interface LayoutNode {
  id: string;                     // synthetic, e.g. "n_0_3_1"
  parentId: string | null;
  tag: string;                    // 'div', 'h1', 'img', etc
  role: 'frame' | 'text' | 'image';   // mapped to figmento primitive
  bounds: { x: number; y: number; width: number; height: number };
  text?: string;                  // for role='text'
  imageData?: string;             // base64 dataURL, for role='image'
  computedStyle: {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    lineHeight?: number;            // pixels
    letterSpacing?: number;
    color?: string;                 // hex
    backgroundColor?: string;       // hex
    backgroundImage?: string;       // base64 dataURL (resolved)
    borderRadius?: [number,number,number,number]; // TL, TR, BR, BL
    padding?: [number,number,number,number];      // top, right, bottom, left
    opacity?: number;
    boxShadow?: string;             // pass-through; agent translates
  };
  zIndex: number;
}

export async function importHtmlLayout(
  html: string,
  viewportWidth = 1440,
  includeImages = true,
): Promise<{ nodes: LayoutNode[]; warnings: string[] }> {
  // 1. spawn puppeteer, page.setViewport, page.setContent(html)
  // 2. await page.evaluate() walks document.body, returns serialized tree
  // 3. resolve <img> urls in Node land (puppeteer requestInterception OR
  //    fetch() on the relay)
  // 4. close browser, return tree
}
```

## Trade-offs vs HTML-1 (V1)

| Axis | HTML-1 (interpretive) | HTML-2 (pixel-perfect) |
|---|---|---|
| Setup cost | None — already shipped | New MCP tool, ~3-5 days work |
| Speed | < 1s extraction (just text injection) | 3-5s for typical page (Puppeteer cold start + walk) |
| Fidelity | "in the spirit of" — fonts/copy/structure preserved, positions interpreted | 1:1 with computed CSS — colors / sizes / positions exact |
| Agent autonomy | High (agent applies design discipline rules) | Low (agent just transcribes) |
| Best for | Mockups, wireframes, simple landing pages | Polished HTML/CSS, Webflow exports, email templates |
| Edge cases | Can fail on dense / complex layouts | Can fail on JS-rendered content (SPAs needing hydration before snapshot) |

Both modes coexist. The plugin auto-detects which to use; the user can override.

## Out of scope

- **Reverse direction (Figma → HTML):** different problem, separate story.
- **JavaScript-rendered SPAs:** the Puppeteer flow renders the initial HTML only. Pages that require JS hydration before the layout is meaningful (most React/Vue SPAs without SSR) won't work without an explicit `await page.waitForSelector` — could be added as `waitFor` param later.
- **CSS-in-JS frameworks with shadow DOM:** computed styles from shadow DOM are reachable via `getComputedStyle` but require special traversal. Defer.
- **Animations / interactions:** static snapshot only.
- **Responsive breakpoint detection:** the user picks one viewport width per import. Multi-breakpoint export is a future story.

## Sequence

1. Spike: prototype the Puppeteer extractor as a standalone Node script. Verify perf + fidelity on 5 reference pages (caiotti.studio, a Tailwind UI sample, a Webflow export, a basic email template, a simple HTML doc).
2. Wrap as MCP tool with the schema above.
3. Update plugin `buildClientFileContext` to detect "pixel-perfect mode" and inject the appropriate directive.
4. Add the new directive to `figmento-design-prompt.ts` (or a separate prompt-fragment file) so both engines handle it.
5. Test parity: same input on both Codex and Claude Code → outputs should be near-identical (since this mode is mostly transcription, not interpretation).
6. Decision: keep both V1 and V2 paths, or auto-promote based on heuristics?
