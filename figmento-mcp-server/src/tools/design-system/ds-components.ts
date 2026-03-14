// ═══════════════════════════════════════════════════════════
// Component Tools: create_component, list_components
// ═══════════════════════════════════════════════════════════

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as nodePath from 'path';
import { getKnowledgeDir, getDesignSystemsDir } from '../utils/knowledge-paths';
import { resolveTokens, deepMerge } from '../utils/tokens';
import { recipeToCommands } from '../utils/recipe-to-commands';
import { createComponentSchema, listComponentsSchema } from './ds-schemas';
import type { ComponentRecipe, SendDesignCommand } from './ds-types';

// Module-scoped cache — singleton for component recipes
let componentCache: Record<string, ComponentRecipe> | null = null;

function loadComponents(): Record<string, ComponentRecipe> {
  if (componentCache) return componentCache;
  const componentsDir = nodePath.join(getKnowledgeDir(), 'components');
  if (!fs.existsSync(componentsDir)) {
    throw new Error('Components directory not found at knowledge/components/');
  }
  const merged: Record<string, ComponentRecipe> = {};
  const files = fs.readdirSync(componentsDir).filter(f => f.endsWith('.yaml'));
  if (files.length === 0) {
    throw new Error('No component YAML files found in knowledge/components/');
  }
  for (const file of files) {
    const content = fs.readFileSync(nodePath.join(componentsDir, file), 'utf-8');
    const data = yaml.load(content) as Record<string, ComponentRecipe>;
    Object.assign(merged, data);
  }
  componentCache = merged;
  return componentCache;
}

function getComponentRecipe(componentName: string): ComponentRecipe {
  const components = loadComponents();
  const component = components[componentName];
  if (!component) {
    const available = Object.keys(components);
    throw new Error(`Component not found: ${componentName}. Available: ${available.join(', ')}`);
  }
  return component;
}

function listAvailableSystems(): string[] {
  const dir = getDesignSystemsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);
}

// Exported list handler (used by resources.ts dispatcher)
export async function listComponentsHandler(_filter?: string) {
  const components = loadComponents();
  const result = Object.entries(components).map(([name, def]) => ({
    name,
    description: def.description,
    variants: def.variants ? Object.keys(def.variants) : ['default'],
    sizes: def.size_overrides ? Object.keys(def.size_overrides) : [],
    props: Object.entries(def.props).map(([propName, propDef]) => ({
      name: propName,
      type: propDef.type,
      required: propDef.required || false,
      default: propDef.default,
      values: propDef.values,
    })),
  }));

  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

export function registerComponentTools(server: McpServer, sendDesignCommand: SendDesignCommand): void {

  server.tool(
    'create_component',
    'Instantiate a design system component on the Figma canvas. Loads tokens from the named design system, resolves the component recipe, and sends batch commands to create the element. Components: button, badge, card, divider, avatar.',
    createComponentSchema,
    async (params: {
      system: string; component: string; variant?: string; size?: string;
      props?: Record<string, unknown>; parentId?: string; x?: number; y?: number;
    }) => {
      // 1. Load design system tokens
      const safeName = params.system.replace(/[^a-z0-9-]/gi, '').toLowerCase();
      const tokensPath = nodePath.join(getDesignSystemsDir(), safeName, 'tokens.yaml');
      if (!fs.existsSync(tokensPath)) {
        const available = listAvailableSystems();
        throw new Error(
          `Design system not found: ${safeName}. Available: ${available.length > 0 ? available.join(', ') : '(none created yet)'}`
        );
      }
      const tokensContent = fs.readFileSync(tokensPath, 'utf-8');
      const tokens = yaml.load(tokensContent) as Record<string, unknown>;

      // 2. Load component recipe
      const componentDef = getComponentRecipe(params.component);

      // 3. Validate required props
      const componentProps = params.props || {};
      for (const [propName, propDef] of Object.entries(componentDef.props)) {
        if (propDef.required && componentProps[propName] === undefined) {
          throw new Error(
            `Component '${params.component}' requires prop '${propName}'`
          );
        }
        // Apply defaults
        if (componentProps[propName] === undefined && propDef.default !== undefined) {
          componentProps[propName] = propDef.default;
        }
      }

      // 4. Start with base recipe
      let recipe = JSON.parse(JSON.stringify(componentDef.recipe)) as Record<string, unknown>;

      // 5. Apply variant overrides
      const variant = params.variant || 'default';
      if (variant !== 'default' && variant !== 'primary' && componentDef.variants) {
        const variantOverrides = componentDef.variants[variant];
        if (!variantOverrides) {
          const available = Object.keys(componentDef.variants);
          throw new Error(
            `Variant '${variant}' not found for '${params.component}'. Available: ${available.join(', ')}`
          );
        }
        recipe = deepMerge(recipe, variantOverrides);
      }

      // 6. Apply size overrides
      if (params.size && componentDef.size_overrides) {
        const sizeOverrides = componentDef.size_overrides[params.size];
        if (!sizeOverrides) {
          const available = Object.keys(componentDef.size_overrides);
          throw new Error(
            `Size '${params.size}' not found for '${params.component}'. Available: ${available.join(', ')}`
          );
        }
        recipe = deepMerge(recipe, sizeOverrides);
      }

      // 7. Resolve token references and prop substitutions
      const resolved = resolveTokens(recipe, tokens, componentProps, params.component);

      // 8. Convert to batch commands
      const commands = recipeToCommands(resolved, {
        parentId: params.parentId,
        x: params.x,
        y: params.y,
        componentName: params.component,
        variant,
      });

      // 9. Execute via batch_execute
      const data = await sendDesignCommand('batch_execute', { commands });

      // 10. Extract result info
      const results = (data as Record<string, unknown>).results as Array<Record<string, unknown>> | undefined;
      const rootResult = results?.[0];
      const nodeId = rootResult?.nodeId || rootResult?.id || 'unknown';

      const childCount = (resolved.children as unknown[] | undefined)?.length || 0;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            nodeId,
            name: `${params.component}_${variant}`,
            component: params.component,
            variant,
            size: params.size || 'md',
            childCount,
            batchResults: data,
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'list_components',
    '[DEPRECATED — use list_resources(type="components") instead] List all available design system components with their variants, props, and descriptions.',
    listComponentsSchema,
    async () => listComponentsHandler(),
  );
}
