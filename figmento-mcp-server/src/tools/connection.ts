import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FigmentoWSClient } from '../ws-client';

export function registerConnectionTools(server: McpServer, wsClient: FigmentoWSClient): void {
  server.tool(
    'connect_to_figma',
    'Connect to a Figma file via the Figmento plugin. Open the Figmento MCP plugin in Figma, copy the channel ID, and pass it here. The relay server must be running on the specified URL.',
    {
      channel: z.string().describe('Channel ID shown in the Figma plugin (e.g. "figmento-abc123")'),
      url: z.string().optional().describe('WebSocket relay URL (default: ws://localhost:3055)'),
    },
    async ({ channel, url }) => {
      const wsUrl = url || 'ws://localhost:3055';

      if (wsClient.isConnected) {
        wsClient.disconnect();
      }

      try {
        await wsClient.connect(wsUrl, channel);
        return {
          content: [{
            type: 'text' as const,
            text: `Connected to Figma via channel "${channel}". You can now use design tools.`,
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: `Failed to connect: ${(err as Error).message}\n\nMake sure:\n1. The WebSocket relay server is running (cd figmento-ws-relay && npm start)\n2. The Figmento plugin is open in Figma and connected to the same relay\n3. The channel ID matches what's shown in the plugin`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'disconnect_from_figma',
    'Disconnect from the current Figma session.',
    {},
    async () => {
      wsClient.disconnect();
      return {
        content: [{ type: 'text' as const, text: 'Disconnected from Figma.' }],
      };
    }
  );
}
