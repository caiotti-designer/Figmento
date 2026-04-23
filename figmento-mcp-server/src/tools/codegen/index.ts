/**
 * MCP tool registration for the code generator.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { generateFigmaCode } from './codegen';

const MAX_COMMANDS = 200;

export function registerCodegenTools(server: McpServer): void {
  server.tool(
    'generate_figma_code',
    `Generate Plugin API JavaScript code from an array of Figma commands. Returns a JavaScript code string that can be passed to Figma's official use_figma MCP tool for direct execution — no WebSocket relay needed. Use this instead of batch_execute when Figma's MCP server (use_figma) is available. Supports all canvas operations: create_frame, create_text, create_rectangle, set_style, set_auto_layout, transform_node, clone_node, etc. Falls back to batch_execute for image operations (create_image, place_generated_image) or when use_figma is unavailable. Commands use the same format as batch_execute including $tempId references.`,
    {
      commands: z.array(z.object({
        action: z.string().describe('Figma command action (e.g. create_frame, create_text, set_style, transform_node)'),
        params: z.record(z.any()).describe('Parameters for the command. Use "$tempId" to reference nodes created earlier.'),
        tempId: z.string().optional().describe('Optional identifier. Other commands reference this node as "$tempId".'),
      })).max(MAX_COMMANDS).describe(`Array of commands to convert to Plugin API JavaScript. Max ${MAX_COMMANDS}.`),
      fileKey: z.string().optional().describe('Figma file key — include this so Claude can pass it directly to use_figma.'),
    },
    async ({ commands, fileKey }) => {
      try {
        const code = generateFigmaCode(commands);

        const response = fileKey
          ? `Generated ${commands.length} commands as Plugin API code.\n\nCall use_figma with fileKey="${fileKey}" and this code:\n\n\`\`\`javascript\n${code}\n\`\`\``
          : `Generated ${commands.length} commands as Plugin API code.\n\nCall use_figma with the target file's fileKey and this code:\n\n\`\`\`javascript\n${code}\n\`\`\``;

        return {
          content: [{ type: 'text' as const, text: response }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Code generation failed';
        return {
          content: [{ type: 'text' as const, text: `Error: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
