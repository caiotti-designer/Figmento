import {
  TextLayoutInput,
  UIAnalysis,
  UIElement,
  PluginMode,
  SocialFormat,
  SOCIAL_FORMATS,
  ColorTheme,
  COLOR_THEMES,
  FONT_OPTIONS,
  ImageRole,
  LayoutPreset,
  CarouselConfig,
  ImageGenModel,
} from '../types';
import { postMessage, showToast, safeGetItem, safeSetItem, fetchWithRetry, escapeHtml, computeToolCallProgress, toolNameToProgressMessage } from './utils';
import { modeState, apiState, imageGenState, STORAGE_KEY_MODE } from './state';
import { inferCategory, getRelevantBlueprint, formatBlueprintZones } from './blueprint-loader';
import { getRelevantReferences } from './reference-loader';
import { buildSystemPrompt } from './system-prompt';
import { FIGMENTO_TOOLS } from './tools-schema';
import {
  runToolUseLoop,
  ToolCallResult,
  AnthropicMessage,
  GeminiContent,
  ContentBlock,
  SCREENSHOT_TOOLS,
  stripBase64FromResult,
  summarizeScreenshotResult,
} from './tool-use-loop';
import { SlideDesignSystem, ToolCallLogEntry, extractDesignSystem, formatConsistencyConstraint } from './slide-utils';

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MODE UI INITIALIZATION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// Local references to DOM elements that are set once during initModeUI
let modeSelector: HTMLDivElement;
let screenshotFlow: HTMLDivElement;
let textLayoutFlow: HTMLDivElement;
let formatCards: NodeListOf<HTMLDivElement>;
let contentInput: HTMLTextAreaElement;
let referenceZone: HTMLDivElement;
let referenceInput: HTMLInputElement;
let referencePreviews: HTMLDivElement;
let fontSelect: HTMLSelectElement;
let colorPresets: HTMLDivElement;
let customHexInput: HTMLInputElement;
let generateTextDesignBtn: HTMLButtonElement;

// Navigation elements (set during selectPluginMode)
let backToHomeBtn: HTMLButtonElement;
let breadcrumb: HTMLDivElement;
let breadcrumbCurrent: HTMLSpanElement;

// Local copies of state kept in sync with the original module-scoped variables
// Mode is tracked in modeState.currentMode
let currentFormat: SocialFormat = SOCIAL_FORMATS[0];
let currentFont: string = FONT_OPTIONS[0];
let activeColorTheme: ColorTheme | string = COLOR_THEMES[0];
const referenceImages: string[] = [];
const referenceImageRoles: ImageRole[] = [];
let currentLayoutPreset: LayoutPreset = 'auto';
const carouselConfig: CarouselConfig = { enabled: false, slideCount: 'auto', slideFormat: 'square' };
let textImageGenEnabled = false;
let textImageGenModel: ImageGenModel = 'gemini-3.1-flash-image-preview';
let customStyleEnabled = false;

// Processing state
let textIsProcessing = false;
let textAbortController: AbortController | null = null;
let textProgressInterval: number | null = null;

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PENDING-COMMAND BRIDGE  (mirrors screenshot.ts / chat.ts pattern)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

interface PendingTextLayoutCommand {
  resolve: (data: Record<string, unknown>) => void;
  reject: (error: Error) => void;
}

let textLayoutCommandCounter = 0;
const pendingTextLayoutCommands = new Map<string, PendingTextLayoutCommand>();

/**
 * Sends a tool command to the Figma sandbox and returns a promise that
 * resolves when the sandbox replies. Uses the 'text-layout-' cmdId prefix
 * so index.ts can route the response to resolveTextLayoutCommand.
 */
function sendTextLayoutCommand(action: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const cmdId = `text-layout-${++textLayoutCommandCounter}-${Date.now()}`;

    const timer = setTimeout(() => {
      pendingTextLayoutCommands.delete(cmdId);
      reject(new Error(`Command timeout: ${action}`));
    }, 30000);

    pendingTextLayoutCommands.set(cmdId, {
      resolve: (data) => { clearTimeout(timer); resolve(data); },
      reject: (err) => { clearTimeout(timer); reject(err); },
    });

    postMessage({
      type: 'execute-command',
      command: {
        type: 'command',
        id: cmdId,
        channel: 'text-layout',
        action,
        params,
      },
    });
  });
}

/**
 * Resolves a pending text-layout command response.
 * Called by index.ts onCommandResult when cmdId starts with 'text-layout-'.
 */
export function resolveTextLayoutCommand(
  cmdId: string,
  success: boolean,
  data: Record<string, unknown>,
  error?: string,
): void {
  const pending = pendingTextLayoutCommands.get(cmdId);
  if (!pending) return;
  pendingTextLayoutCommands.delete(cmdId);
  if (success) {
    pending.resolve(data);
  } else {
    pending.reject(new Error(error || 'Command failed'));
  }
}

