import * as fs from 'fs';
import * as nodePath from 'path';
import * as yaml from 'js-yaml';
import { getKnowledgeDir } from './utils/knowledge-paths';

export const PRESET_VERSION = '2.5c';
export const REFERENCE_IMAGE_LIMIT = 3;

export const ARCHETYPE_ROLES = ['cover', 'body', 'image_body', 'quote', 'cta', 'closing'] as const;
export type ArchetypeRole = typeof ARCHETYPE_ROLES[number];

export interface BrandKitIndexEntry {
  id: string;
  name: string;
  path: string;
  storage: 'flat' | 'folder';
  hasRemix: boolean;
}

export interface BrandKitLoadResult {
  id: string;
  path: string;
  storage: 'flat' | 'folder';
  kit: Record<string, unknown>;
}

export interface ArchetypeRecord {
  id: string;
  role: ArchetypeRole;
  order: number;
  enabled: boolean;
  presetVersion: string;
  nodes: Array<Record<string, unknown>>;
}

export interface ParsedSlide {
  title?: string;
  body?: string;
  imagePrompt?: string;
}

export interface SelectedArchetype {
  slide: ParsedSlide;
  role: ArchetypeRole;
  archetype: ArchetypeRecord;
}

const OVERWRITE_KEYWORDS = [
  'overwrite',
  'replace selected',
  'update this',
  'replace this',
  'sobrescrever',
  'substituir selecionado',
  'atualizar esse',
  'trocar esse',
];

export function getBrandKitsDir(): string {
  return nodePath.join(getKnowledgeDir(), 'brand-kits');
}

export function sanitizeBrandId(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

function folderKitPath(id: string): string {
  return nodePath.join(getBrandKitsDir(), id, 'kit.yaml');
}

function flatKitPath(id: string): string {
  return nodePath.join(getBrandKitsDir(), `${id}.yaml`);
}

function safeKitIdFromData(fallback: string, kit: Record<string, unknown>): string {
  const raw = (kit.brand_id || kit.id || fallback) as string;
  return sanitizeBrandId(raw);
}

function kitDisplayName(id: string, kit: Record<string, unknown>): string {
  return String(kit.brand_name || kit.name || id);
}

export function listBrandKits(dir = getBrandKitsDir()): BrandKitIndexEntry[] {
  if (!fs.existsSync(dir)) return [];

  const byId = new Map<string, BrandKitIndexEntry>();
  const add = (entry: BrandKitIndexEntry) => {
    const existing = byId.get(entry.id);
    if (existing && existing.storage !== entry.storage) {
      const chosen = entry.storage === 'folder' ? entry : existing;
      byId.set(entry.id, chosen);
      console.warn(`[Figmento BrandKit] Duplicate brand kit id "${entry.id}" found. Preferring folder kit.`);
      return;
    }
    if (!existing) byId.set(entry.id, entry);
  };

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.yaml')) {
      const basename = entry.name.replace(/\.yaml$/, '');
      const path = nodePath.join(dir, entry.name);
      const kit = yaml.load(fs.readFileSync(path, 'utf-8')) as Record<string, unknown> || {};
      const id = safeKitIdFromData(basename, kit);
      add({
        id,
        name: kitDisplayName(id, kit),
        path,
        storage: 'flat',
        hasRemix: !!(kit.remix as Record<string, unknown> | undefined)?.carousel,
      });
    } else if (entry.isDirectory()) {
      const path = nodePath.join(dir, entry.name, 'kit.yaml');
      if (!fs.existsSync(path)) continue;
      const kit = yaml.load(fs.readFileSync(path, 'utf-8')) as Record<string, unknown> || {};
      const id = safeKitIdFromData(entry.name, kit);
      add({
        id,
        name: kitDisplayName(id, kit),
        path,
        storage: 'folder',
        hasRemix: !!(kit.remix as Record<string, unknown> | undefined)?.carousel,
      });
    }
  }

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function loadBrandKit(nameOrId: string, dir = getBrandKitsDir()): BrandKitLoadResult {
  const safe = sanitizeBrandId(nameOrId);
  const folderPath = nodePath.join(dir, safe, 'kit.yaml');
  const flatPath = nodePath.join(dir, `${safe}.yaml`);

  if (fs.existsSync(folderPath)) {
    const kit = yaml.load(fs.readFileSync(folderPath, 'utf-8')) as Record<string, unknown> || {};
    return { id: safeKitIdFromData(safe, kit), path: folderPath, storage: 'folder', kit };
  }

  if (fs.existsSync(flatPath)) {
    const kit = yaml.load(fs.readFileSync(flatPath, 'utf-8')) as Record<string, unknown> || {};
    return { id: safeKitIdFromData(safe, kit), path: flatPath, storage: 'flat', kit };
  }

  const match = listBrandKits(dir).find(k => k.id === safe || k.name.toLowerCase() === nameOrId.toLowerCase());
  if (match) {
    const kit = yaml.load(fs.readFileSync(match.path, 'utf-8')) as Record<string, unknown> || {};
    return { id: match.id, path: match.path, storage: match.storage, kit };
  }

  throw new Error(`Brand kit not found: ${nameOrId}`);
}

