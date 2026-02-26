# Ad Analyzer + Redesign Workflow

## Setup

1. **Drop your ad image** into this folder as `original-ad.png`
2. **Create the output folder:** `mkdir output`
3. **Make sure running:**
   - Figmento Figma plugin (open in Figma, note the channel ID)
   - Figmento WS relay: `cd figmento-ws-relay && node dist/relay.js`
   - Figmento MCP server: configured in Claude Code's `claude_desktop_config.json`
   - `mcp-image` server: configured with your Gemini API key

4. **Open Claude Code** in this folder and paste the prompt below

---

## Prompt for Claude Code

```
Read MISSION.md in this folder, then execute the full Ad Analyzer + Redesign workflow on original-ad.png. Connect to Figma channel [YOUR CHANNEL ID HERE] and build all 3 ad variants.
```

---

## Folder Structure

```
ad-analyzer/
├── README.md          ← this file
├── MISSION.md         ← master instructions for Claude Code
├── original-ad.png    ← your bad ad goes here
├── output/            ← AI-generated images land here
├── analysis-report.md ← Claude writes this during Phase 2
└── design-report.md   ← Claude writes this during Phase 5
```

---

## Expected Output

- `analysis-report.md` — detailed ad critique + redesign strategy
- `design-report.md` — summary of all 3 variants + recommendation
- `output/image-variant-A.png` — improved hero image A
- `output/image-variant-B.png` — improved hero image B  
- `output/image-variant-C.png` — improved hero image C
- **3 editable ad frames in Figma** — fully layered, ready to edit

---

## MCP Config (claude_desktop_config.json)

```json
{
  "mcpServers": {
    "figmento": {
      "command": "node",
      "args": ["/path/to/Figmento/figmento-mcp-server/dist/index.js"]
    },
    "mcp-image": {
      "command": "npx",
      "args": ["-y", "mcp-image"],
      "env": {
        "GEMINI_API_KEY": "your-key-here",
        "IMAGE_OUTPUT_DIR": "/path/to/ad-analyzer/output"
      }
    }
  }
}
```

> ⚠️ Set `IMAGE_OUTPUT_DIR` to the absolute path of the `output/` folder in this directory.