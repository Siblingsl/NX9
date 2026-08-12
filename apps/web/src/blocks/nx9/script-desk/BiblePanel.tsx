/**
 * Q-01: 编剧台右抽屉「设定」页（自 ScriptDeskBlock 纯搬运）。
 * 人物/场景草稿卡编辑、删除、合并、全局改名（B-08）、世界观与视觉风格。
 */
import type { Dispatch, SetStateAction } from 'react';
import { Trash2 } from 'lucide-react';
import type { ScreenplayPackage } from '@nx9/shared';
import { SCREENPLAY_VISUAL_STYLES, isBibleCardHighlighted } from './desk-helpers';
import { DebouncedInput } from './use-debounced-field';

export interface BiblePanelProps {
  pkg: ScreenplayPackage;
  editingBibleId: string | null;
  setEditingBibleId: Dispatch<SetStateAction<string | null>>;
  renamingBibleCharId: string | null;
  setRenamingBibleCharId: Dispatch<SetStateAction<string | null>>;
  renameCharText: string;
  setRenameCharText: Dispatch<SetStateAction<string>>;
  onRenameCharacter: (charId: string, newName: string) => Promise<void>;
  patchBibleCharacter: (charId: string, field: string, value: string) => void;
  patchBibleScene: (sceneId: string, field: string, value: string) => void;
  patchBibleWorld: (field: string, value: string) => void;
  removeBibleCharacter: (charId: string, name: string) => Promise<void>;
  removeBibleScene: (sceneId: string, name: string) => Promise<void>;
  mergeSelection: string[];
  mergeType: 'character' | 'scene' | null;
  setMergeSelection: Dispatch<SetStateAction<string[]>>;
  setMergeType: Dispatch<SetStateAction<'character' | 'scene' | null>>;
  toggleMergeSelect: (id: string, kind: 'character' | 'scene') => void;
  onBibleMerge: () => Promise<void>;
  highlightedBibleId: string | null;
  openAssetAt: (target: { tab: 'character' | 'scene'; itemId: string }) => void;
}

