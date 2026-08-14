/**
 * Q-01: 编剧台右抽屉「成稿」页（自 ScriptDeskBlock 纯搬运）。
 * Brief 行 / 爆点轨 / 集号跳转 / 大纲视图 / 查找替换 / 重试失败 / 集列表（拖拽重排、重写、删除、插集、复制）。
 */
import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { ChevronDown, ChevronRight, FileText, MoreHorizontal, Plus, RefreshCw, Trash2, Wand2, X } from 'lucide-react';
import {
  type ScreenplayPackage,
  findReplaceInEpisode,
  normalizeScreenplayEpisodes,
  touchScreenplayPackage,
  unconfirmIfEdited,
} from '@nx9/shared';
import { compact, episodeDisplayTitle, type SavePkgFn } from './desk-helpers';
import { DebouncedInput, DebouncedTextarea } from './use-debounced-field';

export interface ScreenplayPanelProps {
  pkg: ScreenplayPackage;
  dirtyRef: MutableRefObject<boolean>;
  savePkg: SavePkgFn;
  setTip: Dispatch<SetStateAction<string>>;
  patchBriefTitle: (value: string) => void;
  busy: boolean;
  continueBusy: boolean;
  rewritingEpIndex: number | null;
  outlineView: boolean;
  setOutlineView: Dispatch<SetStateAction<boolean>>;
  findOpen: boolean;
  setFindOpen: Dispatch<SetStateAction<boolean>>;
  findText: string;
  setFindText: Dispatch<SetStateAction<string>>;
  replaceText: string;
  setReplaceText: Dispatch<SetStateAction<string>>;
  failedEpisodeIndexes: number[];
  setFailedEpisodeIndexes: Dispatch<SetStateAction<number[]>>;
  onRetryFailed: (indexes: number[]) => Promise<void>;
  skeletonIndexes: number[];
  epMoreMenuId: string | null;
  setEpMoreMenuId: Dispatch<SetStateAction<string | null>>;
  dragEpId: string | null;
  setDragEpId: Dispatch<SetStateAction<string | null>>;
  onInsertEmptyEpisode: (afterEpisodeId: string | null) => void;
  onEpisodeReorder: (dragId: string, dropId: string) => void;
  onRewriteEpisode: (episodeIndex: number) => Promise<void>;
  onRemoveEpisode: (episodeId: string, episodeIndex: number) => Promise<void>;
  patchEpisodeBody: (episodeId: string, bodyMd: string) => void;
  scrollToEpisode: (epId: string) => void;
  openEpIds: Set<string>;
  setOpenEpIds: Dispatch<SetStateAction<Set<string>>>;
  selectedEpIds: Set<string>;
  onToggleSelectEpisode: (episodeId: string) => void;
  onBatchRewrite: () => void;
  onClearSelectedEpisodes: () => void;
}

