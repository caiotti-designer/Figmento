/**
 * Relay Auto-Spawner (DX-1)
 * Ensures the figmento-ws-relay is running before the MCP server connects.
 * Health-checks port 3055, spawns the relay as a child process if needed,
 * and kills it on MCP server shutdown.
 */

import { spawn, ChildProcess } from 'child_process';
import { request } from 'http';
import path from 'path';

let relayChild: ChildProcess | null = null;

/** Check if the relay is already running by hitting its /health endpoint. */
function checkRelayHealth(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = request(
      { hostname: '127.0.0.1', port, path: '/health', method: 'GET', timeout: 1000 },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            resolve(json.status === 'ok');
          } catch {
            resolve(false);
          }
        });
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

/** Wait for relay to become healthy with retries. */
async function waitForRelay(port: number, retries: number, intervalMs: number): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    if (await checkRelayHealth(port)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * Ensure the relay is running. Spawns it as a child process if not already up.
 * Returns true if relay is healthy after this call.
 */
export async function ensureRelay(): Promise<boolean> {
  const port = parseInt(process.env.FIGMENTO_RELAY_PORT || '3055', 10);
  const relayPath = process.env.FIGMENTO_RELAY_PATH
    || path.resolve(__dirname, '..', '..', 'figmento-ws-relay', 'dist', 'index.js');

  // AC5: Skip spawn if relay is already running
  if (await checkRelayHealth(port)) {
    console.error(`[Figmento MCP] Relay already running on port ${port}`);
    return true;
  }

  // AC2: Spawn relay as child process
  console.error(`[Figmento MCP] Relay not detected on port ${port} — spawning: ${relayPath}`);
  try {
    relayChild = spawn('node', [relayPath], {
      stdio: 'ignore',
      detached: false,
      env: { ...process.env, PORT: String(port) },
    });

    relayChild.on('error', (err) => {
      console.error(`[Figmento MCP] Relay child error: ${err.message}`);
      relayChild = null;
    });

    relayChild.on('exit', (code) => {
      console.error(`[Figmento MCP] Relay child exited with code ${code}`);
      relayChild = null;
    });
  } catch (err) {
    console.error(`[Figmento MCP] Failed to spawn relay: ${(err as Error).message}`);
    return false;
  }

  // AC3: Retry health check — 10 × 200ms = 2s max
  const healthy = await waitForRelay(port, 10, 200);
  if (healthy) {
    console.error(`[Figmento MCP] Relay is healthy on port ${port}`);
  } else {
    console.error(`[Figmento MCP] Relay failed to become healthy after 2s — proceeding without relay`);
  }
  return healthy;
}

/** AC4: Kill spawned relay child on shutdown. */
export function shutdownRelay(): void {
  if (!relayChild) return;
  try {
    relayChild.kill('SIGTERM');
    console.error('[Figmento MCP] Relay child process terminated');
  } catch {
    // Best-effort cleanup
  }
  relayChild = null;
}

// Register shutdown hooks
process.on('SIGINT', () => shutdownRelay());
process.on('SIGTERM', () => shutdownRelay());
process.on('exit', () => shutdownRelay());
