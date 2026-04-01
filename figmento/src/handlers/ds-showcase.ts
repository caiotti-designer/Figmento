/// <reference types="@figma/plugin-typings" />

import { hexToRgb, getFontStyle } from '../color-utils';

/**
 * ODS Showcase — Visual Design System reference page.
 * Creates a professional DS showcase frame with:
 * - Header with brand name
 * - Color palette swatches
 * - Typography specimens
 * - Component showcase (Button, Card, Badge)
 * - Icon collection grid
 * - Spacing scale
 */

interface ShowcaseColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  muted: string;
  surface: string;
  scales: Record<string, Record<string, string>>;
  neutrals: Record<string, string>;
}

interface ShowcaseParams {
  brandName: string;
  colors: ShowcaseColors;
  typography: {
    headingFont: string;
    bodyFont: string;
    headingWeight: number;
    bodyWeight: number;
  };
  spacing: { scale: number[] };
  radius: { default: number; values: Record<string, number> };
  icons?: string[];
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function solidFill(hex: string): SolidPaint[] {
  const rgb = hexToRgb(hex);
  return [{ type: 'SOLID', color: { r: rgb.r, g: rgb.g, b: rgb.b } }];
}

async function loadFont(family: string, weight: number): Promise<FontName> {
  const clamped = weight <= 500 ? 400 : 700;
  const style = getFontStyle(clamped);
  try {
    await figma.loadFontAsync({ family, style });
    return { family, style };
  } catch {
    try {
      await figma.loadFontAsync({ family, style: 'Regular' });
      return { family, style: 'Regular' };
    } catch {
      await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
      return { family: 'Inter', style: 'Regular' };
    }
  }
}

function createSectionTitle(text: string, fontName: FontName, parent: FrameNode | ComponentNode, textColor: string): TextNode {
  const node = figma.createText();
  node.fontName = fontName;
  node.characters = text;
  node.fontSize = 14;
  node.fills = solidFill(textColor);
  node.letterSpacing = { value: 3, unit: 'PIXELS' };
  node.textCase = 'UPPER';
  parent.appendChild(node);
  return node;
}

function createDivider(parent: FrameNode, color: string, width: number): RectangleNode {
  const div = figma.createRectangle();
  div.resize(width, 1);
  div.fills = solidFill(color);
  div.opacity = 0.15;
  parent.appendChild(div);
  return div;
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

export async function handleCreateDSShowcase(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const config = params as unknown as ShowcaseParams;
  const { brandName, colors, typography, spacing, radius } = config;
  const icons = config.icons || ['home', 'search', 'settings', 'user', 'mail', 'phone', 'star', 'heart', 'zap', 'shield', 'globe', 'camera'];

  const FRAME_W = 1440;
  const PAD = 80;
  const CONTENT_W = FRAME_W - PAD * 2;
  const BG_COLOR = colors.background || '#FFFFFF';
  const TEXT_COLOR = colors.text || '#1A202C';
  const MUTED_COLOR = colors.muted || '#718096';

  // Load fonts
  const headingFontName = await loadFont(typography.headingFont, typography.headingWeight);
  const bodyFontName = await loadFont(typography.bodyFont, typography.bodyWeight);
  const boldBodyFontName = await loadFont(typography.bodyFont, 700);

  // ── Root frame ──────────────────────────────────────────────
  const root = figma.createFrame();
  root.name = `${brandName} — Design System`;
  root.resize(FRAME_W, 100); // will grow with HUG
  root.fills = solidFill(BG_COLOR);
  root.layoutMode = 'VERTICAL';
  root.layoutSizingVertical = 'HUG';
  root.paddingTop = PAD;
  root.paddingBottom = PAD;
  root.paddingLeft = PAD;
  root.paddingRight = PAD;
  root.itemSpacing = 64;

  // ══════════════════════════════════════════════════════════════
  // SECTION 1: Header
  // ══════════════════════════════════════════════════════════════
  const header = figma.createFrame();
  header.name = 'Header';
  header.layoutMode = 'VERTICAL';
  header.layoutSizingHorizontal = 'FILL';
  header.layoutSizingVertical = 'HUG';
  header.itemSpacing = 16;
  header.fills = [];

  const title = figma.createText();
  title.fontName = headingFontName;
  title.characters = brandName;
  title.fontSize = 56;
  title.fills = solidFill(TEXT_COLOR);
  title.lineHeight = { value: 64, unit: 'PIXELS' };
  header.appendChild(title);

  const subtitle = figma.createText();
  subtitle.fontName = bodyFontName;
  subtitle.characters = 'Design System';
  subtitle.fontSize = 20;
  subtitle.fills = solidFill(MUTED_COLOR);
  subtitle.lineHeight = { value: 28, unit: 'PIXELS' };
  header.appendChild(subtitle);

  root.appendChild(header);

  createDivider(root, TEXT_COLOR, CONTENT_W);

  // ══════════════════════════════════════════════════════════════
  // SECTION 2: Color Palette
  // ══════════════════════════════════════════════════════════════
  const colorSection = figma.createFrame();
  colorSection.name = 'Color Palette';
  colorSection.layoutMode = 'VERTICAL';
  colorSection.layoutSizingHorizontal = 'FILL';
  colorSection.layoutSizingVertical = 'HUG';
  colorSection.itemSpacing = 32;
  colorSection.fills = [];

  createSectionTitle('Color Palette', boldBodyFontName, colorSection, MUTED_COLOR);

  // Primary / Secondary / Accent scales
  for (const [colorName, scale] of Object.entries(colors.scales || {})) {
    const row = figma.createFrame();
    row.name = `${colorName} scale`;
    row.layoutMode = 'HORIZONTAL';
    row.layoutSizingHorizontal = 'FILL';
    row.layoutSizingVertical = 'HUG';
    row.itemSpacing = 8;
    row.fills = [];

    // Label
    const label = figma.createText();
    label.fontName = boldBodyFontName;
    label.characters = colorName.charAt(0).toUpperCase() + colorName.slice(1);
    label.fontSize = 13;
    label.fills = solidFill(MUTED_COLOR);
    label.resize(80, 20);
    label.layoutSizingVertical = 'HUG';
    row.appendChild(label);

    // Swatches
    const sortedSteps = Object.entries(scale).sort((a, b) => Number(a[0]) - Number(b[0]));
    for (const [step, hex] of sortedSteps) {
      const swatchFrame = figma.createFrame();
      swatchFrame.name = `${colorName}/${step}`;
      swatchFrame.layoutMode = 'VERTICAL';
      swatchFrame.primaryAxisAlignItems = 'CENTER';
      swatchFrame.counterAxisAlignItems = 'CENTER';
      swatchFrame.layoutSizingHorizontal = 'FILL';
      swatchFrame.layoutSizingVertical = 'HUG';
      swatchFrame.itemSpacing = 6;
      swatchFrame.fills = [];

      const swatch = figma.createRectangle();
      swatch.name = `swatch-${step}`;
      swatch.resize(100, 56);
      swatch.cornerRadius = 8;
      swatch.fills = solidFill(hex);
      swatchFrame.appendChild(swatch);

      const stepLabel = figma.createText();
      stepLabel.fontName = bodyFontName;
      stepLabel.characters = step;
      stepLabel.fontSize = 11;
      stepLabel.fills = solidFill(MUTED_COLOR);
      swatchFrame.appendChild(stepLabel);

      const hexLabel = figma.createText();
      hexLabel.fontName = bodyFontName;
      hexLabel.characters = hex;
      hexLabel.fontSize = 10;
      hexLabel.fills = solidFill(MUTED_COLOR);
      hexLabel.opacity = 0.6;
      swatchFrame.appendChild(hexLabel);

      row.appendChild(swatchFrame);
    }

    colorSection.appendChild(row);
  }

  // Semantic colors row
  const semanticRow = figma.createFrame();
  semanticRow.name = 'Semantic Colors';
  semanticRow.layoutMode = 'HORIZONTAL';
  semanticRow.layoutSizingHorizontal = 'FILL';
  semanticRow.layoutSizingVertical = 'HUG';
  semanticRow.itemSpacing = 8;
  semanticRow.fills = [];

  const semanticLabel = figma.createText();
  semanticLabel.fontName = boldBodyFontName;
  semanticLabel.characters = 'Semantic';
  semanticLabel.fontSize = 13;
  semanticLabel.fills = solidFill(MUTED_COLOR);
  semanticLabel.resize(80, 20);
  semanticLabel.layoutSizingVertical = 'HUG';
  semanticRow.appendChild(semanticLabel);

  for (const [name, hex] of Object.entries({ background: colors.background, text: colors.text, muted: colors.muted, surface: colors.surface, accent: colors.accent })) {
    if (!hex) continue;
    const sf = figma.createFrame();
    sf.name = name;
    sf.layoutMode = 'VERTICAL';
    sf.primaryAxisAlignItems = 'CENTER';
    sf.layoutSizingVertical = 'HUG';
    sf.itemSpacing = 6;
    sf.fills = [];
    sf.resize(100, 10);
    sf.layoutSizingHorizontal = 'FIXED';

    const sw = figma.createRectangle();
    sw.resize(100, 56);
    sw.cornerRadius = 8;
    sw.fills = solidFill(hex);
    // Border for light colors
    if (name === 'background' || name === 'surface') {
      sw.strokes = solidFill(MUTED_COLOR);
      sw.strokeWeight = 1;
      sw.strokeAlign = 'INSIDE';
    }
    sf.appendChild(sw);

    const nl = figma.createText();
    nl.fontName = bodyFontName;
    nl.characters = name;
    nl.fontSize = 11;
    nl.fills = solidFill(MUTED_COLOR);
    sf.appendChild(nl);

    semanticRow.appendChild(sf);
  }
  colorSection.appendChild(semanticRow);

  root.appendChild(colorSection);

  createDivider(root, TEXT_COLOR, CONTENT_W);

  // ══════════════════════════════════════════════════════════════
  // SECTION 3: Typography
  // ══════════════════════════════════════════════════════════════
  const typoSection = figma.createFrame();
  typoSection.name = 'Typography';
  typoSection.layoutMode = 'VERTICAL';
  typoSection.layoutSizingHorizontal = 'FILL';
  typoSection.layoutSizingVertical = 'HUG';
  typoSection.itemSpacing = 24;
  typoSection.fills = [];

  createSectionTitle('Typography', boldBodyFontName, typoSection, MUTED_COLOR);

  // Font pairing display
  const fontPairRow = figma.createFrame();
  fontPairRow.name = 'Font Pairing';
  fontPairRow.layoutMode = 'HORIZONTAL';
  fontPairRow.layoutSizingHorizontal = 'FILL';
  fontPairRow.layoutSizingVertical = 'HUG';
  fontPairRow.itemSpacing = 64;
  fontPairRow.fills = [];

  for (const [label, font, weight] of [
    ['Headings', typography.headingFont, typography.headingWeight],
    ['Body', typography.bodyFont, typography.bodyWeight],
  ] as [string, string, number][]) {
    const col = figma.createFrame();
    col.name = label;
    col.layoutMode = 'VERTICAL';
    col.layoutSizingVertical = 'HUG';
    col.itemSpacing = 8;
    col.fills = [];

    const lbl = figma.createText();
    lbl.fontName = bodyFontName;
    lbl.characters = label;
    lbl.fontSize = 12;
    lbl.fills = solidFill(MUTED_COLOR);
    col.appendChild(lbl);

    const specimen = figma.createText();
    const fn = await loadFont(font, weight);
    specimen.fontName = fn;
    specimen.characters = font;
    specimen.fontSize = 36;
    specimen.fills = solidFill(TEXT_COLOR);
    col.appendChild(specimen);

    fontPairRow.appendChild(col);
  }
  typoSection.appendChild(fontPairRow);

  // Pre-load body font for specimens (avoids per-row failures)
  const bodySpecimenFont = await loadFont(typography.bodyFont, typography.bodyWeight);

  // Type scale specimens
  const typeScaleData = [
    { name: 'Display', size: 56, weight: typography.headingWeight, font: typography.headingFont, sample: 'Design System' },
    { name: 'H1', size: 48, weight: typography.headingWeight, font: typography.headingFont, sample: 'Heading One' },
    { name: 'H2', size: 32, weight: typography.headingWeight, font: typography.headingFont, sample: 'Heading Two' },
    { name: 'H3', size: 24, weight: typography.headingWeight, font: typography.headingFont, sample: 'Heading Three' },
    { name: 'Body Large', size: 20, weight: typography.bodyWeight, font: typography.bodyFont, sample: 'Body large text for lead paragraphs and introductions.' },
    { name: 'Body', size: 16, weight: typography.bodyWeight, font: typography.bodyFont, sample: 'Regular body text for paragraphs, descriptions, and general content.' },
    { name: 'Body Small', size: 14, weight: typography.bodyWeight, font: typography.bodyFont, sample: 'Small body text for secondary information and metadata.' },
    { name: 'Caption', size: 12, weight: typography.bodyWeight, font: typography.bodyFont, sample: 'Caption text for labels, timestamps, and fine print.' },
  ];

  for (const ts of typeScaleData) {
    const row = figma.createFrame();
    row.name = `Type/${ts.name}`;
    row.layoutMode = 'HORIZONTAL';
    row.layoutSizingHorizontal = 'FILL';
    row.layoutSizingVertical = 'HUG';
    row.counterAxisAlignItems = 'CENTER';
    row.itemSpacing = 24;
    row.fills = [];

    // Label column (fixed width)
    const labelCol = figma.createFrame();
    labelCol.name = 'label';
    labelCol.resize(120, 10);
    labelCol.layoutMode = 'VERTICAL';
    labelCol.layoutSizingHorizontal = 'FIXED';
    labelCol.layoutSizingVertical = 'HUG';
    labelCol.fills = [];

    const nameLbl = figma.createText();
    nameLbl.fontName = bodyFontName;
    nameLbl.characters = ts.name;
    nameLbl.fontSize = 12;
    nameLbl.fills = solidFill(MUTED_COLOR);
    labelCol.appendChild(nameLbl);

    const sizeLbl = figma.createText();
    sizeLbl.fontName = bodyFontName;
    sizeLbl.characters = `${ts.size}px`;
    sizeLbl.fontSize = 11;
    sizeLbl.fills = solidFill(MUTED_COLOR);
    sizeLbl.opacity = 0.5;
    labelCol.appendChild(sizeLbl);

    row.appendChild(labelCol);

    // Specimen text
    const spec = figma.createText();
    const fn = await loadFont(ts.font, ts.weight);
    // Use pre-loaded body font for body styles, loaded heading font for heading styles
    const isBodyStyle = ts.weight <= 500;
    spec.fontName = isBodyStyle ? bodySpecimenFont : fn;
    spec.characters = ts.sample;
    spec.fontSize = ts.size;
    spec.fills = solidFill(TEXT_COLOR);
    spec.layoutSizingHorizontal = 'FILL';
    row.appendChild(spec);

    typoSection.appendChild(row);
  }

  root.appendChild(typoSection);

  createDivider(root, TEXT_COLOR, CONTENT_W);

  // ══════════════════════════════════════════════════════════════
  // SECTION 4: Icon Collection
  // ══════════════════════════════════════════════════════════════
  const iconSection = figma.createFrame();
  iconSection.name = 'Icon Collection';
  iconSection.layoutMode = 'VERTICAL';
  iconSection.layoutSizingHorizontal = 'FILL';
  iconSection.layoutSizingVertical = 'HUG';
  iconSection.itemSpacing = 24;
  iconSection.fills = [];

  createSectionTitle('Icons', boldBodyFontName, iconSection, MUTED_COLOR);

  const iconGrid = figma.createFrame();
  iconGrid.name = 'Icon Grid';
  iconGrid.layoutMode = 'HORIZONTAL';
  iconGrid.layoutSizingHorizontal = 'FILL';
  iconGrid.layoutSizingVertical = 'HUG';
  iconGrid.layoutWrap = 'WRAP';
  iconGrid.itemSpacing = 16;
  iconGrid.counterAxisSpacing = 16;
  iconGrid.fills = [];

  root.appendChild(iconSection);
  iconSection.appendChild(iconGrid);

  // Return icon grid ID so the pipeline can populate it with create_icon calls
  // Icons need SVG data which is loaded by the create_icon handler, not inline here

  createDivider(root, TEXT_COLOR, CONTENT_W);

  // ══════════════════════════════════════════════════════════════
  // SECTION 5: Spacing Scale
  // ══════════════════════════════════════════════════════════════
  const spacingSection = figma.createFrame();
  spacingSection.name = 'Spacing Scale';
  spacingSection.layoutMode = 'VERTICAL';
  spacingSection.layoutSizingHorizontal = 'FILL';
  spacingSection.layoutSizingVertical = 'HUG';
  spacingSection.itemSpacing = 24;
  spacingSection.fills = [];

  createSectionTitle('Spacing Scale', boldBodyFontName, spacingSection, MUTED_COLOR);

  const spacingRow = figma.createFrame();
  spacingRow.name = 'Scale';
  spacingRow.layoutMode = 'HORIZONTAL';
  spacingRow.layoutSizingHorizontal = 'FILL';
  spacingRow.layoutSizingVertical = 'HUG';
  spacingRow.counterAxisAlignItems = 'MAX';
  spacingRow.itemSpacing = 12;
  spacingRow.fills = [];

  for (const val of (spacing.scale || []).filter(v => v <= 96)) {
    const col = figma.createFrame();
    col.name = `sp-${val}`;
    col.layoutMode = 'VERTICAL';
    col.primaryAxisAlignItems = 'CENTER';
    col.counterAxisAlignItems = 'CENTER';
    col.layoutSizingVertical = 'HUG';
    col.itemSpacing = 8;
    col.fills = [];

    const bar = figma.createRectangle();
    bar.resize(32, Math.max(val, 4));
    bar.cornerRadius = 4;
    bar.fills = solidFill(colors.primary);
    bar.opacity = 0.7;
    col.appendChild(bar);

    const lbl = figma.createText();
    lbl.fontName = bodyFontName;
    lbl.characters = `${val}`;
    lbl.fontSize = 11;
    lbl.fills = solidFill(MUTED_COLOR);
    col.appendChild(lbl);

    spacingRow.appendChild(col);
  }

  spacingSection.appendChild(spacingRow);
  root.appendChild(spacingSection);

  // ── Place on DS page ──────────────────────────────────────
  let dsPage = figma.root.children.find(p => p.name === 'Design System') as PageNode | undefined;
  if (!dsPage) {
    dsPage = figma.createPage();
    dsPage.name = 'Design System';
  }
  dsPage.appendChild(root);
  root.x = 0;
  root.y = 0;

  // Move existing DS components below the showcase if they exist
  const existingComponents = dsPage.children.filter(n => n.name.startsWith('DS/') && n.id !== root.id);
  let yOffset = root.height + 100;
  for (const comp of existingComponents) {
    comp.x = 0;
    comp.y = yOffset;
    yOffset += comp.height + 32;
  }

  return {
    showcaseId: root.id,
    showcaseName: root.name,
    width: FRAME_W,
    iconGridId: iconGrid.id,
    dsPageId: dsPage.id,
    icons,
  };
}
