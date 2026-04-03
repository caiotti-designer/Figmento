/**
 * Figmento Bridge Module — WebSocket relay for MCP server.
 * FN-15: Updated to sync state across Status Tab, Settings Advanced section,
 * and the original hidden Bridge tab elements.
 */

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const DEFAULT_CHANNEL = 'figmento-local';

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

let ws: WebSocket | null = null;
let bridgeChannelId: string | null = null;
let isBridgeConnected = false;
let bridgeCommandCount = 0;
let bridgeErrorCount = 0;

/** External callback invoked whenever bridge connection state changes. */
let onBridgeStateChange: ((connected: boolean, channelId: string | null, cmds: number, errs: number) => void) | null = null;

// ═══════════════════════════════════════════════════════════════
// DOM HELPERS
// ═══════════════════════════════════════════════════════════════

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

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

export function getBridgeChannelId(): string | null {
  return bridgeChannelId;
}

export function getBridgeConnected(): boolean {
  return isBridgeConnected;
}

export function getBridgeCommandCount(): number {
  return bridgeCommandCount;
}

export function getBridgeErrorCount(): number {
  return bridgeErrorCount;
}

/** Register a callback for bridge state changes (used by Status Tab). */
export function setOnBridgeStateChange(cb: ((connected: boolean, channelId: string | null, cmds: number, errs: number) => void) | null) {
  onBridgeStateChange = cb;
}

export function initBridge() {
  // Original hidden Bridge tab button
  const origBtn = $safe('bridge-connect');
  if (origBtn) origBtn.addEventListener('click', toggleBridge);

  // Settings Advanced section button
  const advBtn = $safe('bridge-adv-connect');
  if (advBtn) advBtn.addEventListener('click', toggleBridgeFromAdvanced);
}

/**
 * Auto-connect Bridge for chat relay mode (CR-3, DX-1).
 * Called when chatRelayEnabled is true. Connects to the relay using a
 * fixed channel (default: 'figmento-local') so both sides agree without copy-paste.
 * @param relayUrl - Relay HTTP/WS URL
 * @param channel - Optional channel override. Falls back to stored or default channel.
 */
export function autoConnectBridge(relayUrl: string, channel?: string) {
  console.log(`[Figmento Bridge] autoConnectBridge called: connected=${isBridgeConnected} wsState=${ws?.readyState} url=${relayUrl} channel=${channel}`);
  // Already connected — just re-notify status (fixes stale "Relay: Off" label)
  if (isBridgeConnected && ws && ws.readyState === WebSocket.OPEN) {
    console.log('[Figmento Bridge] already connected -> re-notifying relay status');
    notifyRelayStatus('connected');
    notifyStateChange();
    return;
  }

  // Close any existing stale connection
  if (ws) { ws.close(); ws = null; }

  // Convert HTTP(S) URL to WS(S) for the bridge connection
  let wsUrl = relayUrl;
  if (wsUrl.startsWith('https://')) wsUrl = 'wss://' + wsUrl.slice(8);
  else if (wsUrl.startsWith('http://')) wsUrl = 'ws://' + wsUrl.slice(7);
  if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) wsUrl = 'wss://' + wsUrl;

  // DX-1 AC7/AC8: Use provided channel, or fall back to default
  bridgeChannelId = channel || DEFAULT_CHANNEL;
  // Persist channel to clientStorage for next session
  postToSandbox({ type: 'save-bridge-channel', channel: bridgeChannelId });
  addBridgeLog(`[Auto] Connecting to ${wsUrl}...`, 'sys');

  // Update URL inputs for visibility
  const urlInput = $safe('bridge-url') as HTMLInputElement | null;
  if (urlInput) urlInput.value = wsUrl;
  const advUrlInput = $safe('bridge-adv-url') as HTMLInputElement | null;
  if (advUrlInput) advUrlInput.value = wsUrl;

  notifyRelayStatus('connecting');
  notifyStateChange();

  try {
    ws = new WebSocket(wsUrl);
  } catch (e) {
    addBridgeLog(`[Auto] Failed: ${(e as Error).message}`, 'err');
    notifyRelayStatus('error');
    return;
  }

  ws.onopen = () => {
    addBridgeLog('[Auto] WebSocket connected', 'ok');
    ws!.send(JSON.stringify({ type: 'join', channel: bridgeChannelId }));
  };

  ws.onmessage = (event) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(event.data as string); } catch { return; }

    if (msg.type === 'joined') {
      setBridgeConnected(true);
      addBridgeLog(`[Auto] Joined channel: ${msg.channel} (${msg.clients} client(s))`, 'ok');
      notifyRelayStatus('connected');
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
      bridgeCommandCount++;
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
    notifyRelayStatus('disconnected');
    ws = null;
  };

  ws.onerror = () => {
    addBridgeLog('[Auto] WebSocket error', 'err');
    notifyRelayStatus('error');
  };
}

/** Update relay status indicator in the Chat tab. */
function notifyRelayStatus(state: string) {
  const dot = document.getElementById('relay-status-dot');
  const label = document.getElementById('relay-status-label');
  const channelDisplay = document.getElementById('relay-channel-display');
  console.log(`[Figmento Bridge] notifyRelayStatus('${state}'): dot=${!!dot} label=${!!label} channelId=${bridgeChannelId}`);
  if (!dot || !label) return;

  dot.className = 'relay-dot ' + state;
  const labels: Record<string, string> = {
    disconnected: 'Relay: Off',
    connecting: 'Relay: Connecting...',
    connected: 'Relay: Connected',
    fallback: 'Relay: Fallback (direct)',
    error: 'Relay: Error',
  };
  label.textContent = labels[state] || 'Relay: Unknown';

  if (channelDisplay) {
    channelDisplay.textContent = (state === 'connected' && bridgeChannelId) ? bridgeChannelId : '';
  }
}

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
    bridgeErrorCount++;
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

