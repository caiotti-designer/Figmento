/// <reference types="@figma/plugin-typings" />

import {
  TemplatePlaceholder,
  TemplateSlide,
  TemplateScanResult,
  TemplateTextResponse,
} from '../types';

/**
 * Gets the selected image from Figma and sends it to the UI
 */
export async function handleGetSelectedImage() {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.ui.postMessage({
      type: 'selected-image',
      imageData: null,
      width: 0,
      height: 0,
      error: 'No element selected. Please select an image or frame in Figma.',
    });
    return;
  }

  const node = selection[0];

  try {
    // Try to export the selected node as PNG
    const bytes = await node.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: 1 },
    });

    // Convert to base64
    const base64 = figma.base64Encode(bytes);
    const dataUrl = 'data:image/png;base64,' + base64;

    figma.ui.postMessage({
      type: 'selected-image',
      imageData: dataUrl,
      width: node.width,
      height: node.height,
    });

    figma.notify('Image loaded from selection', { timeout: 1500 });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    figma.ui.postMessage({
      type: 'selected-image',
      imageData: null,
      width: 0,
      height: 0,
      error: 'Failed to export selection: ' + errMsg,
    });
  }
}

/**
 * Creates a reference image from the original screenshot
 */
export async function createReferenceImage(imageData: string, width: number, height: number) {
  try {
    // Remove data URL prefix if present
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');

    // Convert base64 to Uint8Array
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Create image
    const image = figma.createImage(bytes);

    // Create rectangle with image fill
    const rect = figma.createRectangle();
    rect.name = 'Reference Screenshot';
    rect.resize(width, height);
    rect.fills = [
      {
        type: 'IMAGE',
        imageHash: image.hash,
        scaleMode: 'FILL',
      },
    ];

    // Position to the left of viewport center
    const viewportCenter = figma.viewport.center;
    rect.x = viewportCenter.x - width - 50;
    rect.y = viewportCenter.y - height / 2;

    // Lower opacity to indicate it's a reference
    rect.opacity = 0.5;
  } catch (error) {
    console.error('Failed to create reference image:', error);
  }
}

/**
 * Scans selected frames for #-prefixed placeholder layers.
 * Sorts frames left-to-right, then top-to-bottom.
 */
export async function scanTemplateFrames(): Promise<TemplateScanResult> {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    throw new Error('No frames selected. Please select template frames on the canvas.');
  }

  const frames: FrameNode[] = [];
  for (let i = 0; i < selection.length; i++) {
    if (selection[i].type === 'FRAME') {
      frames.push(selection[i] as FrameNode);
    }
  }

  if (frames.length === 0) {
    throw new Error('No frame nodes found in selection. Select top-level frames.');
  }

  // Sort: left-to-right first, then top-to-bottom
  const ROW_THRESHOLD = 50;
  frames.sort(function (a, b) {
    const rowDiff = Math.abs(a.y - b.y);
    if (rowDiff < ROW_THRESHOLD) {
      return a.x - b.x;
    }
    return a.y - b.y;
  });

  const slides: TemplateSlide[] = [];
  const allTextSlots = new Set<string>();
  const allImageSlots = new Set<string>();

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const placeholders = findPlaceholders(frame);

    const slide: TemplateSlide = {
      frameId: frame.id,
      frameName: frame.name,
      frameX: frame.x,
      frameY: frame.y,
      placeholders: placeholders,
    };

    for (let j = 0; j < placeholders.length; j++) {
      if (placeholders[j].slotCategory === 'text') {
        allTextSlots.add(placeholders[j].slotType);
      } else {
        allImageSlots.add(placeholders[j].slotType);
      }
    }

    slides.push(slide);
  }

  return {
    slides: slides,
    textSlots: Array.from(allTextSlots),
    imageSlots: Array.from(allImageSlots),
    slideCount: slides.length,
  };
}

/**
 * Recursively finds all #-prefixed layers in a frame.
 */
function findPlaceholders(parent: BaseNode & ChildrenMixin): TemplatePlaceholder[] {
  let results: TemplatePlaceholder[] = [];

  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];

    if (child.name.startsWith('#')) {
      const slotType = child.name.substring(1);
      const category: 'text' | 'image' = slotType.startsWith('img') ? 'image' : 'text';

      const placeholder: TemplatePlaceholder = {
        nodeId: child.id,
        name: child.name,
        slotType: slotType,
        slotCategory: category,
        width: 'width' in child ? (child as any).width : 100,
        height: 'height' in child ? (child as any).height : 100,
      };

      if (child.type === 'TEXT') {
        placeholder.currentContent = (child as TextNode).characters;
      }

      results.push(placeholder);
    }

    if ('children' in child) {
      const childResults = findPlaceholders(child as BaseNode & ChildrenMixin);
      results = results.concat(childResults);
    }
  }

  return results;
}

/**
 * Applies AI-distributed text content to all template slides.
 * Preserves existing font family, weight, size, and color.
 */
export async function applyTemplateText(
  slides: TemplateSlide[],
  content: TemplateTextResponse
): Promise<{ slidesUpdated: number; errors: string[] }> {
  let slidesUpdated = 0;
  const errors: string[] = [];

  for (let i = 0; i < slides.length; i++) {
    if (i >= content.slides.length) break;

    const slide = slides[i];
    const slideContent = content.slides[i];

    for (let j = 0; j < slide.placeholders.length; j++) {
      const placeholder = slide.placeholders[j];
      if (placeholder.slotCategory !== 'text') continue;

      const newText = slideContent[placeholder.slotType];
      if (!newText) continue;

      try {
        const node = figma.getNodeById(placeholder.nodeId);
        if (!node || node.type !== 'TEXT') {
          errors.push('Slide ' + (i + 1) + ': ' + placeholder.name + ' not found or not text');
          continue;
        }

        const textNode = node as TextNode;

        // Load the existing font before modifying text
        const existingFont = textNode.fontName;
        if (existingFont !== figma.mixed) {
          await figma.loadFontAsync(existingFont as FontName);
        } else {
          // Mixed fonts - load font of first character
          const len = textNode.characters.length;
          if (len > 0) {
            const firstCharFont = textNode.getRangeFontName(0, 1) as FontName;
            await figma.loadFontAsync(firstCharFont);
          }
        }

        textNode.characters = newText;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        errors.push('Slide ' + (i + 1) + ', ' + placeholder.name + ': ' + errMsg);
      }
    }

    slidesUpdated++;
  }

  return { slidesUpdated, errors };
}

/**
 * Applies an image to a specific node (frame or rectangle).
 */
export async function applyTemplateImage(nodeId: string, imageData: string, _width: number, _height: number) {
  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error('Node not found: ' + nodeId);

  const base64 = imageData.replace(/^data:image\/\w+;base64,/, '');
  const bytes = figma.base64Decode(base64);
  const image = figma.createImage(bytes);

  if (node.type === 'RECTANGLE' || node.type === 'FRAME') {
    (node as RectangleNode | FrameNode).fills = [
      {
        type: 'IMAGE',
        imageHash: image.hash,
        scaleMode: 'FILL',
      },
    ];
  } else {
    throw new Error('Node type ' + node.type + ' does not support image fills');
  }
}
