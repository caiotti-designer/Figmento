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
  WSCommand,
  WSResponse,
  CommandErrorCode,
  TextProperties,
} from './types';
import { hexToRgb, rgbToHex, getFontStyle, isContrastingColor } from './color-utils';
import { createElement } from './element-creators';
import { getGradientTransform } from './gradient-utils';

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

    case 'execute-command':
      try {
        const cmdResult = await executeCommand((msg as any).command);
        figma.ui.postMessage({
          type: 'command-result',
          response: cmdResult,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const classified = classifyError(errorMessage);
        figma.ui.postMessage({
          type: 'command-result',
          response: {
            type: 'response',
            id: (msg as any).command?.id,
            channel: (msg as any).command?.channel,
            success: false,
            error: errorMessage,
            errorCode: classified.code,
            recoverable: classified.recoverable,
          },
        });
      }
      break;

    case 'get-settings':
      (async () => {
        try {
          // Load from unified storage and map to chat-settings flat format
          const keys = (await figma.clientStorage.getAsync(API_KEYS_STORAGE_KEY)) || {};
          const chatModel = (await figma.clientStorage.getAsync('figmento-chat-model')) || '';

          // Migration: check for old figmento-plugin/ flat keys
          await migrateOldSettings(keys);

          figma.ui.postMessage({
            type: 'settings-loaded',
            settings: {
              anthropicApiKey: keys['claude'] || '',
              geminiApiKey: keys['gemini'] || '',
              openaiApiKey: keys['openai'] || '',
              model: chatModel,
            },
          });
        } catch (error) {
          console.error('Failed to load settings:', error);
          figma.ui.postMessage({
            type: 'settings-loaded',
            settings: {},
          });
        }
      })();
      break;

    case 'save-settings':
      (async () => {
        const s = (msg as any).settings as Record<string, unknown>;
        if (s) {
          // Store API keys into the unified storage object (same as Settings tab)
          const keys = (await figma.clientStorage.getAsync(API_KEYS_STORAGE_KEY)) || {};
          if (s.geminiApiKey) keys['gemini'] = s.geminiApiKey;
          if (s.anthropicApiKey) keys['claude'] = s.anthropicApiKey;
          if (s.openaiApiKey) keys['openai'] = s.openaiApiKey;
          await figma.clientStorage.setAsync(API_KEYS_STORAGE_KEY, keys);

          // Store chat model preference separately
          if (s.model) {
            await figma.clientStorage.setAsync('figmento-chat-model', s.model);
          }
        }
      })();
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

    case 'load-memory':
      (async () => {
        try {
          const memory = (await figma.clientStorage.getAsync('figmento-memory')) || [];
          figma.ui.postMessage({ type: 'memory-loaded', entries: memory });
        } catch (_e) {
          figma.ui.postMessage({ type: 'memory-loaded', entries: [] });
        }
      })();
      break;

    case 'save-memory':
      (async () => {
        try {
          const entries = (await figma.clientStorage.getAsync('figmento-memory')) || [];
          entries.push({
            entry: (msg as any).entry as string,
            timestamp: new Date().toISOString(),
          });
          // Keep only the last 50 entries
          if (entries.length > 50) entries.splice(0, entries.length - 50);
          await figma.clientStorage.setAsync('figmento-memory', entries);
          figma.ui.postMessage({ type: 'memory-saved', success: true });
        } catch (_e) {
          figma.ui.postMessage({ type: 'memory-saved', success: false });
        }
      })();
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

    case 'zoom-to-node':
      try {
        const zoomNodeId = (msg as any).nodeId as string;
        const zoomNode = figma.getNodeById(zoomNodeId);
        if (zoomNode) {
          figma.viewport.scrollAndZoomIntoView([zoomNode as SceneNode]);
        }
      } catch (_e) {
        // Best-effort zoom
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

// ═══════════════════════════════════════════════════════════════
// SETTINGS MIGRATION
// ═══════════════════════════════════════════════════════════════

/**
 * Migrates old figmento-plugin/ flat storage keys to the unified schema.
 * Read-only migration: copies values to new schema, never deletes old keys.
 */
async function migrateOldSettings(keys: Record<string, string>) {
  let migrated = false;

  // Check for old flat key format from figmento-plugin/
  const oldAnthropicKey = await figma.clientStorage.getAsync('anthropicApiKey');
  if (oldAnthropicKey && !keys['claude']) {
    keys['claude'] = oldAnthropicKey;
    migrated = true;
  }

  const oldGeminiKey = await figma.clientStorage.getAsync('geminiApiKey');
  if (oldGeminiKey && !keys['gemini']) {
    keys['gemini'] = oldGeminiKey;
    migrated = true;
  }

  if (migrated) {
    await figma.clientStorage.setAsync(API_KEYS_STORAGE_KEY, keys);
    console.log('Settings migration: copied old flat keys to unified schema');
  }
}

// ═══════════════════════════════════════════════════════════════
// COMMAND ROUTER (from figmento-plugin/)
// ═══════════════════════════════════════════════════════════════

async function executeCommand(cmd: WSCommand): Promise<WSResponse> {
  const baseResponse = {
    type: 'response' as const,
    id: cmd.id,
    channel: cmd.channel,
  };

  try {
    switch (cmd.action) {
      case 'create_frame':
        return { ...baseResponse, success: true, data: await handleCreateFrame(cmd.params) };
      case 'create_text':
        return { ...baseResponse, success: true, data: await handleCreateText(cmd.params) };
      case 'set_fill':
        return { ...baseResponse, success: true, data: await handleSetFill(cmd.params) };
      case 'export_node':
        return { ...baseResponse, success: true, data: await handleExportNode(cmd.params) };
      case 'get_screenshot':
        return { ...baseResponse, success: true, data: await handleGetScreenshot(cmd.params) };
      case 'get_selection':
        return { ...baseResponse, success: true, data: await handleGetSelection() };
      case 'create_rectangle':
        return { ...baseResponse, success: true, data: await handleCreateRectangle(cmd.params) };
      case 'create_ellipse':
        return { ...baseResponse, success: true, data: await handleCreateEllipse(cmd.params) };
      case 'create_image':
        return { ...baseResponse, success: true, data: await handleCreateImage(cmd.params) };
      case 'set_stroke':
        return { ...baseResponse, success: true, data: await handleSetStroke(cmd.params) };
      case 'set_effects':
        return { ...baseResponse, success: true, data: await handleSetEffects(cmd.params) };
      case 'set_corner_radius':
        return { ...baseResponse, success: true, data: await handleSetCornerRadius(cmd.params) };
      case 'set_opacity':
        return { ...baseResponse, success: true, data: await handleSetOpacity(cmd.params) };
      case 'set_auto_layout':
        return { ...baseResponse, success: true, data: await handleSetAutoLayout(cmd.params) };
      case 'delete_node':
        return { ...baseResponse, success: true, data: await handleDeleteNode(cmd.params) };
      case 'move_node':
        return { ...baseResponse, success: true, data: await handleMoveNode(cmd.params) };
      case 'resize_node':
        return { ...baseResponse, success: true, data: await handleResizeNode(cmd.params) };
      case 'rename_node':
        return { ...baseResponse, success: true, data: await handleRenameNode(cmd.params) };
      case 'append_child':
        return { ...baseResponse, success: true, data: await handleAppendChild(cmd.params) };
      case 'reorder_child':
        return { ...baseResponse, success: true, data: await handleReorderChild(cmd.params) };
      case 'clone_node':
        return { ...baseResponse, success: true, data: await handleCloneNode(cmd.params) };
      case 'group_nodes':
        return { ...baseResponse, success: true, data: await handleGroupNodes(cmd.params) };
      case 'get_node_info':
        return { ...baseResponse, success: true, data: await handleGetNodeInfo(cmd.params) };
      case 'get_page_nodes':
        return { ...baseResponse, success: true, data: await handleGetPageNodes() };
      case 'create_design':
        return { ...baseResponse, success: true, data: await handleCreateDesignCmd(cmd.params) };
      case 'create_icon':
        return { ...baseResponse, success: true, data: await handleCreateIcon(cmd.params) };
      case 'scan_template':
        return { ...baseResponse, success: true, data: await handleScanTemplateCmd(cmd.params) };
      case 'apply_template_text':
        return { ...baseResponse, success: true, data: await handleApplyTemplateTextCmd(cmd.params) };
      case 'apply_template_image':
        return { ...baseResponse, success: true, data: await handleApplyTemplateImageCmd(cmd.params) };
      case 'batch_execute':
        return { ...baseResponse, success: true, data: await handleBatchExecute(cmd.params) };
      case 'clone_with_overrides':
        return { ...baseResponse, success: true, data: await handleCloneWithOverrides(cmd.params) };
      case 'scan_frame_structure':
        return { ...baseResponse, success: true, data: await handleScanFrameStructure(cmd.params) };
      case 'set_text':
        return { ...baseResponse, success: true, data: await handleSetText(cmd.params) };
      case 'ad-analyzer-complete': {
        // Forward to UI iframe — this is a UI-only message, no Figma API action
        figma.ui.postMessage({
          type: 'ad-analyzer-complete',
          report: cmd.params.report,
          carouselNodeId: cmd.params.carouselNodeId,
          variantNodeIds: cmd.params.variantNodeIds,
        });
        return { ...baseResponse, success: true, data: {} };
      }
      default:
        return { ...baseResponse, success: false, error: `Unknown action: ${cmd.action}` };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const { code, recoverable } = classifyError(errorMessage);
    return { ...baseResponse, success: false, error: errorMessage, errorCode: code, recoverable };
  }
}

/** Classify an error message into a structured CommandErrorCode */
function classifyError(message: string): { code: CommandErrorCode; recoverable: boolean } {
  const lower = message.toLowerCase();
  if (lower.includes('node not found') || lower.includes('not found:')) {
    return { code: 'NODE_NOT_FOUND', recoverable: false };
  }
  if (lower.includes('font') && (lower.includes('load') || lower.includes('fail') || lower.includes('timeout'))) {
    return { code: 'FONT_LOAD_FAILED', recoverable: true };
  }
  if (lower.includes('export') && lower.includes('fail')) {
    return { code: 'EXPORT_FAILED', recoverable: true };
  }
  if (lower.includes('cannot have children') || lower.includes('not a frame') || lower.includes('parent')) {
    return { code: 'PARENT_MISMATCH', recoverable: false };
  }
  if (lower.includes('decode') || lower.includes('image data') || lower.includes('createimage')) {
    return { code: 'IMAGE_DECODE_FAILED', recoverable: false };
  }
  if (lower.includes('timeout')) {
    return { code: 'TIMEOUT', recoverable: true };
  }
  if (lower.includes('required') || lower.includes('invalid') || lower.includes('cannot be empty')) {
    return { code: 'INVALID_PARAMS', recoverable: false };
  }
  return { code: 'UNKNOWN', recoverable: false };
}

// ═══════════════════════════════════════════════════════════════
// COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════

async function handleCreateFrame(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const frameFills: UIElement['fills'] = params.fills as UIElement['fills'] | undefined
    ?? (params.fillColor ? [{ type: 'SOLID' as const, color: params.fillColor as string }] : undefined);

  const element: UIElement = {
    id: 'frame',
    type: 'frame',
    name: (params.name as string) || 'Frame',
    width: (params.width as number) || 100,
    height: (params.height as number) || 100,
    x: params.x as number | undefined,
    y: params.y as number | undefined,
    fills: frameFills,
    layoutMode: params.layoutMode as UIElement['layoutMode'] | undefined,
    itemSpacing: params.itemSpacing as number | undefined,
    paddingTop: params.paddingTop as number | undefined,
    paddingRight: params.paddingRight as number | undefined,
    paddingBottom: params.paddingBottom as number | undefined,
    paddingLeft: params.paddingLeft as number | undefined,
    primaryAxisAlignItems: params.primaryAxisAlignItems as UIElement['primaryAxisAlignItems'] | undefined,
    counterAxisAlignItems: params.counterAxisAlignItems as UIElement['counterAxisAlignItems'] | undefined,
    primaryAxisSizingMode: params.primaryAxisSizingMode as UIElement['primaryAxisSizingMode'] | undefined,
    counterAxisSizingMode: params.counterAxisSizingMode as UIElement['counterAxisSizingMode'] | undefined,
    cornerRadius: params.cornerRadius as UIElement['cornerRadius'] | undefined,
    clipsContent: params.clipsContent as boolean | undefined,
    layoutSizingHorizontal: params.layoutSizingHorizontal as UIElement['layoutSizingHorizontal'] | undefined,
    layoutSizingVertical: params.layoutSizingVertical as UIElement['layoutSizingVertical'] | undefined,
    children: [],
  };

  const node = await createElement(element, true);
  if (!node) throw new Error('Failed to create frame');

  const needsResizing = params.parentId && (element.layoutSizingHorizontal || element.layoutSizingVertical);

  if (params.parentId) {
    const parent = figma.getNodeById(params.parentId as string);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(node);
    }
  } else {
    if (element.x === undefined && element.y === undefined) {
      const center = figma.viewport.center;
      node.x = center.x - element.width / 2;
      node.y = center.y - element.height / 2;
    }
  }

  if (needsResizing && 'layoutSizingHorizontal' in node) {
    try {
      if (element.layoutSizingHorizontal) {
        (node as FrameNode).layoutSizingHorizontal = element.layoutSizingHorizontal;
      }
      if (element.layoutSizingVertical) {
        (node as FrameNode).layoutSizingVertical = element.layoutSizingVertical;
      }
    } catch { /* parent may not be auto-layout */ }
  }

  figma.currentPage.selection = [node];
  return { nodeId: node.id, name: node.name };
}

async function handleCreateText(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const textContent = (params.text as string) || (params.content as string) || '';
  if (!textContent || textContent.trim().length === 0) {
    throw new Error('Text content is required and cannot be empty. Provide a non-empty "text" parameter.');
  }

  const textColor = (params.color as string) || (params.fillColor as string) || '#000000';
  const textAlign = (params.textAlign || params.textAlignHorizontal) as TextProperties['textAlign'] | undefined;

  let layoutSizingH = params.layoutSizingHorizontal as UIElement['layoutSizingHorizontal'] | undefined;
  let layoutSizingV = params.layoutSizingVertical as UIElement['layoutSizingVertical'] | undefined;

  if (layoutSizingH === 'FILL' && params.width != null) {
    layoutSizingH = 'FIXED';
  }

  if (!layoutSizingH && !layoutSizingV && params.parentId) {
    const potentialParent = figma.getNodeById(params.parentId as string);
    if (potentialParent && 'layoutMode' in potentialParent &&
        (potentialParent as FrameNode).layoutMode !== 'NONE') {
      layoutSizingH = 'FILL';
      layoutSizingV = 'HUG';
    }
  }

  const element: UIElement = {
    id: 'text',
    type: 'text',
    name: (params.name as string) || 'Text',
    width: (params.width as number) || 200,
    height: (params.height as number) || 40,
    x: params.x as number | undefined,
    y: params.y as number | undefined,
    text: {
      content: textContent,
      fontSize: (params.fontSize as number) || 16,
      fontWeight: (params.fontWeight as number) || 400,
      fontFamily: (params.fontFamily as string) || 'Inter',
      color: textColor,
      textAlign,
      lineHeight: params.lineHeight as number | undefined,
      letterSpacing: params.letterSpacing as number | undefined,
      italic: params.italic as boolean | undefined,
      underline: params.underline as boolean | undefined,
      strikethrough: params.strikethrough as boolean | undefined,
      segments: params.segments as TextProperties['segments'] | undefined,
    },
    layoutSizingHorizontal: layoutSizingH,
    layoutSizingVertical: layoutSizingV,
    children: [],
  };

  const node = await createElement(element, true);
  if (!node) throw new Error('Failed to create text');

  if (params.parentId) {
    const parent = figma.getNodeById(params.parentId as string);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(node);
    }
    if (layoutSizingH && 'layoutSizingHorizontal' in node) {
      try { (node as any).layoutSizingHorizontal = layoutSizingH; } catch { /* ignore */ }
    }
    if (layoutSizingV && 'layoutSizingVertical' in node) {
      try { (node as any).layoutSizingVertical = layoutSizingV; } catch { /* ignore */ }
    }
  }

  return { nodeId: node.id, name: node.name };
}

async function handleSetFill(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (!('fills' in node)) throw new Error(`Node ${nodeId} does not support fills`);

  if (params.color) {
    const rgb = hexToRgb(params.color as string);
    const opacity = params.opacity as number | undefined;
    (node as GeometryMixin).fills = [{
      type: 'SOLID',
      color: rgb,
      opacity: opacity != null ? opacity : 1,
    }];
  } else if (params.fills) {
    const fills = params.fills as Array<{ type: string; color?: string; opacity?: number; gradientStops?: Array<{ position: number; color: string; opacity?: number }>; gradientDirection?: string }>;
    const paintFills: Paint[] = [];

    for (const fill of fills) {
      if (fill.type === 'SOLID' && fill.color) {
        paintFills.push({
          type: 'SOLID',
          color: hexToRgb(fill.color),
          opacity: fill.opacity != null ? fill.opacity : 1,
        });
      } else if (fill.type === 'GRADIENT_LINEAR' && fill.gradientStops) {
        paintFills.push({
          type: 'GRADIENT_LINEAR',
          gradientTransform: getGradientTransform(fill.gradientDirection as any),
          gradientStops: fill.gradientStops.map(stop => ({
            position: stop.position,
            color: { ...hexToRgb(stop.color), a: stop.opacity != null ? stop.opacity : 1 },
          })),
        });
      }
    }

    (node as GeometryMixin).fills = paintFills;
  }

  return { nodeId, success: true };
}

async function handleExportNode(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const scale = (params.scale as number) || 1;
  const format = ((params.format as string) || 'PNG').toUpperCase();

  if (!('exportAsync' in node)) throw new Error(`Node ${nodeId} cannot be exported`);

  const bytes = await (node as SceneNode).exportAsync({
    format: format as 'PNG' | 'SVG' | 'JPG',
    constraint: { type: 'SCALE', value: scale },
  });

  const base64 = figma.base64Encode(bytes);
  const mimeType = format === 'SVG' ? 'image/svg+xml' : format === 'JPG' ? 'image/jpeg' : 'image/png';

  return {
    nodeId,
    base64: `data:${mimeType};base64,${base64}`,
    width: (node as SceneNode).width,
    height: (node as SceneNode).height,
  };
}

async function handleGetScreenshot(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (!('exportAsync' in node)) throw new Error(`Node ${nodeId} cannot be exported`);

  const scale = Math.min(Math.max((params.scale as number) || 1, 0.1), 3);

  const bytes = await (node as SceneNode).exportAsync({
    format: 'PNG',
    constraint: { type: 'SCALE', value: scale },
  });

  const base64 = figma.base64Encode(bytes);

  return {
    nodeId,
    name: node.name,
    width: (node as SceneNode).width,
    height: (node as SceneNode).height,
    base64,
  };
}

async function handleGetSelection(): Promise<Record<string, unknown>> {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    return { count: 0, nodes: [] };
  }

  const nodes = selection.map(node => ({
    nodeId: node.id,
    name: node.name,
    type: node.type,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  }));

  return { count: selection.length, nodes };
}

async function handleCreateRectangle(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const element: UIElement = {
    id: 'rect',
    type: 'rectangle',
    name: (params.name as string) || 'Rectangle',
    width: (params.width as number) || 100,
    height: (params.height as number) || 100,
    x: params.x as number | undefined,
    y: params.y as number | undefined,
    fills: params.fills as UIElement['fills'] | undefined,
    stroke: params.stroke as UIElement['stroke'] | undefined,
    cornerRadius: params.cornerRadius as UIElement['cornerRadius'] | undefined,
    children: [],
  };

  const node = await createElement(element, true);
  if (!node) throw new Error('Failed to create rectangle');

  if (params.parentId) {
    const parent = figma.getNodeById(params.parentId as string);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(node);
    }
  }

  return { nodeId: node.id, name: node.name };
}

