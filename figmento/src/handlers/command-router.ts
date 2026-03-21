/// <reference types="@figma/plugin-typings" />

import type { WSCommand, WSResponse } from '../types';
import { classifyError } from '../utils/error-classifier';
import { PREFERENCES_STORAGE_KEY } from './storage';

// Canvas handlers
import { handleCreateFrame, handleCreateText, handleCreateRectangle, handleCreateEllipse, handleCreateImage, handleCreateIcon, handleCreateVector } from './canvas-create';
import { handleSetFill, handleSetStroke, handleSetEffects, handleSetCornerRadius, handleSetOpacity, handleSetAutoLayout, handleSetText, handleFlipGradient, handleStyleTextRange } from './canvas-style';
import { handleDeleteNode, handleMoveNode, handleResizeNode, handleRenameNode, handleAppendChild, handleReorderChild, handleCloneNode, handleCloneWithOverrides, handleGroupNodes, handleGetSelection, handleGetNodeInfo, handleGetPageNodes, handleFindNodes, handleListAvailableFonts, handleBooleanOperation, handleFlattenNodes, handleImportComponentByKey, handleImportStyleByKey } from './canvas-scene';
import { handleExportNode, handleGetScreenshot, handleScanFrameStructure, handleReadFigmaContext, handleBindVariable, handleApplyPaintStyle, handleApplyTextStyle, handleApplyEffectStyle, handleCreateFigmaVariables, handleExportAsSvg, handleSetConstraints } from './canvas-query';
import { handleBatchExecute, handleCreateDesignCmd, handleScanTemplateCmd, handleApplyTemplateTextCmd, handleApplyTemplateImageCmd, runRefinementCheck } from './canvas-batch';

export async function executeCommand(cmd: WSCommand): Promise<WSResponse> {
  const baseResponse = {
    type: 'response' as const,
    id: cmd.id,
    channel: cmd.channel,
  };

  try {
    let data: Record<string, unknown>;

    switch (cmd.action) {
      case 'create_frame':
        data = await handleCreateFrame(cmd.params); break;
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
      case 'read_figma_context':
        data = await handleReadFigmaContext(); break;
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
      case 'run_refinement_check':
        data = await runRefinementCheck(String(cmd.params.nodeId)); break;
      case 'get_preferences': {
        const prefs = await figma.clientStorage.getAsync(PREFERENCES_STORAGE_KEY) || [];
        data = { preferences: prefs };
        break;
      }
      default:
        return { ...baseResponse, success: false, error: `Unknown action: ${cmd.action}` };
    }

    return { ...baseResponse, success: true, data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const { code, recoverable } = classifyError(errorMessage);
    return { ...baseResponse, success: false, error: errorMessage, errorCode: code, recoverable };
  }
}
