import { Loader2, Plus, Sparkles } from 'lucide-react';
import {
  CAC_SHOT_SIZES,
  SHOT_LEXICON_SYSTEMS,
  SHOT_MOVE_FAMILIES,
  SOUND_ASSET_KINDS,
  STYLE_AESTHETIC_FAMILIES,
  shortenShotLexiconCategory,
} from '@nx9/shared';
import { ShotFilterChipScroller } from '../ShotFilterChipScroller';
import { useAssetLibraryModal } from './AssetLibraryModalContext';

export function AssetLibraryStatusRail() {
  const {
    shellFullEdit,
    filtered,
    tab,
    favoriteOnly,
    setFavoriteOnly,
    scope,
    canEditPrivate,
    costumeGenBusy,
    costumeGenProgress,
    workspaceItems,
    generateCostumeSheets,
    canCreateAsset,
    handleCreate,
    tabMeta,
    shotSystemId,
    setShotSystemId,
    shotCategory,
    setShotCategory,
    shotCategoryOptions,
    shotMoveFamily,
    setShotMoveFamily,
    shotSizeFilter,
    setShotSizeFilter,
    styleFamilyFilter,
    setStyleFamilyFilter,
    soundKindFilter,
    setSoundKindFilter,
    charSheetGenBusy,
    charSheetGenProgress,
    entityFullEdit,
    sceneGenBusy,
    propGenBusy,
  } = useAssetLibraryModal();

  return (
    <>
      {!shellFullEdit ? (
        <>
          <div className="shrink-0 px-4 py-2 border-b border-line flex items-center gap-2">
            <span className="text-[10px] text-ink/40 shrink-0">{filtered.length} 项</span>
            <div className="min-w-0 flex-1" />
            {(tab === 'shot' || tab === 'style' || tab === 'sound') && (
              <button
                type="button"
                onClick={() => setFavoriteOnly((v) => !v)}
                className={`shrink-0 text-[10px] px-2 py-1 rounded-lg border ${
                  favoriteOnly
                    ? 'border-brand/40 bg-brand/10 text-brand'
                    : 'border-line text-ink/50'
                }`}
              >
                仅收藏
              </button>
            )}
            {tab === 'costume' && scope === 'private' && canEditPrivate && (
              <button
                type="button"
                disabled={costumeGenBusy || workspaceItems.filter((i) => i.kind === 'costume').length === 0}
                onClick={() => void generateCostumeSheets(workspaceItems.filter((i) => i.kind === 'costume'))}
                className="shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-brand/30 bg-brand/5 text-brand disabled:opacity-45"
                title="批量生成当前私有库全部服装设定板"
              >
                {costumeGenBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {costumeGenBusy ? (costumeGenProgress || '生成中') : '批量设定板'}
              </button>
            )}
            {canCreateAsset && (
              <button
                type="button"
                onClick={() => handleCreate()}
                className="shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-brand text-white"
              >
                <Plus size={14} />
                {tabMeta.newLabel}
              </button>
            )}
          </div>

          {costumeGenBusy ? (
            <div className="shrink-0 px-4 py-1.5 text-[11px] text-brand bg-brand/5 border-b border-brand/15">
              服装设定板生成中 {costumeGenProgress || ''} · 请稍候
            </div>
          ) : null}
          {tab === 'shot' ? (
            <div className="nx9-shot-filter shrink-0 border-b border-line px-4 py-2">
              <div className="grid grid-cols-1 gap-x-5 gap-y-1.5 sm:grid-cols-2">
                {/* 左上：体系 */}
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-7 shrink-0 text-[10px] font-medium text-ink/40">
                    体系
                  </span>
                  <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto nx9-scroll">
                    <button
                      type="button"
                      onClick={() => {
                        setShotSystemId('all');
                        setShotCategory('all');
                      }}
                      className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] leading-5 ${
                        shotSystemId === 'all'
                          ? 'border-brand/40 bg-brand/10 text-brand'
                          : 'border-line text-ink/55 hover:border-brand/30'
                      }`}
                    >
                      全部
                    </button>
                    {SHOT_LEXICON_SYSTEMS.map((sys) => (
                      <button
                        key={sys.id}
                        type="button"
                        title={sys.fullName}
                        onClick={() => {
                          setShotSystemId(sys.id);
                          setShotCategory('all');
                        }}
                        className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] leading-5 ${
                          shotSystemId === sys.id
                            ? 'border-brand/40 bg-brand/10 text-brand'
                            : 'border-line text-ink/55 hover:border-brand/30'
                        }`}
                      >
                        {sys.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 右上：分类（全部固定，其余拖拽横滑） */}
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-7 shrink-0 text-[10px] font-medium text-ink/40">
                    分类
                  </span>
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShotCategory('all')}
                      className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] leading-5 ${
                        shotCategory === 'all'
                          ? 'border-brand/40 bg-brand/10 text-brand'
                          : 'border-line text-ink/55 hover:border-brand/30'
                      }`}
                    >
                      全部
                    </button>
                    <ShotFilterChipScroller deps={shotCategoryOptions.join('|')}>
                      {shotCategoryOptions.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          title={cat}
                          onClick={() => setShotCategory(cat)}
                          className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] leading-5 ${
                            shotCategory === cat
                              ? 'border-brand/40 bg-brand/10 text-brand'
                              : 'border-line text-ink/55 hover:border-brand/30'
                          }`}
                        >
                          {shortenShotLexiconCategory(cat)}
                        </button>
                      ))}
                    </ShotFilterChipScroller>
                  </div>
                </div>

                {/* 左下：运镜 */}
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-7 shrink-0 text-[10px] font-medium text-ink/40">
                    运镜
                  </span>
                  <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto nx9-scroll">
                    <button
                      type="button"
                      onClick={() => setShotMoveFamily('all')}
                      className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] leading-5 ${
                        shotMoveFamily === 'all'
                          ? 'border-brand/40 bg-brand/10 text-brand'
                          : 'border-line text-ink/55 hover:border-brand/30'
                      }`}
                    >
                      全部
                    </button>
                    {SHOT_MOVE_FAMILIES.map((fam) => (
                      <button
                        key={fam.id}
                        type="button"
                        onClick={() => setShotMoveFamily(fam.id)}
                        className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] leading-5 ${
                          shotMoveFamily === fam.id
                            ? 'border-brand/40 bg-brand/10 text-brand'
                            : 'border-line text-ink/55 hover:border-brand/30'
                        }`}
                      >
                        {fam.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 右下：景别 */}
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-7 shrink-0 text-[10px] font-medium text-ink/40">
                    景别
                  </span>
                  <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto nx9-scroll">
                    <button
                      type="button"
                      onClick={() => setShotSizeFilter('all')}
                      className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] leading-5 ${
                        shotSizeFilter === 'all'
                          ? 'border-brand/40 bg-brand/10 text-brand'
                          : 'border-line text-ink/55 hover:border-brand/30'
                      }`}
                    >
                      全部
                    </button>
                    {CAC_SHOT_SIZES.map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setShotSizeFilter(size)}
                        className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] leading-5 ${
                          shotSizeFilter === size
                            ? 'border-brand/40 bg-brand/10 text-brand'
                            : 'border-line text-ink/55 hover:border-brand/30'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          {tab === 'style' ? (
            <div className="nx9-shot-filter shrink-0 border-b border-line px-4 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="w-7 shrink-0 text-[10px] font-medium text-ink/40">
                  美学
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto nx9-scroll">
                  <button
                    type="button"
                    onClick={() => setStyleFamilyFilter('all')}
                    className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] leading-5 ${
                      styleFamilyFilter === 'all'
                        ? 'border-brand/40 bg-brand/10 text-brand'
                        : 'border-line text-ink/55 hover:border-brand/30'
                    }`}
                  >
                    全部
                  </button>
                  {STYLE_AESTHETIC_FAMILIES.map((fam) => (
                    <button
                      key={fam.id}
                      type="button"
                      title={fam.hint}
                      onClick={() => setStyleFamilyFilter(fam.id)}
                      className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] leading-5 ${
                        styleFamilyFilter === fam.id
                          ? 'border-brand/40 bg-brand/10 text-brand'
                          : 'border-line text-ink/55 hover:border-brand/30'
                      }`}
                    >
                      {fam.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          {tab === 'sound' ? (
            <div className="nx9-shot-filter shrink-0 border-b border-line px-4 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="w-7 shrink-0 text-[10px] font-medium text-ink/40">
                  类型
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto nx9-scroll">
                  <button
                    type="button"
                    onClick={() => setSoundKindFilter('all')}
                    className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] leading-5 ${
                      soundKindFilter === 'all'
                        ? 'border-brand/40 bg-brand/10 text-brand'
                        : 'border-line text-ink/55 hover:border-brand/30'
                    }`}
                  >
                    全部
                  </button>
                  {SOUND_ASSET_KINDS.map((kind) => (
                    <button
                      key={kind.id}
                      type="button"
                      title={kind.hint}
                      onClick={() => setSoundKindFilter(kind.id)}
                      className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] leading-5 ${
                        soundKindFilter === kind.id
                          ? 'border-brand/40 bg-brand/10 text-brand'
                          : 'border-line text-ink/55 hover:border-brand/30'
                      }`}
                    >
                      {kind.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          {charSheetGenBusy ? (
            <div className="shrink-0 px-4 py-1.5 text-[11px] text-brand bg-brand/5 border-b border-brand/15">
              角色设定板生成/裁切中 {charSheetGenProgress || ''} · 完成后自动回填各参考格
            </div>
          ) : null}
        </>
      ) : charSheetGenBusy ? (
        <div className="shrink-0 px-4 py-1.5 text-[11px] text-brand bg-brand/5 border-b border-brand/15">
          角色设定板生成/裁切中 {charSheetGenProgress || ''} · 完成后自动回填各参考格
        </div>
      ) : costumeGenBusy && entityFullEdit ? (
        <div className="shrink-0 px-4 py-1.5 text-[11px] text-brand bg-brand/5 border-b border-brand/15">
          服装设定板生成中 {costumeGenProgress || ''} · 请稍候
        </div>
      ) : (sceneGenBusy || propGenBusy) && entityFullEdit ? (
        <div className="shrink-0 px-4 py-1.5 text-[11px] text-brand bg-brand/5 border-b border-brand/15">
          {sceneGenBusy ? '场景空间设定板生成中' : '道具三视图板生成中'} · 请稍候
        </div>
      ) : null}
    </>
  );
}
