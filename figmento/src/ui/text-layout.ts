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
import { postMessage, showToast, safeGetItem, safeSetItem, fetchWithRetry, escapeHtml } from './utils';
import { fetchAllIcons } from './icons';
import { collectImageElements, generateWithGeminiImage } from './images';
import { modeState, apiState, imageGenState, STORAGE_KEY_MODE } from './state';

// ═══════════════════════════════════════════════════════════════
// VALIDATION HELPERS (inline until api.ts module exists)
// ═══════════════════════════════════════════════════════════════

/**
 * Validates and fixes an analysis object, clamping dimensions and
 * recursively sanitising every element.  This is a local copy kept
 * until the shared `api` module is extracted.
 */
const validateAndFixAnalysis = (analysis: UIAnalysis): UIAnalysis => {
  analysis.width = Math.max(1, Math.min(4096, analysis.width));
  analysis.height = Math.max(1, Math.min(4096, analysis.height));

  const fixElement = (el: any, _parentW: number, _parentH: number): void => {
    if (!el) return;
    if (typeof el.width !== 'number' || el.width <= 0) el.width = 100;
    if (typeof el.height !== 'number' || el.height <= 0) el.height = 40;
    el.width = Math.min(el.width, 4096);
    el.height = Math.min(el.height, 4096);
    if (typeof el.x === 'number') el.x = Math.max(-2000, Math.min(4096, el.x));
    if (typeof el.y === 'number') el.y = Math.max(-2000, Math.min(4096, el.y));
    if (el.text) {
      if (typeof el.text.fontSize !== 'number' || el.text.fontSize <= 0) el.text.fontSize = 16;
      el.text.fontSize = Math.min(el.text.fontSize, 500);
    }
    if (!Array.isArray(el.children)) el.children = [];
    for (let i = 0; i < el.children.length; i++) {
      fixElement(el.children[i], el.width, el.height);
    }
  };

  if (Array.isArray(analysis.elements)) {
    for (let i = 0; i < analysis.elements.length; i++) {
      fixElement(analysis.elements[i], analysis.width, analysis.height);
    }
  }
  return analysis;
};

// ═══════════════════════════════════════════════════════════════
// MODE UI INITIALIZATION
// ═══════════════════════════════════════════════════════════════

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
let textImageGenModel: ImageGenModel = 'gemini-3-pro-image-preview';
let customStyleEnabled = false;

// Processing state
let textIsProcessing = false;
let textAbortController: AbortController | null = null;
let textProgressInterval: number | null = null;

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
    };
    breadcrumbCurrent.textContent = modeNames[mode] || mode;
  }, 200);
};

// ═══════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// TEXT-TO-LAYOUT: COMPREHENSIVE PROMPT
// ═══════════════════════════════════════════════════════════════

