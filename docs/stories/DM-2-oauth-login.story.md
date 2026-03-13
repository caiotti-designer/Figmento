# DM-2 — OAuth Login (Connect with Claude, No API Key Required)

## Status: Ready

## Story
**As a** Figmento user,
**I want** to click "Connect with Claude" and log in with my Anthropic account,
**so that** I can use the plugin without ever copying an API key — just like connecting a Google account.

## Background

DM-1 makes direct mode the default. DM-2 eliminates the last friction point: the API key copy-paste. Instead, users authenticate via their Anthropic account (Claude.ai Pro/Max subscription or console.anthropic.com account) using OAuth 2.0 + PKCE.

The challenge unique to Figma plugins: the UI runs in a sandboxed iframe with a `data:` URL — it cannot receive OAuth redirects directly. The solution is a **two-step flow**:

1. Plugin opens the OAuth authorization URL in the system browser via `figma.openExternal()`
2. Anthropic redirects to a **minimal hosted callback page** (static, free to host on Vercel/Cloudflare Pages — no server logic, just JavaScript)
3. The callback page exchanges the authorization code for a token and **shows it to the user as a one-time code**
4. User copies the code and pastes it in the plugin — one time only, then it's stored

This is the standard pattern used by VS Code extensions and other sandboxed app environments. The callback page is ~20 lines of JavaScript, not a server.

### Why not Device Authorization Flow?

Anthropic does not publicly document Device Flow (RFC 8628) support as of early 2026. If they add it, DM-2 can be upgraded to use it (eliminating even the copy-paste step). The PKCE + static callback approach works today with any standard OAuth 2.0 provider.

### Upgrade path to full frictionless OAuth

Once Anthropic supports Device Flow:
```
Plugin: POST /oauth/device → get device_code + user_code + verification_uri
Plugin: figma.openExternal(verification_uri)
Plugin: poll /oauth/token with device_code every 5 seconds
→ When approved: access_token arrives automatically, no user copy-paste needed
```
The DM-2 architecture is designed to swap the auth mechanism without changing the rest of the flow.

## Target Flow (PKCE + Static Callback)

```
1. User clicks "Connect with Claude" in plugin settings

2. Plugin:
   - generates PKCE code_verifier (random 64 bytes, base64url)
   - generates code_challenge = SHA-256(code_verifier), base64url
   - generates state = random UUID (CSRF protection)
   - saves {code_verifier, state} to sessionStorage
   - opens browser:
     figma.openExternal(
       "https://claude.ai/oauth/authorize
         ?client_id=FIGMENTO_CLIENT_ID
         &redirect_uri=https://figmento.app/oauth/callback
         &response_type=code
         &scope=api
         &code_challenge=<challenge>
         &code_challenge_method=S256
         &state=<state>"
     )

3. User logs in on claude.ai → approves Figmento

4. Anthropic redirects to:
   https://figmento.app/oauth/callback?code=AUTH_CODE&state=<state>

5. Static callback page (figmento.app/oauth/callback):
   - reads code + state from URL params
   - exchanges code for token:
     POST https://claude.ai/oauth/token
       { code, code_verifier, client_id, redirect_uri, grant_type: "authorization_code" }
   - displays a large, copyable "one-time activation code" to user
   - (optionally) writes token to localStorage for automatic retrieval if same browser)

6. User copies the activation token, returns to Figma

7. Plugin:
   - shows "Paste your activation code" input
   - validates token with a test API call
   - on success: saves to figma.clientStorage, marks as authenticated
   - UI updates: shows "Connected as user@example.com", hides API key field

8. On subsequent opens: token loaded from clientStorage automatically
   - if expired: refresh using stored refresh_token
   - if refresh fails: prompt re-auth
```

## Scope

### IN
- [ ] PKCE flow implementation in plugin UI (`oauth-flow.ts`)
- [ ] "Connect with Claude" button in Settings, replacing "Enter API key" as primary option
- [ ] Static callback page at `figmento.app/oauth/callback` (or similar free host)
- [ ] Token exchange on callback page (client-side JS, no server)
- [ ] One-time activation code display + copy button on callback page
- [ ] Plugin: "Paste activation code" input + validation
- [ ] Token storage in `figma.clientStorage` (encrypted with a per-install secret)
- [ ] Token refresh on 401 responses (automatic, invisible to user)
- [ ] "Disconnect" option in settings
- [ ] Fallback: "Use API key instead" link (for users who prefer it)
- [ ] Show authenticated user indicator (email or "Connected ✓")

### OUT
- Device Authorization Flow (add later when Anthropic supports it)
- OpenAI OAuth (separate story, same pattern)
- Gemini OAuth
- Relay OAuth (separate concern)
- Multi-account support

## Acceptance Criteria

