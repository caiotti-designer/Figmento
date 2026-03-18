import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as nodePath from 'path';
import * as yaml from 'js-yaml';

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

// ─── Constants ──────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const CLEANUP_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

function getTempDir(): string {
  // temp/ at project root (one level up from figmento-mcp-server/)
  return nodePath.join(__dirname, '..', '..', 'temp', 'imports');
}

function getBrandAssetsDir(): string {
  return nodePath.join(__dirname, '..', '..', 'brand-assets');
}

function sanitizeAssetName(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

const ASSET_MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

// ─── Sanitization ───────────────────────────────────────────────────────────────

function sanitizeSessionId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9-]/g, '');
}

function sanitizeFilename(raw: string): string {
  // Strip path separators, .., and control characters
  return raw
    .replace(/\.\./g, '')
    .replace(/[\/\\]/g, '')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim() || 'unnamed';
}

// ─── Cleanup ────────────────────────────────────────────────────────────────────

export function cleanupOldTempFiles(): void {
  const tempDir = getTempDir();
  if (!fs.existsSync(tempDir)) return;

  const now = Date.now();
  let removedCount = 0;

  try {
    const sessionDirs = fs.readdirSync(tempDir);

    for (const sessionDir of sessionDirs) {
      const sessionPath = nodePath.join(tempDir, sessionDir);
      const stat = fs.statSync(sessionPath);
      if (!stat.isDirectory()) continue;

      const files = fs.readdirSync(sessionPath);
      const allOld = files.every((file) => {
        try {
          const fileStat = fs.statSync(nodePath.join(sessionPath, file));
          return now - fileStat.mtimeMs > CLEANUP_AGE_MS;
        } catch {
          return true; // Can't stat → treat as old
        }
      });

      if (allOld && files.length > 0 || files.length === 0) {
        // Remove all files then the directory
        for (const file of files) {
          try { fs.unlinkSync(nodePath.join(sessionPath, file)); } catch { /* ignore */ }
        }
        try { fs.rmdirSync(sessionPath); removedCount++; } catch { /* ignore */ }
      }
    }
  } catch (err) {
    console.error(`[Figmento MCP] Temp cleanup error: ${(err as Error).message}`);
  }

  if (removedCount > 0) {
    console.error(`[Figmento MCP] Temp cleanup: removed ${removedCount} expired session(s)`);
  }
}

// ─── Tool Registration ──────────────────────────────────────────────────────────

