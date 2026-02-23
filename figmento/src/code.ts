/// <reference types="@figma/plugin-typings" />

import {
  UIAnalysis,
  UIElement,
  PluginMessage,
  AIProvider,
  TemplatePlaceholder,
  TemplateSlide,
  TemplateScanResult,
  TemplateTextResponse,
} from './types';
import { hexToRgb, rgbToHex, isContrastingColor } from './color-utils';
import { createElement } from './element-creators';

// Storage keys for persistent data
const API_KEYS_STORAGE_KEY = 'figmento-api-keys';
const VALIDATION_STORAGE_KEY = 'figmento-validated';

// Show plugin UI
figma.showUI(__html__, { width: 450, height: 820 });

// Load saved API keys when plugin starts
loadSavedApiKeys();

// Handle messages from UI
figma.ui.onmessage = async function (msg: PluginMessage) {
  switch (msg.type) {
    case 'create-design':
      try {
        figma.notify('Creating design...', { timeout: 2000 });
        await createDesignFromAnalysis(msg.data);
        figma.notify('Design created! Press Ctrl+Z to undo', { timeout: 3000 });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        figma.notify('Error: ' + errorMessage, { error: true });
      }
      break;

    case 'create-text-layout':
      try {
        figma.notify('Generating text layout...', { timeout: 2000 });
        await createDesignFromAnalysis(msg.data.design, 'Text Layout - ' + msg.data.format.name);
        figma.notify('Design created! Press Ctrl+Z to undo', { timeout: 3000 });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        figma.notify('Error: ' + errorMessage, { error: true });
      }
      break;

    case 'create-carousel':
      try {
        const slides = msg.data.slides;
        figma.notify('Creating carousel (' + slides.length + ' slides)...', { timeout: 2000 });

        const allFrames: FrameNode[] = [];

        for (let slideIdx = 0; slideIdx < slides.length; slideIdx++) {
          const slideAnalysis = slides[slideIdx];
          const slideName = 'Slide ' + (slideIdx + 1);
          const slideFrame = await createDesignFromAnalysis(slideAnalysis, slideName);

          // Position slides side by side with 40px gap
          if (slideIdx > 0) {
            slideFrame.x = allFrames[slideIdx - 1].x + allFrames[slideIdx - 1].width + 40;
            slideFrame.y = allFrames[0].y;
          }

          allFrames.push(slideFrame);
        }

        // Select all carousel frames
        figma.currentPage.selection = allFrames;
        figma.viewport.scrollAndZoomIntoView(allFrames);

        figma.notify('Carousel created! ' + slides.length + ' slides. Press Ctrl+Z to undo', { timeout: 3000 });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        figma.notify('Error creating carousel: ' + errorMessage, { error: true });
      }
      break;

    case 'create-presentation':
      try {
        const presSlides = msg.data.slides;
        figma.notify('Creating presentation (' + presSlides.length + ' slides)...', { timeout: 2000 });

        const presFrames: FrameNode[] = [];
        let presXOffset = 0;
        const presGap = 80; // Larger gap for presentations

        for (let presSlideIdx = 0; presSlideIdx < presSlides.length; presSlideIdx++) {
          const presSlideAnalysis = presSlides[presSlideIdx];
          const presSlideName = 'Slide ' + (presSlideIdx + 1);
          const presSlideFrame = await createDesignFromAnalysis(presSlideAnalysis, presSlideName);

          // Position slides in a row
          presSlideFrame.x = presXOffset;
          presSlideFrame.y = 0;
          presXOffset += presSlideFrame.width + presGap;

          presFrames.push(presSlideFrame);
        }

        // Select all presentation frames
        figma.currentPage.selection = presFrames;
        figma.viewport.scrollAndZoomIntoView(presFrames);

        figma.notify('Presentation created! ' + presSlides.length + ' slides. Press Ctrl+Z to undo', { timeout: 3000 });
      } catch (error) {
        const presErrorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        figma.notify('Error creating presentation: ' + presErrorMessage, { error: true });
      }
      break;

    case 'scan-slide-style':
      try {
        const selection = figma.currentPage.selection;
        if (selection.length === 0) {
          figma.ui.postMessage({
            type: 'slide-style-result',
            style: null,
            error: 'No frame selected. Please select a slide frame first.',
          });
          break;
        }

        const selectedNode = selection[0];
        if (selectedNode.type !== 'FRAME') {
          figma.ui.postMessage({
            type: 'slide-style-result',
            style: null,
            error: 'Please select a frame (slide), not a ' + selectedNode.type.toLowerCase() + '.',
          });
          break;
        }

        const slideFrame = selectedNode as FrameNode;

        // Extract background color
        let bgColor = '#FFFFFF';
        if (slideFrame.fills && Array.isArray(slideFrame.fills) && slideFrame.fills.length > 0) {
          const fill = slideFrame.fills[0];
          if (fill.type === 'SOLID') {
            bgColor = rgbToHex(fill.color);
          }
        }

        // Extract colors and fonts from child elements
        const extractedColors: string[] = [bgColor];
        const extractedFonts: string[] = [];

        function extractStyleFromNode(node: SceneNode) {
          // Extract fill colors
          if ('fills' in node && Array.isArray(node.fills)) {
            for (const f of node.fills) {
              if (f.type === 'SOLID' && f.visible !== false) {
                const hex = rgbToHex(f.color);
                if (!extractedColors.includes(hex)) {
                  extractedColors.push(hex);
                }
              }
            }
          }

          // Extract text colors and fonts
          if (node.type === 'TEXT') {
            const textNode = node as TextNode;
            if (textNode.fontName && typeof textNode.fontName !== 'symbol') {
              const fontFamily = textNode.fontName.family;
              if (!extractedFonts.includes(fontFamily)) {
                extractedFonts.push(fontFamily);
              }
            }
          }

          // Recurse into children
          if ('children' in node) {
            for (const child of (node as FrameNode | GroupNode).children) {
              extractStyleFromNode(child);
            }
          }
        }

        for (const child of slideFrame.children) {
          extractStyleFromNode(child);
        }

        // Determine primary colors (most likely used ones)
        const primaryColor = extractedColors.length > 1 ? extractedColors[1] : bgColor;
        const secondaryColor = extractedColors.length > 2 ? extractedColors[2] : primaryColor;
        const accentColor = extractedColors.length > 3 ? extractedColors[3] : primaryColor;
        const textColor =
          extractedColors.find(function (c) {
            return isContrastingColor(c, bgColor);
          }) || '#000000';

        const extractedStyle = {
          width: slideFrame.width,
          height: slideFrame.height,
          backgroundColor: bgColor,
          primaryColor: primaryColor,
          secondaryColor: secondaryColor,
          accentColor: accentColor,
          textColor: textColor,
          fontFamily: extractedFonts.length > 0 ? extractedFonts[0] : 'Inter',
          frameId: slideFrame.id,
          frameName: slideFrame.name,
        };

        figma.ui.postMessage({
          type: 'slide-style-result',
          style: extractedStyle,
        });

        figma.notify('Style extracted from "' + slideFrame.name + '"', { timeout: 2000 });
      } catch (error) {
        const styleScanError = error instanceof Error ? error.message : 'Unknown error';
        figma.ui.postMessage({
          type: 'slide-style-result',
          style: null,
          error: 'Failed to scan slide: ' + styleScanError,
        });
      }
      break;

    case 'add-slide':
      try {
        const addSlideData = msg.data;
        figma.notify('Adding slide...', { timeout: 1500 });

        // Create the new slide
        const newSlideFrame = await createDesignFromAnalysis(addSlideData.slide, 'New Slide');

        // Find the reference frame and position after it
        const refFrame = figma.getNodeById(addSlideData.afterFrameId);
        if (refFrame && refFrame.type === 'FRAME') {
          const refFrameNode = refFrame as FrameNode;
          newSlideFrame.x = refFrameNode.x + refFrameNode.width + 80;
          newSlideFrame.y = refFrameNode.y;
        }

        // Select the new frame
        figma.currentPage.selection = [newSlideFrame];
        figma.viewport.scrollAndZoomIntoView([newSlideFrame]);

        figma.notify('Slide added! Press Ctrl+Z to undo', { timeout: 2000 });

        figma.ui.postMessage({ type: 'add-slide-complete' });
      } catch (error) {
        const addSlideError = error instanceof Error ? error.message : 'Unknown error';
        figma.notify('Error adding slide: ' + addSlideError, { error: true });
        figma.ui.postMessage({ type: 'add-slide-error', error: addSlideError });
      }
      break;

    case 'set-image':
      try {
        await createReferenceImage(msg.imageData, msg.width, msg.height);
      } catch (error) {
        console.error('Failed to create reference image:', error);
      }
      break;

    case 'get-selected-image':
      await handleGetSelectedImage();
      break;

    case 'save-api-key':
      await saveApiKey(msg.provider, msg.apiKey);
      break;

    case 'load-api-keys':
      await loadSavedApiKeys();
      break;

    case 'save-validation':
      await saveValidationStatus(msg.provider, msg.isValid);
      break;

    case 'save-feedback':
      try {
        const existing = (await figma.clientStorage.getAsync('design-feedback')) || [];
        existing.push(msg.data);
        // Keep only the last 100 feedback entries
        if (existing.length > 100) existing.splice(0, existing.length - 100);
        await figma.clientStorage.setAsync('design-feedback', existing);
      } catch (_e) {
        // Feedback storage is best-effort
      }
      break;

    case 'status':
      figma.notify(msg.message, { timeout: 2000 });
      break;

    case 'error':
      figma.notify(msg.message, { error: true });
      break;

    case 'scan-template':
      try {
        const scanResult = await scanTemplateFrames();
        figma.ui.postMessage({
          type: 'template-scan-result',
          result: scanResult,
        });
      } catch (error) {
        const scanErrorMsg = error instanceof Error ? error.message : 'Scan failed';
        figma.ui.postMessage({
          type: 'template-scan-result',
          result: { slides: [], textSlots: [], imageSlots: [], slideCount: 0 },
          error: scanErrorMsg,
        });
      }
      break;

    case 'apply-template-text':
      try {
        const applyResult = await applyTemplateText(msg.data.slides, msg.data.content);
        figma.ui.postMessage({
          type: 'template-apply-result',
          success: true,
          slidesUpdated: applyResult.slidesUpdated,
          errors: applyResult.errors,
        });
        figma.notify('Text applied to ' + applyResult.slidesUpdated + ' slides!', { timeout: 3000 });
      } catch (error) {
        const applyErrorMsg = error instanceof Error ? error.message : 'Apply failed';
        figma.ui.postMessage({
          type: 'template-apply-result',
          success: false,
          slidesUpdated: 0,
          errors: [applyErrorMsg],
        });
      }
      break;

    case 'apply-template-image':
      try {
        await applyTemplateImage(msg.data.nodeId, msg.data.imageData, msg.data.width, msg.data.height);
        figma.ui.postMessage({
          type: 'template-apply-result',
          success: true,
          slidesUpdated: 1,
        });
      } catch (error) {
        const imgErrorMsg = error instanceof Error ? error.message : 'Image apply failed';
        figma.notify('Error: ' + imgErrorMsg, { error: true });
      }
      break;

    case 'create-hero-image':
      try {
        const heroImageData = msg.imageData;
        const heroWidth = msg.width;
        const heroHeight = msg.height;
        const heroName = msg.name || 'Hero Image';

        figma.notify('Placing hero image...', { timeout: 1500 });

        const heroFrame = figma.createFrame();
        heroFrame.name = heroName;
        heroFrame.resize(heroWidth, heroHeight);

        // Set image as fill
        const heroBase64 = heroImageData.replace(/^data:image\/\w+;base64,/, '');
        const heroBytes = figma.base64Decode(heroBase64);
        const heroImage = figma.createImage(heroBytes);
        heroFrame.fills = [
          {
            type: 'IMAGE',
            imageHash: heroImage.hash,
            scaleMode: 'FILL',
          },
        ];

        // Position at viewport center
        const heroCenter = figma.viewport.center;
        heroFrame.x = heroCenter.x - heroWidth / 2;
        heroFrame.y = heroCenter.y - heroHeight / 2;

        figma.currentPage.selection = [heroFrame];
        figma.viewport.scrollAndZoomIntoView([heroFrame]);

        figma.notify('Hero image placed on canvas! Press Ctrl+Z to undo', { timeout: 3000 });
      } catch (error) {
        const heroErrorMsg = error instanceof Error ? error.message : 'Unknown error';
        figma.notify('Error placing hero image: ' + heroErrorMsg, { error: true });
      }
      break;
  }
};