export const initModeUI = (): void => {
  modeSelector = document.getElementById('modeSelector') as HTMLDivElement;
  screenshotFlow = document.getElementById('screenshotFlow') as HTMLDivElement;
  textLayoutFlow = document.getElementById('textLayoutFlow') as HTMLDivElement;

  // Text Layout Elements
  formatCards = document.querySelectorAll('.format-card') as NodeListOf<HTMLDivElement>;
  contentInput = document.getElementById('contentInput') as HTMLTextAreaElement;
  referenceZone = document.getElementById('referenceZone') as HTMLDivElement;
  referenceInput = document.getElementById('referenceInput') as HTMLInputElement;
  referencePreviews = document.getElementById('referencePreviews') as HTMLDivElement;
  fontSelect = document.getElementById('fontSelect') as HTMLSelectElement;
  colorPresets = document.getElementById('colorPresets') as HTMLDivElement;
  customHexInput = document.getElementById('customHex') as HTMLInputElement;
  generateTextDesignBtn = document.getElementById('generateTextDesignBtn') as HTMLButtonElement;

  // Navigation
  backToHomeBtn = document.getElementById('backToHomeBtn') as HTMLButtonElement;
  breadcrumb = document.getElementById('breadcrumb') as HTMLDivElement;
  breadcrumbCurrent = document.getElementById('breadcrumbCurrent') as HTMLSpanElement;
};

export const initModeSelector = (): void => {
  document.querySelectorAll('.mode-card').forEach((card) => {
    card.addEventListener('click', () => {
      const mode = (card as HTMLElement).getAttribute('data-mode') as PluginMode;
      selectPluginMode(mode);
    });
    card.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        e.preventDefault();
        const mode = (card as HTMLElement).getAttribute('data-mode') as PluginMode;
        selectPluginMode(mode);
      }
    });
  });
};

