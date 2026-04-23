import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createFigmentoServer } from './server';
import { ensureRelay } from './relay-spawner';

const DEFAULT_CHANNEL = 'figmento-local';

async function main() {
  const { server, wsClient } = createFigmentoServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is reserved for MCP protocol)
  console.error('[Figmento MCP] Server started on stdio transport');

  // DX-1: Ensure relay is running before attempting connection
  await ensureRelay();

  // AC6: Use 'figmento-local' as default channel when FIGMENTO_CHANNEL is not set
  const autoChannel = process.env.FIGMENTO_CHANNEL || DEFAULT_CHANNEL;
  const autoUrl = process.env.FIGMENTO_RELAY_URL || 'ws://localhost:3055';

  console.error(`[Figmento MCP] Env check: FIGMENTO_CHANNEL=${JSON.stringify(process.env.FIGMENTO_CHANNEL)} resolved=${autoChannel} FIGMENTO_RELAY_URL=${JSON.stringify(process.env.FIGMENTO_RELAY_URL)}`);

  console.error(`[Figmento MCP] Auto-connecting to relay: channel=${autoChannel} url=${autoUrl}`);
  try {
    await wsClient.connect(autoUrl, autoChannel);
    console.error(`[Figmento MCP] Auto-connected to channel "${autoChannel}" — ready for tool calls`);
  } catch (err) {
    console.error(`[Figmento MCP] Auto-connect failed: ${(err as Error).message}`);
    console.error('[Figmento MCP] Tools will require manual connect_to_figma call');
  }
}

main().catch((err) => {
  console.error('[Figmento MCP] Fatal error:', err);
  process.exit(1);
});
