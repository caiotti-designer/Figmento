/**
 * Windows console-window suppressor.
 *
 * On Windows, child_process.spawn() defaults to showing a console window for
 * any console-mode executable (codex.exe is one; node.exe spawned as MCP child
 * is another). The Codex SDK does not expose a `windowsHide` option on its
 * internal spawn calls, and downstream MCP server children inherit the same
 * default. The result is a flicker of CMD windows every turn.
 *
 * This module monkey-patches `child_process.spawn` to default `windowsHide`
 * to `true` when the caller hasn't set it explicitly. The relay process never
 * needs to surface a child's console — every subprocess we run is fully
 * controlled via piped stdio.
 *
 * Imported at the very top of src/index.ts so the patch is in place before
 * any module that may spawn a child loads (Claude Agent SDK, Codex SDK, MCP).
 *
 * Safe escape hatch: callers that explicitly pass `windowsHide: false` keep
 * their original behavior. POSIX is a no-op (the option is Windows-only).
 */

// Resolve the underlying CJS module — Node exposes child_process via getters
// on the namespace object, so we have to mutate the exports object directly.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cp = require('child_process') as typeof import('child_process');

const DEBUG_CODEX_SPAWN = process.env.FIGMENTO_CODEX_DEBUG === '1';

if (process.platform === 'win32') {
  const originalSpawn = cp.spawn;

  function patchedSpawn(...args: unknown[]): ReturnType<typeof cp.spawn> {
    let optsIdx = -1;
    if (args.length >= 3 && typeof args[2] === 'object' && args[2] !== null && !Array.isArray(args[2])) {
      optsIdx = 2;
    } else if (args.length >= 2 && typeof args[1] === 'object' && args[1] !== null && !Array.isArray(args[1])) {
      optsIdx = 1;
    }

    if (optsIdx >= 0) {
      const opts = { ...(args[optsIdx] as Record<string, unknown>) };
      if (opts.windowsHide === undefined) opts.windowsHide = true;
      args[optsIdx] = opts;
    } else {
      args.push({ windowsHide: true });
    }

    const child = originalSpawn.apply(cp, args as unknown as Parameters<typeof cp.spawn>);

    // Debug logging — only active when FIGMENTO_CODEX_DEBUG=1.
    // Surfaces codex.exe args + stderr from the MCP server child so we can
    // diagnose why the figmento MCP server stalls under Codex.
    if (DEBUG_CODEX_SPAWN) {
      const cmd = String(args[0] ?? '');
      const argv = Array.isArray(args[1]) ? (args[1] as unknown[]) : [];
      const isCodex = /codex(\.exe)?$/i.test(cmd) || cmd.includes('@openai\\codex');
      const isNodeMcp = /node(\.exe)?$/i.test(cmd) && argv.some((a) => typeof a === 'string' && a.includes('figmento-mcp-server'));

      if (isCodex || isNodeMcp) {
        const tag = isCodex ? '[SPAWN codex]' : '[SPAWN mcp ]';
        process.stderr.write(`${tag} cmd=${cmd}\n`);
        process.stderr.write(`${tag} argv=${JSON.stringify(argv).slice(0, 2000)}\n`);
        const childStderr = (child as unknown as { stderr?: NodeJS.ReadableStream }).stderr;
        if (childStderr && typeof childStderr.on === 'function') {
          childStderr.on('data', (d: Buffer | string) => {
            const text = typeof d === 'string' ? d : d.toString('utf-8');
            for (const line of text.split(/\r?\n/)) {
              if (line) process.stderr.write(`${tag}.stderr ${line}\n`);
            }
          });
        }
        const childStdout = (child as unknown as { stdout?: NodeJS.ReadableStream }).stdout;
        if (isNodeMcp && childStdout && typeof childStdout.on === 'function') {
          // MCP server speaks JSON-RPC on stdout — we only peek the first chunk
          // to confirm it produced output at all (avoids interfering with the
          // protocol stream).
          let peeked = false;
          childStdout.on('data', (d: Buffer | string) => {
            if (peeked) return;
            peeked = true;
            const text = typeof d === 'string' ? d : d.toString('utf-8');
            process.stderr.write(`${tag}.stdout-first ${text.slice(0, 400).replace(/\n/g, ' ⏎ ')}\n`);
          });
        }
        child.once('exit', (code, signal) => {
          process.stderr.write(`${tag} exit code=${code} signal=${signal}\n`);
        });
      }
    }

    return child;
  }

  Object.defineProperty(cp, 'spawn', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: patchedSpawn,
  });

  console.log(`[Figmento Boot] child_process.spawn patched — windowsHide:true (debug=${DEBUG_CODEX_SPAWN ? 'ON' : 'off'})`);
}
