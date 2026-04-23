#!/usr/bin/env node
/**
 * Figma Community Template Scraper
 *
 * Fetches node trees from Figma design files, extracts layout patterns,
 * and outputs composition analysis as JSON/YAML for the knowledge base.
 *
 * Usage:
 *   FIGMA_TOKEN=figd_xxx node scripts/scrape-figma-templates.js
 *
 * Or with a file list:
 *   FIGMA_TOKEN=figd_xxx node scripts/scrape-figma-templates.js urls.txt
 *
 * Output: scripts/output/figma-patterns.json
 *
 * NOTE: Community file URLs (figma.com/community/file/...) must be
 * duplicated to your drafts first. Use the resulting design URL.
 */

const fs = require('fs');
const path = require('path');

const FIGMA_TOKEN = process.env.FIGMA_TOKEN;
const BASE_URL = 'https://api.figma.com/v1';
const OUTPUT_DIR = path.join(__dirname, 'output');
const RATE_LIMIT_DELAY = 3000; // 3s between requests

if (!FIGMA_TOKEN) {
  console.error('Error: Set FIGMA_TOKEN environment variable.');
  console.error('Get one at: Figma > Settings > Account > Personal access tokens');
  process.exit(1);
}

// ── Curated template list (duplicate these from Figma Community first) ──
// Replace with your own file keys after duplicating community files
const DEFAULT_URLS = [
  // Add your duplicated file URLs here, e.g.:
  // 'https://www.figma.com/design/abcXYZ123/Landing-Page-Template',
];

function extractFileKey(url) {
  const match = url.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)/);
  return match?.[1] || null;
}

