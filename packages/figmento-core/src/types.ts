/**
 * Unified types for Figmento plugin.
 * Merged from figmento/ (mode types, format constants, message types)
 * and figmento-plugin/ (WS/command types, richer design schema).
 */

// ═══════════════════════════════════════════════════════════════
// DESIGN SCHEMA TYPES
// ═══════════════════════════════════════════════════════════════

export interface GradientStop {
  position: number;
  color: string;
  opacity?: number;
}

export interface Fill {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'IMAGE';
  color?: string;
  opacity?: number;
  gradientStops?: GradientStop[];
  gradientDirection?: 'left-right' | 'right-left' | 'top-bottom' | 'bottom-top';
}

export interface Stroke {
  color: string;
  width: number;
}

export interface ShadowEffect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW';
  color: string;
  opacity?: number;
  offset: { x: number; y: number };
  blur: number;
  spread?: number;
}

export interface TextSegment {
  text: string;
  fontWeight?: number;
  fontSize?: number;
  color?: string;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}

export interface TextProperties {
  content: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  color: string;
  textAlign?: 'LEFT' | 'CENTER' | 'RIGHT';
  lineHeight?: number | 'AUTO';
  letterSpacing?: number;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  segments?: TextSegment[];
}

export interface UIElement {
  id: string;
  type: 'frame' | 'rectangle' | 'text' | 'image' | 'button' | 'input' | 'icon' | 'ellipse' | 'card';
  name: string;
  x?: number;
  y?: number;
  width: number;
  height: number;
  cornerRadius?: number | [number, number, number, number];
  fills?: Fill[];
  stroke?: Stroke | null;
  effects?: ShadowEffect[];
  text?: TextProperties;
  children?: UIElement[];
  imageDescription?: string;
  lucideIcon?: string;
  generatedImage?: string;
  scaleMode?: 'FILL' | 'FIT' | 'CROP' | 'TILE';
  svgPaths?: string[];
  strokeWeight?: number;

  opacity?: number;
  clipsContent?: boolean;

  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX';
  primaryAxisSizingMode?: 'FIXED' | 'AUTO';
  counterAxisSizingMode?: 'FIXED' | 'AUTO';

  layoutSizingHorizontal?: 'FIXED' | 'FILL' | 'HUG';
  layoutSizingVertical?: 'FIXED' | 'FILL' | 'HUG';
  layoutPositioning?: 'AUTO' | 'ABSOLUTE';
}

export interface UIAnalysis {
  width: number;
  height: number;
  backgroundColor: string;
  elements: UIElement[];
}

// ═══════════════════════════════════════════════════════════════
// WEBSOCKET COMMAND/RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════

export type CommandErrorCode =
  | 'NODE_NOT_FOUND'
  | 'FONT_LOAD_FAILED'
  | 'EXPORT_FAILED'
  | 'INVALID_PARAMS'
  | 'PARENT_MISMATCH'
  | 'IMAGE_DECODE_FAILED'
  | 'TIMEOUT'
  | 'UNKNOWN';

export interface CommandError {
  code: CommandErrorCode;
  message: string;
  recoverable: boolean;
}

export interface WSCommand {
  type: 'command';
  id: string;
  channel: string;
  action: string;
  params: Record<string, unknown>;
}

export interface WSResponse {
  type: 'response';
  id: string;
  channel: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  errorCode?: CommandErrorCode;
  recoverable?: boolean;
}

export interface ExecuteCommandMessage {
  type: 'execute-command';
  command: WSCommand;
}

export interface CommandResultMessage {
  type: 'command-result';
  response: WSResponse;
}

// ═══════════════════════════════════════════════════════════════
// AI PROVIDER TYPES
// ═══════════════════════════════════════════════════════════════

export type AIProvider = 'claude' | 'openai' | 'gemini';

export interface APIConfig {
  provider: AIProvider;
  apiKey: string;
}

export interface ProviderConfig {
  name: string;
  placeholder: string;
  docsUrl: string;
  models: string[];
}

