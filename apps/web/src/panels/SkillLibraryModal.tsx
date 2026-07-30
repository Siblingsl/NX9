import { memo, useEffect, useMemo, useState } from 'react';
import { BookMarked, Loader2, Search, X } from 'lucide-react';
import type { SkillLane, SkillSummary } from '@nx9/shared';
import { api } from '../api/client';
import { invalidateGenPacks } from '../engine/gen-skill-runtime';
import { askConfirm } from '../stores/confirm-dialog';
import { useSkillLibraryModalUi } from '../stores/skill-library-modal-ui';
import './skill-library-modal.css';

const GEN_PACK_PATH = 'templates/prompt-pack.md';

function isGenSkillId(id: string): boolean {
  return id.startsWith('gen-');
}

function SkillListItem({
  skill,
  selected,
  onSelect,
}: {
  skill: SkillSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`nx9-skill-lib__item ${selected ? 'is-on' : ''}`}
      onClick={onSelect}
    >
      <div className="nx9-skill-lib__item-head">
        <span className="nx9-skill-lib__item-name">{skill.name}</span>
        {skill.priority && (
          <span className={`nx9-skill-lib__badge is-${String(skill.priority).toLowerCase()}`}>
            {skill.priority}
          </span>
        )}
        {skill.status && (
          <span className={`nx9-skill-lib__status is-${skill.status}`}>{skill.status}</span>
        )}
      </div>
      <p className="nx9-skill-lib__item-desc">{skill.description}</p>
      <div className="nx9-skill-lib__tags">
        {(skill.tags ?? []).slice(0, 3).map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </button>
  );
}

