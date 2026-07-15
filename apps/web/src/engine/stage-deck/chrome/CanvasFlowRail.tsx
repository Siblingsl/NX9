import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';
import {
  PLAYBOOK_DEFINITIONS,
  evaluateAllStepVisualStates,
  type StepVisualState,
  computeStageReadiness,
  resolvePipelineStageStates,
  PIPELINE_STAGES,
} from '@nx9/shared';
import { useWorkspaceDocument } from '../../../stores/workspace-document';
import { useFlowRuntime } from '../../../stores/flow-runtime';
import { useContextRailUi } from '../stores/context-rail-ui';
import { focusStepNodes } from '../../playbook-focus';
import { translate } from '@nx9/shared';
import '../../../styles/canvas-flow-rail.css';

interface TooltipData {
  stepId: string;
  label: string;
  reasons: string[];
  primaryActionLabel: string;
  onFix: () => void;
}

export function CanvasFlowRail() {
  const session = useWorkspaceDocument((s) => s.playbookSession);
  const storyboard = useWorkspaceDocument((s) => s.storyboard);
  const voice = useWorkspaceDocument((s) => s.voice);
  const scriptPlan = useWorkspaceDocument((s) => s.scriptPlan);
  const environments = useWorkspaceDocument((s) => s.environments);
  const characters = useWorkspaceDocument((s) => s.characters);
  const runtime = useFlowRuntime((s) => s.runtime);
  const selectedBlockId = useFlowRuntime((s) => s.selectedBlockId);
  const requestRailTab = useContextRailUi((s) => s.requestTab);
  const [hoveredStepId, setHoveredStepId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [flashStepId, setFlashStepId] = useState<string | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  const playbook = useMemo(() => {
    if (!session || session.dismissed) return null;
    return PLAYBOOK_DEFINITIONS.find((p) => p.id === session.playbookId) ?? null;
  }, [session]);

  const readinessCtx = useMemo(() => ({
    storyboard: {
      title: storyboard.title,
      activeEpisodeId: storyboard.activeEpisodeId,
      shots: storyboard.shots.map((sh) => ({
        id: sh.id,
        episodeId: sh.episodeId,
        status: sh.status as string,
        firstFrameAssetId: sh.firstFrameAssetId ?? undefined,
        videoAssetId: sh.videoAssetId ?? undefined,
        keyframeStatus: sh.keyframeStatus,
        videoStatus: sh.videoStatus,
        linkedBlockId: sh.linkedBlockId ?? undefined,
      })),
    },
    voice,
    nodes: (runtime?.getNodes() ?? []).map((n) => ({ id: n.id, type: n.type ?? 'unknown', data: (n.data ?? {}) as Record<string, unknown> })),
    scriptPlan: scriptPlan ?? undefined,
    environments: environments?.environments ?? undefined,
    characters: characters.characters.map((c) => ({
      name: c.name,
      appearance: (c as any).bible?.appearance,
      consistencyPrompt: c.consistencyPrompt,
      referenceImageUrl: c.referenceImageUrl ?? undefined,
    })),
    playbookSession: session,
  }), [storyboard, voice, runtime, scriptPlan, environments, characters, session]);

  const stepStates = useMemo(() => {
    if (!session) return [];
    return evaluateAllStepVisualStates(session, readinessCtx);
  }, [session, readinessCtx]);

  const currentStep = useMemo(() => {
    if (!playbook || !session) return null;
    return playbook.steps.find((s) => s.id === session.currentStepId) ?? null;
  }, [playbook, session]);

  const getBlockReasons = useCallback((stepId: string): string[] => {
    if (!playbook) return [];
    const step = playbook.steps.find((s) => s.id === stepId);
    if (!step) return [];
    const reasons: string[] = [];
    const key = step.readinessKey;
    if (key === 'has_environment_bibles') {
      const envs = environments?.environments ?? [];
      if (envs.length === 0) reasons.push('缺少场景参考图，请先生成环境卡');
      else if (!envs.some((e) => (e.referenceUrls?.length ?? 0) >= 1)) reasons.push('缺少场景参考图，请上传场景参考图片');
    } else if (key === 'has_source_text') {
      reasons.push('请先在左侧 Rail › Script 中粘贴剧本');
    } else if (key === 'has_scene_split') {
      reasons.push('请先在 Script 中完成 AI 场次拆分');
    } else if (key === 'has_storyboard_shots') {
      reasons.push('请先生成故事板分镜表');
    } else if (key === 'story_grid_confirmed') {
      reasons.push('请先在分镜网格检查并确认当前集');
    } else if (key === 'has_character_bibles') {
      reasons.push('请先提取角色，填写六层设定 + 上传参考图');
    } else if (key === 'has_camera_blocks') {
      reasons.push('请先为镜头关联导演台/3D 机位模块');
    } else if (key === 'has_keyframes') {
      reasons.push('请先批量生成关键帧');
    } else if (key === 'all_keyframes_approved') {
      reasons.push('请先审阅全部关键帧并标记通过');
    } else if (key === 'has_video_assets') {
      reasons.push('请先生成视频素材');
    } else if (key === 'consistency_resolved') {
      reasons.push('请先处理连贯性检查中的问题');
    } else if (key === 'has_video_takes') {
      reasons.push('请先在 Episode Studio 中生成时间线');
    } else if (key === 'all_videos_approved') {
      reasons.push('请先审阅全部视频并标记通过');
    } else if (key === 'export_ready') {
      reasons.push('请先运行 export-pack 节点完成导出');
    } else {
      reasons.push(`条件未满足: ${step.verifyHint}`);
    }
    return reasons;
  }, [playbook, environments]);

  const getActionLabel = useCallback((stepId: string): string => {
    if (!playbook) return '去修复';
    const step = playbook.steps.find((s) => s.id === stepId);
    if (!step) return '去修复';
    if (step.readinessKey === 'has_environment_bibles') return '打开环境卡面板';
    const action = step.primaryAction;
    switch (action.type) {
      case 'open_rail': return '打开 Rail 面板';
      case 'open_panel': return '打开面板';
      case 'run_cascade': return '运行级联';
      case 'run_batch': return '批量运行';
      case 'focus_block': return '聚焦节点';
      case 'load_template': return '加载模板';
      case 'set_view_mode': return '切换视图';
      default: return '去修复';
    }
  }, [playbook]);

  const executePrimaryAction = useCallback((stepId: string) => {
    if (!playbook || !runtime) return;
    const step = playbook.steps.find((s) => s.id === stepId);
    if (!step) return;
    const action = step.primaryAction;
    if (action.type === 'open_rail') {
      requestRailTab(action.tab, action.sub ? { librarySub: action.sub as any } : undefined);
    } else if (action.type === 'open_panel') {
      import('../../../stores/flow-runtime').then(({ useStoryboardUi }) => {
        useStoryboardUi.getState().setOpen(true);
      });
    } else if (action.type === 'run_cascade') {
      const nodes = runtime.getNodes();
      const target = nodes.find((n) => {
        const kinds = step.canvasNodeKinds ?? [];
        return kinds.includes(n.type ?? '') || n.data?.playbookStepId === step.id;
      });
      if (target) {
        runtime.runCascade?.(target.id);
      }
    } else if (action.type === 'run_batch') {
      runtime.runBatch();
    } else if (action.type === 'focus_block') {
      const nodes = runtime.getNodes();
      const target = nodes.find((n) => {
        const kinds = step.canvasNodeKinds ?? [];
        return kinds.includes(n.type ?? '') || n.data?.playbookStepId === step.id;
      });
      if (target) runtime.focusBlock(target.id);
    } else if (action.type === 'load_template') {
      runtime.loadWorkflowTemplate(action.templateId, action.mode);
    } else if (action.type === 'set_view_mode') {
      import('../stores/view-mode').then(({ useViewMode }) => {
        useViewMode.getState().setMode(action.mode);
      });
    }
  }, [playbook, runtime, requestRailTab]);

  const handleStepClick = useCallback((stepId: string, state: StepVisualState) => {
    setTooltip(null);
    if (!playbook || !runtime) return;
    const step = playbook.steps.find((s) => s.id === stepId);
    if (!step) return;

    if (state === 'done') {
      focusStepNodes(step, runtime);
      return;
    }
    if (state === 'current' && currentStep) {
      const action = currentStep.primaryAction;
      if (action.type === 'open_rail') {
        requestRailTab(action.tab, action.sub ? { librarySub: action.sub as any } : undefined);
      } else if (action.type === 'open_panel') {
        import('../../../stores/flow-runtime').then(({ useStoryboardUi }) => {
          useStoryboardUi.getState().setOpen(true);
        });
      }
      return;
    }
    if (state === 'error') {
      requestRailTab('inspector');
      return;
    }
    if (state === 'blocked') {
      const reasons = getBlockReasons(stepId);
      setTooltip({
        stepId,
        label: step.label,
        reasons,
        primaryActionLabel: getActionLabel(stepId),
        onFix: () => {
          setTooltip(null);
          executePrimaryAction(stepId);
        },
      });
      return;
    }
  }, [playbook, runtime, currentStep, requestRailTab, getBlockReasons, getActionLabel, executePrimaryAction]);

  useEffect(() => {
    if (!runtime || !hoveredStepId || !playbook) return;
    const step = playbook.steps.find((s) => s.id === hoveredStepId);
    if (!step) return;
    const kinds = step.canvasNodeKinds ?? [];
    const nodes = runtime.getNodes().filter(
      (n) => kinds.includes(n.type ?? '') || n.data?.playbookStepId === step.id,
    );
    if (nodes.length === 0) return;
    for (const n of runtime.getNodes()) {
      const shouldHighlight = nodes.some((hn) => hn.id === n.id);
      if (shouldHighlight) {
        runtime.updateNodeData(n.id, { ...n.data, hoverHighlight: true } as Record<string, unknown>);
      } else if (n.data?.hoverHighlight) {
        runtime.updateNodeData(n.id, { ...n.data, hoverHighlight: undefined } as Record<string, unknown>);
      }
    }
  }, [hoveredStepId, runtime, playbook]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!runtime || !selectedBlockId || !session || session.dismissed) return;
    const def = PLAYBOOK_DEFINITIONS.find((p) => p.id === session.playbookId);
    if (!def) return;
    const selectedNode = runtime.getNodes().find((n) => n.id === selectedBlockId);
    if (!selectedNode) return;
    const matchedStep = def.steps.find((s) => {
      const kinds = s.canvasNodeKinds ?? [];
      return kinds.includes(selectedNode.type ?? '') || selectedNode.data?.playbookStepId === s.id;
    });
    if (matchedStep && matchedStep.id !== flashStepId) {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      setFlashStepId(matchedStep.id);
      flashTimeoutRef.current = setTimeout(() => {
        setFlashStepId(null);
      }, 2000);
    } else if (!matchedStep) {
      setFlashStepId(null);
    }
  }, [runtime, selectedBlockId, session, flashStepId]);

  const freeReadiness = useMemo(() => {
    if (!runtime) return null;
    return computeStageReadiness({
      storyboard,
      voice,
      nodes: runtime.getNodes(),
    });
  }, [storyboard, voice, runtime]);

  const freeStageStates = useMemo(() => {
    if (!freeReadiness) return null;
    return resolvePipelineStageStates(freeReadiness);
  }, [freeReadiness]);

  const isFree = !session || session.dismissed || session.playbookId === 'pb-blank-advanced';

  if (isFree && (!session || session.playbookId === 'pb-blank-advanced' || session.dismissed)) {
    return (
      <div className="nx9-flow-rail" ref={railRef}>
        <div className="nx9-flow-rail-free">
          <div>自由模式 · 从左侧 Dock 拖入节点，或 ⌘K 搜索命令</div>
          <div className="nx9-flow-rail-free-modes">
            {PIPELINE_STAGES.map((stage, i) => {
              const state = freeStageStates?.[i] ?? 'pending';
              const ready = freeReadiness?.[stage.id] ?? false;
              return (
                <span
                  key={stage.id}
                  className={`nx9-flow-rail-free-dot nx9-flow-rail-free-dot--${state}`}
                >
                  <span className={`nx9-flow-rail-free-dot-indicator nx9-flow-rail-free-dot-indicator--${state}`}>
                    {state === 'done' ? <Check size={8} /> : null}
                  </span>
                  {translate(stage.label)}
                  {!ready && state !== 'done' && (
                    <span className="nx9-flow-rail-free-dot-warn">!</span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (!session || session.dismissed) return null;
  if (!playbook || playbook.steps.length === 0) return null;

  return (
    <div className="nx9-flow-rail" ref={railRef} role="navigation" aria-label="步骤进度">
      {stepStates.map(({ step, index, state }, i) => (
        <div key={step.id} className="flex items-center relative">
          <button
            type="button"
            onClick={() => handleStepClick(step.id, state)}
            onMouseEnter={() => setHoveredStepId(step.id)}
            onMouseLeave={() => setHoveredStepId(null)}
            className={`nx9-flow-rail-step nx9-flow-rail-step--${state} ${flashStepId === step.id ? 'nx9-flow-rail-step--flash' : ''}`}
            title={translate(`${step.label}: ${step.description}`)}
          >
            <span className={`nx9-flow-rail-step-badge nx9-flow-rail-step-badge--${state}`}>
              {state === 'done' ? <Check size={10} /> : state === 'error' ? <span>!</span> : state === 'skipped' ? <span>—</span> : index + 1}
            </span>
            <span className={`nx9-flow-rail-label ${state === 'skipped' ? 'nx9-flow-rail-step-label--skipped' : ''}`}>
              {translate(step.shortLabel ?? step.label.replace(/^[①-⑬]\s*/, ''))}
            </span>
            {state === 'blocked' && (
              <span className="nx9-flow-rail-step-warn">!</span>
            )}
            {state === 'waiting' && (
              <span className="nx9-flow-rail-step-waiting" />
            )}
          </button>
          {i < stepStates.length - 1 && <span className="nx9-flow-rail-step-sep" aria-hidden />}

          {tooltip && tooltip.stepId === step.id && (
            <div className="nx9-flow-rail-tooltip">
              <div className="nx9-flow-rail-tooltip-header">
                <span className="nx9-flow-rail-tooltip-title">{translate(tooltip.label)}</span>
                <button
                  type="button"
                  onClick={() => setTooltip(null)}
                  className="nx9-flow-rail-tooltip-close"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="nx9-flow-rail-tooltip-body">
                {tooltip.reasons.map((r, j) => (
                  <div key={j} className="nx9-flow-rail-tooltip-reason">{translate(r)}</div>
                ))}
              </div>
              <button
                type="button"
                onClick={tooltip.onFix}
                className="nx9-flow-rail-tooltip-action"
              >
                {translate(tooltip.primaryActionLabel)}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