export function upgradeFlatKitForEdit(id: string, dir = getBrandKitsDir()): string {
  const safe = sanitizeBrandId(id);
  const flat = nodePath.join(dir, `${safe}.yaml`);
  const folder = nodePath.join(dir, safe);
  const target = nodePath.join(folder, 'kit.yaml');

  if (!fs.existsSync(flat)) return target;
  if (fs.existsSync(folder)) {
    throw new Error(`Cannot upgrade brand kit "${safe}": folder already exists at ${folder}`);
  }

  const content = fs.readFileSync(flat, 'utf-8');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(target, content, 'utf-8');
  fs.unlinkSync(flat);
  return target;
}

export function saveFolderBrandKit(id: string, kit: Record<string, unknown>, dir = getBrandKitsDir()): string {
  const safe = sanitizeBrandId(id);
  fs.mkdirSync(nodePath.join(dir, safe), { recursive: true });
  const target = nodePath.join(dir, safe, 'kit.yaml');
  fs.writeFileSync(target, yaml.dump(kit, { lineWidth: 120 }), 'utf-8');
  return target;
}

export function saveReferenceImage(args: {
  brandId: string;
  filename: string;
  dataUri: string;
  dir?: string;
}): string {
  const brandId = sanitizeBrandId(args.brandId);
  const ext = nodePath.extname(args.filename).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
    throw new Error(`Unsupported reference image extension: ${ext || '(none)'}`);
  }
  const slug = nodePath.basename(args.filename, ext).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'reference';
  const uuid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const refsDir = nodePath.join(args.dir || getBrandKitsDir(), brandId, 'references');
  fs.mkdirSync(refsDir, { recursive: true });

  const commaIndex = args.dataUri.indexOf(',');
  const base64 = commaIndex >= 0 ? args.dataUri.slice(commaIndex + 1) : args.dataUri;
  const buffer = Buffer.from(base64, 'base64');
  const path = nodePath.join(refsDir, `${uuid}-${slug}${ext}`);
  fs.writeFileSync(path, buffer);
  return path;
}

export function saveArchetype(args: {
  brandId: string;
  archetype: Omit<ArchetypeRecord, 'presetVersion'> & { presetVersion?: string };
  dir?: string;
}): string {
  const brandId = sanitizeBrandId(args.brandId);
  const role = args.archetype.role;
  if (!ARCHETYPE_ROLES.includes(role)) throw new Error(`Invalid archetype role: ${role}`);
  const id = sanitizeBrandId(args.archetype.id || `${role}-${args.archetype.order}`) || `${role}-${args.archetype.order}`;
  const archetypesDir = nodePath.join(args.dir || getBrandKitsDir(), brandId, 'archetypes');
  fs.mkdirSync(archetypesDir, { recursive: true });
  const record: ArchetypeRecord = {
    ...args.archetype,
    id,
    presetVersion: args.archetype.presetVersion || PRESET_VERSION,
  };
  const path = nodePath.join(archetypesDir, `${role}-${record.order}-${id}.json`);
  fs.writeFileSync(path, JSON.stringify(record, null, 2), 'utf-8');
  return path;
}

export function loadArchetypes(brandId: string, dir = getBrandKitsDir()): ArchetypeRecord[] {
  const archetypesDir = nodePath.join(dir, sanitizeBrandId(brandId), 'archetypes');
  if (!fs.existsSync(archetypesDir)) return [];
  const out: ArchetypeRecord[] = [];
  for (const file of fs.readdirSync(archetypesDir)) {
    if (!file.endsWith('.json')) continue;
    const parsed = JSON.parse(fs.readFileSync(nodePath.join(archetypesDir, file), 'utf-8')) as ArchetypeRecord;
    if (parsed.enabled !== false && ARCHETYPE_ROLES.includes(parsed.role)) out.push(parsed);
  }
  return out.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function stripCodeFences(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '');
}

