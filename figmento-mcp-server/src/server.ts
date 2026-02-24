import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FigmentoWSClient } from './ws-client';
import { registerConnectionTools } from './tools/connection';
import { registerCanvasTools } from './tools/canvas';
import { registerStyleTools } from './tools/style';
import { registerSceneTools } from './tools/scene';
import { registerExportNodeTool, registerExportToFileTool, registerEvaluateDesignTool } from './tools/export';
import { registerBatchTools } from './tools/batch';
import { registerIntelligenceTools } from './tools/intelligence';
import { registerTemplateTools } from './tools/template';

/**
 * Creates and configures the Figmento MCP server with all design tools.
 */
export function createFigmentoServer(): McpServer {
  const server = new McpServer({
    name: 'figmento',
    version: '1.0.0',
  });

  const wsClient = new FigmentoWSClient();

  // Helper: ensure connected before executing a tool
  async function requireConnection() {
    if (!wsClient.isConnected) {
      throw new Error(
        'Not connected to Figma. Use the connect_to_figma tool first with the channel ID shown in the Figma plugin.'
      );
    }
  }

  // Helper: send command and return formatted result
  async function sendDesignCommand(action: string, params: Record<string, unknown>) {
    await requireConnection();
    const response = await wsClient.sendCommand(action, params);
    if (!response.success) {
      throw new Error(`Figma error: ${response.error || 'Unknown error'}`);
    }
    return response.data || {};
  }

  // Register all tool modules
  registerConnectionTools(server, wsClient);
  registerCanvasTools(server, sendDesignCommand);
  registerStyleTools(server, sendDesignCommand);
  registerSceneTools(server, sendDesignCommand);
  registerExportNodeTool(server, sendDesignCommand);
  registerExportToFileTool(server, sendDesignCommand);
  registerEvaluateDesignTool(server, sendDesignCommand);
  registerBatchTools(server, sendDesignCommand);
  registerIntelligenceTools(server);
  registerTemplateTools(server, sendDesignCommand);

  return server;
}
