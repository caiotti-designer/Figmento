import {
  AIProvider,
  PluginMode,
  SocialFormat,
  SOCIAL_FORMATS,
  ColorTheme,
  COLOR_THEMES,
  FONT_OPTIONS,
  ImageSlotReference,
  TemplateScanResult,
  PresentationFormat,
  PRESENTATION_FORMATS,
  DesignStylePreset,
  PresentationContentType,
  PageOrientation,
  ExtractedSlideStyle,
  CarouselConfig,
  SubjectPosition,
  HeroQuality,
  HeroFormat,
  HERO_FORMATS,
} from '../types';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

export const STORAGE_KEY_PROVIDER = 'figmento-provider';
export const STORAGE_KEY_IMAGE_GEN = 'figmento-image-gen';
export const STORAGE_KEY_IMAGE_MODEL = 'figmento-image-model';
export const STORAGE_KEY_MODE = 'figmento-mode';
export const STORAGE_KEY_CLAUDE_MODEL = 'figmento-claude-model';
export const STORAGE_KEY_OPENAI_MODEL = 'figmento-openai-model';
export const STORAGE_KEY_DESIGN_OVERRIDES = 'figmento-overrides';

export const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB
export const MAX_IMAGE_DIMENSION = 2048;
export const GRID_SIZE = 4;

export const GOOGLE_FONTS: string[] = [
  'Abel',
  'Abril Fatface',
  'Acme',
  'Alegreya',
  'Alegreya Sans',
  'Alfa Slab One',
  'Amatic SC',
  'Amiri',
  'Anton',
  'Archivo Narrow',
  'Archivo',
  'Archivo Black',
  'Arimo',
  'Arvo',
  'Asap',
  'Assistant',
  'Baloo 2',
  'Bangers',
  'Barlow',
  'Barlow Condensed',
  'Barlow Semi Condensed',
  'Be Vietnam Pro',
  'Bebas Neue',
  'Bitter',
  'Black Ops One',
  'Bodoni Moda',
  'Bree Serif',
  'Cabin',
  'Cairo',
  'Cantarell',
  'Cardo',
  'Catamaran',
  'Caveat',
  'Chakra Petch',
  'Cinzel',
  'Comfortaa',
  'Commissioner',
  'Concert One',
  'Cormorant',
  'Cormorant Garamond',
  'Crimson Text',
  'DM Mono',
  'DM Sans',
  'DM Serif Display',
  'Dancing Script',
  'Didact Gothic',
  'Domine',
  'Dosis',
  'EB Garamond',
  'Eczar',
  'El Messiri',
  'Electrolize',
  'Encode Sans',
  'Exo',
  'Exo 2',
  'Figtree',
  'Fira Code',
  'Fira Sans',
  'Fira Sans Condensed',
  'Fjalla One',
  'Francois One',
  'Fraunces',
  'Gelasio',
  'Gloria Hallelujah',
  'Gothic A1',
  'Gowun Batang',
  'Heebo',
  'Hind',
  'Hind Siliguri',
  'IBM Plex Mono',
  'IBM Plex Sans',
  'IBM Plex Serif',
  'Inconsolata',
  'Indie Flower',
  'Inter',
  'Italiana',
  'Josefin Sans',
  'Josefin Slab',
  'Jost',
  'Kalam',
  'Kanit',
  'Karla',
  'Kaushan Script',
  'Koulen',
  'Krub',
  'Lato',
  'League Spartan',
  'Lexend',
  'Libre Baskerville',
  'Libre Franklin',
  'Lilita One',
  'Lobster',
  'Lobster Two',
  'Lora',
  'Luckiest Guy',
  'M PLUS Rounded 1c',
  'Macondo',
  'Manrope',
  'Maven Pro',
  'Merriweather',
  'Merriweather Sans',
  'Montserrat',
  'Montserrat Alternates',
  'Mulish',
  'Nanum Gothic',
  'Nanum Myeongjo',
  'Newsreader',
  'Noto Sans',
  'Noto Sans JP',
  'Noto Sans KR',
  'Noto Serif',
  'Noto Serif JP',
  'Nunito',
  'Nunito Sans',
  'Old Standard TT',
  'Open Sans',
  'Orbitron',
  'Oswald',
  'Outfit',
  'Overpass',
  'Oxygen',
  'PT Sans',
  'PT Serif',
  'Pacifico',
  'Passion One',
  'Pathway Gothic One',
  'Patrick Hand',
  'Patua One',
  'Permanent Marker',
  'Philosopher',
  'Play',
  'Playfair Display',
  'Plus Jakarta Sans',
  'Poppins',
  'Prata',
  'Prompt',
  'Public Sans',
  'Quicksand',
  'Rajdhani',
  'Raleway',
  'Red Hat Display',
  'Righteous',
  'Roboto',
  'Roboto Condensed',
  'Roboto Flex',
  'Roboto Mono',
  'Roboto Slab',
  'Rokkitt',
  'Rubik',
  'Russo One',
  'Sacramento',
  'Saira',
  'Satisfy',
  'Secular One',
  'Shadows Into Light',
  'Signika',
  'Silkscreen',
  'Slabo 27px',
  'Sora',
  'Source Code Pro',
  'Source Sans 3',
  'Source Serif 4',
  'Space Grotesk',
  'Space Mono',
  'Spectral',
  'Stint Ultra Expanded',
  'Teko',
  'Titillium Web',
  'Ubuntu',
  'Ubuntu Mono',
  'Unbounded',
  'Urbanist',
  'Varela Round',
  'Vollkorn',
  'Work Sans',
  'Yanone Kaffeesatz',
  'Yellowtail',
  'Zen Kaku Gothic New',
  'Zilla Slab',
];

