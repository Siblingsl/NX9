import { useCallback, useMemo } from 'react';
import { Check, Circle, Loader2 } from 'lucide-react';
import {
  PIPELINE_STAGES,
  computeStageReadiness,
  type PipelineStageId,
} from '@nx9/shared';
import { useWorkspaceDocument } from '../../../stores/workspace-document';
import { useFlowRuntime, useStoryboardUi } from '../../../stores/flow-runtime';
import { useContextRailUi } from '../stores/context-rail-ui';
import { useViewMode } from '../stores/view-mode';
import { isSurfaceEnabled } from '../../../config/product-surface';

const STAGE_HINT: Record<PipelineStageId, string> = {
  script: '粘贴剧本并拆分镜头',
  storyboard: '检查分镜表与镜头列表',
  generate: '生成分镜图与视频',
  voice: '配音与声线',
  export: '拼接导出成片',
};

/**
 * 制作台常驻路径条：五阶段进度 + 点击跳转（不依赖 playbook session）。
 * 不改业务数据，只做导航与就绪态展示。
 */
export function ProductionPathStrip() {
  const enabled = isSurfaceEnabled('productionPathStrip');
  const storyboard = useWorkspaceDocument((s) => s.storyboard);
  const voice = useWorkspaceDocument((s) => s.voice);
  const runtime = useFlowRuntime((s) => s.runtime);
  const requestRailTab = useContextRailUi((s) => s.requestTab);
  const setStoryboardOpen = useStoryboardUi((s) => s.setOpen);
  const setStoryboardView = useStoryboardUi((s) => s.setView);
  const setViewMode = useViewMode((s) => s.setMode);
  const viewMode = useViewMode((s) => s.mode);

  const readiness = useMemo(() => {
    const nodes = (runtime?.getNodes() ?? []).map((n) => ({
      type: n.type,
      data: (n.data ?? {}) as Record<string, unknown>,
    }));
    return computeStageReadiness({ storyboard, voice, nodes });
  }, [storyboard, voice, runtime]);

  const doneCount = useMemo(
    () => PIPELINE_STAGES.filter((s) => readiness[s.id]).length,
    [readiness],
  );

  const handleStage = useCallback(
    (id: PipelineStageId) => {
      setViewMode('produce');
      switch (id) {
        case 'script':
          if (isSurfaceEnabled('scriptStudio')) requestRailTab('script');
          break;
        case 'storyboard':
          if (isSurfaceEnabled('storyboard')) {
            requestRailTab('storyboard');
            setStoryboardOpen(true);
            setStoryboardView('grid');
          }
          break;
        case 'generate':
          requestRailTab('inspector');
          break;
        case 'voice':
          requestRailTab('inspector');
          break;
        case 'export':
          if (isSurfaceEnabled('storyboard')) requestRailTab('storyboard');
          break;
        default:
          break;
      }
    },
    [requestRailTab, setStoryboardOpen, setStoryboardView, setViewMode],
  );

  if (!enabled) return null;

  // 专家编排时更紧凑
  const compact = viewMode === 'explore';

  return (
    <div
      className={`shrink-0 border-b border-line/70 bg-[#FFFCFA]/95 backdrop-blur-sm ${
        compact ? 'px-3 py-1' : 'px-4 py-1.5'
      }`}
      role="navigation"
      aria-label="制作路径"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="hidden sm:flex flex-col shrink-0 min-w-[72px]">
          <span className="text-[10px] font-semibold text-ink/70 tracking-wide">制作路径</span>
          <span className="text-[10px] text-ink/40 tabular-nums">
            {doneCount}/{PIPELINE_STAGES.length} 完成
          </span>
        </div>

        <div className="flex-1 flex items-center gap-1 min-w-0 overflow-x-auto nx9-scroll">
          {PIPELINE_STAGES.map((stage, index) => {
            const ready = readiness[stage.id];
            const isNext =
              !ready && PIPELINE_STAGES.slice(0, index).every((s) => readiness[s.id]);
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => handleStage(stage.id)}
                title={STAGE_HINT[stage.id]}
                className={`group flex items-center gap-1.5 shrink-0 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  ready
                    ? 'border-ok/30 bg-ok/8 text-ok'
                    : isNext
                      ? 'border-brand/35 bg-brand/8 text-brand font-medium'
                      : 'border-line/80 bg-white/60 text-ink/50 hover:border-brand/25 hover:text-ink/70'
                }`}
              >
                {ready ? (
                  <Check size={12} className="shrink-0" />
                ) : isNext ? (
                  <Loader2 size={12} className="shrink-0 text-brand" />
                ) : (
                  <Circle size={10} className="shrink-0 opacity-50" />
                )}
                <span>
                  {index + 1}. {stage.label}
                </span>
              </button>
            );
          })}
        </div>

        <p className="hidden lg:block text-[10px] text-ink/40 shrink-0 max-w-[200px] truncate">
          点击阶段打开对应面板 · 画布用于精调生成
        </p>
      </div>
    </div>
  );
}
