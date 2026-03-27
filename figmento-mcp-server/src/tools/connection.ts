import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FigmentoWSClient } from '../ws-client';

export const connectToFigmaSchema = {
  channel: z.string().describe('Channel ID shown in the Figma plugin (e.g. "figmento-abc123")'),
  url: z.string().optional().describe('WebSocket relay URL (default: ws://localhost:3055)'),
};

export const disconnectFromFigmaSchema = {};

export function registerConnectionTools(server: McpServer, wsClient: FigmentoWSClient): void {
  server.tool(
    'connect_to_figma',
    'Connect to a Figma file via the Figmento plugin. Open the Figmento MCP plugin in Figma, copy the channel ID, and pass it here. The relay server must be running on the specified URL.',
    connectToFigmaSchema,
    async ({ channel, url }) => {
      // CR-5 / IC-fix: If FIGMENTO_CHANNEL env is set, this MCP server was spawned
      // by the relay's Claude Code SDK session. ALWAYS use the env channel — never
      // let the model override with an invented channel name.
      const autoChannel = process.env.FIGMENTO_CHANNEL;
      if (autoChannel) {
        // If already connected to the correct channel, just confirm
        if (wsClient.isConnected) {
          return {
            content: [{
              type: 'text' as const,
              text: `Already connected to Figma via channel "${autoChannel}" (auto-connected). Ready for design tools.`,
            }],
          };
        }
        // Not yet connected (race condition) — connect to the env channel, NOT the model's channel
        try {
          const wsUrl = url || process.env.FIGMENTO_RELAY_URL || 'ws://localhost:3055';
          await wsClient.connect(wsUrl, autoChannel);
          return {
            content: [{
              type: 'text' as const,
              text: `Connected to Figma via channel "${autoChannel}" (from env). Ready for design tools.`,
            }],
          };
        } catch (err) {
          return {
            content: [{
              type: 'text' as const,
              text: `Failed to auto-connect to channel "${autoChannel}": ${(err as Error).message}`,
            }],
            isError: true,
          };
        }
      }

      const wsUrl = url || 'ws://localhost:3055';

      if (wsClient.isConnected) {
        wsClient.disconnect();
      }

      try {
        await wsClient.connect(wsUrl, channel);
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: `Failed to connect: ${(err as Error).message}\n\nMake sure:\n1. The WebSocket relay server is running (cd figmento-ws-relay && npm start)\n2. The Figmento plugin is open in Figma and connected to the same relay\n3. The channel ID matches what's shown in the plugin`,
          }],
          isError: true,
        };
      }

      // Verify the Figma plugin is actually listening on this channel
      try {
        await Promise.race([
          wsClient.sendCommand('get_selection', {}),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('PLUGIN_TIMEOUT')), 5000)
          ),
        ]);
        return {
          content: [{
            type: 'text' as const,
            text: `Connected to Figma via channel "${channel}". Plugin is responding — you can now use design tools.`,
          }],
        };
      } catch {
        wsClient.disconnect();
        return {
          content: [{
            type: 'text' as const,
            text: `WebSocket connected but no Figma plugin is responding on channel "${channel}".\n\nIs the Figmento plugin running and connected to the same relay at ${wsUrl}?\n\nMake sure the plugin is open in Figma and shows this channel ID.`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'disconnect_from_figma',
    'Disconnect from the current Figma session.',
    disconnectFromFigmaSchema,
    async () => {
      wsClient.disconnect();
      return {
        content: [{ type: 'text' as const, text: 'Disconnected from Figma.' }],
      };
    }
  );
}
