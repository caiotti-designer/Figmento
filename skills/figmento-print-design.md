# Print Design Rules — Figma Skill

Mandatory rules for A4, A3, brochure, poster, and other print layouts in Figma. Violating these creates unprintable designs.

---

## Rule 1: Auto-Layout Only (No Absolute Positioning)

**NEVER use absolute x/y positioning on print pages.** At 2480x3508px (A4 at 300dpi), absolute positioning creates unpredictable gaps between elements.

Every frame in a print design must use auto-layout:
- Root page frame: `layoutMode: "VERTICAL"`
- Content sections: `layoutMode: "VERTICAL"` or `"HORIZONTAL"`
- Card grids: `layoutMode: "HORIZONTAL"` with wrap
- Text groups: `layoutMode: "VERTICAL"` with `layoutSizingVertical: "HUG"`

## Rule 2: Mandatory Page Structure

```
Page Frame (VERTICAL auto-layout, padding 72px all sides)
├── Header (HORIZONTAL auto-layout)
│   ├── Logo
│   └── Page title / date
├── Main Content (VERTICAL auto-layout, gap 32-48px)
│   ├── Section (VERTICAL auto-layout, gap 16px)
│   │   ├── Section heading
│   │   ├── Body text
│   │   └── Image or chart
│   ├── Card Grid (HORIZONTAL auto-layout, gap 16px)
│   │   ├── Card 1
│   │   ├── Card 2
│   │   └── Card 3
│   └── Full-width image
└── Footer (HORIZONTAL auto-layout)
    ├── Page number
    └── Contact info
```

## Rule 3: Print Typography Minimums

Body text MUST be readable when printed. These are absolute minimums at 300dpi:

| Role | Minimum Size | Recommended | Weight |
|------|-------------|-------------|--------|
| Body | 24px | 28-32px | 400 |
| Caption | 18px | 20-22px | 400 |
| H3 / Subheading | 28px | 32-36px | 600 |
| H2 / Section Title | 36px | 40-48px | 700 |
| H1 / Page Title | 48px | 56-72px | 700 |
| Display / Cover | 96px | 96-120px | 700-900 |

### Size Ratios (Enforced)

- H1 >= 2.5x body size
- H2 >= 1.5x body size
- H3 >= 1.1x body size
- Display >= 3x body size

## Rule 4: Print Spacing Scale

| Context | Value |
|---------|-------|
| Page margin (all sides) | 72px |
| Section gap | 48-64px |
| Content gap (within section) | 24-32px |
| Element gap (tight) | 12-16px |
| Card internal padding | 24-32px |
| Header/footer separation | 48px |

## Rule 5: Print Dimensions

| Format | Pixels (300dpi) | mm |
|--------|----------------|-----|
| A4 Portrait | 2480 x 3508 | 210 x 297 |
| A4 Landscape | 3508 x 2480 | 297 x 210 |
| A3 Portrait | 3508 x 4961 | 297 x 420 |
| Letter Portrait | 2550 x 3300 | 216 x 279 |
| Business Card | 1050 x 600 | 89 x 51 |

## Rule 6: Content Frames Must HUG

Never set a fixed height on content frames containing text:

- `layoutSizingVertical: "HUG"` — content determines height
- `layoutSizingHorizontal: "FILL"` — frame fills available width

Fixed height clips text when content grows. This is the #1 cause of broken print layouts.

## Rule 7: Multi-Page Layouts

When creating brochures or multi-page documents:

- Each page is a separate root frame (same dimensions)
- Place pages side by side with **200px horizontal gap**
- Name frames: "Page 1 — Cover", "Page 2 — Contents", etc.
- Maintain consistent margins, header/footer placement across all pages

### Background Color Rhythm

For multi-section single-page or multi-page layouts:

```
Page 1: Primary color (bold open)
Page 2: Surface/white (breathe)
Page 3: Background/light (breathe)
Page 4: Primary color (bold break)
Page 5: Surface/white (breathe)
Page 6: Primary color (bold close)
```

Never use the same background color on 3+ consecutive sections.

---

*Figmento Design Intelligence — figmento.dev*
