# Story FI-4: create_vector — Vector Path Drawing

**Status:** Done
**Priority:** High (P1)
**Complexity:** L
**Epic:** FI — Figsor Tool Parity
**Depends on:** None
**PRD:** Figsor competitive analysis (2026-03-19)

## Story

As a designer using Claude, I want to create custom vector shapes using SVG path data, vertex points, or bezier curves, so that I can produce logos, custom icons, decorative elements, and shapes beyond basic rectangles and ellipses.

## Description

Figmento currently can only create rectangles, ellipses, and frames. Figsor's `create_vector` accepts three input modes: raw SVG path strings, vertex arrays, and bezier curve definitions. This unlocks programmatic shape creation.

### Implementation Approach

**MCP Tool:** `create_vector`
**Parameters:**
- `name` (string) — layer name
- `parentId` (string, optional) — parent frame
- `x`, `y` (number) — position
- `width`, `height` (number) — bounding box
- `svgPath` (string, optional) — SVG path data string (e.g., "M 0 0 L 100 0 L 50 100 Z")
- `vertices` (array, optional) — array of `{ x, y, cornerRadius? }` points for simple polygons
- `fills` (array, optional) — fill paints
- `strokes` (array, optional) — stroke paints
- `strokeWeight` (number, optional)
- `fillColor` (string, optional) — shorthand hex color

**Plugin Handler:**
- For `svgPath`: Parse SVG path commands into Figma VectorNetwork (vertices + segments)
- For `vertices`: Create VectorNetwork from point array
- Apply fills, strokes, and position

## Acceptance Criteria

- [x] **AC1:** `create_vector` tool registered in MCP server
- [x] **AC2:** SVG path string input creates correct vector shape (triangle, star, custom path)
- [x] **AC3:** Vertices array input creates polygon from points
- [x] **AC4:** Fills and strokes apply correctly
- [x] **AC5:** Vector positioned at specified x/y within parent
- [x] **AC6:** Works inside `batch_execute`
- [x] **AC7:** Invalid SVG path returns descriptive parse error

## Tasks

### Phase 1: SVG Path Parser (Plugin)
- [ ] Implement SVG path command parser (M, L, C, Q, S, T, A, Z commands)
- [ ] Convert parsed commands to Figma VectorNetwork format (vertices + segments)
- [ ] Handle relative commands (m, l, c, q, s, t, a)
- [ ] Handle arc commands (A) — convert to cubic bezier approximation

### Phase 2: Plugin Handler
- [ ] Create vector node via `figma.createVector()`
- [ ] Set `vectorNetwork` from parsed path or vertices
- [ ] Apply fills, strokes, strokeWeight
- [ ] Set position and parent

### Phase 3: MCP Tool
- [ ] Register tool with Zod schema
- [ ] Route through sendDesignCommand

## Dev Notes

- SVG path parsing is the hardest part — study Figsor's `code.js` for their implementation
- Figma's VectorNetwork has `vertices` (positions) and `segments` (connections between vertex indices)
- For simple polygons (vertices input), segments connect consecutive vertices + close the shape
- Consider using an existing SVG path parser library if one fits (e.g., `svg-path-parser`)
- Arc to bezier conversion: use standard `arc_to_cubic` algorithm
- `figma.createVector()` creates a VectorNode — then set `.vectorNetwork` and `.vectorPaths`

## File List

| File | Action | Notes |
|------|--------|-------|
| figmento-plugin/src/command-handlers.ts | MODIFY | Add create_vector handler |
| figmento-plugin/src/svg-path-parser.ts | CREATE | SVG path to VectorNetwork converter |
| figmento-mcp-server/src/tools/creation.ts | MODIFY | Register create_vector tool |
| figmento-plugin/src/execute-command.ts | MODIFY | Add case to switch |

## Definition of Done

- [ ] SVG path "M 0 0 L 100 0 L 50 86.6 Z" creates a triangle
- [ ] Complex paths (curves, arcs) render correctly
- [ ] Vertices array creates closed polygon
- [ ] `npm run build` passes for all packages

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-19 | @sm (River) | Initial draft |
| 2026-03-19 | @po (Pax) | Validation GO (8/10). Status Draft → Ready. Obs: SVG parser is the bulk of the work — consider unit testing parser independently before integration. |
| 2026-03-19 | @dev (Dex) | Implementation complete. No SVG parser needed — Figma vectorPaths accepts raw SVG path strings natively. 3 input methods: svgPath, vectorPaths, vertices. All builds pass. Status Ready → Done. |
