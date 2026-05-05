import type { ToolDefinition } from './tools-schema';

// ═══════════════════════════════════════════════════════════════
// GEMINI TOOL SCHEMA CONVERTER
// ═══════════════════════════════════════════════════════════════

export function convertSchemaToGemini(schema: Record<string, unknown>): Record<string, unknown> {
  if (schema.oneOf) {
    const options = schema.oneOf as Record<string, unknown>[];
    if (options.length > 0) {
      const flattened = convertSchemaToGemini(options[0]);
      if (schema.description && !flattened.description) {
        flattened.description = schema.description;
      }
      return flattened;
    }
  }

  const result: Record<string, unknown> = {};

  if (schema.type) {
    result.type = (schema.type as string).toUpperCase();
  }

  if (schema.description) result.description = schema.description;
  if (schema.enum) result.enum = schema.enum;

  if (schema.properties) {
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.properties as Record<string, unknown>)) {
      props[key] = convertSchemaToGemini(value as Record<string, unknown>);
    }
    result.properties = props;
  }

  if (schema.required) result.required = schema.required;

  if (schema.items) {
    result.items = convertSchemaToGemini(schema.items as Record<string, unknown>);
  } else if (result.type === 'ARRAY' && !result.items) {
    result.items = { type: 'OBJECT' };
  }

  return result;
}

export function convertToolsToGemini(tools: ToolDefinition[]): Record<string, unknown>[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: convertSchemaToGemini(tool.input_schema),
  }));
}

// ═══════════════════════════════════════════════════════════════
// OPENAI TOOL SCHEMA CONVERTER
// ═══════════════════════════════════════════════════════════════

export function convertSchemaToOpenAI(schema: Record<string, unknown>): Record<string, unknown> {
  if (schema.oneOf) {
    const options = schema.oneOf as Record<string, unknown>[];
    if (options.length > 0) {
      const flattened = convertSchemaToOpenAI(options[0]);
      if (schema.description && !flattened.description) {
        flattened.description = schema.description;
      }
      return flattened;
    }
  }

  const result: Record<string, unknown> = {};

  if (schema.type) result.type = schema.type;
  if (schema.description) result.description = schema.description;
  if (schema.enum) result.enum = schema.enum;
  if (schema.required) result.required = schema.required;

  if (schema.properties) {
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.properties as Record<string, unknown>)) {
      props[key] = convertSchemaToOpenAI(value as Record<string, unknown>);
    }
    result.properties = props;
  }

  if (schema.items) {
    result.items = convertSchemaToOpenAI(schema.items as Record<string, unknown>);
  }

  if (schema.minimum !== undefined) result.minimum = schema.minimum;
  if (schema.maximum !== undefined) result.maximum = schema.maximum;
  if (schema.minItems !== undefined) result.minItems = schema.minItems;
  if (schema.maxItems !== undefined) result.maxItems = schema.maxItems;

  return result;
}

export function convertToolsToOpenAI(tools: ToolDefinition[]): Record<string, unknown>[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: convertSchemaToOpenAI(tool.input_schema),
    },
  }));
}
