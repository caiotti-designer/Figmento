import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

// ─── Icon categories for browsing ───────────────────────────────────────────
const ICON_CATEGORIES: Record<string, string[]> = {
  arrows: [
    'arrow-up', 'arrow-down', 'arrow-left', 'arrow-right',
    'arrow-up-right', 'arrow-up-left', 'arrow-down-right', 'arrow-down-left',
    'chevron-up', 'chevron-down', 'chevron-left', 'chevron-right',
    'chevrons-up', 'chevrons-down', 'chevrons-left', 'chevrons-right',
    'move-up', 'move-down', 'move-left', 'move-right',
    'corner-up-left', 'corner-up-right', 'corner-down-left', 'corner-down-right',
    'undo', 'redo', 'undo-2', 'redo-2', 'refresh-cw', 'refresh-ccw',
    'rotate-cw', 'rotate-ccw', 'repeat', 'repeat-2',
  ],
  media: [
    'play', 'pause', 'stop-circle', 'skip-forward', 'skip-back',
    'fast-forward', 'rewind', 'volume', 'volume-1', 'volume-2', 'volume-x',
    'mic', 'mic-off', 'headphones', 'speaker', 'radio',
    'music', 'music-2', 'music-3', 'music-4',
    'video', 'video-off', 'camera', 'camera-off', 'image', 'images',
  ],
  communication: [
    'mail', 'mail-open', 'inbox', 'send', 'message-circle', 'message-square',
    'phone', 'phone-call', 'phone-off', 'phone-incoming', 'phone-outgoing',
    'at-sign', 'hash', 'share', 'share-2', 'link', 'link-2',
    'bell', 'bell-off', 'megaphone', 'rss',
  ],
  data: [
    'bar-chart', 'bar-chart-2', 'bar-chart-3', 'bar-chart-4',
    'line-chart', 'pie-chart', 'trending-up', 'trending-down',
    'database', 'hard-drive', 'server', 'cloud', 'cloud-off',
    'download', 'upload', 'download-cloud', 'upload-cloud',
    'file', 'file-text', 'folder', 'folder-open',
    'clipboard', 'clipboard-check', 'clipboard-list',
  ],
  ui: [
    'menu', 'x', 'check', 'plus', 'minus', 'search', 'filter',
    'settings', 'sliders', 'toggle-left', 'toggle-right',
    'eye', 'eye-off', 'edit', 'edit-2', 'edit-3', 'trash', 'trash-2',
    'copy', 'scissors', 'save', 'printer', 'external-link',
    'maximize', 'minimize', 'maximize-2', 'minimize-2',
    'grid', 'list', 'layout', 'sidebar', 'columns',
    'home', 'log-in', 'log-out', 'user', 'users', 'user-plus',
    'lock', 'unlock', 'key', 'shield', 'shield-check',
  ],
  nature: [
    'sun', 'moon', 'cloud', 'cloud-rain', 'cloud-snow', 'cloud-lightning',
    'wind', 'droplets', 'snowflake', 'thermometer',
    'flower', 'flower-2', 'leaf', 'tree-pine', 'trees',
    'mountain', 'mountain-snow', 'waves',
  ],
  commerce: [
    'shopping-cart', 'shopping-bag', 'credit-card', 'wallet',
    'dollar-sign', 'euro', 'bitcoin', 'coins',
    'receipt', 'tag', 'tags', 'percent', 'badge',
    'store', 'package', 'gift', 'truck',
  ],
  social: [
    'heart', 'thumbs-up', 'thumbs-down', 'star', 'bookmark',
    'flag', 'award', 'trophy', 'crown', 'gem',
    'smile', 'frown', 'meh', 'laugh', 'angry',
  ],
  dev: [
    'code', 'code-2', 'terminal', 'braces', 'brackets',
    'git-branch', 'git-commit', 'git-merge', 'git-pull-request',
    'bug', 'cpu', 'binary', 'variable',
    'globe', 'wifi', 'wifi-off', 'bluetooth',
    'monitor', 'smartphone', 'tablet', 'laptop',
  ],
  shapes: [
    'circle', 'square', 'triangle', 'pentagon', 'hexagon', 'octagon',
    'diamond', 'heart', 'star', 'zap', 'flame',
    'target', 'crosshair', 'compass', 'navigation',
  ],
};

// ─── SVG parsing ────────────────────────────────────────────────────────────

/** Resolve path to lucide-static icons directory */
function getIconsDir(): string {
  // When bundled by esbuild: dist/index.js → go up 1 to package root
  // When running from src: src/tools/icons.ts → go up 3 to package root
  // Try both paths to be safe
  const fromDist = path.resolve(__dirname, '..', 'node_modules', 'lucide-static', 'icons');
  const fromSrc = path.resolve(__dirname, '..', '..', '..', 'node_modules', 'lucide-static', 'icons');
  if (fs.existsSync(fromDist)) return fromDist;
  if (fs.existsSync(fromSrc)) return fromSrc;
  // Fallback: resolve from the package root using process.cwd()
  return path.resolve(process.cwd(), 'node_modules', 'lucide-static', 'icons');
}