export const TEXT_LAYOUT_PROMPT = [
  'You are a professional social media design engine. Your task is to create stunning, high-converting ad layouts from text content.',
  'Generate a pixel-perfect Figma-compatible JSON layout that is immediately usable as a social media post.',
  '',
  '# OUTPUT FORMAT',
  'Return ONLY valid JSON with this structure:',
  '{',
  '  "structure": {',
  '    "headline": "extracted/generated headline",',
  '    "subheadline": "optional subheadline",',
  '    "body": ["body text paragraphs"],',
  '    "cta": "call-to-action text"',
  '  },',
  '  "design": {',
  '    "width": number,',
  '    "height": number,',
  '    "backgroundColor": "#hex",',
  '    "elements": [Element, ...]',
  '  }',
  '}',
  '',
  '# ELEMENT SCHEMA',
  'Element = {',
  '  "id": string,',
  '  "type": "frame" | "text" | "image" | "icon" | "ellipse" | "rectangle",',
  '  "name": string,',
  '  "x"?: number, "y"?: number,  // Position relative to PARENT (omit for auto-layout children)',
  '  "width": number, "height": number,',
  '  "children": Element[],  // REQUIRED, use [] if empty',
  '',
  '  // Optional properties:',
  '  "fills"?: [{"type": "SOLID", "color": "#hex", "opacity"?: 0-1} | {"type": "GRADIENT_LINEAR", "gradientStops": [{"position": 0-1, "color": "#hex", "opacity"?: 0-1}]}],',
  '  "stroke"?: {"color": "#hex", "width": number},',
  '  "cornerRadius"?: number | [topLeft, topRight, bottomRight, bottomLeft],',
  '  "opacity"?: 0-1,',
  '  "clipsContent"?: boolean,',
  '  "effects"?: [{"type": "DROP_SHADOW", "color": "#hex", "opacity": 0-1, "offset": {"x": n, "y": n}, "blur": n, "spread"?: n}],',
  '',
  '  // Auto-layout (for frame containers):',
  '  "layoutMode"?: "HORIZONTAL" | "VERTICAL",',
  '  "itemSpacing"?: number,',
  '  "paddingTop"?: n, "paddingRight"?: n, "paddingBottom"?: n, "paddingLeft"?: n,',
  '  "primaryAxisAlignItems"?: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN",',
  '  "counterAxisAlignItems"?: "MIN" | "CENTER" | "MAX",',
  '  "layoutSizingHorizontal"?: "FIXED" | "FILL" | "HUG",',
  '  "layoutSizingVertical"?: "FIXED" | "FILL" | "HUG",',
  '  "layoutPositioning"?: "ABSOLUTE",  // Break out of parent auto-layout',
  '',
  '  // Text only:',
  '  "text"?: {',
  '    "content": string, "fontSize": number, "fontWeight": 100-900, "fontFamily": "Google Font name",',
  '    "color": "#hex", "textAlign"?: "LEFT"|"CENTER"|"RIGHT", "lineHeight"?: number|"AUTO", "letterSpacing"?: number,',
  '    "segments"?: [{"text": string, "fontWeight"?: number, "fontSize"?: number, "color"?: "#hex"}]',
  '  },',
  '',
  '  // Image only:',
  '  "imageDescription"?: string,  // Detailed visual description for AI image generation',
  '',
  '  // Icon only:',
  '  "lucideIcon"?: string  // Valid Lucide icon name',
  '}',
  '',
  '# DESIGN PRINCIPLES',
  '',
  '## Visual Hierarchy',
  '- Use size, weight, and color contrast to establish clear reading order',
  '- Headlines should be the dominant visual element',
  '- CTA buttons must stand out with high-contrast colors and generous padding',
  '- Use the F-pattern or Z-pattern for content flow depending on format',
  '',
  '## Typography Scale',
  '- Hero/Headline: 48-80px, fontWeight 700-900',
  '- Subheadline: 24-36px, fontWeight 500-600',
  '- Body text: 16-24px, fontWeight 400',
  '- Caption/Small: 12-16px, fontWeight 300-400',
  '- ALWAYS maintain clear size contrast between hierarchy levels (minimum 1.5x ratio)',
  '',
  '## Spacing & Whitespace',
  '- Minimum padding from edges: 60px (gives breathing room)',
  '- Use generous itemSpacing between sections (32-60px)',
  '- Tighter spacing within related groups (12-24px)',
  '- The 60-30-10 rule: 60% whitespace/background, 30% content, 10% accent',
  '',
  '## CTA Design',
  '- Position in the bottom third of the design for maximum visibility',
  '- Use high-contrast fill color (accent or primary)',
  '- Generous padding: minimum 16px vertical, 32px horizontal',
  '- Corner radius 8-16px for modern feel, or fully rounded (height/2) for pill shape',
  '- Text should be 16-20px, fontWeight 600-700',
  '- Add subtle shadow effect for depth',
  '',
  '## Color Usage',
  '- Follow the 60-30-10 rule: 60% dominant (background), 30% secondary, 10% accent',
  '- Text color must have sufficient contrast against background (WCAG AA minimum)',
  '- Use gradient backgrounds for modern, dynamic feel',
  '- Accent colors for CTA buttons and key highlights only',
  '',
  '## Decorative Elements',
  '- Add geometric shapes (circles, rectangles) as decorative accents',
  '- Use semi-transparent overlays for depth',
  '- Consider gradient backgrounds or gradient overlays',
  '- Subtle shadows on cards/buttons for elevation',
  '- Use ellipse elements for circular decorations',
  '',
  '# LAYOUT PATTERNS',
  '',
  '## Centered Layout',
  '- Main content vertically and horizontally centered',
  '- Equal padding top and bottom',
  '- Text typically center-aligned',
  '- Best for: announcements, quotes, simple CTAs',
  '',
  '## Split Layout (Left/Right)',
  '- Two-column design: image on one side, text on other',
  '- Use HORIZONTAL layoutMode on the main container',
  '- Each column gets roughly 50% width',
  '- Best for: product features, before/after, comparisons',
  '',
  '## Top-Heavy Layout',
  '- Large headline or image occupying top 60%',
  '- Supporting text and CTA in bottom 40%',
  '- Strong visual anchor at the top',
  '- Best for: hero announcements, product launches',
  '',
  '## Bottom-Heavy Layout',
  '- Content and context in top portion',
  '- Large CTA area or key message at bottom',
  '- Builds to the action/conclusion',
  '- Best for: promotional offers, sign-up CTAs',
  '',
  '# FORMAT-SPECIFIC RULES',
  '',
  '## Instagram Post (1080x1350)',
  '- Vertical format, leverage the height for content flow',
  '- Top 200px: logo/brand area',
  '- Middle: main content with large headline',
  '- Bottom 300px: CTA and supporting info',
  '- Feed crop shows center 1080x1080 square - ensure key content is visible there',
  '',
  '## Instagram Square (1080x1080)',
  '- Compact layout, every pixel counts',
  '- Center the most important message',
  '- Reduce spacing compared to taller formats',
  '- Headline 40-60px to fit the format',
  '',
  '## Instagram Story (1080x1920)',
  '- AVOID top 250px (profile/close buttons overlay)',
  '- AVOID bottom 250px (reply/share bar overlay)',
  '- Safe content area: 1080x1420 centered vertically',
  '- Use full-bleed backgrounds with overlays',
  '- Larger text sizes (56-80px headlines) for thumb-scrolling visibility',
  '',
  '## Twitter/X (1600x900)',
  '- Landscape format, text-heavy works well',
  '- Use HORIZONTAL split layouts effectively',
  '- Headline 36-56px (wider format means less vertical height)',
  '- Keep key content in center 80% (edges may crop on mobile)',
  '',
  '## LinkedIn (1200x627)',
  '- Professional, clean aesthetic',
  '- Headline 32-48px (shorter format)',
  '- Logo placement: top-left or bottom-right corner',
  '- Muted colors, clear typography, minimal decorative elements',
  '',
  '## Facebook (1080x1350)',
  '- Same dimensions as Instagram Post',
  '- Engagement-focused: question-based headlines, bold statements',
  '- High-contrast CTA buttons',
  '',
  '# ELEMENT CONSTRUCTION RULES',
  '',
  '## Auto-Layout (use as DEFAULT)',
  '- Set "layoutMode": "HORIZONTAL" or "VERTICAL" on parent frames',
  '- Children flow automatically - do NOT set x/y on auto-layout children',
  '- Use "layoutSizingHorizontal": "FILL" for stretching to fill width',
  '- Use "layoutSizingVertical": "HUG" for shrink-wrapping content',
  '- Text in auto-layout: typically "layoutSizingHorizontal": "FILL", "layoutSizingVertical": "HUG"',
  '',
  '## Absolute Positioning (for overlapping elements ONLY)',
  '- Set x, y relative to PARENT frame',
  '- Use "layoutPositioning": "ABSOLUTE" if inside an auto-layout parent',
  '- Use for: background images, overlays, decorative shapes, floating badges',
  '',
  '## Text Elements',
  '- NO fills on text elements - color goes in text.color ONLY',
  '- Use \\n for line breaks within text content',
  '- Text in auto-layout MUST have "layoutSizingHorizontal": "FILL", "layoutSizingVertical": "HUG"',
  '- Use "segments" only when mixing font weights within the same text block',
  '- Measure lineHeight precisely (typically fontSize * 1.2-1.5)',
  '',
  '## Frames (containers)',
  '- Use for any container: sections, buttons, cards, rows, columns',
  '- Transparent by default (omit fills if background shows through)',
  '- Add fills for solid backgrounds, stroke for borders',
  '- Use cornerRadius for rounded elements',
  '',
  '## Images',
  '- Use for photos, illustrations, backgrounds, hero visuals',
  '- "imageDescription": describe the desired visual precisely for AI image generation',
  '- Include: subject, colors, composition, style, mood, camera angle',
  '- For background images: make them full-width/height of the parent',
  '',
  '## Icons (Lucide library)',
  'Valid names: message-circle, message-square, mail, phone, send, arrow-right, arrow-left,',
  'arrow-up, arrow-down, chevron-right, chevron-left, chevron-up, chevron-down, plus, minus,',
  'x, check, search, settings, menu, edit, trash-2, share, external-link, instagram, facebook,',
  'twitter, linkedin, youtube, globe, heart, star, home, calendar, clock, bell, zap, sun, moon,',
  'user, play, pause, shopping-cart, download, upload, eye, lock, unlock, image, camera, map-pin',
  '- For brand logos NOT in this list, use type "image" with imageDescription instead',
  '',
  '## Rectangles & Ellipses',
  '- Use for decorative shapes, overlays, dividers, circular accents',
  '- Semi-transparent overlays: use fills with opacity < 1',
  '- Circles: use ellipse with equal width/height',
  '',
  '# COMPLETE EXAMPLES',
  '',
  '## Example 1: Instagram Post - Product Launch',
  '{',
  '  "structure": {"headline": "New Collection\\nDrops Friday", "body": ["Premium materials. Timeless design."], "cta": "Shop Now"},',
  '  "design": {',
  '    "width": 1080, "height": 1350, "backgroundColor": "#1A1A2E",',
  '    "elements": [',
  '      {"id": "bg-accent", "type": "ellipse", "name": "Decorative Circle", "x": 700, "y": -200, "width": 600, "height": 600, "fills": [{"type": "SOLID", "color": "#E94560", "opacity": 0.15}], "layoutPositioning": "ABSOLUTE", "children": []},',
  '      {"id": "main", "type": "frame", "name": "Content", "width": 1080, "height": 1350, "layoutMode": "VERTICAL", "paddingTop": 120, "paddingBottom": 100, "paddingLeft": 80, "paddingRight": 80, "itemSpacing": 40, "primaryAxisAlignItems": "CENTER", "counterAxisAlignItems": "CENTER", "layoutSizingHorizontal": "FILL", "layoutSizingVertical": "FILL",',
  '        "children": [',
  '          {"id": "spacer-top", "type": "frame", "name": "Spacer", "width": 100, "height": 200, "layoutSizingHorizontal": "FILL", "layoutSizingVertical": "FILL", "children": []},',
  '          {"id": "headline", "type": "text", "name": "Headline", "width": 920, "height": 160, "layoutSizingHorizontal": "FILL", "layoutSizingVertical": "HUG", "text": {"content": "New Collection\\nDrops Friday", "fontSize": 64, "fontWeight": 700, "fontFamily": "Montserrat", "color": "#FFFFFF", "textAlign": "CENTER", "lineHeight": 76}, "children": []},',
  '          {"id": "body", "type": "text", "name": "Body", "width": 920, "height": 30, "layoutSizingHorizontal": "FILL", "layoutSizingVertical": "HUG", "text": {"content": "Premium materials. Timeless design.", "fontSize": 20, "fontWeight": 400, "fontFamily": "Montserrat", "color": "#B0B0B0", "textAlign": "CENTER"}, "children": []},',
  '          {"id": "spacer-mid", "type": "frame", "name": "Spacer", "width": 100, "height": 60, "layoutSizingHorizontal": "FILL", "layoutSizingVertical": "FILL", "children": []},',
  '          {"id": "cta", "type": "frame", "name": "CTA Button", "width": 280, "height": 60, "cornerRadius": 30, "fills": [{"type": "SOLID", "color": "#E94560"}], "layoutMode": "HORIZONTAL", "paddingLeft": 40, "paddingRight": 40, "primaryAxisAlignItems": "CENTER", "counterAxisAlignItems": "CENTER", "effects": [{"type": "DROP_SHADOW", "color": "#E94560", "opacity": 0.3, "offset": {"x": 0, "y": 8}, "blur": 24}],',
  '            "children": [',
  '              {"id": "cta-text", "type": "text", "name": "CTA Label", "width": 120, "height": 24, "layoutSizingHorizontal": "HUG", "layoutSizingVertical": "HUG", "text": {"content": "Shop Now", "fontSize": 18, "fontWeight": 600, "fontFamily": "Montserrat", "color": "#FFFFFF", "textAlign": "CENTER"}, "children": []}',
  '            ]',
  '          },',
  '          {"id": "spacer-bot", "type": "frame", "name": "Spacer", "width": 100, "height": 100, "layoutSizingHorizontal": "FILL", "layoutSizingVertical": "FILL", "children": []}',
  '        ]',
  '      }',
  '    ]',
  '  }',
  '}',
  '',
  '## Example 2: LinkedIn - Professional Announcement',
  '{',
  '  "structure": {"headline": "We\'re Hiring", "subheadline": "Senior Software Engineers", "body": ["Join our team building the future of AI-powered design tools."], "cta": "Apply Now"},',
  '  "design": {',
  '    "width": 1200, "height": 627, "backgroundColor": "#FFFFFF",',
  '    "elements": [',
  '      {"id": "left-bar", "type": "rectangle", "name": "Accent Bar", "x": 0, "y": 0, "width": 8, "height": 627, "fills": [{"type": "SOLID", "color": "#0077B6"}], "layoutPositioning": "ABSOLUTE", "children": []},',
  '      {"id": "main", "type": "frame", "name": "Content", "width": 1200, "height": 627, "layoutMode": "VERTICAL", "paddingTop": 80, "paddingBottom": 60, "paddingLeft": 80, "paddingRight": 80, "itemSpacing": 20, "primaryAxisAlignItems": "MIN", "counterAxisAlignItems": "MIN", "layoutSizingHorizontal": "FILL", "layoutSizingVertical": "FILL",',
  '        "children": [',
  '          {"id": "headline", "type": "text", "name": "Headline", "width": 1040, "height": 56, "layoutSizingHorizontal": "FILL", "layoutSizingVertical": "HUG", "text": {"content": "We\'re Hiring", "fontSize": 48, "fontWeight": 700, "fontFamily": "Inter", "color": "#1A1A1A", "lineHeight": 56}, "children": []},',
  '          {"id": "subhead", "type": "text", "name": "Subheadline", "width": 1040, "height": 36, "layoutSizingHorizontal": "FILL", "layoutSizingVertical": "HUG", "text": {"content": "Senior Software Engineers", "fontSize": 28, "fontWeight": 500, "fontFamily": "Inter", "color": "#0077B6", "lineHeight": 36}, "children": []},',
  '          {"id": "divider", "type": "rectangle", "name": "Divider", "width": 60, "height": 3, "fills": [{"type": "SOLID", "color": "#0077B6"}], "children": []},',
  '          {"id": "body", "type": "text", "name": "Body", "width": 800, "height": 60, "layoutSizingHorizontal": "FILL", "layoutSizingVertical": "HUG", "text": {"content": "Join our team building the future of\\nAI-powered design tools.", "fontSize": 18, "fontWeight": 400, "fontFamily": "Inter", "color": "#555555", "lineHeight": 28}, "children": []},',
  '          {"id": "spacer", "type": "frame", "name": "Spacer", "width": 100, "height": 20, "layoutSizingHorizontal": "FILL", "layoutSizingVertical": "FILL", "children": []},',
  '          {"id": "cta", "type": "frame", "name": "CTA Button", "width": 200, "height": 50, "cornerRadius": 8, "fills": [{"type": "SOLID", "color": "#0077B6"}], "layoutMode": "HORIZONTAL", "paddingLeft": 32, "paddingRight": 32, "primaryAxisAlignItems": "CENTER", "counterAxisAlignItems": "CENTER",',
  '            "children": [',
  '              {"id": "cta-text", "type": "text", "name": "CTA Label", "width": 100, "height": 22, "layoutSizingHorizontal": "HUG", "layoutSizingVertical": "HUG", "text": {"content": "Apply Now", "fontSize": 16, "fontWeight": 600, "fontFamily": "Inter", "color": "#FFFFFF"}, "children": []}',
  '            ]',
  '          }',
  '        ]',
  '      }',
  '    ]',
  '  }',
  '}',
  '',
  '## Example 3: Instagram Story - Event Promo with Background Image',
  '{',
  '  "structure": {"headline": "Summer Music Festival", "body": ["3 Days of Live Music", "July 15-17, 2025"], "cta": "Get Tickets"},',
  '  "design": {',
  '    "width": 1080, "height": 1920, "backgroundColor": "#0D0D0D",',
  '    "elements": [',
  '      {"id": "bg-img", "type": "image", "name": "Background", "x": 0, "y": 0, "width": 1080, "height": 1920, "imageDescription": "Energetic concert crowd with colorful stage lights, purple and blue tones, bokeh effects, night atmosphere", "layoutPositioning": "ABSOLUTE", "children": []},',
  '      {"id": "overlay", "type": "rectangle", "name": "Gradient Overlay", "x": 0, "y": 0, "width": 1080, "height": 1920, "fills": [{"type": "GRADIENT_LINEAR", "gradientStops": [{"position": 0, "color": "#000000", "opacity": 0.2}, {"position": 0.6, "color": "#000000", "opacity": 0.6}, {"position": 1, "color": "#000000", "opacity": 0.9}]}], "layoutPositioning": "ABSOLUTE", "children": []},',
  '      {"id": "content", "type": "frame", "name": "Content", "width": 1080, "height": 1920, "layoutMode": "VERTICAL", "paddingTop": 400, "paddingBottom": 350, "paddingLeft": 80, "paddingRight": 80, "itemSpacing": 24, "primaryAxisAlignItems": "MAX", "counterAxisAlignItems": "CENTER", "layoutSizingHorizontal": "FILL", "layoutSizingVertical": "FILL",',
  '        "children": [',
  '          {"id": "spacer", "type": "frame", "name": "Spacer", "width": 100, "height": 100, "layoutSizingHorizontal": "FILL", "layoutSizingVertical": "FILL", "children": []},',
  '          {"id": "headline", "type": "text", "name": "Headline", "width": 920, "height": 180, "layoutSizingHorizontal": "FILL", "layoutSizingVertical": "HUG", "text": {"content": "Summer\\nMusic\\nFestival", "fontSize": 72, "fontWeight": 900, "fontFamily": "Bebas Neue", "color": "#FFFFFF", "textAlign": "CENTER", "lineHeight": 80, "letterSpacing": 2}, "children": []},',
  '          {"id": "details", "type": "text", "name": "Details", "width": 920, "height": 60, "layoutSizingHorizontal": "FILL", "layoutSizingVertical": "HUG", "text": {"content": "3 Days of Live Music\\nJuly 15-17, 2025", "fontSize": 20, "fontWeight": 400, "fontFamily": "Bebas Neue", "color": "#E0E0E0", "textAlign": "CENTER", "lineHeight": 30}, "children": []},',
  '          {"id": "cta", "type": "frame", "name": "CTA Button", "width": 260, "height": 56, "cornerRadius": 28, "fills": [{"type": "SOLID", "color": "#FF6B6B"}], "layoutMode": "HORIZONTAL", "paddingLeft": 40, "paddingRight": 40, "primaryAxisAlignItems": "CENTER", "counterAxisAlignItems": "CENTER",',
  '            "children": [',
  '              {"id": "cta-text", "type": "text", "name": "CTA Label", "width": 120, "height": 22, "layoutSizingHorizontal": "HUG", "layoutSizingVertical": "HUG", "text": {"content": "Get Tickets", "fontSize": 18, "fontWeight": 700, "fontFamily": "Bebas Neue", "color": "#FFFFFF", "textAlign": "CENTER"}, "children": []}',
  '            ]',
  '          }',
  '        ]',
  '      }',
  '    ]',
  '  }',
  '}',
  '',
  '# STRICT RULES',
  '1. Return ONLY valid JSON. No explanations, no code blocks, no markdown.',
  '2. NO fills on text elements - color goes in text.color ONLY',
  '3. POSITIONS RELATIVE TO PARENT - not the canvas',
  '4. AUTO-LAYOUT children: no x/y, use layoutSizingHorizontal/Vertical instead',
  '5. TEXT IN AUTO-LAYOUT: MUST have "layoutSizingHorizontal": "FILL", "layoutSizingVertical": "HUG"',
  '6. Z-ORDER: elements array order = back to front (background first, foreground last)',
  '7. Every element MUST have "children": [] even if empty',
  '8. Use auto-layout as the DEFAULT - only use absolute positioning for overlapping/background elements',
  '9. ALL text.fontFamily MUST use the user-specified font (injected below)',
  '10. Colors MUST match the user-specified theme/colors (injected below)',
  '11. Include decorative elements (geometric shapes, gradients, overlays) for visual interest',
  '12. Design must be immediately usable as a social media post without modification',
  '13. NEVER use widths smaller than 100px for text elements in auto-layout - use FILL sizing',
  '14. CTA buttons must have generous padding and high-contrast colors',
].join('\n');

