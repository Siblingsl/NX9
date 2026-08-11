import { memo, useCallback, useMemo } from 'react';
import { Box, FileText, ImageIcon, Loader2, Maximize2, Music, Play, Video } from 'lucide-react';
import {
  lookupBlock,
  mediaPinKindLabel,
  normalizeNodeStatus,
  resolveMediaPinKind,
  resolveNodeAssetTags,
  resolveNodeOutputCount,
  resolveNodePromptText,
  resolveNodeThumbUrl,
  truncatePromptPreview,
  type MediaPinKind,
  type NodeRunStatus,
} from '@nx9/shared';
import { useDeckUi } from '../../engine/stage-deck/stores/deck-ui';
import { NodeSummaryBody } from './NodeSummaryBody';
import '../core/picture-gen.css';
import '../utility/media-pin.css';

const STATUS_LABEL: Record<NodeRunStatus, string> = {
  idle: '待配置',
  ready: '就绪',
  running: '生成中',
  success: '完成',
  error: '失败',
  waiting: '等待',
  disabled: '停用',
};

export interface CanvasNodeBodyProps {
  blockId: string;
  kind: string;
  data: Record<string, unknown>;
  alias?: string;
  onRun?: () => void;
  /** 点击预览打开（画布钉板等） */
  onPreviewOpen?: () => void;
  compact?: boolean;
  canOpenWorkspace?: boolean;
}

/** 画布钉板：按媒体类型展示，无说明/状态脚/运行按钮 */
function MediaPinOnlyBody({
  url,
  pinKind,
  label,
  textContent,
  onOpen,
}: {
  url: string;
  pinKind: MediaPinKind;
  label?: string;
  textContent?: string;
  onOpen?: () => void;
}) {
  const kindLabel = mediaPinKindLabel(pinKind);
  const title =
    pinKind === 'picture'
      ? url
        ? '点击放大 · 裁剪 / 本地清晰度'
        : undefined
      : url || textContent
        ? `点击预览 · ${kindLabel}`
        : undefined;
  const canOpen = Boolean(url || textContent);

  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canOpen) onOpen?.();
  };

  return (
    <div className="nx9-media-pin nodrag nopan">
      {pinKind === 'sound' && url ? (
        <div className="nx9-media-pin__frame nx9-media-pin__frame--static" onMouseDown={(e) => e.stopPropagation()}>
          <div className="nx9-media-pin__badge">
            <button type="button" className="nx9-media-pin__icon-hit" onClick={open} title={title}>
              <Music size={22} strokeWidth={1.4} />
              <span>{label || kindLabel}</span>
            </button>
            <audio
              src={url}
              preload="metadata"
              className="nx9-media-pin__audio"
              controls
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="nx9-media-pin__frame"
          onClick={open}
          onMouseDown={(e) => e.stopPropagation()}
          title={title}
          disabled={!canOpen}
        >
          {pinKind === 'picture' && url ? (
            <img src={url} alt="" className="nx9-media-pin__img" draggable={false} />
          ) : pinKind === 'clip' && url ? (
            <video
              src={url}
              muted
              playsInline
              preload="metadata"
              className="nx9-media-pin__img"
              draggable={false}
            />
          ) : pinKind === 'text' ? (
            <div className="nx9-media-pin__badge nx9-media-pin__badge--text">
              <FileText size={18} strokeWidth={1.4} />
              <span className="nx9-media-pin__text-preview">
                {(textContent || label || '文本').slice(0, 120)}
              </span>
            </div>
          ) : pinKind === 'mesh' && url ? (
            <div className="nx9-media-pin__badge">
              <Box size={22} strokeWidth={1.4} />
              <span>{label || kindLabel}</span>
            </div>
          ) : (
            <div className="nx9-media-pin__empty">暂无{kindLabel}</div>
          )}
        </button>
      )}
    </div>
  );
}

