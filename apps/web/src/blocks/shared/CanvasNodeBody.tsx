import { memo, useCallback, useMemo } from 'react';
import { ImageIcon, Loader2, Maximize2, Play } from 'lucide-react';
import {
  lookupBlock,
  normalizeNodeStatus,
  resolveNodeAssetTags,
  resolveNodeOutputCount,
  resolveNodePromptText,
  resolveNodeThumbUrl,
  truncatePromptPreview,
  type NodeRunStatus,
} from '@nx9/shared';
import { useDeckUi } from '../../engine/stage-deck/stores/deck-ui';
import { NodeSummaryBody } from './NodeSummaryBody';
import '../core/picture-gen.css';

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
  compact?: boolean;
  canOpenWorkspace?: boolean;
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

/** 生成类节点摘要 — 走 NodeSummaryBody 统一骨架 */
export const CanvasNodeBody = memo(function CanvasNodeBody({
  kind,
  data,
  alias,
  onRun,
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
  const pictureUrls = useMemo(() => {
    if (!isPicture) return [] as string[];
    const urls = (data.previewUrls as string[] | undefined) ?? [];
    if (urls.length > 0) return urls;
    const single = (data.previewUrl as string | undefined) ?? thumb;
    return single ? [single] : [];
  }, [isPicture, data.previewUrl, data.previewUrls, thumb]);

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
