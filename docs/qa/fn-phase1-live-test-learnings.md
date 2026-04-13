# FN Phase 1 Live Test — Learnings & Future Improvements

**Date started:** 2026-04-12
**Collected by:** @pm (Morgan)
**Purpose:** Capture issues, gaps, and improvement opportunities discovered while running the FN Phase 1 live test plan ([fn-phase1-live-test-plan.md](fn-phase1-live-test-plan.md)). These learnings feed back into skill refinement, plugin improvements, and future story drafts.

---

## How to Use This Document

Each learning has a **severity**, **category**, and **proposed action**. Items marked [CRITICAL] block Figma Community publishing. Items marked [HIGH] should be addressed before next FN phase. Items marked [MEDIUM/LOW] are captured for backlog prioritization.

**Categories:**
- **Plugin Gap** — Figmento plugin/batch handler issue that affected test execution
- **Skill Refinement** — The skill file itself could be clearer, more compact, or better structured
- **Test Process** — How we run tests could be improved
- **Delivery Path** — Gaps between Figmento path and `use_figma` native path

---

## Test 2 — FN-2 Text-to-Layout (2026-04-12)

### Learning 2.1 — `set_style` action not recognized in `batch_execute` [HIGH — Plugin Gap] ✅ **RESOLVED BY FN-P4-1 (2026-04-12)**

**Observed:** The `batch_execute` handler rejected `set_style` with "Unknown action in batch: set_style". This broke gradient application on the Maison Levain design. Had to approximate gradients with layered opaque rectangles.

**Root cause:** The Figmento batch DSL accepts consolidated tool names (`set_style` with `property: "fill"`) via the MCP server, but the plugin-side `executeSingleAction` dispatcher only recognizes the legacy granular names (`set_fill`, `set_stroke`, `set_effects`, `set_corner_radius`, `set_opacity`). The consolidation from TC-1 happened on the MCP tool surface but was never pushed through to the sandbox action router.

**Proposed action:**
- **Short-term (skill refinement):** Update `figmento-text-to-layout.md` and related skills to use `set_fill` in batch contexts when gradient is needed, not `set_style`. Document the batch action whitelist.
- **Long-term (plugin fix):** Story — extend `executeSingleAction` in `canvas-batch.ts` to accept the consolidated `set_style` action names and route internally. Aligns batch DSL with MCP surface.
- **Workaround during testing:** Use layered rectangles with explicit opacity to simulate gradients when batching.

**Affected stories/skills:** FN-2, FN-3, FN-4 (all 3 remaining skills use `set_fill` gradient patterns). Likely also affects LC/ODS batches that touch fills.

---

### Learning 2.2 — Text nodes overflow without explicit `width` in non-auto-layout parents [HIGH — Skill Refinement]

**Observed:** First attempt at the Maison Levain headline wrapped vertically letter-by-letter because `create_text` was called without a `width` parameter inside a `layoutMode: NONE` root frame. Result: "Autumn Has Arrived" rendered as a single-column vertical stack overflowing 1000+ pixels below the frame.

**Root cause:** The Figma Plugin API creates text nodes with `textAutoResize: "WIDTH_AND_HEIGHT"` by default. When you want multi-line wrapping, you must either:
1. Set `textAutoResize: "HEIGHT"` + explicit `width`, or
2. Put the text inside an auto-layout container that constrains the width.

The FN-2 skill's code examples show both patterns but doesn't call out this gotcha explicitly.

**Proposed action:**
- **Short-term:** Add a "Text Wrapping Rule" box to each FN-2/3/4 skill explaining: "When placing text at absolute coordinates (non-auto-layout parent), ALWAYS set `width` explicitly on the text node. Otherwise the Figma API auto-resizes the text width to fit content, which causes vertical wrapping on long strings."
- **Long-term:** Consider adding a linter to the refinement engine that flags text nodes with no explicit width inside NONE-layout parents.

**Affected stories/skills:** FN-2, FN-3, FN-4 (all skills with text placement)

---

### Learning 2.3 — `set_style` also failed outside batch (same root cause) [LOW — Documentation]

