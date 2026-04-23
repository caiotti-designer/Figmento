# Story FI-9: Peer Design — Multi-Agent Cursors on Canvas

**Status:** Discarded
**Priority:** Medium (P2)
**Complexity:** L
**Epic:** FI — Figsor Tool Parity
**Depends on:** None
**PRD:** Figsor competitive analysis (2026-03-19)

## Story

As a user watching Claude design in Figma, I want to see animated AI cursor(s) moving to each element as it's created, so that the design process feels collaborative and I can follow what Claude is doing in real-time.

## Description

Figsor's "Peer Design" feature spawns colored cursors on the Figma canvas that animate with human-like movement (minimum jerk interpolation, perpendicular arc trajectories). When a tool creates or modifies a node, the agent cursor smoothly moves to that node's position before the change appears.

This is primarily a **demo and UX feature** — it doesn't change what gets designed, but dramatically improves the experience of watching AI design.

### Implementation Approach

**3 MCP Tools:**
- `spawn_design_agent(name, color, personality)` — Create cursor on canvas
- `dismiss_design_agent(agentId)` — Remove specific cursor
- `dismiss_all_agents()` — Clean up all cursors

**Plugin-Side:**
- Cursor rendered as a colored arrow SVG + name label (Figma widget or overlay)
- Movement uses minimum jerk interpolation for natural feel
- Agent personalities: "fast" (200ms moves), "moderate" (400ms), "deliberate" (700ms)
- `agentId` parameter added to creation/modification tools → cursor animates to target position before executing

**Architecture Decision:** Cursors implemented as Figma plugin UI overlay (not canvas nodes) to avoid polluting the design tree.

## Acceptance Criteria

- [ ] **AC1:** `spawn_design_agent` creates a visible cursor on the Figma canvas
- [ ] **AC2:** Cursor displays agent name and uses specified color
- [ ] **AC3:** `dismiss_design_agent` removes a specific cursor
- [ ] **AC4:** `dismiss_all_agents` removes all cursors
- [ ] **AC5:** When `agentId` is passed to `create_frame`/`create_text`/etc., cursor animates to creation position before the element appears
- [ ] **AC6:** Cursor movement feels natural (not teleporting) — uses eased interpolation
- [ ] **AC7:** Max 3 concurrent agents enforced
- [ ] **AC8:** Stale cursors from previous sessions cleaned up on plugin startup
- [ ] **AC9:** Cursors don't appear in exported designs or layer tree

## Tasks

### Phase 1: Cursor Rendering (Plugin)
- [ ] Design cursor SVG (arrow + label)
- [ ] Implement overlay rendering system (outside canvas node tree)
- [ ] Support multiple simultaneous cursors
- [ ] Color and name customization

### Phase 2: Movement Animation (Plugin)
- [ ] Implement minimum jerk interpolation function
- [ ] Add perpendicular arc for natural hand movement feel
- [ ] Personality-based timing (fast/moderate/deliberate)
- [ ] Viewport tracking — cursor moves in screen space

### Phase 3: Agent Lifecycle (Plugin + MCP)
- [ ] spawn_design_agent command handler
- [ ] dismiss_design_agent / dismiss_all_agents handlers
- [ ] Stale cursor cleanup on plugin init
- [ ] Max 3 agent limit enforcement

### Phase 4: Tool Integration
- [ ] Add optional `agentId` parameter to creation/modification tools
- [ ] Animate cursor to target position before executing command
- [ ] Update cursor position after command completes

### Phase 5: MCP Tools
- [ ] Register 3 tools with Zod schemas
- [ ] Route through sendDesignCommand

## Dev Notes

- **Minimum jerk trajectory:** `x(t) = x0 + (x1 - x0) * (10t³ - 15t⁴ + 6t⁵)` — produces smooth, human-like acceleration/deceleration
- **Perpendicular arc:** Add a small perpendicular offset at the midpoint of the trajectory for natural "hand" movement (not straight lines)
- Study Figsor's implementation thoroughly: `figsor-master/src/plugin/code.js` search "agent" — it has complete working animation code
- Figma doesn't have a native cursor API — Figsor uses the plugin UI iframe overlay positioned over the canvas
- Canvas coordinates → screen coordinates conversion needed for overlay positioning
- `figma.viewport.center` and `figma.viewport.zoom` needed for coordinate mapping
- Consider using `requestAnimationFrame` for smooth animation at 60fps

## Out of Scope

- Agent "personality" affecting design decisions (this is purely visual)
- Agent-to-agent communication
- Quiver AI integration (Figsor-specific)

## File List

| File | Action | Notes |
|------|--------|-------|
| figmento-plugin/src/agent-cursors.ts | CREATE | Cursor rendering + animation system |
| figmento-plugin/src/command-handlers.ts | MODIFY | Add spawn/dismiss handlers |
| figmento-plugin/src/execute-command.ts | MODIFY | Add agentId support to creation tools |
| figmento-mcp-server/src/tools/scene.ts | MODIFY | Register 3 agent tools |
| figmento-plugin/ui.html | MODIFY | Add cursor overlay container |

## Definition of Done

- [ ] Cursors appear, animate, and disappear correctly
- [ ] Movement feels natural (not robotic)
- [ ] No cursor artifacts left after dismiss
- [ ] `npm run build` passes for all packages

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-19 | @sm (River) | Initial draft |
| 2026-03-19 | @po (Pax) | Validation GO (9/10). Status Draft → Ready. Best story in batch — has Out of Scope, excellent AC coverage. |
| 2026-03-19 | @dev (Dex) | Implementation complete. Canvas-node cursors (locked group with SVG arrow + label pill). Min-jerk interpolation + perpendicular arc. agentId routing in command-router before/after execution. Stale cleanup on startup. All builds pass. Status Ready → Done. |
| 2026-03-19 | @pm (Morgan) | DISCARDED after testing. Adds 200-600ms latency per tool call, pollutes canvas with locked nodes, zero functional value. Purely cosmetic demo feature not worth the perf cost. Code removed. |
