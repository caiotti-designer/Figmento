// Mock the state module to provide testable defaults
jest.mock('../ui/state', () => ({
  dom: { designSettingsPanel: null },
  designSettings: {
    selectedFontFamily: '',
    brandColors: [] as string[],
    enableGridSystem: false,
  },
  GRID_SIZE: 4,
}));

import { ANALYSIS_PROMPT, getAnalysisPrompt } from '../ui/prompt';
import { dom, designSettings } from '../ui/state';

// ═══════════════════════════════════════════════════════════════
// ANALYSIS_PROMPT constant
// ═══════════════════════════════════════════════════════════════

describe('ANALYSIS_PROMPT', () => {
  test('is a non-empty string', () => {
    expect(typeof ANALYSIS_PROMPT).toBe('string');
    expect(ANALYSIS_PROMPT.length).toBeGreaterThan(0);
  });

  test('contains the OUTPUT SCHEMA section', () => {
    expect(ANALYSIS_PROMPT).toContain('# OUTPUT SCHEMA');
  });

  test('contains the LAYOUT RULES section', () => {
    expect(ANALYSIS_PROMPT).toContain('# LAYOUT RULES');
  });

  test('contains the ELEMENT RULES section', () => {
    expect(ANALYSIS_PROMPT).toContain('# ELEMENT RULES');
  });

  test('contains the VISUAL ANALYSIS PROCESS section', () => {
    expect(ANALYSIS_PROMPT).toContain('# VISUAL ANALYSIS PROCESS');
  });

  test('contains the STRICT RULES section', () => {
    expect(ANALYSIS_PROMPT).toContain('# STRICT RULES');
  });

  test('contains the original social media ad example', () => {
    expect(ANALYSIS_PROMPT).toContain('# COMPLETE EXAMPLE');
    expect(ANALYSIS_PROMPT).toContain('Solar panels on rooftop');
  });

  test('contains the login form example', () => {
    expect(ANALYSIS_PROMPT).toContain('# EXAMPLE 2');
    expect(ANALYSIS_PROMPT).toContain('Login');
  });

  test('contains the dashboard stats example', () => {
    expect(ANALYSIS_PROMPT).toContain('# EXAMPLE 3');
    expect(ANALYSIS_PROMPT).toContain('Dashboard');
  });

  test('contains the landing page hero example', () => {
    expect(ANALYSIS_PROMPT).toContain('# EXAMPLE 4');
    expect(ANALYSIS_PROMPT).toContain('Landing Page Hero');
  });

  test('ends with instruction to return only valid JSON', () => {
    expect(ANALYSIS_PROMPT).toContain('Return ONLY valid JSON');
  });

  test('contains all required element types in schema', () => {
    expect(ANALYSIS_PROMPT).toContain('"frame"');
    expect(ANALYSIS_PROMPT).toContain('"text"');
    expect(ANALYSIS_PROMPT).toContain('"image"');
    expect(ANALYSIS_PROMPT).toContain('"icon"');
    expect(ANALYSIS_PROMPT).toContain('"ellipse"');
    expect(ANALYSIS_PROMPT).toContain('"rectangle"');
  });
});

// ═══════════════════════════════════════════════════════════════
// getAnalysisPrompt
// ═══════════════════════════════════════════════════════════════

describe('getAnalysisPrompt', () => {
  beforeEach(() => {
    // Reset state to defaults
    (dom as any).designSettingsPanel = null;
    designSettings.selectedFontFamily = '';
    designSettings.brandColors = [];
    designSettings.enableGridSystem = false;
  });

  test('returns the base prompt when design settings panel is null', () => {
    expect(getAnalysisPrompt()).toBe(ANALYSIS_PROMPT);
  });

  test('returns the base prompt when design settings panel exists but is not enabled', () => {
    (dom as any).designSettingsPanel = { classList: { contains: () => false } };
    expect(getAnalysisPrompt()).toBe(ANALYSIS_PROMPT);
  });

  test('returns base prompt even when enabled if no custom settings are specified', () => {
    (dom as any).designSettingsPanel = { classList: { contains: (cls: string) => cls === 'enabled' } };
    // No font, no colors, no grid — user settings section is empty
    expect(getAnalysisPrompt()).toBe(ANALYSIS_PROMPT);
  });

  test('appends font family preference when set', () => {
    (dom as any).designSettingsPanel = { classList: { contains: (cls: string) => cls === 'enabled' } };
    designSettings.selectedFontFamily = 'Poppins';

    const result = getAnalysisPrompt();
    expect(result).toContain('## FONT FAMILY');
    expect(result).toContain('Poppins');
    expect(result.length).toBeGreaterThan(ANALYSIS_PROMPT.length);
  });

  test('appends brand colors when set', () => {
    (dom as any).designSettingsPanel = { classList: { contains: (cls: string) => cls === 'enabled' } };
    designSettings.brandColors = ['#FF0000', '#00FF00', '#0000FF'];

    const result = getAnalysisPrompt();
    expect(result).toContain('## BRAND COLORS');
    expect(result).toContain('#FF0000');
    expect(result).toContain('#00FF00');
    expect(result).toContain('#0000FF');
  });

  test('appends grid system rules when enabled', () => {
    (dom as any).designSettingsPanel = { classList: { contains: (cls: string) => cls === 'enabled' } };
    designSettings.enableGridSystem = true;

    const result = getAnalysisPrompt();
    expect(result).toContain('GRID DESIGN SYSTEM');
    expect(result).toContain('multiples of 4');
  });

  test('combines all settings when all are specified', () => {
    (dom as any).designSettingsPanel = { classList: { contains: (cls: string) => cls === 'enabled' } };
    designSettings.selectedFontFamily = 'Inter';
    designSettings.brandColors = ['#1A1A2E'];
    designSettings.enableGridSystem = true;

    const result = getAnalysisPrompt();
    expect(result).toContain('## FONT FAMILY');
    expect(result).toContain('Inter');
    expect(result).toContain('## BRAND COLORS');
    expect(result).toContain('#1A1A2E');
    expect(result).toContain('GRID DESIGN SYSTEM');
  });
});
