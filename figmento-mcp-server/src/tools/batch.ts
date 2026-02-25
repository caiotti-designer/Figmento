import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

const MAX_BATCH_COMMANDS = 50;

export function registerBatchTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {

  // ─── create_design (existing) ───────────────────────────────
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

  // ─── batch_execute ──────────────────────────────────────────
  server.tool(
    'batch_execute',
    `Execute multiple Figma commands in a single round trip. Each command has an action, params, and optional tempId.
Use tempId to reference nodes created earlier in the same batch: set tempId on a command, then use "$tempId" as a param value in subsequent commands.
Example: create a frame with tempId "card", then create text with parentId "$card".
Max ${MAX_BATCH_COMMANDS} commands per batch. Failed commands do NOT abort the batch — all commands execute and results are returned.
Prefer this over sequential tool calls for any design with 3+ elements.`,
    {
      commands: z.array(z.object({
        action: z.string().describe('The Figma command action (e.g. create_frame, create_text, set_fill, clone_node, etc.)'),
        params: z.record(z.any()).describe('Parameters for the command. Use "$tempId" values to reference nodes created earlier in the batch.'),
        tempId: z.string().optional().describe('Optional identifier for this command\'s result. Other commands can reference the created nodeId as "$tempId".'),
      })).describe(`Array of commands to execute sequentially in one round trip. Max ${MAX_BATCH_COMMANDS}.`),
    },
    async (params) => {
      const commands = params.commands;
      if (commands.length > MAX_BATCH_COMMANDS) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: `Batch exceeds maximum of ${MAX_BATCH_COMMANDS} commands (got ${commands.length}). Split into multiple batches.`,
            }),
          }],
        };
      }

      // Send the entire batch to the plugin for server-side execution
      const data = await sendDesignCommand('batch_execute', { commands });
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ─── clone_with_overrides ───────────────────────────────────
  server.tool(
    'clone_with_overrides',
    `Clone a node multiple times in a single call, with optional positional offsets and named child property overrides.
Replaces the clone → find → set_text × N pattern with one call.
Each copy can specify offsetX/offsetY and an array of overrides targeting children by name.
Returns an array of { nodeId, name } for all created clones.`,
    {
      nodeId: z.string().describe('The node ID to clone'),
      copies: z.array(z.object({
        offsetX: z.number().optional().describe('X offset from the original node position'),
        offsetY: z.number().optional().describe('Y offset from the original node position'),
        newName: z.string().optional().describe('Name for the cloned node'),
        overrides: z.array(z.object({
          childName: z.string().describe('Name of the child node to override (searched recursively)'),
          properties: z.object({
            content: z.string().optional().describe('New text content (for text nodes)'),
            color: z.string().optional().describe('New fill color hex (e.g. "#FF0000")'),
            fontSize: z.number().optional().describe('New font size'),
            fontWeight: z.number().optional().describe('New font weight'),
            opacity: z.number().optional().describe('New opacity (0-1)'),
          }).describe('Properties to override on the matched child'),
        })).optional().describe('Array of child overrides to apply after cloning'),
      })).describe('Array of copy specifications'),
    },
    async (params) => {
      const data = await sendDesignCommand('clone_with_overrides', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );
}