// ═══════════════════════════════════════════════════════════════
// TEXT-TO-LAYOUT: PROMPT BUILDERS
// ═══════════════════════════════════════════════════════════════

export const getTextLayoutPrompt = (input: TextLayoutInput): string => {
  const parts: string[] = [TEXT_LAYOUT_PROMPT];

  // User-specific context
  parts.push('');
  parts.push('═══════════════════════════════════════════════════════════════');
  parts.push('# USER REQUIREMENTS');
  parts.push('═══════════════════════════════════════════════════════════════');
  parts.push('');

  // Format
  parts.push('## FORMAT');
  parts.push('Create a ' + input.format.name + ' design: ' + input.format.width + 'x' + input.format.height + 'px');
  parts.push('The design JSON "width" MUST be ' + input.format.width + ' and "height" MUST be ' + input.format.height);
  parts.push('');

  // Font enforcement
  if (input.font) {
    parts.push('## FONT (MANDATORY)');
    parts.push('ALL text elements MUST use fontFamily: "' + input.font + '"');
    parts.push('Use these weight distributions:');
    parts.push('- Headlines: fontWeight 700-900');
    parts.push('- Subheadlines: fontWeight 500-600');
    parts.push('- Body text: fontWeight 400');
    parts.push('- Captions/small: fontWeight 300-400');
  } else {
    parts.push('## FONT');
    parts.push('Choose a professional, modern font family that best matches the content mood and style.');
    parts.push('If reference images are provided, match their typography style.');
    parts.push('Use appropriate weight distributions for visual hierarchy.');
  }
  parts.push('');

  // Color enforcement
  if (input.colorTheme) {
    parts.push('## COLORS (MANDATORY)');
    parts.push('Use this EXACT color theme:');
    parts.push('- Primary (headlines, key text): ' + input.colorTheme.primary);
    parts.push('- Secondary (subheadlines, supporting): ' + input.colorTheme.secondary);
    parts.push('- Accent (CTA buttons, highlights): ' + input.colorTheme.accent);
    parts.push('- Background: ' + input.colorTheme.background);
    parts.push('- Text (body): ' + input.colorTheme.text);
    parts.push('Set "backgroundColor" to "' + input.colorTheme.background + '"');
  } else if (input.customHex) {
    parts.push('## COLORS (MANDATORY)');
    parts.push('User specified primary color: ' + input.customHex);
    parts.push('Derive a harmonious palette from this color:');
    parts.push('- Use it as the primary/accent color for headlines and CTA');
    parts.push('- Generate complementary background and text colors');
    parts.push('- Ensure sufficient contrast for readability');
  } else {
    parts.push('## COLORS');
    parts.push('Choose a professional, visually striking color scheme appropriate for the content.');
    parts.push('If reference images are provided, extract and match their color palette.');
    parts.push('Ensure high contrast and readability.');
  }
  parts.push('');

  // Layout preset
  if (input.layoutPreset && input.layoutPreset !== 'auto') {
    parts.push('## LAYOUT STYLE (MANDATORY)');
    switch (input.layoutPreset) {
      case 'centered':
        parts.push(
          'Use a CENTERED layout: content vertically and horizontally centered, equal padding, center-aligned text.'
        );
        break;
      case 'split-left':
        parts.push(
          'Use a SPLIT-LEFT layout: image/visual on the LEFT side, text content on the RIGHT side. Use HORIZONTAL layoutMode on main container.'
        );
        break;
      case 'split-right':
        parts.push(
          'Use a SPLIT-RIGHT layout: text content on the LEFT side, image/visual on the RIGHT side. Use HORIZONTAL layoutMode on main container.'
        );
        break;
      case 'top-heavy':
        parts.push(
          'Use a TOP-HEAVY layout: large headline or visual in the top 60%, supporting text and CTA in the bottom 40%.'
        );
        break;
      case 'bottom-heavy':
        parts.push(
          'Use a BOTTOM-HEAVY layout: context and content in the top portion, large CTA area and key message at the bottom.'
        );
        break;
    }
    parts.push('');
  }

  // Reference images
  if (input.referenceImages && input.referenceImages.length > 0) {
    parts.push('## REFERENCE IMAGES');
    let styleRefs = 0;
    let contentRefs = 0;
    for (let i = 0; i < input.referenceImages.length; i++) {
      const role = referenceImageRoles[i] || 'style';
      if (role === 'style') {
        styleRefs++;
      } else {
        contentRefs++;
      }
    }
    if (styleRefs > 0) {
      parts.push('STYLE REFERENCES (' + styleRefs + ' images): These images show the DESIRED AESTHETIC.');
      parts.push('- Extract: color palette, layout structure, typography style, visual weight distribution, mood');
      parts.push('- Match their spacing, balance, and visual hierarchy');
      parts.push('- Do NOT copy text or specific elements from them');
      parts.push('- Create an ORIGINAL layout inspired by this aesthetic');
    }
    if (contentRefs > 0) {
      parts.push('CONTENT IMAGES (' + contentRefs + ' images): These are actual images to PLACE in the design.');
      parts.push('- Include "image" type elements for each content image');
      parts.push('- Use descriptive "imageDescription" that matches the provided image');
      parts.push('- Position them prominently as key visual elements');
      parts.push('- Tag them as "content-image-1", "content-image-2", etc. in the element name');
    }
    parts.push('');
  }

  // Content
  parts.push('## CONTENT TO DESIGN');
  parts.push('Parse the following content and create a compelling social media design layout:');
  parts.push('"""');
  parts.push(input.content);
  parts.push('"""');
  parts.push('');
  parts.push('Intelligently parse this content into headline, subheadline, body, and CTA.');
  parts.push('If no clear CTA exists in the content, suggest an appropriate one.');
  parts.push('Use the content language as-is (do NOT translate).');

  return parts.join('\n');
};

