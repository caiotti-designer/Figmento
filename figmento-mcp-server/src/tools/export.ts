import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as nodePath from 'path';

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

export function registerExportNodeTool(server: McpServer, sendDesignCommand: SendDesignCommand): void {
  server.tool(
    'export_node',
    'Export a node as a PNG/SVG/JPG image (base64). Use this to screenshot your work for self-evaluation.',
    {
      nodeId: z.string().describe('Node ID to export'),
      format: z.string().optional().describe('Export format: PNG, SVG, or JPG (default: PNG)'),
      scale: z.number().optional().describe('Export scale (default: 1)'),
    },
    async (params) => {
      const scale = params.scale != null ? Number(params.scale) : undefined;
      const data = await sendDesignCommand('export_node', { ...params, scale });
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );
}

export function registerExportToFileTool(server: McpServer, sendDesignCommand: SendDesignCommand): void {
  server.tool(
    'export_node_to_file',
    'Export a Figma node to a PNG/JPG file on disk and return the file path. Use this for self-evaluation: export your design, then view the file to analyze it visually. Default behavior overwrites a single eval-latest file to prevent disk accumulation.',
    {
      nodeId: z.string().describe('Node ID to export'),
      format: z.string().optional().describe('Export format: PNG or JPG (default: PNG)'),
      scale: z.number().optional().describe('Export scale (default: 2 for high-res evaluation)'),
      outputDir: z.string().optional().describe('Custom output directory (default: temp/exports in project root). Must be within project directory.'),
    },
    async (params) => {
      // 1. Call existing export_node to get base64 from plugin
      const scale = params.scale != null ? Number(params.scale) : 2;
      const exportData = await sendDesignCommand('export_node', {
        nodeId: params.nodeId,
        format: params.format || 'PNG',
        scale,
      });

      const base64String = exportData.base64 as string;
      if (!base64String) {
        throw new Error('export_node returned no base64 data. The node may be empty or invalid.');
      }

      // 2. Strip data URI prefix if present
      const base64Clean = base64String.replace(/^data:image\/[a-z]+;base64,/, '');

      // 3. Determine output path with path validation
      const projectRoot = process.cwd();
      const defaultDir = nodePath.join(projectRoot, 'temp', 'exports');

      let targetDir: string;
      if (params.outputDir) {
        const resolvedDir = nodePath.resolve(params.outputDir);
        const normalizedDir = nodePath.normalize(resolvedDir);
        const allowedRoot = nodePath.resolve(projectRoot);
        if (!normalizedDir.startsWith(allowedRoot + nodePath.sep) && normalizedDir !== allowedRoot) {
          throw new Error(
            `Access denied: outputDir must be within project root (${allowedRoot}). Got: ${normalizedDir}`
          );
        }
        targetDir = normalizedDir;
      } else {
        targetDir = defaultDir;
      }

      // 4. Ensure directory exists
      fs.mkdirSync(targetDir, { recursive: true });

      // 5. Determine filename
      const ext = (params.format || 'PNG').toLowerCase();
      let filename: string;
      if (params.outputDir) {
        // Custom dir: use timestamped filename to avoid overwriting user's files
        const timestamp = Date.now();
        const safeNodeId = params.nodeId.replace(/[^a-zA-Z0-9_-]/g, '_');
        filename = `eval-${safeNodeId}-${timestamp}.${ext}`;
      } else {
        // Default dir: overwrite single file each time
        filename = `eval-latest.${ext}`;
      }

      const filePath = nodePath.join(targetDir, filename);

      // 6. Decode and write
      const buffer = Buffer.from(base64Clean, 'base64');
      fs.writeFileSync(filePath, buffer);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            filePath,
            format: (params.format || 'PNG'),
            scale: params.scale ?? 2,
            sizeBytes: buffer.length,
            nodeId: params.nodeId,
          }),
        }],
      };
    }
  );
}