export const selectPluginMode = (mode: PluginMode): void => {
  modeState.currentMode = mode;

  safeSetItem(STORAGE_KEY_MODE, mode);

  // Animate mode selector out
  modeSelector.classList.add('mode-exit');

  setTimeout(() => {
    modeSelector.classList.add('hidden');
    modeSelector.classList.remove('mode-exit');

    const templateFillFlow = document.getElementById('templateFillFlow') as HTMLDivElement;
    const presentationFlow = document.getElementById('presentationFlow') as HTMLDivElement;
    const heroGeneratorFlow = document.getElementById('heroGeneratorFlow') as HTMLDivElement;

    screenshotFlow.classList.add('hidden');
    textLayoutFlow.classList.add('hidden');
    if (templateFillFlow) templateFillFlow.classList.add('hidden');
    if (presentationFlow) presentationFlow.classList.add('hidden');
    if (heroGeneratorFlow) heroGeneratorFlow.classList.add('hidden');
    const adAnalyzerFlow = document.getElementById('adAnalyzerFlow') as HTMLDivElement;
    if (adAnalyzerFlow) adAnalyzerFlow.classList.add('hidden');

    if (mode === 'screenshot-to-layout') {
      screenshotFlow.classList.remove('hidden');
      postMessage({ type: 'select-mode', mode: 'screenshot-to-layout' });
    } else if (mode === 'text-to-layout') {
      textLayoutFlow.classList.remove('hidden');
      postMessage({ type: 'select-mode', mode: 'text-to-layout' });
    } else if (mode === 'template-fill') {
      if (templateFillFlow) templateFillFlow.classList.remove('hidden');
      postMessage({ type: 'select-mode', mode: 'template-fill' });
    } else if (mode === 'text-to-presentation') {
      if (presentationFlow) presentationFlow.classList.remove('hidden');
      postMessage({ type: 'select-mode', mode: 'text-to-presentation' });
    } else if (mode === 'hero-generator') {
      if (heroGeneratorFlow) heroGeneratorFlow.classList.remove('hidden');
      postMessage({ type: 'select-mode', mode: 'hero-generator' });
    } else if (mode === 'ad-analyzer') {
      if (adAnalyzerFlow) adAnalyzerFlow.classList.remove('hidden');
    }

    // Show navigation
    backToHomeBtn.classList.remove('hidden');
    breadcrumb.classList.remove('hidden');
    const modeNames: Record<PluginMode, string> = {
      'screenshot-to-layout': 'Screenshot to Layout',
      'text-to-layout': 'Text to Layout',
      'template-fill': 'Template Fill',
      'text-to-presentation': 'Text to Presentation',
      'hero-generator': 'Hero Generator',
      'ad-analyzer': 'Ad Analyzer',
    };
    breadcrumbCurrent.textContent = modeNames[mode] || mode;
  }, 200);
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// EVENT LISTENERS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export const setupModeListeners = (): void => {
  // Format selection
  const carouselOptions = document.getElementById('carouselOptions');
  formatCards.forEach((card) => {
    card.addEventListener('click', () => {
      formatCards.forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      const formatId = card.getAttribute('data-format');

      if (formatId === 'carousel') {
        carouselConfig.enabled = true;
        if (carouselOptions) carouselOptions.classList.remove('hidden');
      } else {
        carouselConfig.enabled = false;
        if (carouselOptions) carouselOptions.classList.add('hidden');
        const format = SOCIAL_FORMATS.find((f) => f.id === formatId);
        if (format) currentFormat = format;
      }
    });
  });

  // Reference images - Drag & Drop
  referenceZone.addEventListener('click', () => {
    referenceInput.click();
  });

  referenceInput.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.files) {
      Array.from(target.files).forEach(async (file) => {
        const base64 = await readImageAsBase64(file);
        addReferenceImage(base64);
      });
    }
  });

  referenceZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    referenceZone.classList.add('drag-over');
  });

  referenceZone.addEventListener('dragleave', () => {
    referenceZone.classList.remove('drag-over');
  });

  referenceZone.addEventListener('drop', (e) => {
    e.preventDefault();
    referenceZone.classList.remove('drag-over');
    if (e.dataTransfer && e.dataTransfer.files) {
      Array.from(e.dataTransfer.files).forEach(async (file) => {
        if (file.type.startsWith('image/')) {
          const base64 = await readImageAsBase64(file);
          addReferenceImage(base64);
        }
      });
    }
  });

  // Font selection
  fontSelect.addEventListener('change', () => {
    currentFont = fontSelect.value;
  });

  // Color selection
  colorPresets.querySelectorAll('.color-preset').forEach((preset) => {
    preset.addEventListener('click', () => {
      colorPresets.querySelectorAll('.color-preset').forEach((c) => c.classList.remove('selected'));
      preset.classList.add('selected');
      customHexInput.value = ''; // Clear custom hex

      const themeId = (preset as HTMLElement).getAttribute('data-theme');
      const theme = COLOR_THEMES.find((t) => t.id === themeId);
      if (theme) activeColorTheme = theme;
    });
  });

  customHexInput.addEventListener('input', (e) => {
    const hex = (e.target as HTMLInputElement).value;
    if (hex.startsWith('#') && (hex.length === 4 || hex.length === 7)) {
      colorPresets.querySelectorAll('.color-preset').forEach((c) => c.classList.remove('selected'));
      activeColorTheme = hex; // Set hex string directly
    }
  });

  // Generate Button
  generateTextDesignBtn.addEventListener('click', handleGenerateTextDesign);

  // Carousel slide count
  const slideCountBtns = document.querySelectorAll('.slide-count-btn');
  slideCountBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      slideCountBtns.forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      const count = (btn as HTMLElement).getAttribute('data-count');
      carouselConfig.slideCount = count === 'auto' ? 'auto' : parseInt(count || '3');
    });
  });

  // Carousel slide format
  const slideFormatBtns = document.querySelectorAll('.slide-format-btn');
  slideFormatBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      slideFormatBtns.forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      const fmt = (btn as HTMLElement).getAttribute('data-slide-format');
      carouselConfig.slideFormat = fmt === 'portrait' ? 'portrait' : 'square';
    });
  });

  // Layout presets
  const layoutPresetBtns = document.querySelectorAll('.layout-preset');
  layoutPresetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      layoutPresetBtns.forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      currentLayoutPreset = ((btn as HTMLElement).getAttribute('data-layout') || 'auto') as LayoutPreset;
    });
  });

  // Custom style toggle (font/color optional)
  const customStyleToggle = document.getElementById('customStyleToggle') as HTMLInputElement;
  const customStyleOptions = document.getElementById('customStyleOptions');
  if (customStyleToggle) {
    customStyleToggle.addEventListener('change', () => {
      customStyleEnabled = customStyleToggle.checked;
      if (customStyleOptions) {
        customStyleOptions.classList.toggle('hidden', !customStyleToggle.checked);
      }
    });
  }

  // Image generation toggle
  const textImageGenToggle = document.getElementById('textImageGenToggle') as HTMLInputElement;
  const textImageGenModelSelect = document.getElementById('textImageGenModel') as HTMLSelectElement;
  if (textImageGenToggle) {
    textImageGenToggle.addEventListener('change', () => {
      textImageGenEnabled = textImageGenToggle.checked;
      if (textImageGenModelSelect) {
        textImageGenModelSelect.classList.toggle('hidden', !textImageGenToggle.checked);
      }
    });
  }
  if (textImageGenModelSelect) {
    textImageGenModelSelect.addEventListener('change', () => {
      textImageGenModel = textImageGenModelSelect.value as ImageGenModel;
    });
  }

  // Cancel button
  const textCancelBtn = document.getElementById('textCancelBtn');
  if (textCancelBtn) {
    textCancelBtn.addEventListener('click', cancelTextProcessing);
  }

  // New design button
  const textNewDesignBtn = document.getElementById('textNewDesignBtn');
  if (textNewDesignBtn) {
    textNewDesignBtn.addEventListener('click', resetTextProcessing);
  }
};

