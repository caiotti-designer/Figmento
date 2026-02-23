# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm install          # Install dependencies
npm run build        # One-time production build
npm run watch        # Watch mode with auto-rebuild (alias: npm run dev)
```

There are no automated tests. Testing is manual: build, then load in Figma via Plugins > Development > Import plugin from manifest, selecting `manifest.json`.

## Architecture

This is a **Figma plugin** that converts screenshots into editable Figma designs using AI vision (Claude, OpenAI, Gemini).

### Two-Process Model (required by Figma)

1. **Sandbox (`src/code.ts`)** - Runs in Figma's main thread with full Plugin API access. Creates all design nodes (frames, text, images, icons, vectors). Communicates with UI via `figma.ui.postMessage()`.

2. **UI (`src/ui.ts` + `src/ui.html`)** - Runs in an iframe. Handles user interaction, image processing, and AI API calls. Communicates with sandbox via `postMessage({ pluginMessage: data })`.

### Build Pipeline (`build.js`)

esbuild bundles `src/code.ts` → `dist/code.js` (IIFE) and `src/ui.ts` → inline JS, then injects that JS into `src/ui.html` at the `<!-- SCRIPT_PLACEHOLDER -->` marker, outputting `dist/ui.html`.

### Shared Types (`src/types.ts`)

Defines `UIElement` (the element schema for AI output), `UIAnalysis` (complete design structure), `PluginMessage` (union of all message types), and provider configs.

## Critical Implementation Constraints

### localStorage is NOT available
Figma plugin iframes use `data:` URLs where localStorage throws `SecurityError`. Every localStorage call MUST be wrapped in try-catch with a fallback.

### HTML comment syntax
Must be `<!--` not `< !--` (no space). Malformed comments render as visible text in the plugin UI.

### SCRIPT_PLACEHOLDER
The build script replaces `<!-- SCRIPT_PLACEHOLDER -->` in `ui.html` with bundled JS. If this marker is malformed or missing, the plugin shows a blank screen.

### Network access
All external domains must be listed in `manifest.json` `networkAccess.allowedDomains`. Current allowed: Anthropic, OpenAI, Google AI, unpkg (Lucide icons), Google Fonts.

### Figma persistent storage
Use `figma.clientStorage.setAsync/getAsync` in the sandbox process for data that should persist across sessions.

## Development Guidelines

1. Read relevant files before making changes. Never speculate about code you haven't opened.
2. Check in before making major changes.
3. Keep changes as simple as possible - minimize code impact, avoid complex refactors.
4. Provide high-level explanations of changes made.

## Key Processing Flow

Input (paste/drop/upload/selection) → Optional crop → AI analysis (provider-specific API call) → JSON response parsed as `UIAnalysis` → Icon fetching (Lucide SVGs) → Optional AI image generation → Sandbox creates Figma nodes recursively via `createElement()`.
