import { useEffect, useState } from 'react';
import { BookOpen, Download, Plus, Save, Trash2, X } from 'lucide-react';
import { useSkillVault } from '../stores/skill-vault';
import { api } from '../api/client';

export function SkillsDrawer() {
  const { drawerOpen, items, selectedId, fetchAll, create, remove, setSelected, toggleDrawer } =
    useSkillVault();
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  // Load list when the drawer opens.
  useEffect(() => {
    if (drawerOpen && items.length === 0) void fetchAll();
  }, [drawerOpen, items.length, fetchAll]);

  // Load the selected skill body for editing.
  useEffect(() => {
    if (!drawerOpen || !selectedId) {
      setDraft('');
      setDirty(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const detail = await api.readSkill(selectedId);
        if (!cancelled) {
          setDraft(detail.content);
          setDirty(false);
        }
      } catch {
        /* keep last draft on error */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [drawerOpen, selectedId]);

  if (!drawerOpen) return null;

  const onCreate = async () => {
    const id = window.prompt('新技能 ID（仅 a-z 0-9 连字符）', `skill-${Date.now()}`);
    if (!id) return;
    const name = window.prompt('技能名称', id) ?? id;
    try {
      await create({ id, name });
    } catch (e) {
      window.alert(`创建失败：${String(e)}`);
    }
  };

  const onSave = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await api.saveSkill(selectedId, draft);
      setDirty(false);
    } catch (e) {
      window.alert(`保存失败：${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!selectedId) return;
    if (!window.confirm(`删除技能「${selectedId}」？此操作不可撤销。`)) return;
    try {
      await remove(selectedId);
    } catch (e) {
      window.alert(`删除失败：${String(e)}`);
    }
  };

  const onSeedSeedance = async () => {
    setBusy(true);
    try {
      const res = await api.seedSeedanceSkills();
      await fetchAll();
      window.alert(`Seedance 技能包：新增 ${res.imported}，已存在 ${res.skipped}`);
    } catch (e) {
      window.alert(`导入失败：${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="flex-1 bg-ink/20 backdrop-blur-[2px]"
        onClick={() => toggleDrawer(false)}
        aria-label="关闭技能管理"
      />
      <div className="w-full max-w-3xl h-full bg-white shadow-panel flex">
        {/* Left: skill list */}
        <aside className="w-56 shrink-0 border-r border-line flex flex-col">
          <div className="flex items-center gap-2 px-4 py-4 border-b border-line">
            <BookOpen size={18} className="text-brand" />
            <h2 className="text-base font-semibold">技能</h2>
          </div>
          <div className="flex-1 overflow-y-auto nx9-scroll py-2">
            {items.length === 0 && (
              <p className="px-4 py-2 text-xs text-ink/40">暂无技能</p>
            )}
            {items.map((s) => {
              const active = s.id === selectedId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelected(s.id)}
                  title={s.description}
                  className={`block w-full text-left px-4 py-2 text-sm transition-colors ${
                    active
                      ? 'bg-brand/5 text-brand border-l-2 border-brand'
                      : 'text-ink/70 hover:bg-surface border-l-2 border-transparent'
                  }`}
                >
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="block truncate text-[11px] text-ink/40">{s.description}</span>
                </button>
              );
            })}
          </div>
          <div className="p-3 border-t border-line space-y-2">
            <button
              type="button"
              onClick={() => void onSeedSeedance()}
              disabled={busy}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-line py-2 text-sm text-accent hover:border-accent/40"
            >
              <Download size={14} />
              导入 Seedance 包
            </button>
            <button
              type="button"
              onClick={() => void onCreate()}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2 text-sm text-ink/60 hover:border-brand hover:text-brand"
            >
              <Plus size={14} />
              新建技能
            </button>
          </div>
        </aside>

        {/* Right: editor */}
        <section className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line">
            <span className="text-sm font-medium truncate">
              {selectedId ?? '选择左侧技能'}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void onDelete()}
                disabled={!selectedId}
                title="删除"
                className="p-1.5 rounded-lg hover:bg-surface text-warn disabled:opacity-30"
              >
                <Trash2 size={16} />
              </button>
              <button
                type="button"
                onClick={() => void onSave()}
                disabled={!selectedId || !dirty || busy}
                className="flex items-center gap-1.5 rounded-lg bg-brand text-white px-3 py-1.5 text-sm hover:bg-brand/90 disabled:opacity-40"
              >
                <Save size={14} />
                {busy ? '保存中…' : '保存'}
              </button>
              <button
                type="button"
                onClick={() => toggleDrawer(false)}
                className="p-1.5 rounded-lg hover:bg-surface text-ink/60 hover:text-brand"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {selectedId ? (
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setDirty(true);
              }}
              spellCheck={false}
              className="flex-1 w-full resize-none p-5 font-mono text-xs leading-relaxed text-ink nx9-scroll focus:outline-none"
              placeholder="编辑 SKILL.md…开头用 frontmatter 定义 name 与 description。"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-ink/40">
              选择左侧技能开始编辑，或点击「新建技能」
            </div>
          )}
          <p className="px-5 py-2 border-t border-line text-[11px] text-ink/40">
            技能正文会在对话模型选中该技能时，作为系统提示词注入 LLM。
          </p>
        </section>
      </div>
    </div>
  );
}
