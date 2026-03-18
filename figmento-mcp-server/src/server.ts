import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FigmentoWSClient } from './ws-client';
import { registerConnectionTools } from './tools/connection';
import { registerCanvasTools } from './tools/canvas';
import { registerStyleTools } from './tools/style';
import { registerSceneTools } from './tools/scene';
import { registerGetScreenshotTool, registerExportNodeTool, registerExportToFileTool, registerEvaluateDesignTool } from './tools/export';
import { registerBatchTools } from './tools/batch';
import { registerIntelligenceTools, preWarmKnowledgeCache } from './tools/intelligence';
import { registerTemplateTools } from './tools/template';
import { registerDesignSystemTools } from './tools/design-system';
import { registerPatternTools } from './tools/patterns';
import { registerDsTemplateTools } from './tools/ds-templates';
import { registerIconTools } from './tools/icons';
import { registerAdAnalyzerTools } from './tools/ad-analyzer';
import { registerLayoutTools } from './tools/layouts';
import { registerReferenceTools } from './tools/references';
import { registerFigmaNativeTools } from './tools/figma-native';
import { registerRefinementTools } from './tools/refinement';
import { registerLearningTools } from './tools/learning';
import { registerResourceTools } from './tools/resources';
import { registerImageGenTools } from './tools/image-gen';
import { registerFileStorageTools, cleanupOldTempFiles } from './tools/file-storage';
import { registerOrchestrationTools } from './tools/orchestration';

/**
 * Creates and configures the Figmento MCP server with all design tools.
 */
export interface FigmentoServerResult {
  server: McpServer;
  wsClient: FigmentoWSClient;
}

export function createFigmentoServer(): FigmentoServerResult {
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
  registerGetScreenshotTool(server, sendDesignCommand);
  registerExportNodeTool(server, sendDesignCommand);
  registerExportToFileTool(server, sendDesignCommand);
  registerEvaluateDesignTool(server, sendDesignCommand);
  registerBatchTools(server, sendDesignCommand);
  registerIntelligenceTools(server);
  registerTemplateTools(server, sendDesignCommand);
  registerDesignSystemTools(server, sendDesignCommand);
  registerPatternTools(server, sendDesignCommand);
  registerDsTemplateTools(server, sendDesignCommand);
  registerIconTools(server, sendDesignCommand);
  registerAdAnalyzerTools(server, sendDesignCommand);
  registerLayoutTools(server);
  registerReferenceTools(server);
  registerFigmaNativeTools(server, sendDesignCommand);
  registerRefinementTools(server, sendDesignCommand);
  registerLearningTools(server, wsClient);
  registerResourceTools(server);
  registerImageGenTools(server, sendDesignCommand);
  registerFileStorageTools(server, sendDesignCommand);
  registerOrchestrationTools(server, sendDesignCommand);

  // SP-7: Pre-warm knowledge cache (fire-and-forget, non-blocking)
  preWarmKnowledgeCache();

  // CF-2: Cleanup temp files older than 24h
  cleanupOldTempFiles();

  return { server, wsClient };
}