export const getCarouselPrompt = (input: TextLayoutInput): string => {
  const slideWidth = input.carousel && input.carousel.slideFormat === 'portrait' ? 1080 : 1080;
  const slideHeight = input.carousel && input.carousel.slideFormat === 'portrait' ? 1350 : 1080;
  const slideCount = input.carousel && input.carousel.slideCount !== 'auto' ? input.carousel.slideCount : null;

  const parts: string[] = [TEXT_LAYOUT_PROMPT];

  parts.push('');
  parts.push('═══════════════════════════════════════════════════════════════');
  parts.push('# CAROUSEL MODE - MULTI-SLIDE DESIGN');
  parts.push('═══════════════════════════════════════════════════════════════');
  parts.push('');
  parts.push('Create an Instagram CAROUSEL with multiple slides.');
  parts.push('Each slide is ' + slideWidth + 'x' + slideHeight + 'px.');
  if (slideCount) {
    parts.push('Create EXACTLY ' + slideCount + ' slides.');
  } else {
    parts.push('Determine the optimal number of slides (2-10) based on the content length and structure.');
  }
  parts.push('');

  parts.push('## CAROUSEL OUTPUT FORMAT');
  parts.push('Return JSON with this structure:');
  parts.push('{');
  parts.push('  "designSystem": {');
  parts.push('    "primaryColor": "#hex",');
  parts.push('    "secondaryColor": "#hex",');
  parts.push('    "accentColor": "#hex",');
  parts.push('    "backgroundColor": "#hex",');
  parts.push('    "textColor": "#hex",');
  parts.push('    "fontFamily": "' + (input.font || 'chosen-font') + '"');
  parts.push('  },');
  parts.push('  "slides": [');
  parts.push(
    '    {"width": ' + slideWidth + ', "height": ' + slideHeight + ', "backgroundColor": "#hex", "elements": [...]},'
  );
  parts.push('    ...');
  parts.push('  ]');
  parts.push('}');
  parts.push('');

  parts.push('## CAROUSEL DESIGN RULES');
  parts.push('1. SLIDE 1 (Hook): Bold headline, attention-grabbing visual. This is the cover slide.');
  parts.push('2. MIDDLE SLIDES: One key point per slide. Clear, focused messaging.');
  parts.push('3. LAST SLIDE: Strong CTA with action button and contact/next-step info.');
  parts.push('4. CONSISTENCY: All slides must use the SAME design system (colors, fonts, spacing patterns).');
  parts.push('5. VISUAL FLOW: Include a subtle "swipe" indicator (arrow-right icon or dots) on non-final slides.');
  parts.push('6. SLIDE INDICATORS: Add slide number dots at the bottom of each slide (small ellipses).');
  parts.push('7. BALANCE: Each slide should be visually complete on its own, but part of a series.');
  parts.push('8. PROGRESSION: Content should build logically from slide to slide.');
  parts.push('');

  // Font enforcement
  if (input.font) {
    parts.push('## FONT (MANDATORY)');
    parts.push('ALL text across ALL slides MUST use fontFamily: "' + input.font + '"');
  } else {
    parts.push('## FONT');
    parts.push('Choose a professional, modern font family that matches the content mood.');
    parts.push('If reference images are provided, match their typography style.');
    parts.push('Use the SAME font across ALL slides for consistency.');
  }
  parts.push('');

  // Color enforcement
  if (input.colorTheme) {
    parts.push('## COLORS (MANDATORY)');
    parts.push('Use this EXACT color theme across all slides:');
    parts.push('- Primary: ' + input.colorTheme.primary);
    parts.push('- Secondary: ' + input.colorTheme.secondary);
    parts.push('- Accent: ' + input.colorTheme.accent);
    parts.push('- Background: ' + input.colorTheme.background);
    parts.push('- Text: ' + input.colorTheme.text);
  } else if (input.customHex) {
    parts.push('## COLORS (MANDATORY)');
    parts.push('Primary/accent color: ' + input.customHex);
    parts.push('Derive a consistent palette and use it across ALL slides.');
  } else {
    parts.push('## COLORS');
    parts.push('Choose a professional, visually striking color scheme appropriate for the content.');
    parts.push('If reference images are provided, extract and match their color palette.');
    parts.push('Apply consistently across all slides.');
  }
  parts.push('');

  // Content
  parts.push('## CONTENT TO DISTRIBUTE ACROSS SLIDES');
  parts.push('"""');
  parts.push(input.content);
  parts.push('"""');
  parts.push('');
  parts.push('Parse this content and distribute it intelligently across slides.');
  parts.push('Each slide should contain one clear message or point.');
  parts.push('Do NOT translate - use content language as-is.');

  return parts.join('\n');
};