async function handleCreateEllipse(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const element: UIElement = {
    id: 'ellipse',
    type: 'ellipse',
    name: (params.name as string) || 'Ellipse',
    width: (params.width as number) || 100,
    height: (params.height as number) || 100,
    x: params.x as number | undefined,
    y: params.y as number | undefined,
    fills: params.fills as UIElement['fills'] | undefined,
    children: [],
  };

  const node = await createElement(element, true);
  if (!node) throw new Error('Failed to create ellipse');

  if (params.parentId) {
    const parent = figma.getNodeById(params.parentId as string);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(node);
    }
  }

  return { nodeId: node.id, name: node.name };
}

async function handleCreateImage(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const imageData = params.imageData as string;
  if (!imageData) throw new Error('imageData (base64) is required');

  const element: UIElement = {
    id: 'image',
    type: 'image',
    name: (params.name as string) || 'Image',
    width: (params.width as number) || 400,
    height: (params.height as number) || 300,
    x: params.x as number | undefined,
    y: params.y as number | undefined,
    generatedImage: imageData,
    cornerRadius: params.cornerRadius as UIElement['cornerRadius'] | undefined,
    scaleMode: (params.scaleMode as UIElement['scaleMode']) || 'FILL',
    children: [],
  };

  const node = await createElement(element, true);
  if (!node) throw new Error('Failed to create image');

  if (params.parentId) {
    const parent = figma.getNodeById(params.parentId as string);
    if (parent && 'appendChild' in parent) {
      const parentFrame = parent as FrameNode;
      parentFrame.appendChild(node);

      if ('layoutMode' in parentFrame && parentFrame.layoutMode !== 'NONE') {
        // Auto-layout parent: stretch image to fill via layout sizing
        (node as RectangleNode).layoutSizingHorizontal = 'FILL';
        (node as RectangleNode).layoutSizingVertical = 'FILL';
      } else {
        // No auto-layout: resize image to match parent dimensions (full-bleed)
        (node as RectangleNode).resize(parentFrame.width, parentFrame.height);
        (node as RectangleNode).x = 0;
        (node as RectangleNode).y = 0;
      }
    }
  }

  return { nodeId: node.id, name: node.name };
}

