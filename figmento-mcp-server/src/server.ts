import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FigmentoWSClient } from './ws-client';
import { registerConnectionTools } from './tools/connection';
import { registerCanvasTools } from './tools/canvas';
import { registerStyleTools } from './tools/style';
import { registerSceneTools } from './tools/scene';
import { registerGetScreenshotTool, registerExportNodeTool, registerExportToFileTool, registerEvaluateDesignTool } from './tools/export';
import { registerBatchTools } from './tools/batch';
import { registerIntelligenceTools, preWarmKnowledgeCache } from './tools/intelligence';
import { registerTemplateTools } from './tools/template';
import { registerDesignSystemTools } from './tools/design-system';
import { registerPatternTools } from './tools/patterns';
import { registerDsTemplateTools } from './tools/ds-templates';
import { registerIconTools } from './tools/icons';
import { registerAdAnalyzerTools } from './tools/ad-analyzer';
import { registerLayoutTools } from './tools/layouts';
import { registerReferenceTools } from './tools/references';
import { registerFigmaNativeTools } from './tools/figma-native';
import { registerRefinementTools } from './tools/refinement';
import { registerLearningTools } from './tools/learning';
import { registerResourceTools } from './tools/resources';
import { registerImageGenTools } from './tools/image-gen';
import { registerFileStorageTools, cleanupOldTempFiles } from './tools/file-storage';
import { registerOrchestrationTools } from './tools/orchestration';
import { registerImageFillTools } from './tools/image-fill';
import { registerBriefAnalysisTools } from './tools/brief-analysis';
import { registerDSPipelineTools } from './tools/ds-pipeline';
import { registerInteractiveComponentTools } from './tools/components';
import { registerCodegenTools } from './tools/codegen';
import { registerSkillsTools } from './tools/skills';

/**
 * Creates and configures the Figmento MCP server with all design tools.
 */
export interface FigmentoServerResult {
  server: McpServer;
  wsClient: FigmentoWSClient;
}

const FIGMENTO_SERVER_INSTRUCTIONS = `Figmento is a professional design automation server for Figma. It exposes ~55 visible tools for canvas operations, design systems, components, intelligence, and refinement.

═══════════════════════════════════════════════════════════
CRITICAL: Skills-First Workflow for Complex Tasks
═══════════════════════════════════════════════════════════

Figmento provides **Skills** — authoritative, pre-written recipes for complex multi-step tasks. Skills live inside this server and are accessed via two tools:

  1. list_skills(category?)  → returns the index of available skills
  2. load_skill(name)        → returns the full recipe body

**Before starting ANY complex design task, you MUST call list_skills() first** to check whether an authoritative recipe exists. If a skill matches the user's request, call load_skill(name) and follow its recipe verbatim.

Tasks that trigger skill discovery:
  • "create a design system" / "build design tokens" / "brand kit"    → design-system skill
  • "ad campaign" / "generate ad variations" (future)                 → ad-campaign skill
  • "brochure" / "multi-page print" (future)                          → brochure skill
  • Any complex multi-phase design task

═══════════════════════════════════════════════════════════
BRAND BRIEF INTERPRETATION (read this carefully)
═══════════════════════════════════════════════════════════

When the user's brief describes a BRAND IDENTITY — name + mood + primary color + fonts + industry — but does NOT explicitly name a deliverable format (post, ad, banner, brochure, landing page, carousel), the default interpretation is **"design system"**, NOT "Instagram post".

A brand brief looks like:
  Brand: Aurelia
  Mood: luxury, editorial
  Primary color: #1F3A2E
  Fonts: Cormorant Garamond + Inter
  Industry: food & beverage

This is NOT a request for a social post. It is a request for visual foundations — a design system. You MUST:

  1. Call list_skills() first
  2. Call load_skill("design-system") — this is the matching recipe
  3. Follow its Phase 1 → STOP → user approval → Phase 2 flow

Figmento is primarily used for social/ad/print design, but that does NOT mean "when in doubt, make a social post". When in doubt about what the user wants built from a brand brief, **ASK** — do not default to any specific format. Say: "I have this brand brief. Do you want me to build (a) a design system with tokens/components/variables, (b) a social post/ad, (c) a landing page hero, or something else?"

Explicit format requests override this default:
  • "Create a post for Aurelia" / "make an Instagram post" → social workflow (skip design-system skill)
  • "Design an ad for Aurelia" → ad workflow
  • "Build a landing page for Aurelia" → landing page workflow
  • "Create a design system for Aurelia" / "build a brand kit" → design-system skill
  • Ambiguous brand brief with no format verb → ASK or default to design-system skill

═══════════════════════════════════════════════════════════
Skill Execution Rules (non-negotiable)
═══════════════════════════════════════════════════════════

When a skill is loaded, it is AUTHORITATIVE. This means:

  1. Call the exact tools the skill specifies, in the exact order.
  2. Do NOT substitute alternative tools. If the skill says call design_system_preview, you call design_system_preview — you do NOT rebuild that functionality manually via batch_execute.
  3. Respect review gates. If a skill has a Phase 1 → STOP → user approval → Phase 2 flow, you MUST stop after Phase 1 and wait for explicit user approval before continuing.
  4. Follow the skill's Hard Rules section — those are real constraints, not suggestions.
  5. Execute the skill's Quality Checklist before reporting done.
  6. If the skill's tools fail or produce broken output, delete the partial work and regenerate atomically. Do NOT attempt mid-generation fix-ups (this is the #1 source of orphan frames and duplicate showcases).

═══════════════════════════════════════════════════════════
Other Figmento Conventions
═══════════════════════════════════════════════════════════

  • Always connect_to_figma before creating elements (skip if already connected)
  • Prefer batch_execute for creating 3+ related elements in parallel
  • Every auto-layout content frame must use layoutSizingVertical: HUG (never fixed height — clips text)
  • Short text labels (< 24 chars) use textAutoResize: WIDTH_AND_HEIGHT
  • Name every frame descriptively — never leave default "Rectangle" or "Text" names
  • One design = one root frame. Never create sibling repair frames.

For detailed rules on any topic, call get_design_rules(category) where category is one of: typography, layout, color, print, evaluation, refinement, anti-patterns, gradients, taste.`;

