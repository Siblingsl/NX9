import { useEffect, useMemo, useRef, useState } from 'react';
import type { StoryboardShot } from '@nx9/shared';
import { resolveStoryboardVideoVersions, resolveVideoStatusBadge } from '@nx9/shared';
import { Check, Film, RotateCcw, X } from 'lucide-react';
import { setMediaPinDragData } from '../../../../../media-pin-drag';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export interface VideoShotReviewGridProps {
  blockId: string;
  shots: StoryboardShot[];
  retryingShotId: string | null;
  onApproveAll: () => void;
  onApprove: (shot: StoryboardShot) => void;
  onAdoptVersion: (shot: StoryboardShot, versionId: string) => void;
  /** F-008: 打回必填原因 */
  onReject: (shotId: string, reason: string) => void;
  onRetry: (shotId: string) => void;
}

/** 上游镜头审片网格：画面为主，状态用颜色点表达，操作悬停浮现 */
export function VideoShotReviewGrid({
  blockId,
  shots,
  retryingShotId,
  onApproveAll,
  onApprove,
  onAdoptVersion,
  onReject,
  onRetry,
}: VideoShotReviewGridProps) {
  const [previewVersionIds, setPreviewVersionIds] = useState<Record<string, string>>({});
  const [rejectingShotId, setRejectingShotId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [versionPickerShotId, setVersionPickerShotId] = useState<string | null>(null);
  const [pendingOnly, setPendingOnly] = useState(false);
  const rejectInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (rejectingShotId) rejectInputRef.current?.focus();
  }, [rejectingShotId]);

  const generatedCount = useMemo(
    () => shots.filter((shot) => shot.videoAssetId).length,
    [shots],
  );
  const pendingCount = useMemo(
    () => shots.filter((shot) => resolveVideoStatusBadge(shot.videoStatus).tone === 'pending').length,
    [shots],
  );
  const visibleShots = useMemo(
    () =>
      pendingOnly
        ? shots.filter((shot) => resolveVideoStatusBadge(shot.videoStatus).tone === 'pending')
        : shots,
    [shots, pendingOnly],
  );

  const closeReject = () => {
    setRejectingShotId(null);
    setRejectReason('');
  };

  const confirmReject = (shotId: string) => {
    if (!rejectReason.trim()) return;
    onReject(shotId, rejectReason.trim());
    closeReject();
  };

  return (
    <div className="border-b border-line/25 px-3 py-2 nodrag nopan" onMouseDown={stop}>
      <div className="mb-1.5 flex items-center gap-2">
        <p className="text-[10px] font-medium text-ink/65">
          上游 {shots.length} 镜 · 已生成 <span className="tabular-nums">{generatedCount}</span>
        </p>
        {pendingCount > 0 && (
          <button
            type="button"
            onClick={() => setPendingOnly((v) => !v)}
            className={`rounded-full px-1.5 py-0.5 text-[9px] transition-colors ${
              pendingOnly
                ? 'bg-brand/15 text-brand'
                : 'bg-ink/8 text-ink/45 hover:text-ink/65'
            }`}
            title={pendingOnly ? '显示全部镜头' : '只看待审核'}
          >
            待审核 {pendingCount}
          </button>
        )}
        <span className="text-[9px] text-ink/28">拖出钉板</span>
        <button
          type="button"
          disabled={shots.some((shot) => !shot.videoAssetId)}
          onClick={onApproveAll}
          className="ml-auto rounded-md bg-ok/10 px-2 py-0.5 text-[9px] text-ok disabled:opacity-35"
        >
          {/* F-008: 全部批准 */}
          全部批准
        </button>
      </div>
      <div className="max-h-56 overflow-y-auto nx9-scroll">
        <div className="grid grid-cols-4 gap-1.5">
          {visibleShots.map((shot) => {
            const versions = resolveStoryboardVideoVersions(shot);
            const defaultVersion =
              versions.find((version) => version.url === shot.videoAssetId) ?? versions.at(-1);
            const displayVersion =
              versions.find((version) => version.id === previewVersionIds[shot.id]) ?? defaultVersion;
            const badge = resolveVideoStatusBadge(shot.videoStatus);
            const dotClass =
              badge.tone === 'approved'
                ? 'bg-ok'
                : badge.tone === 'rejected'
                  ? 'bg-error'
                  : 'bg-ink/35';
            const pinUrl = displayVersion?.url || shot.videoAssetId;
            const rejecting = rejectingShotId === shot.id;
            const pickingVersion = versionPickerShotId === shot.id;
            const retrying = retryingShotId === shot.id;
            return (
              <div
                key={shot.id}
                draggable={Boolean(pinUrl)}
                onDragStart={(e) => {
                  if (!pinUrl || (e.target as HTMLElement).closest('button')) {
                    e.preventDefault();
                    return;
                  }
                  const el = e.currentTarget.querySelector('video,img');
                  setMediaPinDragData(
                    e.dataTransfer,
                    {
                      url: pinUrl,
                      source: 'generated',
                      label: `镜 ${shot.index + 1}`,
                      pinKind: 'clip',
                      sourceBlockId: blockId,
                    },
                    el as HTMLElement | null,
                  );
                }}
                title={shot.descriptionZh}
                className={`group relative aspect-video overflow-hidden rounded-lg border bg-black/15 ${
                  badge.tone === 'approved'
                    ? 'border-ok/40'
                    : badge.tone === 'rejected'
                      ? 'border-error/35'
                      : 'border-line/35'
                }${pinUrl ? ' cursor-grab active:cursor-grabbing' : ''}`}
              >
                {displayVersion?.url ? (
                  <video
                    src={displayVersion.url}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover pointer-events-none"
                  />
                ) : shot.firstFrameAssetId ? (
                  <img
                    src={shot.firstFrameAssetId}
                    alt=""
                    className="h-full w-full object-cover opacity-55 grayscale pointer-events-none"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Film size={14} className="text-ink/20" />
                  </div>
                )}

                <span className="pointer-events-none absolute left-1 top-1 text-[8px] font-medium text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
                  #{shot.index + 1}
                </span>
                {/* F-008: pending 灰 / approved 绿 / rejected 红 */}
                <span
                  className={`pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 rounded-full ring-2 ring-black/35 ${dotClass}`}
                  title={badge.label}
                />
                {versions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setVersionPickerShotId(pickingVersion ? null : shot.id)}
                    className="absolute bottom-1 right-1 rounded bg-ink/60 px-1 py-px text-[7px] font-medium text-white/85 hover:bg-ink/80"
                    title="切换版本"
                  >
                    V{versions.findIndex((v) => v.id === displayVersion?.id) + 1}/{versions.length}
                  </button>
                )}

                {/* 悬停浮现：描述 + 操作 */}
                {!rejecting && !pickingVersion && (
                  <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-ink/90 via-ink/55 to-transparent px-1.5 pb-1 pt-5 opacity-0 transition-opacity group-hover:opacity-100">
                    <p className="truncate text-[8px] leading-tight text-white/85">
                      {shot.descriptionZh}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={!shot.videoAssetId || shot.videoStatus === 'approved'}
                        onClick={() => {
                          if (displayVersion && displayVersion.url !== shot.videoAssetId) {
                            onAdoptVersion(shot, displayVersion.id);
                          } else {
                            onApprove(shot);
                          }
                        }}
                        className="rounded-md bg-white/12 p-1 text-white/80 hover:bg-ok/85 hover:text-white disabled:opacity-30"
                        title="批准"
                      >
                        <Check size={10} />
                      </button>
                      <button
                        type="button"
                        disabled={!shot.videoAssetId}
                        onClick={() => {
                          setVersionPickerShotId(null);
                          setRejectingShotId(shot.id);
                        }}
                        className="rounded-md bg-white/12 p-1 text-white/80 hover:bg-error/85 hover:text-white disabled:opacity-30"
                        title="打回"
                      >
                        <X size={10} />
                      </button>
                      <button
                        type="button"
                        disabled={retrying || shot.keyframeStatus !== 'approved'}
                        onClick={() => onRetry(shot.id)}
                        className="rounded-md bg-white/12 p-1 text-white/80 hover:bg-brand/85 hover:text-white disabled:opacity-30"
                        title={retrying ? '生成中…' : '重生成'}
                      >
                        <RotateCcw size={10} className={retrying ? 'animate-spin' : undefined} />
                      </button>
                    </div>
                  </div>
                )}

                {/* F-008: 打回原因（必填）气泡 */}
                {rejecting && (
                  <div className="absolute inset-0 flex flex-col justify-center gap-1 bg-ink/85 px-1.5">
                    <input
                      ref={rejectInputRef}
                      type="text"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="打回原因（必填）…"
                      className="w-full rounded border border-white/20 bg-white/10 px-1.5 py-1 text-[9px] text-white placeholder:text-white/35 focus:outline-none focus:border-error/60"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmReject(shot.id);
                        if (e.key === 'Escape') closeReject();
                      }}
                    />
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={closeReject}
                        className="rounded px-1.5 py-0.5 text-[8px] text-white/55 hover:text-white/85"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        disabled={!rejectReason.trim()}
                        onClick={() => confirmReject(shot.id)}
                        className="rounded bg-error/85 px-1.5 py-0.5 text-[8px] font-medium text-white disabled:opacity-35"
                      >
                        打回
                      </button>
                    </div>
                  </div>
                )}

                {/* 版本切换气泡 */}
                {pickingVersion && (
                  <div className="absolute inset-0 flex flex-wrap content-center justify-center gap-1 overflow-y-auto bg-ink/85 p-1.5 nx9-scroll">
                    {versions.map((version, index) => (
                      <button
                        key={version.id}
                        type="button"
                        onClick={() => {
                          setPreviewVersionIds((current) => ({ ...current, [shot.id]: version.id }));
                          setVersionPickerShotId(null);
                        }}
                        title={
                          new Date(version.createdAt).getTime() > 0
                            ? new Date(version.createdAt).toLocaleString()
                            : '历史版本'
                        }
                        className={`rounded px-1.5 py-0.5 text-[8px] ${
                          displayVersion?.id === version.id
                            ? 'bg-brand text-white'
                            : version.status === 'adopted'
                              ? 'bg-ok/20 text-ok'
                              : 'bg-white/12 text-white/70 hover:bg-white/20'
                        }`}
                      >
                        V{index + 1}
                        {version.status === 'adopted' ? ' ✓' : ''}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setVersionPickerShotId(null)}
                      className="rounded px-1.5 py-0.5 text-[8px] text-white/50 hover:text-white/85"
                    >
                      关闭
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