export function ScreenplayPanel({
  pkg,
  dirtyRef,
  savePkg,
  setTip,
  patchBriefTitle,
  busy,
  continueBusy,
  rewritingEpIndex,
  outlineView,
  setOutlineView,
  findOpen,
  setFindOpen,
  findText,
  setFindText,
  replaceText,
  setReplaceText,
  failedEpisodeIndexes,
  setFailedEpisodeIndexes,
  onRetryFailed,
  skeletonIndexes,
  epMoreMenuId,
  setEpMoreMenuId,
  dragEpId,
  setDragEpId,
  onInsertEmptyEpisode,
  onEpisodeReorder,
  onRewriteEpisode,
  onRemoveEpisode,
  patchEpisodeBody,
  scrollToEpisode,
  openEpIds,
  setOpenEpIds,
  selectedEpIds,
  onToggleSelectEpisode,
  onBatchRewrite,
  onClearSelectedEpisodes,
}: ScreenplayPanelProps) {
  // 只在集 id/序变化时清理；勿依赖整表 episodes（续写流式改 body 会换引用，否则会反复强开第 1 集）
  const episodeIdKey = pkg.screenplay.episodes.map((e) => `${e.id}:${e.index}`).join('|');
  useEffect(() => {
    const entries = episodeIdKey
      ? episodeIdKey.split('|').map((pair) => {
          const sep = pair.lastIndexOf(':');
          return { id: pair.slice(0, sep), index: Number(pair.slice(sep + 1)) };
        })
      : [];
    const ids = new Set(entries.map((e) => e.id));
    setOpenEpIds((prev) => {
      let pruned = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (ids.has(id)) next.add(id);
        else pruned = true;
      }
      // 仅在「剪掉了失效 id 后变空」时默认展开第 1 集；用户主动全折叠保持空
      if (next.size === 0 && pruned) {
        const first = entries.find((e) => e.index === 1);
        if (first) next.add(first.id);
      }
      if (!pruned && next.size === prev.size) return prev;
      return next;
    });
  }, [episodeIdKey, setOpenEpIds]);

  const hasEpisodes = pkg.screenplay.episodes.length > 0;
  /** 有分集后顶区默认收起，把高度让给剧集列表；从空稿首次出集时自动收一次 */
  const [briefOpen, setBriefOpen] = useState(!hasEpisodes);
  const [hooksOpen, setHooksOpen] = useState(false);
  const hadEpisodesRef = useRef(hasEpisodes);
  useEffect(() => {
    if (!hadEpisodesRef.current && hasEpisodes) {
      setBriefOpen(false);
      setHooksOpen(false);
    }
    hadEpisodesRef.current = hasEpisodes;
  }, [hasEpisodes]);

  const hookCount = (pkg.brief.hooks ?? []).length;
  const briefSummary = [
    pkg.brief.title?.trim(),
    pkg.brief.logline?.trim() ? compact(pkg.brief.logline, 28) : '',
    pkg.brief.episodeCount != null ? `${pkg.brief.episodeCount}集` : '',
  ].filter(Boolean).join(' · ') || '未填写剧名 / 一句话故事';
  const hooksSummary = hookCount === 0
    ? '暂无'
    : compact(
      (pkg.brief.hooks ?? []).map((h) => h.trim()).filter(Boolean).join(' / ') || `${hookCount} 条`,
      36,
    );

  const commitBriefField = (patch: (current: ScreenplayPackage) => ScreenplayPackage['brief']) => {
    dirtyRef.current = true;
    savePkg((current) => {
      let next = touchScreenplayPackage(current, { brief: patch(current) });
      if (current.status === 'confirmed') next = unconfirmIfEdited(next);
      return next;
    }, {}, { undo: 'typing' });
  };

  const addHook = () => {
    dirtyRef.current = true;
    setHooksOpen(true);
    savePkg((current) => {
      let next = touchScreenplayPackage(current, {
        brief: { ...current.brief, hooks: [...(current.brief.hooks ?? []), ''] },
      });
      if (current.status === 'confirmed') next = unconfirmIfEdited(next);
      return next;
    });
  };

  return (
    <>
      <div className="sd2-drawer__head">
      <div className={`sd2-fold${briefOpen ? ' is-open' : ''}`}>
        <button
          type="button"
          className="sd2-fold__toggle"
          aria-expanded={briefOpen}
          aria-label="设定"
          onClick={() => setBriefOpen((v) => !v)}
        >
          <ChevronDown className="sd2-fold__chevron" size={14} strokeWidth={2} aria-hidden />
          <span className="sd2-fold__title">设定</span>
          {!briefOpen && <span className="sd2-fold__summary">{briefSummary}</span>}
        </button>
        {briefOpen && (
          <div className="sd2-fold__body">
            <div className="sd2-meta">
              <div className="sd2-brief-row">
                <label className="sd2-field">
                  <span className="sd2-field__label">剧名</span>
                  <DebouncedInput committed={pkg.brief.title ?? ''} onCommit={patchBriefTitle} placeholder="剧名" />
                </label>
                <label className="sd2-field">
                  <span className="sd2-field__label">一句话故事</span>
                  <DebouncedInput
                    committed={pkg.brief.logline ?? ''}
                    onCommit={(value) => commitBriefField((current) => ({ ...current.brief, logline: value }))}
                    placeholder="一句话故事"
                  />
                </label>
                <label className="sd2-field sd2-field--count">
                  <span className="sd2-field__label">目标集数</span>
                  <DebouncedInput
                    type="number"
                    min={1}
                    max={50}
                    committed={pkg.brief.episodeCount != null ? String(pkg.brief.episodeCount) : ''}
                    onCommit={(value) => {
                      const v = Number(value);
                      commitBriefField((current) => ({
                        ...current.brief,
                        episodeCount: Number.isFinite(v) && v >= 1 ? v : undefined,
                      }));
                    }}
                    placeholder="—"
                  />
                </label>
                <label className="sd2-field sd2-field--count">
                  <span className="sd2-field__label">单集字数</span>
                  <DebouncedInput
                    type="number"
                    min={100}
                    max={20000}
                    committed={pkg.brief.episodeWordTarget != null ? String(pkg.brief.episodeWordTarget) : ''}
                    onCommit={(value) => {
                      const v = Number(value);
                      commitBriefField((current) => ({
                        ...current.brief,
                        episodeWordTarget: Number.isFinite(v) && v >= 100 ? v : undefined,
                      }));
                    }}
                    placeholder="—"
                  />
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className={`sd2-fold sd2-fold--rail${hooksOpen ? ' is-open' : ''}`}>
        <div className="sd2-fold__toggle-row">
          <button
            type="button"
            className="sd2-fold__toggle"
            aria-expanded={hooksOpen}
            aria-label="爆点"
            onClick={() => setHooksOpen((v) => !v)}
          >
            <ChevronDown className="sd2-fold__chevron" size={14} strokeWidth={2} aria-hidden />
            <span className="sd2-fold__title">爆点</span>
            <span className="sd2-rail__meta">{hookCount}</span>
            {!hooksOpen && <span className="sd2-fold__summary">{hooksSummary}</span>}
          </button>
          <button
            type="button"
            className="sd2-rail__add"
            title="添加爆点"
            aria-label="添加爆点"
            onClick={addHook}
          >
            <Plus size={12} strokeWidth={2} aria-hidden />
            添加
          </button>
        </div>
        {hooksOpen && (
          <div className="sd2-fold__body">
            <div className="sd2-rail__body">
              {hookCount === 0 ? (
                <span className="sd2-rail__empty">暂无爆点，点击右上角添加</span>
              ) : (
                (pkg.brief.hooks ?? []).map((hook, i) => (
                  <span key={i} className="sd2-hook-chip" title={hook || `爆点 ${i + 1}`}>
                    <span className="sd2-hook-chip__idx" aria-hidden>{i + 1}</span>
                    <DebouncedInput
                      committed={hook}
                      onCommit={(value) => {
                        dirtyRef.current = true;
                        savePkg((current) => {
                          const hooks = [...(current.brief.hooks ?? [])];
                          hooks[i] = value;
                          let next = touchScreenplayPackage(current, { brief: { ...current.brief, hooks } });
                          if (current.status === 'confirmed') next = unconfirmIfEdited(next);
                          return next;
                        }, {}, { undo: 'typing' });
                      }}
                      className="sd2-hook-chip__input"
                      placeholder={`爆点 ${i + 1}`}
                    />
                    <button
                      type="button"
                      className="sd2-hook-chip__del"
                      aria-label={`删除爆点 ${i + 1}`}
                      onClick={() => {
                        dirtyRef.current = true;
                        savePkg((current) => {
                          const hooks = [...(current.brief.hooks ?? [])];
                          hooks.splice(i, 1);
                          let next = touchScreenplayPackage(current, { brief: { ...current.brief, hooks } });
                          if (current.status === 'confirmed') next = unconfirmIfEdited(next);
                          return next;
                        });
                      }}
                    >
                      <X size={11} strokeWidth={2} aria-hidden />
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      {findOpen && (
        <div className="sd2-find-bar">
          <input
            className="sd2-find-bar__input"
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            placeholder="查找…"
          />
          <input
            className="sd2-find-bar__input"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            placeholder="替换为…"
          />
          <button
            type="button"
            className="sd2-btn sd2-btn--ghost"
            disabled={!findText || busy}
            onClick={() => {
              const preview = pkg.screenplay.episodes.reduce(
                (sum, ep) => sum + findReplaceInEpisode(ep.bodyMd, findText, replaceText).count,
                0,
              );
              if (preview === 0) {
                setTip('未找到匹配内容');
                return;
              }
              savePkg((current) => {
                let totalCount = 0;
                const eps = current.screenplay.episodes.map((ep) => {
                  const { bodyMd, count } = findReplaceInEpisode(ep.bodyMd, findText, replaceText);
                  totalCount += count;
                  return count > 0 ? { ...ep, bodyMd, updatedAt: new Date().toISOString() } : ep;
                });
                if (totalCount === 0) return current;
                dirtyRef.current = true;
                let next = touchScreenplayPackage(current, {
                  screenplay: { ...current.screenplay, episodes: eps },
                });
                if (current.status === 'confirmed') next = unconfirmIfEdited(next);
                setTip(`已替换 ${totalCount} 处`);
                return next;
              });
            }}
          >
            替换
          </button>
        </div>
      )}
      {failedEpisodeIndexes.length > 0 && (
        <div className="sd2-merge-bar">
          <span>第 {failedEpisodeIndexes.join(', ')} 集生成失败，</span>
          <button type="button" className="sd2-btn sd2-btn--primary" disabled={busy} onClick={() => void onRetryFailed(failedEpisodeIndexes)}>重试失败</button>
          <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => setFailedEpisodeIndexes([])}>忽略</button>
        </div>
      )}
      </div>
      <div className="sd2-ep-panel">
        <div className="sd2-ep-panel__head">
          <span className="sd2-ep-panel__title">剧集</span>
          <span className="sd2-ep-panel__meta">
            {pkg.screenplay.episodes.length + skeletonIndexes.length} 集
          </span>
          <div className="sd2-ep-panel__tools">
            <button
              type="button"
              className={`sd2-tool ${outlineView ? 'is-on' : ''}`}
              onClick={() => setOutlineView((v) => !v)}
              title="大纲视图"
              aria-label={outlineView ? '退出大纲视图' : '大纲视图'}
            >
              <FileText size={14} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              className={`sd2-tool ${findOpen ? 'is-on' : ''}`}
              onClick={() => setFindOpen((v) => !v)}
              title="查找替换"
              aria-label="查找替换"
            >
              <Wand2 size={14} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              className="sd2-tool"
              disabled={busy || continueBusy || rewritingEpIndex != null || !hasEpisodes}
              onClick={() => onInsertEmptyEpisode(pkg.screenplay.episodes[pkg.screenplay.episodes.length - 1]?.id)}
              title="在末尾插入空集"
              aria-label="插入空集"
            >
              <Plus size={14} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
          {selectedEpIds.size > 0 && (
            <span className="sd2-ep-panel__batch">
              已选 {selectedEpIds.size}
              <button
                type="button"
                className="sd2-btn sd2-btn--ghost"
                disabled={busy || continueBusy || rewritingEpIndex != null}
                onClick={onBatchRewrite}
              >
                重写所选
              </button>
              <button type="button" className="sd2-btn sd2-btn--ghost" onClick={onClearSelectedEpisodes}>
                取消
              </button>
            </span>
          )}
        </div>
        {hasEpisodes && (
          <div className="sd2-ep-panel__jump" role="navigation" aria-label="分集跳转">
            {pkg.screenplay.episodes
              .slice()
              .sort((a, b) => a.index - b.index)
              .map((ep) => (
                <button
                  key={ep.id}
                  type="button"
                  className="sd2-jump__chip"
                  title={`第${ep.index}集 · ${ep.title || '无标题'}`}
                  onClick={() => scrollToEpisode(ep.id)}
                >
                  {ep.index}
                </button>
              ))}
          </div>
        )}

        <div className="sd2-ep-list" onScroll={() => { if (epMoreMenuId) setEpMoreMenuId(null); }}>
      {skeletonIndexes.map((idx) => (
        <div key={`skel-${idx}`} className="sd2-ep is-skeleton">
          <div className="sd2-ep__summary">
            <span className="sd2-ep__title">第{idx}集 · 生成中…</span>
          </div>
          <div className="sd2-ep__body sd2-ep__skeleton" />
        </div>
      ))}
      {pkg.screenplay.episodes.length === 0 && skeletonIndexes.length === 0 && <div className="sd2-empty">尚无分集成稿</div>}
      {normalizeScreenplayEpisodes(pkg.screenplay.episodes).map((ep) => {
        const isRewriting = rewritingEpIndex === ep.index;
        const titleLabel = episodeDisplayTitle(ep.index, ep.title);
        return (
          <details
            key={ep.id}
            className={`sd2-ep${skeletonIndexes.includes(ep.index) ? ' is-skeleton' : ''}${dragEpId === ep.id ? ' is-dragging' : ''}`}
            id={`sd2-ep-${ep.id}`}
            open={openEpIds.has(ep.id)}
          >
            <summary
              className="sd2-ep__summary"
              draggable="true"
              onClick={(e) => {
                // 受控 details：禁止原生 toggle。React 写回 open 也会派发 toggle，
                // 若在 onToggle 里翻转状态，续写时会与「默认展开第 1 集」互殴频闪。
                const t = e.target as HTMLElement | null;
                if (t?.closest('input, button, a, .sd2-ep__acts')) return;
                e.preventDefault();
                setOpenEpIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(ep.id)) next.delete(ep.id);
                  else next.add(ep.id);
                  return next;
                });
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                setOpenEpIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(ep.id)) next.delete(ep.id);
                  else next.add(ep.id);
                  return next;
                });
              }}
              onDragStart={(e) => {
                setDragEpId(ep.id);
                (e.currentTarget as HTMLElement).closest('.sd2-ep')?.classList.add('is-dragging');
              }}
              onDragEnd={(e) => {
                setDragEpId(null);
                (e.currentTarget as HTMLElement).closest('.sd2-ep')?.classList.remove('is-dragging');
              }}
              onDragOver={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).closest('.sd2-ep')?.classList.add('is-drop-target');
              }}
              onDragLeave={(e) => {
                (e.currentTarget as HTMLElement).closest('.sd2-ep')?.classList.remove('is-drop-target');
              }}
              onDrop={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).closest('.sd2-ep')?.classList.remove('is-drop-target');
                const dragId = dragEpId;
                if (dragId && dragId !== ep.id) {
                  onEpisodeReorder(dragId, ep.id);
                }
                setDragEpId(null);
              }}
            >
              <ChevronRight className="sd2-ep__chevron" size={14} aria-hidden />
              <input
                type="checkbox"
                className="sd2-ep__select"
                checked={selectedEpIds.has(ep.id)}
                aria-label={`选中第${ep.index}集`}
                onClick={(e) => e.stopPropagation()}
                onChange={() => onToggleSelectEpisode(ep.id)}
              />
              <span className="sd2-ep__title">
                {titleLabel ? `第${ep.index}集 · ${titleLabel}` : `第${ep.index}集`}
              </span>
              <span className="sd2-ep__stats">{ep.bodyMd.replace(/\s+/g, '').length} 字 · {(ep.bodyMd.match(/【场景/g) ?? []).length} 场</span>
              <span
                className="sd2-ep__acts"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              >
                {epMoreMenuId === ep.id && !isRewriting ? (
                  <span className="sd2-ep__more-bar" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      className="sd2-ep__rewrite"
                      disabled={busy || continueBusy || rewritingEpIndex != null}
                      title="在此集后插入"
                      aria-label={`在第${ep.index}集后插入`}
                      onClick={() => {
                        setEpMoreMenuId(null);
                        onInsertEmptyEpisode(ep.id);
                      }}
                    >
                      <Plus size={13} aria-hidden />
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="sd2-ep__rewrite"
                      disabled={busy || continueBusy || rewritingEpIndex != null}
                      title="重写本集（衔接前后集）"
                      aria-label={`重写第${ep.index}集`}
                      onClick={() => {
                        setEpMoreMenuId(null);
                        void onRewriteEpisode(ep.index);
                      }}
                    >
                      <RefreshCw size={13} aria-hidden />
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="sd2-ep__rewrite sd2-ep__delete"
                      disabled={busy || continueBusy || rewritingEpIndex != null}
                      title="删除本集"
                      aria-label={`删除第${ep.index}集`}
                      onClick={() => {
                        setEpMoreMenuId(null);
                        void onRemoveEpisode(ep.id, ep.index);
                      }}
                    >
                      <Trash2 size={13} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="sd2-ep__rewrite"
                      title="收起"
                      aria-label="收起更多操作"
                      onClick={() => setEpMoreMenuId(null)}
                    >
                      <X size={13} aria-hidden />
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className={`sd2-ep__rewrite${isRewriting ? ' is-busy' : ''}`}
                    disabled={isRewriting ? false : busy || continueBusy || rewritingEpIndex != null}
                    title={isRewriting ? '重写中…' : '更多操作'}
                    aria-label={isRewriting ? `第${ep.index}集重写中` : `第${ep.index}集更多操作`}
                    aria-expanded={epMoreMenuId === ep.id}
                    onClick={() => {
                      if (isRewriting) return;
                      setEpMoreMenuId((cur) => (cur === ep.id ? null : ep.id));
                    }}
                  >
                    {isRewriting ? (
                      <RefreshCw size={13} className="sd-spin" aria-hidden />
                    ) : (
                      <MoreHorizontal size={14} aria-hidden />
                    )}
                  </button>
                )}
              </span>
            </summary>
            <div className="sd2-ep__body">
              {outlineView ? (
                <div className="sd2-ep__outline" onClick={() => setOutlineView(false)}>
                  <div className="sd2-ep__outline-title">{ep.title || `第${ep.index}集`}</div>
                  <div className="sd2-ep__outline-preview">{ep.bodyMd.slice(0, 200)}{ep.bodyMd.length > 200 ? '…' : ''}</div>
                  <div className="sd2-ep__outline-hint">点击展开全文</div>
                </div>
              ) : (
                <DebouncedTextarea
                  committed={ep.bodyMd}
                  onCommit={(value) => patchEpisodeBody(ep.id, value)}
                  rows={8}
                  disabled={isRewriting}
                />
              )}
              <div className="sd2-ep__body-acts">
                <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => { void navigator.clipboard.writeText(`第${ep.index}集 · ${ep.title || '未命名'}\n\n${ep.bodyMd}`); setTip(`已复制 第${ep.index}集`); }}>
                  <FileText size={12} /> 复制本集
                </button>
              </div>
            </div>
          </details>
        );
      })}
        </div>
      </div>
    </>
  );
}