async function handleSetStroke(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node || !('strokes' in node)) throw new Error(`Node ${nodeId} not found or does not support strokes`);

  const color = params.color as string;
  const width = (params.width as number) || 1;

  if (color) {
    (node as GeometryMixin).strokes = [{ type: 'SOLID', color: hexToRgb(color) }];
    (node as GeometryMixin).strokeWeight = width;
  } else {
    (node as GeometryMixin).strokes = [];
  }

  return { nodeId, success: true };
}

async function handleSetEffects(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node || !('effects' in node)) throw new Error(`Node ${nodeId} not found or does not support effects`);

  const effects = params.effects as Array<{
    type: 'DROP_SHADOW' | 'INNER_SHADOW';
    color: string;
    opacity?: number;
    offset: { x: number; y: number };
    blur: number;
    spread?: number;
  }>;

  if (!effects || effects.length === 0) {
    (node as BlendMixin).effects = [];
    return { nodeId, success: true };
  }

  const figmaEffects: Effect[] = effects.map(e => {
    const rgb = hexToRgb(e.color);
    return {
      type: e.type,
      color: { r: rgb.r, g: rgb.g, b: rgb.b, a: e.opacity != null ? e.opacity : 0.25 },
      offset: { x: e.offset.x, y: e.offset.y },
      radius: e.blur,
      spread: e.spread || 0,
      visible: true,
      blendMode: 'NORMAL' as const,
    };
  });

  (node as BlendMixin).effects = figmaEffects;
  return { nodeId, success: true };
}