**Observed:** Not re-tested, but follows from 2.1. The consolidated `set_style` action is MCP-tool-facing, not plugin-action-facing.

**Proposed action:** Update [CLAUDE.md](../../CLAUDE.md) "Consolidated Tools" section to clarify: "`set_style` is the MCP tool consolidation surface — internally it dispatches to `set_fill`/`set_stroke`/`set_effects`/`set_corner_radius`/`set_opacity`. When calling via `batch_execute` DSL, use the granular action names."

---

### Learning 2.4 — Auto-layout warning on root frames is a false positive for editorial designs [LOW — Refinement Engine]

**Observed:** The refinement engine flags: `"Frame has 8 children but no auto-layout (layoutMode: NONE)"`. For editorial layouts where precise absolute positioning is the intent (overlapping elements, gradient washes at specific pixel positions, oversized headlines breaking the grid), auto-layout is inappropriate. The warning creates noise.

**Proposed action:**
- **Option A:** Add a skill-declared `"intent": "editorial"` flag on the root frame that suppresses the warning.
- **Option B:** Adjust the check to only warn when children are rectangular/grid-aligned. Editorial compositions with intentional overlap get a pass.
- **Option C:** Keep the warning but downgrade to `info` severity for root frames on single-design contexts.

**Priority:** LOW — the warning is advisory, not blocking. Fine to defer.

---

### Learning 2.5 — Warm-cozy palette flipped to moody variant was the right creative call [POSITIVE]

