import { EmotionDetailFields } from '../AssetDetailFields';
import { useAssetLibraryModal } from './AssetLibraryModalContext';

export function AssetLibraryLegacyView() {
  const { tab, setEditId, setTab, scope, selectedWorkspaceItem } = useAssetLibraryModal();

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div className="mx-auto w-full max-w-lg space-y-3 rounded-xl border border-amber-200/70 bg-amber-50/40 p-4">
        <p className="text-xs font-semibold text-ink">
          {tab === 'emotion' ? '情绪库已退出主导航' : '爆点已退出素材库'}
        </p>
        <p className="text-[11px] leading-relaxed text-ink/60">
          {tab === 'emotion'
            ? '遗留条目仅只读兼容。新氛围标签请在镜头「推荐情绪」维护；角色微表情请用角色表情格。'
            : '爆点 SSOT 在编剧台 brief.hooks。库内钩子 kind 仅兼容旧数据与回收站。'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-brand/35 bg-brand/10 px-3 py-1.5 text-[11px] font-medium text-brand"
            onClick={() => {
              setEditId(null);
              setTab(scope === 'public' ? 'shot' : 'character');
            }}
          >
            {scope === 'public' ? '去镜头词典' : '去角色库'}
          </button>
          {tab === 'emotion' && selectedWorkspaceItem ? (
            <span className="self-center text-[10px] text-ink/45">
              正在查看遗留：{selectedWorkspaceItem.label}
            </span>
          ) : null}
        </div>
        {tab === 'emotion' && selectedWorkspaceItem ? (
          <div className="pointer-events-auto max-h-[50vh] overflow-y-auto nx9-scroll rounded-lg border border-line bg-surface p-2">
            <EmotionDetailFields
              item={selectedWorkspaceItem}
              readOnly
              onChange={() => undefined}
              onRefreshPrompts={() => undefined}
              onUploadImage={async () => undefined}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