async function handleSetCornerRadius(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node || !('cornerRadius' in node)) throw new Error(`Node ${nodeId} not found or does not support corner radius`);

  const radius = params.radius as number | [number, number, number, number];
  if (Array.isArray(radius)) {
    (node as FrameNode).topLeftRadius = radius[0];
    (node as FrameNode).topRightRadius = radius[1];
    (node as FrameNode).bottomRightRadius = radius[2];
    (node as FrameNode).bottomLeftRadius = radius[3];
  } else {
    (node as FrameNode).cornerRadius = radius;
  }

  return { nodeId, success: true };
}

async function handleSetOpacity(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node || !('opacity' in node)) throw new Error(`Node ${nodeId} not found or does not support opacity`);

  (node as BlendMixin).opacity = (params.opacity as number) ?? 1;
  return { nodeId, success: true };
}

async function handleSetAutoLayout(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node || node.type !== 'FRAME') throw new Error(`Node ${nodeId} not found or is not a frame`);

  const frame = node as FrameNode;
  const mode = params.layoutMode as 'HORIZONTAL' | 'VERTICAL' | 'NONE';

  if (mode === 'NONE') {
    frame.layoutMode = 'NONE';
    return { nodeId, success: true };
  }

  frame.layoutMode = mode || 'VERTICAL';

  if (params.itemSpacing !== undefined) frame.itemSpacing = params.itemSpacing as number;
  if (params.paddingTop !== undefined) frame.paddingTop = params.paddingTop as number;
  if (params.paddingRight !== undefined) frame.paddingRight = params.paddingRight as number;
  if (params.paddingBottom !== undefined) frame.paddingBottom = params.paddingBottom as number;
  if (params.paddingLeft !== undefined) frame.paddingLeft = params.paddingLeft as number;
  if (params.primaryAxisAlignItems) frame.primaryAxisAlignItems = params.primaryAxisAlignItems as 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  if (params.counterAxisAlignItems) frame.counterAxisAlignItems = params.counterAxisAlignItems as 'MIN' | 'CENTER' | 'MAX';

  if (params.primaryAxisSizingMode !== undefined) {
    const raw = params.primaryAxisSizingMode as string;
    frame.primaryAxisSizingMode = (raw === 'HUG' ? 'AUTO' : raw) as 'FIXED' | 'AUTO';
  }
  if (params.counterAxisSizingMode !== undefined) {
    const raw = params.counterAxisSizingMode as string;
    frame.counterAxisSizingMode = (raw === 'HUG' ? 'AUTO' : raw) as 'FIXED' | 'AUTO';
  }

  return { nodeId, success: true };
}

