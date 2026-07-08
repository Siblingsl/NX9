import { useMemo } from 'react';
import {
  PIPELINE_STAGES,
  computeStageReadiness,
  resolvePipelineStageStates,
  type PipelineStageId,
} from '@nx9/shared';
import { useWorkspaceDocument } from '../../../stores/workspace-document';
import { useFlowRuntime, useStoryboardUi } from '../../../stores/flow-runtime';
import { useContextRailUi } from '../stores/context-rail-ui';

export function PipelineCapsule() {
  const storyboard = useWorkspaceDocument((s) => s.storyboard);
  const voice = useWorkspaceDocument((s) => s.voice);
  const runtime = useFlowRuntime((s) => s.runtime);
  const setStoryboardOpen = useStoryboardUi((s) => s.setOpen);
  const setStoryboardTab = useStoryboardUi((s) => s.setTab);
  const requestRailTab = useContextRailUi((s) => s.requestTab);

  const readiness = useMemo(
    () =>
      computeStageReadiness({
        storyboard,
        voice,
        nodes: runtime?.getNodes() ?? [],
      }),
    [storyboard, voice, runtime],
  );

  const states = useMemo(() => resolvePipelineStageStates(readiness), [readiness]);

  const onStageClick = (id: PipelineStageId) => {
    switch (id) {
      case 'script':
      case 'storyboard':
        setStoryboardOpen(true);
        setStoryboardTab('shots');
        requestRailTab('storyboard');
        break;
      case 'generate':
        requestRailTab('props');
        break;
      case 'voice':
        setStoryboardOpen(true);
        setStoryboardTab('voice');
        break;
      case 'export':
        setStoryboardOpen(true);
        setStoryboardTab('shots');
        requestRailTab('workflow');
        break;
      default:
        break;
    }
  };

  return (
    <div
      className="nx9-pipeline-capsule flex items-center gap-1.5 px-2 py-1 rounded-full border border-line bg-white/80"
      title="生产流水线进度"
    >
      {PIPELINE_STAGES.map((stage, i) => {
        const state = states[i];
        return (
          <button
            key={stage.id}
            type="button"
            onClick={() => onStageClick(stage.id)}
            className="group flex flex-col items-center gap-0.5 min-w-[2rem]"
            title={`${stage.label}${readiness[stage.id] ? ' · 已完成' : state === 'active' ? ' · 进行中' : ' · 未开始'}`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                state === 'done'
                  ? 'bg-ok'
                  : state === 'active'
                    ? 'bg-brand ring-2 ring-brand/30'
                    : 'bg-ink/15'
              }`}
            />
            <span className="text-[9px] text-ink/45 group-hover:text-ink/70 hidden sm:block">
              {stage.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
