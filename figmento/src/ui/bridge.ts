/**
 * Figmento Bridge Module — WebSocket relay for MCP server.
 * Ported from figmento-plugin/src/ui-app.ts bridge sections.
 */

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

let ws: WebSocket | null = null;
let bridgeChannelId: string | null = null;
let isBridgeConnected = false;
let bridgeCommandCount = 0;
let bridgeErrorCount = 0;

// ═══════════════════════════════════════════════════════════════
// DOM HELPERS
// ═══════════════════════════════════════════════════════════════

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
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

export function initBridge() {
  $('bridge-connect').addEventListener('click', toggleBridge);
}

/** Handle a bridge command-result (non-chat commands routed here). */
export function handleBridgeCommandResult(resp: Record<string, unknown>) {
  const cmdId = resp.id as string;

  if (resp.success) {
    addBridgeLog(`RSP ${cmdId}: OK`, 'ok');
  } else {
    bridgeErrorCount++;
    $('bridge-err-count').textContent = String(bridgeErrorCount);
    addBridgeLog(`RSP ${cmdId}: ERR ${resp.error}`, 'err');
  }

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(resp));
  }
}

// ═══════════════════════════════════════════════════════════════
// BRIDGE — INTERNALS
// ═══════════════════════════════════════════════════════════════

function generateChannelId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'figmento-';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function setBridgeConnected(connected: boolean) {
  isBridgeConnected = connected;
  $('bridge-dot').className = 'status-dot' + (connected ? ' connected' : '');
  $('bridge-status').textContent = connected ? 'Connected' : 'Disconnected';
  $('bridge-connect').textContent = connected ? 'Disconnect' : 'Connect';
  ($('bridge-connect') as HTMLElement).className = 'btn' + (connected ? ' btn-danger' : ' btn-primary');
  $('bridge-channel').textContent = connected ? bridgeChannelId! : '---';
  $('channel-hint').textContent = connected ? 'Click to copy' : 'Select & copy to use with Claude Code';
}

// Expose globally for onclick in HTML
(window as any).copyChannelId = function copyChannelId() {
  if (!bridgeChannelId) return;
  const display = $('channel-display');
  const hint = $('channel-hint');

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

  if (ok) {
    display.classList.add('copied');
    hint.textContent = 'Copied!';
    hint.style.color = '#4ade80';
    setTimeout(() => {
      display.classList.remove('copied');
      hint.textContent = 'Click to copy';
      hint.style.color = '';
    }, 1500);
  } else {
    const range = document.createRange();
    range.selectNodeContents($('bridge-channel'));
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    hint.textContent = 'Press Ctrl+C to copy';
    setTimeout(() => { hint.textContent = 'Click to copy'; }, 2000);
  }
};

function addBridgeLog(text: string, type: string = 'sys') {
  const area = $('bridge-log');
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + type;
  const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  entry.textContent = `${time}  ${text}`;
  area.appendChild(entry);
  area.scrollTop = area.scrollHeight;
  while (area.children.length > 100) area.removeChild(area.firstChild!);
}

function toggleBridge() {
  if (isBridgeConnected) {
    if (ws) { ws.close(); ws = null; }
    setBridgeConnected(false);
    addBridgeLog('Disconnected', 'sys');
  } else {
    connectBridge();
  }
}

function connectBridge() {
  const url = ($('bridge-url') as HTMLInputElement).value.trim();
  if (!url) return;

  bridgeChannelId = generateChannelId();
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
      return;
    }

    if (msg.type === 'command') {
      bridgeCommandCount++;
      $('bridge-cmd-count').textContent = String(bridgeCommandCount);
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
    ws = null;
  };

  ws.onerror = () => addBridgeLog('WebSocket error', 'err');
}
