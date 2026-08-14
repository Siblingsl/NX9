import { createPortal } from 'react-dom';
import {
  FolderLock,
  Globe2,
  Layers,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  ASSET_LIBRARY_TABS,
  assetLibraryTabGroupsForScope,
} from '@nx9/shared';
import { AssetBlockingSummary } from '../AssetBlockingSummary';
import { AssetHealthBar } from '../AssetHealthBar';
import { AssetLibrarySourceStrip } from '../AssetLibrarySourceStrip';
import { AssetTrashPanel } from '../../AssetTrashPanel';
import { useAssetLibraryModal } from './AssetLibraryModalContext';
import { AssetLibraryModalContent } from './AssetLibraryModalContent';

export function AssetLibraryModalShell() {
  const {
    setOpen,
    scope,
    activeProject,
    handleScopeChange,
    setTab,
    setEditId,
    shellFullEdit,
    showTrash,
    setShowTrash,
    query,
    setQuery,
    tab,
    healthAnalysis,
    setHealthFilterKey,
    healthFilterKey,
    setSuggestCreateLabel,
    setFavoriteOnly,
    characters,
    workspaceItems,
    returnHint,
    suggestCreateLabel,
    suggestCreateExactExists,
    canCreateAsset,
    navStack,
    popNavStack,
    returnToSource,
    resumeGapKey,
    resumeSection,
    setReturnHint,
    setResumeGapKey,
    setResumeSection,
    handleCreate,
    activeId,
  } = useAssetLibraryModal();

  return createPortal(
    <div className="fixed inset-0 z-[260] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="素材库">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        aria-label="关闭素材库"
        onClick={() => setOpen(false)}
      />
      <div className="nx9-asset-library-modal relative w-[min(1120px,96vw)] h-[min(820px,92vh)] bg-surface rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-line">
        <header className="shrink-0 border-b border-line flex items-center px-5 gap-4 py-2 min-h-14">
          <Layers size={20} className="text-brand shrink-0" />
          <div className="min-w-0 shrink-0 max-w-[12rem]">
            <h2 className="font-semibold text-base leading-tight text-ink">素材库</h2>
            <p className="text-[11px] leading-tight text-ink/40 truncate">
              {scope === 'private'
                ? `私有 · ${activeProject?.title ?? '未打开项目'}`
                : '公共素材 · 全项目可用'}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {/* 右侧：搜索 → 阻塞 → 私有/公共 → 回收站 → 关闭 */}
            {!shellFullEdit && !showTrash ? (
              <div className="relative w-36 shrink-0">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink/30"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`搜索${ASSET_LIBRARY_TABS.find((t) => t.key === tab)?.label ?? ''}…`}
                  className="w-full rounded-lg border border-line py-1.5 pl-7 pr-2 text-xs"
                  aria-label="搜索当前子库"
                />
              </div>
            ) : null}
            {!showTrash ? (
              <AssetBlockingSummary
                analysis={healthAnalysis}
                tabs={assetLibraryTabGroupsForScope(scope).flatMap((g) => g.keys)}
                onJump={(nextTab, key) => {
                  setTab(nextTab);
                  setEditId(null);
                  setHealthFilterKey(key);
                  setSuggestCreateLabel(null);
                  setFavoriteOnly(false);
                }}
              />
            ) : null}
            <div className="flex rounded-xl border border-line p-0.5 bg-surface shrink-0">
              <button
                type="button"
                onClick={() => handleScopeChange('private')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  scope === 'private' ? 'bg-surface shadow-sm text-brand' : 'text-ink/50'
                }`}
              >
                <FolderLock size={14} />
                私有
              </button>
              <button
                type="button"
                onClick={() => handleScopeChange('public')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  scope === 'public' ? 'bg-surface shadow-sm text-brand' : 'text-ink/50'
                }`}
              >
                <Globe2 size={14} />
                公共
              </button>
            </div>
            <button
              type="button"
              title={showTrash ? '关闭回收站' : '资产回收站'}
              onClick={() => {
                setShowTrash((v) => {
                  const next = !v;
                  return next;
                });
              }}
              className={`p-2 rounded-lg hover:bg-surface ${showTrash ? 'text-warn bg-warn/10' : 'text-ink/50'}`}
            >
              <Trash2 size={18} />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-2 rounded-lg hover:bg-surface text-ink/50"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col">
              {!shellFullEdit ? (
                <>
                  <div className="shrink-0 flex items-center gap-1.5 px-4 py-2 border-b border-line overflow-x-auto nx9-scroll">
                    {assetLibraryTabGroupsForScope(scope).map((group, gi) => (
                      <div key={group.id} className="flex items-center gap-1.5 shrink-0">
                        {gi > 0 ? (
                          <span
                            className="mx-0.5 h-4 w-px shrink-0 bg-line"
                            aria-hidden
                            title={group.label}
                          />
                        ) : null}
                        {group.keys.map((key) => {
                          const t = ASSET_LIBRARY_TABS.find((row) => row.key === key);
                          if (!t) return null;
                          return (
                            <button
                              key={t.key}
                              type="button"
                              onClick={() => {
                                setTab(t.key);
                                setEditId(null);
                                setSuggestCreateLabel(null);
                                setFavoriteOnly(false);
                              }}
                              className={`shrink-0 text-xs px-3 py-1.5 rounded-full border ${
                                tab === t.key
                                  ? 'bg-brand/10 border-brand/40 text-brand font-medium'
                                  : 'border-line text-ink/60 hover:border-brand/20'
                              }`}
                              title={`${group.label} · ${t.hint}`}
                            >
                              {t.label}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <AssetHealthBar
                    tab={tab}
                    analysis={healthAnalysis}
                    activeKey={healthFilterKey}
                    onSelectIssue={setHealthFilterKey}
                    onOpenItem={(id) => setEditId(id)}
                    characters={characters}
                    workspaceItems={workspaceItems}
                    externalDrawer={showTrash ? 'trash' : null}
                    onImpactOpenChange={(open) => {
                      if (open) setShowTrash(false);
                    }}
                  />
                </>
              ) : null}

              <AssetLibrarySourceStrip
                returnHint={returnHint}
                suggestCreateLabel={suggestCreateLabel}
                suggestCreateExactExists={suggestCreateExactExists}
                canCreateAsset={canCreateAsset}
                navPrevLabel={navStack.length > 0 ? (navStack[navStack.length - 1]?.label ?? null) : null}
                onPopNav={popNavStack}
                onReturnToSource={() => {
                  const gapKey = resumeGapKey || suggestCreateLabel?.trim() || undefined;
                  const section =
                    resumeSection
                    || (tab === 'costume'
                      ? 'costumes'
                      : tab === 'prop'
                        ? 'props'
                        : tab === 'scene'
                          ? 'scenes'
                          : 'characters');
                  returnToSource({
                    hint: returnHint || '设定就绪',
                    gapKey,
                    section,
                    tab,
                  });
                  setReturnHint(null);
                  setSuggestCreateLabel(null);
                  setResumeGapKey(null);
                  setResumeSection(null);
                }}
                onDismissReturnHint={() => setReturnHint(null)}
                onCreateSuggested={() => handleCreate(suggestCreateLabel!)}
                onDismissSuggest={() => setSuggestCreateLabel(null)}
              />

              {scope === 'private' && !activeId ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <FolderLock size={36} className="text-brand/50 mb-3" />
                  <p className="text-sm text-ink/55">请先在画布顶部打开一个私有项目</p>
                </div>
              ) : (
                <AssetLibraryModalContent />
              )}
          {showTrash ? (
            <div className="nx9-asset-lib-drawer absolute inset-y-0 right-0 z-40 flex w-[min(380px,92%)] flex-col border-l border-line bg-surface shadow-2xl">
              <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
                <Trash2 size={14} className="text-warn" />
                <span className="flex-1 text-xs font-semibold text-ink">回收站</span>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-ink/50 hover:bg-surface hover:text-ink"
                  aria-label="关闭回收站"
                  onClick={() => setShowTrash(false)}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto nx9-scroll p-3">
                <AssetTrashPanel defaultScope={scope} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
