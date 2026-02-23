/**
 * Shared types for the Figmento MCP server.
 */

/** Command sent to the Figma plugin via WebSocket relay */
export interface WSCommand {
  type: 'command';
  id: string;
  channel: string;
  action: string;
  params: Record<string, unknown>;
}

/** Response received from the Figma plugin */
export interface WSResponse {
  type: 'response';
  id: string;
  channel: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

/** Fill definition for design tools */
export interface FillDef {
  type: 'SOLID' | 'GRADIENT_LINEAR';
  color?: string;
  opacity?: number;
  gradientStops?: Array<{ position: number; color: string; opacity?: number }>;
}

/** Shadow effect definition */
export interface EffectDef {
  type: 'DROP_SHADOW' | 'INNER_SHADOW';
  color: string;
  opacity?: number;
  offset: { x: number; y: number };
  blur: number;
  spread?: number;
}
