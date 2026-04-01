/// <reference types="@figma/plugin-typings" />

import type { WSCommand, WSResponse } from '../types';
import { classifyError } from '../utils/error-classifier';
import { PREFERENCES_STORAGE_KEY } from './storage';

// Canvas handlers
import { handleCreateFrame, handleCreateText, handleCreateRectangle, handleCreateEllipse, handleCreateImage, handleCreateIcon, handleCreateVector } from './canvas-create';
import { handleSetFill, handleSetStroke, handleSetEffects, handleSetCornerRadius, handleSetOpacity, handleSetAutoLayout, handleSetText, handleFlipGradient, handleStyleTextRange } from './canvas-style';
import { handleDeleteNode, handleMoveNode, handleResizeNode, handleRenameNode, handleAppendChild, handleReorderChild, handleCloneNode, handleCloneWithOverrides, handleGroupNodes, handleGetSelection, handleGetNodeInfo, handleGetPageNodes, handleFindNodes, handleListAvailableFonts, handleBooleanOperation, handleFlattenNodes, handleImportComponentByKey, handleImportStyleByKey } from './canvas-scene';
import { handleExportNode, handleGetScreenshot, handleScanFrameStructure, handleReadFigmaContext, handleBindVariable, handleApplyPaintStyle, handleApplyTextStyle, handleApplyEffectStyle, handleCreateFigmaVariables, handleCreateVariableCollections, handleCreateTextStyles, handleCreateDSComponents, handleExportAsSvg, handleSetConstraints } from './canvas-query';
import { getDesignSystemCache, handleScanDesignSystem } from './design-system-discovery';
import { handleBatchExecute, handleCreateDesignCmd, handleScanTemplateCmd, handleApplyTemplateTextCmd, handleApplyTemplateImageCmd, runRefinementCheck } from './canvas-batch';
import { handleCreateDSShowcase } from './ds-showcase';
import { tryComponentInstance, isComponentMatchableFrame } from './component-matcher';
import { handleCreateComponent, handleConvertToComponent, handleCombineAsVariants, handleCreateInstance, handleDetachInstance, handleSetReactions, handleGetReactions, handleMakeInteractive, handleCreatePrototypeFlow } from './canvas-components';

/**
 * Idempotency guard — prevents duplicate command execution from WebSocket replays
 * or retry logic. Tracks recently processed command IDs with a sliding window.
 */
const processedCommandIds = new Set<string>();
const IDEMPOTENCY_WINDOW = 500; // max tracked IDs before pruning

function markProcessed(id: string): void {
  processedCommandIds.add(id);
  if (processedCommandIds.size > IDEMPOTENCY_WINDOW) {
    // Prune oldest half (Set preserves insertion order)
    const entries = [...processedCommandIds];
    for (let i = 0; i < entries.length / 2; i++) {
      processedCommandIds.delete(entries[i]);
    }
  }
}

/** Cached results for idempotency — stores last response per command ID. */
const idempotencyCache = new Map<string, WSResponse>();
const IDEMPOTENCY_CACHE_MAX = 200;