/**
 * Saves an API key to Figma's client storage
 */
async function saveApiKey(provider: AIProvider, apiKey: string) {
  try {
    const keys = (await figma.clientStorage.getAsync(API_KEYS_STORAGE_KEY)) || {};
    if (apiKey) {
      keys[provider] = apiKey;
    } else {
      delete keys[provider];
    }
    await figma.clientStorage.setAsync(API_KEYS_STORAGE_KEY, keys);
  } catch (error) {
    console.error('Failed to save API key:', error);
  }
}

/**
 * Saves validation status to Figma's client storage
 */
async function saveValidationStatus(provider: AIProvider, isValid: boolean) {
  try {
    const validated = (await figma.clientStorage.getAsync(VALIDATION_STORAGE_KEY)) || {};
    validated[provider] = isValid;
    await figma.clientStorage.setAsync(VALIDATION_STORAGE_KEY, validated);
  } catch (error) {
    console.error('Failed to save validation status:', error);
  }
}

/**
 * Loads saved API keys and validation status from Figma's client storage and sends to UI
 */
async function loadSavedApiKeys() {
  try {
    const keys = (await figma.clientStorage.getAsync(API_KEYS_STORAGE_KEY)) || {};
    const validated = (await figma.clientStorage.getAsync(VALIDATION_STORAGE_KEY)) || {};
    figma.ui.postMessage({
      type: 'api-keys-loaded',
      keys: keys,
      validated: validated,
    });
  } catch (error) {
    console.error('Failed to load API keys:', error);
    figma.ui.postMessage({
      type: 'api-keys-loaded',
      keys: {},
      validated: {},
    });
  }
}

