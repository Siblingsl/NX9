/**
 * AssetTrashPanel — 项目内资产回收站（F-010）。
 *
 * 宫格展示软删的角色、服装、场景、镜头、声音等（图/视频/音频缩略）。
 * 入口：画布顶栏（设置左侧）/ 命令面板 / 素材库内切换。
 */
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Trash2,
  RotateCcw,
  Loader2,
  Volume2,
  Film,
  Image as ImageIcon,
  User,
  Shirt,
  MapPin,
  Camera,
  Smile,
  Anchor,
  FolderOpen,
} from 'lucide-react';
import type { AssetTrashEntry, AssetTrashKind } from '@nx9/shared';
import {
  ASSET_KIND_MENTION_PREFIX,
  ASSET_LIBRARY_TABS,
  characterToItem,
  daysRemainingInTrash,
  filterTrashedAssets,
  soundToItem,
  templateToAsset,
  workspaceItemToAsset,
} from '@nx9/shared';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { usePublicAssetLibrary } from '../stores/public-asset-library';
import { useFlowRuntime } from '../stores/flow-runtime';
import { toastSuccess, toastError } from '../stores/toast';
import { confirmDelete } from '../stores/confirm-dialog';

type KindFilter = 'all' | AssetTrashKind;

const KIND_FILTERS: { id: KindFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'picture', label: '图片' },
  { id: 'video', label: '视频' },
  { id: 'screenplay', label: '剧本' },
  ...ASSET_LIBRARY_TABS.map((t) => ({ id: t.key as AssetTrashKind, label: t.label })),
];

const KIND_ICONS: Record<AssetTrashKind, typeof User> = {
  character: User,
  costume: Shirt,
  scene: MapPin,
  shot: Camera,
  emotion: Smile,
  hook: Anchor,
  sound: Volume2,
  picture: ImageIcon,
  video: Film,
  screenplay: FolderOpen,
};

const KIND_LABEL: Record<AssetTrashKind, string> = {
  ...ASSET_KIND_MENTION_PREFIX,
  picture: '图片',
  video: '视频',
  screenplay: '剧本',
};

function formatTime(ts: number) {
  const now = Date.now();
  const days = Math.floor((now - ts) / 86400000);
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  return new Date(ts).toLocaleDateString();
}

function TrashMediaThumb({ entry }: { entry: AssetTrashEntry }) {
  const Icon = KIND_ICONS[entry.kind] ?? ImageIcon;

  if (entry.imageUrl) {
    return (
      <img
        src={entry.imageUrl}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
      />
    );
  }

  if (entry.videoUrl) {
    return (
      <>
        <video
          src={entry.videoUrl}
          className="absolute inset-0 h-full w-full object-cover"
          muted
          preload="metadata"
          playsInline
        />
        <span className="absolute inset-0 grid place-items-center bg-black/25">
          <Film size={22} className="text-white drop-shadow" />
        </span>
      </>
    );
  }

  if (entry.audioUrl) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-brand/15 to-surface">
        <Volume2 size={22} className="text-brand/70" />
        <span className="text-[8px] text-ink/40">音频</span>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-surface/80">
      <Icon size={22} className="text-ink/25" />
      <span className="text-[8px] text-ink/30">{KIND_LABEL[entry.kind]}</span>
    </div>
  );
}