export function extractBrandMentions(text: string): string[] {
  const clean = stripCodeFences(text);
  const mentions = new Set<string>();
  const regex = /(^|[^\w.])@([A-Za-z][A-Za-z0-9-]{1,60})(?=[\s.,;:!?)]|$)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(clean))) mentions.add(match[2]);
  return Array.from(mentions);
}

export function hasExplicitOverwrite(text: string): boolean {
  const clean = stripCodeFences(text).toLowerCase();
  return OVERWRITE_KEYWORDS.some(keyword => clean.includes(keyword));
}

function isShortTitle(line: string): boolean {
  return line.length <= 60 || line.trim().split(/\s+/).filter(Boolean).length <= 9;
}

function parseSlideBlock(block: string): ParsedSlide {
  const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const slide: ParsedSlide = {};
  const bodyLines: string[] = [];

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading && !slide.title) {
      slide.title = heading[1].trim();
      continue;
    }
    const labeled = line.match(/^(Title|Título|Titulo|Body|Texto|Image|Imagem|Prompt)\s*:\s*(.+)$/i);
    if (labeled) {
      const key = labeled[1].toLowerCase();
      const value = labeled[2].trim();
      if (key === 'title' || key === 'título' || key === 'titulo') slide.title = value;
      else if (key === 'body' || key === 'texto') bodyLines.push(value);
      else slide.imagePrompt = value;
      continue;
    }
    bodyLines.push(line);
  }

  if (!slide.title && bodyLines.length > 1 && isShortTitle(bodyLines[0])) {
    slide.title = bodyLines.shift();
  }
  if (bodyLines.length > 0) slide.body = bodyLines.join('\n');
  return slide;
}

export function parseCarouselCopy(input: string): ParsedSlide[] {
  const normalized = input.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  let blocks: string[];
  if (/^\s*---\s*$/m.test(normalized)) {
    blocks = normalized.split(/^\s*---\s*$/m);
  } else if (/^##\s+/m.test(normalized)) {
    const parts = normalized.split(/(?=^##\s+)/m);
    blocks = parts;
  } else {
    blocks = [normalized];
  }

  return blocks.map(b => parseSlideBlock(b.trim())).filter(s => s.title || s.body || s.imagePrompt);
}

export function selectArchetypes(slides: ParsedSlide[], archetypes: ArchetypeRecord[]): SelectedArchetype[] {
  const byRole = new Map<ArchetypeRole, ArchetypeRecord[]>();
  const roleCounts = new Map<ArchetypeRole, number>();
  for (const role of ARCHETYPE_ROLES) byRole.set(role, []);
  for (const archetype of archetypes) byRole.get(archetype.role)?.push(archetype);
  for (const list of byRole.values()) list.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const pick = (role: ArchetypeRole, index = 0): ArchetypeRecord | undefined => {
    const list = byRole.get(role) || [];
    if (list.length === 0) return undefined;
    return list[index % list.length];
  };

  return slides.map((slide, index) => {
    let role: ArchetypeRole = slide.imagePrompt ? 'image_body' : 'body';
    if (index === 0 && pick('cover')) role = 'cover';
    else if (index === slides.length - 1 && slides.length > 1 && (pick('cta') || pick('closing'))) {
      role = pick('cta') ? 'cta' : 'closing';
    }
    const roleIndex = roleCounts.get(role) || 0;
    roleCounts.set(role, roleIndex + 1);
    const fallback = pick(role, roleIndex) || pick('body', roleIndex) || pick('image_body', roleIndex) || archetypes[0];
    if (!fallback) throw new Error('No enabled carousel archetypes found for this brand kit.');
    return { slide, role: fallback.role, archetype: fallback };
  });
}

export function closestBrandKits(input: string, kits: BrandKitIndexEntry[], limit = 3): string[] {
  const needle = sanitizeBrandId(input);
  return kits
    .map(k => {
      const hay = sanitizeBrandId(k.id + k.name);
      let score = 0;
      for (const ch of needle) if (hay.includes(ch)) score++;
      if (hay.includes(needle)) score += 10;
      return { kit: k, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.kit.name);
}

export function normalizeReferenceImages(paths: string[] = []): string[] {
  return paths.filter(Boolean).slice(0, REFERENCE_IMAGE_LIMIT);
}
