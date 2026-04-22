// ═══════════════════════════════════════════════════════════
// Skills — High-level recipes for complex design tasks.
//
// Skills live as markdown files with YAML frontmatter under
// <package-root>/skills/*.md. Exposed via two tools:
//   - list_skills(category?)  → returns the index
//   - load_skill(name)        → returns the full recipe body
//
// Any MCP client (Claude, Cursor, Continue, GPT bridges) can
// discover and execute skills through these two tool calls —
// no client-side skill system required.
// ═══════════════════════════════════════════════════════════

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as nodePath from 'path';
import * as yaml from 'js-yaml';
import { getSkillsDir } from './utils/knowledge-paths';

interface SkillFrontmatter {
  name: string;
  description: string;
  category?: string;
  triggers?: string[];
  inputs?: {
    required?: string[];
    optional?: string[];
  };
  tools_used_primary?: string[];
  tools_used_optional?: string[];
  tools_used_fallback?: string[];
  estimated_tool_calls?: string | number;
  estimated_duration?: string;
}

interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
  filename: string;
}

// Parse a markdown file with YAML frontmatter.
// Returns null if the file has no frontmatter or it fails to parse.
function parseSkillFile(filePath: string): ParsedSkill | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  // Match frontmatter: ---\n<yaml>\n---\n<body>
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;

  let frontmatter: SkillFrontmatter;
  try {
    frontmatter = yaml.load(match[1]) as SkillFrontmatter;
  } catch {
    return null;
  }

  if (!frontmatter || typeof frontmatter !== 'object' || !frontmatter.name || !frontmatter.description) {
    return null;
  }

  return {
    frontmatter,
    body: match[2].trim(),
    filename: nodePath.basename(filePath),
  };
}

function listSkillFiles(): string[] {
  const dir = getSkillsDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.md') && !f.startsWith('_') && f.toUpperCase() !== 'SKILLS.MD')
    .sort();
}

function loadAllSkills(category?: string): ParsedSkill[] {
  const files = listSkillFiles();
  const skills: ParsedSkill[] = [];
  for (const file of files) {
    const filePath = nodePath.join(getSkillsDir(), file);
    const parsed = parseSkillFile(filePath);
    if (!parsed) continue;
    if (category && parsed.frontmatter.category !== category) continue;
    skills.push(parsed);
  }
  return skills;
}

export const listSkillsSchema = {
  category: z.string().optional().describe(
    'Optional category filter (e.g., "design-system", "ad", "brochure", "brand"). Omit to list all skills.'
  ),
};

export const loadSkillSchema = {
  name: z.string().describe(
    'Skill name from the list_skills index (e.g., "design-system"). Case-sensitive match against the skill\'s frontmatter `name` field.'
  ),
};

export function registerSkillsTools(server: McpServer): void {
  server.tool(
    'list_skills',
    'List available Figmento skills — high-level, authoritative recipes for complex design tasks (design system, brand kit, ad campaign, brochure, etc.). ALWAYS call this tool BEFORE starting any complex design task so you can check if an existing recipe covers what the user is asking for. Returns name, description, triggers, inputs, and primary tools for each skill. If a skill matches the request, follow up with `load_skill(name)` and execute its recipe verbatim.',
    listSkillsSchema,
    async (params) => {
      const skills = loadAllSkills(params.category);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                skills: skills.map(s => ({
                  name: s.frontmatter.name,
                  description: s.frontmatter.description,
                  category: s.frontmatter.category,
                  triggers: s.frontmatter.triggers,
                  inputs: s.frontmatter.inputs,
                  tools_used_primary: s.frontmatter.tools_used_primary,
                  estimated_tool_calls: s.frontmatter.estimated_tool_calls,
                  estimated_duration: s.frontmatter.estimated_duration,
                  filename: s.filename,
                })),
                total: skills.length,
                ...(params.category && { filteredBy: params.category }),
                usage:
                  'Skills are AUTHORITATIVE recipes. To execute a matching skill, call `load_skill(name)` to retrieve the full recipe body, then follow it verbatim — use the exact tools it specifies, in the exact order, and respect its review gates. Do NOT improvise alternatives to the tools a skill specifies.',
                decision_guide: {
                  whenToUseASkill:
                    'If the user request matches any skill trigger OR describes a brand identity without an explicit deliverable format (no "post", "ad", "brochure", "landing page", "banner"), load the matching skill. Skills are the correct path for complex multi-phase work.',
                  brandBriefDefault:
                    'A brief containing brand name + mood + primary color + fonts but NO explicit format is a design-system request by default. Call load_skill("design-system"). Do NOT default to social post / Instagram / ad — those require an explicit format verb in the user request.',
                  whenInDoubt:
                    'If the user request is ambiguous (could be design-system, post, ad, landing page, etc.), ASK the user which deliverable they want before loading any skill or starting any workflow. Never guess — the cost of asking one question is lower than the cost of producing the wrong artifact.',
                  explicitFormatOverrides:
                    'Explicit format verbs in the user request override the brand-brief default. "Create a post for X" → social workflow. "Design an ad for X" → ad workflow. "Build a design system for X" → design-system skill. When in doubt between format verbs, ASK.',
                },
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    'load_skill',
    'Load the full body of a Figmento skill retrieved via list_skills. Returns the complete recipe markdown — execution steps, hard rules, quality checks, anti-patterns. Once loaded, follow the recipe VERBATIM: call the exact tools it specifies in the exact order, respect its phase/review gates, and do NOT substitute alternative tools or rebuild functionality manually via batch_execute. Skills are the authoritative way to execute complex tasks in Figmento.',
    loadSkillSchema,
    async (params) => {
      const skills = loadAllSkills();
      const match = skills.find(
        s => s.frontmatter.name === params.name || s.filename === `${params.name}.md`,
      );

      if (!match) {
        const available = skills.map(s => s.frontmatter.name);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  error: `Skill "${params.name}" not found.`,
                  available,
                  hint: 'Call list_skills() to see the full index with descriptions and triggers.',
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }

      // Return the full body. Clients should treat this as authoritative instructions.
      const header = `# Skill: ${match.frontmatter.name}\n\n> **This skill is authoritative.** Follow its recipe verbatim — call the exact tools it specifies, in the exact order, and respect its review gates. Do NOT improvise alternatives or rebuild specified tool functionality manually via batch_execute.\n\n---\n\n`;

      return {
        content: [
          {
            type: 'text' as const,
            text: header + match.body,
          },
        ],
      };
    },
  );
}
