# Epic UI: Plugin UX/UI Revamp

**Status:** Done — All 3 stories shipped (UI-1, UI-2, UI-3)
**Priority:** Critical (P0)
**Owner:** @pm (Morgan) + @ux-design-expert (Uma)
**Target:** Figmento Plugin v2.0

---

## Vision

Transform the Figmento plugin from a multi-tab, dark-neon-green tool into a single-surface, chat-first design assistant inspired by Aesthetron AI, Vercel, and Apple. Clean, neutral, professional — shadcn UI patterns.

## Reference

- **Primary:** Aesthetron AI plugin (screenshot provided by user)
- **Secondary:** Vercel dashboard (neutral palette, near-black accent, Inter font)
- **Tertiary:** Apple design language (whitespace, typography hierarchy, simplicity)

## Design Principles

1. **Chat-first** — Chat is the single primary surface, not one tab among four
2. **Neutral palette** — Monochrome (white/gray/black), no neon colors, let designs speak
3. **Professional simplicity** — shadcn-inspired components, Inter font, 8px grid
4. **Light mode default** — With dark mode toggle (both modes designed from day 1)
5. **Contextual settings** — Settings via gear icon sheet, not a dedicated tab
6. **Prompt templates as onboarding** — Full-width cards replace mode selector cards

## Design System: Figmento Neutral

### Colors (Light)
| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#FFFFFF` | Main background |
| `--bg-secondary` | `#F9FAFB` | Cards, elevated surfaces |
| `--bg-tertiary` | `#F3F4F6` | Input backgrounds, hover |
| `--border` | `#E5E7EB` | Default borders |
| `--border-strong` | `#D1D5DB` | Emphasized borders |
| `--text-primary` | `#111827` | Headings, body text |
| `--text-secondary` | `#6B7280` | Secondary text |
| `--text-tertiary` | `#9CA3AF` | Placeholders, hints |
| `--accent` | `#171717` | Buttons, active states |
| `--accent-hover` | `#404040` | Button hover |

### Colors (Dark)
| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#0A0A0A` | Main background |
| `--bg-secondary` | `#141414` | Cards, elevated surfaces |
| `--bg-tertiary` | `#1F1F1F` | Input backgrounds |
| `--border` | `#262626` | Default borders |
| `--border-strong` | `#404040` | Emphasized borders |
| `--text-primary` | `#FAFAFA` | Headings, body text |
| `--text-secondary` | `#A1A1AA` | Secondary text |
| `--text-tertiary` | `#71717A` | Placeholders, hints |
| `--accent` | `#FAFAFA` | Buttons, active states |
| `--accent-hover` | `#E5E5E5` | Button hover |

### Shared Tokens
| Token | Value |
|-------|-------|
| `--success` | `#22C55E` |
| `--error` | `#EF4444` |
| `--warning` | `#F59E0B` |
| `--font-sans` | `Inter, system-ui, -apple-system, sans-serif` |
| `--font-mono` | `'SF Mono', 'Fira Code', monospace` |
| `--radius-sm` | `6px` |
| `--radius-md` | `8px` |
| `--radius-lg` | `12px` |
| `--radius-full` | `9999px` |

### Typography Scale
| Token | Size | Weight | Usage |
|-------|------|--------|-------|
| `--text-xs` | `11px` | 400 | Hints, badges |
| `--text-sm` | `12px` | 400/500 | Labels, secondary |
| `--text-base` | `13px` | 400 | Body text |
| `--text-lg` | `14px` | 500/600 | Subtitles |
| `--text-xl` | `16px` | 600 | Section titles |
| `--text-2xl` | `20px` | 700 | Page titles |

### Spacing (8px base)
`4 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48`

## Architecture Change

### Before (Current)
```
Tab Bar: [Chat] [Modes] [Bridge] [Settings]
├── Chat tab: messages + input + upload
├── Modes tab: 6 mode cards + screenshot/text flows
├── Bridge tab: WS relay config
└── Settings tab: API keys + model picker
```

### After (v2.0)
```
Top Bar: ◆ Figmento  [+ New] [⏱] [⚙] [●]
├── Single surface: Chat (messages + templates + input)
├── Settings sheet (slide-from-right, triggered by ⚙)
│   ├── API Keys section
│   ├── Model selection
│   ├── Bridge/Relay section
│   └── Theme toggle (light/dark)
└── Mode dropdown in bottom bar (replaces mode tab)
```

## Stories

| Story | Title | Effort | Dependencies |
|-------|-------|--------|-------------|
| UI-1 | Design token system + CSS variables rewrite | M | None |
| UI-2 | Layout restructure — single-surface chat | L | UI-1 |
| UI-3 | Polish pass — animations, dark mode toggle, keyboard shortcuts | S | UI-2 |

## Success Criteria

1. Plugin opens to a clean, light-mode chat surface (no tab bar)
2. Prompt template cards visible on empty state
3. Settings accessible via gear icon (sheet overlay)
4. Model + mode selectable from bottom bar dropdowns
5. Dark mode toggle works and persists
6. All existing functionality preserved (chat, modes, bridge, settings)
7. Plugin builds: `npm run build` in `figmento/`

## Risks

- **Breaking existing flows:** Mode selector, screenshot flow, text flow — these must still work, accessed via mode dropdown or prompt templates
- **CSS regression:** 5200 lines of inline CSS being restructured — high risk of visual bugs
- **Font loading:** Inter needs to be added to `manifest.json` networkAccess allowedDomains for Google Fonts

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-17 | @pm (Morgan) | Epic created from UX audit |
| 2026-03-17 | @ux-design-expert (Uma) | Design system tokens defined, layout architecture approved |