// ═══════════════════════════════════════════════════════════════
// MUTABLE APPLICATION STATE
// ═══════════════════════════════════════════════════════════════

export const screenshotState = {
  currentStep: 1,
  currentImageBase64: null as string | null,
  imageWidth: 0,
  imageHeight: 0,
  isProcessing: false,
  pasteHandled: false,
};

export const cropState = {
  cropX: 0,
  cropY: 0,
  cropWidth: 0,
  cropHeight: 0,
  isDragging: false,
  dragType: null as string | null,
  dragStartX: 0,
  dragStartY: 0,
  dragStartCropX: 0,
  dragStartCropY: 0,
  dragStartCropW: 0,
  dragStartCropH: 0,
  displayedImageWidth: 0,
  displayedImageHeight: 0,
  currentAspectRatio: 'free',
};

export const apiState = {
  savedApiKeys: {} as Record<string, string>,
  validatedKeys: {} as Record<string, boolean>,
  currentProvider: 'gemini' as AIProvider,
  abortController: null as AbortController | null,
  claudeModel: 'claude-sonnet-4-20250514' as string,
  openaiModel: 'gpt-4o' as string,
  geminiModel: 'gemini-3-pro-preview' as 'gemini-3-pro-preview' | 'gemini-3-flash-preview',
};

export const progressState = {
  progressInterval: null as number | null,
  currentProgress: 0,
};

export const imageGenState = {
  enableImageGeneration: false,
  imageGenModel: 'imagen-4' as 'imagen-4' | 'gemini-image',
  geminiModel: 'gemini-3-pro-preview' as 'gemini-3-pro-preview' | 'gemini-3-flash-preview',
};

export const modeState = {
  currentMode: 'screenshot-to-layout' as PluginMode,
  currentFormat: SOCIAL_FORMATS[0] as SocialFormat,
  currentFont: FONT_OPTIONS[0],
  activeColorTheme: COLOR_THEMES[0] as ColorTheme | string,
  referenceImages: [] as string[],
};

export const MAX_BRAND_COLORS = 6;

export const designSettings = {
  selectedFontFamily: 'Inter',
  brandColors: [] as string[],
  enableGridSystem: false,
  customPrompt: '',
};

export const templateState = {
  scanResult: null as TemplateScanResult | null,
  imageSlots: [] as ImageSlotReference[],
  abortController: null as AbortController | null,
  imageStyle: '',
};

export const presentationState = {
  format: PRESENTATION_FORMATS[0] as PresentationFormat,
  orientation: 'landscape' as PageOrientation,
  customWidth: 1920,
  customHeight: 1080,
  font: 'Inter',
  colorTheme: null as ColorTheme | null,
  customHex: '',
  designStyle: 'auto' as DesignStylePreset,
  contentType: 'auto' as PresentationContentType,
  slideCount: 'auto' as number | 'auto',
  showSlideNumbers: false,
  isProcessing: false,
  abortController: null as AbortController | null,
  progressInterval: null as number | null,
};

export const addSlideState = {
  extractedStyle: null as ExtractedSlideStyle | null,
  isProcessing: false,
};

