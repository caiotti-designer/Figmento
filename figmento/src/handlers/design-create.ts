/// <reference types="@figma/plugin-typings" />

import { UIAnalysis, UIElement } from '../types';
import { hexToRgb } from '../color-utils';
import { createElement } from '../element-creators';
import { postCreationRefinement, countNodes } from '../refinement';
import { countElements, sendProgress as _sendProgress, delay } from '../utils/progress';

// Progress tracking for live updates
let totalElements = 0;
let createdElements = 0;

/**
 * Sends progress update to UI (thin wrapper passing module-level counters)
 */
function sendProgress(message: string) {
  _sendProgress(message, createdElements, totalElements);
}

/**
 * Creates the main design from AI analysis with live progress
 */
export async function createDesignFromAnalysis(analysis: UIAnalysis, frameName?: string): Promise<FrameNode> {
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

  // MQ-8: Post-creation structural refinement (spacing, auto-layout)
  try {
    if (countNodes(mainFrame) >= 3) {
      await postCreationRefinement(mainFrame);
    }
  } catch (err) {
    console.warn('MQ Refinement: failed silently', err);
    // Design is already created — do not re-throw
  }

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
