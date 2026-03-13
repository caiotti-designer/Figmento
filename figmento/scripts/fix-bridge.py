"""Apply bridge.ts fixes: add notifyRelayStatus to manual connect path + diagnostic logs."""
import os

path = os.path.join(os.path.dirname(__file__), '..', 'src', 'ui', 'bridge.ts')
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add diagnostic log to notifyRelayStatus function
content = content.replace(
    'function notifyRelayStatus(state: string) {\n'
    '  const dot = document.getElementById(\'relay-status-dot\');\n'
    '  const label = document.getElementById(\'relay-status-label\');\n'
    '  const channelDisplay = document.getElementById(\'relay-channel-display\');\n'
    '  if (!dot || !label) return;',

    'function notifyRelayStatus(state: string) {\n'
    '  const dot = document.getElementById(\'relay-status-dot\');\n'
    '  const label = document.getElementById(\'relay-status-label\');\n'
    '  const channelDisplay = document.getElementById(\'relay-channel-display\');\n'
    '  console.log(`[Figmento Bridge] notifyRelayStatus(\'${state}\'): dot=${!!dot} label=${!!label} channelId=${bridgeChannelId}`);\n'
    '  if (!dot || !label) return;'
)

# 2. Add notifyRelayStatus('connected') to manual connectBridge join handler
# The manual handler has "Joined channel:" without "[Auto]" prefix
content = content.replace(
    "      setBridgeConnected(true);\n"
    "      addBridgeLog(`Joined channel: ${msg.channel} (${msg.clients} client(s))`, 'ok');\n"
    "      return;",

    "      setBridgeConnected(true);\n"
    "      addBridgeLog(`Joined channel: ${msg.channel} (${msg.clients} client(s))`, 'ok');\n"
    "      // Update Chat tab relay status on manual bridge connect too\n"
    "      notifyRelayStatus('connected');\n"
    "      return;"
)

# 3. Add notifyRelayStatus('disconnected') to manual connectBridge onclose
content = content.replace(
    "    setBridgeConnected(false);\n"
    "    addBridgeLog('WebSocket disconnected', 'err');\n"
    "    ws = null;\n"
    "  };\n"
    "\n"
    "  ws.onerror = () => addBridgeLog('WebSocket error', 'err');",

    "    setBridgeConnected(false);\n"
    "    addBridgeLog('WebSocket disconnected', 'err');\n"
    "    notifyRelayStatus('disconnected');\n"
    "    ws = null;\n"
    "  };\n"
    "\n"
    "  ws.onerror = () => addBridgeLog('WebSocket error', 'err');"
)

# 4. Add notifyRelayStatus('disconnected') to toggleBridge disconnect
content = content.replace(
    "    if (ws) { ws.close(); ws = null; }\n"
    "    setBridgeConnected(false);\n"
    "    addBridgeLog('Disconnected', 'sys');",

    "    if (ws) { ws.close(); ws = null; }\n"
    "    setBridgeConnected(false);\n"
    "    notifyRelayStatus('disconnected');\n"
    "    addBridgeLog('Disconnected', 'sys');"
)

# 5. Add diagnostic log to autoConnectBridge entry
content = content.replace(
    "export function autoConnectBridge(relayUrl: string) {\n"
    "  // Already connected",

    "export function autoConnectBridge(relayUrl: string) {\n"
    "  console.log(`[Figmento Bridge] autoConnectBridge called: connected=${isBridgeConnected} wsState=${ws?.readyState} url=${relayUrl}`);\n"
    "  // Already connected"
)

# 6. Add diagnostic log before early-return notifyRelayStatus
content = content.replace(
    "  if (isBridgeConnected && ws && ws.readyState === WebSocket.OPEN) {\n"
    "    notifyRelayStatus('connected');\n"
    "    return;",

    "  if (isBridgeConnected && ws && ws.readyState === WebSocket.OPEN) {\n"
    "    console.log('[Figmento Bridge] already connected -> re-notifying relay status');\n"
    "    notifyRelayStatus('connected');\n"
    "    return;"
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('bridge.ts patched successfully')
