/**
 * Credentials Watcher — polls ~/.claude/.credentials.json for mtime changes
 * and exits the process when the OAuth token is rotated by another `claude`
 * instance. PM2's autorestart respawns the relay with fresh credentials.
 *
 * Why polling instead of fs.watch / chokidar / PM2 watch:
 *   PM2's `watch` option uses chokidar which is unreliable for single-file
 *   watches on Windows (the original config never fired despite confirmed
 *   credential rotations). Polling mtime is OS-agnostic and bulletproof.
 *
 * Trade-off: up to POLL_INTERVAL_MS lag between rotation and restart. With
 * a 15s default that's fine — far better than not detecting at all.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const POLL_INTERVAL_MS = 15_000; // 15s — fast enough for steady-state recovery

export function startCredentialsWatcher(): void {
  const credPath = path.join(os.homedir(), '.claude', '.credentials.json');

  let baselineMtime: number;
  try {
    baselineMtime = fs.statSync(credPath).mtimeMs;
  } catch {
    console.log(`[Figmento Creds] ${credPath} not found at startup — watcher disabled`);
    return;
  }

  console.log(
    `[Figmento Creds] Watcher armed — polling ${credPath} every ${POLL_INTERVAL_MS / 1000}s ` +
      `(baseline mtime: ${new Date(baselineMtime).toISOString()})`,
  );

  const interval = setInterval(() => {
    let currentMtime: number;
    try {
      currentMtime = fs.statSync(credPath).mtimeMs;
    } catch {
      // File temporarily unreadable (mid-write by another process) — try again next tick
      return;
    }

    if (currentMtime > baselineMtime) {
      console.log(
        `[Figmento Creds] Token rotated (mtime ${new Date(baselineMtime).toISOString()} → ` +
          `${new Date(currentMtime).toISOString()}). Exiting for PM2 to respawn with fresh credentials.`,
      );
      clearInterval(interval);
      // Graceful exit — PM2's autorestart picks this up.
      process.exit(0);
    }
  }, POLL_INTERVAL_MS);

  // Don't block process shutdown on this timer
  if (typeof interval.unref === 'function') {
    interval.unref();
  }
}
