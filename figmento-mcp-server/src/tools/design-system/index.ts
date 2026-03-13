// ═══════════════════════════════════════════════════════════
// Design System — Barrel Index
// Wires all 5 tool modules + re-exports for consumers
// ═══════════════════════════════════════════════════════════

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCrudTools, saveDesignSystem } from './ds-crud';
import { registerFormatTools } from './ds-formats';
import { registerAnalysisTools } from './ds-analysis';
import { registerComponentTools } from './ds-components';
import { registerExtractionTools } from './ds-extraction';
import type { SendDesignCommand } from './ds-types';

// Re-exports for consumers (patterns.ts, ds-templates.ts, figma-native.ts)
export { getKnowledgeDir, getDesignSystemsDir, getFormatsDir } from '../utils/knowledge-paths';
export { resolveTokens, deepMerge } from '../utils/tokens';
export { recipeToCommands } from '../utils/recipe-to-commands';

// Re-export types and schemas
export * from './ds-types';
export * from './ds-schemas';

/**
 * Registers all 14 design-system MCP tools on the server.
 * Wires saveDesignSystem from ds-crud as the saveFn callback
 * into ds-extraction to avoid circular dependencies.
 */
export function registerDesignSystemTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {
  registerCrudTools(server, sendDesignCommand);
  registerFormatTools(server, sendDesignCommand);
  registerAnalysisTools(server, sendDesignCommand);
  registerComponentTools(server, sendDesignCommand);
  registerExtractionTools(server, sendDesignCommand, saveDesignSystem);
}
