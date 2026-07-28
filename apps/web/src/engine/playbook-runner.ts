import type { PlaybookStepAction, PlaybookStepDef, PlaybookDefinition, PlaybookSession, PlaybookReadinessContext } from '@nx9/shared';
import { resolveNextStep } from '@nx9/shared';
import { useViewMode } from './stage-deck/stores/view-mode';
import { useFlowCommands } from '../stores/flow-commands';
import { useFlowRuntime } from '../stores/flow-runtime';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { useDirector3dUi } from '../stores/director3d-ui';
import { useActivityLog } from '../stores/activity-log';
import { spawnCameraBlocksForShots } from './camera-block-spawn';
import {
  approveAllKeyframes,
  batchGenerateKeyframesFromShots,
  batchGenerateVideosFromShots,
  simpleConcatExport,
  syncPreviewFromStoryboard,
} from './core-pipeline-runner';

function focusOrSpawn(kind: string) {
  const runtime = useFlowRuntime.getState().runtime;
  const node = runtime?.getNodes().find((n) => n.type === kind);
  if (node) runtime?.focusBlock(node.id);
  else useFlowCommands.getState().requestSpawn(kind);
}

/** Rail 已拆除：按旧 tab 名聚焦对应画布节点 */
export function openLegacyRailTab(tab: string) {
  if (tab === 'storyboard') focusOrSpawn('storyboard-desk');
  else if (tab === 'script') focusOrSpawn('script-desk');
  else if (tab === 'library') {
    // 素材库走独立 Modal；此处不强制打开
  }
}

export function executeStepAction(action: PlaybookStepAction, ctx: PlaybookReadinessContext): void {
  switch (action.type) {
    case 'spawn_camera_blocks': {
      // F-003/F-004: 仅用链镜表；未注入则不回退全局
      const shots = ctx.chainShots !== undefined ? ctx.chainShots : [];
      if (shots.length === 0) {
        useActivityLog.getState().append('无上游链镜表，已跳过机位生成（F-004）');
        break;
      }
      spawnCameraBlocksForShots(action.mode, shots as any);
      break;
    }
    case 'open_rail': {
      openLegacyRailTab(action.tab);
      break;
    }
    case 'open_panel':
      switch (action.panel) {
        case 'storyboard-full':
          focusOrSpawn('storyboard-desk');
          break;
        case 'episode-studio':
          focusOrSpawn('clip-editor');
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
          void batchGenerateKeyframesFromShots();
          break;
        case 'batch_keyframes':
          void batchGenerateKeyframesFromShots();
          break;
        case 'batch_videos':
          // F-004: 无链镜表时阻断，禁止误批全局
          if (!ctx.chainShots || ctx.chainShots.length === 0) {
            useActivityLog.getState().append('请连接分镜台/导演台后再批出视频（F-004）');
            break;
          }
          void batchGenerateVideosFromShots(undefined, false, undefined, ctx.chainShots as any);
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
