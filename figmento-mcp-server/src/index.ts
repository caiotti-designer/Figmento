import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createFigmentoServer } from './server';

async function main() {
  const { server, wsClient } = createFigmentoServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is reserved for MCP protocol)
  console.error('[Figmento MCP] Server started on stdio transport');

  // CR-5: Auto-connect to relay when FIGMENTO_CHANNEL and FIGMENTO_RELAY_URL
  // env vars are set. This allows the Claude Code SDK to spawn the MCP server
  // as a child process with pre-configured connection — no manual connect_to_figma call needed.
  const autoChannel = process.env.FIGMENTO_CHANNEL;
  const autoUrl = process.env.FIGMENTO_RELAY_URL || 'ws://localhost:3055';

  console.error(`[Figmento MCP] Env check: FIGMENTO_CHANNEL=${JSON.stringify(autoChannel)} FIGMENTO_RELAY_URL=${JSON.stringify(process.env.FIGMENTO_RELAY_URL)}`);

  if (autoChannel) {
    console.error(`[Figmento MCP] Auto-connecting to relay: channel=${autoChannel} url=${autoUrl}`);
    try {
      await wsClient.connect(autoUrl, autoChannel);
      console.error(`[Figmento MCP] Auto-connected to channel "${autoChannel}" — ready for tool calls`);
    } catch (err) {
      console.error(`[Figmento MCP] Auto-connect failed: ${(err as Error).message}`);
      console.error('[Figmento MCP] Tools will require manual connect_to_figma call');
    }
  }
}

main().catch((err) => {
  console.error('[Figmento MCP] Fatal error:', err);
  process.exit(1);
});