export const PROVIDERS: Record<AIProvider, ProviderConfig> = {
  claude: {
    name: 'Claude (Anthropic)',
    placeholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/',
    models: ['claude-sonnet-4-20250514'],
  },
  openai: {
    name: 'GPT-4 Vision (OpenAI)',
    placeholder: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    models: ['gpt-4o'],
  },
  gemini: {
    name: 'Gemini (Google)',
    placeholder: 'AIza...',
    docsUrl: 'https://aistudio.google.com/apikey',
    models: ['gemini-3-pro-preview'],
  },
};

// ═══════════════════════════════════════════════════════════════
// PLUGIN MESSAGE TYPES (between UI iframe and sandbox)
// ═══════════════════════════════════════════════════════════════

export interface CreateDesignMessage {
  type: 'create-design';
  data: UIAnalysis;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export interface StatusMessage {
  type: 'status';
  message: string;
}

export interface SetImageMessage {
  type: 'set-image';
  imageData: string;
  width: number;
  height: number;
}

export interface GetSelectedImageMessage {
  type: 'get-selected-image';
}

export interface SelectedImageMessage {
  type: 'selected-image';
  imageData: string | null;
  width: number;
  height: number;
  error?: string;
}

export interface ValidateApiKeyMessage {
  type: 'validate-api-key';
  provider: AIProvider;
  apiKey: string;
}

export interface SaveApiKeyMessage {
  type: 'save-api-key';
  provider: AIProvider;
  apiKey: string;
}

export interface LoadApiKeysMessage {
  type: 'load-api-keys';
}

export interface ApiKeysLoadedMessage {
  type: 'api-keys-loaded';
  keys: Partial<Record<AIProvider, string>>;
  validated: Partial<Record<AIProvider, boolean>>;
}

export interface SaveValidationMessage {
  type: 'save-validation';
  provider: AIProvider;
  isValid: boolean;
}

export interface SaveFeedbackMessage {
  type: 'save-feedback';
  data: {
    rating: 'good' | 'bad';
    provider: AIProvider;
    timestamp: number;
  };
}

export interface ProgressMessage {
  type: 'progress';
  percent: number;
  message: string;
}

export interface CompleteMessage {
  type: 'complete';
}

// ═══════════════════════════════════════════════════════════════
// TEXT-TO-LAYOUT TYPES
// ═══════════════════════════════════════════════════════════════

export type ImageRole = 'style' | 'content';

export interface ReferenceImage {
  base64: string;
  role: ImageRole;
}

export interface CarouselConfig {
  enabled: boolean;
  slideCount: number | 'auto';
  slideFormat: 'square' | 'portrait';
}

export type LayoutPreset = 'auto' | 'centered' | 'split-left' | 'split-right' | 'top-heavy' | 'bottom-heavy';

export interface CarouselAnalysis {
  designSystem: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    backgroundColor: string;
    textColor: string;
    fontFamily: string;
  };
  slides: UIAnalysis[];
}

export type ImageGenModel = 'gemini-3-pro-image-preview' | 'gpt-image-1.5';

// ═══════════════════════════════════════════════════════════════
// MULTI-MODE TYPES
// ═══════════════════════════════════════════════════════════════

export type PluginMode = 'screenshot-to-layout' | 'text-to-layout' | 'template-fill' | 'text-to-presentation' | 'hero-generator' | 'ad-analyzer';

export interface SocialFormat {
  id: string;
  name: string;
  width: number;
  height: number;
}

export const SOCIAL_FORMATS: SocialFormat[] = [
  { id: 'ig-post', name: 'Instagram Post', width: 1080, height: 1350 },
  { id: 'ig-square', name: 'Instagram Square', width: 1080, height: 1080 },
  { id: 'ig-story', name: 'Instagram Story', width: 1080, height: 1920 },
  { id: 'twitter', name: 'Twitter/X', width: 1600, height: 900 },
  { id: 'linkedin', name: 'LinkedIn', width: 1200, height: 627 },
  { id: 'facebook', name: 'Facebook', width: 1080, height: 1350 },
  { id: 'carousel', name: 'Carousel', width: 1080, height: 1080 },
];

export const FONT_OPTIONS = [
  'Inter', 'Roboto', 'Open Sans', 'Montserrat', 'Poppins',
  'Playfair Display', 'Lora', 'Merriweather', 'Space Grotesk',
  'DM Sans', 'Raleway', 'Oswald', 'Nunito', 'Work Sans', 'Bebas Neue',
];

