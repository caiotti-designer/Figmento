// Validation script for DMD-1 Task 4 / 5 / 6 sample DESIGN.md files.
// Parses a DESIGN.md file with a minimal mini-parser (preview of DMD-2's real parser),
// validates the resulting IR against design-md.schema.json, and checks coverage
// against the corresponding tokens.yaml.
//
// Usage: node scripts/validate-design-md-sample.js <system-name>
// Example: node scripts/validate-design-md-sample.js notion

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Ajv = require('ajv').default;
const addFormats = require('ajv-formats').default;

const systemName = process.argv[2];
if (!systemName) {
  console.error('Usage: node scripts/validate-design-md-sample.js <system-name>');
  process.exit(1);
}

const dsDir = path.resolve(__dirname, '..', 'knowledge', 'design-systems', systemName);
const mdPath = path.join(dsDir, 'DESIGN.md');
const tokensPath = path.join(dsDir, 'tokens.yaml');
const schemaPath = path.resolve(__dirname, '..', 'schemas', 'design-md.schema.json');

// ───── Mini DESIGN.md parser (preview of DMD-2) ─────
function parseDesignMd(md) {
  const fmMatch = md.match(/^---\n([\s\S]*?)\n---\n/);
  const frontmatter = fmMatch ? yaml.load(fmMatch[1]) : {};
  const bodyStart = fmMatch ? fmMatch[0].length : 0;
  const body = md.slice(bodyStart);

  const sectionRegex = /^## (.+)$/gm;
  const matches = [...body.matchAll(sectionRegex)];
  const sections = {};

  const headingToKey = {
    'Visual Theme & Atmosphere': 'visual_theme_atmosphere',
    'Color Palette & Roles': 'color_palette_roles',
    'Typography Rules': 'typography_rules',
    'Component Stylings': 'component_stylings',
    'Layout Principles': 'layout_principles',
    'Depth & Elevation': 'depth_elevation',
    "Do's and Don'ts": 'dos_and_donts',
    'Responsive Behavior': 'responsive_behavior',
    'Agent Prompt Guide': 'agent_prompt_guide',
  };

  const blockLangToKey = {
    'color': 'color',
    'font-family': 'font_family',
    'type-scale': 'type_scale',
    'letter-spacing': 'letter_spacing',
    'spacing': 'spacing',
    'radius': 'radius',
    'shadow': 'shadow',
    'elevation': 'elevation',
    'gradient': 'gradient',
  };

  for (let i = 0; i < matches.length; i++) {
    const heading = matches[i][1].trim();
    const key = headingToKey[heading];
    if (!key) continue;
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : body.length;
    const content = body.slice(start, end);

    const section = {};

    const fenceRegex = /```([\w-]+)\n([\s\S]*?)\n```/g;
    let fence;
    while ((fence = fenceRegex.exec(content)) !== null) {
      const lang = fence[1];
      const blockKey = blockLangToKey[lang];
      if (!blockKey) continue;
      try {
        section[blockKey] = yaml.load(fence[2]);
      } catch (e) {
        throw new Error('YAML parse error in ' + lang + ' block of ' + heading + ': ' + e.message);
      }
    }

    let prose = content.replace(/```[\w-]+\n[\s\S]*?\n```/g, '').trim();

    if (key === 'visual_theme_atmosphere') {
      const moodMatch = prose.match(/\*\*Mood\*\*:\s*(.+)/);
      if (moodMatch) {
        section.mood = moodMatch[1].split(',').map(s => s.trim());
        prose = prose.replace(/\*\*Mood\*\*:.+/, '').trim();
      }
    }

    if (key === 'dos_and_donts') {
      const doMatch = content.match(/### Do\n([\s\S]*?)(?=### Don|$)/);
      const dontMatch = content.match(/### Don't\n([\s\S]*?)$/);
      if (doMatch) {
        section.do = doMatch[1].trim().split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2).trim());
      }
      if (dontMatch) {
        section.dont = dontMatch[1].trim().split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2).trim());
      }
      prose = undefined;
    }

    if (prose) section.prose = prose;
    sections[key] = section;
  }

  // Normalize: convert Date objects (from YAML timestamp auto-parsing) to ISO strings.
  // JSON round-trip handles this for free — Date.prototype.toJSON returns ISO string.
  // This also drops undefined values and ensures the IR is JSON-clean.
  return JSON.parse(JSON.stringify({ frontmatter, sections }));
}