// ═══════════════════════════════════════════════════════════════
// TEXT-TO-LAYOUT: MULTI-PROVIDER API CALLS
// ═══════════════════════════════════════════════════════════════

export const analyzeTextDesign = async (input: TextLayoutInput, apiKey: string): Promise<UIAnalysis> => {
  const isCarousel = input.carousel && input.carousel.enabled;
  const prompt = isCarousel ? getCarouselPrompt(input) : getTextLayoutPrompt(input);

  // Build image parts from reference images
  const images: { base64: string; role: ImageRole }[] = [];
  if (input.referenceImages) {
    for (let i = 0; i < input.referenceImages.length; i++) {
      images.push({
        base64: input.referenceImages[i].base64,
        role: input.referenceImages[i].role,
      });
    }
  }

  if (apiState.currentProvider === 'claude') {
    return analyzeTextWithClaudeProvider(prompt, images, apiKey);
  } else if (apiState.currentProvider === 'gemini') {
    return analyzeTextWithGeminiProvider(prompt, images, apiKey);
  } else {
    return analyzeTextWithOpenAIProvider(prompt, images, apiKey);
  }
};

const analyzeTextWithClaudeProvider = async (
  prompt: string,
  images: { base64: string; role: ImageRole }[],
  apiKey: string
): Promise<UIAnalysis> => {
  const content: any[] = [];

  // Add reference images
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const base64Data = img.base64.replace(/^data:image\/\w+;base64,/, '');
    const mediaTypeMatch = img.base64.match(/^data:(image\/\w+);base64,/);
    const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : 'image/png';
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: base64Data,
      },
    });
  }

  // Add text prompt
  content.push({ type: 'text', text: prompt });

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: apiState.claudeModel,
      max_tokens: 32768,
      messages: [{ role: 'user', content }],
    }),
  };

  if (textAbortController) {
    fetchOptions.signal = textAbortController.signal;
  }

  const response = await fetchWithRetry('https://api.anthropic.com/v1/messages', fetchOptions);
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error((errorData.error && errorData.error.message) || 'Claude API error: ' + response.status);
  }

  const data = await response.json();
  const text = data.content && data.content[0] && data.content[0].text;
  if (!text) throw new Error('No response content from Claude');
  return parseTextLayoutResponse(text);
};

