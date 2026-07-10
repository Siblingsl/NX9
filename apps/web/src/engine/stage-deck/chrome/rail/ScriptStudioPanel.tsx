import { useCallback, useMemo, useState } from 'react';
import { Sparkles, FileText, Table2, Play, ExternalLink, UserPlus, Plus } from 'lucide-react';
import type { StoryboardTableRow, StoryboardShot, CharacterProfile, PlaybookId, PlaybookReadinessContext } from '@nx9/shared';
import { PLAYBOOK_DEFINITIONS } from '@nx9/shared';
import { executeStepAction } from '../../../playbook-runner';
import { api } from '../../../../api/client';
import { useWorkspaceDocument } from '../../../../stores/workspace-document';
import { useActivityLog } from '../../../../stores/activity-log';
import { useFlowRuntime, useStoryboardUi } from '../../../../stores/flow-runtime';
import { useContextRailUi } from '../../stores/context-rail-ui';
import { useCanvasAgentStore } from '../../stores/canvas-agent-store';
import { useToast } from '../../../../stores/toast';
import { SceneSplitPanel } from './SceneSplitPanel';
import { CharacterBibleStepPanel } from './CharacterBibleStepPanel';
import { EnvironmentBiblePanel } from './EnvironmentBiblePanel';

function handleAgentError(e: unknown, label: string): string {
  const raw = String(e);
  if (raw.includes('JSON') || e instanceof SyntaxError) {
    useToast.getState().push({ message: 'AI 返回格式异常，请重试', variant: 'error' });
    return `${label}失败：AI 返回格式异常，请重试`;
  }
  return `${label}失败: ${raw}`;
}

const STEPS = ['骨架', '改编策略', '剧本', '导演计划', '分镜表'] as const;
type StudioPhase = 'input' | 'skeleton' | 'adaptation' | 'screenplay' | 'director-plan' | 'table' | 'done';

