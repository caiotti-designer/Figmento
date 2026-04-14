# Epic DX — Developer Experience & Zero-Friction Onboarding

**Status:** Active
**Goal:** Eliminate manual setup steps so that using Figmento feels instant — open the plugin, start designing.

---

## Problem

Today, connecting the Figma plugin to the MCP server requires two manual steps:

1. **Start the relay** — run `npm run dev` in `figmento-ws-relay/`
2. **Copy channel ID** — the plugin generates a random channel each session; the user must paste it or configure env vars

These steps create friction for every session and are a barrier for new users.

## Vision

**Open plugin → already connected.** No terminal, no channel ID, no manual config.

## Stories

| ID | Title | Status | Effort |
|----|-------|--------|--------|
| DX-1 | Zero-Friction Connection — Relay Auto-Spawn & Fixed Channel | Draft | M |

## Success Metrics

- First-time setup: **0 manual steps** after initial `npm install && npm run build`
- Reconnection: **automatic** on plugin reopen
- Backwards compatibility: manual flow still works for advanced users
