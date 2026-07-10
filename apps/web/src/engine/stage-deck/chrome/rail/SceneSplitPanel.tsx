import { useCallback, useMemo, useState } from 'react';
import { Sparkles, Check, Split, Upload } from 'lucide-react';
import type { SceneSplitRecord } from '@nx9/shared';
import { api } from '../../../../api/client';
import { useWorkspaceDocument } from '../../../../stores/workspace-document';
import { useActivityLog } from '../../../../stores/activity-log';
import { useToast } from '../../../../stores/toast';

function handleAgentError(e: unknown, label: string): string {
  const raw = String(e);
  if (raw.includes('JSON') || e instanceof SyntaxError) {
    useToast.getState().push({ message: 'AI 返回格式异常，请重试', variant: 'error' });
    return `${label}失败：AI 返回格式异常，请重试`;
  }
  return `${label}失败: ${raw}`;
}

async function sceneSplitApi(sourceText: string, mode: 'llm' | 'rule') {
  const res = await fetch('/api/agent/scene-split', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceText, mode }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean; scenes: SceneSplitRecord[] }>;
}

export function SceneSplitPanel() {
  const scriptPlan = useWorkspaceDocument((s) => s.scriptPlan);
  const setScriptPlan = useWorkspaceDocument((s) => s.setScriptPlan);
  const appendLog = useActivityLog((s) => s.append);

  const [sourceText, setSourceText] = useState(scriptPlan?.sourceText ?? '');
  const [scenes, setScenes] = useState<SceneSplitRecord[]>([]);
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const [filterEpisode, setFilterEpisode] = useState(0);

  const episodes = useMemo(() => {
    const unique = new Set(scenes.map((s) => s.episode));
    return [...unique].sort((a, b) => a - b);
  }, [scenes]);

  const filteredScenes = useMemo(() => {
    if (!filterEpisode) return scenes;
    return scenes.filter((s) => s.episode === filterEpisode);
  }, [scenes, filterEpisode]);

  const handleImportFountain = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.fountain,.fdx,.txt';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      if (file.name.endsWith('.fdx')) {
        const { parseFinalDraft } = await import('@nx9/shared');
        setSourceText(parseFinalDraft(text));
      } else {
        const { parseFountain } = await import('@nx9/shared');
        setSourceText(parseFountain(text));
      }
      appendLog(`已导入 ${file.name}`);
    };
    input.click();
  }, [appendLog]);

  const handleSplit = useCallback(async (mode: 'llm' | 'rule') => {
    if (!sourceText.trim()) { appendLog('请先输入小说/剧本文本'); return; }
    setGenerating(true);
    try {
      const data = await sceneSplitApi(sourceText.trim(), mode);
      setScenes(data.scenes);
      setDone(false);
      appendLog(`场次拆分完成 · ${data.scenes.length} 场（${mode === 'llm' ? 'AI' : '规则'}模式）`);
    } catch (e) { appendLog(handleAgentError(e, '场次拆分')); }
    finally { setGenerating(false); }
  }, [sourceText, appendLog]);

  const handleConfirm = useCallback(async () => {
    if (scenes.length === 0) return;
    setGenerating(true);
    try {
      const sceneContext = scenes
        .map((s) => `[场 ${s.sceneCode}] ${s.location} · ${s.interior}/${s.timeOfDay} · ${s.characters.join('、')}\n${s.summary}`)
        .join('\n\n');

      const res = await api.storyboardTable({ sourceText: sceneContext });
      const tableWithSceneGroup = res.table.map((row, i) => ({
        ...row,
        group: scenes[Math.min(i, scenes.length - 1)]?.sceneCode ?? row.group,
      }));

      setScriptPlan({
        ...(scriptPlan ?? { version: 2, storyboardTable: [] }),
        scenes,
        sourceText: sourceText.trim(),
        activeEpisode: filterEpisode > 0 ? String(filterEpisode) : null,
      });

      const matRes = await api.materializeShots({ table: tableWithSceneGroup });

      const session = useWorkspaceDocument.getState().playbookSession;
      if (session) {
        useWorkspaceDocument.getState().advancePlaybookStep();
        appendLog('Playbook 步骤已推进');
      }

      setDone(true);
      appendLog(`分镜表已生成并写入 · ${res.table.length} 行`);
    } catch (e) { appendLog(handleAgentError(e, '确认并生成分镜表')); }
    finally { setGenerating(false); }
  }, [scenes, sourceText, filterEpisode, scriptPlan, setScriptPlan, appendLog]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Split size={16} className="text-brand" />
        <span className="font-medium text-sm">② 场次拆分</span>
      </div>

      {!done && (
        <div className="space-y-2">
          <p className="text-[11px] text-ink/50">粘贴小说章节或剧本文本，按场次拆分</p>
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="粘贴小说/剧本文本…"
            className="w-full h-32 rounded-lg border border-line px-2 py-1.5 text-xs resize-y font-mono"
          />
          <button type="button" onClick={handleImportFountain} className="flex items-center gap-1 text-[10px] text-brand/60 hover:text-brand">
            <Upload size={12} />
            导入 Fountain 剧本
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={generating || !sourceText.trim()}
              onClick={() => void handleSplit('llm')}
              className="flex-1 min-w-[100px] flex items-center justify-center gap-1 rounded-xl bg-brand text-white text-sm py-2 disabled:opacity-50"
            >
              <Sparkles size={14} />
              {generating ? '拆分中…' : 'AI 拆分'}
            </button>
            <button
              type="button"
              disabled={generating || !sourceText.trim()}
              onClick={() => void handleSplit('rule')}
              className="flex-1 min-w-[120px] flex items-center justify-center gap-1 rounded-xl border border-accent text-accent text-sm py-2 disabled:opacity-50"
            >
              <Split size={14} />
              规则拆分（中文剧本）
            </button>
          </div>
        </div>
      )}

      {scenes.length > 0 && !done && (
        <div className="space-y-2">
          {episodes.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-ink/40">按集过滤：</label>
              <select
                value={filterEpisode}
                onChange={(e) => setFilterEpisode(Number(e.target.value) || 0)}
                className="rounded-lg border border-line px-2 py-1 text-xs"
              >
                <option value={0}>全部</option>
                {episodes.map((ep) => <option key={ep} value={ep}>第 {ep} 集</option>)}
              </select>
            </div>
          )}
          <p className="text-[11px] text-ink/50">拆分结果 · {scenes.length} 场</p>
          <div className="max-h-60 overflow-y-auto rounded-lg border border-line">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-surface text-ink/60 border-b border-line">
                  <th className="px-2 py-1.5 text-left font-medium">场号</th>
                  <th className="px-2 py-1.5 text-left font-medium">地点</th>
                  <th className="px-2 py-1.5 text-center font-medium">内/外</th>
                  <th className="px-2 py-1.5 text-center font-medium">日/夜</th>
                  <th className="px-2 py-1.5 text-left font-medium">人物</th>
                  <th className="px-2 py-1.5 text-left font-medium">摘要</th>
                </tr>
              </thead>
              <tbody>
                {filteredScenes.map((s) => (
                  <tr key={s.id} className="border-b border-line/40 last:border-b-0 hover:bg-surface/50">
                    <td className="px-2 py-1.5 font-mono text-brand">{s.sceneCode}</td>
                    <td className="px-2 py-1.5 text-ink">{s.location}</td>
                    <td className="px-2 py-1.5 text-center text-ink/70">{s.interior}</td>
                    <td className="px-2 py-1.5 text-center text-ink/70">{s.timeOfDay}</td>
                    <td className="px-2 py-1.5 text-ink/70">{s.characters.join('、')}</td>
                    <td className="px-2 py-1.5 text-ink/50 truncate max-w-[120px]">{s.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            disabled={generating}
            onClick={() => void handleConfirm()}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-brand text-white text-sm py-2 disabled:opacity-50"
          >
            <Check size={14} />
            {generating ? '生成中…' : '确认并生成分镜表'}
          </button>
        </div>
      )}

      {done && (
        <div className="rounded-xl bg-ok/10 border border-ok/20 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Check size={16} className="text-ok" />
            <p className="text-xs text-ink font-medium">场次拆分 · 分镜表已生成</p>
          </div>
          <p className="text-[11px] text-ink/60">
            已拆分 {scenes.length} 场，分镜表已写入故事板，步骤已推进
          </p>
        </div>
      )}
    </div>
  );
}