export const addReferenceImage = (base64: string): void => {
  if (referenceImages.length >= 3) return; // Max 3 references

  const imageIndex = referenceImages.length;
  referenceImages.push(base64);
  referenceImageRoles.push('style');

  // Create wrapper with image and role toggle
  const wrapper = document.createElement('div');
  wrapper.className = 'ref-preview-wrapper';

  const img = document.createElement('img');
  img.src = base64;
  img.className = 'ref-preview';
  wrapper.appendChild(img);

  const roleBtn = document.createElement('button');
  roleBtn.className = 'ref-role-toggle';
  roleBtn.textContent = 'Style';
  roleBtn.title = 'Click to toggle: Style reference or Content image';
  const idx = imageIndex;
  roleBtn.addEventListener('click', () => {
    if (referenceImageRoles[idx] === 'style') {
      referenceImageRoles[idx] = 'content';
      roleBtn.textContent = 'Content';
      roleBtn.classList.add('content');
    } else {
      referenceImageRoles[idx] = 'style';
      roleBtn.textContent = 'Style';
      roleBtn.classList.remove('content');
    }
  });
  wrapper.appendChild(roleBtn);

  referencePreviews.appendChild(wrapper);

  // Update UI text
  if (referenceImages.length > 0) {
    (referenceZone.querySelector('.reference-text') as HTMLElement).innerText =
      referenceImages.length + ' image(s) added';
  }
};

export const readImageAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TEXT-TO-LAYOUT: FUNCTION-CALLING MESSAGE BUILDERS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/** Map apiState.currentProvider to runToolUseLoop provider string. */
function getTextLayoutProvider(): 'claude' | 'gemini' | 'openai' {
  const p = apiState.currentProvider as string;
  if (p === 'gemini') return 'gemini';
  if (p === 'openai') return 'openai';
  return 'claude';
}

/** Get the active model string for the current provider. */
function getTextLayoutModel(): string {
  const p = apiState.currentProvider as string;
  if (p === 'gemini') return apiState.geminiModel;
  if (p === 'openai') return apiState.openaiModel;
  return apiState.claudeModel;
}

/**
 * Assembles the text instruction for the AI:
 * format + font + colors + layout preset + blueprint zones + reference notes + content brief.
 */
function buildTextLayoutInstruction(input: TextLayoutInput): string {
  const parts: string[] = [];

  // Format
  parts.push(`Target format: ${input.format.name} (${input.format.width}Ã—${input.format.height}px). Start with create_frame using these exact dimensions.`);

  // Soft constraints from user options
  const constraints: string[] = [];
  if (input.colorTheme) {
    constraints.push(`Color theme: ${input.colorTheme.name || String(input.colorTheme)}`);
  }
  if (input.customHex) {
    constraints.push(`Brand color: ${input.customHex}`);
  }
  if (input.font) {
    constraints.push(`Font preference: ${input.font}`);
  }
  if (input.layoutPreset) {
    constraints.push(`Layout preset: ${input.layoutPreset}`);
  }
  if (constraints.length > 0) {
    parts.push(`Design preferences: ${constraints.join('. ')}.`);
  }

  // Blueprint zone injection
  const category = inferCategory(input);
  if (category) {
    const blueprint = getRelevantBlueprint(category);
    if (blueprint) {
      const zones = formatBlueprintZones(blueprint, input.format.height);
      parts.push(`Layout blueprint (${blueprint.name}): ${zones}`);
    }
  }

  // Reference composition notes
  const refs = getRelevantReferences(category || 'social', undefined, undefined, 1);
  if (refs.length > 0 && refs[0].composition_notes) {
    const ref = refs[0];
    const notes: string[] = [];
    if (ref.composition_notes?.zones) notes.push(`Zones: ${ref.composition_notes.zones}`);
    if (ref.composition_notes?.typography_scale) notes.push(`Typography scale: ${ref.composition_notes.typography_scale}`);
    if (notes.length > 0) {
      parts.push(`Reference composition (${ref.layout}): ${notes.join('. ')}`);
    }
  }

  // User content brief
  parts.push(`\nContent brief:\n${input.content}`);

  // Tool instruction
  parts.push(`\nUse the available design tools to build this design. Do NOT return JSON or text descriptions â€” call create_frame, create_text, set_fill, set_auto_layout, etc. directly. End with run_refinement_check if you created 5 or more elements.`);

  return parts.join('\n');
}

