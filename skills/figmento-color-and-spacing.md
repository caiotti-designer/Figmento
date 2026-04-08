# Color System & Spacing Grid — Figma Skill

Mood-based color palettes, WCAG contrast rules, and the 8px spacing grid. Load this skill when creating any design in Figma.

---

## The 8px Grid Law

**Every spacing value must come from this scale:**

`4 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 64 | 80 | 96 | 128`

Never use arbitrary values like 13px, 17px, or 23px. Round to the nearest grid value.

### Spacing by Context

| Context | Values | Example |
|---------|--------|---------|
| Tight (icon-to-label, inline) | 4-8px | Icon gap inside button |
| Compact (list items, dense UI) | 8-12px | Menu items |
| Default (paragraph gaps, padding) | 16-24px | Card padding |
| Section (between content groups) | 32-48px | Feature section gap |
| Large (page-level section breaks) | 64-96px | Hero to next section |
| Dramatic (print margins, luxury) | 96-128px | Poster margins |

### Format-Specific Margins

| Format | Margin | Safe Zone |
|--------|--------|-----------|
| Instagram (1080px) | 48px | Top 150px, Bottom 150px (username/caption) |
| TikTok/Story (1080x1920) | 48px | Top 100px, Bottom 200px, Right 100px (buttons) |
| YouTube Thumbnail (1280x720) | 40px | Bottom-right 120px (timestamp) |
| Facebook (1200x630) | 48px | Bottom 80px (reactions) |
| Web Hero (1440px+) | 64px | No platform overlay |
| Print A4 (2480x3508) | 72px | 72px all sides (bleed safety) |
| Presentation (1920x1080) | 64px | Bottom 80px (slide controls) |
| Poster (2480x3508+) | 96px | 96px all sides |

## Mood-Based Color Palettes

Each palette provides 6 colors: primary, secondary, accent, background, surface, text.

### Dark Palettes

**moody-dark** (coffee, whiskey, noir)
`#2C1810` `#4A2C2A` `#D4A574` `#1A0F0A` `#2C1810` `#F5E6D3`

**tech-modern** (SaaS, digital, developer)
`#0D1117` `#161B22` `#58A6FF` `#010409` `#0D1117` `#E6EDF3`

**luxury-premium** (fashion, jewelry, high-end)
`#1A1A1A` `#2D2D2D` `#C9A84C` `#0A0A0A` `#1A1A1A` `#F5F0E8`

### Light Palettes

**fresh-light** (health, wellness, eco)
`#4CAF50` `#81C784` `#29B6F6` `#F1F8E9` `#FFFFFF` `#1B5E20`

**minimal-clean** (portfolio, monochrome)
`#000000` `#333333` `#0066CC` `#FAFAFA` `#FFFFFF` `#111111`

**ocean-calm** (spa, wellness, travel)
`#0077B6` `#00B4D8` `#90E0EF` `#CAF0F8` `#FFFFFF` `#023E8A`

### Warm Palettes

**warm-cozy** (bakery, cafe, autumn)
`#C2590A` `#D4783A` `#E8A87C` `#FFF3E0` `#FFFFFF` `#3E2723`

**sunset-energy** (sports, music, passion)
`#E63946` `#F4845F` `#E9C46A` `#FFF8E1` `#FFFFFF` `#1D3557`

**retro-vintage** (craft, nostalgia)
`#D4A373` `#E9C46A` `#E76F51` `#FEFAE0` `#FFFFFF` `#264653`

### Professional Palettes

**corporate-professional** (finance, enterprise)
`#1E3A5F` `#2A5298` `#3182CE` `#EBF8FF` `#FFFFFF` `#1A202C`

**nature-organic** (sustainability, farming)
`#2D6A4F` `#52B788` `#B7791F` `#F0FFF4` `#FFFFFF` `#1A202C`

**playful-fun** (kids, games, casual)
`#FF6B6B` `#FFA07A` `#FFE66D` `#FFF9C4` `#FFFFFF` `#2D3748`

## WCAG Contrast Requirements

| Text Type | Minimum Ratio | Example |
|-----------|--------------|---------|
| Normal text (<18px / <14px bold) | **4.5:1** | White on #595959 = 4.6:1 (pass) |
| Large text (>=18px / >=14px bold) | **3:1** | White on #767676 = 4.5:1 (pass) |
| UI components, icons | **3:1** | Borders, icons, focus rings |

### Contrast Quick Reference

| Background | Minimum Text Color |
|------------|-------------------|
| #FFFFFF (white) | #595959 (AA normal) |
| #000000 (black) | #949494 (AA normal) |
| #1A1A1A (near-black) | #A0A0A0 (AA normal) |
| #0D1117 (GitHub dark) | #8B949E (AA normal) |

## Gradient Overlay Rules

When placing text over images, use a gradient overlay:

1. **Solid end must face the text** — never the image
2. **Only 2 stops** — solid color at 85-100% opacity, transparent at 0%
3. **Match background color** — gradient color = section background, never arbitrary black
4. **Direction by text position:**
   - Text at bottom → gradient bottom-to-top (solid at bottom)
   - Text at top → gradient top-to-bottom (solid at top)
   - Text at left → gradient left-to-right (solid at left)
   - Text at right → gradient right-to-left (solid at right)

## Color Anti-Patterns (NEVER DO)

- Light grey background + timid blue accent (the generic AI look)
- Pure black shadows (#000000) — tint shadows to match palette temperature
- Rainbow of 5+ colors without a clear dominant
- Same background color on 3+ consecutive page sections

---

*Figmento Design Intelligence — figmento.dev*
