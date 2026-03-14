// ═══════════════════════════════════════════════════════════
// Format Tools: get_format_rules, list_formats
// ═══════════════════════════════════════════════════════════

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as nodePath from 'path';
import { getFormatsDir } from '../utils/knowledge-paths';
import { getFormatRulesSchema, listFormatsSchema } from './ds-schemas';
import type { FormatSizeVariant, FormatListEntry, SendDesignCommand } from './ds-types';

function listAvailableFormats(): FormatListEntry[] {
  const formatsDir = getFormatsDir();
  if (!fs.existsSync(formatsDir)) return [];

  const results: FormatListEntry[] = [];
  const categories = ['social', 'print', 'presentation', 'advertising', 'web', 'email'];

  for (const category of categories) {
    const catDir = nodePath.join(formatsDir, category);
    if (!fs.existsSync(catDir)) continue;

    const files = fs.readdirSync(catDir).filter(f => f.endsWith('.yaml'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(nodePath.join(catDir, file), 'utf-8');
        const data = yaml.load(content) as Record<string, unknown>;
        const dims = data.dimensions as Record<string, unknown> | undefined;

        // Extract size_variants if present
        const rawVariants = data.size_variants as Record<string, Record<string, unknown>> | undefined;
        const sizeVariants: FormatSizeVariant[] = rawVariants
          ? Object.entries(rawVariants).map(([id, v]) => ({
              id,
              width: (v.width as number) || 0,
              height: (v.height as number) || 0,
              aspect_ratio: v.aspect_ratio as string | undefined,
              description: v.description as string | undefined,
            }))
          : [];

        results.push({
          name: data.name as string || file.replace('.yaml', ''),
          category: data.category as string || category,
          dimensions: {
            width: (dims?.width as number) || 0,
            height: (dims?.height as number) || 0,
          },
          description: (data.description as string) || '',
          default_size: (data.default_size as string) || null,
          size_variants: sizeVariants,
        });
      } catch {
        // Skip malformed files
      }
    }
  }

  return results;
}

// Exported list handler (used by resources.ts dispatcher)
export async function listFormatsHandler(filter?: string) {
  const allFormats = listAvailableFormats();

  if (filter) {
    const filtered = allFormats.filter(f => f.category === filter);
    return { content: [{ type: 'text' as const, text: JSON.stringify(filtered, null, 2) }] };
  }

  // Group by category
  const grouped: Record<string, typeof allFormats> = {};
  for (const format of allFormats) {
    if (!grouped[format.category]) grouped[format.category] = [];
    grouped[format.category].push(format);
  }

  return { content: [{ type: 'text' as const, text: JSON.stringify(grouped, null, 2) }] };
}

export function registerFormatTools(server: McpServer, _sendDesignCommand: SendDesignCommand): void {

  server.tool(
    'get_format_rules',
    'Get complete format adapter rules for a specific output format (dimensions, safe zones, typography scale, layout rules). For presentation formats, optionally specify a slide_type.',
    getFormatRulesSchema,
    async (params) => {
      const formatName = params.format.toLowerCase().trim();
      const formatsDir = getFormatsDir();

      // Search across all category subdirectories
      const categories = ['social', 'print', 'presentation', 'advertising', 'web', 'email'];
      let formatData: Record<string, unknown> | null = null;

      for (const category of categories) {
        const filePath = nodePath.join(formatsDir, category, `${formatName}.yaml`);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          formatData = yaml.load(content) as Record<string, unknown>;
          break;
        }
      }

      if (!formatData) {
        // List available formats for helpful error
        const available = listAvailableFormats();
        const names = available.map(f => f.name);
        throw new Error(`Format not found: ${formatName}. Available: ${names.join(', ')}`);
      }

      // If slide_type requested and this is a presentation format, extract that slide type
      if (params.slide_type && formatData.slide_types) {
        const slideTypes = formatData.slide_types as Record<string, unknown>;
        const slideType = slideTypes[params.slide_type];
        if (!slideType) {
          const available = Object.keys(slideTypes);
          throw new Error(`Slide type not found: ${params.slide_type}. Available: ${available.join(', ')}`);
        }
        // Return the full format data plus the specific slide type highlighted
        formatData = {
          ...formatData,
          requested_slide_type: params.slide_type,
          slide_type_details: slideType,
        };
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(formatData, null, 2) }] };
    }
  );

  server.tool(
    'list_formats',
    '[DEPRECATED — use list_resources(type="formats") instead] List all available format adapters. Optionally filter by category.',
    listFormatsSchema,
    async (params) => listFormatsHandler(params.category),
  );
}
