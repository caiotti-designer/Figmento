/// <reference types="@figma/plugin-typings" />

import { PluginMessage } from './types';
import { rgbToHex, isContrastingColor } from './color-utils';
import { classifyError } from './utils/error-classifier';
import { handleStorageMessage, autoSnapshotAfterCommand, SNAPSHOT_WORTHY_COMMANDS, SNAPSHOTS_STORAGE_KEY } from './handlers/storage';
import { handleSettingsMessage, loadSavedApiKeys } from './handlers/settings';
import { executeCommand } from './handlers/command-router';
import { createDesignFromAnalysis } from './handlers/design-create';
import { handleGetSelectedImage, createReferenceImage, scanTemplateFrames, applyTemplateText, applyTemplateImage } from './handlers/templates';
import { handleScanDesignSystem, getDesignSystemCache } from './handlers/design-system-discovery';

// Show plugin UI
figma.showUI(__html__, { width: 450, height: 820 });

// Load saved API keys when plugin starts
loadSavedApiKeys();

// FN-6: Load cached design system on startup and send to UI
(async () => {
  try {
    const dsCache = await getDesignSystemCache();
    if (dsCache) {
      figma.ui.postMessage({ type: 'design-system-scanned', cache: dsCache });
    }
  } catch (_e) {
    // Non-critical — UI will show "no cache" state
  }
})();

// Handle messages from UI
figma.ui.onmessage = async function (msg: PluginMessage) {
  // Delegate to storage handlers (snapshots, corrections, preferences, learning config)
  if (await handleStorageMessage(msg)) return;
  // Delegate to settings handlers (API keys, validation, settings, memory, feedback)
  if (await handleSettingsMessage(msg)) return;

  switch (msg.type) {
    case 'get-selection': {
      const sel = figma.currentPage.selection.map(n => ({
        id: n.id, name: n.name, type: n.type,
        width: Math.round(n.width), height: Math.round(n.height),
      }));
      figma.ui.postMessage({ type: 'selection-changed', selection: sel });
      break;
    }

    case 'save-theme':
      await figma.clientStorage.setAsync('figmento-theme', (msg as any).theme);
      break;

    case 'get-theme': {
      const savedTheme = await figma.clientStorage.getAsync('figmento-theme');
      if (savedTheme) {
        figma.ui.postMessage({ type: 'load-theme', theme: savedTheme });
      }
      break;
    }

    // FN-16: "Use My Design System" toggle persistence
    case 'save-ds-toggle': {
      await figma.clientStorage.setAsync('figmento-use-design-system', (msg as any).enabled);
      break;
    }
    case 'load-ds-toggle': {
      const dsToggle = await figma.clientStorage.getAsync('figmento-use-design-system');
      figma.ui.postMessage({ type: 'ds-toggle-loaded', enabled: dsToggle !== false });
      break;
    }
    case 'set-auto-bind-variables': {
      await figma.clientStorage.setAsync('figmento-auto-bind-variables', (msg as any).enabled);
      break;
    }

    // DX-1: Bridge channel persistence
    case 'save-bridge-channel': {
      await figma.clientStorage.setAsync('figmento-bridge-channel', (msg as any).channel);
      break;
    }
    case 'load-bridge-channel': {
      const savedChannel = await figma.clientStorage.getAsync('figmento-bridge-channel');
      figma.ui.postMessage({ type: 'bridge-channel-loaded', channel: savedChannel || '' });
      break;
    }

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

    case 'execute-command':
      try {
        const cmd = (msg as any).command;
        const cmdResult = await executeCommand(cmd);
        figma.ui.postMessage({
          type: 'command-result',
          response: cmdResult,
        });
        // Auto-snapshot after successful canvas commands (fire-and-forget)
        if (cmdResult.success && SNAPSHOT_WORTHY_COMMANDS.has(cmd?.action)) {
          autoSnapshotAfterCommand(
            cmd.action,
            (cmd.params as Record<string, unknown>) || {},
            (cmdResult.data as Record<string, unknown>) || {}
          ).catch(() => {});
        }
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

    case 'scan-design-system':
      try {
        figma.notify('Scanning design system...', { timeout: 2000 });
        const dsCache = await handleScanDesignSystem();
        figma.ui.postMessage({ type: 'design-system-scanned', cache: dsCache });
        const compCount = dsCache.components.length;
        const varCount = dsCache.variables.length;
        const styleCount = dsCache.paintStyles.length + dsCache.textStyles.length + dsCache.effectStyles.length;
        figma.notify(`Found ${compCount} components, ${varCount} variables, ${styleCount} styles`, { timeout: 3000 });
      } catch (error) {
        const scanErrorMsg = error instanceof Error ? error.message : 'Scan failed';
        figma.ui.postMessage({ type: 'design-system-scanned', cache: null, error: scanErrorMsg });
        figma.notify('Design system scan failed: ' + scanErrorMsg, { error: true });
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

    // IS-8: Place image from Image Studio (no relay needed)
    case 'place-studio-image':
      try {
        const studioBase64: string = (msg as any).imageBase64;
        const studioMime: string = (msg as any).mimeType || 'image/png';
        const studioName: string = (msg as any).name || 'Image Studio';
        const studioW: number = (msg as any).width || 512;
        const studioH: number = (msg as any).height || 512;

        const stFrame = figma.createFrame();
        stFrame.name = studioName;
        stFrame.resize(studioW, studioH);

        const stBytes = figma.base64Decode(studioBase64);
        const stImg = figma.createImage(stBytes);
        stFrame.fills = [{ type: 'IMAGE', imageHash: stImg.hash, scaleMode: 'FILL' }];

        const stCenter = figma.viewport.center;
        stFrame.x = Math.round(stCenter.x - studioW / 2);
        stFrame.y = Math.round(stCenter.y - studioH / 2);

        figma.currentPage.selection = [stFrame];
        figma.viewport.scrollAndZoomIntoView([stFrame]);

        figma.ui.postMessage({ type: 'studio-image-placed', nodeId: stFrame.id });
        figma.notify('Image placed on canvas', { timeout: 2000 });
      } catch (error) {
        const stErr = error instanceof Error ? error.message : 'Unknown error';
        figma.ui.postMessage({ type: 'studio-image-error', error: stErr });
        figma.notify('Error placing image: ' + stErr, { error: true });
      }
      break;

  }
};

// ── MF-5: Selection change → notify UI ──────────────────────────────────────
figma.on('selectionchange', () => {
  const sel = figma.currentPage.selection.map(n => ({
    id: n.id, name: n.name, type: n.type,
    width: Math.round(n.width), height: Math.round(n.height),
  }));
  figma.ui.postMessage({ type: 'selection-changed', selection: sel });
});

// ── Page change: clear all snapshots ─────────────────────────────────────────
figma.on('currentpagechange', () => {
  figma.clientStorage.setAsync(SNAPSHOTS_STORAGE_KEY, {}).catch(() => {});
  figma.ui.postMessage({ type: 'snapshots-cleared' });
});