```
Given the user opens the plugin for the first time (no stored token)
When they click "Connect with Claude"
Then the system browser opens with the Anthropic authorization page

Given the user approves access on claude.ai
When they are redirected to figmento.app/oauth/callback
Then they see a large activation code they can copy

Given the user pastes the activation code into the plugin
When the plugin validates it
Then it stores the token and shows "Connected ✓"
And subsequent plugin opens use the stored token automatically

Given the stored token has expired
When the user sends a message
Then the plugin silently refreshes the token using the refresh_token
And the message sends successfully without interrupting the user

Given the refresh token is also expired or revoked
When the user tries to use the plugin
Then they are prompted to re-authenticate (not silently fail)

Given the user is authenticated via OAuth
When they send a design message
Then it uses the OAuth token (not an API key) for the Anthropic API call
And all design tools work exactly as in DM-1
```

## Technical Notes

### New files

| File | Purpose |
|------|---------|
| `figmento/src/ui/oauth-flow.ts` | PKCE generation, authorization URL builder, token storage, refresh logic |
| `figmento.app/oauth/callback/index.html` | Static callback page — exchange code, show activation code to user |

### Files to modify

| File | Change |
|------|--------|
| `figmento/src/ui/settings.ts` | Add OAuth state management, "Connect with Claude" button handler |
| `figmento/src/ui/chat.ts` | Use OAuth token instead of API key in `callAnthropicAPI()` |
| `figmento/src/plugin/code.ts` | Store/load OAuth tokens from clientStorage |
| `figmento/src/ui.html` | New auth UI in settings panel |

### PKCE implementation (oauth-flow.ts sketch)

```typescript
// Generate PKCE pair
async function generatePKCE() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = base64url(await crypto.subtle.digest('SHA-256', encode(verifier)));
  return { verifier, challenge };
}

// Build authorization URL
function buildAuthUrl(challenge: string, state: string): string {
  const params = new URLSearchParams({
    client_id: FIGMENTO_CLIENT_ID,
    redirect_uri: CALLBACK_URL,
    response_type: 'code',
    scope: 'api',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  return `https://claude.ai/oauth/authorize?${params}`;
}

// After user pastes activation code (= access_token from callback page)
async function activateToken(token: string): Promise<boolean> {
  // Test call to validate token
  const res = await fetch('https://api.anthropic.com/v1/models', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'anthropic-dangerous-direct-browser-access': 'true',
    }
  });
  return res.ok;
}
```

### Callback page sketch (figmento.app/oauth/callback/index.html)

```html
<!-- Pure client-side. No server. Hosted free on Cloudflare Pages / Vercel / GitHub Pages -->
<script>
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  // Exchange code for token using PKCE verifier stored in sessionStorage
  // OR: display the code itself for manual paste (simpler, equally secure)
  // Show activation code prominently with copy button
</script>
```

### Token storage schema (clientStorage)

```typescript
interface OAuthToken {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // Unix ms
  scope: string;
  user_email?: string;
}
```

### Registration prerequisite

Before DM-2 can be implemented, Figmento must be registered as an OAuth application with Anthropic (via `console.anthropic.com` OAuth app settings). This requires:
- App name: Figmento
- Redirect URI: `https://figmento.app/oauth/callback` (or chosen callback host)
- Scopes: `api`
- Client ID (public) — no client secret needed for PKCE public clients

This is a one-time setup step by the project owner, not part of the code implementation.

## Risks

| Risk | Mitigation |
|------|-----------|
| Anthropic OAuth not available for third-party apps | Keep API key as fallback; upgrade when available |
| Callback page hosting goes down | Fallback to API key always available |
| Token storage in clientStorage not truly secure | Acceptable for this threat model (same as API key); user can revoke on Anthropic dashboard |
| OAuth scopes change | Abstract scope string into constant, easy to update |

## Dependencies
- DM-1 must be complete (direct mode working cleanly)
- Anthropic must have an OAuth 2.0 endpoint for third-party apps (verify before starting)
- Figmento OAuth app registered at console.anthropic.com
- Callback page hosting provisioned (figmento.app or similar)

## File List
_Updated as implementation progresses_

- [ ] `figmento/src/ui/oauth-flow.ts` (new)
- [ ] `figmento/src/ui/settings.ts`
- [ ] `figmento/src/ui/chat.ts`
- [ ] `figmento/src/plugin/code.ts`
- [ ] `figmento/src/ui.html`
- [ ] `figmento.app/oauth/callback/index.html` (new, external repo or folder)

## Definition of Done
- [ ] "Connect with Claude" flow works end-to-end (authorize → callback → paste → connected)
- [ ] Token persists across plugin close/reopen
- [ ] Token refresh works automatically on expiry
- [ ] "Connected ✓" indicator visible in settings
- [ ] API key option still available as fallback
- [ ] No relay, WebSocket, or Railway involved in any step
