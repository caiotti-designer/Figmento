# figmento-plugin/ — DEPRECATED

This plugin has been **merged into `figmento/`** as part of the Plugin Unification story.

## What moved where

| Source (figmento-plugin/) | Destination (figmento/) | Notes |
|---------------------------|------------------------|-------|
| `src/code.ts` (command router) | `src/code.ts` | Merged with existing sandbox — both message patterns coexist |
| `src/element-creators.ts` | `packages/figmento-core/src/element-creators.ts` | Extracted to shared package |
| `src/color-utils.ts` | `packages/figmento-core/src/color-utils.ts` | Extracted to shared package |
| `src/svg-utils.ts` | `packages/figmento-core/src/svg-utils.ts` | Extracted to shared package |
| `src/gradient-utils.ts` | `packages/figmento-core/src/gradient-utils.ts` | Extracted to shared package |
| `src/types.ts` | `packages/figmento-core/src/types.ts` | Merged with figmento types |
| `src/ui-app.ts` (chat section) | `figmento/src/ui/chat.ts` | Ported to modular UI architecture |
| `src/ui-app.ts` (bridge section) | `figmento/src/ui/bridge.ts` | Ported to modular UI architecture |
| `src/ui-app.ts` (settings section) | `figmento/src/ui/chat-settings.ts` | Ported to modular UI architecture |
| `src/tools-schema.ts` | `figmento/src/ui/tools-schema.ts` | Direct copy |
| `src/system-prompt.ts` | `figmento/src/ui/system-prompt.ts` | Direct copy |
| `manifest.json` network domains | `figmento/manifest.json` | Merged allowlists |

## Do not use this directory for new development

All future work should target `figmento/`. The source files here are preserved for reference only.