/** 图像生成卡：仅展示图片（1 张铺满 / 多张宫格） */
function PictureOnlyBody({
  urls,
  status,
  canOpenWorkspace,
  onOpen,
}: {
  urls: string[];
  status: NodeRunStatus;
  canOpenWorkspace: boolean;
  onOpen: (e?: React.MouseEvent) => void;
}) {
  const n = urls.length;
  const show = urls.slice(0, 4);
  const gridClass =
    n <= 1
      ? 'pg-media-grid is-1'
      : n === 2
        ? 'pg-media-grid is-2'
        : n === 3
          ? 'pg-media-grid is-3'
          : 'pg-media-grid is-4';

  return (
    <div className="pg-only nodrag nopan">
      <div
        className="pg-only__frame"
        onDoubleClick={canOpenWorkspace ? onOpen : undefined}
        onClick={canOpenWorkspace ? onOpen : undefined}
        title={canOpenWorkspace ? '点击展开工作区' : undefined}
        role={canOpenWorkspace ? 'button' : undefined}
      >
        {status === 'running' && (
          <div className="pg-only__busy">
            <Loader2 size={18} className="animate-spin" />
          </div>
        )}

        {n === 0 ? (
          <div className="pg-only__empty">
            <ImageIcon size={22} strokeWidth={1.25} />
            <span>暂无图像</span>
          </div>
        ) : n === 1 ? (
          <img src={urls[0]} alt="" className="pg-only__img" draggable={false} />
        ) : (
          <div className={gridClass}>
            {show.map((url, i) => (
              <div key={`${url}-${i}`} className="pg-media-grid__cell">
                <img src={url} alt="" draggable={false} />
                {i === 3 && n > 4 && (
                  <span className="pg-media-grid__more">+{n - 3}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {n > 1 && (
          <span className="pg-only__count" aria-hidden>
            {n}
          </span>
        )}
      </div>
    </div>
  );
}

/** 视频生成卡：仅展示视频预览，参数与操作都在底部工作区 */
function VideoOnlyBody({
  videoUrl,
  posterUrl,
  status,
  canOpenWorkspace,
  onOpen,
}: {
  videoUrl?: string;
  posterUrl?: string;
  status: NodeRunStatus;
  canOpenWorkspace: boolean;
  onOpen: (e?: React.MouseEvent) => void;
}) {
  return (
    <div className="pg-only nodrag nopan">
      <div
        className="pg-only__frame"
        onDoubleClick={canOpenWorkspace ? onOpen : undefined}
        onClick={canOpenWorkspace ? onOpen : undefined}
        title={canOpenWorkspace ? '点击展开工作区' : undefined}
        role={canOpenWorkspace ? 'button' : undefined}
      >
        {status === 'running' && (
          <div className="pg-only__busy">
            <Loader2 size={18} className="animate-spin" />
          </div>
        )}

        {videoUrl ? (
          <video
            src={videoUrl}
            poster={posterUrl}
            muted
            playsInline
            preload="metadata"
            className="pg-only__img"
            draggable={false}
          />
        ) : posterUrl ? (
          <img src={posterUrl} alt="" className="pg-only__img" draggable={false} />
        ) : (
          <div className="pg-only__empty">
            <Video size={22} strokeWidth={1.25} />
            <span>暂无视频</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** 生成类节点摘要 — 走 NodeSummaryBody 统一骨架 */
export const CanvasNodeBody = memo(function CanvasNodeBody({
  kind,
  data,
  alias,
  onRun,
  onPreviewOpen,
  canOpenWorkspace = true,
}: CanvasNodeBodyProps) {
  const meta = lookupBlock(kind);
  const status = normalizeNodeStatus(data.status as string | undefined);
  const prompt = resolveNodePromptText(data);
  const promptPreview = truncatePromptPreview(prompt);
  const tags = resolveNodeAssetTags(data);
  const thumb = resolveNodeThumbUrl(data, kind);
  const videoUrl = kind === 'clip-gen' ? (data.videoUrl as string | undefined) : undefined;
  const outputCount = resolveNodeOutputCount(kind, data);
  const focusPromptBar = useDeckUi((s) => s.focusPromptBar);
  const configSummary =
    (data.model as string | undefined) ??
    (data.provider as string | undefined) ??
    (data.preset as string | undefined);

  const openWorkspace = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (canOpenWorkspace) focusPromptBar();
    },
    [canOpenWorkspace, focusPromptBar],
  );

  const isPicture = kind === 'picture-gen';
  const isVideo = kind === 'clip-gen';
  const isMediaPin = kind === 'media-pin';
  const pictureUrls = useMemo(() => {
    if (!isPicture) return [] as string[];
    const urls = (data.previewUrls as string[] | undefined) ?? [];
    if (urls.length > 0) return urls;
    const single = (data.previewUrl as string | undefined) ?? thumb;
    return single ? [single] : [];
  }, [isPicture, data.previewUrl, data.previewUrls, thumb]);

  /* 画布钉板：按媒体类型展示 */
  if (isMediaPin) {
    const pinUrl =
      (data.pinUrl as string | undefined) ||
      (data.previewUrl as string | undefined) ||
      (data.assetUrl as string | undefined) ||
      thumb ||
      '';
    const pinKind = resolveMediaPinKind(data.pinKind, pinUrl);
    return (
      <MediaPinOnlyBody
        url={pinUrl}
        pinKind={pinKind}
        label={(data.pinLabel as string | undefined) || (data.filename as string | undefined)}
        textContent={data.textContent as string | undefined}
        onOpen={onPreviewOpen}
      />
    );
  }

  /* 图像生成：卡片只展示图，参数与操作都在底部工作区 */
  if (isPicture) {
    return (
      <div className="pg pg-card">
        <PictureOnlyBody
          urls={pictureUrls}
          status={status}
          canOpenWorkspace={canOpenWorkspace}
          onOpen={openWorkspace}
        />
      </div>
    );
  }

  /* 视频生成：同图像生成，卡片只展示预览 */
  if (isVideo) {
    return (
      <div className="pg pg-card">
        <VideoOnlyBody
          videoUrl={videoUrl}
          posterUrl={thumb || undefined}
          status={status}
          canOpenWorkspace={canOpenWorkspace}
          onOpen={openWorkspace}
        />
      </div>
    );
  }

  const summary =
    promptPreview ||
    configSummary ||
    alias ||
    meta?.hint ||
    (thumb || videoUrl ? undefined : '点击展开编辑');

  const statusLabel =
    STATUS_LABEL[status] +
    (outputCount != null && outputCount > 0 ? ` · ${outputCount} 输出` : '');

  return (
    <NodeSummaryBody
      mediaUrl={thumb}
      mediaVideoUrl={videoUrl}
      emptyLabel={meta?.label ?? kind}
      onMediaDoubleClick={canOpenWorkspace ? openWorkspace : undefined}
      tags={tags.slice(0, 3).map((t) => t.label)}
      summary={summary}
      summaryClickable={canOpenWorkspace && Boolean(promptPreview || !thumb)}
      onSummaryClick={openWorkspace}
      statusLabel={statusLabel}
      secondary={
        canOpenWorkspace
          ? [
              {
                label: '展开',
                icon: <Maximize2 size={12} />,
                iconOnly: true,
                onClick: openWorkspace,
              },
            ]
          : []
      }
      primary={
        onRun && status !== 'running'
          ? {
              label: '运行',
              icon: <Play size={11} fill="currentColor" />,
              onClick: (e) => {
                e.stopPropagation();
                onRun();
              },
            }
          : undefined
      }
    />
  );
});
