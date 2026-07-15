import { memo, useCallback } from 'react';
import { Play } from 'lucide-react';
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

const STATUS_DOT: Record<NodeRunStatus, string> = {
  idle: 'bg-ink/20',
  ready: 'bg-brand/60',
  running: 'bg-brand animate-pulse',
  success: 'bg-ok',
  error: 'bg-warn',
  waiting: 'bg-warn/70',
  disabled: 'bg-ink/15',
};

const STATUS_LABEL: Record<NodeRunStatus, string> = {
  idle: 'Idle',
  ready: 'Ready',
  running: 'Running',
  success: 'Success',
  error: 'Error',
  waiting: 'Waiting',
  disabled: 'Disabled',
};

const TAG_COLORS: Record<string, string> = {
  character: 'bg-violet-500/10 text-violet-700',
  scene: 'bg-emerald-500/10 text-emerald-700',
  shot: 'bg-sky-500/10 text-sky-700',
  emotion: 'bg-amber-500/10 text-amber-700',
  hook: 'bg-rose-500/10 text-rose-700',
  sound: 'bg-indigo-500/10 text-indigo-700',
  style: 'bg-orange-500/10 text-orange-700',
};

export interface CanvasNodeBodyProps {
  blockId: string;
  kind: string;
  data: Record<string, unknown>;
  alias?: string;
  onRun?: () => void;
  compact?: boolean;
}

export const CanvasNodeBody = memo(function CanvasNodeBody({
  blockId,
  kind,
  data,
  alias,
  onRun,
  compact = false,
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

  const handlePromptClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      focusPromptBar();
    },
    [focusPromptBar],
  );

  const handleRun = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRun?.();
    },
    [onRun],
  );

  return (
    <div className={`space-y-2 ${compact ? '' : 'min-h-[88px]'}`}>
      {configSummary && !promptPreview && (
        <p className="text-[11px] text-ink/70 truncate">
          <span className="text-ink/40">配置 · </span>
          {configSummary}
        </p>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 4).map((t) => (
            <span
              key={`${t.kind}-${t.label}`}
              className={`text-[9px] px-1.5 py-0.5 rounded-full truncate max-w-[88px] ${TAG_COLORS[t.kind] ?? 'bg-ink/5 text-ink/60'}`}
            >
              {t.label}
            </span>
          ))}
        </div>
      )}

      {promptPreview ? (
        <button
          type="button"
          onClick={handlePromptClick}
          className="w-full text-left text-[11px] text-ink/60 leading-snug hover:text-brand transition-colors line-clamp-2"
          title="在 Prompt Bar 中编辑"
        >
          <span className="text-ink/35">Prompt · </span>
          {promptPreview}
        </button>
      ) : !configSummary ? (
        <p className="text-[10px] text-ink/30 italic">点击在 Prompt Bar 编辑</p>
      ) : null}

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
          <span className="text-[9px] text-ink/40 truncate">{STATUS_LABEL[status]}</span>
          {outputCount != null && outputCount > 0 && (
            <span className="text-[9px] text-ink/35">· {outputCount} 输出</span>
          )}
        </div>
        {onRun && status !== 'running' && (
          <button
            type="button"
            onClick={handleRun}
            className="shrink-0 w-7 h-7 rounded-lg border border-line flex items-center justify-center hover:border-brand/50 hover:text-brand text-ink/50"
            title="运行"
          >
            <Play size={12} />
          </button>
        )}
      </div>

      {videoUrl ? (
        <div className="aspect-video rounded-lg overflow-hidden border border-line/60 bg-black">
          <video src={videoUrl} controls className="w-full h-full object-cover" playsInline />
        </div>
      ) : thumb && (
        <div className="aspect-video rounded-lg overflow-hidden border border-line/60 bg-surface">
          <img src={thumb} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      {!alias && meta?.hint && !thumb && !videoUrl && !promptPreview && (
        <p className="text-[9px] text-ink/30 line-clamp-2">{meta.hint}</p>
      )}
    </div>
  );
});