/**
 * Gets the selected image from Figma and sends it to the UI
 */
async function handleGetSelectedImage() {
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

// ═══════════════════════════════════════════════════════════════
// TEMPLATE FILL FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Scans selected frames for #-prefixed placeholder layers.
 * Sorts frames left-to-right, then top-to-bottom.
 */
async function scanTemplateFrames(): Promise<TemplateScanResult> {
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
async function applyTemplateText(
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
async function applyTemplateImage(nodeId: string, imageData: string, _width: number, _height: number) {
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

// Progress tracking for live updates
let totalElements = 0;
let createdElements = 0;

/**
 * Counts total elements recursively for progress tracking
 */
function countElements(elements: UIElement[]): number {
  let count = 0;
  for (let i = 0; i < elements.length; i++) {
    count++;
    const children = elements[i].children;
    if (children && children.length > 0) {
      count += countElements(children);
    }
  }
  return count;
}

/**
 * Sends progress update to UI
 */
function sendProgress(message: string) {
  figma.ui.postMessage({
    type: 'progress',
    message: message,
    current: createdElements,
    total: totalElements,
  });
}

/**
 * Small delay for visual feedback
 */
function delay(ms: number): Promise<void> {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

/**
 * Creates the main design from AI analysis with live progress
 */
async function createDesignFromAnalysis(analysis: UIAnalysis, frameName?: string): Promise<FrameNode> {
  // Count total elements for progress tracking
  totalElements = countElements(analysis.elements);
  createdElements = 0;

  sendProgress('Creating main frame...');

  // Create main container frame
  const mainFrame = figma.createFrame();
  mainFrame.name = frameName || 'Generated Design';
  mainFrame.resize(analysis.width, analysis.height);
  mainFrame.fills = [
    {
      type: 'SOLID',
      color: hexToRgb(analysis.backgroundColor),
    },
  ];

  // Position at current viewport center
  const viewportCenter = figma.viewport.center;
  mainFrame.x = viewportCenter.x - analysis.width / 2;
  mainFrame.y = viewportCenter.y - analysis.height / 2;

  // Focus on the frame immediately so user can see it being built
  figma.viewport.scrollAndZoomIntoView([mainFrame]);
  figma.currentPage.selection = [mainFrame];

  await delay(50);

  // Create all elements with live progress
  for (let i = 0; i < analysis.elements.length; i++) {
    const element = analysis.elements[i];
    const node = await createElementWithProgress(element, mainFrame);
    if (node) {
      mainFrame.appendChild(node);
    }
    // Small delay between top-level elements
    await delay(5);
  }

  // Final selection
  figma.currentPage.selection = [mainFrame];
  sendProgress('Complete! Created ' + createdElements + ' elements');

  return mainFrame;
}

/**
 * Creates an element with progress updates
 */
async function createElementWithProgress(element: UIElement, _parent?: FrameNode): Promise<SceneNode | null> {
  createdElements++;
  sendProgress('Creating: ' + element.name);

  const node = await createElement(element, true); // true = skip children, we'll handle them

  if (!node) return null;

  // Handle children with progress for frame-like nodes
  if (element.children && element.children.length > 0 && 'appendChild' in node) {
    for (let i = 0; i < element.children.length; i++) {
      const childElement = element.children[i];
      const childNode = await createElementWithProgress(childElement, node as FrameNode);
      if (childNode) {
        (node as FrameNode).appendChild(childNode);
      }
      // Small delay between children
      await delay(2);
    }
  }

  return node;
}

/**
 * Creates a reference image from the original screenshot
 */
async function createReferenceImage(imageData: string, width: number, height: number) {
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