export interface ColorTheme {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export const COLOR_THEMES: ColorTheme[] = [
  { id: 'vibrant', name: 'Vibrant', primary: '#FF5733', secondary: '#FFC300', accent: '#C70039', background: '#1A1A2E', text: '#FFFFFF' },
  { id: 'minimal', name: 'Minimal', primary: '#000000', secondary: '#333333', accent: '#666666', background: '#FFFFFF', text: '#000000' },
  { id: 'dark', name: 'Dark', primary: '#BB86FC', secondary: '#03DAC6', accent: '#CF6679', background: '#121212', text: '#FFFFFF' },
  { id: 'ocean', name: 'Ocean', primary: '#0077B6', secondary: '#00B4D8', accent: '#90E0EF', background: '#03045E', text: '#FFFFFF' },
  { id: 'forest', name: 'Forest', primary: '#2D6A4F', secondary: '#40916C', accent: '#95D5B2', background: '#1B4332', text: '#FFFFFF' },
  { id: 'sunset', name: 'Sunset', primary: '#FF6B6B', secondary: '#FFA07A', accent: '#FFD93D', background: '#2C1810', text: '#FFFFFF' },
];

export interface TextStructure {
  headline?: string;
  subheadline?: string;
  body?: string[];
  cta?: string;
  hashtags?: string[];
  mentions?: string[];
}

export interface TextLayoutInput {
  content: string;
  format: SocialFormat;
  font: string;
  colorTheme: ColorTheme | null;
  customHex?: string;
  referenceImages?: ReferenceImage[];
  layoutPreset?: LayoutPreset;
  carousel?: CarouselConfig;
  imageGenEnabled?: boolean;
  imageGenModel?: ImageGenModel;
}

export interface SelectModeMessage {
  type: 'select-mode';
  mode: PluginMode;
}

export interface CreateTextLayoutMessage {
  type: 'create-text-layout';
  data: {
    structure: TextStructure;
    format: SocialFormat;
    design: UIAnalysis;
    font: string;
  };
}

export interface CreateCarouselMessage {
  type: 'create-carousel';
  data: {
    slides: UIAnalysis[];
    font: string;
  };
}

// ═══════════════════════════════════════════════════════════════
// TEMPLATE FILL TYPES
// ═══════════════════════════════════════════════════════════════

export interface TemplatePlaceholder {
  nodeId: string;
  name: string;
  slotType: string;
  slotCategory: 'text' | 'image';
  currentContent?: string;
  width: number;
  height: number;
}

export interface TemplateSlide {
  frameId: string;
  frameName: string;
  frameX: number;
  frameY: number;
  placeholders: TemplatePlaceholder[];
}

export interface TemplateScanResult {
  slides: TemplateSlide[];
  textSlots: string[];
  imageSlots: string[];
  slideCount: number;
}

export interface SlideContent {
  [slotType: string]: string;
}

export interface TemplateTextResponse {
  slides: SlideContent[];
}

export interface ImageSlotReference {
  slideIndex: number;
  slotType: string;
  nodeId: string;
  width: number;
  height: number;
  contextText?: string;
  imageData?: string;
}

export interface ScanTemplateMessage {
  type: 'scan-template';
}

export interface TemplateScanResultMessage {
  type: 'template-scan-result';
  result: TemplateScanResult;
  error?: string;
}

export interface ApplyTemplateTextMessage {
  type: 'apply-template-text';
  data: {
    slides: TemplateSlide[];
    content: TemplateTextResponse;
  };
}

export interface ApplyTemplateImageMessage {
  type: 'apply-template-image';
  data: {
    nodeId: string;
    imageData: string;
    width: number;
    height: number;
  };
}

export interface TemplateApplyResultMessage {
  type: 'template-apply-result';
  success: boolean;
  slidesUpdated: number;
  errors?: string[];
}

// ═══════════════════════════════════════════════════════════════
// TEXT-TO-PRESENTATION TYPES
// ═══════════════════════════════════════════════════════════════

export type PresentationCategory = 'presentation' | 'paper' | 'custom';
export type PageOrientation = 'landscape' | 'portrait';
export type DesignStylePreset = 'auto' | 'minimal' | 'corporate' | 'bold' | 'creative';
export type PresentationContentType = 'auto' | 'presentation' | 'ebook' | 'document' | 'card-deck';

export interface PresentationFormat {
  id: string;
  name: string;
  category: PresentationCategory;
  width: number;
  height: number;
  supportsOrientation?: boolean;
}

export const PRESENTATION_FORMATS: PresentationFormat[] = [
  { id: 'pres-16-9', name: '16:9 Widescreen', category: 'presentation', width: 1920, height: 1080 },
  { id: 'pres-4-3', name: '4:3 Standard', category: 'presentation', width: 1440, height: 1080 },
  { id: 'paper-a4', name: 'A4', category: 'paper', width: 2480, height: 3508, supportsOrientation: true },
  { id: 'paper-a5', name: 'A5', category: 'paper', width: 1748, height: 2480, supportsOrientation: true },
  { id: 'paper-a6', name: 'A6', category: 'paper', width: 1240, height: 1748, supportsOrientation: true },
  { id: 'paper-letter', name: 'Letter', category: 'paper', width: 2550, height: 3300, supportsOrientation: true },
  { id: 'paper-tabloid', name: 'Tabloid', category: 'paper', width: 2200, height: 3400, supportsOrientation: true },
];

export interface DesignStyle {
  id: DesignStylePreset;
  name: string;
  description: string;
}

export const DESIGN_STYLES: DesignStyle[] = [
  { id: 'auto', name: 'Auto', description: 'AI chooses based on content' },
  { id: 'minimal', name: 'Minimal', description: 'Clean, simple, lots of whitespace' },
  { id: 'corporate', name: 'Corporate', description: 'Professional, structured, formal' },
  { id: 'bold', name: 'Bold', description: 'High contrast, impactful typography' },
  { id: 'creative', name: 'Creative', description: 'Playful, asymmetric, artistic' },
];

export type ContentElementType =
  | 'h1' | 'h2' | 'h3'
  | 'p' | 'quote' | 'stat'
  | 'cta' | 'link'
  | 'tag' | 'caption' | 'note'
  | 'img'
  | 'bullet' | 'numbered';

export interface ContentElement {
  type: ContentElementType;
  content: string;
  children?: ContentElement[];
}

export interface ParsedSlide {
  elements: ContentElement[];
}

export const PRESENTATION_COLOR_THEMES: ColorTheme[] = [
  { id: 'corporate-blue', name: 'Corporate Blue', primary: '#1E3A5F', secondary: '#4A90D9', accent: '#F0B429', background: '#FFFFFF', text: '#1A1A1A' },
  { id: 'minimal-light', name: 'Minimal Light', primary: '#000000', secondary: '#666666', accent: '#0066CC', background: '#FFFFFF', text: '#1A1A1A' },
  { id: 'dark-mode', name: 'Dark Mode', primary: '#FFFFFF', secondary: '#A0A0A0', accent: '#4ECDC4', background: '#121212', text: '#FFFFFF' },
  { id: 'ocean-gradient', name: 'Ocean', primary: '#0077B6', secondary: '#00B4D8', accent: '#90E0EF', background: '#CAF0F8', text: '#03045E' },
  { id: 'forest-nature', name: 'Forest', primary: '#2D6A4F', secondary: '#40916C', accent: '#95D5B2', background: '#D8F3DC', text: '#1B4332' },
  { id: 'sunset-warm', name: 'Sunset', primary: '#E63946', secondary: '#F4A261', accent: '#E9C46A', background: '#FFF8F0', text: '#2D3436' },
];

export interface PresentationInput {
  content: string;
  format: PresentationFormat;
  orientation: PageOrientation;
  customWidth?: number;
  customHeight?: number;
  font: string;
  colorTheme: ColorTheme | null;
  customHex?: string;
  designStyle: DesignStylePreset;
  contentType: PresentationContentType;
  slideCount: number | 'auto';
  showSlideNumbers: boolean;
}

export interface PresentationAnalysis {
  designSystem: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    backgroundColor: string;
    textColor: string;
    fontFamily: string;
  };
  detectedContentType: PresentationContentType;
  slides: UIAnalysis[];
}