/**
 * Builds the initial messages array for runToolUseLoop.
 * Includes optional reference images as vision blocks for all 3 providers.
 */
function buildTextLayoutInitialMessages(
  input: TextLayoutInput,
  provider: 'claude' | 'gemini' | 'openai',
): AnthropicMessage[] | GeminiContent[] | Array<Record<string, unknown>> {
  const instruction = buildTextLayoutInstruction(input);
  const hasImages = input.referenceImages && input.referenceImages.length > 0;

  if (provider === 'gemini') {
    const parts: Array<Record<string, unknown>> = [];
    if (hasImages) {
      for (const img of input.referenceImages!) {
        const match = img.base64.match(/^data:([^;]+);base64,(.+)$/);
        const mimeType = match ? match[1] : 'image/jpeg';
        const rawBase64 = match ? match[2] : img.base64;
        parts.push({ inlineData: { mimeType, data: rawBase64 } });
      }
    }
    parts.push({ text: instruction });
    return [{ role: 'user', parts }] as GeminiContent[];
  }

  if (provider === 'openai') {
    const content: Array<Record<string, unknown>> = [];
    if (hasImages) {
      for (const img of input.referenceImages!) {
        content.push({ type: 'image_url', image_url: { url: img.base64 } });
      }
    }
    content.push({ type: 'text', text: instruction });
    return [{ role: 'user', content }];
  }

  // Anthropic (claude)
  const content: ContentBlock[] = [];
  if (hasImages) {
    for (const img of input.referenceImages!) {
      const match = img.base64.match(/^data:([^;]+);base64,(.+)$/);
      const mimeType = match ? match[1] : 'image/jpeg';
      const rawBase64 = match ? match[2] : img.base64;
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: mimeType, data: rawBase64 },
      } as unknown as ContentBlock);
    }
  }
  content.push({ type: 'text', text: instruction });
  return [{ role: 'user', content }] as AnthropicMessage[];
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CAROUSEL: SLIDE BUILDERS (FC-6)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

type CarouselSlideType = 'cover' | 'content' | 'cta';

function getCarouselSlideType(slideIndex: number, totalSlides: number): CarouselSlideType {
  if (slideIndex === 0) return 'cover';
  if (slideIndex === totalSlides - 1) return 'cta';
  return 'content';
}

/**
 * Parses a topic string into a per-slide narrative outline.
 * Handles both: "Topic: [item1, item2...]" and plain topic strings.
 */
function parseCarouselOutline(content: string, slideCount: number): string[] {
  // Look for bracket-enclosed list: "Topic: [item1, item2, item3]"
  const bracketMatch = content.match(/\[([^\]]+)\]/);
  if (bracketMatch) {
    const items = bracketMatch[1].split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
    if (items.length > 0) {
      const outline: string[] = [];
      // Cover: topic (text before the bracket)
      const topicPart = content.slice(0, bracketMatch.index).trim().replace(/:$/, '').trim();
      outline.push(topicPart || content.slice(0, 80));
      // Middle slides: one item each
      for (let i = 0; i < Math.min(items.length, slideCount - 2); i++) {
        outline.push(items[i]);
      }
      // CTA slide
      outline.push('Call to action');
      return outline;
    }
  }
  // No structured outline â€” return generic per-slide labels
  return Array.from({ length: slideCount }, (_, i) => {
    if (i === 0) return content.slice(0, 120);
    if (i === slideCount - 1) return 'Call to action';
    return `Point ${i} of ${slideCount - 2}`;
  });
}

