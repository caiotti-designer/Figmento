import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  ARCHETYPE_ROLES,
  closestBrandKits,
  extractBrandMentions,
  hasExplicitOverwrite,
  listBrandKits,
  loadArchetypes,
  loadBrandKit,
  normalizeReferenceImages,
  parseCarouselCopy,
  saveArchetype,
  saveFolderBrandKit,
  saveReferenceImage,
  selectArchetypes,
  upgradeFlatKitForEdit,
  type ArchetypeRole,
} from './brand-kit-remix-core';

type SendDesignCommand = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

export const listBrandKitsSchema = {};

export const captureBrandKitArchetypeSchema = {
  brandId: z.string().describe('Brand kit id, e.g. "carmelus"'),
  role: z.enum(ARCHETYPE_ROLES).describe('Archetype role'),
  order: z.number().optional().describe('Sort order within the role. Default 1.'),
  id: z.string().optional().describe('Optional stable archetype id'),
};

export const saveBrandKitRemixSchema = {
  brandId: z.string().describe('Brand kit id, e.g. "carmelus"'),
  kit: z.record(z.unknown()).optional().describe('Full/partial brand kit data to merge before saving.'),
  referenceImages: z.array(z.object({
    filename: z.string(),
    dataUri: z.string(),
  })).optional().describe('Reference images to persist under the kit references folder.'),
};

export const remixBrandKitCarouselSchema = {
  brand: z.string().optional().describe('Brand kit name/id. If omitted, the first @Brand mention in copyMarkdown is used.'),
  copyMarkdown: z.string().optional().describe('Markdown/text copy to parse into slides. Supports --- separators and labels.'),
  slides: z.array(z.object({
    title: z.string().optional(),
    body: z.string().optional(),
    imagePrompt: z.string().optional(),
  })).optional().describe('Structured slides. Overrides copyMarkdown parsing when provided.'),
  overwrite: z.boolean().optional().describe('Explicit overwrite flag. Otherwise keyword detection is used.'),
  startX: z.number().optional().describe('Starting X for new carousel. Default 0.'),
  startY: z.number().optional().describe('Starting Y for new carousel. Default 0.'),
  gap: z.number().optional().describe('Gap between slides. Default 80.'),
};

function collectKitReferenceImages(kit: Record<string, unknown>): string[] {
  const remix = kit.remix as Record<string, unknown> | undefined;
  const imageStyle = remix?.image_style as Record<string, unknown> | undefined;
  const refs = imageStyle?.reference_images;
  return Array.isArray(refs) ? normalizeReferenceImages(refs.filter((r): r is string => typeof r === 'string')) : [];
}

function buildImageBrief(slide: { title?: string; body?: string; imagePrompt?: string }, kit: Record<string, unknown>): string {
  const remix = kit.remix as Record<string, unknown> | undefined;
  const imageStyle = remix?.image_style as Record<string, unknown> | undefined;
  const prefix = typeof imageStyle?.prompt_prefix === 'string' ? imageStyle.prompt_prefix : '';
  const negative = typeof imageStyle?.negative_prompt === 'string' ? imageStyle.negative_prompt : '';
  const subject = slide.imagePrompt || slide.title || slide.body || 'brand illustration';
  return [subject, prefix, negative ? `Avoid: ${negative}` : ''].filter(Boolean).join('. ');
}

function mapSlideTextToSlot(slotName: string, slide: { title?: string; body?: string; imagePrompt?: string }): string | null {
  const key = slotName.toLowerCase();
  if ((key.includes('title') || key.includes('titulo') || key.includes('headline')) && slide.title) return slide.title;
  if ((key.includes('body') || key.includes('texto') || key.includes('copy') || key.includes('desc')) && slide.body) return slide.body;
  if ((key.includes('prompt') || key.includes('image') || key.includes('imagem')) && slide.imagePrompt) return slide.imagePrompt;
  if (key === 'title' && slide.title) return slide.title;
  if (key === 'body' && slide.body) return slide.body;
  return null;
}

function selectionNodeId(node: Record<string, unknown>): string | null {
  const nodeId = node.nodeId || node.id;
  return typeof nodeId === 'string' ? nodeId : null;
}