/** Notify the external state change listener (Status Tab). */
function notifyStateChange() {
  if (onBridgeStateChange) {
    onBridgeStateChange(isBridgeConnected, bridgeChannelId, bridgeCommandCount, bridgeErrorCount);
  }
}

/** Update command/error counts across all Bridge DOM locations. */
function updateCommandCounts() {
  // Original hidden Bridge tab
  const origCmd = $safe('bridge-cmd-count');
  if (origCmd) origCmd.textContent = String(bridgeCommandCount);
  const origErr = $safe('bridge-err-count');
  if (origErr) origErr.textContent = String(bridgeErrorCount);

  // Settings Advanced section
  const advCmd = $safe('bridge-adv-cmd-count');
  if (advCmd) advCmd.textContent = String(bridgeCommandCount);
  const advErr = $safe('bridge-adv-err-count');
  if (advErr) advErr.textContent = String(bridgeErrorCount);

  notifyStateChange();
}

function setBridgeConnected(connected: boolean) {
  isBridgeConnected = connected;

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
  if (origChannel) origChannel.textContent = connected ? bridgeChannelId! : '---';
  const origHint = $safe('channel-hint');
  if (origHint) origHint.textContent = connected ? 'Click to copy' : 'Select & copy to use with Claude Code';

  // Settings Advanced section elements
  const advBtn = $safe('bridge-adv-connect');
  if (advBtn) {
    advBtn.textContent = connected ? 'Disconnect' : 'Connect';
    advBtn.className = 'bridge-btn' + (connected ? ' btn-danger' : '');
  }
  const advChannel = $safe('bridge-adv-channel');
  if (advChannel) advChannel.textContent = connected ? bridgeChannelId! : '---';
  const advHint = $safe('bridge-adv-hint');
  if (advHint) advHint.textContent = connected ? 'Click to copy' : 'Select & copy to use with Claude Code';

  updateCommandCounts();
}

// Expose globally for onclick in HTML
(window as any).copyChannelId = function copyChannelId() {
  if (!bridgeChannelId) return;

  const ta = document.createElement('textarea');
  ta.value = bridgeChannelId;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
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
        setTimeout(() => { el.textContent = 'Click to copy'; el.style.color = ''; }, 1500);
      }
    }
    // Also flash the Status Tab channel value
    const statusChannel = $safe('status-mcp-channel');
    if (statusChannel) {
      const orig = statusChannel.style.color;
      statusChannel.style.color = '#4ade80';
      setTimeout(() => { statusChannel.style.color = orig; }, 1500);
    }
  }
};

function addBridgeLog(text: string, type: string = 'sys') {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
  if (isBridgeConnected) {
    if (ws) { ws.close(); ws = null; }
    setBridgeConnected(false);
    notifyRelayStatus('disconnected');
    addBridgeLog('Disconnected', 'sys');
  } else {
    connectBridge('bridge-url');
  }
}

function toggleBridgeFromAdvanced() {
  if (isBridgeConnected) {
    if (ws) { ws.close(); ws = null; }
    setBridgeConnected(false);
    notifyRelayStatus('disconnected');
    addBridgeLog('Disconnected', 'sys');
  } else {
    connectBridge('bridge-adv-url');
  }
}

function connectBridge(urlInputId: string) {
  const urlEl = $safe(urlInputId) as HTMLInputElement | null;
  const url = urlEl?.value.trim();
  if (!url) return;

  // Sync URL inputs
  const otherInput = urlInputId === 'bridge-url' ? 'bridge-adv-url' : 'bridge-url';
  const otherEl = $safe(otherInput) as HTMLInputElement | null;
  if (otherEl) otherEl.value = url;

  // AC10: Use current channel if already set (manual override), otherwise default
  bridgeChannelId = bridgeChannelId || DEFAULT_CHANNEL;
  // Persist manual channel choice
  postToSandbox({ type: 'save-bridge-channel', channel: bridgeChannelId });
  addBridgeLog(`Connecting to ${url}...`, 'sys');

  try {
    ws = new WebSocket(url);
  } catch (e) {
    addBridgeLog(`Failed: ${(e as Error).message}`, 'err');
    return;
  }

  ws.onopen = () => {
    addBridgeLog('WebSocket connected', 'ok');
    ws!.send(JSON.stringify({ type: 'join', channel: bridgeChannelId }));
  };

  ws.onmessage = (event) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(event.data as string); } catch { return; }

    if (msg.type === 'joined') {
      setBridgeConnected(true);
      addBridgeLog(`Joined channel: ${msg.channel} (${msg.clients} client(s))`, 'ok');
      // Update Chat tab relay status on manual bridge connect too
      notifyRelayStatus('connected');
      return;
    }

    if (msg.type === 'claude-code-turn-result') {
      addBridgeLog(`Claude Code result received`, 'ok');
      if (claudeCodeResultHandler) claudeCodeResultHandler(msg);
      return;
    }

    if (msg.type === 'command') {
      bridgeCommandCount++;
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
    notifyRelayStatus('disconnected');
    ws = null;
  };

  ws.onerror = () => addBridgeLog('WebSocket error', 'err');
}
