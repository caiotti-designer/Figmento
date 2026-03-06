// Mock the utils module to avoid DOM dependencies
jest.mock('../ui/utils', () => ({
  showToast: jest.fn(),
}));

// Mock the state module
jest.mock('../ui/state', () => ({
  apiState: { abortController: null, currentProvider: 'claude' },
  imageGenState: { geminiModel: 'gemini-3.1-flash-image-preview' },
}));

// Mock the prompt module
jest.mock('../ui/prompt', () => ({
  getAnalysisPrompt: jest.fn(() => 'mock prompt'),
}));

import { attemptJsonRepair, validateAndFixAnalysis, validateElements, parseAIResponse } from '../ui/api';
import type { UIAnalysis, UIElement } from '../types';

describe('attemptJsonRepair', () => {
  test('returns null for valid JSON (no truncation)', () => {
    const result = attemptJsonRepair('{"width": 100, "height": 200}');
    expect(result).toBeNull();
  });

  test('closes unclosed braces', () => {
    const truncated = '{"width": 100, "elements": [{"id": "1"}';
    const result = attemptJsonRepair(truncated);
    expect(result).not.toBeNull();
    expect(() => JSON.parse(result!)).not.toThrow();
  });

  test('closes unclosed brackets', () => {
    const truncated = '{"elements": [1, 2, 3';
    const result = attemptJsonRepair(truncated);
    expect(result).not.toBeNull();
    expect(() => JSON.parse(result!)).not.toThrow();
  });

  test('removes trailing comma before closing', () => {
    const truncated = '{"elements": [1, 2, ';
    const result = attemptJsonRepair(truncated);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.elements).toEqual([1, 2]);
  });

  test('closes unclosed strings', () => {
    const truncated = '{"name": "hello wor';
    const result = attemptJsonRepair(truncated);
    expect(result).not.toBeNull();
    expect(() => JSON.parse(result!)).not.toThrow();
  });

  test('handles deeply nested truncation', () => {
    const truncated = '{"a": {"b": {"c": [1, 2';
    const result = attemptJsonRepair(truncated);
    expect(result).not.toBeNull();
    expect(() => JSON.parse(result!)).not.toThrow();
  });

  test('handles escaped quotes inside strings', () => {
    const truncated = '{"text": "say \\"hello\\"", "items": [1';
    const result = attemptJsonRepair(truncated);
    expect(result).not.toBeNull();
    expect(() => JSON.parse(result!)).not.toThrow();
  });

  test('handles empty input', () => {
    const result = attemptJsonRepair('');
    // Empty string has 0 open braces/brackets, should return null
    expect(result).toBeNull();
  });
});

describe('validateAndFixAnalysis', () => {
  const makeAnalysis = (overrides: Partial<UIAnalysis> = {}): UIAnalysis => ({
    width: 800,
    height: 600,
    backgroundColor: '#FFFFFF',
    elements: [],
    ...overrides,
  });

  test('passes through valid analysis unchanged', () => {
    const analysis = makeAnalysis();
    const result = validateAndFixAnalysis(analysis);
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
    expect(result.backgroundColor).toBe('#FFFFFF');
    expect(result.elements).toEqual([]);
  });

  test('clamps width to max 4096', () => {
    const analysis = makeAnalysis({ width: 10000 });
    const result = validateAndFixAnalysis(analysis);
    expect(result.width).toBe(4096);
  });

  test('clamps width to min 1', () => {
    const analysis = makeAnalysis({ width: -5 });
    const result = validateAndFixAnalysis(analysis);
    expect(result.width).toBe(1);
  });

  test('clamps height to max 4096', () => {
    const analysis = makeAnalysis({ height: 5000 });
    const result = validateAndFixAnalysis(analysis);
    expect(result.height).toBe(4096);
  });

  test('clamps height to min 1', () => {
    const analysis = makeAnalysis({ height: 0 });
    const result = validateAndFixAnalysis(analysis);
    expect(result.height).toBe(1);
  });

  test('fixes missing backgroundColor', () => {
    const analysis = makeAnalysis({ backgroundColor: '' });
    const result = validateAndFixAnalysis(analysis);
    expect(result.backgroundColor).toBe('#FFFFFF');
  });

  test('fixes backgroundColor without hash prefix', () => {
    const analysis = makeAnalysis({ backgroundColor: 'FF0000' });
    const result = validateAndFixAnalysis(analysis);
    expect(result.backgroundColor).toBe('#FF0000');
  });

  test('preserves valid backgroundColor', () => {
    const analysis = makeAnalysis({ backgroundColor: '#123ABC' });
    const result = validateAndFixAnalysis(analysis);
    expect(result.backgroundColor).toBe('#123ABC');
  });

  test('validates elements recursively', () => {
    const analysis = makeAnalysis({
      elements: [
        { id: '', name: '', type: '' as any, width: -1, height: -1 } as UIElement,
      ],
    });
    const result = validateAndFixAnalysis(analysis);
    expect(result.elements[0].width).toBeGreaterThanOrEqual(1);
    expect(result.elements[0].height).toBeGreaterThanOrEqual(1);
    expect(result.elements[0].id).toBeTruthy();
    expect(result.elements[0].name).toBeTruthy();
    expect(result.elements[0].type).toBe('frame');
  });
});