const analyzeTextWithOpenAIProvider = async (
  prompt: string,
  images: { base64: string; role: ImageRole }[],
  apiKey: string
): Promise<UIAnalysis> => {
  const content: any[] = [];

  // Add reference images
  for (let i = 0; i < images.length; i++) {
    content.push({
      type: 'image_url',
      image_url: { url: images[i].base64 },
    });
  }

  // Add text prompt
  content.push({ type: 'text', text: prompt });

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: apiState.openaiModel,
      max_tokens: 16384,
      messages: [{ role: 'user', content }],
      response_format: { type: 'json_object' },
    }),
  };

  if (textAbortController) {
    fetchOptions.signal = textAbortController.signal;
  }

  const response = await fetchWithRetry('https://api.openai.com/v1/chat/completions', fetchOptions);
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error((errorData.error && errorData.error.message) || 'OpenAI API error: ' + response.status);
  }

  const data = await response.json();
  const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text) throw new Error('No response content from OpenAI');
  return parseTextLayoutResponse(text);
};

const analyzeTextWithGeminiProvider = async (
  prompt: string,
  images: { base64: string; role: ImageRole }[],
  apiKey: string
): Promise<UIAnalysis> => {
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    imageGenState.geminiModel +
    ':generateContent';

  const parts: any[] = [{ text: prompt }];

  // Add reference images
  for (let i = 0; i < images.length; i++) {
    const base64 = images[i].base64.replace(/^data:image\/(png|jpeg|webp|gif);base64,/, '');
    parts.push({
      inline_data: {
        mime_type: 'image/jpeg',
        data: base64,
      },
    });
  }

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        maxOutputTokens: 65536,
        responseMimeType: 'application/json',
        temperature: 0,
      },
    }),
  };

  if (textAbortController) {
    fetchOptions.signal = textAbortController.signal;
  }

  const response = await fetchWithRetry(url, fetchOptions);
  if (!response.ok) {
    const errorData = await response.json();
    let errMsg = 'Gemini API error: ' + response.status;
    if (errorData.error && errorData.error.message) {
      errMsg = errorData.error.message;
    }
    throw new Error(errMsg);
  }

  const data = await response.json();
  const text =
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text;
  if (!text) throw new Error('No response content from Gemini');
  return parseTextLayoutResponse(text);
};

