/**
 * Shared types for Figmento Plugin (MCP edition).
 * Keeps the design schema types from the original plugin.
 * Adds WebSocket command/response types.
 */

// ═══════════════════════════════════════════════════════════════
// DESIGN SCHEMA TYPES (reused from original figmento)
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

/** Structured error codes for command failures */
export type CommandErrorCode =
  | 'NODE_NOT_FOUND'
  | 'FONT_LOAD_FAILED'
  | 'EXPORT_FAILED'
  | 'INVALID_PARAMS'
  | 'PARENT_MISMATCH'
  | 'IMAGE_DECODE_FAILED'
  | 'TIMEOUT'
  | 'UNKNOWN';

/** Structured command error with recoverability hint */
export interface CommandError {
  code: CommandErrorCode;
  message: string;
  recoverable: boolean;
}

/** Command from MCP server via WebSocket */
export interface WSCommand {
  type: 'command';
  id: string;
  channel: string;
  action: string;
  params: Record<string, unknown>;
}

/** Response sent back to MCP server */
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

// ═══════════════════════════════════════════════════════════════
// PLUGIN MESSAGE TYPES (between UI iframe and sandbox)
// ═══════════════════════════════════════════════════════════════

export interface ExecuteCommandMessage {
  type: 'execute-command';
  command: WSCommand;
}

export interface CommandResultMessage {
  type: 'command-result';
  response: WSResponse;
}

export interface StatusMessage {
  type: 'status';
  message: string;
}

export type PluginMessage = ExecuteCommandMessage | CommandResultMessage | StatusMessage;
