import { useCallback, useState } from 'react';
import { Sparkles, UserPlus, RefreshCw } from 'lucide-react';
import type { CharacterProfile } from '@nx9/shared';
import { api } from '../../../../api/client';
import { useWorkspaceDocument } from '../../../../stores/workspace-document';
import { useActivityLog } from '../../../../stores/activity-log';
import { useToast } from '../../../../stores/toast';
import { useFlowCommands } from '../../../../stores/flow-commands';
import { useContextRailUi } from '../../stores/context-rail-ui';

function handleAgentError(e: unknown, label: string): string {
  const raw = String(e);
  if (raw.includes('JSON') || e instanceof SyntaxError) {
    useToast.getState().push({ message: 'AI 返回格式异常，请重试', variant: 'error' });
    return `${label}失败：AI 返回格式异常，请重试`;
  }
  return `${label}失败: ${raw}`;
}

export function CharacterBibleStepPanel() {
  const scriptPlan = useWorkspaceDocument((s) => s.scriptPlan);
  const characters = useWorkspaceDocument((s) => s.characters);
  const upsertCharacter = useWorkspaceDocument((s) => s.upsertCharacter);
  const advancePlaybookStep = useWorkspaceDocument((s) => s.advancePlaybookStep);
  const appendLog = useActivityLog((s) => s.append);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<CharacterProfile[]>([]);

  const handleExtract = useCallback(async () => {
    const text = scriptPlan?.sourceText;
    if (!text?.trim()) { appendLog('请先在 ① 剧本步输入文本'); return; }
    setExtracting(true);
    try {
      const res = await api.extractAssets({ sourceText: text.trim() });
      setExtracted(res.characters.map((c: any) => ({
        ...c,
        descriptionZh: c.descriptionZh ?? c.description ?? c.name,
        bible: c.bible ?? { identity: '', appearance: '', personality: '', background: '', voice: '', relationships: '' },
      })));
      appendLog(`提取到 ${res.characters.length} 角色`);
    } catch (e) { appendLog(handleAgentError(e, '角色提取')); }
    finally { setExtracting(false); }
  }, [scriptPlan, appendLog]);

  const handleSaveCharacter = useCallback((char: CharacterProfile) => {
    upsertCharacter(char);
    appendLog(`已保存角色「${char.name}」到 Backlot`);
  }, [upsertCharacter, appendLog]);

  const handleSaveAll = useCallback(() => {
    for (const char of extracted) {
      upsertCharacter(char);
    }
    appendLog(`已写入 ${extracted.length} 角色到 Backlot`);
    const session = useWorkspaceDocument.getState().playbookSession;
    if (session) {
      useWorkspaceDocument.getState().advancePlaybookStep();
      appendLog('Playbook 步骤已推进');
    }
  }, [extracted, upsertCharacter, appendLog]);

  const handleBibleChange = useCallback((charId: string, field: string, value: string) => {
    setExtracted((prev) => prev.map((c) =>
      c.id === charId
        ? { ...c, bible: { ...(c.bible ?? {}), [field]: value } }
        : c,
    ));
  }, []);

  function renderStatusBadges(char: CharacterProfile) {
    const bible = char.bible;
    const hasBible = !!(bible?.identity?.trim() || bible?.appearance?.trim());
    const hasRef = !!char.referenceImageUrl?.trim();
    if (!hasBible && !hasRef) {
      return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warn/10 text-warn border border-warn/20">未设定</span>;
    }
    return (
      <>
        {hasBible && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-ok/10 text-ok border border-ok/20">已保存</span>}
        {hasRef && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20">已有参考图</span>}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-brand" />
        <span className="font-medium text-sm">角色圣经 · 步 ④</span>
      </div>
      <p className="text-[11px] text-ink/50">从剧本提取角色，填写六层设定 + 参考图</p>

      <button
        type="button"
        disabled={extracting}
        onClick={() => void handleExtract()}
        className="flex items-center justify-center gap-1.5 w-full rounded-xl bg-brand text-white text-sm py-2 disabled:opacity-50"
      >
        <UserPlus size={14} />
        {extracting ? '提取中…' : '从剧本提取角色'}
      </button>

      {extracted.length === 0 && characters.characters.length === 0 && (
        <p className="text-xs text-ink/40 text-center py-4">尚未提取角色</p>
      )}

      {extracted.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-ink/60">提取的角色 ({extracted.length})</p>
          {extracted.map((char) => (
            <div key={char.id} className="rounded-xl border border-line bg-surface p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink flex items-center gap-1.5">{char.name}{renderStatusBadges(char)}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      useFlowCommands.getState().requestLoadTemplate('tpl-character-turnaround', 'merge');
                      appendLog('已加载角色三视图模板');
                    }}
                    className="text-[10px] text-brand/70 hover:text-brand"
                  >
                    生成三视图
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveCharacter(char)}
                    className="text-[10px] text-brand/70 hover:text-brand"
                  >
                    保存此角色
                  </button>
                </div>
              </div>
              {['identity', 'appearance', 'personality', 'background', 'voice', 'relationships'].map((field) => (
                <div key={field}>
                  <label className="text-[10px] text-ink/40 block mb-0.5">
                    {field === 'identity' ? '基础设定' : field === 'appearance' ? '外貌' : field === 'personality' ? '性格' : field === 'background' ? '背景' : field === 'voice' ? '声音' : '关系'}
                  </label>
                  <textarea
                    value={(char.bible as any)?.[field] ?? ''}
                    onChange={(e) => handleBibleChange(char.id, field, e.target.value)}
                    className="w-full rounded-lg border border-line px-2 py-1 text-[10px] resize-y min-h-[32px] font-mono"
                    rows={1}
                  />
                </div>
              ))}
            </div>
          ))}
          <button
            type="button"
            onClick={handleSaveAll}
            className="flex items-center justify-center gap-1.5 w-full rounded-xl bg-ok text-white text-sm py-2"
          >
            <RefreshCw size={14} />
            全部保存并继续
          </button>
        </div>
      )}

      {characters.characters.length > 0 && extracted.length === 0 && (
        <div className="rounded-xl bg-ok/10 border border-ok/20 p-3">
          <p className="text-xs text-ok font-medium">已有 {characters.characters.length} 角色在 Backlot 库中</p>
          <div className="mt-2 space-y-1">
            {characters.characters.map((char) => (
              <div key={char.id} className="flex items-center justify-between">
                <span className="text-xs text-ink/70 flex items-center gap-1.5">{char.name}{renderStatusBadges(char)}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      useFlowCommands.getState().requestLoadTemplate('tpl-character-turnaround', 'merge');
                      appendLog('已加载角色三视图模板');
                    }}
                    className="text-[10px] text-brand/70 hover:text-brand"
                  >
                    生成三视图
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      useContextRailUi.getState().requestTab('library', { librarySub: 'templates' });
                    }}
                    className="text-[10px] text-brand/70 hover:text-brand"
                  >
                    打开 character-sheet
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              const session = useWorkspaceDocument.getState().playbookSession;
              if (session) {
                useWorkspaceDocument.getState().advancePlaybookStep();
                appendLog('Playbook 步骤已推进');
              }
            }}
            className="mt-2 w-full rounded-xl bg-ok text-white text-sm py-2"
          >
            确认继续
          </button>
        </div>
      )}
    </div>
  );
}
