# Figmento (Original Plugin) — `figmento/`

> Standalone AI-powered Figma plugin. Users interact via in-plugin UI with direct API calls to Anthropic, OpenAI, or Gemini.

## Identity

- **Manifest name:** "Figmento"
- **Manifest ID:** `figmento-plugin`
- **UI size:** 450×820
- **Network domains:** `api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com`, `unpkg.com`, `fonts.googleapis.com`, `fonts.gstatic.com`

## Architecture

```
figmento/
├── src/
│   ├── code.ts              # Figma sandbox entry (846 lines)
│   ├── types.ts             # Full type system (793 lines) — includes constants
│   ├── element-creators.ts  # Shared: UIElement → SceneNode factory
│   ├── color-utils.ts       # Shared: hex/rgb, font style, contrast
│   ├── svg-utils.ts         # Shared: SVG path normalization
│   └── ui/                  # 18 UI module files (vanilla TS, no framework)
│       ├── app.ts           # Main app controller, tab routing
│       ├── chat.ts          # AI chat interface
│       ├── modes.ts         # Mode selection UI
│       ├── screenshot.ts    # Screenshot-to-Layout mode
│       ├── text-layout.ts   # Text-to-Layout mode
│       ├── carousel.ts      # Carousel creation
│       ├── presentation.ts  # Presentation/slides mode
│       ├── template-fill.ts # Template fill mode
│       ├── hero-generator.ts# Hero image generator mode
│       ├── settings.ts      # API key management
│       ├── prompts.ts       # AI prompt builders
│       ├── api.ts           # API call wrappers (Anthropic, OpenAI, Gemini)
│       └── ... (utils, constants, formatting)
├── manifest.json
├── package.json
├── build.js                 # esbuild config
└── tsconfig.json
```

## 5 Plugin Modes

| Mode | Entry Message | What It Does |
|------|---------------|--------------|
| **Screenshot-to-Layout** | `create-design` | User uploads screenshot → AI analyzes → creates Figma layout |
| **Text-to-Layout** | `create-text-layout` | User types content → AI generates social media post design |
| **Carousel** | `create-carousel` | Multi-slide carousel creation (Instagram, etc.) |
| **Text-to-Presentation** | `create-presentation` | Long text → multi-slide presentation/ebook/document |
| **Hero Generator** | `create-hero-image` | AI generates hero images via Gemini Imagen |
| **Template Fill** | `scan-template` + `apply-template-text/image` | Scans #-prefixed placeholder layers, fills with AI content |

## Sandbox (code.ts) — Message Handlers

| Message Type | Handler | Description |
|-------------|---------|-------------|
| `create-design` | `createDesignFromAnalysis()` | Creates full design from UIAnalysis JSON |
| `create-text-layout` | `createDesignFromAnalysis()` | Same renderer, different input path |
| `create-carousel` | Loop of `createDesignFromAnalysis()` | Slides positioned side-by-side (40px gap) |
| `create-presentation` | Loop of `createDesignFromAnalysis()` | Slides in row (80px gap) |
| `scan-slide-style` | `extractStyleFromNode()` | Extracts colors/fonts from selected frame |
| `add-slide` | `createDesignFromAnalysis()` + position | Adds slide after reference frame |
| `set-image` | `createReferenceImage()` | Places reference screenshot on canvas |
| `get-selected-image` | `handleGetSelectedImage()` | Exports selected node as base64 PNG |
| `scan-template` | `scanTemplateFrames()` | Finds #-prefixed placeholder layers |
| `apply-template-text` | `applyTemplateText()` | Fills text placeholders preserving font styles |
| `apply-template-image` | `applyTemplateImage()` | Fills frame/rect with base64 image |
| `create-hero-image` | Inline handler | Creates frame with IMAGE fill |
| `save-api-key` / `load-api-keys` | clientStorage | Persists API keys in Figma storage |
| `save-validation` / `save-feedback` | clientStorage | Persists validation state / feedback |

## Design Rendering Pipeline

```
UIAnalysis → createDesignFromAnalysis()
  1. Count total elements (for progress tracking)
  2. Create root frame (dimensions, background color, viewport center)
  3. For each element: createElementWithProgress() → createElement() [from shared core]
  4. Recursive children handling with progress updates
  5. Small delays (2-50ms) for visual feedback in Figma
```

Progress is sent to UI via `postMessage({ type: 'progress', current, total })`.

## Types Unique to Original Plugin

Beyond the shared core types, `figmento/src/types.ts` (793 lines) defines:

### Constants

- `SOCIAL_FORMATS` — 7 presets (IG Post, IG Square, IG Story, Twitter, LinkedIn, Facebook, Carousel)
- `FONT_OPTIONS` — 15 Google Fonts (Inter, Roboto, Open Sans, Montserrat, Poppins, etc.)
- `COLOR_THEMES` — 6 presets (Vibrant, Minimal, Dark, Ocean, Forest, Sunset)
- `PRESENTATION_FORMATS` — 7 presets (16:9, 4:3, A4, A5, A6, Letter, Tabloid)
- `PRESENTATION_COLOR_THEMES` — 6 slide-optimized themes
- `DESIGN_STYLES` — 5 presets (Auto, Minimal, Corporate, Bold, Creative)
- `HERO_FORMATS` — 9 presets across desktop/tablet/mobile/social
- `PROVIDERS` — AI provider configs (Claude, OpenAI, Gemini) with model IDs

### Key Type Groups

- **AI/API:** `AIProvider`, `APIConfig`, `ProviderConfig`, `PROVIDERS`
- **Text-to-Layout:** `TextLayoutInput`, `TextStructure`, `CarouselConfig`, `LayoutPreset`, `ImageGenModel`
- **Presentation:** `PresentationInput`, `PresentationAnalysis`, `ContentElement`, `ParsedSlide`, `DesignStylePreset`
- **Template Fill:** `TemplatePlaceholder`, `TemplateSlide`, `TemplateScanResult`, `TemplateTextResponse`
- **Hero Generator:** `HeroGeneratorInput`, `HeroFormat`, `HeroQuality`, `SubjectPosition`
- **Plugin Messages:** 24 message types in `PluginMessage` union

## Template Fill System

Scans selected frames for layers named with `#` prefix (e.g., `#title`, `#body`, `#imgHero`):
- `#` prefix → text slot (except `#img*` → image slot)
- Sorts frames left→right, top→bottom
- AI distributes content across slots
- Preserves existing font family, weight, size, color when replacing text

## Storage

Uses `figma.clientStorage` (per-user, per-plugin persistence):
- `figmento-api-keys` — API keys by provider
- `figmento-validated` — Validation status by provider
- `design-feedback` — Last 100 feedback entries

## No WS/MCP Connection

This plugin operates independently. It has no WebSocket bridge, no MCP server, no relay. All AI communication happens directly from the UI iframe to external APIs.