**Observed:** The skill maps `warm-cozy` to a light palette (#FFF8F0 background). For this brief, I flipped to a dark editorial variant (#2C1810 background with warm accent wash) because "premium food magazine editorial" called for dark depth, not bright cafe vibes. Result: the final design reads as editorial/premium, not generic bakery Instagram.

**Proposed action:** Add a "Mood Variants" column to the Mood-to-Palette table. Each mood could have a light and dark variant, with guidance on when to choose each:
- `warm-cozy-light` — default for bakery/cafe/breakfast/morning contexts
- `warm-cozy-dark` — editorial/premium/evening/moody contexts

This would give the skill explicit permission to make the creative call instead of the LLM improvising.

---

### Learning 2.6 — Test pre-flight should include plugin action whitelist check [MEDIUM — Test Process]

**Observed:** The first batch had 2 failures because the test runner (me) assumed `set_style` worked in batch. A pre-flight smoke test would catch this: issue a single `set_style` command before the real design, verify it succeeds or fails, and pick the right action name for the actual batch.

**Proposed action:** Add to the test plan's environment verification checklist:
```
# Smoke test the action whitelist
mcp__figmento__batch_execute commands=[{action:"set_fill",...}]
mcp__figmento__batch_execute commands=[{action:"set_style",...}]
# Confirm which names the batch dispatcher recognizes
```

---

## Summary — Test 2

| Category | Count |
|----------|-------|
| Plugin Gap (HIGH) | 1 (set_style not in batch) |
| Skill Refinement (HIGH) | 1 (text width gotcha) |
| Skill Refinement (MEDIUM) | 1 (mood palette variants) |
| Test Process (MEDIUM) | 1 (pre-flight smoke test) |
| Documentation (LOW) | 1 (CLAUDE.md clarify) |
| Refinement Engine (LOW) | 1 (editorial layout false positive) |
| Positive observations | 1 (mood flip was right call) |

**Net:** Test 2 passed (8.05/10) but surfaced 2 HIGH-priority improvements. The plugin gap (2.1) is the most impactful — it affects every skill that uses gradients via batch.

---

## Test 3 — FN-3 Carousel/Multi-Slide (2026-04-12)

### Learning 3.1 — Repetitive batch patterns expose an IDEAL use case for the `repeat` DSL construct [HIGH — Skill Refinement + Plugin Opportunity]

**Observed:** I built 5 slides by manually duplicating the same 8-9 commands per slide (pagination, brand mark, slide number, sign label, headline, body, handle, accent stripe). That's ~45 commands for 5 slides. Each slide differed only in: position, slide number, content strings. The Enhanced Batch DSL (`repeat` construct from FN-P3-1) is literally designed for this — but the FN-3 skill doesn't mention it.

**Root cause:** The FN-3 skill was written before FN-P3-1 shipped. It predates the Enhanced Batch DSL entirely.

**What it should do:** Use a `repeat` construct to generate slides 2..N from a template, with `${i}` interpolation for position and content index. Example:
```javascript
{
  action: "repeat",
  count: 3,  // slides 2, 3, 4
  template: {
    action: "create_frame",
    params: { name: "Slide ${i + 2}", x: "${(i + 1) * 1120}", width: 1080, height: 1080, fillColor: "#0D1117" },
    tempId: "slide_${i}"
  }
}
```

**Proposed action:**
- **Short-term (skill refinement):** Add a new section to `figmento-carousel-multi-slide.md` titled "Batch Efficiency with Repeat Construct" with a worked example showing how to generate N slides in one batch via `repeat`. Target: halve the command count for a 5-slide carousel (45 → ~20 with repeat).
- **Cross-skill:** The same pattern applies to FN-1 pricing cards (N cards) and FN-4 ad variants (N variants). Document once, reference from all.

**Priority:** HIGH — this is a measurable performance + clarity improvement for the highest-volume skills.

---

### Learning 3.2 — Tech-modern flat aesthetic avoids all gradient-related plugin gaps [POSITIVE + Design Insight]

**Observed:** Test 3 had zero plugin errors (46/46 commands succeeded) compared to Test 2's gradient workarounds. The tech-modern mood intentionally uses flat blocks, solid accents, and high-contrast typography — no gradients, no overlays, no complex fills.

**Implication:** The Figmento `batch_execute` DSL is currently **most reliable for flat/geometric/minimal aesthetics**. Editorial/moody/cinematic moods that rely on gradient depth hit the `set_style` gap (see Learning 2.1).

**Proposed action:** Update the Mood Selection guide in FN-2 to note: "If execution reliability is the priority (e.g., batch-heavy automated pipelines), prefer moods that don't require gradients: tech-modern, minimal-clean, corporate-professional. Moody/editorial moods need gradient workarounds until Plugin Gap 2.1 is fixed."

**Priority:** MEDIUM — workaround guidance, not a blocker.

---

### Learning 3.3 — Cross-slide consistency requires external state tracking [MEDIUM — Skill Refinement]

**Observed:** The FN-3 skill says "Record these values. You will reuse them on every subsequent slide" but doesn't tell the LLM *how* to record them when operating in a stateless batch context. I ended up literally copying the hex values into every slide by hand.

**Root cause:** The LLM has no persistent scratch state between tool calls. "Record these" only works if the LLM re-reads them from its own context window on each slide.

**What it should do:** The skill should give the LLM a concrete template to fill out before slide 1, like:
```
DESIGN SYSTEM LOCK
Background    : #0D1117
Accent        : #58A6FF
Heading font  : Inter Bold 62px (content), Inter Bold 128px (cover/CTA)
Body font     : Inter Regular 22px
Margins       : 80px all sides
Safe zones    : 80px top/bottom
Continuity    : Bottom accent stripe at y=1000, 120×4px, #58A6FF
```
Then say: "Before each slide, re-read the DESIGN SYSTEM LOCK. Every value must match."

**Proposed action:** Add a "Design System Lock" template to FN-3 skill Step 4. Make it the explicit output of "establishing the design system" — a re-readable block, not implicit memory.

**Priority:** MEDIUM — affects consistency drift risk on longer carousels (10+ slides).

---

### Learning 3.4 — Slide number + label pattern is more memorable than any blueprint [POSITIVE + Pattern Discovery]

**Observed:** The most successful design decision was using a giant slide number ("01", "02", "03") as the dominant visual element on content slides, paired with a small "— SIGN N°0X" kicker in a warning-orange accent. This broke the "every content slide looks the same" problem without breaking consistency.

**Why it worked:**
1. Creates a repeating rhythm (same pattern, different number)
2. Acts as its own pagination indicator (redundant with top-right "0X/05" but reinforcing)
3. Uses the number as a design feature, not an afterthought
4. The warning-orange accent draws the eye to the pain-point framing

**Proposed action:** Add a "Numeric Anchor Pattern" to the FN-3 "Visual Continuity Element" section. Document when to use it:
- **Good for:** List-based carousels ("5 signs", "7 tips", "3 mistakes")
- **Bad for:** Narrative carousels ("our story", "how we started")
- **Key:** The big number must be positioned consistently (same x,y on every content slide)

**Priority:** MEDIUM — pattern library improvement, not a correctness fix.

---

### Learning 3.5 — Auto-layout warning fires on EVERY slide with absolute positioning [LOW — Refinement Engine]

**Observed:** Same as Learning 2.4 but compounded — 5 slides, 5 warnings. For carousels/presentations where each slide is a self-contained editorial composition, the warning is noise on every frame.

**Proposed action:** Extend Learning 2.4's fix to cover multi-frame contexts. A carousel/presentation parent should suppress auto-layout warnings on its children if they have a consistent structure. OR: downgrade the warning to `info` severity when the frame is part of a group of same-sized sibling frames (heuristic: same W/H, side-by-side positioning).

**Priority:** LOW — advisory noise, not blocking.

---

## Summary — Test 3

| Category | Count |
|----------|-------|
| Skill Refinement (HIGH) | 1 (repeat construct integration) |
| Skill Refinement (MEDIUM) | 2 (design system lock template, numeric anchor pattern) |
| Plugin Gap follow-up (MEDIUM) | 1 (mood selection guidance) |
| Refinement Engine (LOW) | 1 (multi-frame auto-layout warning) |
| Positive observations | 2 (flat aesthetic reliability, numeric anchor pattern) |

**Net:** Test 3 passed with a higher score than Test 2 (8.65 vs 8.05). The repetitive structure played to the batch DSL's strengths. Biggest opportunity: integrate the `repeat` DSL construct into FN-3 for 50%+ command reduction.

---

## Test 4 — FN-4 Ad Analyzer (2026-04-12)

### Learning 4.1 — `create_rectangle` in `batch_execute` silently ignores `fillColor` parameter [CRITICAL — Plugin Gap] ✅ **RESOLVED BY FN-P4-1 (2026-04-12)**

**Observed:** During Variant A/B/C construction, every `create_rectangle` command included `fillColor: "#..."` as a parameter. All 3 rectangles were created successfully but with **empty fills arrays** (`fills: []`). The hero image placeholder rectangles were completely invisible in the rendered output.

**Diagnosis steps:**
1. `get_node_info` on each rectangle confirmed `fills: []` despite the batch reporting `success: true`
2. Standalone `set_style(property="fill", color="#...")` calls on the same node IDs applied fills correctly
3. Therefore the fill handling works at the dispatcher level but the batch `create_rectangle` path isn't routing `fillColor` to the fill setter

**Root cause hypothesis:** The `handleCreateRectangle` function in `canvas-create.ts` may not be reading the `fillColor` parameter the same way as the create-frame flow does. Or the batch path bypasses whatever sets the initial fill. Either way — the parameter is in the tool schema (MCP tools accept it) but the sandbox handler drops it.

**Impact:**
- **CRITICAL for FN-4** — ad designs rely heavily on image placeholder rectangles
- **HIGH for FN-1** — pricing card backgrounds, hero image blocks
- **HIGH for FN-2** — any skill using solid rectangles as composition elements
- **MEDIUM for FN-3** — flat slides usually use frame fills not rectangle fills

**Workaround used today:** Create rectangle with `fillColor`, then immediately call `set_style(property="fill")` on the returned nodeId. Works but doubles the command count for every rectangle. For a 3-variant ad set that's 3-6 extra commands.

**Proposed action:**
- **Immediate (skill refinement):** Update all 4 skills with a note: "Figmento plugin gap: `create_rectangle` in batch_execute does not apply `fillColor`. After creating a rectangle, follow up with `set_style(property='fill')` on the returned nodeId. Track this until plugin fix ships."
- **Plugin fix:** Story — audit `canvas-create.ts` handlers (`handleCreateRectangle`, `handleCreateFrame`, `handleCreateEllipse`) to ensure `fillColor` is read and applied consistently at creation time. Add unit test: "After create_rectangle with fillColor, node.fills is non-empty."
- **Regression test:** Add to the test plan's environment verification: "Smoke test `create_rectangle({fillColor: '#FF0000'})` — verify fills are non-empty on the created node."

**Priority:** **CRITICAL** — this broke Test 4 visually until recovered. Would have blocked Community publishing if discovered later.

---

### Learning 4.2 — Nested auto-layout frames with explicit `width` bleeding past parent bounds [HIGH — Skill Refinement + Plugin Behavior]

**Observed:** In the first attempt at Variant C, I placed a `PRICE_ROW` auto-layout frame with `width: 960` as a child of the root frame. Inside it, I put a `PRICE_BLOCK` (vertical stack with price text) and a `DISCOUNT_BADGE` (circular pill) with `itemSpacing: 20`. The resulting row bled off the right edge of the 1080px parent frame because the intrinsic width of the two children + gap exceeded 960px.

**Root cause:** I set `width: 960` on the row (fixed) but the children used `layoutSizingHorizontal: "HUG"` (intrinsic). Auto-layout rows with mixed sizing modes will lay out children at their intrinsic widths and let them overflow the declared width. The row's declared width becomes visual-only (no clipping).

**What I should have done:** Either (a) set the row's width to something that comfortably fits the children, or (b) use `layoutSizingHorizontal: "FILL"` on the children with explicit max widths, or (c) drop the row and use absolute positioning on both children.

**Workaround used:** Rebuilt Variant C with absolute positioning on both the price block and the discount badge. Trade-off: lost the "row" abstraction but gained deterministic positioning.

**Proposed action:** Add to FN-1/2/3/4 skills: "Nested auto-layout gotcha — a parent row with a fixed width + children with HUG sizing can overflow the parent silently. Test: does the sum of children widths + (N-1) × itemSpacing fit inside the parent width? If not, either shrink children or shrink spacing or switch to absolute positioning."

**Priority:** HIGH — this gotcha is easy to hit when building card grids, pricing tables, ad layouts.

---

### Learning 4.3 — Real-world ad input beats synthesized baselines by 10x [POSITIVE + Test Process]

**Observed:** Using a real ALVES Estofados ad instead of generating a synthesized "bad ad" baseline produced:
1. **Authentic critique signal** — the ad's actual problems (invisible discount, buried CTA, unreadable bullets, center-everything composition) are things synthetic ads rarely capture well
2. **Verbatim copy preservation test** — real ads have real Portuguese product copy with specific technical terms ("Linho Deva", "3 lugares", "retrátil e reclinável"). Variant C's ability to preserve this verbatim is a stronger proof than any synthesized test
3. **Genuine variant differentiation** — because I had to work with real constraints (price point, discount amount, platform, audience), the 3 variants naturally diverged instead of all being "tech startup variants of each other"

**Proposed action:** Update the test plan to recommend real-world input when available:
> **Preferred:** A real ad the user has (client work, brand they follow, screenshot from IG). Real ads expose real problems.
> **Fallback:** Generate a synthesized baseline only if no real ad is available.

**Priority:** MEDIUM — test process improvement.

---

### Learning 4.4 — Variant C "layout-only" is the most commercially valuable output [POSITIVE + Pattern Discovery]

**Observed:** The three variants produce different business value:
- **A (Urgency)** — highest predicted CTR, but the client has to accept a completely new creative direction
- **B (Editorial)** — establishes brand positioning, but weak for direct-response performance
- **C (Layout-Only)** — keeps the client's copy, keeps their brand voice, keeps their photo. Only changes how information is prioritized. This is the **ROI argument**: "same message, 10x clearer execution."

**Why C is the killer deliverable:**
1. **Client objection proof** — "You changed our copy" → "No, every word is verbatim from your original"
2. **Same-input comparison** — A/B test results can't be dismissed as "different message, different audience"
3. **Teaches the client design principles** without lecturing them

**Proposed action:** Elevate "Variant C Layout-Only" from "third variant" to "primary deliverable" in the FN-4 skill. Restructure the workflow:
```
Phase 4 — Construction
  Variant C (REQUIRED) — layout-only, same copy verbatim
  Variant A (RECOMMENDED) — creative direction 1
  Variant B (OPTIONAL) — creative direction 2
```
Frame C as "the ROI anchor" and A/B as "creative exploration".

**Priority:** HIGH — this is a positioning/framing change to the skill that sharpens its value proposition.

---

### Learning 4.5 — Spacing rule enforcement triggers on auto-layout internals but not absolute layouts [LOW — Refinement Engine]

**Observed:** The refinement engine flagged `itemSpacing: 10` on Pronta Entrega Badge and `itemSpacing: 2` on Discount Badge as off the 8px scale. Both were intentional:
- `10px` was the visual gap between dot and text in the pill (4 or 8 would feel too tight, 12 too loose)
- `2px` was the stack gap between "-20%" and "ECON R$ 1.070" inside the circular badge (needs to be tight)

These sub-grid values are legitimate for small components where 8px would break the proportions.

**Proposed action:** Refinement engine should treat spacing inside auto-layout containers ≤ 80px wide as exempt from the 8px rule (or use a 4px sub-grid for small components). OR: allow explicit `spacing_override: true` on children to suppress the warning.

**Priority:** LOW — advisory noise, recoverable.

---

## Summary — Test 4

| Category | Count |
|----------|-------|
| **Plugin Gap (CRITICAL)** | **1 (create_rectangle fillColor ignored in batch)** |
| Skill Refinement (HIGH) | 2 (nested auto-layout overflow, Variant C elevation) |
| Test Process (MEDIUM) | 1 (prefer real-world inputs) |
| Refinement Engine (LOW) | 1 (small-component spacing exemption) |
| Positive observations | 2 (real input quality, Variant C commercial value) |

**Net:** Test 4 passed (8.05/10) but surfaced the **first CRITICAL plugin gap** of the session — `create_rectangle` silently drops `fillColor` in batch mode. This is a ship-blocker for Community publishing and should be the highest-priority plugin fix in the FN epic backlog.

---

## Overall Summary — All 4 Tests Complete

| Test | Skill | Score | Verdict | Session Duration |
|------|-------|-------|---------|------------------|
| 1 | FN-1 Screenshot-to-Layout | ≥12/16, ≥7/10 | PASS (prior) | — |
| 2 | FN-2 Text-to-Layout | 12/14, 8.05/10 | **PASS** | ~8 min + 1 rebuild |
| 3 | FN-3 Carousel | 12/13, 8.65/10 | **PASS** | ~10 min |
| 4 | FN-4 Ad Analyzer | 12/13, 8.05/10 | **PASS** | ~15 min + 2 rebuilds |

### Aggregated Learnings by Priority

| Priority | Count | Theme |
|----------|-------|-------|
| **CRITICAL** | 1 | Plugin: `create_rectangle` drops `fillColor` in batch |
| **HIGH** | 5 | `set_style` batch gap, text width gotcha, repeat construct, nested AL overflow, Variant C elevation |
| **MEDIUM** | 4 | Mood variants, design system lock, real-world inputs, mood-reliability guidance |
| **LOW** | 3 | Refinement engine false positives (editorial, multi-frame, small-component spacing) |
| **POSITIVE** | 5 | Mood flip call, flat aesthetic reliability, numeric anchor pattern, real input quality, Variant C commercial value |

### Top 3 Actions Before Community Publishing

1. **[CRITICAL]** Fix `create_rectangle` batch fill gap in Figmento plugin. Story target: canvas-create.ts handler audit. Without this fix, every ad/card design needs double commands.
2. **[HIGH]** Fix `set_style` batch dispatch for granular action names (or consolidate batch names to match MCP surface). Affects all gradient work.
3. **[HIGH]** Integrate FN-P3-1 `repeat` DSL construct into FN-3 skill. Halves carousel/presentation command counts.

Once those three land, re-run smoke tests on the 3 affected tests (2, 3, 4) to verify the workarounds aren't needed and the skills produce clean output on first batch.

---
