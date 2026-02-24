import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

export function registerTemplateTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {

  // ═══════════════════════════════════════════════════════════
  // S-17: scan_template
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'scan_template',
    'Scan a frame for template placeholders. Placeholders are layers whose names start with "#". Returns a list of placeholder nodes with their types (text or image). Use before apply_template_text/apply_template_image.',
    {
      nodeId: z.string().optional().describe('Frame nodeId to scan. If omitted, scans the current Figma selection.'),
    },
    async (params) => {
      const data = await sendDesignCommand('scan_template', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // S-18: apply_template_text
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'apply_template_text',
    'Fill a text placeholder in a template with new content. Preserves existing font styling unless overrides are provided. Use scan_template first to find placeholder nodeIds.',
    {
      nodeId: z.string().describe('The text placeholder node ID (from scan_template results)'),
      content: z.string().describe('New text content to set'),
      fontSize: z.number().optional().describe('Override font size in pixels'),
      color: z.string().optional().describe('Override text color as hex'),
      fontFamily: z.string().optional().describe('Override font family (Google Fonts name)'),
      fontWeight: z.number().optional().describe('Font weight (used with fontFamily override)'),
    },
    async (params) => {
      const data = await sendDesignCommand('apply_template_text', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // S-19: apply_template_image
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'apply_template_image',
    'Fill an image placeholder in a template with actual image data. Replaces the placeholder fill with the provided base64 image. Use scan_template first to find placeholder nodeIds.',
    {
      nodeId: z.string().describe('The image placeholder node ID (from scan_template results)'),
      imageData: z.string().describe('Base64 image data (with or without data: prefix)'),
      scaleMode: z.enum(['FILL', 'FIT', 'CROP', 'TILE']).optional().describe('Image scale mode (default: FILL)'),
    },
    async (params) => {
      const data = await sendDesignCommand('apply_template_image', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // S-20: create_carousel
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'create_carousel',
    'Create a multi-slide carousel on the Figma canvas. Each slide is a separate frame positioned side-by-side with a 40px gap. Useful for Instagram carousels, multi-page social content, etc.',
    {
      slideCount: z.number().min(2).max(20).describe('Number of slides to create'),
      slideWidth: z.number().describe('Width of each slide in pixels'),
      slideHeight: z.number().describe('Height of each slide in pixels'),
      name: z.string().optional().describe('Base name for slides (default: "Slide")'),
      backgroundColor: z.string().optional().describe('Background color for all slides (hex)'),
      gap: z.number().optional().describe('Gap between slides in pixels (default: 40)'),
    },
    async (params) => {
      const slideCount = params.slideCount;
      const slideWidth = params.slideWidth;
      const slideHeight = params.slideHeight;
      const baseName = params.name || 'Slide';
      const gap = params.gap || 40;
      const bgColor = params.backgroundColor;

      const slideIds: string[] = [];

      for (let i = 0; i < slideCount; i++) {
        const frameParams: Record<string, unknown> = {
          name: `${baseName} ${i + 1}`,
          width: slideWidth,
          height: slideHeight,
          x: i * (slideWidth + gap),
          y: 0,
        };
        if (bgColor) {
          frameParams.fills = [{ type: 'SOLID', color: bgColor }];
        }
        const data = await sendDesignCommand('create_frame', frameParams);
        slideIds.push(data.nodeId as string);
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            slideCount,
            slideIds,
            slideWidth,
            slideHeight,
            gap,
            totalWidth: slideCount * slideWidth + (slideCount - 1) * gap,
          }, null, 2),
        }],
      };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // S-21: create_presentation
  // ═══════════════════════════════════════════════════════════

  server.tool(
    'create_presentation',
    'Create a multi-slide presentation on the Figma canvas. Each slide is a 1920x1080 frame (or custom size) positioned side-by-side with an 80px gap. Returns all slide nodeIds for content population.',
    {
      slideCount: z.number().min(1).max(50).describe('Number of slides to create'),
      slideWidth: z.number().optional().describe('Width of each slide (default: 1920)'),
      slideHeight: z.number().optional().describe('Height of each slide (default: 1080)'),
      name: z.string().optional().describe('Presentation name prefix (default: "Slide")'),
      backgroundColor: z.string().optional().describe('Background color for all slides (hex, default: "#FFFFFF")'),
      gap: z.number().optional().describe('Gap between slides in pixels (default: 80)'),
    },
    async (params) => {
      const slideCount = params.slideCount;
      const slideWidth = params.slideWidth || 1920;
      const slideHeight = params.slideHeight || 1080;
      const baseName = params.name || 'Slide';
      const gap = params.gap || 80;
      const bgColor = params.backgroundColor || '#FFFFFF';

      const slideIds: string[] = [];

      for (let i = 0; i < slideCount; i++) {
        const frameParams: Record<string, unknown> = {
          name: `${baseName} ${i + 1}`,
          width: slideWidth,
          height: slideHeight,
          x: i * (slideWidth + gap),
          y: 0,
          fills: [{ type: 'SOLID', color: bgColor }],
        };
        const data = await sendDesignCommand('create_frame', frameParams);
        slideIds.push(data.nodeId as string);
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            slideCount,
            slideIds,
            slideWidth,
            slideHeight,
            gap,
            totalWidth: slideCount * slideWidth + (slideCount - 1) * gap,
          }, null, 2),
        }],
      };
    }
  );
}
