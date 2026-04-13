// ═══════════════════════════════════════════════════════════════
// OAuth PKCE Flow — Provider-agnostic module for OAuth authentication
// Used by DM-3 (Codex/ChatGPT) and future DM-2 (Anthropic)
// ═══════════════════════════════════════════════════════════════

// ── Types ────────────────────────────────────────────────────────────────────

export interface OAuthToken {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // Unix ms
  scope: string;
  account_id?: string;
}

export interface OAuthProviderConfig {
  clientId: string;
  authEndpoint: string;
  tokenEndpoint: string;
  callbackUrl: string;
  scopes: string;
}

// ── Provider Configs ─────────────────────────────────────────────────────────

export const CODEX_OAUTH_CONFIG: OAuthProviderConfig = {
  clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
  authEndpoint: 'https://auth.openai.com/oauth/authorize',
  tokenEndpoint: 'https://auth.openai.com/oauth/token',
  callbackUrl: 'http://localhost:1455/auth/callback',
  scopes: 'openid profile email offline_access',
};

const REFRESH_WINDOW_MS = 300_000; // 5 minutes

// ── PKCE Utilities ───────────────────────────────────────────────────────────

function base64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Pure JS SHA-256 — needed because crypto.subtle is unavailable in Figma plugin
// iframes (data: URL = not a secure context).
function sha256(message: Uint8Array): Uint8Array {
  const K: number[] = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  const rr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  // Pre-processing: padding
  const len = message.length;
  const bitLen = len * 8;
  const padded = new Uint8Array(((len + 9 + 63) & ~63));
  padded.set(message);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLen, false);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  for (let off = 0; off < padded.length; off += 64) {
    const w = new Int32Array(64);
    for (let i = 0; i < 16; i++) w[i] = view.getInt32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rr(w[i-15], 7) ^ rr(w[i-15], 18) ^ (w[i-15] >>> 3);
      const s1 = rr(w[i-2], 17) ^ rr(w[i-2], 19) ^ (w[i-2] >>> 10);
      w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0;
    }
    let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rr(e,6) ^ rr(e,11) ^ rr(e,25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rr(a,2) ^ rr(a,13) ^ rr(a,22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    h0=(h0+a)|0; h1=(h1+b)|0; h2=(h2+c)|0; h3=(h3+d)|0;
    h4=(h4+e)|0; h5=(h5+f)|0; h6=(h6+g)|0; h7=(h7+h)|0;
  }

  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  ov.setUint32(0,h0); ov.setUint32(4,h1); ov.setUint32(8,h2); ov.setUint32(12,h3);
  ov.setUint32(16,h4); ov.setUint32(20,h5); ov.setUint32(24,h6); ov.setUint32(28,h7);
  return out;
}

export async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const randomBytes = crypto.getRandomValues(new Uint8Array(64));
  const verifier = base64url(randomBytes.buffer);
  const encoded = new TextEncoder().encode(verifier);

  // crypto.subtle is unavailable in Figma plugin iframes (data: URL, not secure context)
  let hash: ArrayBuffer;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    hash = await crypto.subtle.digest('SHA-256', encoded);
  } else {
    hash = sha256(encoded).buffer;
  }

  const challenge = base64url(hash);
  return { verifier, challenge };
}

function generateState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ── PKCE Session Storage ─────────────────────────────────────────────────────
// In Figma plugin iframe, sessionStorage may not be available.
// We use module-level state instead (lives for the plugin session).

let _pkceState: { verifier: string; state: string } | null = null;

export function savePkceSession(verifier: string, state: string): void {
  _pkceState = { verifier, state };
}

export function loadPkceSession(): { verifier: string; state: string } | null {
  return _pkceState;
}

export function clearPkceSession(): void {
  _pkceState = null;
}

// ── Authorization ────────────────────────────────────────────────────────────

export async function buildAuthorizationUrl(
  config: OAuthProviderConfig,
): Promise<{ url: string; verifier: string; state: string }> {
  const { verifier, challenge } = await generatePKCE();
  const state = generateState();

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    response_type: 'code',
    scope: config.scopes,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });

  return {
    url: `${config.authEndpoint}?${params.toString()}`,
    verifier,
    state,
  };
}

// ── Token Exchange ───────────────────────────────────────────────────────────

export async function exchangeCodeForToken(
  config: OAuthProviderConfig,
  code: string,
  codeVerifier: string,
): Promise<OAuthToken> {
  const resp = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      client_id: config.clientId,
      redirect_uri: config.callbackUrl,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Token exchange failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || undefined,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    scope: data.scope || config.scopes,
    account_id: data.account_id || undefined,
  };
}

// ── Token Refresh ────────────────────────────────────────────────────────────

export async function refreshToken(
  config: OAuthProviderConfig,
  token: OAuthToken,
): Promise<OAuthToken> {
  if (!token.refresh_token) {
    throw new Error('No refresh token available');
  }

  const resp = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
      client_id: config.clientId,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Token refresh failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || token.refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    scope: data.scope || token.scope,
    account_id: data.account_id || token.account_id,
  };
}

// ── Token Lifecycle ──────────────────────────────────────────────────────────

export function isTokenExpiringSoon(token: OAuthToken): boolean {
  return Date.now() >= token.expires_at - REFRESH_WINDOW_MS;
}

export function isTokenExpired(token: OAuthToken): boolean {
  return Date.now() >= token.expires_at;
}

// ── Token Validation ─────────────────────────────────────────────────────────

export async function validateCodexToken(accessToken: string): Promise<boolean> {
  try {
    // Make a minimal Responses API call to verify the token works
    const resp = await fetch('https://chatgpt.com/backend-api/codex/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4',
        instructions: 'Respond with OK',
        input: [{ type: 'message', role: 'user', content: 'ping' }],
        tools: [],
        stream: false,
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// ── Activation Code Parsing ──────────────────────────────────────────────────
// The callback page encodes the token data as a base64 JSON string (the "activation code")

export function encodeActivationCode(token: OAuthToken): string {
  return btoa(JSON.stringify(token));
}

export function decodeActivationCode(code: string): OAuthToken | null {
  try {
    const trimmed = code.trim();
    const json = atob(trimmed);
    const parsed = JSON.parse(json);
    if (!parsed.access_token || typeof parsed.access_token !== 'string') {
      return null;
    }
    return {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token || undefined,
      expires_at: parsed.expires_at || Date.now() + 3600_000,
      scope: parsed.scope || '',
      account_id: parsed.account_id || undefined,
    };
  } catch {
    return null;
  }
}