/** Get all available icon names from the filesystem */
function getAllIconNames(): string[] {
  const iconsDir = getIconsDir();
  if (!fs.existsSync(iconsDir)) return [];
  return fs.readdirSync(iconsDir)
    .filter(f => f.endsWith('.svg'))
    .map(f => f.replace('.svg', ''))
    .sort();
}

/** Parse SVG path data from a Lucide SVG file */
function parseSvgPaths(svgContent: string): string[] {
  const paths: string[] = [];
  // Match all <path d="..." />, <line ...>, <circle ...>, <rect ...>, <polyline ...>, <polygon ...>
  // Lucide uses <path>, <line>, <circle>, <rect>, <polyline>, <polygon>

  // Extract <path d="..."> elements
  const pathRegex = /<path\s[^>]*d="([^"]+)"[^>]*\/?>/g;
  let match: RegExpExecArray | null;
  while ((match = pathRegex.exec(svgContent)) !== null) {
    paths.push(match[1]);
  }

  // Extract <line x1="..." y1="..." x2="..." y2="...">
  const lineRegex = /<line\s[^>]*x1="([^"]+)"[^>]*y1="([^"]+)"[^>]*x2="([^"]+)"[^>]*y2="([^"]+)"[^>]*\/?>/g;
  while ((match = lineRegex.exec(svgContent)) !== null) {
    paths.push(`M ${match[1]} ${match[2]} L ${match[3]} ${match[4]}`);
  }

  // Extract <circle cx="..." cy="..." r="...">
  const circleRegex = /<circle\s[^>]*cx="([^"]+)"[^>]*cy="([^"]+)"[^>]*r="([^"]+)"[^>]*\/?>/g;
  while ((match = circleRegex.exec(svgContent)) !== null) {
    const cx = parseFloat(match[1]), cy = parseFloat(match[2]), r = parseFloat(match[3]);
    // Approximate circle with 4 cubic bezier arcs
    const k = 0.5522847498; // magic number for cubic bezier circle
    paths.push(
      `M ${cx - r} ${cy} ` +
      `C ${cx - r} ${cy - k * r} ${cx - k * r} ${cy - r} ${cx} ${cy - r} ` +
      `C ${cx + k * r} ${cy - r} ${cx + r} ${cy - k * r} ${cx + r} ${cy} ` +
      `C ${cx + r} ${cy + k * r} ${cx + k * r} ${cy + r} ${cx} ${cy + r} ` +
      `C ${cx - k * r} ${cy + r} ${cx - r} ${cy + k * r} ${cx - r} ${cy} Z`
    );
  }

  // Extract <rect x="..." y="..." width="..." height="..." rx="...">
  const rectRegex = /<rect\s([^>]*)\/?>/g;
  while ((match = rectRegex.exec(svgContent)) !== null) {
    const attrs = match[1];
    const x = parseFloat(attrs.match(/\bx="([^"]+)"/)?.[1] || '0');
    const y = parseFloat(attrs.match(/\by="([^"]+)"/)?.[1] || '0');
    const w = parseFloat(attrs.match(/\bwidth="([^"]+)"/)?.[1] || '0');
    const h = parseFloat(attrs.match(/\bheight="([^"]+)"/)?.[1] || '0');
    const rx = parseFloat(attrs.match(/\brx="([^"]+)"/)?.[1] || '0');

    if (rx > 0) {
      // Rounded rectangle
      paths.push(
        `M ${x + rx} ${y} ` +
        `L ${x + w - rx} ${y} Q ${x + w} ${y} ${x + w} ${y + rx} ` +
        `L ${x + w} ${y + h - rx} Q ${x + w} ${y + h} ${x + w - rx} ${y + h} ` +
        `L ${x + rx} ${y + h} Q ${x} ${y + h} ${x} ${y + h - rx} ` +
        `L ${x} ${y + rx} Q ${x} ${y} ${x + rx} ${y} Z`
      );
    } else {
      paths.push(`M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`);
    }
  }

  // Extract <polyline points="...">
  const polylineRegex = /<polyline\s[^>]*points="([^"]+)"[^>]*\/?>/g;
  while ((match = polylineRegex.exec(svgContent)) !== null) {
    const points = match[1].trim().split(/[\s,]+/);
    if (points.length >= 2) {
      let d = `M ${points[0]} ${points[1]}`;
      for (let i = 2; i < points.length; i += 2) {
        d += ` L ${points[i]} ${points[i + 1]}`;
      }
      paths.push(d);
    }
  }

  // Extract <polygon points="...">
  const polygonRegex = /<polygon\s[^>]*points="([^"]+)"[^>]*\/?>/g;
  while ((match = polygonRegex.exec(svgContent)) !== null) {
    const points = match[1].trim().split(/[\s,]+/);
    if (points.length >= 2) {
      let d = `M ${points[0]} ${points[1]}`;
      for (let i = 2; i < points.length; i += 2) {
        d += ` L ${points[i]} ${points[i + 1]}`;
      }
      d += ' Z';
      paths.push(d);
    }
  }

  return paths;
}

