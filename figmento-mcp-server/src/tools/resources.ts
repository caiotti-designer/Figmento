// ═══════════════════════════════════════════════════════════
// TC-2: Unified list_resources(type, filter?) dispatcher
// Consolidates 8 separate list_* tools into one entry point.
// ═══════════════════════════════════════════════════════════

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listBlueprintsHandler } from './layouts';
import { listReferenceCategoriesHandler } from './references';
import { listPatternsHandler } from './patterns';
import { listTemplatesHandler } from './ds-templates';
import { listIconsHandler } from './icons';
import { listFormatsHandler } from './design-system/ds-formats';
import { listComponentsHandler } from './design-system/ds-components';
import { listDesignSystemsHandler } from './design-system/ds-crud';

// Type → handler mapping
const RESOURCE_HANDLERS: Record<string, (filter?: string) => Promise<{ content: Array<{ type: 'text'; text: string }> }>> = {
  blueprints: listBlueprintsHandler,
  references: listReferenceCategoriesHandler,
  patterns: listPatternsHandler,
  templates: listTemplatesHandler,
  icons: listIconsHandler,
  formats: listFormatsHandler,
  components: listComponentsHandler,
  designSystems: listDesignSystemsHandler,
};

const VALID_TYPES = Object.keys(RESOURCE_HANDLERS);

export const listResourcesSchema = {
  type: z.string().describe(
    'Resource type: blueprints | references | patterns | templates | icons | formats | components | designSystems'
  ),
  filter: z.string().optional().describe(
    'Optional filter/search keyword (for icons: category or search term, for formats: category like social/print/web, for blueprints: category like web/social/ads)'
  ),
};

export function registerResourceTools(server: McpServer): void {
  server.tool(
    'list_resources',
    'List available design resources by type. Consolidates all list_* tools into one. Returns matching items for the given resource type.',
    listResourcesSchema,
    async (params) => {
      const handler = RESOURCE_HANDLERS[params.type];
      if (!handler) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: `Unknown resource type: "${params.type}"`,
              valid_types: VALID_TYPES,
            }, null, 2),
          }],
          isError: true,
        };
      }

      return handler(params.filter);
    },
  );
}
