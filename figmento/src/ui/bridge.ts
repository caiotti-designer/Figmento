/**
 * Figmento Bridge Module — WebSocket relay for MCP server.
 *
 * State backed by nanostores (see stores.ts). Module-level mutations go
 * through atoms so subscribers (status dot, future UI) react automatically.
 * Backward-compat getter functions (getBridgeChannelId, etc.) wrap atom.get().
 */

import {
  $bridgeChannelId,
  $bridgeCommandCount,
  $bridgeConnected,
  $bridgeErrorCount,
  $relayState,
} from './stores';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const DEFAULT_CHANNEL = 'figmento-local';

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

let ws: WebSocket | null = null;

// ═══════════════════════════════════════════════════════════════
// DOM HELPERS
// ═══════════════════════════════════════════════════════════════

/** Safe element getter — returns null if not found. */
function $safe(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function postToSandbox(msg: Record<string, unknown>) {
  parent.postMessage({ pluginMessage: msg }, '*');
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════
// Thin wrappers around store atoms for back-compat with chat.ts / image-studio.ts.
// New code should subscribe directly to atoms in stores.ts.

export function getBridgeChannelId(): string | null {
  return $bridgeChannelId.get();
}

export function getBridgeConnected(): boolean {
  return $bridgeConnected.get();
}

export function getBridgeCommandCount(): number {
  return $bridgeCommandCount.get();
}

export function getBridgeErrorCount(): number {
  return $bridgeErrorCount.get();
}

export function initBridge() {
  // Original hidden Bridge tab button
  const origBtn = $safe('bridge-connect');
  if (origBtn) origBtn.addEventListener('click', toggleBridge);

  // Settings Advanced section button
  const advBtn = $safe('bridge-adv-connect');
  if (advBtn) advBtn.addEventListener('click', toggleBridgeFromAdvanced);

  // Sync dropdowns on change
  const urlSelect = $safe('bridge-url') as HTMLSelectElement | null;
  const advUrlSelect = $safe('bridge-adv-url') as HTMLSelectElement | null;
  if (urlSelect)
    urlSelect.addEventListener('change', () => {
      if (advUrlSelect) advUrlSelect.value = urlSelect.value;
    });
  if (advUrlSelect)
    advUrlSelect.addEventListener('change', () => {
      if (urlSelect) urlSelect.value = advUrlSelect.value;
    });
}

/** Restore saved relay URL into bridge dropdowns. Called when settings load. */
export function restoreBridgeRelayUrl(savedUrl: string) {
  if (!savedUrl) return;
  const urlSelect = $safe('bridge-url') as HTMLSelectElement | null;
  const advUrlSelect = $safe('bridge-adv-url') as HTMLSelectElement | null;
  if (urlSelect) urlSelect.value = savedUrl;
  if (advUrlSelect) advUrlSelect.value = savedUrl;
}

/**
 * Auto-connect Bridge for chat relay mode (CR-3, DX-1).
 * Called when chatRelayEnabled is true. Connects to the relay using a
 * fixed channel (default: 'figmento-local') so both sides agree without copy-paste.
 * @param relayUrl - Relay HTTP/WS URL
 * @param channel - Optional channel override. Falls back to stored or default channel.
 */
export function autoConnectBridge(relayUrl: string, channel?: string) {
  const connected = $bridgeConnected.get();
  console.log(
    `[Figmento Bridge] autoConnectBridge called: connected=${connected} wsState=${ws?.readyState} url=${relayUrl} channel=${channel}`
  );
  // Already connected — just re-notify status (fixes stale "Relay: Off" label)
  if (connected && ws && ws.readyState === WebSocket.OPEN) {
    console.log('[Figmento Bridge] already connected -> re-notifying relay status');
    $relayState.set('connected');
    return;
  }

  // Close any existing stale connection
  if (ws) {
    ws.close();
    ws = null;
  }

  // Convert HTTP(S) URL to WS(S) for the bridge connection
  let wsUrl = relayUrl;
  if (wsUrl.startsWith('https://')) wsUrl = 'wss://' + wsUrl.slice(8);
  else if (wsUrl.startsWith('http://')) wsUrl = 'ws://' + wsUrl.slice(7);
  if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) wsUrl = 'wss://' + wsUrl;

  // DX-1 AC7/AC8: Use provided channel, or fall back to default
  const channelId = channel || DEFAULT_CHANNEL;
  $bridgeChannelId.set(channelId);
  // Persist channel to clientStorage for next session
  postToSandbox({ type: 'save-bridge-channel', channel: channelId });
  addBridgeLog(`[Auto] Connecting to ${wsUrl}...`, 'sys');

  // Sync dropdown selections
  const urlSelect = $safe('bridge-url') as HTMLSelectElement | null;
  if (urlSelect) urlSelect.value = wsUrl;
  const advUrlSelect = $safe('bridge-adv-url') as HTMLSelectElement | null;
  if (advUrlSelect) advUrlSelect.value = wsUrl;

  $relayState.set('connecting');

  try {
    ws = new WebSocket(wsUrl);
  } catch (e) {
    addBridgeLog(`[Auto] Failed: ${(e as Error).message}`, 'err');
    $relayState.set('error');
    return;
  }

  ws.onopen = () => {
    addBridgeLog('[Auto] WebSocket connected', 'ok');
    ws!.send(JSON.stringify({ type: 'join', channel: $bridgeChannelId.get() }));
  };

  ws.onmessage = (event) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(event.data as string);
    } catch {
      return;
    }

    if (msg.type === 'joined') {
      setBridgeConnected(true);
      addBridgeLog(`[Auto] Joined channel: ${msg.channel} (${msg.clients} client(s))`, 'ok');
      $relayState.set('connected');
      return;
    }

    if (msg.type === 'claude-code-turn-result') {
      addBridgeLog(`[Auto] Claude Code result received`, 'ok');
      if (claudeCodeResultHandler) claudeCodeResultHandler(msg);
      return;
    }

    if (msg.type === 'claude-code-progress') {
      // Stream progress updates to chat UI — shows tool execution in real-time
      if (claudeCodeProgressHandler) claudeCodeProgressHandler(msg);
      return;
    }

    if (msg.type === 'command') {
      $bridgeCommandCount.set($bridgeCommandCount.get() + 1);
      updateCommandCounts();
      addBridgeLog(`CMD ${msg.id}: ${msg.action}`, 'cmd');
      postToSandbox({ type: 'execute-command', command: msg });
      return;
    }

    if (msg.type === 'error') {
      addBridgeLog(`Server error: ${msg.error}`, 'err');
    }
  };

  ws.onclose = () => {
    setBridgeConnected(false);
    addBridgeLog('[Auto] WebSocket disconnected', 'err');
    $relayState.set('disconnected');
    ws = null;
  };

  ws.onerror = () => {
    addBridgeLog('[Auto] WebSocket error', 'err');
    $relayState.set('error');
  };
}

