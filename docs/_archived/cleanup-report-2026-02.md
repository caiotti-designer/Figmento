# Figmento Cleanup Report

**Date:** 2026-02-25
**Mode:** Executed cleanup based on owner review
**Auditor:** @dev (Dex)

---

## Actions Taken

| # | Item | Decision | Action Taken |
|---|------|----------|--------------|
| 1 | `.mcp.json` hardcoded Gemini API key | FIX | Moved key to `.env`, replaced with `${GEMINI_API_KEY}` placeholder. **Key needs rotation.** |
| 2 | `figmento/` directory | KEEP | Added `README.md` explaining v1 plugin is active and independent. Removed `// [CLEANUP-CANDIDATE]` comments. |
| 3 | `cafe-noir-instagram-post.png` | DELETE | Removed from git (`git rm`). |
| 4 | `prompts/` directory | DELETE | Staged all 13 file deletions (`git rm -r prompts/`). |
| 5 | `output/` not gitignored | FIX | Added `output/` to `.gitignore`. Cleaned directory locally. |
| 6 | `generated-images/` not gitignored | FIX | Added `generated-images/` to `.gitignore`. Cleaned directory locally. |
| 7 | `nul` file | SKIP | Already in `.gitignore`, not tracked in git (Windows device name). |
| 8 | Root `package.json` dead `main` field | FIX | Removed `"main": "index.js"` and `"directories"` block. Updated description. |
| 9 | Root `package.json` placeholder test | FIX | Removed placeholder test script. |
| 10 | `AGENTS.md` stale AIOS boilerplate | UPDATE | Rewrote Project Map to reflect actual Figmento structure. Updated Commands section with real build commands. |
| 11 | `.env.example` irrelevant services | TRIM | Reduced to only Figmento-relevant keys (`GEMINI_API_KEY`, `NODE_ENV`, `AIOS_VERSION`). |
| 12 | `.env` file | KEEP | Already gitignored. Added `GEMINI_API_KEY` value moved from `.mcp.json`. |
| 13 | `.aios/project-status.yaml` stale | DELETE | Deleted locally. |
| 14 | `.codex/` directory | KEEP | No action. |
| 15 | `output/` extensionless files | DELETE | Cleaned with directory (#5). |
| 16 | `temp/` helper scripts | DELETE | Cleaned with directory. |
| 17 | `temp/extract-design.mjs` | DELETE | Cleaned with directory. |
| 18 | `figmento/figma.plugin.dev.md` | KEEP | Valuable Figma API reference for v1 plugin development. |

---

## Files Modified

| File | Change |
|------|--------|
| `.mcp.json` | Replaced hardcoded API key with `${GEMINI_API_KEY}` |
| `.env` | Added `GEMINI_API_KEY` value |
| `.env.example` | Trimmed to Figmento-relevant keys only |
| `.gitignore` | Added `output/` and `generated-images/` |
| `package.json` (root) | Removed dead `main`, `directories`, placeholder test; updated description |
| `AGENTS.md` | Rewrote to reflect actual Figmento project structure |
| `figmento/README.md` | Created — marks v1 plugin as active/independent |
| `figmento/build.js` | Removed `// [CLEANUP-CANDIDATE]` comment |
| `figmento/eslint.config.js` | Removed `// [CLEANUP-CANDIDATE]` comment |
| `figmento/jest.config.js` | Removed `// [CLEANUP-CANDIDATE]` comment |

## Files Removed from Git

| File | Method |
|------|--------|
| `cafe-noir-instagram-post.png` | `git rm` |
| `prompts/add-gemini-chat.md` | `git rm` |
| `prompts/aquabion/` (12 files) | `git rm -r` |

## Files/Directories Cleaned Locally

| Path | Contents |
|------|----------|
| `output/` | 16 generated images and text files |
| `temp/` | 24 temporary design renders and helper scripts |
| `generated-images/` | 1 AI-generated image |
| `.aios/project-status.yaml` | Stale AIOS status |

---

## Remaining Action Required

- **Rotate the Gemini API key** — the old key (`AIzaSyAi7giDr-...`) was exposed in git history. Generate a new key at https://aistudio.google.com/apikey and update `.env`.