export const textLayoutState = {
  isProcessing: false,
  abortController: null as AbortController | null,
  progressInterval: null as number | null,
  currentLayoutPreset: 'auto' as string,
  carouselConfig: { enabled: false, slideCount: 'auto', slideFormat: 'square' } as CarouselConfig,
  imageGenEnabled: false,
  imageGenModel: 'gemini-3-pro-image-preview' as string,
  referenceImageRoles: {} as Record<number, string>,
  customStyleEnabled: false,
};

export const heroState = {
  subjects: [] as string[],
  styleRef: null as string | null,
  elements: [] as string[],
  position: 'center' as SubjectPosition,
  quality: '2k' as HeroQuality,
  format: HERO_FORMATS[0] as HeroFormat,
  scenePrompt: '',
  isProcessing: false,
  abortController: null as AbortController | null,
  lastGeneratedImage: null as string | null,
};

// ═══════════════════════════════════════════════════════════════
// DOM ELEMENT REFERENCES
// ═══════════════════════════════════════════════════════════════

export const dom = {
  // Settings
  settingsBtn: null as HTMLButtonElement | null,
  settingsOverlay: null as HTMLDivElement | null,
  settingsPanel: null as HTMLElement | null,
  settingsClose: null as HTMLButtonElement | null,
  statusDot: null as HTMLSpanElement | null,

  // Upload
  dropZone: null as HTMLDivElement | null,
  dropZonePreview: null as HTMLDivElement | null,
  dropZoneChange: null as HTMLDivElement | null,
  previewImage: null as HTMLImageElement | null,
  fileInput: null as HTMLInputElement | null,
  useSelectionBtn: null as HTMLButtonElement | null,
  nextToCropBtn: null as HTMLButtonElement | null,

  // Crop
  cropContainer: null as HTMLDivElement | null,
  cropImageWrapper: null as HTMLDivElement | null,
  cropImage: null as HTMLImageElement | null,
  cropSelection: null as HTMLDivElement | null,
  cropDimensions: null as HTMLDivElement | null,
  backToUploadBtn: null as HTMLButtonElement | null,
  startProcessingBtn: null as HTMLButtonElement | null,

  // Processing
  processingContainer: null as HTMLDivElement | null,
  processingProgressBar: null as HTMLDivElement | null,
  processingPercent: null as HTMLSpanElement | null,
  processingStatus: null as HTMLDivElement | null,
  processingImage: null as HTMLImageElement | null,
  processingSuccess: null as HTMLDivElement | null,
  cancelBtn: null as HTMLButtonElement | null,
  newDesignBtn: null as HTMLButtonElement | null,
  compareBtn: null as HTMLButtonElement | null,
  comparePanel: null as HTMLDivElement | null,
  compareImage: null as HTMLImageElement | null,
  compareCloseBtn: null as HTMLButtonElement | null,
  feedbackSection: null as HTMLDivElement | null,
  feedbackGoodBtn: null as HTMLButtonElement | null,
  feedbackBadBtn: null as HTMLButtonElement | null,
  feedbackThanks: null as HTMLDivElement | null,

  // API Key
  apiKeyInput: null as HTMLInputElement | null,
  validateBtn: null as HTMLButtonElement | null,
  validationStatus: null as HTMLDivElement | null,
  getKeyLink: null as HTMLAnchorElement | null,

  // Mode
  modeSelector: null as HTMLDivElement | null,
  screenshotFlow: null as HTMLDivElement | null,
  textLayoutFlow: null as HTMLDivElement | null,
  heroGeneratorFlow: null as HTMLDivElement | null,

  // Text Layout
  formatCards: null as NodeListOf<HTMLDivElement> | null,
  contentInput: null as HTMLTextAreaElement | null,
  referenceZone: null as HTMLDivElement | null,
  referenceInput: null as HTMLInputElement | null,
  referencePreviews: null as HTMLDivElement | null,
  fontSelect: null as HTMLSelectElement | null,
  colorPresets: null as HTMLDivElement | null,
  customHexInput: null as HTMLInputElement | null,
  generateTextDesignBtn: null as HTMLButtonElement | null,
  toastContainer: null as HTMLDivElement | null,

  // Image Generation
  imageGenSection: null as HTMLDivElement | null,
  enableImageGenCheckbox: null as HTMLInputElement | null,
  imageModelSelect: null as HTMLSelectElement | null,
  imageModelSelectWrapper: null as HTMLDivElement | null,
  geminiModelSelect: null as HTMLSelectElement | null,
  geminiModelSelectWrapper: null as HTMLDivElement | null,
  claudeModelSelect: null as HTMLSelectElement | null,
  claudeModelSelectWrapper: null as HTMLDivElement | null,
  openaiModelSelect: null as HTMLSelectElement | null,
  openaiModelSelectWrapper: null as HTMLDivElement | null,

  // Navigation
  backToHomeBtn: null as HTMLButtonElement | null,
  breadcrumb: null as HTMLDivElement | null,
  breadcrumbCurrent: null as HTMLSpanElement | null,
  breadcrumbHome: null as HTMLSpanElement | null,
  logoBtn: null as HTMLDivElement | null,

  // Design Settings
  designSettingsPanel: null as HTMLDivElement | null,
  fontFamilyInput: null as HTMLInputElement | null,
  fontValidationIndicator: null as HTMLSpanElement | null,
  colorChipsContainer: null as HTMLDivElement | null,
  colorHexInput: null as HTMLInputElement | null,
  colorPickerInput: null as HTMLInputElement | null,
  addColorBtn: null as HTMLButtonElement | null,
  enableGridSystemCheckbox: null as HTMLInputElement | null,
  customPromptInput: null as HTMLTextAreaElement | null,

  // Batch Processing
  batchPanel: null as HTMLDivElement | null,
  batchList: null as HTMLDivElement | null,
  batchProcessBtn: null as HTMLButtonElement | null,
  batchClearBtn: null as HTMLButtonElement | null,
};