async function handleDeleteNode(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const name = node.name;
  node.remove();

  return { deleted: true, name };
}

async function handleMoveNode(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  if (params.x !== undefined) (node as SceneNode).x = params.x as number;
  if (params.y !== undefined) (node as SceneNode).y = params.y as number;

  return { nodeId, x: (node as SceneNode).x, y: (node as SceneNode).y };
}

async function handleResizeNode(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node || !('resize' in node)) throw new Error(`Node ${nodeId} not found or cannot be resized`);

  const width = (params.width as number) || (node as SceneNode).width;
  const height = (params.height as number) || (node as SceneNode).height;
  (node as FrameNode).resize(width, height);

  return { nodeId, width, height };
}

async function handleRenameNode(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const name = (params.name as string) || 'Renamed';
  node.name = name;

  return { nodeId, name };
}

async function handleAppendChild(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const parentId = params.parentId as string;
  const childId = params.childId as string;
  if (!parentId || !childId) throw new Error('parentId and childId are required');

  const parent = figma.getNodeById(parentId);
  const child = figma.getNodeById(childId);
  if (!parent || !('appendChild' in parent)) throw new Error(`Parent ${parentId} not found or cannot have children`);
  if (!child) throw new Error(`Child ${childId} not found`);

  (parent as FrameNode).appendChild(child as SceneNode);

  return { parentId, childId, success: true };
}

async function handleReorderChild(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const parentId = params.parentId as string;
  const childId = params.childId as string;
  if (!parentId || !childId) throw new Error('parentId and childId are required');

  const parent = figma.getNodeById(parentId);
  if (!parent || !('children' in parent)) {
    throw new Error(`NODE_NOT_FOUND: Parent ${parentId} not found or cannot have children`);
  }

  const child = figma.getNodeById(childId);
  if (!child) {
    throw new Error(`NODE_NOT_FOUND: Child ${childId} not found`);
  }

  const parentFrame = parent as FrameNode;
  const childNode = child as SceneNode;

  if (childNode.parent?.id !== parentFrame.id) {
    throw new Error(`PARENT_MISMATCH: Child ${childId} is not a child of parent ${parentId}`);
  }

  const index = params.index as number | undefined;
  if (index !== undefined) {
    parentFrame.insertChild(index, childNode);
  } else {
    parentFrame.appendChild(childNode);
  }

  const newIndex = parentFrame.children.indexOf(childNode);
  return { parentId, childId, newIndex };
}

async function handleCloneNode(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node || !('clone' in node)) throw new Error(`Node not found: ${nodeId}`);

  const sourceNode = node as SceneNode;
  const clone = sourceNode.clone();

  let targetParent: FrameNode | null = null;

  if (params.parentId) {
    const target = figma.getNodeById(params.parentId as string);
    if (target && 'appendChild' in target) {
      targetParent = target as FrameNode;
      targetParent.appendChild(clone);
    }
  } else if (sourceNode.parent && sourceNode.parent.type !== 'PAGE' && 'appendChild' in sourceNode.parent) {
    targetParent = sourceNode.parent as FrameNode;
    targetParent.appendChild(clone);
  }

  // If the clone is an image placed into an auto-layout parent, set FILL sizing
  // so it stretches to cover the parent frame (e.g., background images).
  if (targetParent && 'layoutMode' in targetParent && targetParent.layoutMode !== 'NONE') {
    const isImageNode = 'fills' in clone && Array.isArray((clone as GeometryMixin).fills) &&
      ((clone as GeometryMixin).fills as ReadonlyArray<Paint>).some((f: Paint) => f.type === 'IMAGE');
    if (isImageNode && 'layoutSizingHorizontal' in clone) {
      (clone as FrameNode).layoutSizingHorizontal = 'FILL';
      (clone as FrameNode).layoutSizingVertical = 'FILL';
    }
  }

  const offsetX = (params.offsetX as number) || 0;
  const offsetY = (params.offsetY as number) || 0;
  if (offsetX !== 0 || offsetY !== 0) {
    clone.x += offsetX;
    clone.y += offsetY;
  }

  if (params.newName) {
    clone.name = params.newName as string;
  }

  return { nodeId: clone.id, name: clone.name };
}

async function handleGroupNodes(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeIds = params.nodeIds as string[];
  if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length < 2) {
    throw new Error('nodeIds must be an array with at least 2 node IDs');
  }

  const nodes: SceneNode[] = [];
  for (const id of nodeIds) {
    const node = figma.getNodeById(id);
    if (!node) throw new Error(`Node not found: ${id}`);
    nodes.push(node as SceneNode);
  }

  const parent = nodes[0].parent;
  if (!parent) throw new Error(`Node ${nodeIds[0]} has no parent`);
  for (let i = 1; i < nodes.length; i++) {
    if (nodes[i].parent !== parent) {
      throw new Error(`PARENT_MISMATCH: Nodes must share the same parent. "${nodes[i].name}" (${nodeIds[i]}) has a different parent than "${nodes[0].name}" (${nodeIds[0]})`);
    }
  }

  const group = figma.group(nodes, parent as BaseNode & ChildrenMixin);

  if (params.name) {
    group.name = params.name as string;
  }

  return { nodeId: group.id, name: group.name, childCount: group.children.length };
}

function serializeNode(node: BaseNode, currentDepth: number, maxDepth: number): Record<string, unknown> {
  const info: Record<string, unknown> = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  if ('x' in node) info.x = (node as SceneNode).x;
  if ('y' in node) info.y = (node as SceneNode).y;
  if ('width' in node) info.width = (node as SceneNode).width;
  if ('height' in node) info.height = (node as SceneNode).height;
  if ('opacity' in node) info.opacity = (node as BlendMixin).opacity;

  if ('fills' in node && Array.isArray((node as GeometryMixin).fills)) {
    const fills = (node as GeometryMixin).fills as Paint[];
    info.fills = fills.map(f => {
      if (f.type === 'SOLID') {
        return { type: 'SOLID', color: rgbToHex(f.color), opacity: f.opacity };
      }
      return { type: f.type };
    });
  }

  if ('cornerRadius' in node) info.cornerRadius = (node as RectangleNode).cornerRadius;

  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    info.characters = textNode.characters;
    info.fontSize = textNode.fontSize;
    const fontName = textNode.fontName;
    if (fontName && typeof fontName === 'object' && 'family' in fontName) {
      info.fontFamily = fontName.family;
      info.fontWeight = fontName.style;
    }
  }

  if ('layoutMode' in node) {
    const frame = node as FrameNode;
    info.layoutMode = frame.layoutMode;
    if (frame.layoutMode !== 'NONE') {
      info.itemSpacing = frame.itemSpacing;
      info.paddingLeft = frame.paddingLeft;
      info.paddingRight = frame.paddingRight;
      info.paddingTop = frame.paddingTop;
      info.paddingBottom = frame.paddingBottom;
    }
  }

  if ('children' in node) {
    const children = (node as FrameNode).children;
    info.childCount = children.length;
    if (currentDepth < maxDepth) {
      info.children = children.map(c => serializeNode(c, currentDepth + 1, maxDepth));
    } else {
      info.children = children.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
      }));
    }
  }

  return info;
}