function buildCarouselSlideInstruction(
  content: string,
  slideType: CarouselSlideType,
  slideIndex: number,
  totalSlides: number,
  slideWidth: number,
  slideHeight: number,
  designSystem: SlideDesignSystem | null,
  font: string,
  colorTheme: string | null,
): string {
  const outline = parseCarouselOutline(content, totalSlides);
  const slideContent = outline[slideIndex] || content.slice(0, 120);
  const parts: string[] = [];

  parts.push(`You are creating slide ${slideIndex + 1} of ${totalSlides} for a social media carousel.`);
  parts.push(`Format: ${slideWidth}Ã—${slideHeight}px${slideHeight > slideWidth ? ' (portrait 4:5)' : ' (square)'}. Start with create_frame using these exact dimensions.`);
  parts.push(`Mobile-first: All primary text must be â‰¥48px. Secondary text â‰¥32px. Avoid text below 28px.`);
  parts.push(`Maximum 2-3 text elements per slide. Keep messaging focused.`);

  const typeInstructions: Record<CarouselSlideType, string> = {
    cover: `This is the COVER slide (slide 1). Content: "${slideContent}". Create an eye-catching hook that makes users want to swipe. Establish the brand identity: bold headline, strong background, visual hook. Add a subtle "swipe â†’" or arrow indicator.`,
    content: `This is a CONTENT slide. Content: "${slideContent}". One idea per slide. Clear, focused messaging. Add a slide indicator (${slideIndex + 1}/${totalSlides}) and a subtle swipe arrow on non-final slides.`,
    cta: `This is the final CTA slide. Content: "${slideContent}". Echo the cover's visual treatment with a bold closing statement or action prompt (follow, save, share, link in bio). Make it visually complete.`,
  };
  parts.push(typeInstructions[slideType]);

  // Design constraints
  if (font) parts.push(`Font (mandatory for all text): ${font}`);
  if (colorTheme) parts.push(`Color theme: ${colorTheme}`);

  // Cross-slide consistency (slides 2+)
  if (designSystem) {
    const constraint = formatConsistencyConstraint(designSystem);
    if (constraint) {
      parts.push(`Visual consistency â€” slide 1 established: ${constraint}. Use the same visual system across all slides.`);
    }
  }

  parts.push(`\nDo NOT return JSON. Use design tools (create_frame, create_text, set_fill, set_auto_layout, create_icon, etc.) to build this slide directly.`);

  return parts.join('\n');
}

