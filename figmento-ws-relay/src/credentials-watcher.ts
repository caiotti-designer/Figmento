/**
 * Credentials Watcher — polls OAuth credential files for mtime changes and exits
 * the process when any token is rotated. PM2's autorestart respawns the relay
 * with fresh credentials.
 *
 * Watched files:
 *   - ~/.claude/.credentials.json (Claude Code OAuth)
 *   - ~/.codex/auth.json          (Codex CLI OAuth)
 *
 * Why polling instead of fs.watch / chokidar / PM2 watch:
 *   PM2's `watch` option uses chokidar which is unreliable for single-file
 *   watches on Windows. Polling mtime is OS-agnostic and bulletproof.
 *
 * Trade-off: up to POLL_INTERVAL_MS lag between rotation and restart. With
 * a 15s default that's fine — far better than not detecting at all.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const POLL_INTERVAL_MS = 15_000; // 15s — fast enough for steady-state recovery

interface WatchTarget {
  label: string;
  filePath: string;
  baselineMtime: number;
}

export function startCredentialsWatcher(): void {
  const candidates: Array<{ label: string; filePath: string }> = [
    { label: 'Claude', filePath: path.join(os.homedir(), '.claude', '.credentials.json') },
    { label: 'Codex', filePath: path.join(os.homedir(), '.codex', 'auth.json') },
  ];

  const targets: WatchTarget[] = [];
  for (const c of candidates) {
    try {
      const baselineMtime = fs.statSync(c.filePath).mtimeMs;
      targets.push({ ...c, baselineMtime });
      console.log(
        `[Figmento Creds] Watching ${c.label} at ${c.filePath} ` +
          `(baseline mtime: ${new Date(baselineMtime).toISOString()})`,
      );
    } catch {
      console.log(`[Figmento Creds] ${c.label} cred file ${c.filePath} not found — skipping`);
    }
  }

  if (targets.length === 0) {
    console.log('[Figmento Creds] No cred files found — watcher disabled');
    return;
  }

  console.log(`[Figmento Creds] Watcher armed — polling ${targets.length} file(s) every ${POLL_INTERVAL_MS / 1000}s`);

  const interval = setInterval(() => {
    for (const t of targets) {
      let currentMtime: number;
      try {
        currentMtime = fs.statSync(t.filePath).mtimeMs;
      } catch {
        // File temporarily unreadable (mid-write by another process) — try again next tick
        continue;
      }

      if (currentMtime > t.baselineMtime) {
        console.log(
          `[Figmento Creds] ${t.label} token rotated (mtime ${new Date(t.baselineMtime).toISOString()} → ` +
            `${new Date(currentMtime).toISOString()}). Exiting for PM2 to respawn with fresh credentials.`,
        );
        clearInterval(interval);
        // Graceful exit — PM2's autorestart picks this up.
        process.exit(0);
      }
    }
  }, POLL_INTERVAL_MS);

  // Don't block process shutdown on this timer
  if (typeof interval.unref === 'function') {
    interval.unref();
  }
}
