import { useCallback, useMemo, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  createScriptBreakdownPromptPack,
  parseScriptBreakdownPromptPack,
  DEFAULT_SCRIPT_BREAKDOWN_PROMPTS,
  normalizeScriptBreakdownPrompts,
  type ScriptBreakdownPromptPack,
  type ScriptBreakdownPromptTemplates,
} from '@nx9/shared';
import { useDevPromptOverrides } from '../../../stores/dev-prompt-overrides';

/** 开发态 Prompt Pack：编辑即写入节点 `scriptBreakdownPrompts`。 */
export function StoryboardDeskDevPack({ blockId }: { blockId: string }) {
  const { values: gv } = useDevPromptOverrides();
  const { getNodes, updateNodeData } = useReactFlow();
  const [prompts, setPrompts] = useState<ScriptBreakdownPromptTemplates>(() => {
    const data = getNodes().find((n) => n.id === blockId)?.data as Record<string, unknown> | undefined;
    return normalizeScriptBreakdownPrompts(
      data?.scriptBreakdownPrompts as Partial<ScriptBreakdownPromptTemplates> | undefined,
    );
  });
  const persist = useCallback((next: ScriptBreakdownPromptTemplates) => {
    setPrompts(next);
    updateNodeData(blockId, { scriptBreakdownPrompts: next });
  }, [blockId, updateNodeData]);
  const [tip, setTip] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const fullTemplates = useMemo(() => {
    const dft = DEFAULT_SCRIPT_BREAKDOWN_PROMPTS;
    return {
      episodePlannerSystem: prompts.episodePlannerSystem || dft.episodePlannerSystem,
      episodeBreakdownSystem: prompts.episodeBreakdownSystem || dft.episodeBreakdownSystem,
    };
  }, [prompts]);

  const nodeOverride = useMemo(() => {
    const result: Partial<Record<string, boolean>> = {};
    for (const key of ['episodePlannerSystem', 'episodeBreakdownSystem'] as const) {
      result[key] = Boolean(prompts[key]?.trim());
    }
    return result;
  }, [prompts]);

  const globalOverrides = useMemo(() => {
    const result: Partial<Record<string, boolean>> = {};
    for (const key of ['storyboard.episodeBreakdownSystem', 'storyboard.episodePlannerSystem'] as const) {
      result[key] = Boolean(gv[key]?.trim());
    }
    return result;
  }, [gv]);

  const sourceLabel = useCallback((key: 'episodePlannerSystem' | 'episodeBreakdownSystem'): string => {
    const globalKey = key === 'episodePlannerSystem' ? 'storyboard.episodePlannerSystem' : 'storyboard.episodeBreakdownSystem';
    if (nodeOverride[key]) return '来源：节点 Pack';
    if (globalOverrides[globalKey]) return '来源：全局 Override';
    return '来源：DEFAULT';
  }, [nodeOverride, globalOverrides]);

  const patch = useCallback((key: 'episodePlannerSystem' | 'episodeBreakdownSystem', value: string) => {
    persist({ ...prompts, [key]: value.trim() });
  }, [persist, prompts]);

  const reset = useCallback(() => {
    persist(normalizeScriptBreakdownPrompts(undefined));
    setTip('已恢复默认并落盘');
  }, [persist]);

  const importPack = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ScriptBreakdownPromptPack;
      const result = parseScriptBreakdownPromptPack(parsed);
      if (result && result.prompts) {
        persist(normalizeScriptBreakdownPrompts(result.prompts));
        setTip('导入成功并落盘');
      } else {
        setTip('非法 Pack 格式，拒绝导入');
      }
    } catch {
      setTip('JSON 解析失败');
    }
  }, [persist]);

  return (
    <details className="sg-warn" style={{ marginTop: 8, padding: 8, borderRadius: 10, border: '1px dashed var(--desk-warn)' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 11, color: 'var(--desk-warn)' }}>
        ⚠ 开发 · 分镜台 Prompt Pack（仅开发）
      </summary>
      <div className="flex flex-col gap-2 mt-2 max-h-60 overflow-auto">
        {(['episodePlannerSystem', 'episodeBreakdownSystem'] as const).map((key) => (
          <div key={key}>
            <label className="text-[10px] font-bold opacity-60">{key}</label>
            <textarea
              className="w-full border border-line rounded text-[10px] p-1.5 mt-1 bg-surface resize-none font-mono"
              rows={4}
              value={fullTemplates[key]}
              onChange={(e) => patch(key, e.target.value)}
            />
            <div className="flex justify-between text-[8px] text-ink/40">
              <span>{sourceLabel(key)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mt-2" style={{ maxHeight: 60, overflow: 'visible' }}>
        <button type="button" className="sg-btn" onClick={reset}>恢复默认</button>
        <button
          type="button"
          className="sg-btn"
          onClick={() => {
            const pack = createScriptBreakdownPromptPack(undefined, prompts);
            const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'storyboard-prompt-pack.json';
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          导出
        </button>
        <button type="button" className="sg-btn" onClick={() => fileRef.current?.click()}>导入</button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importPack(f);
            e.target.value = '';
          }}
        />
      </div>
      {tip ? <p className="text-[10px] mt-1" style={{ color: 'var(--desk-ok)' }}>{tip}</p> : null}
    </details>
  );
}