export function BiblePanel({
  pkg,
  editingBibleId,
  setEditingBibleId,
  renamingBibleCharId,
  setRenamingBibleCharId,
  renameCharText,
  setRenameCharText,
  onRenameCharacter,
  patchBibleCharacter,
  patchBibleScene,
  patchBibleWorld,
  removeBibleCharacter,
  removeBibleScene,
  mergeSelection,
  mergeType,
  setMergeSelection,
  setMergeType,
  toggleMergeSelect,
  onBibleMerge,
  highlightedBibleId,
  openAssetAt,
}: BiblePanelProps) {
  return (
    <>
      {mergeSelection.length === 2 && (
        <div className="sd2-merge-bar">
          <span>已选 2 条{mergeType === 'character' ? '人物' : '场景'}，</span>
          <button type="button" className="sd2-btn sd2-btn--primary" onClick={() => void onBibleMerge()}>确认合并</button>
          <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => { setMergeSelection([]); setMergeType(null); }}>取消</button>
        </div>
      )}
      {mergeSelection.length === 1 && (
        <div className="sd2-merge-bar">
          <span>请再选 1 条{mergeType === 'character' ? '人物' : '场景'}进行合并，</span>
          <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => { setMergeSelection([]); setMergeType(null); }}>取消</button>
        </div>
      )}
      <div className="sd2-section-label">人物草稿（叙事层 · 不入库）</div>
      {pkg.bible.characters.length === 0 && <div className="sd2-empty">暂无人物</div>}
      {pkg.bible.characters.map((c) => {
        const isEdit = editingBibleId === c.id;
        return (
          <div
            key={c.id}
            className={`sd2-bible-card${isBibleCardHighlighted(highlightedBibleId, c) ? ' sd2-bible-card--highlight' : ''}${isEdit ? ' is-edit' : ''}`}
            onClick={() => setEditingBibleId(isEdit ? null : c.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') setEditingBibleId(isEdit ? null : c.id); }}
          >
            <div className="sd2-bible-card__name">{c.name}</div>
            {!isEdit && (
              <div className="sd2-bible-card__meta">{c.identity || c.personality || c.appearance ? [c.identity, c.personality, c.appearance].filter(Boolean).join(' · ') : '—'}</div>
            )}
            {isEdit && (
              <div className="sd2-bible-card__fields" onClick={(e) => e.stopPropagation()}>
                <label className="sd2-field sd2-field--compact">
                  <span className="sd2-field__label">身份</span>
                  <DebouncedInput committed={c.identity ?? ''} onCommit={(v) => patchBibleCharacter(c.id, 'identity', v)} />
                </label>
                <label className="sd2-field sd2-field--compact">
                  <span className="sd2-field__label">性格</span>
                  <DebouncedInput committed={c.personality ?? ''} onCommit={(v) => patchBibleCharacter(c.id, 'personality', v)} />
                </label>
                <label className="sd2-field sd2-field--compact">
                  <span className="sd2-field__label">外貌</span>
                  <DebouncedInput committed={c.appearance ?? ''} onCommit={(v) => patchBibleCharacter(c.id, 'appearance', v)} />
                </label>
                {renamingBibleCharId === c.id && (
                  <label className="sd2-field sd2-field--compact">
                    <span className="sd2-field__label">新名字</span>
                    <input
                      value={renameCharText}
                      autoFocus
                      onChange={(e) => setRenameCharText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void onRenameCharacter(c.id, renameCharText);
                        if (e.key === 'Escape') setRenamingBibleCharId(null);
                      }}
                      placeholder={`当前：${c.name}`}
                    />
                  </label>
                )}
                <div className="sd2-bible-card__acts">
                  <button type="button" className="sd2-btn sd2-btn--ghost sd2-btn--danger" onClick={() => void removeBibleCharacter(c.id, c.name)}>
                    <Trash2 size={13} /> 删除
                  </button>
                  {renamingBibleCharId === c.id ? (
                    <>
                      <button
                        type="button"
                        className="sd2-btn sd2-btn--primary"
                        disabled={!renameCharText.trim() || renameCharText.trim() === c.name.trim()}
                        onClick={() => void onRenameCharacter(c.id, renameCharText)}
                      >
                        确认改名
                      </button>
                      <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => setRenamingBibleCharId(null)}>
                        取消
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="sd2-btn sd2-btn--ghost"
                      onClick={() => { setRenamingBibleCharId(c.id); setRenameCharText(c.name); }}
                    >
                      改名
                    </button>
                  )}
                  <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => openAssetAt({ tab: 'character', itemId: c.libraryCharacterId || c.name })}>
                    素材库
                  </button>
                  <button
                    type="button"
                    className={`sd2-btn sd2-btn--ghost ${mergeSelection.includes(c.id) ? 'is-on' : ''}`}
                    onClick={() => toggleMergeSelect(c.id, 'character')}
                  >
                    合并
                  </button>
                  <button
                    type="button"
                    className="sd2-btn sd2-btn--primary"
                    onClick={() => setEditingBibleId(null)}
                  >
                    保存
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <div className="sd2-section-label">场景草稿</div>
      {pkg.bible.scenes.length === 0 && <div className="sd2-empty">暂无场景</div>}
      {pkg.bible.scenes.map((s) => {
        const isEdit = editingBibleId === s.id;
        return (
          <div
            key={s.id}
            className={`sd2-bible-card${isBibleCardHighlighted(highlightedBibleId, s) ? ' sd2-bible-card--highlight' : ''}${isEdit ? ' is-edit' : ''}`}
            onClick={() => setEditingBibleId(isEdit ? null : s.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') setEditingBibleId(isEdit ? null : s.id); }}
          >
            <div className="sd2-bible-card__name">{s.name}</div>
            {!isEdit && (
              <div className="sd2-bible-card__meta">{s.location || s.summary ? [s.location, s.summary].filter(Boolean).join(' · ') : '—'}</div>
            )}
            {isEdit && (
              <div className="sd2-bible-card__fields" onClick={(e) => e.stopPropagation()}>
                <label className="sd2-field sd2-field--compact">
                  <span className="sd2-field__label">地点</span>
                  <DebouncedInput committed={s.location ?? ''} onCommit={(v) => patchBibleScene(s.id, 'location', v)} />
                </label>
                <label className="sd2-field sd2-field--compact">
                  <span className="sd2-field__label">摘要</span>
                  <DebouncedInput committed={s.summary ?? ''} onCommit={(v) => patchBibleScene(s.id, 'summary', v)} />
                </label>
                <label className="sd2-field sd2-field--compact">
                  <span className="sd2-field__label">时代</span>
                  <DebouncedInput committed={s.era ?? ''} onCommit={(v) => patchBibleScene(s.id, 'era', v)} />
                </label>
                <div className="sd2-bible-card__acts">
                  <button type="button" className="sd2-btn sd2-btn--ghost sd2-btn--danger" onClick={() => void removeBibleScene(s.id, s.name)}>
                    <Trash2 size={13} /> 删除
                  </button>
                  <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => openAssetAt({ tab: 'scene', itemId: s.libraryEnvironmentId || s.name })}>
                    素材库
                  </button>
                  <button
                    type="button"
                    className={`sd2-btn sd2-btn--ghost ${mergeSelection.includes(s.id) ? 'is-on' : ''}`}
                    onClick={() => toggleMergeSelect(s.id, 'scene')}
                  >
                    合并
                  </button>
                  <button
                    type="button"
                    className="sd2-btn sd2-btn--primary"
                    onClick={() => setEditingBibleId(null)}
                  >
                    保存
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {pkg.bible.world && (() => {
        const isEdit = editingBibleId === 'world';
        return (
          <>
            <div className="sd2-section-label">世界观</div>
            <div
              className={`sd2-bible-card${isEdit ? ' is-edit' : ''}`}
              onClick={() => setEditingBibleId(isEdit ? null : 'world')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') setEditingBibleId(isEdit ? null : 'world'); }}
            >
              {!isEdit && (
                <div className="sd2-bible-card__meta">{[pkg.bible.world.era, pkg.bible.world.location, pkg.bible.world.worldview].filter(Boolean).join(' · ') || '—'}</div>
              )}
              {isEdit && (
                <div className="sd2-bible-card__fields" onClick={(e) => e.stopPropagation()}>
                  <label className="sd2-field sd2-field--compact">
                    <span className="sd2-field__label">时代</span>
                    <DebouncedInput committed={pkg.bible.world.era ?? ''} onCommit={(v) => patchBibleWorld('era', v)} />
                  </label>
                  <label className="sd2-field sd2-field--compact">
                    <span className="sd2-field__label">地点</span>
                    <DebouncedInput committed={pkg.bible.world.location ?? ''} onCommit={(v) => patchBibleWorld('location', v)} />
                  </label>
                  <label className="sd2-field sd2-field--compact">
                    <span className="sd2-field__label">世界观</span>
                    <DebouncedInput committed={pkg.bible.world.worldview ?? ''} onCommit={(v) => patchBibleWorld('worldview', v)} />
                  </label>
                  <label className="sd2-field sd2-field--compact">
                    <span className="sd2-field__label">视觉风格（生成前必选）</span>
                    <select
                      value={pkg.bible.world.visualStyleNotes ?? ''}
                      onChange={(e) => patchBibleWorld('visualStyleNotes', e.target.value)}
                    >
                      <option value="">请选择人物与全片视觉风格</option>
                      {SCREENPLAY_VISUAL_STYLES.map((style) => (
                        <option key={style.value} value={style.value}>{style.label}</option>
                      ))}
                    </select>
                  </label>
                  <div className="sd2-bible-card__acts">
                    <button
                      type="button"
                      className="sd2-btn sd2-btn--primary"
                      onClick={() => setEditingBibleId(null)}
                    >
                      保存
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        );
      })()}
    </>
  );
}
