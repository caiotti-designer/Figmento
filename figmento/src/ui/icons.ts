import { UIAnalysis, UIElement } from '../types';

// ═══════════════════════════════════════════════════════════════
// ICON FETCHING
// ═══════════════════════════════════════════════════════════════

const iconCache: Record<string, string[]> = {};

let iconProgressCallback: ((percent: number, message: string) => void) | null = null;

export function setIconProgress(callback: (percent: number, message: string) => void): void {
  iconProgressCallback = callback;
}

export function collectIconNames(elements: UIElement[]): string[] {
  const icons: string[] = [];

  const traverse = (els: UIElement[]): void => {
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (el.type === 'icon' && el.lucideIcon) {
        if (icons.indexOf(el.lucideIcon) === -1) {
          icons.push(el.lucideIcon);
        }
      }
      if (el.children && el.children.length > 0) {
        traverse(el.children);
      }
    }
  };

  traverse(elements);
  return icons;
}

export async function fetchLucideIcon(iconName: string): Promise<string[]> {
  if (iconCache[iconName]) {
    return iconCache[iconName];
  }

  const url = 'https://unpkg.com/lucide-static@latest/icons/' + iconName + '.svg';

  try {
    let response = await fetch(url);

    // Retry once on network failure or 5xx
    if (!response.ok && response.status >= 500) {
      await new Promise((r) => setTimeout(r, 1000));
      response = await fetch(url);
    }

    if (!response.ok) {
      console.warn('Icon not found: ' + iconName);
      return [];
    }

    const svgText = await response.text();
    if (!svgText) return [];

    const paths: string[] = [];

    const pathRegex = /<path[^>]*d="([^"]+)"[^>]*>/g;
    let match;
    while ((match = pathRegex.exec(svgText)) !== null) {
      paths.push(match[1]);
    }

    const lineRegex = /<line[^>]*x1="([^"]+)"[^>]*y1="([^"]+)"[^>]*x2="([^"]+)"[^>]*y2="([^"]+)"[^>]*>/g;
    while ((match = lineRegex.exec(svgText)) !== null) {
      paths.push('M ' + match[1] + ' ' + match[2] + ' L ' + match[3] + ' ' + match[4]);
    }

    const circleRegex = /<circle[^>]*cx="([^"]+)"[^>]*cy="([^"]+)"[^>]*r="([^"]+)"[^>]*>/g;
    while ((match = circleRegex.exec(svgText)) !== null) {
      const cx = parseFloat(match[1]);
      const cy = parseFloat(match[2]);
      const r = parseFloat(match[3]);
      const k = 0.552284749831;
      paths.push(
        'M ' +
          (cx - r) +
          ' ' +
          cy +
          ' C ' +
          (cx - r) +
          ' ' +
          (cy - r * k) +
          ' ' +
          (cx - r * k) +
          ' ' +
          (cy - r) +
          ' ' +
          cx +
          ' ' +
          (cy - r) +
          ' C ' +
          (cx + r * k) +
          ' ' +
          (cy - r) +
          ' ' +
          (cx + r) +
          ' ' +
          (cy - r * k) +
          ' ' +
          (cx + r) +
          ' ' +
          cy +
          ' C ' +
          (cx + r) +
          ' ' +
          (cy + r * k) +
          ' ' +
          (cx + r * k) +
          ' ' +
          (cy + r) +
          ' ' +
          cx +
          ' ' +
          (cy + r) +
          ' C ' +
          (cx - r * k) +
          ' ' +
          (cy + r) +
          ' ' +
          (cx - r) +
          ' ' +
          (cy + r * k) +
          ' ' +
          (cx - r) +
          ' ' +
          cy +
          ' Z'
      );
    }

    const rectRegex =
      /<rect[^>]*x="([^"]+)"[^>]*y="([^"]+)"[^>]*width="([^"]+)"[^>]*height="([^"]+)"[^>]*(?:rx="([^"]+)")?[^>]*>/g;
    while ((match = rectRegex.exec(svgText)) !== null) {
      const x = parseFloat(match[1]);
      const y = parseFloat(match[2]);
      const w = parseFloat(match[3]);
      const h = parseFloat(match[4]);
      paths.push(
        'M ' +
          x +
          ' ' +
          y +
          ' L ' +
          (x + w) +
          ' ' +
          y +
          ' L ' +
          (x + w) +
          ' ' +
          (y + h) +
          ' L ' +
          x +
          ' ' +
          (y + h) +
          ' Z'
      );
    }

    const polylineRegex = /<polyline[^>]*points="([^"]+)"[^>]*>/g;
    while ((match = polylineRegex.exec(svgText)) !== null) {
      const points = match[1].trim().split(/[\s,]+/);
      let polyPath = '';
      for (let i = 0; i < points.length; i += 2) {
        polyPath += (i === 0 ? 'M ' : ' L ') + points[i] + ' ' + points[i + 1];
      }
      paths.push(polyPath);
    }

    const polygonRegex = /<polygon[^>]*points="([^"]+)"[^>]*>/g;
    while ((match = polygonRegex.exec(svgText)) !== null) {
      const polyPoints = match[1].trim().split(/[\s,]+/);
      let polygonPath = '';
      for (let j = 0; j < polyPoints.length; j += 2) {
        polygonPath += (j === 0 ? 'M ' : ' L ') + polyPoints[j] + ' ' + polyPoints[j + 1];
      }
      polygonPath += ' Z';
      paths.push(polygonPath);
    }

    iconCache[iconName] = paths;
    return paths;
  } catch {
    console.warn('Failed to fetch icon: ' + iconName);
    return [];
  }
}

export async function fetchAllIcons(analysis: UIAnalysis): Promise<UIAnalysis> {
  const iconNames = collectIconNames(analysis.elements);

  if (iconNames.length === 0) {
    return analysis;
  }

  const totalIcons = iconNames.length;
  let completedIcons = 0;

  const fetchPromises = iconNames.map(async (name) => {
    const paths = await fetchLucideIcon(name);
    completedIcons++;
    // Progress: 60% + (completedIcons / totalIcons) * 15% = 60% to 75%
    const iconProgress = 60 + (completedIcons / totalIcons) * 15;
    if (iconProgressCallback) {
      iconProgressCallback(iconProgress, 'Fetching icons (' + completedIcons + '/' + totalIcons + ')...');
    }
    return { name, paths };
  });

  const results = await Promise.all(fetchPromises);

  const iconPaths: Record<string, string[]> = {};
  for (let i = 0; i < results.length; i++) {
    iconPaths[results[i].name] = results[i].paths;
  }

  const attachPaths = (elements: UIElement[]): void => {
    for (let j = 0; j < elements.length; j++) {
      const el = elements[j];
      if (el.type === 'icon' && el.lucideIcon && iconPaths[el.lucideIcon]) {
        (el as UIElement & { svgPaths: string[] }).svgPaths = iconPaths[el.lucideIcon];
      }
      if (el.children && el.children.length > 0) {
        attachPaths(el.children);
      }
    }
  };

  attachPaths(analysis.elements);
  return analysis;
}