export interface PresentationPreferences {
  formatId: string;
  orientation: PageOrientation;
  font: string;
  colorThemeId: string | null;
  customHex: string;
  designStyle: DesignStylePreset;
  contentType: PresentationContentType;
  showSlideNumbers: boolean;
}

export interface CreatePresentationMessage {
  type: 'create-presentation';
  data: {
    slides: UIAnalysis[];
    font: string;
    format: PresentationFormat;
  };
}

export interface ExtractedSlideStyle {
  width: number;
  height: number;
  backgroundColor: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  fontFamily: string;
  frameId: string;
  frameName: string;
}

export interface ScanSlideStyleMessage {
  type: 'scan-slide-style';
}

export interface SlideStyleResultMessage {
  type: 'slide-style-result';
  style: ExtractedSlideStyle | null;
  error?: string;
}

export interface AddSlideMessage {
  type: 'add-slide';
  data: {
    slide: UIAnalysis;
    afterFrameId: string;
    font: string;
  };
}

// ═══════════════════════════════════════════════════════════════
// HERO GENERATOR TYPES
// ═══════════════════════════════════════════════════════════════

export type HeroQuality = '1k' | '2k' | '4k';
export type SubjectPosition = 'left' | 'center' | 'right';

export interface HeroFormat {
  id: string;
  name: string;
  width: number;
  height: number;
  category: 'desktop' | 'tablet' | 'mobile' | 'social';
}

