# BKR-1 — Brand Kit Remix Carousel

## Status

Implemented — automated gates pass; live Carmelus/Figma smoke pending

## Story

As Caio, I want to save a client carousel as remix assets inside a brand kit, so that later I can type `@Carmelus` with new copy and Figmento creates a new on-brand carousel quickly, including regenerated images that preserve the saved image style.

## Acceptance Criteria

- Existing flat brand kits in `figmento-mcp-server/knowledge/brand-kits/*.yaml` remain readable without migration on read-only loads.
- Editing/saving remix assets for a flat kit upgrades it atomically to `knowledge/brand-kits/{id}/kit.yaml`: write the folder kit first, delete the flat file only after write succeeds, and fail loudly if the folder already exists.
- `list_brand_kits` enumerates both flat files and folder kits, dedupes by kit id, prefers folder kits on conflicts, and logs a warning for duplicate ids.
- Reference images are saved under `knowledge/brand-kits/{id}/references/{uuid}-{slug}.{ext}` and filename collisions are avoided by UUID prefix.
- Archetypes are saved under `knowledge/brand-kits/{id}/archetypes/{role}-{order}-{id}.json` with `presetVersion: "2.5c"`, `role`, `order`, `enabled`, and captured `PresetNode[]`.
- V1 slot mapping uses existing `#slot` placeholder behavior only. No AI slot detector is introduced.
- The brand kit schema includes `design_system`, `remix.image_style`, and `remix.carousel.archetypes`.
- `DESIGN.md` remains the design-system source of truth. Importing one creates/updates `knowledge/design-systems/{name}/tokens.yaml`; the brand kit stores `design_system.name` and `design_system.design_md_path`, and mirrors core colors, typography, and voice when available.
- `@Brand` mention parsing is case-insensitive, ignores emails and fenced code blocks, and returns nearest known kit names when unknown.
- Default remix behavior creates a new carousel. Overwrite is allowed only when frames are selected and the prompt contains an explicit EN/PT-BR overwrite keyword.
- Copy parsing supports `---` slide separators, `## Heading` slide starts, labels `Title/Título`, `Body/Texto`, `Image/Imagem`, `Prompt`, and promotes a first line to title only when it is `<= 60` characters or `<= 9` words and no explicit title exists.
- Archetype selection is deterministic: first slide uses `cover` when available, last slide uses `cta` else `closing`, middle slides use `image_body` when an image prompt exists else `body`, and same-role variants rotate by ascending `order`.
- `generate_design_image` accepts `referenceImagePaths?: string[]` and caps total reference images to 3.

## Implementation Notes

- Reuse the plugin `PresetNode` serializer/restore path from `figmento/src/handlers/presets.ts`; do not invent a separate arbitrary-Figma-layout renderer.
- MCP tools to add: `list_brand_kits`, `capture_brand_kit_archetype`, `save_brand_kit_remix`, `remix_brand_kit_carousel`.
- Add a small Brand Kits UI affordance for existing kits: "Add remix assets". It can seed chat/tool flow in V1; a full visual manager may follow.

## Verification

- Unit tests cover flat/folder kit loading, upgrade-on-edit behavior, mention regex, unknown brand suggestions, copy parser, archetype role selection, and reference image cap/precedence.
- Integration checks: save Carmelus remix assets from selected frames, generate a new carousel from `@Carmelus` pasted markdown, and explicit PT-BR overwrite updates selected frames.
- Gates:
  - `figmento`: `npm run typecheck`, `npm test`
  - `figmento-ws-relay`: `npm run build`, `npm test` if present
  - `figmento-mcp-server`: `npm run build`, `npm test`

## Implementation Notes — 2026-05-12

- Added the Brand Kit Remix MCP toolset and core storage/parser/archetype utilities.
- Reused `PresetNode` capture/restore for archetype capture and instantiation.
- Added `referenceImagePaths?: string[]` support to `generate_design_image`, capped at 3.
- Added a small plugin UI affordance that seeds the chat flow for adding remix assets.
- Automated gates pass. Live Figma integration checks still need a selected Carmelus carousel and running Figmento bridge.
