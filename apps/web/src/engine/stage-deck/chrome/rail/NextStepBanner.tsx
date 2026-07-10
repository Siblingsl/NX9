import { useCallback, useMemo } from 'react';
import { AlertTriangle, ArrowRight, Cable, CheckCircle2, LogOut, RefreshCw, SkipForward } from 'lucide-react';
import { PLAYBOOK_DEFINITIONS, resolveNextStep, exportPlaybookSessionJson, type PlaybookReadinessContext } from '@nx9/shared';
import { useWorkspaceDocument } from '../../../../stores/workspace-document';
import { useFlowRuntime } from '../../../../stores/flow-runtime';
import { executeStepAction } from '../../../playbook-runner';

export function NextStepBanner() {
  const session = useWorkspaceDocument((s) => s.playbookSession);
  const storyboard = useWorkspaceDocument((s) => s.storyboard);
  const voice = useWorkspaceDocument((s) => s.voice);
  const scriptPlan = useWorkspaceDocument((s) => s.scriptPlan);
  const environments = useWorkspaceDocument((s) => s.environments);
  const characters = useWorkspaceDocument((s) => s.characters);
  const advanceStore = useWorkspaceDocument((s) => s.advancePlaybookStep);
  const dismissStore = useWorkspaceDocument((s) => s.dismissPlaybook);
  const runtime = useFlowRuntime((s) => s.runtime);

  const handleExportJson = useCallback(() => {
    if (!session) return;
    const blob = exportPlaybookSessionJson(session, scriptPlan ?? undefined);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `playbook-${session.playbookId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [session, scriptPlan]);

  const playbook = useMemo(() => {
    if (!session || session.dismissed) return null;
    return PLAYBOOK_DEFINITIONS.find((p) => p.id === session.playbookId) ?? null;
  }, [session]);

  const ctx = useMemo((): PlaybookReadinessContext | null => {
    if (!session || session.dismissed || !playbook) return null;
    return {
      storyboard: {
        title: storyboard.title,
        shots: storyboard.shots.map((s) => ({
          id: s.id,
          status: s.status as string,
          firstFrameAssetId: s.firstFrameAssetId ?? undefined,
          keyframeStatus: s.keyframeStatus,
          videoStatus: s.videoStatus,
          linkedBlockId: s.linkedBlockId ?? undefined,
        })),
      },
      voice,
      nodes: (runtime?.getNodes() ?? []).map((n) => ({
        id: n.id,
        type: n.type ?? '',
        data: n.data as Record<string, unknown>,
      })),
      scriptPlan: scriptPlan ?? undefined,
      environments: environments?.environments ?? undefined,
      characters: characters.characters.map((c) => ({
        name: c.name,
        appearance: c.bible?.appearance,
        consistencyPrompt: c.consistencyPrompt,
        referenceImageUrl: c.referenceImageUrl ?? undefined,
      })),
      playbookSession: session,
    };
  }, [session, playbook, storyboard, voice, runtime, scriptPlan, environments, characters]);

  const resolved = useMemo(() => {
    if (!playbook || !session || !ctx) return null;
    return resolveNextStep(playbook, session, ctx);
  }, [playbook, session, ctx]);

  const continuityIssues = useMemo(() => {
    if (!resolved || resolved.allDone || resolved.step.id !== 'consistency') return null;
    const node = runtime?.getNodes().find((n) => n.type === 'continuity-check');
    if (!node) return null;
    const issues = (node.data as any)?.issues as string[] | undefined;
    if (!issues || issues.length === 0) return null;
    return issues;
  }, [resolved, runtime]);

  if (!session || session.dismissed) return null;
  if (!playbook || playbook.steps.length === 0) return null;
  if (!resolved) return null;

  const totalSteps = playbook.steps.length;

  if (resolved.allDone) {
    const completedLabels = playbook.steps
      .filter((s) => session.completedStepIds.includes(s.id))
      .map((s) => s.label);
    return (
      <div className="sticky top-0 z-10 shrink-0 border-b border-line/80 bg-gradient-to-r from-green-50 to-emerald-50 px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-ok/15 flex items-center justify-center">
            <CheckCircle2 size={20} className="text-ok" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink">生产完成 🎉</h3>
            <p className="text-[11px] text-ink/50">恭喜！{playbook.label} 所有 13 步已走完</p>
          </div>
        </div>
        <div className="mt-3 rounded-lg bg-white/60 border border-ok/20 p-2.5">
          <p className="text-[10px] text-ink/50 mb-1.5">已完成步骤</p>
          <div className="flex flex-wrap gap-1">
            {playbook.steps.map((s, i) => {
              const done = session.completedStepIds.includes(s.id);
              return (
                <span key={s.id} className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  done ? 'bg-ok/10 text-ok border border-ok/20' : 'bg-surface text-ink/30 border border-line'
                }`}>
                  {i + 1}
                </span>
              );
            })}
          </div>
        </div>
        {completedLabels.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {completedLabels.map((label) => (
              <li key={label} className="text-xs text-ink/60 flex items-center gap-1">
                <CheckCircle2 size={12} className="text-ok shrink-0" />
                {label}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={dismissStore}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand/90 transition-colors shadow-sm"
          >
            新建 Playbook
            <ArrowRight size={14} />
          </button>
          <button
            type="button"
            onClick={handleExportJson}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink/70 hover:text-ink hover:border-brand/30 transition-colors"
          >
            <Cable size={14} />
            导出项目 JSON
          </button>
        </div>
      </div>
    );
  }

  const step = resolved.step;
  const stepNumber = resolved.index + 1;

  const handleCTA = () => {
    if (!ctx) return;
    executeStepAction(step.primaryAction, ctx);
    advanceStore(ctx);
  };

  return (
    <div className="sticky top-0 z-10 shrink-0 border-b border-line/80 bg-gradient-to-r from-brand/5 to-accent/5 px-4 py-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium text-ink/45 uppercase tracking-wider">
          步骤 {stepNumber}/{totalSteps}
        </span>
        <button
          type="button"
          onClick={dismissStore}
          className="flex items-center gap-1 text-[11px] text-ink/40 hover:text-ink/70 transition-colors"
          title="退出向导（保留进度）"
        >
          <LogOut size={12} />
          退出向导
        </button>
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-ink truncate">{step.label}</h3>
          <p className="text-xs text-ink/55 mt-0.5 line-clamp-2">{step.description}</p>
          {step.id === 'script' && scriptPlan?.sourceText && (
            <p className="text-[10px] text-ok/70 mt-1">已保存 {scriptPlan.sourceText.length} 字</p>
          )}
          {continuityIssues && (
            <div className="mt-2 space-y-1">
              <p className="text-[10px] font-medium text-warn flex items-center gap-1">
                <AlertTriangle size={10} /> 发现 {continuityIssues.length} 个连贯性问题
              </p>
              {continuityIssues.slice(0, 5).map((issue, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-[10px] text-ink/60 flex-1 truncate">{issue}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const node = runtime?.getNodes().find((n) => n.type === 'continuity-check');
                      if (node && runtime?.focusBlock) runtime.focusBlock(node.id);
                    }}
                    className="text-[10px] text-brand/70 hover:text-brand shrink-0"
                  >
                    跳转
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const dd = runtime?.getNodes().find((n) => n.type === 'director-desk');
                      if (dd && runtime?.runCascade) runtime.runCascade(dd.id);
                    }}
                    className="text-[10px] flex items-center gap-0.5 text-accent/70 hover:text-accent shrink-0"
                  >
                    <RefreshCw size={8} /> 重生成
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          {step.optional && (
            <button
              type="button"
              onClick={() => ctx && advanceStore(ctx)}
              className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink/50 hover:text-ink/80 hover:border-brand/30 transition-colors"
              title="跳过此步"
            >
              <SkipForward size={12} />
              跳过
            </button>
          )}
          <button
            type="button"
            onClick={handleCTA}
            className="flex items-center gap-1.5 rounded-lg bg-brand/10 border border-brand/20 px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand/20 transition-colors"
          >
            {resolved.allDone ? '完成' : '查看详情'}
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