async function applySlideToFrame(args: {
  sendDesignCommand: SendDesignCommand;
  rootId: string;
  slideIndex: number;
  slide: { title?: string; body?: string; imagePrompt?: string };
  kit: Record<string, unknown>;
  refs: string[];
  role: string;
  archetypeId?: string;
}): Promise<{ slideRecord: Record<string, unknown>; imageTasks: Array<Record<string, unknown>> }> {
  const scan = await args.sendDesignCommand('scan_template', { nodeId: args.rootId });
  const placeholders = scan.placeholders as Array<{ nodeId: string; name: string; type: 'text' | 'image' }> || [];
  const imageTasks: Array<Record<string, unknown>> = [];

  for (const ph of placeholders) {
    const slotName = ph.name.replace(/^#/, '');
    if (ph.type === 'text') {
      const content = mapSlideTextToSlot(slotName, args.slide);
      if (content) await args.sendDesignCommand('apply_template_text', { nodeId: ph.nodeId, content });
    } else {
      imageTasks.push({
        slideIndex: args.slideIndex,
        nodeId: ph.nodeId,
        brief: buildImageBrief(args.slide, args.kit),
        referenceImagePaths: args.refs,
      });
    }
  }

  return {
    slideRecord: {
      slideIndex: args.slideIndex,
      rootId: args.rootId,
      role: args.role,
      ...(args.archetypeId ? { archetypeId: args.archetypeId } : {}),
    },
    imageTasks,
  };
}

export function registerBrandKitRemixTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {
  server.tool(
    'list_brand_kits',
    'List saved brand kits, including legacy flat YAML kits and folder-based remix kits.',
    listBrandKitsSchema,
    async () => ({ content: [{ type: 'text' as const, text: JSON.stringify(listBrandKits(), null, 2) }] }),
  );

  server.tool(
    'capture_brand_kit_archetype',
    'Capture the current Figma selection as a Brand Kit Remix carousel archetype using the existing PresetNode serializer.',
    captureBrandKitArchetypeSchema,
    async (params) => {
      const brand = loadBrandKit(params.brandId);
      if (brand.storage === 'flat') upgradeFlatKitForEdit(brand.id);
      const capture = await sendDesignCommand('capture_preset_nodes', {});
      const nodes = capture.nodes as Array<Record<string, unknown>> | undefined;
      if (!nodes?.length) throw new Error('No capturable selected frames returned from Figma.');
      const path = saveArchetype({
        brandId: brand.id,
        archetype: {
          id: params.id || `${params.role}-${Date.now().toString(36)}`,
          role: params.role as ArchetypeRole,
          order: params.order || 1,
          enabled: true,
          nodes,
        },
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify({ saved: true, path, nodes: nodes.length }, null, 2) }] };
    },
  );

  server.tool(
    'save_brand_kit_remix',
    'Create or update remix metadata for a brand kit, including image style fields and persistent reference images.',
    saveBrandKitRemixSchema,
    async (params) => {
      let loaded: ReturnType<typeof loadBrandKit> | null = null;
      try { loaded = loadBrandKit(params.brandId); } catch { loaded = null; }
      if (loaded?.storage === 'flat') upgradeFlatKitForEdit(loaded.id);
      const brandId = loaded?.id || params.brandId.toLowerCase().replace(/[^a-z0-9-]/g, '');
      const kit = { ...(loaded?.kit || {}), ...(params.kit || {}) };
      kit.brand_id = kit.brand_id || brandId;
      kit.brand_name = kit.brand_name || params.brandId;

      const savedRefs: string[] = [];
      for (const ref of params.referenceImages || []) {
        savedRefs.push(saveReferenceImage({ brandId, filename: ref.filename, dataUri: ref.dataUri }));
      }
      if (savedRefs.length > 0) {
        const remix = (kit.remix as Record<string, unknown> | undefined) || {};
        const imageStyle = (remix.image_style as Record<string, unknown> | undefined) || {};
        const existingRefs = Array.isArray(imageStyle.reference_images) ? imageStyle.reference_images as string[] : [];
        imageStyle.reference_images = normalizeReferenceImages([...existingRefs, ...savedRefs]);
        remix.image_style = imageStyle;
        kit.remix = remix;
      }

      const path = saveFolderBrandKit(brandId, kit);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ saved: true, path, referenceImages: savedRefs }, null, 2) }] };
    },
  );

  server.tool(
    'remix_brand_kit_carousel',
    'Create a new carousel from a brand kit mention/copy using saved PresetNode archetypes. Applies text slots and queues image generation tasks.',
    remixBrandKitCarouselSchema,
    async (params) => {
      const mentions = params.copyMarkdown ? extractBrandMentions(params.copyMarkdown) : [];
      const brandName = params.brand || mentions[0];
      if (!brandName) throw new Error('brand or @Brand mention is required.');
      let loaded: ReturnType<typeof loadBrandKit>;
      try {
        loaded = loadBrandKit(brandName);
      } catch {
        const suggestions = closestBrandKits(brandName, listBrandKits());
        throw new Error(`Unknown brand kit "${brandName}". ${suggestions.length ? `Did you mean: ${suggestions.join(', ')}?` : 'No brand kits found.'}`);
      }

      const slides = params.slides?.length ? params.slides : parseCarouselCopy(params.copyMarkdown || '');
      if (slides.length === 0) throw new Error('No slides found in copyMarkdown/slides.');
      const archetypes = loadArchetypes(loaded.id);
      const selected = selectArchetypes(slides, archetypes);

      const shouldOverwrite = params.overwrite === true || hasExplicitOverwrite(params.copyMarkdown || '');
      const selection = await sendDesignCommand('get_selection', {});
      const selectedFrames = (selection.nodes as Array<Record<string, unknown>> | undefined || []).filter(n => n.type === 'FRAME');

      const createdSlides: Array<Record<string, unknown>> = [];
      const imageTasks: Array<Record<string, unknown>> = [];
      let x = params.startX ?? 0;
      const y = params.startY ?? 0;
      const gap = params.gap ?? 80;
      const refs = collectKitReferenceImages(loaded.kit);
      const overwriteTargets = shouldOverwrite ? selectedFrames : [];

      if (overwriteTargets.length > 0) {
        overwriteTargets.sort((a, b) => {
          const ay = typeof a.y === 'number' ? a.y : 0;
          const by = typeof b.y === 'number' ? b.y : 0;
          const ax = typeof a.x === 'number' ? a.x : 0;
          const bx = typeof b.x === 'number' ? b.x : 0;
          return Math.abs(ay - by) < 50 ? ax - bx : ay - by;
        });
        const lastFrame = overwriteTargets[Math.min(overwriteTargets.length, selected.length) - 1];
        if (lastFrame) {
          const frameX = typeof lastFrame.x === 'number' ? lastFrame.x : x;
          const frameWidth = typeof lastFrame.width === 'number' ? lastFrame.width : 1080;
          x = frameX + frameWidth + gap;
        }
      }

      for (let i = 0; i < selected.length; i++) {
        const item = selected[i];
        const overwriteRootId = overwriteTargets[i] ? selectionNodeId(overwriteTargets[i]) : null;
        if (overwriteRootId) {
          const applied = await applySlideToFrame({
            sendDesignCommand,
            rootId: overwriteRootId,
            slideIndex: i + 1,
            slide: item.slide,
            kit: loaded.kit,
            refs,
            role: item.role,
            archetypeId: item.archetype.id,
          });
          createdSlides.push({ ...applied.slideRecord, mode: 'overwrite' });
          imageTasks.push(...applied.imageTasks);
          continue;
        }

        const inst = await sendDesignCommand('instantiate_preset_nodes', { nodes: item.archetype.nodes, x, y });
        const nodeIds = inst.nodeIds as string[] || [];
        const rootId = nodeIds[0];
        if (!rootId) continue;
        const applied = await applySlideToFrame({
          sendDesignCommand,
          rootId,
          slideIndex: i + 1,
          slide: item.slide,
          kit: loaded.kit,
          refs,
          role: item.role,
          archetypeId: item.archetype.id,
        });
        createdSlides.push({ ...applied.slideRecord, mode: 'create' });
        imageTasks.push(...applied.imageTasks);
        x += Number(inst.width || item.archetype.nodes[0]?.width || 1080) + gap;
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            brand: loaded.id,
            slides: createdSlides,
            imageTasks,
            note: 'Text slots were applied. For each imageTask, call generate_design_image with frameId=nodeId, brief, referenceImagePaths, and asFill=true.',
          }, null, 2),
        }],
      };
    },
  );
}