/** Find similar icon names using simple string matching */
function findSimilarIcons(name: string, allNames: string[], limit = 10): string[] {
  const lower = name.toLowerCase();
  const parts = lower.split('-');

  // Score each icon by relevance
  const scored = allNames.map(n => {
    let score = 0;
    // Exact substring match
    if (n.includes(lower)) score += 10;
    // Partial word matches
    for (const part of parts) {
      if (part.length >= 2 && n.includes(part)) score += 3;
    }
    // Starts with same prefix
    if (n.startsWith(parts[0])) score += 5;
    return { name: n, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.name);
}

// ─── Tool registration ──────────────────────────────────────────────────────

export function registerIconTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {

  // ── create_icon ─────────────────────────────────────────────────────────
  server.tool(
    'create_icon',
    'Create a Lucide icon on the Figma canvas. Automatically loads SVG path data from the bundled Lucide icon set (1900+ icons). No need to provide svgPaths manually.',
    {
      name: z.string().describe('Lucide icon name (e.g., "zap", "shield", "arrow-right", "heart", "check", "star")'),
      size: z.number().optional().default(24).describe('Icon size in pixels (default: 24)'),
      color: z.string().optional().default('#333333').describe('Icon color as hex (default: "#333333")'),
      strokeWidth: z.number().optional().default(2).describe('Stroke width (default: 2, Lucide default)'),
      parentId: z.string().optional().describe('Parent frame nodeId to append icon into'),
      x: z.number().optional().describe('X position'),
      y: z.number().optional().describe('Y position'),
    },
    async (params) => {
      const iconName = params.name;
      const iconsDir = getIconsDir();
      const svgPath = path.join(iconsDir, `${iconName}.svg`);

      if (!fs.existsSync(svgPath)) {
        const allNames = getAllIconNames();
        const similar = findSimilarIcons(iconName, allNames);
        const suggestion = similar.length > 0
          ? `\nDid you mean: ${similar.join(', ')}?`
          : '\nUse list_icons to browse available icons.';
        return {
          content: [{
            type: 'text' as const,
            text: `Icon "${iconName}" not found.${suggestion}`,
          }],
          isError: true,
        };
      }

      const svgContent = fs.readFileSync(svgPath, 'utf-8');
      const svgPaths = parseSvgPaths(svgContent);

      if (svgPaths.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `Could not parse SVG paths from icon "${iconName}".`,
          }],
          isError: true,
        };
      }

      // Send to plugin with parsed path data
      const data = await sendDesignCommand('create_icon', {
        iconName,
        size: params.size,
        color: params.color,
        strokeWidth: params.strokeWidth,
        svgPaths,
        name: `icon-${iconName}`,
        parentId: params.parentId,
        x: params.x,
        y: params.y,
      });

      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
  );

  // ── list_icons ──────────────────────────────────────────────────────────
  server.tool(
    'list_icons',
    'List available Lucide icons. Search by name or browse by category. Returns icon names that can be used with create_icon.',
    {
      search: z.string().optional().describe('Search term to filter icons (e.g., "arrow", "chart", "user")'),
      category: z.enum([
        'arrows', 'media', 'communication', 'data', 'ui',
        'nature', 'commerce', 'social', 'dev', 'shapes',
      ]).optional().describe('Browse icons by category'),
    },
    async (params) => {
      const allNames = getAllIconNames();

      if (params.category) {
        const categoryIcons = ICON_CATEGORIES[params.category] || [];
        // Filter to only icons that actually exist
        const available = categoryIcons.filter(n => allNames.includes(n));
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              category: params.category,
              count: available.length,
              icons: available,
            }, null, 2),
          }],
        };
      }

      if (params.search) {
        const matching = findSimilarIcons(params.search, allNames, 30);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              search: params.search,
              count: matching.length,
              icons: matching,
            }, null, 2),
          }],
        };
      }

      // No filter — return categories overview + total count
      const categories = Object.entries(ICON_CATEGORIES).map(([name, icons]) => ({
        name,
        sampleIcons: icons.slice(0, 5),
        count: icons.filter(n => allNames.includes(n)).length,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            totalIcons: allNames.length,
            categories,
            tip: 'Use search or category parameter to filter. All icon names work with create_icon.',
          }, null, 2),
        }],
      };
    }
  );
}
