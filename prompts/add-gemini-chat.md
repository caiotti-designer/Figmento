# Add Gemini as Chat Model Option

## Overview
Add Google Gemini as an alternative LLM for the Chat tab. The user already has a Gemini API key. Keep Anthropic as an option for later.

## Changes

### 1. Update Settings tab
- Change MODEL dropdown to include:
  - Claude Sonnet 4 (claude-sonnet-4-20250514) — requires Anthropic key
  - Claude Haiku 4 (claude-haiku-4-5-20251001) — requires Anthropic key  
  - Gemini 2.5 Flash (gemini-2.5-flash-preview-05-20) — requires Gemini key
  - Gemini 2.5 Pro (gemini-2.5-pro-preview-05-06) — requires Gemini key
- Show a note under the dropdown: "Claude models need Anthropic key. Gemini models need Google key."
- Default to Gemini 2.5 Flash if no Anthropic key is set but Gemini key exists

### 2. Add Gemini chat handler in ui-app.ts

Create a function `callGeminiAPI()` alongside the existing `callAnthropicAPI()`.

Gemini API endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}`

Gemini uses a different tool calling format. Convert our 22 tool definitions to Gemini format:

**Anthropic format:**
```json
{
  "name": "create_frame",
  "description": "...",
  "input_schema": { "type": "object", "properties": {...} }
}
```

**Gemini format:**
```json
{
  "functionDeclarations": [{
    "name": "create_frame",
    "description": "...",
    "parameters": { "type": "OBJECT", "properties": {...} }
  }]
}
```

Gemini request body structure:
```json
{
  "contents": [
    { "role": "user", "parts": [{ "text": "user message" }] },
    { "role": "model", "parts": [{ "text": "response" }] }
  ],
  "systemInstruction": { "parts": [{ "text": "system prompt here" }] },
  "tools": [{ "functionDeclarations": [...] }],
  "toolConfig": { "functionCallingConfig": { "mode": "AUTO" } }
}
```

Gemini response structure for tool calls:
```json
{
  "candidates": [{
    "content": {
      "parts": [
        { "functionCall": { "name": "create_frame", "args": {...} } },
        { "text": "optional text" }
      ]
    }
  }]
}
```

Tool result format to send back:
```json
{
  "role": "user",
  "parts": [{
    "functionResponse": {
      "name": "create_frame",
      "response": { "result": {...} }
    }
  }]
}
```

### 3. Chat flow with Gemini

Same loop as Anthropic but different parsing:
1. User sends message
2. Detect which model family is selected (claude-* or gemini-*)
3. Call appropriate API function
4. Parse tool calls from response (functionCall parts for Gemini, tool_use blocks for Anthropic)
5. Execute tools via same postMessage to sandbox
6. Send results back in correct format per provider
7. Loop until text-only response

### 4. Convert tool schemas

Create a function `convertToolsToGemini()` that takes our Anthropic tool definitions and converts them:
- `input_schema` → `parameters`
- JSON Schema types stay the same but uppercase: `"string"` → `"STRING"`, `"object"` → `"OBJECT"`, `"number"` → `"NUMBER"`, `"boolean"` → `"BOOLEAN"`, `"array"` → `"ARRAY"`
- `required` array stays the same

### 5. Update manifest.json if needed
`generativelanguage.googleapis.com` should already be in allowedDomains from the image gen addition.

### 6. Validation
After building, the user should be able to:
1. Open plugin, go to Settings
2. Select "Gemini 2.5 Flash" from model dropdown
3. Gemini key already saved
4. Go to Chat, type "Create an Instagram post for Café Noir"
5. See design appear on canvas — same as Anthropic flow

Do NOT break existing Anthropic functionality. Both providers must work.
Rebuild the plugin after changes. Full autonomy.
```
