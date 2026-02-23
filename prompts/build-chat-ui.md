# Build In-Plugin Chat UI for Figmento

## Overview
Add a chat interface directly inside the Figmento Figma plugin so users can talk to Claude AI without leaving Figma. This is like the Aesthetron AI plugin — a conversational design agent living inside Figma.

The existing WebSocket bridge for Claude Code MCP stays intact. The chat UI is a SECOND way to control the same design engine. Both can coexist.

## Architecture
```
Plugin UI (iframe)
├── Tab 1: CHAT (new)
│   ├── Chat message list (user + assistant messages)
│   ├── Text input + send button
│   ├── Settings: API key input, model selector
│   │
│   ├── On send: calls Anthropic API via fetch()
│   │   - System prompt includes design intelligence from CLAUDE.md
│   │   - Tools defined matching our 21 figmento commands
│   │   - Claude responds with tool_use blocks
│   │
│   ├── On tool_use: executes via figma.ui.postMessage() to sandbox
│   │   - SAME command handlers in code.ts (already built!)
│   │   - Returns tool_result back to conversation
│   │   - Continues until Claude sends a text response (done)
│   │
│   └── Shows final assistant message in chat
│
├── Tab 2: BRIDGE (existing)
│   ├── WebSocket connection status
│   ├── Channel ID
│   └── Activity log
│
└── Tab 3: SETTINGS
    ├── Anthropic API key (saved to figma.clientStorage)
    ├── Model selector (claude-sonnet-4-20250514, claude-opus-4-20250514)
    ├── Gemini API key for image generation
    └── Default brand kit selector
```

## Implementation Details

### 1. Update manifest.json
Add Anthropic API domain to allowedDomains:
```json
"networkAccess": {
  "allowedDomains": [
    "https://api.anthropic.com",
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
    "https://generativelanguage.googleapis.com"
  ],
  "devAllowedDomains": [
    "http://localhost:3055",
    "ws://localhost:3055"
  ],
  "reasoning": "Anthropic API for AI chat, Google Fonts for text rendering, Google AI for image generation, localhost for MCP WebSocket bridge"
}
```

Also add Google's generative AI domain so we can call Gemini for image generation directly from the plugin too.

### 2. Rewrite ui.html with Tabs

The UI should have a modern, dark-themed design (matching Figma's dark UI). Use a tab system:
- Chat tab (default, most prominent)
- Bridge tab (the existing WS connection UI)
- Settings tab

### 3. Chat Implementation (in ui.ts or inline script)

The chat flow:
```
User types "Create an Instagram post for a coffee brand"
    ↓
Build API request:
{
  model: "claude-sonnet-4-20250514",
  max_tokens: 4096,
  system: [design intelligence prompt from CLAUDE.md + knowledge summaries],
  tools: [all 21 figmento tool definitions],
  messages: [conversation history]
}
    ↓
POST to https://api.anthropic.com/v1/messages
Headers: {
  "Content-Type": "application/json",
  "x-api-key": userApiKey,
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-access": "true"
}
    ↓
Response contains tool_use blocks:
{ type: "tool_use", id: "xxx", name: "create_frame", input: {...} }
    ↓
Execute each tool via postMessage to sandbox (SAME code.ts handlers)
    ↓
Collect tool_results, send back to API for next step
    ↓
Repeat until Claude sends a text-only response (design complete)
    ↓
Show final message in chat
```

### 4. Tool Definitions for API

Define ALL 21 tools matching the MCP server tools but formatted for the Anthropic API tool_use format. The tools are:
- connect_to_figma (not needed in plugin — already connected)
- disconnect_from_figma (not needed)
- create_frame, create_text, create_rectangle, create_ellipse, create_image
- set_fill, set_stroke, set_effects, set_corner_radius, set_opacity, set_auto_layout
- get_selection, export_node, get_node_info, get_page_nodes, delete_node, move_node, resize_node, rename_node, append_child
- create_design

Each tool definition needs: name, description, input_schema (JSON Schema)

### 5. System Prompt

The system prompt should include:
- The design agent identity and rules from CLAUDE.md
- Minimum font sizes per format
- Summary of available size presets (don't include full YAML — too long)
- Summary of color palettes available
- Summary of font pairings
- The design workflow steps
- Rule: execute all tools in continuous flow, no pausing
- Rule: never export unless asked
- Rule: single root frame per design

Read the CLAUDE.md and knowledge YAML files to build this system prompt.

### 6. Conversation Management

- Keep conversation history in memory (array of messages)
- Auto-scroll chat to bottom on new messages
- Show tool calls as collapsible "action" messages (e.g., "✅ Created frame: Coffee Post (1080×1080)")
- Show errors inline in red
- "New Chat" button to clear history
- Loading spinner while waiting for API response

### 7. Settings Persistence

Use figma.clientStorage (via postMessage to sandbox) to persist:
- Anthropic API key
- Selected model
- Gemini API key (for future image gen)
- Last used brand kit

### 8. UI Design

Dark theme matching Figma's UI:
- Background: #2c2c2c
- Surface: #383838
- Text: #ffffff
- Accent: #7c5cfc (purple, matching Figma)
- Input bg: #1e1e1e
- Border: #4a4a4a
- User message bubble: #7c5cfc
- Assistant message bubble: #383838
- Tool action: #2a2a2a with left border accent
- Error: #ff4444

Chat input at bottom, pinned. Messages scroll above.
Plugin size: width 380, height 600 (update in code.ts figma.showUI dimensions).

### 9. Image Generation (Bonus)

Since we're adding the Gemini API domain, also add a tool for direct image generation from the chat:
- User says "add a coffee image to the design"
- Claude calls a generate_image tool
- Plugin calls Gemini API directly from iframe (fetch to generativelanguage.googleapis.com)
- Gets base64 image back
- Places it into Figma via the existing create_image command handler

This means the chat UI is FULLY SELF-CONTAINED — no external servers needed for the core experience (the WS relay is only for Claude Code MCP access).

### 10. What NOT to change

- Do NOT modify code.ts command handlers — they already work
- Do NOT modify the WebSocket bridge logic — keep it in the Bridge tab
- Do NOT remove any existing functionality
- Keep the existing build.js pipeline — just add the new UI code

## File Changes

- figmento-plugin/src/ui.html — REWRITE (new tabbed UI with chat)
- figmento-plugin/src/chat.ts — NEW (chat logic, API calls, tool execution)
- figmento-plugin/src/tools-schema.ts — NEW (tool definitions for Anthropic API)
- figmento-plugin/src/system-prompt.ts — NEW (builds system prompt from knowledge)
- figmento-plugin/src/settings.ts — NEW (settings management with clientStorage)
- figmento-plugin/manifest.json — UPDATE (add api.anthropic.com domain)
- figmento-plugin/src/code.ts — MINOR UPDATE (increase UI size, add settings storage handlers)
- figmento-plugin/build.js — UPDATE if needed (bundle new .ts files)

## Validation

When complete, the user should be able to:
1. Open the plugin in Figma
2. Go to Settings, enter their Anthropic API key
3. Go to Chat tab
4. Type "Create an Instagram post for a luxury coffee brand called Café Noir"
5. Watch as the design appears on the canvas in real-time
6. See tool execution progress in the chat
7. Follow up with "Make the headline bigger" and see it update
```