export function ScriptStudioPanel() {
  const [sourceText, setSourceText] = useState('');
  const [phase, setPhase] = useState<StudioPhase>('input');
  const [currentStep, setCurrentStep] = useState(-1);
  const [table, setTable] = useState<StoryboardTableRow[]>([]);
  const [skeletonMd, setSkeletonMd] = useState('');
  const [adaptationMd, setAdaptationMd] = useState('');
  const [screenplayMd, setScreenplayMd] = useState('');
  const [directorPlanMd, setDirectorPlanMd] = useState('');
  const [generating, setGenerating] = useState(false);
  const [shots, setShots] = useState<StoryboardShot[]>([]);
  const [extractedCharacters, setExtractedCharacters] = useState<CharacterProfile[]>([]);
  const [extractedScenes, setExtractedScenes] = useState<{ id: string; name: string; description: string }[]>([]);
  const addShots = useWorkspaceDocument((s) => s.addShots);
  const setScriptPlan = useWorkspaceDocument((s) => s.setScriptPlan);
  const upsertCharacter = useWorkspaceDocument((s) => s.upsertCharacter);
  const appendLog = useActivityLog((s) => s.append);
  const spawnBlockForShot = useFlowRuntime((s) => s.runtime?.spawnBlockForShot);
  const setStoryboardOpen = useStoryboardUi((s) => s.setOpen);
  const requestTab = useContextRailUi((s) => s.requestTab);
  const setBanner = useContextRailUi((s) => s.setBanner);
  const playbookSession = useWorkspaceDocument((s) => s.playbookSession);

  const currentPlaybookStep = useMemo(() => {
    if (!playbookSession) return null;
    const def = PLAYBOOK_DEFINITIONS.find((p) => p.id === playbookSession.playbookId);
    if (!def) return null;
    return def.steps.find((s) => s.id === playbookSession.currentStepId) ?? null;
  }, [playbookSession]);

  const handleSkeleton = useCallback(async () => {
    if (!sourceText.trim()) { appendLog('请输入小说/剧本文本'); return; }
    setGenerating(true);
    try {
      const res = await api.scriptSkeleton({ sourceText: sourceText.trim() });
      setSkeletonMd(JSON.stringify(res.skeleton, null, 2));
      setPhase('skeleton');
      setCurrentStep(0);
      appendLog('故事骨架生成完成');
    } catch (e) { appendLog(handleAgentError(e, '骨架生成')); }
    finally { setGenerating(false); }
  }, [sourceText, appendLog]);

  const handleAdaptation = useCallback(async () => {
    if (!sourceText.trim()) { appendLog('请输入小说/剧本文本'); return; }
    setGenerating(true);
    try {
      const res = await api.scriptAdaptation({ sourceText: sourceText.trim() });
      setAdaptationMd(res.adaptation);
      setPhase('adaptation');
      setCurrentStep(1);
      appendLog('改编策略生成完成');
    } catch (e) { appendLog(handleAgentError(e, '改编策略生成')); }
    finally { setGenerating(false); }
  }, [sourceText, appendLog]);

  const handleScreenplay = useCallback(async () => {
    if (!sourceText.trim()) { appendLog('请输入小说/剧本文本'); return; }
    setGenerating(true);
    try {
      const res = await api.scriptScreenplay({ sourceText: sourceText.trim() });
      setScreenplayMd(res.screenplay);
      setPhase('screenplay');
      setCurrentStep(2);
      appendLog('剧本生成完成');
    } catch (e) { appendLog(handleAgentError(e, '剧本生成')); }
    finally { setGenerating(false); }
  }, [sourceText, appendLog]);

  const handleDirectorPlan = useCallback(async () => {
    if (!sourceText.trim()) { appendLog('请输入小说/剧本文本'); return; }
    setGenerating(true);
    try {
      const res = await api.directorPlan({ sourceText: sourceText.trim() });
      setDirectorPlanMd(res.plan);
      setPhase('director-plan');
      setCurrentStep(3);
      appendLog('导演计划生成完成');
    } catch (e) { appendLog(handleAgentError(e, '导演计划生成')); }
    finally { setGenerating(false); }
  }, [sourceText, appendLog]);

  const handleGenerateTable = useCallback(async () => {
    if (!sourceText.trim()) { appendLog('请输入小说/剧本文本'); return; }
    setGenerating(true);
    try {
      const res = await api.storyboardTable({ sourceText: sourceText.trim() });
      setTable(res.table);
      setPhase('table');
      setCurrentStep(4);
      appendLog(`分镜表生成完成 · ${res.table.length} 行`);
    } catch (e) { appendLog(handleAgentError(e, '分镜表生成')); }
    finally { setGenerating(false); }
  }, [sourceText, appendLog]);

  const handleMaterialize = useCallback(async () => {
    if (table.length === 0) return;
    setGenerating(true);
    try {
      const res = await api.materializeShots({ table });
      setShots(res.shots);
      addShots(res.shots, 'append');
      setPhase('done');
      const reviewShots = res.shots.filter((s: { status?: string }) => s.status === 'review');
      if (reviewShots.length > 0) {
        setBanner({ kind: 'review', shotIds: reviewShots.map((s: { id: string }) => s.id) });
      }
      appendLog(`已写入故事板 · ${res.shots.length} 镜`);
      const session = useWorkspaceDocument.getState().playbookSession;
      if (session) {
        useWorkspaceDocument.getState().advancePlaybookStep();
        appendLog('Playbook 步骤已推进');
      }
    } catch (e) { appendLog(handleAgentError(e, '写入故事板')); }
    finally { setGenerating(false); }
  }, [table, addShots, appendLog, setBanner]);

  const handleSaveAndContinue = useCallback(() => {
    if (!sourceText.trim()) { appendLog('请输入小说/剧本文本'); return; }
    const plan = { version: 2 as const, sourceText: sourceText.trim(), storyboardTable: [] };
    setScriptPlan(plan);
    appendLog(`已保存剧本（${sourceText.trim().length} 字）`);
    const session = useWorkspaceDocument.getState().playbookSession;
    if (session) {
      useWorkspaceDocument.getState().advancePlaybookStep();
      appendLog('Playbook 步骤已推进');
    }
  }, [sourceText, appendLog]);

  const handleExtractAssets = useCallback(async () => {
    if (!sourceText.trim()) { appendLog('请输入小说/剧本文本'); return; }
    setGenerating(true);
    try {
      const res = await api.extractAssets({ sourceText: sourceText.trim() });
      setExtractedCharacters(res.characters.map((c: any) => ({ ...c, bible: c.bible ?? {} })));
      setExtractedScenes(res.scenes);
      appendLog(`提取到 ${res.characters.length} 角色、${res.scenes.length} 场景`);
    } catch (e) { appendLog(handleAgentError(e, '提取')); }
    finally { setGenerating(false); }
  }, [sourceText, appendLog]);

  const handleWriteToBacklot = useCallback(async () => {
    let count = 0;
    for (const char of extractedCharacters) {
      upsertCharacter(char);
      count++;
    }
    appendLog(`已写入 ${count} 角色到 Backlot`);
  }, [extractedCharacters, upsertCharacter, appendLog]);

  const handleOneClickShoot = useCallback(() => {
    if (shots.length === 0 || !spawnBlockForShot) return;
    spawnBlockForShot(shots[0].id, 'director-desk');
    appendLog('一键开拍 — 导演台已添加');
  }, [shots, spawnBlockForShot, appendLog]);

  const handleOpenStoryboard = useCallback(() => {
    setStoryboardOpen(true);
    requestTab('storyboard');
  }, [setStoryboardOpen, requestTab]);

  const stepIndex = (p: StudioPhase): number => {
    const map: Record<StudioPhase, number> = { input: -1, skeleton: 0, adaptation: 1, screenplay: 2, 'director-plan': 3, table: 4, done: 4 };
    return map[p];
  };

  if (currentPlaybookStep?.id === 'scene-split') {
    return <SceneSplitPanel />;
  }
  if (currentPlaybookStep?.id === 'character-bible') {
    return <CharacterBibleStepPanel />;
  }
  if (currentPlaybookStep?.id === 'environment-bible') {
    return <EnvironmentBiblePanel />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-brand" />
        <span className="font-medium text-sm">编剧台</span>
      </div>

      {/* 5-step step bar */}
      <div className="space-y-0.5">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium shrink-0 ${
              i === stepIndex(phase) ? 'bg-brand/10 text-brand ring-2 ring-brand/20' :
              i < stepIndex(phase) || (i === 4 && phase === 'done') ? 'bg-ok/15 text-ok' : 'bg-surface text-ink/30'
            }`}>
              {i < stepIndex(phase) || (i === 4 && phase === 'done') ? '✓' : i + 1}
            </div>
            <span className={`text-xs ${
              i === stepIndex(phase) ? 'font-medium text-ink' :
              i < stepIndex(phase) ? 'text-ok/70' : 'text-ink/30'
            }`}>
              {label}
            </span>
            {phase === 'done' && i === 4 && (
              <span className="text-ok/70 text-[10px]">✓ 完成</span>
            )}
          </div>
        ))}
      </div>

      {phase === 'input' && (
        <div className="space-y-2">
          <p className="text-[11px] text-ink/50">粘贴小说章节或故事文本，生成故事骨架或分镜表</p>
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="粘贴小说/剧本文本…"
            className="w-full h-32 rounded-lg border border-line px-2 py-1.5 text-xs resize-y font-mono"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={generating || !sourceText.trim()}
              onClick={() => void handleSkeleton()}
              className="flex-1 min-w-[80px] rounded-xl bg-brand text-white text-sm py-2 disabled:opacity-50"
            >
              {generating ? '生成中…' : '① 生成骨架'}
            </button>
            <button
              type="button"
              disabled={generating || !sourceText.trim()}
              onClick={() => void handleAdaptation()}
              className="flex-1 min-w-[80px] rounded-xl border border-accent text-accent text-sm py-2 disabled:opacity-50"
            >
              ② 改编策略
            </button>
            <button
              type="button"
              disabled={generating || !sourceText.trim()}
              onClick={() => void handleScreenplay()}
              className="flex-1 min-w-[80px] rounded-xl border border-accent text-accent text-sm py-2 disabled:opacity-50"
            >
              ③ 剧本
            </button>
            <button
              type="button"
              disabled={generating || !sourceText.trim()}
              onClick={() => void handleDirectorPlan()}
              className="flex-1 min-w-[80px] rounded-xl border border-accent text-accent text-sm py-2 disabled:opacity-50"
            >
              ④ 导演计划
            </button>
            <button
              type="button"
              disabled={generating || !sourceText.trim()}
              onClick={() => void handleGenerateTable()}
              className="flex-1 flex items-center justify-center gap-1 rounded-xl border border-accent text-accent text-sm py-2 disabled:opacity-50"
            >
              <Table2 size={14} />
              ⑤ 分镜表
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={generating || !sourceText.trim()}
              onClick={() => void handleExtractAssets()}
              className="flex-1 flex items-center justify-center gap-1 rounded-xl border border-line text-ink text-sm py-1.5 disabled:opacity-50"
            >
              <UserPlus size={14} />
              提取角色/场景
            </button>
            <button
              type="button"
              disabled={!sourceText.trim()}
              onClick={handleSaveAndContinue}
              className="flex-1 rounded-xl bg-ok text-white text-sm py-1.5 disabled:opacity-50"
            >
              保存并进入场次拆分
            </button>
          </div>
        </div>
      )}

      {phase === 'skeleton' && (
        <div className="space-y-2">
          <p className="text-[11px] text-ink/50">故事骨架预览</p>
          <pre className="bg-surface rounded-lg p-2 text-[10px] text-ink/70 whitespace-pre-wrap max-h-40 overflow-y-auto">{skeletonMd}</pre>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={generating}
              onClick={() => void handleAdaptation()}
              className="flex-1 rounded-xl bg-brand text-white text-sm py-2 disabled:opacity-50"
            >
              继续→改编策略
            </button>
            <button type="button" onClick={() => { setPhase('input'); setCurrentStep(-1); }} className="rounded-xl border border-line px-3 hover:border-brand/40 text-xs">
              返回
            </button>
          </div>
        </div>
      )}

      {phase === 'adaptation' && (
        <div className="space-y-2">
          <p className="text-[11px] text-ink/50">改编策略预览</p>
          <pre className="bg-surface rounded-lg p-2 text-[10px] text-ink/70 whitespace-pre-wrap max-h-40 overflow-y-auto">{adaptationMd}</pre>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={generating}
              onClick={() => void handleScreenplay()}
              className="flex-1 rounded-xl bg-brand text-white text-sm py-2 disabled:opacity-50"
            >
              继续→剧本
            </button>
            <button type="button" onClick={() => { setPhase('skeleton'); setCurrentStep(0); }} className="rounded-xl border border-line px-3 hover:border-brand/40 text-xs">
              返回
            </button>
          </div>
        </div>
      )}

      {phase === 'screenplay' && (
        <div className="space-y-2">
          <p className="text-[11px] text-ink/50">剧本预览</p>
          <pre className="bg-surface rounded-lg p-2 text-[10px] text-ink/70 whitespace-pre-wrap max-h-40 overflow-y-auto">{screenplayMd}</pre>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={generating}
              onClick={() => void handleDirectorPlan()}
              className="flex-1 rounded-xl bg-brand text-white text-sm py-2 disabled:opacity-50"
            >
              继续→导演计划
            </button>
            <button type="button" onClick={() => { setPhase('adaptation'); setCurrentStep(1); }} className="rounded-xl border border-line px-3 hover:border-brand/40 text-xs">
              返回
            </button>
          </div>
        </div>
      )}

      {phase === 'director-plan' && (
        <div className="space-y-2">
          <p className="text-[11px] text-ink/50">导演计划预览</p>
          <pre className="bg-surface rounded-lg p-2 text-[10px] text-ink/70 whitespace-pre-wrap max-h-40 overflow-y-auto">{directorPlanMd}</pre>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={generating}
              onClick={() => void handleGenerateTable()}
              className="flex-1 rounded-xl bg-brand text-white text-sm py-2 disabled:opacity-50"
            >
              继续→分镜表
            </button>
            <button type="button" onClick={() => { setPhase('screenplay'); setCurrentStep(2); }} className="rounded-xl border border-line px-3 hover:border-brand/40 text-xs">
              返回
            </button>
          </div>
        </div>
      )}

      {phase === 'table' && (
        <div className="space-y-2">
          <p className="text-[11px] text-ink/50">分镜表预览 · {table.length} 行</p>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {table.map((row) => (
              <div key={row.id} className="rounded border border-line p-1.5 text-[10px]">
                <span className="font-mono text-brand">{row.group}</span>
                <span className="ml-1">{row.shotSize} · {row.durationSec}s</span>
                <p className="text-ink/70 truncate">{row.descriptionZh}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button" disabled={generating}
              onClick={() => void handleMaterialize()}
              className="flex-1 flex items-center justify-center gap-1 rounded-xl bg-brand text-white text-sm py-2 disabled:opacity-50"
            >
              <FileText size={14} />
              {generating ? '写入中…' : '写入故事板'}
            </button>
            <button type="button" onClick={() => { setPhase('director-plan'); setCurrentStep(3); }} className="rounded-xl border border-line px-3 hover:border-brand/40 text-xs">
              返回
            </button>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-3">
          <div className="rounded-xl bg-ok/10 border border-ok/20 p-3 space-y-2">
            <p className="text-xs text-ok font-medium">✓ 已写入 {shots.length} 镜到故事板</p>
            <button
              type="button"
              onClick={handleOpenStoryboard}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-ok/30 text-ok h-9 text-xs hover:bg-ok/5"
            >
              <ExternalLink size={14} />
              打开故事板全屏
            </button>
            {spawnBlockForShot && (
              <button
                type="button"
                onClick={handleOneClickShoot}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-accent text-white h-9 text-sm hover:bg-accent/90"
              >
                <Play size={14} /> 一键开拍
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => { setPhase('input'); setSourceText(''); setTable([]); setShots([]); setSkeletonMd(''); setAdaptationMd(''); setScreenplayMd(''); setDirectorPlanMd(''); setExtractedCharacters([]); setExtractedScenes([]); setCurrentStep(-1); }}
            className="w-full rounded-xl border border-line py-2 text-xs hover:border-brand/40"
          >
            新建
          </button>
        </div>
      )}

      {/* Extracted assets preview */}
      {(extractedCharacters.length > 0 || extractedScenes.length > 0) && (
        <div className="rounded-xl bg-surface border border-line p-2 space-y-2">
          <p className="text-xs font-medium">提取资产</p>
          {extractedCharacters.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-ink/50">角色 ({extractedCharacters.length})</p>
              {extractedCharacters.slice(0, 5).map((c) => (
                <div key={c.id} className="text-[10px] text-ink/70 flex items-center gap-1">
                  <span className="text-brand font-mono">{c.name || c.id}</span>
                </div>
              ))}
            </div>
          )}
          {extractedScenes.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-ink/50">场景 ({extractedScenes.length})</p>
              {extractedScenes.slice(0, 3).map((s) => (
                <div key={s.id} className="text-[10px] text-ink/70">{s.name}</div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={handleWriteToBacklot}
            className="w-full flex items-center justify-center gap-1 rounded-xl bg-brand text-white py-1.5 text-xs"
          >
            <Plus size={12} />
            写入 Backlot 库
          </button>
        </div>
      )}

      {/* Agent 折叠 */}
      <details className="group">
        <summary className="text-xs font-medium text-ink/60 cursor-pointer hover:text-ink/80 flex items-center gap-1">
          Canvas 助手
        </summary>
        <div className="mt-2">
          <AgentFold />
        </div>
      </details>
    </div>
  );
}

function AgentFold() {
  const [prompt, setPrompt] = useState('');
  const pendingOps = useCanvasAgentStore((s) => s.pendingOps);
  const proposeOp = useCanvasAgentStore((s) => s.proposeOp);
  const confirmOp = useCanvasAgentStore((s) => s.confirmOp);
  const rejectOp = useCanvasAgentStore((s) => s.rejectOp);
  const runtime = useFlowRuntime((s) => s.runtime);
  const appendLog = useActivityLog((s) => s.append);
  const handleSubmit = () => {
    const text = prompt.trim();
    if (!text) return;
    const session = useWorkspaceDocument.getState().playbookSession;
    if (session) {
      const def = PLAYBOOK_DEFINITIONS.find((p) => p.id === session.playbookId);
      if (def) {
        const currentStep = def.steps.find((s) => s.id === session.currentStepId);
        if (currentStep) {
          const ctx: PlaybookReadinessContext = {
            storyboard: { shots: [] },
            voice: { lines: [] },
            nodes: runtime?.getNodes()?.map((n) => ({ id: n.id, type: n.type ?? '', data: n.data as Record<string, unknown> })) ?? [],
            playbookSession: session,
          };
          executeStepAction(currentStep.primaryAction, ctx);
          appendLog(`Agent 自动执行：${currentStep.label}`);
          setPrompt('');
          return;
        }
      }
    }
    // Fall back to existing behavior (update selected nodes)
    if (!runtime) return;
    const selected = runtime.getNodes().filter((n) => n.selected);
    if (selected.length === 0) {
      appendLog('Agent：请先选中模块');
      return;
    }
    proposeOp({
      summary: `调整 ${selected.length} 个模块`,
      detail: text,
      apply: () => {
        selected.forEach((n) => {
          runtime.updateNodeData(n.id, {
            content: `${(n.data?.content as string) ?? ''}\n${text}`.trim(),
          });
        });
        appendLog('Agent 变更已应用');
      },
    });
    setPrompt('');
  };

  return (
    <div className="space-y-2 text-xs">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="描述要对选中模块做的调整…"
        className="w-full min-h-[60px] rounded-lg border border-line px-2 py-1.5 text-xs resize-none"
      />
      <button
        type="button"
        onClick={handleSubmit}
        className="w-full rounded-xl bg-accent text-white py-1.5 text-xs hover:bg-accent/90"
      >
        生成待确认操作
      </button>
      {pendingOps.length > 0 && (
        <ul className="space-y-1.5">
          {pendingOps.map((op) => (
            <li key={op.id} className="rounded-lg border border-warn/30 bg-warn/5 p-2 space-y-1.5">
              <p className="font-medium text-ink text-xs">{op.summary}</p>
              {op.detail && <p className="text-[10px] text-ink/60 line-clamp-2">{op.detail}</p>}
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => confirmOp(op.id)}
                  className="flex-1 rounded bg-ok/15 text-ok py-1 text-[10px]"
                >
                  应用
                </button>
                <button
                  type="button"
                  onClick={() => rejectOp(op.id)}
                  className="flex-1 rounded border border-line py-1 text-[10px]"
                >
                  拒绝
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
