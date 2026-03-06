/**
 * SVG path parsing and normalization utilities.
 *
 * Figma only supports M, L, C, Q, Z commands (all absolute).
 * These utilities convert all SVG path commands into those
 * basic forms, including arc-to-cubic-bezier conversion.
 */

export interface PathCommand {
  type: string;
  params: number[];
}

/**
 * Normalizes and scales SVG path data for Figma compatibility.
 */
export function scalePathData(pathData: string, scale: number): string {
  const commands = parsePath(pathData);
  const normalized = normalizeCommands(commands);

  const result: string[] = [];
  for (let i = 0; i < normalized.length; i++) {
    const cmd = normalized[i];
    result.push(cmd.type);
    for (let j = 0; j < cmd.params.length; j++) {
      result.push((cmd.params[j] * scale).toFixed(2));
    }
  }

  return result.join(' ');
}

/**
 * Tokenizes an SVG path string into commands and numeric parameters.
 */
export function parsePath(pathData: string): PathCommand[] {
  const SVG_COMMANDS = 'MmLlHhVvCcSsQqTtAaZz';
  const commands: PathCommand[] = [];
  let currentCmd: PathCommand | null = null;
  let currentToken = '';

  function pushToken() {
    if (currentToken.length > 0) {
      const num = parseFloat(currentToken);
      if (!isNaN(num) && currentCmd) {
        currentCmd.params.push(num);
      }
      currentToken = '';
    }
  }

  for (let i = 0; i < pathData.length; i++) {
    const char = pathData[i];

    // Whitespace and commas are separators
    if (char === ' ' || char === ',' || char === '\t' || char === '\n' || char === '\r') {
      pushToken();
      continue;
    }

    // Command letter
    if (SVG_COMMANDS.indexOf(char) !== -1) {
      pushToken();
      currentCmd = { type: char, params: [] };
      commands.push(currentCmd);
      continue;
    }

    // Negative sign can start a new number
    if (char === '-' && currentToken.length > 0 && !/[eE]$/.test(currentToken)) {
      pushToken();
      currentToken = '-';
      continue;
    }

    // Decimal point can start a new number if current token already has one
    if (char === '.' && currentToken.indexOf('.') !== -1) {
      pushToken();
      currentToken = '.';
      continue;
    }

    currentToken += char;
  }
  pushToken();

  return commands;
}

/**
 * Converts all path commands to absolute M, L, C, Q, Z.
 *
 * Handles relative-to-absolute conversion, shorthand curves (S, T),
 * horizontal/vertical lines (H, V), and arcs (A → cubic beziers).
 */
export function normalizeCommands(commands: PathCommand[]): PathCommand[] {
  const result: PathCommand[] = [];
  let x = 0,
    y = 0; // Current position
  let startX = 0,
    startY = 0; // Start of current subpath
  let lastCtrlX = 0,
    lastCtrlY = 0; // Last control point for S/T
  let lastCmd = '';

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    const type = cmd.type;
    const params = cmd.params;
    const isRelative = type === type.toLowerCase();
    const absType = type.toUpperCase();

    switch (absType) {
      case 'M': {
        for (let j = 0; j < params.length; j += 2) {
          const mx = isRelative ? x + params[j] : params[j];
          const my = isRelative ? y + params[j + 1] : params[j + 1];
          if (j === 0) {
            result.push({ type: 'M', params: [mx, my] });
            startX = mx;
            startY = my;
          } else {
            result.push({ type: 'L', params: [mx, my] });
          }
          x = mx;
          y = my;
        }
        lastCtrlX = x;
        lastCtrlY = y;
        break;
      }

      case 'L': {
        for (let j = 0; j < params.length; j += 2) {
          const lx = isRelative ? x + params[j] : params[j];
          const ly = isRelative ? y + params[j + 1] : params[j + 1];
          result.push({ type: 'L', params: [lx, ly] });
          x = lx;
          y = ly;
        }
        lastCtrlX = x;
        lastCtrlY = y;
        break;
      }

      case 'H': {
        for (let j = 0; j < params.length; j++) {
          const hx = isRelative ? x + params[j] : params[j];
          result.push({ type: 'L', params: [hx, y] });
          x = hx;
        }
        lastCtrlX = x;
        lastCtrlY = y;
        break;
      }

      case 'V': {
        for (let j = 0; j < params.length; j++) {
          const vy = isRelative ? y + params[j] : params[j];
          result.push({ type: 'L', params: [x, vy] });
          y = vy;
        }
        lastCtrlX = x;
        lastCtrlY = y;
        break;
      }

      case 'C': {
        for (let j = 0; j < params.length; j += 6) {
          const c1x = isRelative ? x + params[j] : params[j];
          const c1y = isRelative ? y + params[j + 1] : params[j + 1];
          const c2x = isRelative ? x + params[j + 2] : params[j + 2];
          const c2y = isRelative ? y + params[j + 3] : params[j + 3];
          const cx = isRelative ? x + params[j + 4] : params[j + 4];
          const cy = isRelative ? y + params[j + 5] : params[j + 5];
          result.push({ type: 'C', params: [c1x, c1y, c2x, c2y, cx, cy] });
          lastCtrlX = c2x;
          lastCtrlY = c2y;
          x = cx;
          y = cy;
        }
        break;
      }

      case 'S': {
        for (let j = 0; j < params.length; j += 4) {
          let sc1x = x,
            sc1y = y;
          if (lastCmd === 'C' || lastCmd === 'S') {
            sc1x = 2 * x - lastCtrlX;
            sc1y = 2 * y - lastCtrlY;
          }
          const sc2x = isRelative ? x + params[j] : params[j];
          const sc2y = isRelative ? y + params[j + 1] : params[j + 1];
          const sx = isRelative ? x + params[j + 2] : params[j + 2];
          const sy = isRelative ? y + params[j + 3] : params[j + 3];
          result.push({ type: 'C', params: [sc1x, sc1y, sc2x, sc2y, sx, sy] });
          lastCtrlX = sc2x;
          lastCtrlY = sc2y;
          x = sx;
          y = sy;
        }
        break;
      }

      case 'Q': {
        for (let j = 0; j < params.length; j += 4) {
          const qcx = isRelative ? x + params[j] : params[j];
          const qcy = isRelative ? y + params[j + 1] : params[j + 1];
          const qx = isRelative ? x + params[j + 2] : params[j + 2];
          const qy = isRelative ? y + params[j + 3] : params[j + 3];
          result.push({ type: 'Q', params: [qcx, qcy, qx, qy] });
          lastCtrlX = qcx;
          lastCtrlY = qcy;
          x = qx;
          y = qy;
        }
        break;
      }

      case 'T': {
        for (let j = 0; j < params.length; j += 2) {
          let tcx = x,
            tcy = y;
          if (lastCmd === 'Q' || lastCmd === 'T') {
            tcx = 2 * x - lastCtrlX;
            tcy = 2 * y - lastCtrlY;
          }
          const tx = isRelative ? x + params[j] : params[j];
          const ty = isRelative ? y + params[j + 1] : params[j + 1];
          result.push({ type: 'Q', params: [tcx, tcy, tx, ty] });
          lastCtrlX = tcx;
          lastCtrlY = tcy;
          x = tx;
          y = ty;
        }
        break;
      }

      case 'A': {
        for (let j = 0; j < params.length; j += 7) {
          const rx = params[j];
          const ry = params[j + 1];
          const rotation = params[j + 2];
          const largeArc = params[j + 3];
          const sweep = params[j + 4];
          const ax = isRelative ? x + params[j + 5] : params[j + 5];
          const ay = isRelative ? y + params[j + 6] : params[j + 6];

          const arcCurves = arcToCubicBeziers(x, y, rx, ry, rotation, largeArc, sweep, ax, ay);
          for (let k = 0; k < arcCurves.length; k++) {
            result.push(arcCurves[k]);
          }

          x = ax;
          y = ay;
        }
        lastCtrlX = x;
        lastCtrlY = y;
        break;
      }

      case 'Z': {
        result.push({ type: 'Z', params: [] });
        x = startX;
        y = startY;
        lastCtrlX = x;
        lastCtrlY = y;
        break;
      }
    }

    lastCmd = absType;
  }

  return result;
}

