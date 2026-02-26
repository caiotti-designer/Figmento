#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load .env from project root
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (val && !process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

// Warn if no image API keys are set
const hasGemini = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length >= 10;
const hasOpenAI = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length >= 10;

if (!hasGemini && !hasOpenAI) {
  console.error('[mcp-image] WARNING: No image API keys set.');
  console.error('[mcp-image] Set GEMINI_API_KEY and/or OPENAI_API_KEY in .env');
  console.error('[mcp-image] Image generation will fail without at least one valid key.');
} else {
  if (hasGemini) console.error('[mcp-image] Gemini provider: ready');
  if (hasOpenAI) console.error('[mcp-image] OpenAI provider (gpt-image-1.5): ready');
  if (hasGemini && hasOpenAI) console.error('[mcp-image] Fallback chain: Gemini → OpenAI');
}

// Launch local mcp-image with inherited stdio (MCP transport)
const localEntry = path.resolve(__dirname, '..', 'node_modules', 'mcp-image', 'dist', 'index.js');
const child = spawn(process.execPath, [localEntry], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 1));