export async function executeCommand(cmd: WSCommand): Promise<WSResponse> {
  const baseResponse = {
    type: 'response' as const,
    id: cmd.id,
    channel: cmd.channel,
  };

  // Idempotency check: if this command ID was already processed, return cached result
  if (cmd.id && processedCommandIds.has(cmd.id)) {
    const cached = idempotencyCache.get(cmd.id);
    if (cached) {
      console.log(`[Idempotency] Skipping duplicate command ${cmd.id} (${cmd.action})`);
      return cached;
    }
    // ID was processed but cache was pruned — return success with warning
    return { ...baseResponse, success: true, data: { warning: 'Duplicate command skipped', action: cmd.action } };
  }

  try {
    let data: Record<string, unknown>;

    switch (cmd.action) {
      case 'create_frame': {
        // FN-7: Intercept create_frame calls that match a discovered component
        const frameName = (cmd.params.name as string) || '';
        if (cmd.params.useDesignSystem !== false && isComponentMatchableFrame(frameName)) {
          const dsCache = await getDesignSystemCache();
          const instanceResult = await tryComponentInstance(cmd.params, dsCache);
          if (instanceResult) {
            data = instanceResult;
            break;
          }
        }
        // Fallback to primitive creation
        data = await handleCreateFrame(cmd.params);
        data.matchedComponent = null;
        break;
      }
      case 'create_text':
        data = await handleCreateText(cmd.params); break;
      case 'set_fill':
        data = await handleSetFill(cmd.params); break;
      case 'flip_gradient':
        data = handleFlipGradient(cmd.params); break;
      case 'export_node':
        data = await handleExportNode(cmd.params); break;
      case 'get_screenshot':
        data = await handleGetScreenshot(cmd.params); break;
      case 'get_selection':
        data = await handleGetSelection(); break;
      case 'create_rectangle':
        data = await handleCreateRectangle(cmd.params); break;
      case 'create_ellipse':
        data = await handleCreateEllipse(cmd.params); break;
      case 'create_image':
        data = await handleCreateImage(cmd.params); break;
      case 'set_stroke':
        data = await handleSetStroke(cmd.params); break;
      case 'set_effects':
        data = await handleSetEffects(cmd.params); break;
      case 'set_corner_radius':
        data = await handleSetCornerRadius(cmd.params); break;
      case 'set_opacity':
        data = await handleSetOpacity(cmd.params); break;
      case 'set_auto_layout':
        data = await handleSetAutoLayout(cmd.params); break;
      case 'delete_node':
        data = await handleDeleteNode(cmd.params); break;
      case 'move_node':
        data = await handleMoveNode(cmd.params); break;
      case 'resize_node':
        data = await handleResizeNode(cmd.params); break;
      case 'rename_node':
        data = await handleRenameNode(cmd.params); break;
      case 'append_child':
        data = await handleAppendChild(cmd.params); break;
      case 'reorder_child':
        data = await handleReorderChild(cmd.params); break;
      case 'clone_node':
        data = await handleCloneNode(cmd.params); break;
      case 'group_nodes':
        data = await handleGroupNodes(cmd.params); break;
      case 'get_node_info':
        data = await handleGetNodeInfo(cmd.params); break;
      case 'get_page_nodes':
        data = await handleGetPageNodes(); break;
      case 'create_design':
        data = await handleCreateDesignCmd(cmd.params); break;
      case 'create_icon':
        data = await handleCreateIcon(cmd.params); break;
      case 'scan_template':
        data = await handleScanTemplateCmd(cmd.params); break;
      case 'apply_template_text':
        data = await handleApplyTemplateTextCmd(cmd.params); break;
      case 'apply_template_image':
        data = await handleApplyTemplateImageCmd(cmd.params); break;
      case 'batch_execute':
        data = await handleBatchExecute(cmd.params); break;
      case 'clone_with_overrides':
        data = await handleCloneWithOverrides(cmd.params); break;
      case 'scan_frame_structure':
        data = await handleScanFrameStructure(cmd.params); break;
      case 'set_text':
        data = await handleSetText(cmd.params); break;
      case 'style_text_range':
        data = await handleStyleTextRange(cmd.params); break;
      case 'find_nodes':
        data = await handleFindNodes(cmd.params); break;
      case 'list_available_fonts':
        data = await handleListAvailableFonts(cmd.params); break;
      case 'create_vector':
        data = await handleCreateVector(cmd.params); break;
      case 'boolean_operation':
        data = await handleBooleanOperation(cmd.params); break;
      case 'flatten_nodes':
        data = await handleFlattenNodes(cmd.params); break;
      case 'import_component_by_key':
        data = await handleImportComponentByKey(cmd.params); break;
      case 'import_style_by_key':
        data = await handleImportStyleByKey(cmd.params); break;
      case 'export_as_svg':
        data = await handleExportAsSvg(cmd.params); break;
      case 'set_constraints':
        data = await handleSetConstraints(cmd.params); break;
      case 'ad-analyzer-complete': {
        // Forward to UI iframe — this is a UI-only message, no Figma API action
        figma.ui.postMessage({
          type: 'ad-analyzer-complete',
          report: cmd.params.report,
          carouselNodeId: cmd.params.carouselNodeId,
          variantNodeIds: cmd.params.variantNodeIds,
        });
        data = {};
        break;
      }
      case 'read_figma_context': {
        data = await handleReadFigmaContext();
        // FN-6: Enrich with cached component data if available
        const dsCache = await getDesignSystemCache();
        if (dsCache && dsCache.components.length > 0) {
          data.discoveredComponents = dsCache.components;
          data.componentScanTimestamp = dsCache.scannedAt;
          data.componentsTruncated = dsCache.truncated;
        }
        break;
      }
      case 'bind_variable':
        data = await handleBindVariable(cmd.params); break;
      case 'apply_paint_style':
        data = await handleApplyPaintStyle(cmd.params); break;
      case 'apply_text_style':
        data = await handleApplyTextStyle(cmd.params); break;
      case 'apply_effect_style':
        data = await handleApplyEffectStyle(cmd.params); break;
      case 'create_figma_variables':
        data = await handleCreateFigmaVariables(cmd.params); break;
      case 'create_variable_collections':
        data = await handleCreateVariableCollections(cmd.params); break;
      case 'create_text_styles':
        data = await handleCreateTextStyles(cmd.params); break;
      case 'create_ds_components':
        data = await handleCreateDSComponents(cmd.params); break;
      case 'create_ds_showcase':
        data = await handleCreateDSShowcase(cmd.params); break;
      case 'run_refinement_check':
        data = await runRefinementCheck(String(cmd.params.nodeId)); break;
      case 'get_preferences': {
        const prefs = await figma.clientStorage.getAsync(PREFERENCES_STORAGE_KEY) || [];
        data = { preferences: prefs };
        break;
      }
      case 'scan_design_system': {
        const scanResult = await handleScanDesignSystem();
        data = scanResult as unknown as Record<string, unknown>;
        break;
      }
      // IC-1: Component creation
      case 'create_component_node':
        data = await handleCreateComponent(cmd.params); break;
      case 'convert_to_component':
        data = await handleConvertToComponent(cmd.params); break;
      // IC-2: Variant management
      case 'combine_as_variants':
        data = await handleCombineAsVariants(cmd.params); break;
      // IC-3: Instance management
      case 'create_instance':
        data = await handleCreateInstance(cmd.params); break;
      case 'detach_instance':
        data = await handleDetachInstance(cmd.params); break;
      // IC-5/8: Prototype interactions
      case 'set_reactions':
        data = await handleSetReactions(cmd.params); break;
      case 'get_reactions':
        data = await handleGetReactions(cmd.params); break;
      // IC-10: Make Interactive
      case 'make_interactive':
        data = await handleMakeInteractive(cmd.params); break;
      // IC-12: Prototype Flow Generator
      case 'create_prototype_flow':
        data = await handleCreatePrototypeFlow(cmd.params); break;
      default:
        return { ...baseResponse, success: false, error: `Unknown action: ${cmd.action}` };
    }

    const response: WSResponse = { ...baseResponse, success: true, data };
    // Mark as processed and cache for idempotency
    if (cmd.id) {
      markProcessed(cmd.id);
      idempotencyCache.set(cmd.id, response);
      if (idempotencyCache.size > IDEMPOTENCY_CACHE_MAX) {
        const firstKey = idempotencyCache.keys().next().value;
        if (firstKey) idempotencyCache.delete(firstKey);
      }
    }
    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const { code, recoverable } = classifyError(errorMessage);
    const errResponse: WSResponse = { ...baseResponse, success: false, error: errorMessage, errorCode: code, recoverable };
    // Mark failed commands as processed too — prevent retry of known failures
    if (cmd.id) {
      markProcessed(cmd.id);
      idempotencyCache.set(cmd.id, errResponse);
    }
    return errResponse;
  }
}
