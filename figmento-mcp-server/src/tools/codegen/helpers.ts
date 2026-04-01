/**
 * Inline JavaScript helper functions embedded in generated use_figma code.
 * These are string constants — they execute in Figma's Plugin API runtime, not in Node.
 */

export const HELPER_HEX_TO_RGB = `const hexToRgb = (hex) => {
  if (!hex) return { r: 0, g: 0, b: 0 };
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const m = /^([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(h);
  return m ? { r: parseInt(m[1],16)/255, g: parseInt(m[2],16)/255, b: parseInt(m[3],16)/255 } : { r:0, g:0, b:0 };
};`;

export const HELPER_GET_FONT_STYLE = `const getFontStyle = (w) => {
  const s = {100:'Thin',200:'Extra Light',300:'Light',400:'Regular',500:'Medium',600:'Semi Bold',700:'Bold',800:'Extra Bold',900:'Black'};
  const ws = [100,200,300,400,500,600,700,800,900];
  return s[ws.reduce((p,c) => Math.abs(c-w)<Math.abs(p-w)?c:p)] || 'Regular';
};`;

export const HELPER_GRADIENT_TRANSFORMS = `const gradientTransforms = {
  'top-bottom':    [[1,0,0],[0,1,0]],
  'bottom-top':    [[1,0,0],[0,-1,1]],
  'left-right':    [[0,1,0],[-1,0,1]],
  'right-left':    [[0,-1,1],[1,0,0]],
  'top-left-bottom-right': [[0.71,0.71,0],[-0.71,0.71,0.5]],
  'top-right-bottom-left': [[-0.71,0.71,1],[0.71,0.71,0]],
};`;

/** Detect which helpers a command set needs */
export function detectNeededHelpers(commands: Array<{ action: string; params: Record<string, unknown> }>): string[] {
  const helpers: string[] = [];
  let needsHex = false;
  let needsFont = false;
  let needsGradient = false;

  for (const cmd of commands) {
    const p = cmd.params;
    const json = JSON.stringify(p);

    // Hex color detection
    if (p.color || p.fillColor || p.fills || json.includes('#')) needsHex = true;

    // Font detection
    if (cmd.action === 'create_text' || p.fontWeight || p.fontFamily) needsFont = true;

    // Gradient detection
    if (p.gradientDirection || json.includes('GRADIENT')) needsGradient = true;
  }

  if (needsHex) helpers.push(HELPER_HEX_TO_RGB);
  if (needsFont) helpers.push(HELPER_GET_FONT_STYLE);
  if (needsGradient) {
    if (!needsHex) helpers.push(HELPER_HEX_TO_RGB);
    helpers.push(HELPER_GRADIENT_TRANSFORMS);
  }

  return helpers;
}
