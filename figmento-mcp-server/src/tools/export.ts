import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as nodePath from 'path';

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

export function registerGetScreenshotTool(server: McpServer, sendDesignCommand: SendDesignCommand): void {
  server.tool(
    'get_screenshot',
    'Capture a PNG screenshot of a Figma node and render it inline. Use this to visually verify your design output immediately after creating or modifying frames.',
    {
      nodeId: z.string().describe('Node ID to screenshot'),
      scale: z.number().min(0.1).max(3).optional().describe('Export scale 0.1–3 (default: 1)'),
    },
    async (params) => {
      const scale = params.scale != null ? Math.min(Math.max(Number(params.scale), 0.1), 3) : 1;
      const data = await sendDesignCommand('get_screenshot', { nodeId: params.nodeId, scale });

      const base64 = data.base64 as string;
      if (!base64) throw new Error('get_screenshot returned no image data');

      return {
        content: [
          {
            type: 'image' as const,
            data: base64,
            mimeType: 'image/png' as const,
          },
          {
            type: 'text' as const,
            text: JSON.stringify({
              nodeId: data.nodeId,
              name: data.name,
              width: data.width,
              height: data.height,
              scale,
            }),
          },
        ],
      };
    }
  );
}

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

export function registerEvaluateDesignTool(server: McpServer, sendDesignCommand: SendDesignCommand): void {
  server.tool(
    'evaluate_design',
    'Evaluate a design by exporting it to a PNG file and returning structural data (children tree with sizes, positions, fonts, colors). Use this after creating or significantly modifying a design to self-review. Returns both the file path (for visual inspection) and the node tree (for structural analysis). Maximum 2 evaluation passes per design.',
    {
      nodeId: z.string().describe('Root frame node ID to evaluate'),
      format: z.string().optional().describe('Export format: PNG or JPG (default: PNG)'),
      scale: z.number().optional().describe('Export scale (default: 2 for high-res evaluation)'),
      depth: z.number().optional().describe('How many levels deep to traverse the node tree (default: 3). Use higher values for complex designs.'),
      outputDir: z.string().optional().describe('Custom output directory (default: temp/exports in project root). Must be within project directory.'),
      fileName: z.string().optional().describe('Custom file name without extension (e.g. "eval-variant-A"). Allows saving multiple evaluations without overwriting. Only alphanumeric, hyphens, and underscores allowed. Defaults to "eval-latest".'),
    },
    async (params) => {
      // 1. Export the node to a file on disk
      const scale = params.scale != null ? Number(params.scale) : 2;
      const format = params.format || 'PNG';
      const exportData = await sendDesignCommand('export_node', {
        nodeId: params.nodeId,
        format,
        scale,
      });

      const base64String = exportData.base64 as string;
      if (!base64String) {
        throw new Error('export_node returned no base64 data. The node may be empty or invalid.');
      }

      const base64Clean = base64String.replace(/^data:image\/[a-z]+;base64,/, '');

      const projectRoot = process.cwd();
      const defaultDir = nodePath.join(projectRoot, 'temp', 'exports');

      let targetDir: string;
      if (params.outputDir) {
        const resolvedDir = nodePath.resolve(params.outputDir as string);
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

      fs.mkdirSync(targetDir, { recursive: true });

      const ext = format.toLowerCase();
      let evalFilename: string;
      if (params.fileName) {
        const sanitized = (params.fileName as string).replace(/[^a-zA-Z0-9_-]/g, '');
        if (!sanitized) {
          throw new Error('fileName must contain at least one alphanumeric character, hyphen, or underscore.');
        }
        evalFilename = `${sanitized}.${ext}`;
      } else if (params.outputDir) {
        const timestamp = Date.now();
        const safeNodeId = params.nodeId.replace(/[^a-zA-Z0-9_-]/g, '_');
        evalFilename = `eval-${safeNodeId}-${timestamp}.${ext}`;
      } else {
        evalFilename = `eval-latest.${ext}`;
      }

      const filePath = nodePath.join(targetDir, evalFilename);
      const buffer = Buffer.from(base64Clean, 'base64');
      fs.writeFileSync(filePath, buffer);

      // 2. Get structural node info (deep recursive tree from plugin)
      const traversalDepth = params.depth ?? 10;
      const nodeInfo = await sendDesignCommand('get_node_info', {
        nodeId: params.nodeId,
        depth: traversalDepth,
      });

      // 3. Flatten the deep tree into an elements array for stats
      const elements: Array<Record<string, unknown>> = [];

      function walkTree(node: Record<string, unknown>) {
        const entry: Record<string, unknown> = {
          id: node.id,
          name: node.name,
          type: node.type,
        };
        if (node.x !== undefined) entry.x = node.x;
        if (node.y !== undefined) entry.y = node.y;
        if (node.width !== undefined) entry.width = node.width;
        if (node.height !== undefined) entry.height = node.height;
        if (node.fontSize !== undefined) entry.fontSize = node.fontSize;
        if (node.fontFamily !== undefined) entry.fontFamily = node.fontFamily;
        if (node.fontWeight !== undefined) entry.fontWeight = node.fontWeight;
        if (node.fills !== undefined) entry.fills = node.fills;
        if (node.opacity !== undefined && node.opacity !== 1) entry.opacity = node.opacity;
        if (node.characters !== undefined) entry.characters = node.characters;
        if (node.cornerRadius !== undefined) entry.cornerRadius = node.cornerRadius;
        if (node.layoutMode !== undefined) entry.layoutMode = node.layoutMode;
        if (node.itemSpacing !== undefined) entry.itemSpacing = node.itemSpacing;
        if (node.paddingLeft !== undefined) entry.padding = {
          left: node.paddingLeft, right: node.paddingRight,
          top: node.paddingTop, bottom: node.paddingBottom,
        };
        elements.push(entry);

        // Recurse into children — the plugin already controls depth,
        // so we just walk everything we received
        if (Array.isArray(node.children)) {
          for (const child of node.children) {
            walkTree(child as Record<string, unknown>);
          }
        }
      }

      walkTree(nodeInfo as Record<string, unknown>);

      // 4. Compute basic stats for the checklist
      const textNodes = elements.filter(e => e.type === 'TEXT');
      const fontSizes = textNodes
        .map(e => e.fontSize as number)
        .filter(s => s !== undefined)
        .sort((a, b) => b - a);
      const uniqueFontSizes = [...new Set(fontSizes)];

      const rootNode = elements[0] || {};
      const frameWidth = (rootNode.width as number) || 0;
      const frameHeight = (rootNode.height as number) || 0;

      const stats = {
        totalElements: elements.length,
        textNodes: textNodes.length,
        uniqueFontSizes,
        typographyLevels: uniqueFontSizes.length,
        frameSize: { width: frameWidth, height: frameHeight },
      };

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            filePath,
            format,
            scale,
            sizeBytes: buffer.length,
            nodeId: params.nodeId,
            stats,
            elements,
          }, null, 2),
        }],
      };
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
      fileName: z.string().optional().describe('Custom file name (without extension). If provided, saves as temp/exports/{fileName}.{ext}. Only alphanumeric, hyphens, and underscores allowed.'),
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
      if (params.fileName) {
        // Sanitize: strip path separators and keep only alphanumeric, hyphens, underscores
        const sanitized = params.fileName.replace(/[^a-zA-Z0-9_-]/g, '');
        if (!sanitized) {
          throw new Error('fileName must contain at least one alphanumeric character, hyphen, or underscore.');
        }
        filename = `${sanitized}.${ext}`;
      } else if (params.outputDir) {
        // Custom dir without fileName: use timestamped filename to avoid overwriting user's files
        const timestamp = Date.now();
        const safeNodeId = params.nodeId.replace(/[^a-zA-Z0-9_-]/g, '_');
        filename = `eval-${safeNodeId}-${timestamp}.${ext}`;
      } else {
        // Default dir, no fileName: overwrite single file each time
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