export function initDomRefs(): void {
  dom.settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
  dom.settingsOverlay = document.getElementById('settingsOverlay') as HTMLDivElement;
  dom.settingsPanel = document.getElementById('settingsPanel') as HTMLElement;
  dom.settingsClose = document.getElementById('settingsClose') as HTMLButtonElement;
  dom.statusDot = document.getElementById('statusDot') as HTMLSpanElement;

  dom.dropZone = document.getElementById('dropZone') as HTMLDivElement;
  dom.dropZonePreview = document.getElementById('dropZonePreview') as HTMLDivElement;
  dom.dropZoneChange = document.getElementById('dropZoneChange') as HTMLDivElement;
  dom.previewImage = document.getElementById('previewImage') as HTMLImageElement;
  dom.fileInput = document.getElementById('fileInput') as HTMLInputElement;
  dom.useSelectionBtn = document.getElementById('useSelectionBtn') as HTMLButtonElement;
  dom.nextToCropBtn = document.getElementById('nextToCropBtn') as HTMLButtonElement;

  dom.cropContainer = document.getElementById('cropContainer') as HTMLDivElement;
  dom.cropImageWrapper = document.getElementById('cropImageWrapper') as HTMLDivElement;
  dom.cropImage = document.getElementById('cropImage') as HTMLImageElement;
  dom.cropSelection = document.getElementById('cropSelection') as HTMLDivElement;
  dom.cropDimensions = document.getElementById('cropDimensions') as HTMLDivElement;
  dom.backToUploadBtn = document.getElementById('backToUploadBtn') as HTMLButtonElement;
  dom.startProcessingBtn = document.getElementById('startProcessingBtn') as HTMLButtonElement;

  dom.processingContainer = document.getElementById('processingContainer') as HTMLDivElement;
  dom.processingProgressBar = document.getElementById('processingProgressBar') as HTMLDivElement;
  dom.processingPercent = document.getElementById('processingPercent') as HTMLSpanElement;
  dom.processingStatus = document.getElementById('processingStatus') as HTMLDivElement;
  dom.processingImage = document.getElementById('processingImage') as HTMLImageElement;
  dom.processingSuccess = document.getElementById('processingSuccess') as HTMLDivElement;
  dom.cancelBtn = document.getElementById('cancelBtn') as HTMLButtonElement;
  dom.newDesignBtn = document.getElementById('newDesignBtn') as HTMLButtonElement;
  dom.compareBtn = document.getElementById('compareBtn') as HTMLButtonElement;
  dom.comparePanel = document.getElementById('comparePanel') as HTMLDivElement;
  dom.compareImage = document.getElementById('compareImage') as HTMLImageElement;
  dom.compareCloseBtn = document.getElementById('compareCloseBtn') as HTMLButtonElement;
  dom.feedbackSection = document.getElementById('feedbackSection') as HTMLDivElement;
  dom.feedbackGoodBtn = document.getElementById('feedbackGoodBtn') as HTMLButtonElement;
  dom.feedbackBadBtn = document.getElementById('feedbackBadBtn') as HTMLButtonElement;
  dom.feedbackThanks = document.getElementById('feedbackThanks') as HTMLDivElement;

  dom.apiKeyInput = document.getElementById('apiKeyInput') as HTMLInputElement;
  dom.validateBtn = document.getElementById('validateBtn') as HTMLButtonElement;
  dom.validationStatus = document.getElementById('validationStatus') as HTMLDivElement;
  dom.getKeyLink = document.getElementById('getKeyLink') as HTMLAnchorElement;
  dom.toastContainer = document.getElementById('toastContainer') as HTMLDivElement;

  dom.imageGenSection = document.getElementById('imageGenSection') as HTMLDivElement;
  dom.enableImageGenCheckbox = document.getElementById('enableImageGen') as HTMLInputElement;
  dom.imageModelSelect = document.getElementById('imageModelSelect') as HTMLSelectElement;
  dom.imageModelSelectWrapper = document.getElementById('imageModelSelectWrapper') as HTMLDivElement;
  dom.geminiModelSelect = document.getElementById('geminiModelSelect') as HTMLSelectElement;
  dom.geminiModelSelectWrapper = document.getElementById('geminiModelSelectWrapper') as HTMLDivElement;
  dom.claudeModelSelect = document.getElementById('claudeModelSelect') as HTMLSelectElement;
  dom.claudeModelSelectWrapper = document.getElementById('claudeModelSelectWrapper') as HTMLDivElement;
  dom.openaiModelSelect = document.getElementById('openaiModelSelect') as HTMLSelectElement;
  dom.openaiModelSelectWrapper = document.getElementById('openaiModelSelectWrapper') as HTMLDivElement;

  dom.modeSelector = document.getElementById('modeSelector') as HTMLDivElement;
  dom.screenshotFlow = document.getElementById('screenshotFlow') as HTMLDivElement;
  dom.textLayoutFlow = document.getElementById('textLayoutFlow') as HTMLDivElement;
  dom.heroGeneratorFlow = document.getElementById('heroGeneratorFlow') as HTMLDivElement;

  dom.backToHomeBtn = document.getElementById('backToHomeBtn') as HTMLButtonElement;
  dom.breadcrumb = document.getElementById('breadcrumb') as HTMLDivElement;
  dom.breadcrumbCurrent = document.getElementById('breadcrumbCurrent') as HTMLSpanElement;
  dom.breadcrumbHome = document.getElementById('breadcrumbHome') as HTMLSpanElement;
  dom.logoBtn = document.getElementById('logoBtn') as HTMLDivElement;

  dom.designSettingsPanel = document.getElementById('designSettings') as HTMLDivElement;
  dom.fontFamilyInput = document.getElementById('fontFamilyInput') as HTMLInputElement;
  dom.fontValidationIndicator = document.getElementById('fontValidationIndicator') as HTMLSpanElement;
  dom.colorChipsContainer = document.getElementById('colorChipsContainer') as HTMLDivElement;
  dom.colorHexInput = document.getElementById('colorHexInput') as HTMLInputElement;
  dom.colorPickerInput = document.getElementById('colorPickerInput') as HTMLInputElement;
  dom.addColorBtn = document.getElementById('addColorBtn') as HTMLButtonElement;
  dom.enableGridSystemCheckbox = document.getElementById('enableGridSystem') as HTMLInputElement;
  dom.customPromptInput = document.getElementById('customPromptInput') as HTMLTextAreaElement;

  dom.batchPanel = document.getElementById('batchPanel') as HTMLDivElement;
  dom.batchList = document.getElementById('batchList') as HTMLDivElement;
  dom.batchProcessBtn = document.getElementById('batchProcessBtn') as HTMLButtonElement;
  dom.batchClearBtn = document.getElementById('batchClearBtn') as HTMLButtonElement;

  // Mode-specific DOM elements
  dom.formatCards = document.querySelectorAll('.format-card') as NodeListOf<HTMLDivElement>;
  dom.contentInput = document.getElementById('contentInput') as HTMLTextAreaElement;
  dom.referenceZone = document.getElementById('referenceZone') as HTMLDivElement;
  dom.referenceInput = document.getElementById('referenceInput') as HTMLInputElement;
  dom.referencePreviews = document.getElementById('referencePreviews') as HTMLDivElement;
  dom.fontSelect = document.getElementById('fontSelect') as HTMLSelectElement;
  dom.colorPresets = document.getElementById('colorPresets') as HTMLDivElement;
  dom.customHexInput = document.getElementById('customHex') as HTMLInputElement;
  dom.generateTextDesignBtn = document.getElementById('generateTextDesignBtn') as HTMLButtonElement;
}