/**
 * Converts an SVG arc to one or more cubic Bezier curves.
 * Splits arcs larger than 90 degrees into multiple segments.
 */
export function arcToCubicBeziers(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  rotation: number,
  largeArc: number,
  sweep: number,
  x2: number,
  y2: number
): PathCommand[] {
  if (x1 === x2 && y1 === y2) return [];

  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0) return [{ type: 'L', params: [x2, y2] }];

  const phi = (rotation * Math.PI) / 180;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);

  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const sqrtLambda = Math.sqrt(lambda);
    rx = sqrtLambda * rx;
    ry = sqrtLambda * ry;
  }

  const rxSq = rx * rx;
  const rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;

  let radicand = (rxSq * rySq - rxSq * y1pSq - rySq * x1pSq) / (rxSq * y1pSq + rySq * x1pSq);
  radicand = Math.max(0, radicand);
  let coef = Math.sqrt(radicand);
  if (largeArc === sweep) coef = -coef;

  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const theta1 = vectorAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dtheta = vectorAngle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);

  if (sweep === 0 && dtheta > 0) dtheta -= 2 * Math.PI;
  else if (sweep === 1 && dtheta < 0) dtheta += 2 * Math.PI;

  const numSegs = Math.ceil(Math.abs(dtheta) / (Math.PI / 2));
  const delta = dtheta / numSegs;
  const t = (4 / 3) * Math.tan(delta / 4);

  const result: PathCommand[] = [];
  let angle = theta1;

  for (let seg = 0; seg < numSegs; seg++) {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const cosB = Math.cos(angle + delta);
    const sinB = Math.sin(angle + delta);

    const cp1x = cx + cosPhi * rx * (cosA - t * sinA) - sinPhi * ry * (sinA + t * cosA);
    const cp1y = cy + sinPhi * rx * (cosA - t * sinA) + cosPhi * ry * (sinA + t * cosA);
    const cp2x = cx + cosPhi * rx * (cosB + t * sinB) - sinPhi * ry * (sinB - t * cosB);
    const cp2y = cy + sinPhi * rx * (cosB + t * sinB) + cosPhi * ry * (sinB - t * cosB);
    const epx = cx + cosPhi * rx * cosB - sinPhi * ry * sinB;
    const epy = cy + sinPhi * rx * cosB + cosPhi * ry * sinB;

    result.push({ type: 'C', params: [cp1x, cp1y, cp2x, cp2y, epx, epy] });
    angle += delta;
  }

  return result;
}

/**
 * Calculates the signed angle between two vectors.
 */
export function vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
  const sign = ux * vy - uy * vx < 0 ? -1 : 1;
  const dot = ux * vx + uy * vy;
  const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
  if (len === 0) return 0;
  const cosVal = Math.max(-1, Math.min(1, dot / len));
  return sign * Math.acos(cosVal);
}
