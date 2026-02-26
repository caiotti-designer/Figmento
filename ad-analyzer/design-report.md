# Ad Analyzer v2 — Design Report
## Sofá Veneza Cama | ALVES Estofados

**Date:** 2026-02-26
**Platform:** Instagram Feed (1080 x 1350 — 4:5)
**Product:** Sofá Veneza Cama — retrátil, reclinável, 2,20m, Linho Deva
**Figma Frames:** `266:407` (A) · `266:408` (B) · `266:409` (C)

---

## 1. Original Ad Analysis

### What Failed
| Issue | Impact |
|-------|--------|
| **No visual hierarchy** | Brand, headline, specs, price all compete — nothing reads first |
| **Poor contrast** | White text over gray sofa/gray wall — fails WCAG on several elements |
| **Cluttered layout** | Specs crammed into a small blue-gray box with tight line spacing |
| **Weak CTA** | Italic text at bottom with no button, no visual weight, easily missed |
| **Low-quality photo** | Showroom corner shot with visible floor tiles — no lifestyle aspiration |
| **No emotional hook** | Purely informational — reads like a product spec sheet, not an ad |
| **Disconnected price box** | The blue/gray pricing area floats awkwardly at bottom-left |

### What Worked (Salvageable)
- Brand name "ALVES estofados" is legible at top-left (good placement instinct)
- The product info is complete — all specs are present
- Price discount is shown (original → sale price)
- There IS a CTA, even if poorly styled

### Industry Context
- Furniture Instagram Feed CTR: **0.22–0.88%** (industry average)
- Furniture Facebook CTR dropped **46% YoY** to 1.48% in 2025
- Lifestyle imagery + emotional copy can push CTR to **2–3.8%**
- UGC-style and editorial approaches consistently outperform polished-but-generic creatives

---

## 2. Redesign Variants

### Variant A — Luxury Dark Editorial
**Frame ID:** `266:407` | **Export:** `output/eval-A.png`