export const AssetTrashPanel = memo(function AssetTrashPanel({
  defaultScope = 'private',
  variant = 'embedded',
}: {
  defaultScope?: 'private' | 'public' | 'all';
  /** modal：独立弹层内嵌；embedded：素材库内切换 */
  variant?: 'modal' | 'embedded';
}) {
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [scopeFilter, setScopeFilter] = useState<'private' | 'public' | 'all'>(defaultScope);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [purging, setPurging] = useState<string | null>(null);
  const [cleanupCount, setCleanupCount] = useState<number | null>(null);

  const characters = useWorkspaceDocument((s) => s.characters.characters);
  const sounds = useWorkspaceDocument((s) => s.soundLibrary.sounds);
  const backlotWorkspace = useWorkspaceDocument((s) => s.backlotWorkspace.items);
  const backlotCustom = useWorkspaceDocument((s) => s.backlotCustom.items);
  const mediaTrash = useWorkspaceDocument((s) => s.mediaTrash);
  const scriptDeskTrash = useWorkspaceDocument((s) => s.scriptDeskTrash);
  const restoreCharacter = useWorkspaceDocument((s) => s.restoreCharacter);
  const purgeCharacter = useWorkspaceDocument((s) => s.purgeCharacter);
  const restoreSound = useWorkspaceDocument((s) => s.restoreSound);
  const purgeSound = useWorkspaceDocument((s) => s.purgeSound);
  const restoreBacklotWorkspace = useWorkspaceDocument((s) => s.restoreBacklotWorkspace);
  const purgeBacklotWorkspace = useWorkspaceDocument((s) => s.purgeBacklotWorkspace);
  const restoreBacklotCustom = useWorkspaceDocument((s) => s.restoreBacklotCustom);
  const purgeBacklotCustom = useWorkspaceDocument((s) => s.purgeBacklotCustom);
  const takeMediaTrashItem = useWorkspaceDocument((s) => s.takeMediaTrashItem);
  const purgeMediaTrash = useWorkspaceDocument((s) => s.purgeMediaTrash);
  const restoreScriptDeskTrashToDrafts = useWorkspaceDocument((s) => s.restoreScriptDeskTrashToDrafts);
  const purgeScriptDeskTrash = useWorkspaceDocument((s) => s.purgeScriptDeskTrash);
  const purgeExpiredPrivate = useWorkspaceDocument((s) => s.purgeExpiredTrashedAssets);

  const publicPayload = usePublicAssetLibrary((s) => s.payload);
  const publicRestoreCharacter = usePublicAssetLibrary((s) => s.restoreCharacter);
  const publicPurgeCharacter = usePublicAssetLibrary((s) => s.purgeCharacter);
  const publicRestoreSound = usePublicAssetLibrary((s) => s.restoreSound);
  const publicPurgeSound = usePublicAssetLibrary((s) => s.purgeSound);
  const publicRestoreTemplate = usePublicAssetLibrary((s) => s.restoreTemplate);
  const publicPurgeTemplate = usePublicAssetLibrary((s) => s.purgeTemplate);
  const purgeExpiredPublic = usePublicAssetLibrary((s) => s.purgeExpiredTrashedAssets);

  useEffect(() => {
    const n = purgeExpiredPrivate() + purgeExpiredPublic();
    if (n > 0) setCleanupCount(n);
  }, [purgeExpiredPrivate, purgeExpiredPublic]);

  const items = useMemo(() => {
    const out: AssetTrashEntry[] = [];

    for (const c of filterTrashedAssets(characters)) {
      const item = characterToItem(c, 'private');
      out.push({
        id: c.id,
        kind: 'character',
        scope: 'private',
        label: item.label,
        deletedAt: c.deletedAt!,
        imageUrl: item.imageUrl,
        audioUrl: item.audioUrl,
      });
    }
    for (const s of filterTrashedAssets(sounds)) {
      const item = soundToItem(s, 'private');
      out.push({
        id: s.id,
        kind: 'sound',
        scope: 'private',
        label: item.label,
        deletedAt: s.deletedAt!,
        audioUrl: item.audioUrl,
      });
    }
    for (const ws of filterTrashedAssets(backlotWorkspace)) {
      const item = workspaceItemToAsset(ws, 'private');
      const creative = (ws.creative ?? {}) as { videoUrl?: string | null };
      out.push({
        id: ws.id,
        kind: item.kind as AssetTrashKind,
        scope: 'private',
        label: item.label,
        deletedAt: ws.deletedAt!,
        imageUrl: item.imageUrl,
        videoUrl: creative.videoUrl ?? undefined,
      });
    }
    for (const tpl of filterTrashedAssets(backlotCustom)) {
      const item = templateToAsset(tpl, 'private');
      out.push({
        id: tpl.id,
        kind: item.kind as AssetTrashKind,
        scope: 'private',
        label: item.label,
        deletedAt: tpl.deletedAt!,
      });
    }

    for (const m of filterTrashedAssets(mediaTrash)) {
      out.push({
        id: m.id,
        kind: m.mediaKind,
        scope: 'private',
        label: m.label,
        deletedAt: m.deletedAt,
        imageUrl: m.mediaKind === 'picture' ? m.url : undefined,
        videoUrl: m.mediaKind === 'video' ? m.url : undefined,
        sourceBlockId: m.sourceBlockId,
      });
    }

    for (const sd of filterTrashedAssets(scriptDeskTrash)) {
      out.push({
        id: sd.id,
        kind: 'screenplay',
        scope: 'private',
        label: `${sd.title} · ${sd.episodeCount} 集`,
        deletedAt: sd.deletedAt!,
        sourceBlockId: sd.sourceBlockId,
      });
    }

    for (const c of filterTrashedAssets(publicPayload.characters)) {
      const item = characterToItem(c, 'public');
      out.push({
        id: c.id,
        kind: 'character',
        scope: 'public',
        label: item.label,
        deletedAt: c.deletedAt!,
        imageUrl: item.imageUrl,
        audioUrl: item.audioUrl,
      });
    }
    for (const s of filterTrashedAssets(publicPayload.sounds)) {
      const item = soundToItem(s, 'public');
      out.push({
        id: s.id,
        kind: 'sound',
        scope: 'public',
        label: item.label,
        deletedAt: s.deletedAt!,
        audioUrl: item.audioUrl,
      });
    }
    for (const tpl of filterTrashedAssets(publicPayload.templates)) {
      const item = templateToAsset(tpl, 'public');
      out.push({
        id: tpl.id,
        kind: item.kind as AssetTrashKind,
        scope: 'public',
        label: item.label,
        deletedAt: tpl.deletedAt!,
      });
    }

    return out
      .filter((e) => (scopeFilter === 'all' ? true : e.scope === scopeFilter))
      .filter((e) => (kindFilter === 'all' ? true : e.kind === kindFilter))
      .sort((a, b) => b.deletedAt - a.deletedAt);
  }, [
    characters,
    sounds,
    backlotWorkspace,
    backlotCustom,
    mediaTrash,
    scriptDeskTrash,
    publicPayload,
    scopeFilter,
    kindFilter,
  ]);

  const handleRestore = useCallback(
    (entry: AssetTrashEntry) => {
      setRestoring(`${entry.scope}:${entry.id}`);
      try {
        let conflict = false;
        if (entry.kind === 'picture' || entry.kind === 'video') {
          const taken = takeMediaTrashItem(entry.id);
          if (!taken) throw new Error('回收站项不存在');
          const runtime = useFlowRuntime.getState().runtime;
          const blockId = taken.sourceBlockId;
          const node = runtime && blockId ? runtime.getNodes().find((n) => n.id === blockId) : undefined;
          if (runtime && blockId && node) {
            const data = (node.data ?? {}) as Record<string, unknown>;
            if (taken.mediaKind === 'picture') {
              const urls = Array.isArray(data.previewUrls)
                ? (data.previewUrls as string[]).filter(Boolean)
                : [];
              const next = urls.includes(taken.url) ? urls : [...urls, taken.url];
              runtime.updateNodeData(blockId, {
                previewUrls: next,
                previewUrl: next[0] ?? taken.url,
              });
            } else {
              runtime.updateNodeData(blockId, {
                videoUrl: taken.url,
                previewUrl: taken.url,
              });
            }
            toastSuccess(`已恢复「${entry.label}」到原节点`);
          } else {
            // 原节点不在：写入私有镜头库，避免媒体丢失
            useWorkspaceDocument.getState().upsertBacklotWorkspace({
              id: `restored-${taken.id}`,
              kind: taken.mediaKind === 'picture' ? 'costume' : 'shot',
              label: taken.label,
              promptEn: taken.label,
              promptZh: '从生成结果回收站恢复',
              creative:
                taken.mediaKind === 'picture'
                  ? { sheetUrl: taken.url, description: '生成结果恢复' }
                  : { gifUrl: taken.url, purpose: '生成结果恢复' },
            });
            toastSuccess(
              taken.mediaKind === 'picture'
                ? `已恢复「${entry.label}」到服装素材`
                : `已恢复「${entry.label}」到镜头素材`,
            );
          }
        } else if (entry.kind === 'screenplay') {
          const restored = restoreScriptDeskTrashToDrafts(entry.id);
          if (!restored) throw new Error('剧本回收站项不存在');
          toastSuccess(`已恢复「${restored.title}」到编剧台草稿箱`);
        } else if (entry.scope === 'private') {
          if (entry.kind === 'character') {
            conflict = restoreCharacter(entry.id).conflictRenamed;
          } else if (entry.kind === 'sound') {
            conflict = restoreSound(entry.id).conflictRenamed;
          } else if (backlotCustom.some((t) => t.id === entry.id && t.deletedAt != null)) {
            conflict = restoreBacklotCustom(entry.id).conflictRenamed;
          } else {
            conflict = restoreBacklotWorkspace(entry.id).conflictRenamed;
          }
          toastSuccess(conflict ? `已恢复「${entry.label}」（id 冲突已重命名）` : `已恢复「${entry.label}」`);
        } else if (entry.kind === 'character') {
          conflict = publicRestoreCharacter(entry.id).conflictRenamed;
          toastSuccess(conflict ? `已恢复「${entry.label}」（id 冲突已重命名）` : `已恢复「${entry.label}」`);
        } else if (entry.kind === 'sound') {
          conflict = publicRestoreSound(entry.id).conflictRenamed;
          toastSuccess(conflict ? `已恢复「${entry.label}」（id 冲突已重命名）` : `已恢复「${entry.label}」`);
        } else {
          conflict = publicRestoreTemplate(entry.id).conflictRenamed;
          toastSuccess(conflict ? `已恢复「${entry.label}」（id 冲突已重命名）` : `已恢复「${entry.label}」`);
        }
      } catch (err) {
        toastError(err instanceof Error ? err.message : '恢复失败');
      } finally {
        setRestoring(null);
      }
    },
    [
      takeMediaTrashItem,
      restoreScriptDeskTrashToDrafts,
      restoreCharacter,
      restoreSound,
      restoreBacklotCustom,
      restoreBacklotWorkspace,
      publicRestoreCharacter,
      publicRestoreSound,
      publicRestoreTemplate,
      backlotCustom,
    ],
  );

  const purgeOne = useCallback(
    (entry: AssetTrashEntry) => {
      if (entry.kind === 'picture' || entry.kind === 'video') {
        purgeMediaTrash(entry.id);
        return;
      }
      if (entry.kind === 'screenplay') {
        purgeScriptDeskTrash(entry.id);
        return;
      }
      if (entry.scope === 'private') {
        if (entry.kind === 'character') purgeCharacter(entry.id);
        else if (entry.kind === 'sound') purgeSound(entry.id);
        else if (backlotCustom.some((t) => t.id === entry.id)) purgeBacklotCustom(entry.id);
        else purgeBacklotWorkspace(entry.id);
      } else if (entry.kind === 'character') {
        publicPurgeCharacter(entry.id);
      } else if (entry.kind === 'sound') {
        publicPurgeSound(entry.id);
      } else {
        publicPurgeTemplate(entry.id);
      }
    },
    [
      purgeMediaTrash,
      purgeScriptDeskTrash,
      purgeCharacter,
      purgeSound,
      purgeBacklotCustom,
      purgeBacklotWorkspace,
      publicPurgeCharacter,
      publicPurgeSound,
      publicPurgeTemplate,
      backlotCustom,
    ],
  );

  const handlePurge = useCallback(
    async (entry: AssetTrashEntry) => {
      const ok = await confirmDelete({
        title: `彻底删除「${entry.label}」？`,
        description: '彻底删除后不可恢复，请确认。',
      });
      if (!ok) return;
      setPurging(`${entry.scope}:${entry.id}`);
      try {
        purgeOne(entry);
        toastSuccess('已彻底删除');
      } catch (err) {
        toastError(err instanceof Error ? err.message : '删除失败');
      } finally {
        setPurging(null);
      }
    },
    [purgeOne],
  );

  const handlePurgeAll = useCallback(async () => {
    if (items.length === 0) return;
    const ok = await confirmDelete({
      title: `将彻底删除 ${items.length} 项资产？`,
      description: '全部彻底删除后不可恢复，请确认。',
    });
    if (!ok) return;
    for (const entry of [...items]) {
      purgeOne(entry);
    }
    toastSuccess('回收站已清空');
  }, [items, purgeOne]);

  const showTitle = variant === 'embedded';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {showTitle ? (
          <h2 className="text-sm font-semibold text-ink flex items-center gap-1.5">
            <Trash2 size={14} className="text-warn" />
            资产回收站
          </h2>
        ) : (
          <p className="text-[10px] text-ink/40">
            {items.length > 0 ? `${items.length} 项可恢复` : '暂无已删素材'}
          </p>
        )}
        {items.length > 0 && (
          <button
            type="button"
            onClick={() => void handlePurgeAll()}
            className="text-[9px] text-ink/40 hover:text-red-600 underline"
          >
            清空回收站
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {(['private', 'public', 'all'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScopeFilter(s)}
            className={`rounded-full px-2 py-0.5 text-[9px] border ${
              scopeFilter === s
                ? 'border-brand/40 bg-brand/10 text-brand'
                : 'border-line/40 text-ink/45 hover:bg-surface'
            }`}
          >
            {s === 'private' ? '私有' : s === 'public' ? '公共' : '全部库'}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1">
        {KIND_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setKindFilter(f.id)}
            className={`rounded-full px-2 py-0.5 text-[9px] border ${
              kindFilter === f.id
                ? 'border-brand/40 bg-brand/10 text-brand'
                : 'border-line/40 text-ink/45 hover:bg-surface'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {cleanupCount !== null && cleanupCount > 0 && (
        <div className="px-3 py-1.5 text-[9px] text-ink/40 bg-surface/50 rounded">
          已自动清理 {cleanupCount} 个过期资产
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border border-line/40 bg-surface/20 p-10 text-center">
          <Trash2 size={28} className="mx-auto text-ink/20 mb-2" />
          <p className="text-[11px] text-ink/40">回收站为空</p>
          <p className="text-[9px] text-ink/30 mt-1">
            删除的图片 / 视频 / 声音 / 角色等素材将以宫格显示于此，30 天后自动清理
          </p>
        </div>
      ) : (
        <div className="max-h-[min(560px,60vh)] overflow-y-auto nx9-scroll">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {items.map((item) => {
              const key = `${item.scope}:${item.id}`;
              const busy = restoring === key || purging === key;
              return (
                <div
                  key={key}
                  className="group relative overflow-hidden rounded-xl border border-line/40 bg-surface/30"
                >
                  <div className="relative aspect-square bg-surface">
                    <TrashMediaThumb entry={item} />
                    <div className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/45 px-1.5 py-0.5 text-[8px] text-white/90">
                      {KIND_LABEL[item.kind]}
                    </div>
                    <div className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-black/45 px-1.5 py-0.5 text-[8px] text-white/80">
                      剩 {daysRemainingInTrash(item.deletedAt)} 天
                    </div>
                    <div
                      className={`absolute inset-x-0 bottom-0 flex gap-1 p-1.5 bg-gradient-to-t from-black/70 to-transparent transition-opacity ${
                        busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRestore(item)}
                        className="pointer-events-auto flex flex-1 items-center justify-center gap-0.5 rounded-md bg-ok/90 px-1.5 py-1 text-[9px] font-medium text-white hover:bg-ok disabled:opacity-50"
                      >
                        {restoring === key ? (
                          <Loader2 size={10} className="animate-spin" />
                        ) : (
                          <RotateCcw size={10} />
                        )}
                        恢复
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handlePurge(item)}
                        className="pointer-events-auto flex flex-1 items-center justify-center gap-0.5 rounded-md bg-red-600/90 px-1.5 py-1 text-[9px] font-medium text-white hover:bg-red-600 disabled:opacity-50"
                      >
                        {purging === key ? (
                          <Loader2 size={10} className="animate-spin" />
                        ) : (
                          <Trash2 size={10} />
                        )}
                        删除
                      </button>
                    </div>
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="truncate text-[11px] font-medium text-ink" title={item.label}>
                      {item.label}
                    </p>
                    <p className="truncate text-[8px] text-ink/35">
                      {item.scope === 'private' ? '私有' : '公共'} · {formatTime(item.deletedAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[8px] text-ink/25 text-center pt-3 pb-1">
            资产在回收站保留 30 天，到期自动清理
          </p>
        </div>
      )}
    </div>
  );
});
