// Must come BEFORE any module that may spawn a child process (Codex/Claude SDKs).
// Patches child_process.spawn to default windowsHide:true, preventing console
// window flashes from codex.exe and downstream MCP server children on Windows.
import './windows-spawn-hide';

import { FigmentoRelay, RelayConfig } from './relay';
import { startCredentialsWatcher } from './credentials-watcher';

// Strip stale CLAUDE_CODE_OAUTH_TOKEN env var that PM2 may have inherited from
// when the daemon was first started (potentially with a now-revoked token).
// Force the Claude Agent SDK to read fresh credentials from ~/.claude/.credentials.json
// instead of a poisoned env var. Without this, the SDK's spawned CLI child sees a
// stale token, conflicts with the file, and crashes mid-turn (exit code 1).
if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  console.log('[Figmento Boot] Stripping stale CLAUDE_CODE_OAUTH_TOKEN env var (relay reads from .credentials.json instead)');
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
}

const config: RelayConfig = {
  port: parseInt(process.env.PORT || process.env.FIGMENTO_RELAY_PORT || '3055', 10),
  maxPayload: parseInt(process.env.MAX_PAYLOAD || '10485760', 10), // 10 MB
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()),
  rateLimitMaxConnections: parseInt(process.env.RATE_LIMIT_MAX_CONNECTIONS || '10', 10),
};

// Poll ~/.claude/.credentials.json for OAuth token rotations. Replaces the
// PM2 chokidar watch which never fired for single-file paths on Windows.
startCredentialsWatcher();

const relay = new FigmentoRelay();
relay.start(config);

// Graceful shutdown
process.on('SIGINT', () => {
  relay.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  relay.stop();
  process.exit(0);
});