// ═══════════════════════════════════════════════════════════════
// TEXT-TO-LAYOUT: RESPONSE PARSING
// ═══════════════════════════════════════════════════════════════

export const parseTextLayoutResponse = (content: string): UIAnalysis => {
  let jsonStr = content.trim();

  // Try to extract JSON from markdown code blocks
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // If no code block, try to find JSON object directly
  if (!jsonMatch) {
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = content.substring(firstBrace, lastBrace + 1);
    }
  }

  try {
    const json = JSON.parse(jsonStr);

    // Handle carousel response format
    if (json.slides && Array.isArray(json.slides)) {
      (json as any)._isCarousel = true;
      return json as any;
    }

    // Handle structure + design wrapper format
    let analysis: UIAnalysis;
    if (json.design && json.design.elements) {
      analysis = json.design as UIAnalysis;
    } else if (json.elements) {
      analysis = json as UIAnalysis;
    } else {
      throw new Error('Invalid response structure: missing elements array');
    }

    if (typeof analysis.width !== 'number' || typeof analysis.height !== 'number') {
      throw new Error('Invalid dimensions in response');
    }

    if (!Array.isArray(analysis.elements)) {
      analysis.elements = [];
    }

    if (!analysis.backgroundColor) {
      analysis.backgroundColor = '#FFFFFF';
    }

    return validateAndFixAnalysis(analysis);
  } catch (_parseError) {
    console.error('Failed to parse text layout response. Raw:', content.substring(0, 500));
    throw new Error('Failed to parse AI response as JSON. Please try again.');
  }
};

// ═══════════════════════════════════════════════════════════════
// TEXT-TO-LAYOUT: FONT/COLOR ENFORCEMENT
// ═══════════════════════════════════════════════════════════════

export const enforceDesignPreferences = (analysis: UIAnalysis, input: TextLayoutInput): UIAnalysis => {
  // Enforce font family on all text elements (only when user specified a font)
  if (input.font) {
    enforceFontRecursive(analysis.elements, input.font);
  }

  // Enforce color theme
  if (input.colorTheme) {
    analysis.backgroundColor = input.colorTheme.background;
  }

  return analysis;
};

export const enforceFontRecursive = (elements: UIElement[], fontFamily: string): void => {
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.text) {
      el.text.fontFamily = fontFamily;
      // Also fix segments if present
      if (el.text.segments) {
        // Segments don't typically have fontFamily but ensure consistency
      }
    }
    if (el.children && el.children.length > 0) {
      enforceFontRecursive(el.children, fontFamily);
    }
  }
};

// ═══════════════════════════════════════════════════════════════
// TEXT-TO-LAYOUT: IMAGE GENERATION
// ═══════════════════════════════════════════════════════════════