function buildCarouselSlideInitialMessages(
  content: string,
  slideType: CarouselSlideType,
  slideIndex: number,
  totalSlides: number,
  slideWidth: number,
  slideHeight: number,
  designSystem: SlideDesignSystem | null,
  font: string,
  colorTheme: string | null,
  provider: 'claude' | 'gemini' | 'openai',
): AnthropicMessage[] | GeminiContent[] | Array<Record<string, unknown>> {
  const instruction = buildCarouselSlideInstruction(
    content, slideType, slideIndex, totalSlides,
    slideWidth, slideHeight, designSystem, font, colorTheme,
  );

  if (provider === 'gemini') {
    return [{ role: 'user', parts: [{ text: instruction }] }] as GeminiContent[];
  }
  if (provider === 'openai') {
    return [{ role: 'user', content: [{ type: 'text', text: instruction }] }];
  }
  // Anthropic
  return [{
    role: 'user',
    content: [{ type: 'text', text: instruction } as ContentBlock],
  }] as AnthropicMessage[];
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TEXT-TO-LAYOUT: PROGRESS TRACKING
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export const setTextProgress = (percent: number, message?: string): void => {
  const bar = document.getElementById('textProcessingBar') as HTMLElement;
  const status = document.getElementById('textProcessingStatus') as HTMLElement;
  if (bar) bar.style.width = percent + '%';
  if (status && message) {
    status.innerHTML = '<span>' + escapeHtml(message) + ' ' + percent.toFixed(0) + '%</span>';
  }
};

export const simulateTextProgress = (startPercent: number, endPercent: number, durationMs: number): void => {
  stopTextSimulation();
  const startTime = Date.now();

  textProgressInterval = window.setInterval(() => {
    if (!textIsProcessing) {
      stopTextSimulation();
      return;
    }
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    // Ease-out curve
    const eased = 1 - Math.pow(1 - progress, 3);
    const currentPercent = startPercent + (endPercent - startPercent) * eased;
    setTextProgress(currentPercent, 'Analyzing content...');

    if (progress >= 1) {
      stopTextSimulation();
    }
  }, 100);
};

export const stopTextSimulation = (): void => {
  if (textProgressInterval) {
    clearInterval(textProgressInterval);
    textProgressInterval = null;
  }
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TEXT-TO-LAYOUT: MAIN FLOW
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export const handleGenerateTextDesign = async (): Promise<void> => {
  const content = contentInput.value.trim();
  if (!content) {
    showToast('Please enter content for your design', 'warning');
    return;
  }

  const apiKey = apiState.savedApiKeys[apiState.currentProvider];
  if (!apiKey) {
    showToast('Please configure your API key in Settings', 'warning');
    return;
  }

  // Show processing UI
  textIsProcessing = true;
  textAbortController = new AbortController();
  if (generateTextDesignBtn) generateTextDesignBtn.disabled = true;

  const textProcessingContainer = document.getElementById('textProcessingContainer');
  const textFormContainer = document.getElementById('textFormContainer');
  const textSuccessContainer = document.getElementById('textProcessingSuccess');

  if (textFormContainer) textFormContainer.classList.add('hidden');
  if (textProcessingContainer) textProcessingContainer.classList.remove('hidden');
  if (textSuccessContainer) textSuccessContainer.classList.add('hidden');

  // Prepare input
  const input: TextLayoutInput = {
    content,
    format: carouselConfig.enabled
      ? {
        id: 'carousel',
        name: 'Carousel',
        width: 1080,
        height: carouselConfig.slideFormat === 'portrait' ? 1350 : 1080,
      }
      : currentFormat,
    font: customStyleEnabled ? currentFont : '',
    colorTheme: customStyleEnabled
      ? typeof activeColorTheme === 'object'
        ? (activeColorTheme as ColorTheme)
        : null
      : null,
    customHex: customStyleEnabled ? (typeof activeColorTheme === 'string' ? activeColorTheme : undefined) : undefined,
    referenceImages: referenceImages.map((img, idx) => ({
      base64: img,
      role: (referenceImageRoles[idx] || 'style') as ImageRole,
    })),
    layoutPreset: currentLayoutPreset,
    carousel: carouselConfig.enabled ? carouselConfig : undefined,
    imageGenEnabled: textImageGenEnabled,
    imageGenModel: textImageGenModel,
  };

  // Step 1: Preparing
  setTextProgress(0, 'Preparing content...');

  // Small delay before starting analysis
  await new Promise((resolve) => setTimeout(resolve, 100));

  if (!textIsProcessing) return;

  try {
    // Carousel mode â€” per-slide runToolUseLoop (FC-6)
    if (input.carousel?.enabled) {
      const slideWidth = input.format.width;
      const slideHeight = input.format.height;
      const slideCount = typeof input.carousel.slideCount === 'number'
        ? input.carousel.slideCount
        : 4; // default when 'auto'
      const carouselFont = input.font || '';
      const carouselColorTheme = input.colorTheme
        ? (typeof input.colorTheme === 'string' ? input.colorTheme : (input.colorTheme as any).name || null)
        : null;

      const provider = getTextLayoutProvider();
      const model = getTextLayoutModel();
      const slideFrameIds: string[] = [];
      let carouselDesignSystem: SlideDesignSystem | null = null;

      for (let i = 0; i < slideCount; i++) {
        if (!textIsProcessing) return;

        const slideLabel = `Slide ${i + 1} of ${slideCount}`;
        setTextProgress(
          Math.round((i / slideCount) * 90),
          `${slideLabel} â€” Preparing...`,
        );

        const slideType = getCarouselSlideType(i, slideCount);
        const slide1Log: ToolCallLogEntry[] = [];
        let toolCallCount = 0;

        const messages = buildCarouselSlideInitialMessages(
          input.content, slideType, i, slideCount,
          slideWidth, slideHeight, carouselDesignSystem,
          carouselFont, carouselColorTheme, provider,
        );

        await runToolUseLoop({
          provider,
          apiKey,
          model,
          systemPrompt: buildSystemPrompt(),
          tools: FIGMENTO_TOOLS,
          messages,
          maxIterations: 30,
          onToolCall: async (name: string, args: Record<string, unknown>): Promise<ToolCallResult> => {
            try {
              const data = await sendTextLayoutCommand(name, args);
              if (name === 'create_frame' && data.nodeId) {
                slideFrameIds.push(data.nodeId as string);
              }
              if (i === 0) {
                slide1Log.push({ name, args, result: data });
              }
              const content2 = SCREENSHOT_TOOLS.has(name)
                ? summarizeScreenshotResult(name, data)
                : JSON.stringify(stripBase64FromResult(data));
              return { content: content2, is_error: false };
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Unknown error';
              return { content: msg, is_error: true };
            }
          },
          onProgress: (_message: string, toolName?: string) => {
            if (toolName) {
              toolCallCount++;
              const toolPercent = computeToolCallProgress(toolCallCount);
              const sliceStart = Math.round((i / slideCount) * 90);
              const sliceEnd = Math.round(((i + 1) / slideCount) * 90);
              const slicedPercent = Math.round(sliceStart + (toolPercent / 100) * (sliceEnd - sliceStart));
              setTextProgress(
                slicedPercent,
                `Slide ${i + 1}/${slideCount} â€” ${toolNameToProgressMessage(toolName, 'text-layout')}`,
              );
            }
          },
          onTextChunk: () => {},
        });

        if (i === 0) {
          carouselDesignSystem = extractDesignSystem(slide1Log);
        }
      }

      if (!textIsProcessing) return;

      // Post-process: position slides side-by-side (40px gap)
      setTextProgress(92, 'Positioning slides...');
      for (let i = 0; i < slideFrameIds.length; i++) {
        const frameId = slideFrameIds[i];
        if (frameId) {
          try {
            await sendTextLayoutCommand('move_node', {
              nodeId: frameId,
              x: i * (slideWidth + 40),
              y: 0,
            });
          } catch (_e) {
            // Non-critical
          }
        }
      }

      setTextProgress(100, 'Complete!');
      setTimeout(() => showTextSuccess(), 500);
      return;
    }

    // Single design â€” function-calling via runToolUseLoop (FC-3)
    const provider = getTextLayoutProvider();
    const model = getTextLayoutModel();
    const messages = buildTextLayoutInitialMessages(input, provider);
    let toolCallCount = 0;

    setTextProgress(5, 'Starting design...');

    await runToolUseLoop({
      provider,
      apiKey,
      model,
      systemPrompt: buildSystemPrompt(),
      tools: FIGMENTO_TOOLS,
      messages,
      onToolCall: async (name: string, args: Record<string, unknown>): Promise<ToolCallResult> => {
        try {
          const data = await sendTextLayoutCommand(name, args);
          const content = SCREENSHOT_TOOLS.has(name)
            ? summarizeScreenshotResult(name, data)
            : JSON.stringify(stripBase64FromResult(data));
          return { content, is_error: false };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          return { content: msg, is_error: true };
        }
      },
      onProgress: (_message: string, toolName?: string) => {
        if (toolName) {
          toolCallCount++;
          const percent = computeToolCallProgress(toolCallCount);
          setTextProgress(percent, toolNameToProgressMessage(toolName, 'text-layout'));
        }
      },
      onTextChunk: () => { /* text-to-layout mode has no streaming text UI */ },
    });

    if (!textIsProcessing) return;

    setTextProgress(100, 'Complete!');
    setTimeout(() => showTextSuccess(), 500);
  } catch (error: any) {
    if (!textIsProcessing || error.message === 'Cancelled') return;

    stopTextSimulation();
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';

    if (error.name === 'AbortError') {
      showToast('Request cancelled', 'warning');
    } else {
      showToast(errorMessage, 'error', 4000, () => handleGenerateTextDesign());
      console.error('Text layout error:', errorMessage);
    }

    if (generateTextDesignBtn) generateTextDesignBtn.disabled = false;
    resetTextProcessing();
  }
};

export const showTextSuccess = (): void => {
  textIsProcessing = false;
  textAbortController = null;

  const textProcessingContainer = document.getElementById('textProcessingContainer');
  const textSuccessContainer = document.getElementById('textProcessingSuccess');

  if (textProcessingContainer) textProcessingContainer.classList.add('hidden');
  if (textSuccessContainer) textSuccessContainer.classList.remove('hidden');
};

export const resetTextProcessing = (): void => {
  textIsProcessing = false;
  textAbortController = null;
  stopTextSimulation();

  const textProcessingContainer = document.getElementById('textProcessingContainer');
  const textFormContainer = document.getElementById('textFormContainer');
  const textSuccessContainer = document.getElementById('textProcessingSuccess');

  if (textProcessingContainer) textProcessingContainer.classList.add('hidden');
  if (textSuccessContainer) textSuccessContainer.classList.add('hidden');
  if (textFormContainer) textFormContainer.classList.remove('hidden');
};

export const cancelTextProcessing = (): void => {
  if (textAbortController) {
    textAbortController.abort();
  }
  resetTextProcessing();
  showToast('Processing cancelled', 'warning');
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SCROLL SPY
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export const setupTextFlowScrollSpy = (): void => {
  const textFlowScroll = document.getElementById('textFlowScroll');
  const textFlowSteps = document.querySelectorAll('.text-flow-step');
  const textSections = document.querySelectorAll('.text-section');

  if (!textFlowScroll || textFlowSteps.length === 0) return;

  textFlowScroll.addEventListener('scroll', () => {
    const scrollTop = textFlowScroll!.scrollTop;
    let currentSection = 'format';

    textSections.forEach((section) => {
      const el = section as HTMLElement;
      if (el.offsetTop - 20 <= scrollTop) {
        currentSection = el.getAttribute('data-section') || 'format';
      }
    });

    textFlowSteps.forEach((step) => {
      const stepSection = (step as HTMLElement).getAttribute('data-section');
      if (stepSection === currentSection) {
        step.classList.add('active');
      } else {
        step.classList.remove('active');
      }
    });
  });

  // Click to scroll to section
  textFlowSteps.forEach((step) => {
    step.addEventListener('click', () => {
      const sectionName = (step as HTMLElement).getAttribute('data-section');
      const targetSection = document.querySelector('.text-section[data-section="' + sectionName + '"]') as HTMLElement;
      if (targetSection && textFlowScroll) {
        textFlowScroll.scrollTo({ top: targetSection.offsetTop - 8, behavior: 'smooth' });
      }
    });
  });
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SAVED MODE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export const getSavedMode = (): PluginMode | null => {
  const saved = safeGetItem(STORAGE_KEY_MODE);
  return saved as PluginMode | null;
};