// Subscribe the header status dot (inside settingsBtn) to $relayState.
// Atom-driven: green = connected, red = error, grey = off/connecting/fallback.
// Subscription is set up once at module load — no need to call from elsewhere.
$relayState.subscribe((state) => {
  const dot = document.getElementById('statusDot');
  const settingsBtn = document.getElementById('settingsBtn');
  if (!dot) return;

  dot.classList.remove('connected', 'error', 'warning');
  if (state === 'connected') {
    dot.classList.add('connected');
  } else if (state === 'error') {
    dot.classList.add('error');
  }
  // disconnected, connecting, fallback → no class → default grey

  if (settingsBtn) {
    const labels: Record<typeof state, string> = {
      disconnected: 'Relay: Off',
      connecting: 'Relay: Connecting…',
      connected: 'Relay: Connected',
      fallback: 'Relay: Fallback (direct API)',
      error: 'Relay: Error',
    };
    settingsBtn.setAttribute('title', labels[state] || 'Settings');
  }
});

/**
 * Send a raw message through the bridge WebSocket.
 * Used by the Claude Code provider to send claude-code-turn messages.
 */
export function sendBridgeMessage(msg: Record<string, unknown>): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(msg));
  return true;
}

/** Callback for handling claude-code-turn-result messages from the relay. */
let claudeCodeResultHandler: ((msg: Record<string, unknown>) => void) | null = null;

