import { FIGMENTO_TOOLS } from '../tools-schema';
import { convertSchemaToGemini, convertSchemaToOpenAI } from '../tool-use-loop';

// ─────────────────────────────────────────────────────────────────────────────
// Structural fingerprint snapshot
// Each entry: { name, required, propCount }
// propCount = number of top-level properties in input_schema
// ─────────────────────────────────────────────────────────────────────────────

type ToolFingerprint = {
  name: string;
  required: string[];
  propCount: number;
};

function fingerprint(tools: typeof FIGMENTO_TOOLS): ToolFingerprint[] {
  return tools.map(t => ({
    name: t.name,
    required: ((t.input_schema as Record<string, unknown>).required as string[] | undefined) ?? [],
    propCount: Object.keys(
      ((t.input_schema as Record<string, unknown>).properties as Record<string, unknown> | undefined) ?? {},
    ).length,
  }));
}

describe('FIGMENTO_TOOLS structural fingerprint', () => {
  it('matches snapshot', () => {
    expect(fingerprint(FIGMENTO_TOOLS)).toMatchSnapshot();
  });

  it('has 37 tools total (35 generated + 2 plugin-only)', () => {
    expect(FIGMENTO_TOOLS).toHaveLength(37);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Spot checks for generated tools
// ─────────────────────────────────────────────────────────────────────────────

describe('create_frame spot check', () => {
  const tool = FIGMENTO_TOOLS.find(t => t.name === 'create_frame')!;

  it('exists', () => expect(tool).toBeDefined());

  it('has propCount 20', () => {
    const props = (tool.input_schema as Record<string, unknown>).properties as Record<string, unknown>;
    expect(Object.keys(props)).toHaveLength(20);
  });

  it("required includes 'width' and 'height'", () => {
    const required = (tool.input_schema as Record<string, unknown>).required as string[];
    expect(required).toContain('width');
    expect(required).toContain('height');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Smoke tests: oneOf flattening in converters
// Note: zodToJsonSchema generates anyOf for z.union(), not oneOf.
// These smoke tests use hand-crafted oneOf schemas to exercise the branch.
// ─────────────────────────────────────────────────────────────────────────────

const oneOfSchema = {
  description: 'parent desc',
  oneOf: [
    { type: 'number', description: 'inner number' },
    { type: 'string' },
  ],
};

describe('convertSchemaToGemini', () => {
  it('flattens oneOf to first option without throwing', () => {
    const result = convertSchemaToGemini(oneOfSchema);
    expect(result).toBeDefined();
    expect(result.type).toBe('NUMBER');
  });

  it('inherits parent description when inner has its own', () => {
    const schema = { description: 'parent', oneOf: [{ type: 'number', description: 'child' }] };
    const result = convertSchemaToGemini(schema);
    // inner has description → parent description NOT copied over
    expect(result.description).toBe('child');
  });

  it('copies parent description when inner lacks one', () => {
    const schema = { description: 'parent', oneOf: [{ type: 'number' }] };
    const result = convertSchemaToGemini(schema);
    expect(result.description).toBe('parent');
  });
});

describe('convertSchemaToOpenAI', () => {
  it('flattens oneOf to first option without throwing', () => {
    const result = convertSchemaToOpenAI(oneOfSchema);
    expect(result).toBeDefined();
    expect(result.type).toBe('number');
  });

  it('copies parent description when inner lacks one', () => {
    const schema = { description: 'parent', oneOf: [{ type: 'string' }] };
    const result = convertSchemaToOpenAI(schema);
    expect(result.description).toBe('parent');
  });
});