// ───── Load + parse + validate ─────
console.log('─── DMD-1 sample validator: ' + systemName + ' ───');
const md = fs.readFileSync(mdPath, 'utf8');
const ir = parseDesignMd(md);

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv({ strict: true, allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);
const ok = validate(ir);

console.log('');
console.log('─── Parsed IR summary ───');
console.log('Frontmatter keys:', Object.keys(ir.frontmatter).join(', '));
console.log('Sections found:', Object.keys(ir.sections).join(', '));
console.log('');
console.log('Section breakdown:');
for (const [k, v] of Object.entries(ir.sections)) {
  const blocks = Object.keys(v).filter(x => x !== 'prose' && x !== 'do' && x !== 'dont' && x !== 'mood');
  const extras = [];
  if (v.mood) extras.push('mood[' + v.mood.length + ']');
  if (v.do) extras.push('do[' + v.do.length + ']');
  if (v.dont) extras.push('dont[' + v.dont.length + ']');
  if (v.prose) extras.push('prose(' + v.prose.length + ' chars)');
  console.log('  ' + k + ': blocks=[' + blocks.join(',') + '] ' + extras.join(' '));
}

console.log('');
console.log('─── Schema validation ───');
console.log('Result:', ok ? 'PASS — parses to a valid IR' : 'FAIL');
if (!ok) {
  console.log('Errors:', JSON.stringify(validate.errors, null, 2));
  process.exit(1);
}

// ───── Coverage check: every tokens.yaml field present in the IR ─────
if (!fs.existsSync(tokensPath)) {
  console.log('');
  console.log('No tokens.yaml found for coverage check — skipping.');
  process.exit(0);
}

console.log('');
console.log('─── Coverage check (tokens.yaml → IR) ───');
const tokens = yaml.load(fs.readFileSync(tokensPath, 'utf8'));

const colorSection = ir.sections.color_palette_roles || {};
const typographySection = ir.sections.typography_rules || {};
const layoutSection = ir.sections.layout_principles || {};
const depthSection = ir.sections.depth_elevation || {};
const constraintsSection = ir.sections.dos_and_donts || {};

const checks = [];
checks.push(['name', tokens.name, ir.frontmatter.name]);
checks.push(['created', tokens.created, ir.frontmatter.created]);
if (tokens.source) {
  checks.push(['source -> source_url (presence)', 'present', ir.frontmatter.source_url ? 'present' : 'absent']);
}
checks.push(['preset_used', tokens.preset_used, ir.frontmatter.preset_used]);
checks.push(['mood length', tokens.mood.length, (ir.sections.visual_theme_atmosphere || {}).mood ? ir.sections.visual_theme_atmosphere.mood.length : 0]);
checks.push(['colors.primary', tokens.colors.primary, (colorSection.color || {}).primary]);
checks.push(['colors.on_surface', tokens.colors.on_surface, (colorSection.color || {}).on_surface]);
checks.push(['colors total count', Object.keys(tokens.colors).length, colorSection.color ? Object.keys(colorSection.color).length : 0]);
checks.push(['typography.heading.family', tokens.typography.heading.family, ((typographySection.font_family || {}).heading || {}).family]);
checks.push(['typography.body.weights length', tokens.typography.body.weights.length, (((typographySection.font_family || {}).body || {}).weights || []).length]);
if (tokens.typography.opentype_features) {
  checks.push(['typography.opentype_features', JSON.stringify(tokens.typography.opentype_features), JSON.stringify((typographySection.font_family || {}).opentype_features)]);
}
checks.push(['typography.scale.display', tokens.typography.scale.display, (typographySection.type_scale || {}).display]);
checks.push(['typography.scale total keys', Object.keys(tokens.typography.scale).length, typographySection.type_scale ? Object.keys(typographySection.type_scale).length : 0]);
if (tokens.typography.letter_spacing) {
  checks.push(['typography.letter_spacing.display', tokens.typography.letter_spacing.display, (typographySection.letter_spacing || {}).display]);
}
checks.push(['spacing.md', tokens.spacing.md, (layoutSection.spacing || {}).md]);
checks.push(['spacing.2xl', tokens.spacing['2xl'], (layoutSection.spacing || {})['2xl']]);
checks.push(['radius.full', tokens.radius.full, (layoutSection.radius || {}).full]);
checks.push(['shadows.lg.blur', tokens.shadows.lg.blur, ((depthSection.shadow || {}).lg || {}).blur]);
if (tokens.elevation) {
  const firstKey = Object.keys(tokens.elevation)[0];
  checks.push(['elevation.' + firstKey + '.shadow (first 40 chars)',
    String(tokens.elevation[firstKey].shadow).slice(0, 40),
    String(((depthSection.elevation || {})[firstKey] || {}).shadow || '').slice(0, 40)]);
}
if (tokens.gradients) {
  checks.push(['gradients.enabled', tokens.gradients.enabled, ((colorSection.gradient) || {}).enabled]);
}
if (tokens.constraints && tokens.constraints.do) {
  checks.push(['constraints.do length', tokens.constraints.do.length, (constraintsSection.do || []).length]);
}
if (tokens.constraints && tokens.constraints.dont) {
  checks.push(['constraints.dont length', tokens.constraints.dont.length, (constraintsSection.dont || []).length]);
}

let pass = 0, fail = 0;
for (const [label, expected, actual] of checks) {
  const match = JSON.stringify(expected) === JSON.stringify(actual);
  console.log((match ? 'OK ' : 'FAIL ') + label + ': ' + JSON.stringify(expected) + (match ? '' : ' vs ' + JSON.stringify(actual)));
  if (match) pass++; else fail++;
}
console.log('');
console.log('Coverage: ' + pass + '/' + (pass + fail) + ' tokens.yaml fields present in IR');
if (fail > 0) {
  console.log('FAIL — coverage gap');
  process.exit(1);
}
console.log('PASS — ' + systemName + ' DESIGN.md round-trips cleanly');