describe('validateElements', () => {
  const makeElement = (overrides: Partial<UIElement> = {}): UIElement => ({
    id: 'test_id',
    name: 'Test Element',
    type: 'frame',
    width: 200,
    height: 100,
    children: [],
    ...overrides,
  });

  test('returns empty array for non-array input', () => {
    expect(validateElements(null as any, 800, 600, false)).toEqual([]);
    expect(validateElements(undefined as any, 800, 600, false)).toEqual([]);
  });

  test('assigns id when missing', () => {
    const elements = [makeElement({ id: '' })];
    const result = validateElements(elements, 800, 600, false);
    expect(result[0].id).toBeTruthy();
    expect(result[0].id.startsWith('el_')).toBe(true);
  });

  test('assigns name when missing', () => {
    const elements = [makeElement({ name: '' })];
    const result = validateElements(elements, 800, 600, false);
    expect(result[0].name).toBeTruthy();
  });

  test('assigns default type when missing', () => {
    const elements = [makeElement({ type: '' as any })];
    const result = validateElements(elements, 800, 600, false);
    expect(result[0].type).toBe('frame');
  });

  test('clamps width within bounds', () => {
    const elements = [makeElement({ width: 5000 })];
    const result = validateElements(elements, 800, 600, false);
    expect(result[0].width).toBe(800);
  });

  test('clamps height within bounds', () => {
    const elements = [makeElement({ height: 2000 })];
    const result = validateElements(elements, 800, 600, false);
    expect(result[0].height).toBe(600);
  });

  test('sets minimum width of 1', () => {
    const elements = [makeElement({ width: -10 })];
    const result = validateElements(elements, 800, 600, false);
    expect(result[0].width).toBe(1);
  });

  test('removes x/y from auto-layout children', () => {
    const elements = [makeElement({ x: 50, y: 50 })];
    const result = validateElements(elements, 800, 600, true);
    expect(result[0].x).toBeUndefined();
    expect(result[0].y).toBeUndefined();
  });

  test('preserves x/y for non-auto-layout children', () => {
    const elements = [makeElement({ x: 50, y: 50 })];
    const result = validateElements(elements, 800, 600, false);
    expect(result[0].x).toBe(50);
    expect(result[0].y).toBe(50);
  });

  test('fixes fill colors missing hash prefix', () => {
    const elements = [makeElement({ fills: [{ type: 'SOLID', color: 'FF0000' }] })];
    const result = validateElements(elements, 800, 600, false);
    expect(result[0].fills![0].color).toBe('#FF0000');
  });

  test('preserves fill colors with hash prefix', () => {
    const elements = [makeElement({ fills: [{ type: 'SOLID', color: '#00FF00' }] })];
    const result = validateElements(elements, 800, 600, false);
    expect(result[0].fills![0].color).toBe('#00FF00');
  });

  test('handles elements with non-numeric width/height', () => {
    const elements = [makeElement({ width: 'bad' as any, height: undefined as any })];
    const result = validateElements(elements, 800, 600, false);
    expect(result[0].width).toBe(100); // default
    expect(result[0].height).toBe(100); // default
  });
});

describe('parseAIResponse', () => {
  test('parses valid JSON directly', () => {
    const json = JSON.stringify({
      width: 800,
      height: 600,
      backgroundColor: '#FFFFFF',
      elements: [],
    });
    const result = parseAIResponse(json);
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  test('extracts JSON from markdown code blocks', () => {
    const content = 'Here is the design:\n```json\n{"width": 400, "height": 300, "backgroundColor": "#000", "elements": []}\n```';
    const result = parseAIResponse(content);
    expect(result.width).toBe(400);
    expect(result.height).toBe(300);
  });

  test('extracts JSON from code block without language tag', () => {
    const content = '```\n{"width": 500, "height": 500, "backgroundColor": "#FFF", "elements": []}\n```';
    const result = parseAIResponse(content);
    expect(result.width).toBe(500);
  });

  test('extracts JSON from surrounding text', () => {
    const content = 'The analysis result is: {"width": 1080, "height": 1920, "backgroundColor": "#EAEAEA", "elements": []} end of response';
    const result = parseAIResponse(content);
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1920);
  });

  test('throws on completely invalid content', () => {
    expect(() => parseAIResponse('This is not JSON at all')).toThrow('Failed to parse AI response');
  });

  test('throws when missing required dimensions', () => {
    const json = JSON.stringify({ elements: [], backgroundColor: '#FFF' });
    expect(() => parseAIResponse(json)).toThrow();
  });

  test('defaults missing elements to empty array', () => {
    const json = JSON.stringify({ width: 100, height: 100 });
    const result = parseAIResponse(json);
    expect(result.elements).toEqual([]);
  });

  test('defaults missing backgroundColor to white', () => {
    const json = JSON.stringify({ width: 100, height: 100, elements: [] });
    const result = parseAIResponse(json);
    expect(result.backgroundColor).toBe('#FFFFFF');
  });

  test('validates and fixes elements during parsing', () => {
    const json = JSON.stringify({
      width: 800,
      height: 600,
      backgroundColor: '#FFF',
      elements: [
        { id: '', name: '', type: '', width: -1, height: 0 },
      ],
    });
    const result = parseAIResponse(json);
    expect(result.elements[0].id).toBeTruthy();
    expect(result.elements[0].width).toBeGreaterThanOrEqual(1);
    expect(result.elements[0].height).toBeGreaterThanOrEqual(1);
  });
});