async function handleGetNodeInfo(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const depth = (params.depth as number) || 1;
  return serializeNode(node, 0, depth);
}

async function handleGetPageNodes(): Promise<Record<string, unknown>> {
  const children = figma.currentPage.children;
  const nodes = children.map(node => ({
    nodeId: node.id,
    name: node.name,
    type: node.type,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  }));

  return { pageName: figma.currentPage.name, count: nodes.length, nodes };
}

async function handleCreateIcon(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const iconName = (params.iconName as string) || 'circle';
  const size = (params.size as number) || 24;
  const color = (params.color as string) || '#333333';
  const strokeWidth = (params.strokeWidth as number) || 2;
  const svgPaths = params.svgPaths as string[] | undefined;

  const element: UIElement = {
    id: 'icon',
    type: 'icon',
    name: (params.name as string) || `icon-${iconName}`,
    width: size,
    height: size,
    x: params.x as number | undefined,
    y: params.y as number | undefined,
    lucideIcon: iconName,
    svgPaths: svgPaths,
    strokeWeight: strokeWidth,
    fills: [{ type: 'SOLID', color }],
    children: [],
  };

  const node = await createElement(element, true);
  if (!node) throw new Error('Failed to create icon');

  if (params.parentId) {
    const parent = figma.getNodeById(params.parentId as string);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(node);
    }
  }

  return { nodeId: node.id, name: node.name };
}