export function setClaudeCodeResultHandler(handler: ((msg: Record<string, unknown>) => void) | null) {
  claudeCodeResultHandler = handler;
}

/** Callback for handling claude-code-progress messages (tool execution streaming). */
let claudeCodeProgressHandler: ((msg: Record<string, unknown>) => void) | null = null;

export function setClaudeCodeProgressHandler(handler: ((msg: Record<string, unknown>) => void) | null) {
  claudeCodeProgressHandler = handler;
}

/** Handle a bridge command-result (non-chat commands routed here). */
export function handleBridgeCommandResult(resp: Record<string, unknown>) {
  const cmdId = resp.id as string;

  if (resp.success) {
    addBridgeLog(`RSP ${cmdId}: OK`, 'ok');
  } else {
    $bridgeErrorCount.set($bridgeErrorCount.get() + 1);
    updateCommandCounts();
    addBridgeLog(`RSP ${cmdId}: ERR ${resp.error}`, 'err');
  }

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(resp));
  }
}

// ═══════════════════════════════════════════════════════════════
// BRIDGE — INTERNALS
// ═══════════════════════════════════════════════════════════════

/** Update command/error counts across all Bridge DOM locations. */
function updateCommandCounts() {
  const cmds = $bridgeCommandCount.get();
  const errs = $bridgeErrorCount.get();

  // Original hidden Bridge tab
  const origCmd = $safe('bridge-cmd-count');
  if (origCmd) origCmd.textContent = String(cmds);
  const origErr = $safe('bridge-err-count');
  if (origErr) origErr.textContent = String(errs);

  // Settings Advanced section
  const advCmd = $safe('bridge-adv-cmd-count');
  if (advCmd) advCmd.textContent = String(cmds);
  const advErr = $safe('bridge-adv-err-count');
  if (advErr) advErr.textContent = String(errs);
}

function setBridgeConnected(connected: boolean) {
  $bridgeConnected.set(connected);
  const channelId = $bridgeChannelId.get();

  // Original hidden Bridge tab elements
  const origDot = $safe('bridge-dot');
  if (origDot) origDot.className = 'status-dot' + (connected ? ' connected' : '');
  const origStatus = $safe('bridge-status');
  if (origStatus) origStatus.textContent = connected ? 'Connected' : 'Disconnected';
  const origBtn = $safe('bridge-connect');
  if (origBtn) {
    origBtn.textContent = connected ? 'Disconnect' : 'Connect';
    origBtn.className = 'btn' + (connected ? ' btn-danger' : ' btn-primary');
  }
  const origChannel = $safe('bridge-channel');
  if (origChannel) origChannel.textContent = connected && channelId ? channelId : '---';
  const origHint = $safe('channel-hint');
  if (origHint) origHint.textContent = connected ? 'Click to copy' : 'Select & copy to use with Claude Code';

  // Settings Advanced section elements
  const advBtn = $safe('bridge-adv-connect');
  if (advBtn) {
    advBtn.textContent = connected ? 'Disconnect' : 'Connect';
    advBtn.className = 'bridge-btn' + (connected ? ' btn-danger' : '');
  }
  const advChannel = $safe('bridge-adv-channel');
  if (advChannel) advChannel.textContent = connected && channelId ? channelId : '---';
  const advHint = $safe('bridge-adv-hint');
  if (advHint) advHint.textContent = connected ? 'Click to copy' : 'Select & copy to use with Claude Code';

  updateCommandCounts();
}

// Expose globally for onclick in HTML
(window as any).copyChannelId = function copyChannelId() {
  const channelId = $bridgeChannelId.get();
  if (!channelId) return;

  const ta = document.createElement('textarea');
  ta.value = channelId;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch (_) {
    ok = false;
  }
  document.body.removeChild(ta);

  // Flash feedback on all channel display elements
  const displays = ['channel-display', 'bridge-adv-channel-display'];
  const hints = ['channel-hint', 'bridge-adv-hint'];

  if (ok) {
    for (const id of displays) {
      const el = $safe(id);
      if (el) {
        el.classList.add('copied');
        setTimeout(() => el.classList.remove('copied'), 1500);
      }
    }
    for (const id of hints) {
      const el = $safe(id);
      if (el) {
        el.textContent = 'Copied!';
        el.style.color = '#4ade80';
        setTimeout(() => {
          el.textContent = 'Click to copy';
          el.style.color = '';
        }, 1500);
      }
    }
    // Also flash the Status Tab channel value
    const statusChannel = $safe('status-mcp-channel');
    if (statusChannel) {
      const orig = statusChannel.style.color;
      statusChannel.style.color = '#4ade80';
      setTimeout(() => {
        statusChannel.style.color = orig;
      }, 1500);
    }
  }
};