async function fetchWithRetry(url, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, {
      headers: { 'X-Figma-Token': FIGMA_TOKEN },
    });

    if (res.status === 429) {
      const reset = res.headers.get('X-RateLimit-Reset');
      const waitMs = reset ? (Number(reset) * 1000 - Date.now()) : 60000;
      console.warn(`  Rate limited. Waiting ${Math.ceil(waitMs / 1000)}s...`);
      await new Promise(r => setTimeout(r, Math.max(waitMs, 1000)));
      continue;
    }

    if (!res.ok) {
      throw new Error(`Figma API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }

    return res.json();
  }
  throw new Error('Max retries exceeded');
}

async function fetchFileTree(fileKey) {
  return fetchWithRetry(`${BASE_URL}/files/${fileKey}?depth=4`);
}

// ── Pattern extraction ──

function extractPattern(node, parentWidth, parentHeight) {
  const bbox = node.absoluteBoundingBox || {};
  const hasAutoLayout = node.layoutMode && node.layoutMode !== 'NONE';
  const w = bbox.width || 0;
  const h = bbox.height || 0;

  const pattern = {
    name: node.name,
    type: node.type,
    width: Math.round(w),
    height: Math.round(h),
    // Normalize position relative to parent
    relativePosition: parentWidth > 0 ? {
      x_pct: Math.round((bbox.x || 0) / parentWidth * 100) / 100,
      y_pct: Math.round((bbox.y || 0) / parentHeight * 100) / 100,
      w_pct: Math.round(w / parentWidth * 100) / 100,
      h_pct: Math.round(h / parentHeight * 100) / 100,
    } : null,
  };

  // Auto-layout info
  if (hasAutoLayout) {
    pattern.autoLayout = {
      direction: node.layoutMode,
      primaryAlign: node.primaryAxisAlignItems || 'MIN',
      counterAlign: node.counterAxisAlignItems || 'MIN',
      padding: {
        top: node.paddingTop || 0,
        right: node.paddingRight || 0,
        bottom: node.paddingBottom || 0,
        left: node.paddingLeft || 0,
      },
      itemSpacing: node.itemSpacing || 0,
    };
  }

  // Typography info
  if (node.type === 'TEXT' && node.style) {
    pattern.typography = {
      fontFamily: node.style.fontFamily,
      fontSize: node.style.fontSize,
      fontWeight: node.style.fontWeight,
      textAlign: node.style.textAlignHorizontal,
      lineHeight: node.style.lineHeightPx,
      letterSpacing: node.style.letterSpacing,
    };
    pattern.textLength = (node.characters || '').length;
  }

  // Fill type
  if (node.fills?.length > 0) {
    const fill = node.fills.find(f => f.visible !== false);
    if (fill) pattern.fillType = fill.type;
  }

  // Corner radius
  if (node.cornerRadius) pattern.cornerRadius = node.cornerRadius;

  // Recurse children
  if (node.children?.length > 0) {
    pattern.childCount = node.children.length;
    pattern.children = node.children
      .filter(c => c.visible !== false)
      .slice(0, 20) // Limit to avoid huge output
      .map(c => extractPattern(c, w, h));
  }

  return pattern;
}

function analyzeFrame(frame) {
  const pattern = extractPattern(frame, frame.absoluteBoundingBox?.width || 0, frame.absoluteBoundingBox?.height || 0);

  // Compute summary stats
  const textNodes = [];
  const frameNodes = [];
  const imageNodes = [];

  function walk(node) {
    if (node.type === 'TEXT') textNodes.push(node);
    if (node.type === 'FRAME' && node.autoLayout) frameNodes.push(node);
    if (node.fillType === 'IMAGE') imageNodes.push(node);
    if (node.children) node.children.forEach(walk);
  }
  walk(pattern);

  return {
    ...pattern,
    summary: {
      textNodeCount: textNodes.length,
      autoLayoutFrameCount: frameNodes.length,
      imageNodeCount: imageNodes.length,
      fontFamilies: [...new Set(textNodes.map(t => t.typography?.fontFamily).filter(Boolean))],
      fontSizes: [...new Set(textNodes.map(t => t.typography?.fontSize).filter(Boolean))].sort((a, b) => b - a),
      autoLayoutDirections: frameNodes.reduce((acc, f) => {
        const dir = f.autoLayout.direction;
        acc[dir] = (acc[dir] || 0) + 1;
        return acc;
      }, {}),
    },
  };
}

// ── Aggregate analysis ──

function aggregatePatterns(allPatterns) {
  const fontUsage = {};
  const fontSizeDistribution = {};
  const layoutDirections = { HORIZONTAL: 0, VERTICAL: 0 };
  const paddingValues = [];
  const spacingValues = [];
  const cornerRadii = [];
  let totalFrames = 0;
  let totalAutoLayout = 0;

  for (const fileData of allPatterns) {
    for (const page of fileData.pages) {
      for (const frame of page.topLevelFrames) {
        totalFrames++;

        function walkAggregate(node) {
          // Fonts
          if (node.typography?.fontFamily) {
            fontUsage[node.typography.fontFamily] = (fontUsage[node.typography.fontFamily] || 0) + 1;
          }
          if (node.typography?.fontSize) {
            const bucket = Math.round(node.typography.fontSize);
            fontSizeDistribution[bucket] = (fontSizeDistribution[bucket] || 0) + 1;
          }
          // Auto-layout
          if (node.autoLayout) {
            totalAutoLayout++;
            layoutDirections[node.autoLayout.direction]++;
            const p = node.autoLayout.padding;
            if (p.top > 0) paddingValues.push(p.top);
            if (p.left > 0) paddingValues.push(p.left);
            if (node.autoLayout.itemSpacing > 0) spacingValues.push(node.autoLayout.itemSpacing);
          }
          if (node.cornerRadius > 0) cornerRadii.push(node.cornerRadius);
          if (node.children) node.children.forEach(walkAggregate);
        }
        walkAggregate(frame);
      }
    }
  }

  // Compute percentiles
  const percentile = (arr, p) => {
    if (arr.length === 0) return 0;
    arr.sort((a, b) => a - b);
    const idx = Math.floor(arr.length * p);
    return arr[Math.min(idx, arr.length - 1)];
  };

  return {
    totalFiles: allPatterns.length,
    totalTopLevelFrames: totalFrames,
    autoLayoutAdoption: totalAutoLayout > 0 ? `${Math.round(totalAutoLayout / Math.max(totalFrames, 1) * 100)}%` : '0%',
    topFonts: Object.entries(fontUsage).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([f, c]) => ({ font: f, count: c })),
    topFontSizes: Object.entries(fontSizeDistribution).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s, c]) => ({ size: Number(s), count: c })),
    layoutDirectionSplit: layoutDirections,
    padding: {
      p25: percentile(paddingValues, 0.25),
      p50: percentile(paddingValues, 0.50),
      p75: percentile(paddingValues, 0.75),
      p90: percentile(paddingValues, 0.90),
    },
    spacing: {
      p25: percentile(spacingValues, 0.25),
      p50: percentile(spacingValues, 0.50),
      p75: percentile(spacingValues, 0.75),
      p90: percentile(spacingValues, 0.90),
    },
    cornerRadii: {
      p25: percentile(cornerRadii, 0.25),
      p50: percentile(cornerRadii, 0.50),
      p75: percentile(cornerRadii, 0.75),
      most_common: cornerRadii.length > 0 ?
        Object.entries(cornerRadii.reduce((acc, r) => { acc[r] = (acc[r] || 0) + 1; return acc; }, {}))
          .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([r, c]) => ({ radius: Number(r), count: c })) : [],
    },
  };
}

// ── Main ──

async function main() {
  // Load URLs from file or use defaults
  let urls = DEFAULT_URLS;
  const urlFile = process.argv[2];
  if (urlFile && fs.existsSync(urlFile)) {
    urls = fs.readFileSync(urlFile, 'utf-8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#') && l.includes('figma.com'));
    console.log(`Loaded ${urls.length} URLs from ${urlFile}`);
  }

  if (urls.length === 0) {
    console.log('No URLs provided. Create a urls.txt file with Figma design URLs (one per line).');
    console.log('To get URLs: browse figma.com/community, duplicate files to your drafts, copy the design URL.');
    console.log('\nExample urls.txt:');
    console.log('  https://www.figma.com/design/abcXYZ123/Landing-Page');
    console.log('  https://www.figma.com/design/defUVW456/Dashboard');
    process.exit(0);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const allPatterns = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const fileKey = extractFileKey(url);
    if (!fileKey) {
      console.warn(`Skipping invalid URL: ${url}`);
      continue;
    }

    console.log(`[${i + 1}/${urls.length}] Fetching ${fileKey}...`);
    try {
      const file = await fetchFileTree(fileKey);

      const pages = (file.document?.children || []).map(page => ({
        name: page.name,
        topLevelFrames: (page.children || [])
          .filter(c => c.type === 'FRAME' || c.type === 'COMPONENT' || c.type === 'SECTION')
          .slice(0, 10) // Limit frames per page
          .map(analyzeFrame),
      }));

      allPatterns.push({
        fileKey,
        name: file.name,
        lastModified: file.lastModified,
        componentCount: Object.keys(file.components || {}).length,
        styleCount: Object.keys(file.styles || {}).length,
        pages,
      });

      console.log(`  ✓ ${file.name} — ${pages.reduce((s, p) => s + p.topLevelFrames.length, 0)} frames`);
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
    }

    // Rate limit
    if (i < urls.length - 1) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY));
    }
  }

  if (allPatterns.length === 0) {
    console.log('No files successfully fetched.');
    process.exit(1);
  }

  // Save raw patterns
  const rawPath = path.join(OUTPUT_DIR, 'figma-patterns.json');
  fs.writeFileSync(rawPath, JSON.stringify(allPatterns, null, 2));
  console.log(`\nRaw patterns: ${rawPath}`);

  // Aggregate analysis
  const aggregate = aggregatePatterns(allPatterns);
  const aggPath = path.join(OUTPUT_DIR, 'figma-aggregate-analysis.json');
  fs.writeFileSync(aggPath, JSON.stringify(aggregate, null, 2));
  console.log(`Aggregate analysis: ${aggPath}`);

  // Summary
  console.log('\n── Aggregate Summary ──');
  console.log(`Files analyzed: ${aggregate.totalFiles}`);
  console.log(`Top-level frames: ${aggregate.totalTopLevelFrames}`);
  console.log(`Auto-layout adoption: ${aggregate.autoLayoutAdoption}`);
  console.log(`Top fonts: ${aggregate.topFonts.slice(0, 5).map(f => f.font).join(', ')}`);
  console.log(`Padding median: ${aggregate.padding.p50}px`);
  console.log(`Spacing median: ${aggregate.spacing.p50}px`);
  console.log(`Corner radius median: ${aggregate.cornerRadii.p50}px`);
  console.log('\nDone! Review the output and copy relevant patterns to knowledge/ YAMLs.');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