export function createFigmentoServer(): FigmentoServerResult {
  const server = new McpServer(
    {
      name: 'figmento',
      version: '1.0.0',
    },
    {
      instructions: FIGMENTO_SERVER_INSTRUCTIONS,
    },
  );

  const wsClient = new FigmentoWSClient();

  // Helper: ensure connected before executing a tool
  async function requireConnection() {
    if (!wsClient.isConnected) {
      throw new Error(
        'Not connected to Figma. Use the connect_to_figma tool first with the channel ID shown in the Figma plugin.'
      );
    }
  }

  // Helper: send command and return formatted result
  async function sendDesignCommand(action: string, params: Record<string, unknown>) {
    await requireConnection();
    const response = await wsClient.sendCommand(action, params);
    if (!response.success) {
      throw new Error(`Figma error: ${response.error || 'Unknown error'}`);
    }
    return response.data || {};
  }

  // Register all tool modules
  registerConnectionTools(server, wsClient);
  registerCanvasTools(server, sendDesignCommand);
  registerStyleTools(server, sendDesignCommand);
  registerSceneTools(server, sendDesignCommand);
  registerGetScreenshotTool(server, sendDesignCommand);
  registerExportNodeTool(server, sendDesignCommand);
  registerExportToFileTool(server, sendDesignCommand);
  registerEvaluateDesignTool(server, sendDesignCommand);
  registerBatchTools(server, sendDesignCommand);
  registerIntelligenceTools(server);
  registerTemplateTools(server, sendDesignCommand);
  registerDesignSystemTools(server, sendDesignCommand);
  registerPatternTools(server, sendDesignCommand);
  registerDsTemplateTools(server, sendDesignCommand);
  registerIconTools(server, sendDesignCommand);
  registerAdAnalyzerTools(server, sendDesignCommand);
  registerLayoutTools(server);
  registerReferenceTools(server);
  registerFigmaNativeTools(server, sendDesignCommand);
  registerRefinementTools(server, sendDesignCommand);
  registerLearningTools(server, wsClient);
  registerResourceTools(server);
  registerImageGenTools(server, sendDesignCommand);
  registerFileStorageTools(server, sendDesignCommand);
  registerOrchestrationTools(server, sendDesignCommand);
  registerImageFillTools(server, sendDesignCommand);
  registerBriefAnalysisTools(server);
  registerDSPipelineTools(server, sendDesignCommand);
  registerInteractiveComponentTools(server, sendDesignCommand);
  registerCodegenTools(server);
  registerSkillsTools(server);

  // SP-7: Pre-warm knowledge cache (fire-and-forget, non-blocking)
  preWarmKnowledgeCache();

  // CF-2: Cleanup temp files older than 24h
  cleanupOldTempFiles();

  return { server, wsClient };
}