function addBridgeLog(text: string, type: string = 'sys') {
  const time = new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const content = `${time}  ${text}`;

  // Write to both log areas
  const logIds = ['bridge-log', 'bridge-adv-log'];
  for (const id of logIds) {
    const area = $safe(id);
    if (!area) continue;
    const entry = document.createElement('div');
    entry.className = 'log-entry ' + type;
    entry.textContent = content;
    area.appendChild(entry);
    area.scrollTop = area.scrollHeight;
    while (area.children.length > 100) area.removeChild(area.firstChild!);
  }
}

function toggleBridge() {
  if ($bridgeConnected.get()) {
    if (ws) {
      ws.close();
      ws = null;
    }
    setBridgeConnected(false);
    $relayState.set('disconnected');
    addBridgeLog('Disconnected', 'sys');
  } else {
    connectBridge('bridge-url');
  }
}

function toggleBridgeFromAdvanced() {
  if ($bridgeConnected.get()) {
    if (ws) {
      ws.close();
      ws = null;
    }
    setBridgeConnected(false);
    $relayState.set('disconnected');
    addBridgeLog('Disconnected', 'sys');
  } else {
    connectBridge('bridge-adv-url');
  }
}

function connectBridge(urlInputId: string) {
  const urlEl = $safe(urlInputId) as HTMLSelectElement | null;
  const url = urlEl?.value.trim();
  if (!url) return;

  // Sync both dropdowns
  const otherInput = urlInputId === 'bridge-url' ? 'bridge-adv-url' : 'bridge-url';
  const otherEl = $safe(otherInput) as HTMLSelectElement | null;
  if (otherEl) otherEl.value = url;

  // Persist relay choice
  postToSandbox({ type: 'save-bridge-relay-url', url });

  // AC10: Use current channel if already set (manual override), otherwise default
  const channelId = $bridgeChannelId.get() || DEFAULT_CHANNEL;
  $bridgeChannelId.set(channelId);
  // Persist manual channel choice
  postToSandbox({ type: 'save-bridge-channel', channel: channelId });
  addBridgeLog(`Connecting to ${url}...`, 'sys');

  try {
    ws = new WebSocket(url);
  } catch (e) {
    addBridgeLog(`Failed: ${(e as Error).message}`, 'err');
    return;
  }

  ws.onopen = () => {
    addBridgeLog('WebSocket connected', 'ok');
    ws!.send(JSON.stringify({ type: 'join', channel: $bridgeChannelId.get() }));
  };

  ws.onmessage = (event) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(event.data as string);
    } catch {
      return;
    }

    if (msg.type === 'joined') {
      setBridgeConnected(true);
      addBridgeLog(`Joined channel: ${msg.channel} (${msg.clients} client(s))`, 'ok');
      // Update Chat tab relay status on manual bridge connect too
      $relayState.set('connected');
      return;
    }

    if (msg.type === 'claude-code-turn-result') {
      addBridgeLog(`Claude Code result received`, 'ok');
      if (claudeCodeResultHandler) claudeCodeResultHandler(msg);
      return;
    }

    if (msg.type === 'command') {
      $bridgeCommandCount.set($bridgeCommandCount.get() + 1);
      updateCommandCounts();
      addBridgeLog(`CMD ${msg.id}: ${msg.action}`, 'cmd');
      postToSandbox({ type: 'execute-command', command: msg });
      return;
    }

    if (msg.type === 'error') {
      addBridgeLog(`Server error: ${msg.error}`, 'err');
    }
  };

  ws.onclose = () => {
    setBridgeConnected(false);
    addBridgeLog('WebSocket disconnected', 'err');
    $relayState.set('disconnected');
    ws = null;
  };

  ws.onerror = () => addBridgeLog('WebSocket error', 'err');
}
