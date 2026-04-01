import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FigmentoWSClient } from '../ws-client';

interface LearnedPreference {
  id: string;
  property: string;
  category: string;
  context: string;
  direction: string;
  learnedValue?: unknown;
  learnedRange?: { min: unknown; max: unknown };
  description: string;
  confidence: 'low' | 'medium' | 'high';
  correctionCount: number;
  correctionIds: string[];
  enabled: boolean;
  createdAt: number;
  lastSeenAt: number;
}

const VALID_CATEGORIES = ['typography', 'color', 'spacing', 'shape'] as const;
const CONFIDENCE_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export const getLearnedPreferencesSchema = {
  category: z.string().optional().describe(
    'Filter by category: "typography", "color", "spacing", or "shape". Omit to return all.'
  ),
};

export function registerLearningTools(server: McpServer, wsClient: FigmentoWSClient): void {
  server.tool(
    'get_learned_preferences',
    'Get learned design preferences from the user\'s correction history.',
    getLearnedPreferencesSchema,
    async ({ category }) => {
      // Validate category if provided
      if (category && !VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) {
        return {
          content: [{
            type: 'text' as const,
            text: `Invalid category "${category}". Valid values: ${VALID_CATEGORIES.join(', ')}`,
          }],
          isError: true,
        };
      }

      let data: Record<string, unknown>;
      try {
        data = await wsClient.sendCommand('get_preferences', {});
      } catch (_err) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No plugin connected or timed out. Ensure the Figmento plugin is open in Figma and connected to the relay.',
          }],
          isError: true,
        };
      }

      let preferences = (data.preferences as LearnedPreference[]) || [];

      // Filter by category if provided
      if (category) {
        preferences = preferences.filter(p => p.category === category);
      }

      // Only enabled preferences
      preferences = preferences.filter(p => p.enabled !== false);

      // Sort: high → medium → low, then correctionCount desc
      preferences.sort((a, b) => {
        const confDiff = (CONFIDENCE_ORDER[a.confidence] ?? 2) - (CONFIDENCE_ORDER[b.confidence] ?? 2);
        if (confDiff !== 0) return confDiff;
        return b.correctionCount - a.correctionCount;
      });

      if (preferences.length === 0) {
        const scope = category ? ` for category "${category}"` : '';
        return {
          content: [{
            type: 'text' as const,
            text: `No learned preferences found${scope}.`,
          }],
        };
      }

      const scope = category ? ` (${category})` : ' (all categories)';
      const lines: string[] = [
        `${preferences.length} learned preference${preferences.length === 1 ? '' : 's'}${scope}:`,
        '',
      ];

      for (const pref of preferences) {
        const lastSeen = new Date(pref.lastSeenAt).toISOString().split('T')[0];
        lines.push(`[${pref.confidence.toUpperCase()}] ${pref.context} ${pref.property} — ${pref.description}`);
        lines.push(`  Direction: ${pref.direction} | Corrections: ${pref.correctionCount} | Last seen: ${lastSeen}`);
        lines.push('');
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n').trimEnd() }],
      };
    }
  );
}
