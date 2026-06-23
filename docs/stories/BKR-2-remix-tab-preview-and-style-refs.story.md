# BKR-2 — Remix Tab Preview and Style References

## Status

Implemented — plugin gates pass

## Story

As Caio, I want a dedicated Remix tab in Figmento so I can manage brand style reference images and visually inspect generated carousel slide previews without hunting through the canvas.

## Acceptance Criteria

- The main Figmento tab bar includes a `Remix` tab next to Chat and Image Studio.
- The Remix tab stores a brand id, prompt prefix, negative prompt, and up to 3 local style reference images.
- Reference image cards show thumbnails, filename, file size, and remove actions.
- A `Send to Chat` action seeds the chat composer with a `save_brand_kit_remix`-oriented prompt and attaches the saved reference images.
- A `Capture selected frames` action screenshots the currently selected Figma frames and renders a preview grid in the Remix tab.
- The preview grid shows slide number, frame name, and thumbnail for each captured frame.
- The implementation does not create or overwrite carousel frames by itself; generation remains agent/tool-driven.

## Notes

- V1 keeps brand-kit persistence through chat/MCP tools so the UI does not need direct filesystem access.
- The preview action is explicit: after a remix run, select the output frames and capture them into the tab.

## Verification

- `figmento`: `npm run typecheck`
- `figmento`: `npm run build`
- `figmento`: `npm test`
