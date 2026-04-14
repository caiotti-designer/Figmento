/**
 * HTTP Endpoint for Chat Turns — CR-1 + CR-2
 *
 * POST /api/chat/turn
 * Receives a chat turn request, runs the server-side chat engine,
 * and returns the complete response (history, text, tool calls).
 *
 * This endpoint is registered on the relay's HTTP server alongside
 * the existing /health and / GET endpoints.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { FigmentoRelay } from '../relay';
import { handleChatTurn, ChatTurnRequest, ChatTurnResponse } from './chat-engine';

/** Maximum request body size (8 MB — allows up to ~4 MB image attachments as base64). */
const MAX_BODY_SIZE = 8 * 1024 * 1024;

/** Request timeout (600s — complex designs may need 50+ tool calls, each routing through relay). */
const REQUEST_TIMEOUT_MS = 600_000;

/** Per-channel concurrency lock — only one turn at a time per channel. */
const activeChannels = new Set<string>();

/** Get the count of active chat requests (for health check). */
export function getActiveChatRequests(): number {
  return activeChannels.size;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

/** Build CORS headers — echo the request origin to handle `null` origin from Figma plugins. */
function corsHeaders(req: IncomingMessage): Record<string, string> {
  const origin = req.headers['origin'] || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function sendJSON(req: IncomingMessage, res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...corsHeaders(req),
  });
  res.end(body);
}

function sendError(req: IncomingMessage, res: ServerResponse, status: number, message: string): void {
  sendJSON(req, res, status, { error: message });
}

function validateRequest(body: unknown): body is ChatTurnRequest {
  if (!body || typeof body !== 'object') return false;
  const req = body as Record<string, unknown>;

  if (typeof req.message !== 'string' || !req.message.trim()) return false;
  if (typeof req.channel !== 'string' || !req.channel.trim()) return false;
  if (!['claude', 'gemini', 'openai', 'venice', 'codex', 'custom'].includes(req.provider as string)) return false;
  // MA-1: custom provider allows empty apiKey (local models like Ollama don't need auth).
  // All other providers still require a non-empty apiKey. baseUrl must be a non-empty string when provider === 'custom'.
  if (typeof req.apiKey !== 'string') return false;
  if (req.provider !== 'custom' && !(req.apiKey as string).trim()) return false;
  if (req.provider === 'custom' && (typeof req.baseUrl !== 'string' || !(req.baseUrl as string).trim())) return false;
  if (typeof req.model !== 'string' || !req.model.trim()) return false;
  if (!Array.isArray(req.history)) return false;

  return true;
}

/**
 * Handle POST /chat/turn requests.
 * Returns true if the request was handled, false if it's not a chat endpoint.
 */
export async function handleChatRequest(
  relay: FigmentoRelay,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const path = req.url?.split('?')[0];

  // Handle CORS preflight
  if (req.method === 'OPTIONS' && (path === '/api/chat/turn' || path === '/chat/turn')) {
    res.writeHead(204, {
      ...corsHeaders(req),
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return true;
  }

  // ── DM-3: OAuth callback endpoint ──────────────────────────────────────────
  if (req.method === 'GET' && (path === '/oauth/codex/callback' || path === '/auth/callback')) {
    return handleOAuthCallback(req, res);
  }

  if (req.method !== 'POST' || (path !== '/api/chat/turn' && path !== '/chat/turn')) {
    return false;
  }

  try {
    const rawBody = await readBody(req);
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      sendError(req, res, 400, 'Invalid JSON body');
      return true;
    }

    if (!validateRequest(body)) {
      sendError(req, res, 400, 'Invalid request. Required: message, channel, provider, apiKey, model, history[]');
      return true;
    }

    // Per-channel concurrency lock (AC9)
    if (activeChannels.has(body.channel)) {
      sendError(req, res, 429, `A chat turn is already in progress on channel "${body.channel}". Wait for it to complete.`);
      return true;
    }

    activeChannels.add(body.channel);

    console.log(`[Figmento Chat] Turn request: provider=${body.provider} model=${body.model} channel=${body.channel}`);

    // Run with timeout (AC8)
    const turnPromise = handleChatTurn(relay, body);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), REQUEST_TIMEOUT_MS)
    );

    let result: ChatTurnResponse;
    try {
      result = await Promise.race([turnPromise, timeoutPromise]);
    } catch (err) {
      activeChannels.delete(body.channel);
      if (err instanceof Error && err.message === 'TIMEOUT') {
        console.error(`[Figmento Chat] Turn timeout after ${REQUEST_TIMEOUT_MS / 1000}s on channel=${body.channel}`);
        sendError(req, res, 504, `Chat turn timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`);
        return true;
      }
      throw err;
    }

    activeChannels.delete(body.channel);

    console.log(`[Figmento Chat] Turn complete: ${result.iterationsUsed} iterations, ${result.toolCalls.length} tool calls, clean=${result.completedCleanly}`);

    sendJSON(req, res, 200, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error(`[Figmento Chat] Turn error:`, message);
    sendError(req, res, 500, message);
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════
// DM-3: OAuth Callback Handler
// ═══════════════════════════════════════════════════════════════

async function handleOAuthCallback(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const errorDesc = url.searchParams.get('error_description');

  if (error) {
    return serveCallbackPage(res, null, `Authorization denied: ${errorDesc || error}`);
  }

  if (!code) {
    return serveCallbackPage(res, null, 'No authorization code received.');
  }

  // Pass the auth code back as the "activation code" — the plugin will exchange
  // it using its stored PKCE verifier via the token endpoint.
  const payload = Buffer.from(JSON.stringify({
    authorization_code: code,
    state: url.searchParams.get('state') || '',
  })).toString('base64');

  return serveCallbackPage(res, payload, null);
}

function serveCallbackPage(res: ServerResponse, activationCode: string | null, error: string | null): boolean {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Figmento — ChatGPT Authorization</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0f; color: #e4e4e7; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
    .card { background: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 48px; max-width: 480px; width: 100%; text-align: center; }
    h1 { font-size: 24px; font-weight: 600; margin-bottom: 8px; }
    .subtitle { color: #a1a1aa; margin-bottom: 32px; }
    .code-box { background: #09090b; border: 1px solid #3f3f46; border-radius: 8px; padding: 16px; margin: 24px 0; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 13px; word-break: break-all; color: #a3e635; max-height: 120px; overflow-y: auto; user-select: all; }
    .btn { display: inline-block; background: #a3e635; color: #09090b; border: none; border-radius: 8px; padding: 12px 32px; font-size: 15px; font-weight: 600; cursor: pointer; }
    .btn:hover { background: #bef264; }
    .error { color: #ef4444; margin: 24px 0; }
    .steps { text-align: left; margin-top: 24px; padding: 16px; background: #09090b; border-radius: 8px; font-size: 13px; color: #a1a1aa; }
    .steps li { margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Figmento</h1>
    <p class="subtitle">ChatGPT Authorization</p>
    ${error ? `<p class="error">${error}</p><p style="color:#a1a1aa;font-size:13px;">Close this tab and try again from Figmento.</p>` : `
    <p>Copy the activation code below and paste it into Figmento:</p>
    <div class="code-box" id="code">${activationCode}</div>
    <button class="btn" onclick="navigator.clipboard.writeText(document.getElementById('code').textContent).then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy Activation Code',2000)})">Copy Activation Code</button>
    <ol class="steps">
      <li>Copy the code above</li>
      <li>Go back to Figma</li>
      <li>Paste it in the "Activation Code" field</li>
      <li>Click Activate</li>
    </ol>`}
  </div>
</body>
</html>`;

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
  return true;
}
