import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createFigmentoServer } from './server';

async function main() {
  const server = createFigmentoServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is reserved for MCP protocol)
  console.error('[Figmento MCP] Server started on stdio transport');
}

main().catch((err) => {
  console.error('[Figmento MCP] Fatal error:', err);
  process.exit(1);
});