function SkillLibraryBody({ initialId }: { initialId?: string | null }) {
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(initialId ?? null);
  const [editContent, setEditContent] = useState('');
  const [editPack, setEditPack] = useState('');
  const [editTab, setEditTab] = useState<'skill' | 'pack'>('skill');
  const [editMeta, setEditMeta] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api.listSkills().then((list) => {
      setSkills(list.map((s) => ({ ...s })));
      setLoading(false);
      if (initialId && list.some((s) => s.id === initialId)) {
        setSelected(initialId);
      } else if (!initialId && list.length > 0) {
        const builtinFirst = list.find((s) => s.lane === 'builtin') ?? list[0];
        setSelected(builtinFirst.id);
      }
    });
  }, [initialId]);

  const selectedSkill = skills.find((s) => s.id === selected);
  const selectedIsGen = Boolean(selected && isGenSkillId(selected));

  useEffect(() => {
    if (!selected) return;
    setEditTab('skill');
    setEditPack('');
    void api.readSkill(selected).then((detail) => {
      setEditContent(detail.content);
      setEditMeta((detail.metadata ?? {}) as Record<string, unknown>);
      setSkills((prev) =>
        prev.map((s) =>
          s.id === selected
            ? { ...s, content: detail.content, metadata: detail.metadata, lane: detail.lane ?? s.lane }
            : s,
        ),
      );
    });
    if (isGenSkillId(selected)) {
      void api
        .readSkillFile(selected, GEN_PACK_PATH)
        .then((f) => setEditPack(f.content))
        .catch(() => setEditPack('## quality\n\n## constraints\n'));
    }
  }, [selected]);

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setErrors([]);
    try {
      await api.saveSkill(selected, editContent);
      if (isGenSkillId(selected)) {
        await api.writeSkillFile(selected, GEN_PACK_PATH, editPack);
        invalidateGenPacks();
      }
      if (Object.keys(editMeta).length > 0) {
        await api.updateSkillMeta?.(selected, editMeta);
      }
    } catch (e) {
      setErrors([String(e)]);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selected) return;
    const ok = await askConfirm({
      title: '确认恢复为官方版本？',
      description: '当前对技能内容的修改将丢失，此操作不可撤销。',
      confirmLabel: '恢复官方版本',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.resetSkill?.(selected);
      if (isGenSkillId(selected)) invalidateGenPacks();
      void api.readSkill(selected).then((detail) => {
        setEditContent(detail.content);
        setEditMeta((detail.metadata ?? {}) as Record<string, unknown>);
        setSkills((prev) =>
          prev.map((s) =>
            s.id === selected
              ? {
                  ...s,
                  version: detail.version,
                  status: detail.status,
                  tags: detail.tags,
                  lane: detail.lane ?? s.lane,
                }
              : s,
          ),
        );
      });
      if (isGenSkillId(selected)) {
        void api
          .readSkillFile(selected, GEN_PACK_PATH)
          .then((f) => setEditPack(f.content))
          .catch(() => setEditPack(''));
      }
    } catch (e) {
      setErrors([String(e)]);
    }
  };

  const handleValidate = async () => {
    if (!selected) return;
    try {
      const res = await api.validateSkill?.(selected);
      if (res && res.valid) {
        setErrors(['校验通过']);
      } else if (res) {
        setErrors(res.errors.map((e) => `${e.file}: ${e.message}`));
      }
    } catch (e) {
      setErrors([String(e)]);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return skills.filter((s) => {
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q)
        || s.id.toLowerCase().includes(q)
        || (s.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [skills, search]);

  const groups = useMemo(() => {
    const builtin: SkillSummary[] = [];
    const library: SkillSummary[] = [];
    for (const s of filtered) {
      const lane: SkillLane = s.lane === 'library' ? 'library' : 'builtin';
      if (lane === 'library') library.push(s);
      else builtin.push(s);
    }
    return { builtin, library };
  }, [filtered]);

  const renderGroup = (title: string, hint: string, items: SkillSummary[]) => {
    if (items.length === 0) return null;
    return (
      <div className="nx9-skill-lib__group" key={title}>
        <div className="nx9-skill-lib__group-head">
          <span>{title}</span>
          <em>{items.length}</em>
        </div>
        <p className="nx9-skill-lib__group-hint">{hint}</p>
        {items.map((s) => (
          <SkillListItem
            key={s.id}
            skill={s}
            selected={selected === s.id}
            onSelect={() => {
              setSelected(s.id);
              setErrors([]);
            }}
          />
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="nx9-skill-lib__loading">
        <Loader2 size={16} className="animate-spin" />
        加载技能库…
      </div>
    );
  }

  const laneHint =
    selectedSkill?.lane === 'library'
      ? '资料 / 工具类：可查看修改；当前不自动注入主制片链路。'
      : selectedIsGen
        ? 'Gen 拼装 Skill：保存「拼装包」后立即作用于制作台 / Bible / 设定板 / 导演批量生成。'
        : '内置生产 Skill：保存后立即成为编剧台 / Agent 等主链运行时权威源。';

  return (
    <div className="nx9-skill-lib__body">
      <div className="nx9-skill-lib__sidebar">
        <div className="nx9-skill-lib__search">
          <Search size={13} />
          <input
            type="text"
            placeholder="搜索 Skill…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="nx9-skill-lib__list nx9-scroll">
          {renderGroup('内置生产', '主制片链路注入用', groups.builtin)}
          {renderGroup('其他有用', '方法论 / Seedance / 工具资料', groups.library)}
          {filtered.length === 0 && <p className="nx9-skill-lib__empty">无匹配技能</p>}
        </div>
      </div>

      <div className="nx9-skill-lib__editor">
        {selectedSkill ? (
          <>
            <div className="nx9-skill-lib__editor-head">
              <div className="min-w-0">
                <h3>{selectedSkill.name}</h3>
                <p>
                  ID: {selectedSkill.id}
                  {selectedSkill.version ? ` · v${selectedSkill.version}` : ''}
                  {selectedSkill.lane === 'library' ? ' · 其他有用' : ' · 内置生产'}
                </p>
              </div>
              <div className="nx9-skill-lib__actions">
                <button type="button" disabled={saving} onClick={() => void handleSave()}>
                  {saving ? '保存中…' : '保存'}
                </button>
                <button type="button" onClick={() => void handleValidate()}>
                  校验
                </button>
                <button type="button" className="is-danger" onClick={() => void handleReset()}>
                  重置官方版
                </button>
              </div>
            </div>
            {selectedIsGen && (
              <div className="nx9-skill-lib__tabs">
                <button
                  type="button"
                  className={editTab === 'skill' ? 'is-on' : ''}
                  onClick={() => setEditTab('skill')}
                >
                  说明 SKILL.md
                </button>
                <button
                  type="button"
                  className={editTab === 'pack' ? 'is-on' : ''}
                  onClick={() => setEditTab('pack')}
                >
                  拼装包 prompt-pack
                </button>
              </div>
            )}
            <textarea
              className="nx9-skill-lib__textarea nx9-scroll"
              value={selectedIsGen && editTab === 'pack' ? editPack : editContent}
              onChange={(e) => {
                if (selectedIsGen && editTab === 'pack') setEditPack(e.target.value);
                else setEditContent(e.target.value);
              }}
              spellCheck={false}
            />
            {errors.length > 0 && (
              <div
                className={`nx9-skill-lib__feedback ${errors[0] === '校验通过' ? 'is-ok' : 'is-err'}`}
              >
                {errors.map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
              </div>
            )}
            <p className="nx9-skill-lib__hint">{laneHint}</p>
          </>
        ) : (
          <div className="nx9-skill-lib__placeholder">从左侧选择一个 Skill 查看与修改</div>
        )}
      </div>
    </div>
  );
}

export const SkillLibraryModal = memo(function SkillLibraryModal() {
  const open = useSkillLibraryModalUi((s) => s.open);
  const focusSkillId = useSkillLibraryModalUi((s) => s.focusSkillId);
  const setOpen = useSkillLibraryModalUi((s) => s.setOpen);
  const clearFocus = useSkillLibraryModalUi((s) => s.clearFocus);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (open && focusSkillId) {
      const t = window.setTimeout(() => clearFocus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [open, focusSkillId, clearFocus]);

  useEffect(() => {
    const openAt = useSkillLibraryModalUi.getState().openAt;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ skillId?: string }>).detail;
      openAt(detail?.skillId);
    };
    window.addEventListener('nx9:openSkillLibrary', handler as EventListener);
    return () => window.removeEventListener('nx9:openSkillLibrary', handler as EventListener);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        aria-label="关闭技能库"
        onClick={() => setOpen(false)}
      />
      <div className="nx9-skill-lib relative w-[min(1040px,96vw)] h-[min(760px,90vh)] bg-surface rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-line">
        <header className="nx9-skill-lib__header">
          <BookMarked size={20} className="text-brand shrink-0" />
          <div className="flex-1 min-w-0">
            <h2>技能库</h2>
            <p>内置生产 Skill 与其他有用资料分栏管理；保存后按链路规则生效</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-2 rounded-lg hover:bg-surface text-ink/50"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </header>
        <SkillLibraryBody key={focusSkillId ?? 'default'} initialId={focusSkillId} />
      </div>
    </div>
  );
});