export const HERO_FORMATS: HeroFormat[] = [
  { id: 'web-hero-16-9', name: 'Web Hero 16:9', width: 1920, height: 1080, category: 'desktop' },
  { id: 'web-banner', name: 'Web Banner', width: 1440, height: 600, category: 'desktop' },
  { id: 'landing-page', name: 'Landing Page', width: 1440, height: 900, category: 'desktop' },
  { id: 'tablet-landscape', name: 'Tablet Landscape', width: 1194, height: 834, category: 'tablet' },
  { id: 'tablet-portrait', name: 'Tablet Portrait', width: 834, height: 1194, category: 'tablet' },
  { id: 'mobile-hero', name: 'Mobile Hero', width: 430, height: 932, category: 'mobile' },
  { id: 'mobile-banner', name: 'Mobile Banner', width: 430, height: 300, category: 'mobile' },
  { id: 'ig-post', name: 'IG Post', width: 1080, height: 1350, category: 'social' },
  { id: 'ig-story', name: 'IG Story', width: 1080, height: 1920, category: 'social' },
];

export interface HeroGeneratorInput {
  subjects: string[];
  styleRef: string | null;
  elements: string[];
  position: SubjectPosition;
  scenePrompt: string;
  format: HeroFormat;
  quality: HeroQuality;
}

export interface CreateHeroImageMessage {
  type: 'create-hero-image';
  imageData: string;
  width: number;
  height: number;
  name?: string;
}

// ═══════════════════════════════════════════════════════════════
// UNIFIED PLUGIN MESSAGE TYPE
// ═══════════════════════════════════════════════════════════════

export type PluginMessage =
  | CreateDesignMessage
  | ErrorMessage
  | StatusMessage
  | SetImageMessage
  | GetSelectedImageMessage
  | SelectedImageMessage
  | ValidateApiKeyMessage
  | SaveApiKeyMessage
  | LoadApiKeysMessage
  | ApiKeysLoadedMessage
  | SaveValidationMessage
  | SaveFeedbackMessage
  | SelectModeMessage
  | CreateTextLayoutMessage
  | CreateCarouselMessage
  | ProgressMessage
  | CompleteMessage
  | ScanTemplateMessage
  | TemplateScanResultMessage
  | ApplyTemplateTextMessage
  | ApplyTemplateImageMessage
  | TemplateApplyResultMessage
  | CreatePresentationMessage
  | ScanSlideStyleMessage
  | SlideStyleResultMessage
  | AddSlideMessage
  | CreateHeroImageMessage
  | ExecuteCommandMessage
  | CommandResultMessage
  | GetSettingsMessage
  | SaveSettingsMessage;

export interface GetSettingsMessage {
  type: 'get-settings';
}

export interface SaveSettingsMessage {
  type: 'save-settings';
  settings: Record<string, unknown>;
}
