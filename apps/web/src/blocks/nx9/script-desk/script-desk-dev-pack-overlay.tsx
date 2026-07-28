import { useCallback, useMemo, useRef, useState } from 'react';
import {
  normalizeScriptDeskPrompts,
  DEFAULT_SCRIPT_DESK_SKILL_PROMPTS,
  type ScriptDeskSkillPromptPack,
  type ScreenplayPackage,
  type ScriptDeskAgentSession,
  type ScriptDeskSkillId,
} from '@nx9/shared';
import { useDevPromptOverrides } from '../../../stores/dev-prompt-overrides';

export function ScriptDeskDevPackOverlay({
  pkg: _pkg,
  session: _session,
  savePkg,
}: {
  pkg: ScreenplayPackage;
  session: ScriptDeskAgentSession;
  savePkg: (pkg: ScreenplayPackage, extra?: Record<string, unknown>) => void;
}) {
  const { values: _globalValues } = useDevPromptOverrides();
  const [pack, setPack] = useState<ScriptDeskSkillPromptPack>(() => normalizeScriptDeskPrompts({ version: 1, skills: {} }));
  const [tip, setTip] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  void _pkg; void _session; void savePkg;

  const full = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [id, val] of Object.entries(DEFAULT_SCRIPT_DESK_SKILL_PROMPTS)) {
      const override = pack.skills[id as ScriptDeskSkillId];
      out[id] = override ?? val ?? '';
    }
    return out;
  }, [pack.skills]);

  const updateSkill = useCallback((id: ScriptDeskSkillId, value: string) => {
    setPack((prev) => {
      const skills = { ...prev.skills, [id]: value.trim() || undefined };
      return { version: 1, skills };
    });
  }, []);

  const reset = useCallback(() => {
    setPack({ version: 1, skills: {} });
    setTip('已恢复默认');
  }, []);

  const save = useCallback(() => {
    setPack((current) => current);
    setTip('已保存到节点（保存后关闭重开生效）');
  }, []);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify({ kind: 'nx9-script-desk-prompt-pack', version: 1, skills: pack.skills }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'script-desk-prompt-pack.json'; a.click();
    URL.revokeObjectURL(url);
  }, [pack.skills]);

  const importJson = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed.kind !== 'nx9-script-desk-prompt-pack' || parsed.version !== 1) {
        setTip('非法 Pack 格式，拒绝导入');
        return;
      }
      const skills: Partial<Record<ScriptDeskSkillId, string>> = {};
      if (parsed.skills && typeof parsed.skills === 'object') {
        for (const [k, v] of Object.entries(parsed.skills)) {
          if (typeof v === 'string' && v.trim()) skills[k as ScriptDeskSkillId] = v.trim();
        }
      }
      setPack({ version: 1, skills });
      setTip('导入成功');
    } catch {
      setTip('导入失败：JSON 解析错误');
    }
  }, []);

  return (
    <div className="sd-legacy-note" style={{ borderColor: 'var(--desk-warn)', marginTop: 8 }}>
      <div className="sd-section-label" style={{ color: 'var(--desk-warn)', margin: '4px 0' }}>
        Dev · 技能 Prompt Pack
      </div>
      <div className="flex flex-col gap-1" style={{ maxHeight: 260, overflow: 'auto' }}>
        {Object.entries(full).map(([id, val]) => (
          <div key={id} className="flex flex-col gap-1">
            <label className="text-[9px] font-bold opacity-60">{id}</label>
            <textarea
              className="w-full border border-line rounded text-[9px] p-1 bg-surface resize-none font-mono"
              rows={2}
              value={val}
              onChange={(e) => updateSkill(id as ScriptDeskSkillId, e.target.value)}
            />
            <div className="flex justify-between text-[8px] text-ink/40">
              <span>
                {pack.skills[id as ScriptDeskSkillId]
                  ? '来源：节点 Pack'
                  : `全局${_globalValues[`scriptDesk.skill.${id}`] ? ' Override' : ' DEFAULT'}`}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        <button type="button" className="sd-btn" onClick={reset}>恢复默认</button>
        <button type="button" className="sd-btn" onClick={exportJson}>导出</button>
        <button type="button" className="sd-btn" onClick={() => fileRef.current?.click()}>导入</button>
        <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importJson(f);
          e.target.value = '';
        }} />
      </div>
      {tip ? <p className="text-[9px] mt-1" style={{ color: 'var(--desk-ok)' }}>{tip}</p> : null}
    </div>
  );
}