export function registerFileStorageTools(server: McpServer, sendDesignCommand?: SendDesignCommand): void {

  // ─── store_temp_file ──────────────────────────────────────
  server.tool(
    'store_temp_file',
    'Store a file (base64 data URI) in temporary session storage. Returns the absolute file path for use by other tools (analyze_reference, place_generated_image, etc.).',
    {
      data: z.string().describe('Base64 data URI (e.g., "data:image/png;base64,iVBOR...")'),
      filename: z.string().describe('Original filename with extension (e.g., "logo.png", "hero-ref.jpg")'),
      sessionId: z.string().describe('Session identifier (channel ID or UUID). Used to group files per session.'),
    },
    async (params) => {
      // Sanitize inputs
      const sessionId = sanitizeSessionId(params.sessionId);
      const filename = sanitizeFilename(params.filename);

      if (!sessionId) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Invalid session ID — must contain alphanumeric characters or hyphens' }) }],
          isError: true,
        };
      }

      // Decode base64 data URI
      const commaIndex = params.data.indexOf(',');
      const base64Data = commaIndex >= 0 ? params.data.slice(commaIndex + 1) : params.data;
      const buffer = Buffer.from(base64Data, 'base64');

      // Validate size
      if (buffer.length > MAX_FILE_SIZE) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `File exceeds 20MB limit (got ${Math.round(buffer.length / 1024 / 1024)}MB)` }) }],
          isError: true,
        };
      }

      // Create directory and write file
      const sessionDir = nodePath.join(getTempDir(), sessionId);
      fs.mkdirSync(sessionDir, { recursive: true });

      const filePath = nodePath.join(sessionDir, filename);
      fs.writeFileSync(filePath, buffer);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            filePath: nodePath.resolve(filePath),
            filename,
            sessionId,
            sizeBytes: buffer.length,
          }),
        }],
      };
    },
  );

  // ─── list_temp_files ──────────────────────────────────────
  server.tool(
    'list_temp_files',
    'List all temporarily stored files for a session. Returns file paths and metadata.',
    {
      sessionId: z.string().describe('Session identifier to list files for'),
    },
    async (params) => {
      const sessionId = sanitizeSessionId(params.sessionId);
      const sessionDir = nodePath.join(getTempDir(), sessionId);

      if (!fs.existsSync(sessionDir)) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ files: [], sessionId }) }] };
      }

      const entries = fs.readdirSync(sessionDir);
      const files = entries.map((name) => {
        const fullPath = nodePath.join(sessionDir, name);
        try {
          const stat = fs.statSync(fullPath);
          return {
            filename: name,
            filePath: nodePath.resolve(fullPath),
            sizeBytes: stat.size,
            createdAt: stat.birthtime.toISOString(),
          };
        } catch {
          return { filename: name, filePath: nodePath.resolve(fullPath), sizeBytes: 0, createdAt: '' };
        }
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ files, sessionId }) }],
      };
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // CF-3: Brand Asset Management
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'save_brand_assets',
    'Save uploaded files as a persistent brand asset collection with a name and description. Copies files from temp storage to brand-assets/{name}/ with a manifest.yaml.',
    {
      name: z.string().describe('Brand asset collection name (e.g., "my-company"). Lowercase, alphanumeric + hyphens.'),
      description: z.string().describe('Short description of the asset collection'),
      filePaths: z.array(z.string()).describe('Array of absolute file paths to save (from store_temp_file output)'),
    },
    async (params) => {
      const name = sanitizeAssetName(params.name);
      if (!name) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Invalid asset name — use lowercase letters, numbers, hyphens' }) }], isError: true };
      }

      const assetDir = nodePath.join(getBrandAssetsDir(), name);
      fs.mkdirSync(assetDir, { recursive: true });

      // Clear existing files if overwriting
      if (fs.existsSync(assetDir)) {
        const existing = fs.readdirSync(assetDir);
        for (const f of existing) {
          try { fs.unlinkSync(nodePath.join(assetDir, f)); } catch { /* ignore */ }
        }
      }

      const fileEntries: Array<Record<string, unknown>> = [];

      for (const srcPath of params.filePaths) {
        if (!fs.existsSync(srcPath)) {
          fileEntries.push({ original: nodePath.basename(srcPath), error: 'File not found' });
          continue;
        }
        const filename = sanitizeFilename(nodePath.basename(srcPath));
        const destPath = nodePath.join(assetDir, filename);
        fs.copyFileSync(srcPath, destPath);

        const ext = nodePath.extname(filename).toLowerCase();
        const stat = fs.statSync(destPath);
        fileEntries.push({
          original: nodePath.basename(srcPath),
          saved: filename,
          type: ASSET_MIME_MAP[ext] || 'application/octet-stream',
          size_bytes: stat.size,
        });
      }

      // Write manifest
      const manifest = {
        name,
        description: params.description,
        created_at: new Date().toISOString(),
        files: fileEntries.filter((f) => !f.error),
      };
      fs.writeFileSync(nodePath.join(assetDir, 'manifest.yaml'), yaml.dump(manifest, { lineWidth: 120 }), 'utf-8');

      return { content: [{ type: 'text' as const, text: JSON.stringify({ saved: name, directory: nodePath.resolve(assetDir), files: fileEntries }) }] };
    },
  );

  server.tool(
    'load_brand_assets',
    'Load a saved brand asset collection by name. Returns the manifest and absolute file paths.',
    {
      name: z.string().describe('Brand asset collection name'),
    },
    async (params) => {
      const name = sanitizeAssetName(params.name);
      const manifestPath = nodePath.join(getBrandAssetsDir(), name, 'manifest.yaml');

      if (!fs.existsSync(manifestPath)) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Brand asset collection "${name}" not found` }) }], isError: true };
      }

      const manifest = yaml.load(fs.readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
      const files = (manifest.files as Array<Record<string, unknown>> || []).map((f) => ({
        ...f,
        filePath: nodePath.resolve(nodePath.join(getBrandAssetsDir(), name, f.saved as string)),
      }));

      return { content: [{ type: 'text' as const, text: JSON.stringify({ ...manifest, files }) }] };
    },
  );

  server.tool(
    'list_brand_assets',
    'List all saved brand asset collections with their names and descriptions.',
    {},
    async () => {
      const baseDir = getBrandAssetsDir();
      if (!fs.existsSync(baseDir)) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ collections: [] }) }] };
      }

      const collections: Array<{ name: string; description: string }> = [];
      for (const dir of fs.readdirSync(baseDir)) {
        const manifestPath = nodePath.join(baseDir, dir, 'manifest.yaml');
        if (fs.existsSync(manifestPath)) {
          try {
            const manifest = yaml.load(fs.readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
            collections.push({ name: dir, description: (manifest.description as string) || '' });
          } catch { /* skip malformed */ }
        }
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify({ collections }) }] };
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // CF-5: Brand Asset Placement (requires sendDesignCommand)
  // ═══════════════════════════════════════════════════════════════════════════════

  if (sendDesignCommand) {
    server.tool(
      'place_brand_asset',
      'Place a brand asset (logo, image) from temp storage or saved brand assets into a Figma design frame.',
      {
        source: z.string().describe('"temp" for temp storage or "saved" for persistent brand assets'),
        sessionId: z.string().optional().describe('Session ID (required when source="temp")'),
        assetName: z.string().optional().describe('Brand asset collection name (required when source="saved")'),
        filename: z.string().describe('Filename to place (e.g., "logo.png")'),
        parentId: z.string().describe('Figma frame nodeId to place the asset in'),
        x: z.number().optional().describe('X position within parent (default 0)'),
        y: z.number().optional().describe('Y position within parent (default 0)'),
        width: z.number().optional().describe('Width in pixels (default 200)'),
        height: z.number().optional().describe('Height in pixels (default 200)'),
      },
      async (params) => {
        // Resolve file path based on source
        let filePath: string;
        if (params.source === 'temp') {
          if (!params.sessionId) {
            return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'sessionId required when source="temp"' }) }], isError: true };
          }
          filePath = nodePath.join(getTempDir(), sanitizeSessionId(params.sessionId), sanitizeFilename(params.filename));
        } else if (params.source === 'saved') {
          if (!params.assetName) {
            return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'assetName required when source="saved"' }) }], isError: true };
          }
          filePath = nodePath.join(getBrandAssetsDir(), sanitizeAssetName(params.assetName), sanitizeFilename(params.filename));
        } else {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'source must be "temp" or "saved"' }) }], isError: true };
        }

        // Security: verify path is within allowed directories
        const resolved = nodePath.resolve(filePath);
        const tempBase = nodePath.resolve(getTempDir());
        const assetsBase = nodePath.resolve(getBrandAssetsDir());
        if (!resolved.startsWith(tempBase) && !resolved.startsWith(assetsBase)) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Access denied: path outside allowed directories' }) }], isError: true };
        }

        if (!fs.existsSync(filePath)) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `File not found: ${params.filename}` }) }], isError: true };
        }

        // Read, encode, place
        const buffer = fs.readFileSync(filePath);
        const ext = nodePath.extname(filePath).toLowerCase();
        const mime = ASSET_MIME_MAP[ext] || 'image/png';
        const base64 = `data:${mime};base64,${buffer.toString('base64')}`;

        const w = params.width ?? 200;
        const h = params.height ?? 200;

        const result = await sendDesignCommand('create_image', {
          imageData: base64,
          name: params.filename,
          width: w,
          height: h,
          x: params.x ?? 0,
          y: params.y ?? 0,
          parentId: params.parentId,
          scaleMode: 'FILL',
        }) as Record<string, unknown>;

        const nodeId = (result['nodeId'] as string) ?? (result['id'] as string);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ nodeId, width: w, height: h, filename: params.filename }) }] };
      },
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CF-6: PDF Import & Context Extraction
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'import_pdf',
    'Extract text content and brand context (colors, fonts) from a PDF file. Returns structured data for design decisions.',
    {
      filePath: z.string().describe('Absolute path to the PDF file (from store_temp_file output)'),
    },
    async (params) => {
      if (!fs.existsSync(params.filePath)) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'PDF file not found' }) }], isError: true };
      }

      const stat = fs.statSync(params.filePath);
      if (stat.size > MAX_FILE_SIZE) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `PDF exceeds 20MB limit (got ${Math.round(stat.size / 1024 / 1024)}MB)` }) }], isError: true };
      }

      try {
        // Dynamic import to handle pdf-parse (may not be available)
        const pdfParse = require('pdf-parse');
        const buffer = fs.readFileSync(params.filePath);
        const data = await pdfParse(buffer);

        const fullText: string = data.text || '';

        // Detect hex color codes
        const colorRegex = /#([0-9A-Fa-f]{3,8})\b/g;
        const detectedColors = [...new Set(
          (fullText.match(colorRegex) || []).map((c: string) => c.toUpperCase()),
        )];

        // Detect font mentions
        const fontRegex = /(?:font|typeface|typography|font-family)[:\s]+["']?([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/gi;
        const fontMatches: string[] = [];
        let fontMatch: RegExpExecArray | null;
        while ((fontMatch = fontRegex.exec(fullText)) !== null) {
          fontMatches.push(fontMatch[1].trim());
        }
        const detectedFonts = [...new Set(fontMatches)];

        const result = {
          pageCount: data.numpages || 0,
          textContent: fullText.slice(0, 10000),
          summary: fullText.slice(0, 500),
          detectedColors,
          detectedFonts,
          warning: fullText.length === 0 ? 'No text extracted — PDF may be image-only (scanned document)' : undefined,
        };

        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `PDF parsing failed: ${(err as Error).message}` }) }], isError: true };
      }
    },
  );
}
