import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

export function registerBatchTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {
  server.tool(
    'create_design',
    'Create a complete design from a UIAnalysis JSON structure. This is the batch tool — it creates a main frame with all child elements (text, shapes, images, icons, auto-layout) in a single operation. Best for creating full designs at once rather than element-by-element.',
    {
      design: z.object({
        width: z.number(),
        height: z.number(),
        backgroundColor: z.string(),
        elements: z.array(z.any()),
      }).describe('Complete UIAnalysis design structure'),
      name: z.string().optional().describe('Name for the main frame'),
    },
    async (params) => {
      const data = await sendDesignCommand('create_design', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );
}
