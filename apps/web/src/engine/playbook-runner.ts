import type { PlaybookStepAction, PlaybookStepDef, PlaybookDefinition, PlaybookSession, PlaybookReadinessContext } from '@nx9/shared';
import { resolveNextStep } from '@nx9/shared';
import { useContextRailUi } from './stage-deck/stores/context-rail-ui';
import { useViewMode } from './stage-deck/stores/view-mode';
import { useFlowCommands } from '../stores/flow-commands';
import { useFlowRuntime, useRemotionUi } from '../stores/flow-runtime';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { useDirector3dUi } from '../stores/director3d-ui';
import { spawnCameraBlocksForShots } from './camera-block-spawn';
import {
  approveAllKeyframes,
  batchGenerateKeyframesFromShots,
  batchGenerateVideosFromShots,
  simpleConcatExport,
  syncPreviewFromStoryboard,
} from './core-pipeline-runner';

export function executeStepAction(action: PlaybookStepAction, ctx: PlaybookReadinessContext): void {
  switch (action.type) {
    case 'spawn_camera_blocks': {
      const shots = useWorkspaceDocument.getState().storyboard.shots;
      spawnCameraBlocksForShots(action.mode, shots);
      break;
    }
    case 'open_rail': {
      const opts = action.sub ? { librarySub: action.sub as 'templates' | 'history' | 'workflow' } : undefined;
      useContextRailUi.getState().requestTab(action.tab, opts);
      break;
    }
    case 'open_panel':
      switch (action.panel) {
        case 'storyboard-full': {
          const runtime = useFlowRuntime.getState().runtime;
          const desk = runtime?.getNodes().find((n) => n.type === 'storyboard-desk');
          if (desk) runtime?.focusBlock(desk.id);
          else useFlowCommands.getState().requestSpawn('storyboard-desk');
          break;
        }
        case 'episode-studio':
          useRemotionUi.getState().setOpen(true);
          break;
        case 'director-3d':
          useDirector3dUi.getState().openStandalone();
          break;
      }
      break;
    case 'load_template':
      useFlowCommands.getState().requestLoadTemplate(action.templateId, action.mode);
      break;
    case 'focus_block': {
      const runtime = useFlowRuntime.getState().runtime;
      if (!runtime) break;
      const nodes = runtime.getNodes();
      const target = nodes.find(n => n.type === action.kind);
      if (target) {
        runtime.focusBlock(target.id);
      } else if (action.spawnIfMissing) {
        useFlowCommands.getState().requestSpawn(action.kind);
      }
      break;
    }
    case 'run_cascade': {
      const runtime = useFlowRuntime.getState().runtime;
      if (!runtime?.runCascade) break;
      const nodes = runtime.getNodes();
      const target = nodes.find(n => n.type === action.fromKind);
      if (target) {
        runtime.runCascade(target.id);
      }
      break;
    }
    case 'run_batch': {
      const runtime = useFlowRuntime.getState().runtime;
      if (!runtime) break;
      if (action.blockKinds?.length) {
        const nodes = runtime.getNodes();
        const ids = nodes
          .filter((n) => n.type && action.blockKinds!.includes(n.type))
          .map((n) => n.id);
        if (ids.length > 0) {
          runtime.runSelected(ids);
        }
      } else {
        runtime.runBatch();
      }
      break;
    }
    case 'storyboard_action': {
      switch (action.action) {
        case 'approve_all_pending':
        case 'approve_all_keyframes':
          approveAllKeyframes();
          break;
        case 'batch_line_art':
          useContextRailUi.getState().requestTab('storyboard');
          void batchGenerateKeyframesFromShots();
          break;
        case 'batch_keyframes':
          void batchGenerateKeyframesFromShots();
          break;
        case 'batch_videos':
          void batchGenerateVideosFromShots();
          break;
        case 'sync_preview':
          syncPreviewFromStoryboard();
          break;
        case 'simple_export':
          void simpleConcatExport();
          break;
        default:
          break;
      }
      break;
    }
    case 'set_view_mode':
      useViewMode.getState().setMode(action.mode);
      break;
    case 'wait_user':
      console.log('[Playbook] wait_user:', action.hint);
      break;
  }
}

export function advancePlaybookStep(
  playbook: PlaybookDefinition,
  session: PlaybookSession,
  ctx: PlaybookReadinessContext,
): { step: PlaybookStepDef; index: number; allDone: boolean; updatedSession: PlaybookSession } {
  const resolved = resolveNextStep(playbook, session, ctx);
  if (resolved.allDone) {
    return { ...resolved, updatedSession: session };
  }

  executeStepAction(resolved.step.primaryAction, ctx);

  const completedSet = new Set(session.completedStepIds);
  for (let i = 0; i < resolved.index; i++) {
    completedSet.add(playbook.steps[i].id);
  }

  return {
    ...resolved,
    updatedSession: {
      ...session,
      currentStepId: resolved.step.id,
      completedStepIds: [...completedSet],
    },
  };
}