| Attribute | Detail |
|-----------|--------|
| **Aesthetic** | Luxury editorial — near-black (#0A0A0F) with gold (#C9A84C) accents |
| **Fonts** | Cormorant Garamond 700 (headline) + Proza Libre 400 (body) |
| **Headline** | "Seu refúgio merece um sofá à altura." |
| **Hero image** | AI-generated — same sofa in dark moody room, gold lamp, dark rug, greenery |
| **Contrast** | 17.41:1 (AAA) — cream text on near-black |
| **Target** | Aspirational buyers, 30-50, mid-to-high income, Instagram-savvy |
| **Key decision** | Full-bleed cinematic photo with gradient overlay — hero image does the emotional selling, text provides the rational close |
| **Memorable element** | 72px serif headline in cream over cinematic dark scene — editorial magazine feel |

### Variant B — Fresh Scandinavian
**Frame ID:** `266:408` | **Export:** `output/eval-B.png`

| Attribute | Detail |
|-----------|--------|
| **Aesthetic** | Organic/fresh — warm white (#F0FFF4) with forest green (#2D6A4F) |
| **Fonts** | Cormorant Garamond 700 (headline) + Proza Libre 400 (body) |
| **Headline** | "Design que transforma o seu dia a dia." |
| **Hero image** | AI-generated — same sofa in bright Scandinavian room, oak floors, big windows, plants |
| **Contrast** | 10.72:1 (AAA) — dark green text on warm white |
| **Target** | Young couples, first apartment, modern minimalist aesthetic |
| **Key decision** | Bright airy photo creates instant aspiration — forest green CTA stands out against light bg |
| **Memorable element** | Lush green palette + sunny interior — feels like bringing nature indoors |

### Variant C — Layout-Only Redesign (Original Copy + Photo)
**Frame ID:** `266:409` | **Export:** `output/eval-C.png`

| Attribute | Detail |
|-----------|--------|
| **Aesthetic** | Deep navy editorial (#1A1A2E → #16213E) with cream (#F5F0E8) |
| **Fonts** | Cormorant Garamond 700 (headline) + Proza Libre 400 (body) |
| **Copy** | 100% verbatim from original ad — zero changes |
| **Photo** | Original ad photo — zero changes |
| **Contrast** | 15.04:1 (AAA) — cream on navy |
| **Purpose** | Prove that layout and hierarchy alone — without new photos or copy — dramatically outperform the original |
| **Key decision** | Separated photo (top 60%) from text zone (bottom 40%) with gradient overlay. Proper type scale creates instant readability. CTA is now a real button. |
| **Note** | The original ad's baked-in text overlay is visible in the photo — in production, a clean product shot would be used |

---

## 3. A/B Test Recommendation

### First Test: Variant A vs Variant B
**Why:** Both have new lifestyle imagery and emotional copy, but target opposite moods (luxury dark vs fresh bright). This test isolates the emotional direction that resonates most with the ALVES audience.

**Expected outcome:** Variant A likely wins on conversion rate (luxury/scarcity triggers), Variant B likely wins on engagement rate (bright imagery gets more saves/shares). Run for 7 days minimum with equal budget split.

### Second Test: Winner of A/B vs Variant C
**Why:** This answers the critical question — "Was it the new photo/copy, or just the better layout?" If Variant C performs within 20% of the A/B winner, it means layout was the primary lever, and future ads can be improved with design alone (faster, cheaper).

### Budget Allocation
- 40% to Variant A
- 40% to Variant B
- 20% to Variant C (control for layout effect)

---

## 4. Variant C's ROI Story

Variant C exists to prove a business case: **you don't always need new photography or copywriting to improve ad performance.**

What changed in Variant C vs the original:
1. **Clear hierarchy** — headline is 64px Cormorant Garamond Bold, instantly readable
2. **Proper text zone** — specs separated from photo, no text fighting with product imagery
3. **Real CTA button** — cream button with navy text, visually dominant
4. **Professional color palette** — navy + cream replaces the amateur gray-on-gray
5. **Contrast compliance** — 15.04:1 vs the original's estimated 2-3:1 in places
6. **Consistent spacing** — 8px grid, proper margins (60px sides), breathing room

If Variant C outperforms the original by even 50% (in CTR or conversion), it justifies investing in design systems and layout templates for the entire ALVES product catalog — a scalable improvement that doesn't require per-ad photoshoots.

---

## 5. Technical Notes

### Bugs / Issues During Build
| Issue | Resolution |
|-------|-----------|
| `place_generated_image` not supported in `batch_execute` | Called separately after batch for each hero image |
| `IMAGE_OUTPUT_DIR` mismatch | Images generated to `generated-images/`, copied to `output/` before placement |
| `evaluate_design` threw "Cannot unwrap symbol" | Used `export_node_to_file` with unique filenames as fallback |
| Original ad is `.jpg` not `.png` (MISSION.md says .png) | Used the actual `.jpg` file |

### Design Tokens Used
- **Palettes:** luxury-premium (#0D0D0D, #C9A84C, #F5F0E8) + nature-organic (#2D6A4F, #40916C, #F0FFF4, #1B4332) + custom navy (#1A1A2E, #16213E)
- **Fonts:** Cormorant Garamond (400, 700) + Proza Libre (400, 700) — never used fontWeight 600
- **Spacing:** 8px grid, 60px side margins, 48px top margin
- **Contrast:** All variants pass WCAG AAA (17.41:1, 10.72:1, 15.04:1)

### Evaluation Exports
| Variant | File | Size |
|---------|------|------|
| A | `output/eval-A.png` | 2.9 MB |
| B | `output/eval-B.png` | 2.8 MB |
| C | `output/eval-C.png` | 2.0 MB |

---

## 6. Next Steps for the Client

1. **Get a clean product shot** — the original photo has text baked in. A clean shot would improve Variant C significantly
2. **Export all 3 variants** from Figma and set up the A/B test on Meta Ads Manager
3. **Consider carousel format** — show the sofa from multiple angles (open, closed, reclined) in a 3-slide carousel
4. **Test Reels/Stories (9:16)** — the same layouts can be adapted to vertical format for higher engagement
5. **Build a brand kit** — ALVES should have a consistent visual system (the luxury palette works well for their positioning)
6. **Refresh creatives every 2-3 weeks** — ad fatigue is real, especially on Instagram
7. **Connect CTA to WhatsApp Business** — "FALE CONOSCO" needs a real destination

---

*Generated by Ad Analyzer v2 — Figmento MCP + Claude*
*Industry benchmarks sourced from WebFX, WordStream, Focus Digital, Varos (2025)*