/** Command-router version of scan_template (takes nodeId param) */
async function handleScanTemplateCmd(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string | undefined;

  let targetNodes: readonly SceneNode[];
  if (nodeId) {
    const node = figma.getNodeById(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    targetNodes = [node as SceneNode];
  } else {
    targetNodes = figma.currentPage.selection;
    if (targetNodes.length === 0) {
      throw new Error('No node selected and no nodeId provided. Select a frame or pass a nodeId.');
    }
  }

  const placeholders: Array<{ nodeId: string; name: string; type: 'text' | 'image'; path: string }> = [];

  function scanNode(node: SceneNode, path: string): void {
    if (node.name.startsWith('#')) {
      const placeholderName = node.name.substring(1);
      const isText = node.type === 'TEXT';

      placeholders.push({
        nodeId: node.id,
        name: placeholderName,
        type: isText ? 'text' : 'image',
        path: path + '/' + node.name,
      });
    }

    if ('children' in node) {
      const frame = node as FrameNode;
      for (const child of frame.children) {
        scanNode(child, path + '/' + node.name);
      }
    }
  }

  for (const node of targetNodes) {
    scanNode(node, '');
  }

  return { count: placeholders.length, placeholders };
}

/** Command-router version of apply_template_text (takes nodeId + content) */
async function handleApplyTemplateTextCmd(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required — the text placeholder node ID');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (node.type !== 'TEXT') throw new Error(`Node ${nodeId} is not a text node (type: ${node.type})`);

  const textNode = node as TextNode;
  const content = params.content as string;
  if (!content) throw new Error('content is required');

  const existingFont = textNode.fontName as FontName;
  try {
    await figma.loadFontAsync(existingFont);
  } catch (_e) {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  }

  textNode.characters = content;

  if (params.fontSize) textNode.fontSize = params.fontSize as number;
  if (params.color) {
    textNode.fills = [{ type: 'SOLID', color: hexToRgb(params.color as string) }];
  }
  if (params.fontFamily) {
    const family = params.fontFamily as string;
    const weight = (params.fontWeight as number) || 400;
    const style = getFontStyle(weight);
    try {
      await figma.loadFontAsync({ family, style });
      textNode.fontName = { family, style };
    } catch (_e) {
      // Keep existing font weight if load fails
    }
  }

  return { nodeId, characters: textNode.characters };
}

/** Command-router version of apply_template_image (takes nodeId + imageData) */
async function handleApplyTemplateImageCmd(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required — the image placeholder node ID');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const imageData = params.imageData as string;
  if (!imageData) throw new Error('imageData (base64) is required');

  const base64 = imageData.replace(/^data:image\/\w+;base64,/, '');
  const bytes = figma.base64Decode(base64);
  if (!bytes || bytes.length === 0) throw new Error('Failed to decode image data');

  const image = figma.createImage(bytes);
  const scaleMode = (params.scaleMode as 'FILL' | 'FIT' | 'CROP' | 'TILE') || 'FILL';

  if ('fills' in node) {
    (node as GeometryMixin).fills = [{
      type: 'IMAGE',
      imageHash: image.hash,
      scaleMode,
    }];
  } else {
    throw new Error(`Node ${nodeId} does not support image fills`);
  }

  return { nodeId, success: true };
}

/** Command-router version of create_design (takes design JSON) */
async function handleCreateDesignCmd(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const analysis = params.design as UIAnalysis;
  if (!analysis) throw new Error('design (UIAnalysis) is required');

  const frameName = (params.name as string) || 'Generated Design';

  const mainFrame = figma.createFrame();
  mainFrame.name = frameName;
  mainFrame.resize(analysis.width, analysis.height);
  mainFrame.fills = [{
    type: 'SOLID',
    color: hexToRgb(analysis.backgroundColor),
  }];

  const center = figma.viewport.center;
  mainFrame.x = center.x - analysis.width / 2;
  mainFrame.y = center.y - analysis.height / 2;

  for (const element of analysis.elements) {
    const node = await createElement(element);
    if (node) {
      mainFrame.appendChild(node);
    }
  }

  figma.currentPage.selection = [mainFrame];
  figma.viewport.scrollAndZoomIntoView([mainFrame]);

  return {
    nodeId: mainFrame.id,
    name: mainFrame.name,
    width: mainFrame.width,
    height: mainFrame.height,
    childCount: mainFrame.children.length,
  };
}

/** set_text command: update text content of an existing text node */
async function handleSetText(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (node.type !== 'TEXT') throw new Error(`Node ${nodeId} is not a text node`);

  const textNode = node as TextNode;
  const content = (params.text as string) || (params.content as string);
  if (!content) throw new Error('text content is required');

  const existingFont = textNode.fontName as FontName;
  try {
    await figma.loadFontAsync(existingFont);
  } catch (_e) {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  }

  textNode.characters = content;
  return { nodeId, characters: textNode.characters };
}

// ═══════════════════════════════════════════════════════════════
// BATCH EXECUTE HANDLER
// ═══════════════════════════════════════════════════════════════

interface BatchCommand {
  action: string;
  params: Record<string, unknown>;
  tempId?: string;
}

interface BatchResult {
  tempId?: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

function resolveTempIds(params: Record<string, unknown>, tempIdMap: Map<string, string>): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.startsWith('$')) {
      const refId = value.substring(1);
      const actualId = tempIdMap.get(refId);
      if (actualId) {
        resolved[key] = actualId;
      } else {
        resolved[key] = value;
      }
    } else if (Array.isArray(value)) {
      resolved[key] = value.map(item => {
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          return resolveTempIds(item as Record<string, unknown>, tempIdMap);
        }
        if (typeof item === 'string' && item.startsWith('$')) {
          const refId = item.substring(1);
          return tempIdMap.get(refId) || item;
        }
        return item;
      });
    } else if (typeof value === 'object' && value !== null) {
      resolved[key] = resolveTempIds(value as Record<string, unknown>, tempIdMap);
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

async function handleBatchExecute(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const commands = params.commands as BatchCommand[];
  if (!commands || !Array.isArray(commands)) {
    throw new Error('commands array is required');
  }

  const tempIdMap = new Map<string, string>();
  const results: BatchResult[] = [];

  for (const command of commands) {
    try {
      const resolvedParams = resolveTempIds(command.params || {}, tempIdMap);
      const response = await executeSingleAction(command.action, resolvedParams);

      if (command.tempId && response.nodeId) {
        tempIdMap.set(command.tempId, response.nodeId as string);
      }

      results.push({
        tempId: command.tempId,
        success: true,
        data: response,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.push({
        tempId: command.tempId,
        success: false,
        error: errorMessage,
      });
    }
  }

  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  return { results, summary: { total: results.length, succeeded, failed } };
}

async function executeSingleAction(action: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  switch (action) {
    case 'create_frame': return await handleCreateFrame(params);
    case 'create_text': return await handleCreateText(params);
    case 'set_fill': return await handleSetFill(params);
    case 'export_node': return await handleExportNode(params);
    case 'get_screenshot': return await handleGetScreenshot(params);
    case 'get_selection': return await handleGetSelection();
    case 'create_rectangle': return await handleCreateRectangle(params);
    case 'create_ellipse': return await handleCreateEllipse(params);
    case 'create_image': return await handleCreateImage(params);
    case 'set_stroke': return await handleSetStroke(params);
    case 'set_effects': return await handleSetEffects(params);
    case 'set_corner_radius': return await handleSetCornerRadius(params);
    case 'set_opacity': return await handleSetOpacity(params);
    case 'set_auto_layout': return await handleSetAutoLayout(params);
    case 'delete_node': return await handleDeleteNode(params);
    case 'move_node': return await handleMoveNode(params);
    case 'resize_node': return await handleResizeNode(params);
    case 'rename_node': return await handleRenameNode(params);
    case 'append_child': return await handleAppendChild(params);
    case 'reorder_child': return await handleReorderChild(params);
    case 'clone_node': return await handleCloneNode(params);
    case 'group_nodes': return await handleGroupNodes(params);
    case 'get_node_info': return await handleGetNodeInfo(params);
    case 'get_page_nodes': return await handleGetPageNodes();
    case 'create_design': return await handleCreateDesignCmd(params);
    case 'create_icon': return await handleCreateIcon(params);
    case 'scan_template': return await handleScanTemplateCmd(params);
    case 'apply_template_text': return await handleApplyTemplateTextCmd(params);
    case 'apply_template_image': return await handleApplyTemplateImageCmd(params);
    case 'clone_with_overrides': return await handleCloneWithOverrides(params);
    case 'set_text': return await handleSetText(params);
    default:
      throw new Error(`Unknown action in batch: ${action}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// CLONE WITH OVERRIDES HANDLER
// ═══════════════════════════════════════════════════════════════

interface CloneCopySpec {
  offsetX?: number;
  offsetY?: number;
  newName?: string;
  overrides?: Array<{
    childName: string;
    properties: {
      content?: string;
      color?: string;
      fontSize?: number;
      fontWeight?: number;
      opacity?: number;
    };
  }>;
}

function findChildByName(node: BaseNode, name: string): SceneNode | null {
  if ('children' in node) {
    for (const child of (node as FrameNode).children) {
      if (child.name === name) return child;
      const found = findChildByName(child, name);
      if (found) return found;
    }
  }
  return null;
}

async function handleCloneWithOverrides(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const node = figma.getNodeById(nodeId);
  if (!node || !('clone' in node)) throw new Error(`Node not found: ${nodeId}`);

  const copies = params.copies as CloneCopySpec[];
  if (!copies || !Array.isArray(copies) || copies.length === 0) {
    throw new Error('copies array is required and must not be empty');
  }

  const sourceNode = node as SceneNode;
  const results: Array<{ nodeId: string; name: string }> = [];

  for (const spec of copies) {
    const clone = sourceNode.clone();

    if (sourceNode.parent && sourceNode.parent.type !== 'PAGE' && 'appendChild' in sourceNode.parent) {
      (sourceNode.parent as FrameNode).appendChild(clone);
    }

    const offsetX = spec.offsetX || 0;
    const offsetY = spec.offsetY || 0;
    if (offsetX !== 0 || offsetY !== 0) {
      clone.x += offsetX;
      clone.y += offsetY;
    }

    if (spec.newName) {
      clone.name = spec.newName;
    }

    if (spec.overrides && spec.overrides.length > 0) {
      for (const override of spec.overrides) {
        const child = findChildByName(clone, override.childName);
        if (!child) continue;

        const props = override.properties;

        if (props.content !== undefined && child.type === 'TEXT') {
          const textNode = child as TextNode;
          const existingFont = textNode.fontName as FontName;
          try {
            await figma.loadFontAsync(existingFont);
          } catch (_e) {
            await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
          }
          textNode.characters = props.content;

          if (props.fontSize !== undefined) {
            textNode.fontSize = props.fontSize;
          }

          if (props.fontWeight !== undefined) {
            const family = (textNode.fontName as FontName).family;
            const style = getFontStyle(props.fontWeight);
            try {
              await figma.loadFontAsync({ family, style });
              textNode.fontName = { family, style };
            } catch (_e) {
              // Keep existing font weight if load fails
            }
          }
        }

        if (props.color !== undefined && 'fills' in child) {
          (child as GeometryMixin).fills = [{
            type: 'SOLID',
            color: hexToRgb(props.color),
          }];
        }

        if (props.opacity !== undefined && 'opacity' in child) {
          (child as BlendMixin).opacity = props.opacity;
        }
      }
    }

    results.push({ nodeId: clone.id, name: clone.name });
  }

  return { clones: results, count: results.length };
}

// ═══════════════════════════════════════════════════════════════
// SCAN FRAME STRUCTURE HANDLER
// ═══════════════════════════════════════════════════════════════

interface ScannedNode {
  nodeId: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fills?: unknown[];
  stroke?: { color: string; weight: number } | null;
  effects?: unknown[];
  cornerRadius?: number | number[];
  opacity?: number;
  layoutMode?: string;
  itemSpacing?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  text?: {
    content: string;
    fontSize: number;
    fontFamily: string;
    fontWeight: number;
    color: string;
    textAlign: string;
    lineHeight: number | 'AUTO';
  };
  children?: ScannedNode[];
}

async function handleScanFrameStructure(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nodeId = params.nodeId as string;
  if (!nodeId) throw new Error('nodeId is required');

  const maxDepth = (params.depth as number) || 5;
  const includeStyles = params.include_styles !== false;

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  function extractFills(n: SceneNode): unknown[] | undefined {
    if (!includeStyles) return undefined;
    if (!('fills' in n)) return undefined;
    const fills = n.fills;
    if (!Array.isArray(fills) || fills.length === 0) return undefined;
    return fills.map((f: Paint) => {
      if (f.type === 'SOLID') {
        return {
          type: 'SOLID',
          color: rgbToHex(f.color),
          opacity: f.opacity !== undefined ? f.opacity : 1,
        };
      }
      return { type: f.type };
    });
  }

  function extractStroke(n: SceneNode): { color: string; weight: number } | null {
    if (!includeStyles) return null;
    if (!('strokes' in n)) return null;
    const strokes = (n as GeometryMixin).strokes;
    if (!Array.isArray(strokes) || strokes.length === 0) return null;
    const first = strokes[0];
    if (first.type === 'SOLID') {
      return {
        color: rgbToHex(first.color),
        weight: ('strokeWeight' in n) ? (n as GeometryMixin).strokeWeight as number : 1,
      };
    }
    return null;
  }

  function extractEffects(n: SceneNode): unknown[] | undefined {
    if (!includeStyles) return undefined;
    if (!('effects' in n)) return undefined;
    const effects = (n as BlendMixin).effects;
    if (!Array.isArray(effects) || effects.length === 0) return undefined;
    return effects.map((e: Effect) => {
      const result: Record<string, unknown> = { type: e.type, visible: e.visible };
      if ('color' in e && e.color) {
        result.color = rgbToHex(e.color);
        result.opacity = e.color.a;
      }
      if ('offset' in e) result.offset = e.offset;
      if ('radius' in e) result.blur = e.radius;
      if ('spread' in e) result.spread = e.spread;
      return result;
    });
  }

  function extractCornerRadius(n: SceneNode): number | number[] | undefined {
    if (!includeStyles) return undefined;
    if (!('cornerRadius' in n)) return undefined;
    const cr = (n as CornerMixin).cornerRadius;
    if (cr === figma.mixed) {
      const rn = n as RectangleCornerMixin;
      return [
        rn.topLeftRadius,
        rn.topRightRadius,
        rn.bottomRightRadius,
        rn.bottomLeftRadius,
      ];
    }
    return cr;
  }

  function extractTextProps(n: TextNode): ScannedNode['text'] {
    const fontSize = n.fontSize === figma.mixed ? 16 : n.fontSize;
    let fontFamily = 'Inter';
    let fontWeight = 400;
    const fontName = n.fontName;
    if (fontName !== figma.mixed) {
      fontFamily = fontName.family;
      const style = fontName.style.toLowerCase();
      if (style.includes('bold')) fontWeight = 700;
      else if (style.includes('semibold') || style.includes('semi bold')) fontWeight = 600;
      else if (style.includes('medium')) fontWeight = 500;
      else if (style.includes('light')) fontWeight = 300;
      else if (style.includes('thin')) fontWeight = 100;
      else if (style.includes('black') || style.includes('extra bold')) fontWeight = 800;
    }

    let color = '#000000';
    const fills = n.fills;
    if (Array.isArray(fills) && fills.length > 0 && fills[0].type === 'SOLID') {
      color = rgbToHex(fills[0].color);
    }

    const textAlign = n.textAlignHorizontal || 'LEFT';

    let lineHeight: number | 'AUTO' = 'AUTO';
    const lh = n.lineHeight;
    if (lh !== figma.mixed) {
      if (lh.unit === 'PIXELS') lineHeight = lh.value;
      else if (lh.unit === 'PERCENT') lineHeight = lh.value;
    }

    return {
      content: n.characters,
      fontSize,
      fontFamily,
      fontWeight,
      color,
      textAlign,
      lineHeight,
    };
  }

  function scanNode(n: SceneNode, currentDepth: number): ScannedNode {
    const result: ScannedNode = {
      nodeId: n.id,
      name: n.name,
      type: n.type,
      x: Math.round(n.x),
      y: Math.round(n.y),
      width: Math.round(n.width),
      height: Math.round(n.height),
    };

    if (includeStyles) {
      const fills = extractFills(n);
      if (fills) result.fills = fills;

      const stroke = extractStroke(n);
      if (stroke) result.stroke = stroke;

      const effects = extractEffects(n);
      if (effects) result.effects = effects;

      const cr = extractCornerRadius(n);
      if (cr !== undefined) result.cornerRadius = cr;

      result.opacity = (n as BlendMixin).opacity;
    }

    if ('layoutMode' in n) {
      const frame = n as FrameNode;
      if (frame.layoutMode !== 'NONE') {
        result.layoutMode = frame.layoutMode;
        result.itemSpacing = frame.itemSpacing;
        result.padding = {
          top: frame.paddingTop,
          right: frame.paddingRight,
          bottom: frame.paddingBottom,
          left: frame.paddingLeft,
        };
      }
      if (frame.layoutSizingHorizontal) result.layoutSizingHorizontal = frame.layoutSizingHorizontal;
      if (frame.layoutSizingVertical) result.layoutSizingVertical = frame.layoutSizingVertical;
    }

    if (n.type === 'TEXT') {
      result.text = extractTextProps(n as TextNode);
    }

    if ('children' in n && currentDepth < maxDepth) {
      const parent = n as ChildrenMixin;
      if (parent.children.length > 0) {
        result.children = parent.children.map(child => scanNode(child as SceneNode, currentDepth + 1));
      }
    }

    return result;
  }

  return scanNode(node as SceneNode, 0) as unknown as Record<string, unknown>;
}