export const generateTextLayoutImages = async (
  analysis: UIAnalysis,
  input: TextLayoutInput,
  apiKey: string
): Promise<UIAnalysis> => {
  if (!input.imageGenEnabled) {
    return analysis;
  }

  const imageElements = collectImageElements(analysis.elements);
  if (imageElements.length === 0) {
    return analysis;
  }

  // Inject content reference images into matching elements
  if (input.referenceImages) {
    for (let ri = 0; ri < input.referenceImages.length; ri++) {
      if (input.referenceImages[ri].role === 'content') {
        // Find the next image element tagged as content-image
        for (let ei = 0; ei < imageElements.length; ei++) {
          if (
            imageElements[ei].name &&
            imageElements[ei].name.indexOf('content-image') !== -1 &&
            !(imageElements[ei] as UIElement & { generatedImage?: string }).generatedImage
          ) {
            (imageElements[ei] as UIElement & { generatedImage: string }).generatedImage = input.referenceImages[ri].base64;
            break;
          }
        }
      }
    }
  }

  // Filter to elements that still need generation
  let elementsToGenerate = imageElements.filter((el) => !(el as UIElement & { generatedImage?: string }).generatedImage);
  if (elementsToGenerate.length === 0) {
    return analysis;
  }

  // Limit to 3 images max
  elementsToGenerate = elementsToGenerate.slice(0, 3);
  const totalImages = elementsToGenerate.length;

  setTextProgress(75, 'Generating images (0/' + totalImages + ')...');

  for (let currentIndex = 0; currentIndex < elementsToGenerate.length; currentIndex++) {
    if (!textIsProcessing) break;

    const el = elementsToGenerate[currentIndex];
    const description = el.imageDescription || el.name || 'placeholder image';
    const imgPrompt =
      'Generate an image for a social media design. ' +
      'This is a ' +
      (el.name || 'image') +
      ' element (' +
      el.width +
      'x' +
      el.height +
      'px). ' +
      'Description: ' +
      description +
      '. ' +
      'Style: Clean, professional, high-resolution. Match the exact composition described. ' +
      'Do NOT add any text, watermarks, or labels to the image.';

    let imageData: string | null = null;
    if (input.imageGenModel === 'gpt-image-1.5') {
      imageData = await generateWithOpenAIImage(imgPrompt, apiKey);
    } else {
      imageData = await generateWithGeminiImage(imgPrompt, apiKey);
    }

    if (imageData) {
      (el as UIElement & { generatedImage: string }).generatedImage = imageData;
    }

    const imageProgress = 75 + ((currentIndex + 1) / totalImages) * 20;
    setTextProgress(imageProgress, 'Generating images (' + (currentIndex + 1) + '/' + totalImages + ')...');
  }

  return analysis;
};

export const generateWithOpenAIImage = async (prompt: string, apiKey: string): Promise<string | null> => {
  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: 'gpt-image-1.5',
      prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json',
    }),
  };

  if (textAbortController) {
    fetchOptions.signal = textAbortController.signal;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', fetchOptions);

    if (!response.ok) {
      console.warn('OpenAI Image API error, falling back to placeholder');
      return null;
    }

    const data: any = await response.json();
    if (data && data.data && data.data[0] && data.data[0].b64_json) {
      return 'data:image/png;base64,' + data.data[0].b64_json;
    }
    return null;
  } catch (error: any) {
    if (error.name !== 'AbortError') {
      console.warn('OpenAI image generation failed:', error);
    }
    return null;
  }
};

// ═══════════════════════════════════════════════════════════════
// TEXT-TO-LAYOUT: PROGRESS TRACKING
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// TEXT-TO-LAYOUT: MAIN FLOW
// ═══════════════════════════════════════════════════════════════

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
    // Step 2: Analyzing
    setTextProgress(5, 'Analyzing content structure...');
    simulateTextProgress(10, 58, 25000);

    const result: any = await analyzeTextDesign(input, apiKey);

    if (!textIsProcessing) return;

    stopTextSimulation();
    setTextProgress(60, 'Validating design...');

    // Handle carousel response
    if (result._isCarousel && result.slides) {
      // Validate each slide
      const validatedSlides: UIAnalysis[] = [];
      for (let s = 0; s < result.slides.length; s++) {
        const slide = result.slides[s] as UIAnalysis;
        if (!slide.backgroundColor) slide.backgroundColor = '#FFFFFF';
        if (!slide.width) slide.width = input.format.width;
        if (!slide.height) slide.height = input.format.height;
        if (!Array.isArray(slide.elements)) slide.elements = [];
        const validatedSlide = validateAndFixAnalysis(slide);
        enforceDesignPreferences(validatedSlide, input);
        validatedSlides.push(validatedSlide);
      }

      // Fetch icons across all slides
      setTextProgress(65, 'Fetching icons...');
      const slidesWithIcons = await Promise.all(validatedSlides.map((slide) => fetchAllIcons(slide)));

      if (!textIsProcessing) return;

      setTextProgress(75, 'Generating images...');

      // Generate images for each slide if enabled
      let finalSlides: UIAnalysis[];
      if (input.imageGenEnabled) {
        finalSlides = await Promise.all(slidesWithIcons.map((slide) => generateTextLayoutImages(slide, input, apiKey)));
      } else {
        finalSlides = slidesWithIcons;
      }

      if (!textIsProcessing) return;

      setTextProgress(95, 'Creating carousel...');
      postMessage({
        type: 'create-carousel',
        data: {
          slides: finalSlides,
          font: input.font,
        },
      });

      // Show success
      showTextSuccess();
      return;
    }

    // Single design flow
    const analysis = result as UIAnalysis;
    enforceDesignPreferences(analysis, input);

    // Fetch icons
    setTextProgress(65, 'Fetching icons...');
    const analysisWithIcons = await fetchAllIcons(analysis);

    if (!textIsProcessing) return;

    // Generate images
    setTextProgress(75, 'Generating images...');
    const analysisComplete = await generateTextLayoutImages(analysisWithIcons, input, apiKey);

    if (!textIsProcessing) return;

    setTextProgress(95, 'Creating design...');
    postMessage({
      type: 'create-design',
      data: analysisComplete,
    });

    // Show success
    showTextSuccess();
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

// ═══════════════════════════════════════════════════════════════
// SCROLL SPY
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// SAVED MODE
// ═══════════════════════════════════════════════════════════════

export const getSavedMode = (): PluginMode | null => {
  const saved = safeGetItem(STORAGE_KEY_MODE);
  return saved as PluginMode | null;
};
