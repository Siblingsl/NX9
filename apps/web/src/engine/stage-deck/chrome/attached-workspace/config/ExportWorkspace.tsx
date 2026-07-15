import { useCallback, useMemo } from 'react';
import {
  activeEpisodeShots,
  resolveActiveEpisodeId,
  type EpisodeExportRecord,
} from '@nx9/shared';
import { ComposerWorkspaceShell } from '../composer/ComposerWorkspaceShell';
import { useAttachedNodeData } from '../generation/use-attached-node-data';
import { useDeckUi } from '../../../stores/deck-ui';
import { useFlowRuntime } from '../../../../../stores/flow-runtime';
import { useWorkspaceDocument } from '../../../../../stores/workspace-document';
import { simpleConcatExport } from '../../../../core-pipeline-runner';

export interface ExportWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

export function ExportWorkspace({ blockId, kind, onCollapse }: ExportWorkspaceProps) {
  const data = useAttachedNodeData(blockId);
  const runtime = useFlowRuntime((state) => state.runtime);
  const storyboard = useWorkspaceDocument((state) => state.storyboard);
  const shots = useMemo(() => activeEpisodeShots(storyboard), [storyboard]);
  const collapsePromptBar = useDeckUi((state) => state.collapsePromptBar);
  const status = (data.status as string | undefined) ?? 'idle';
  const episodeUrl = data.episodeUrl as string | undefined;
  const activeEpisodeId = resolveActiveEpisodeId(storyboard);
  const exportHistory = useMemo(() => {
    const history = Array.isArray(data.exportHistory)
      ? data.exportHistory as EpisodeExportRecord[]
      : [];
    return [...history].sort((a, b) => {
      const aCurrent = a.episodeId === activeEpisodeId ? 1 : 0;
      const bCurrent = b.episodeId === activeEpisodeId ? 1 : 0;
      return bCurrent - aCurrent || b.createdAt.localeCompare(a.createdAt);
    });
  }, [activeEpisodeId, data.exportHistory]);
  const missingVideos = shots.filter((shot) => !shot.videoAssetId).length;
  const unapprovedVideos = shots.filter(
    (shot) => shot.videoAssetId && shot.videoStatus !== 'approved',
  ).length;
  const totalDuration = shots.reduce((sum, shot) => sum + Math.max(0, shot.durationSec), 0);

  const patch = useCallback((next: Record<string, unknown>) => {
    runtime?.updateNodeData(blockId, next);
  }, [blockId, runtime]);

  const collapse = useCallback(() => {
    collapsePromptBar();
    onCollapse?.();
  }, [collapsePromptBar, onCollapse]);

  return (
    <ComposerWorkspaceShell
      kind={kind}
      status={status as any}
      onCollapse={collapse}
      showAi={false}
      showAdvanced={false}
      showHistory={false}
      onRun={() => void simpleConcatExport()}
      running={status === 'running'}
      runLabel="简单拼接并导出 MP4"
      runDisabled={shots.length === 0 || missingVideos > 0 || unapprovedVideos > 0 || status === 'running'}
      heightClass="h-[min(500px,58vh)] max-h-[540px]"
      bodyClassName="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 nowheel overscroll-contain"
    >
      <div className="space-y-2.5 text-[10px]">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-surface/50 p-2"><p className="text-ink/35">当前集镜头</p><p className="mt-0.5 text-sm font-medium text-ink">{shots.length}</p></div>
          <div className="rounded-lg bg-surface/50 p-2"><p className="text-ink/35">总时长</p><p className="mt-0.5 text-sm font-medium text-ink">{totalDuration.toFixed(0)}s</p></div>
          <div className="rounded-lg bg-surface/50 p-2"><p className="text-ink/35">输出</p><p className="mt-0.5 text-sm font-medium text-ink">MP4</p></div>
        </div>
        <label className="block space-y-1">
          <span className="text-ink/45">文件名</span>
          <input
            value={(data.exportPrefix as string | undefined) ?? storyboard.title ?? ''}
            onChange={(event) => patch({ exportPrefix: event.target.value })}
            className="w-full rounded-lg border border-line/50 px-2 py-1.5 text-[11px]"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-ink/45">混音音频 URL（可空）</span>
          <input
            value={(data.episodeAudioUrl as string | undefined) ?? ''}
            onChange={(event) => patch({ episodeAudioUrl: event.target.value })}
            placeholder="保留原视频音轨"
            className="w-full rounded-lg border border-line/50 px-2 py-1.5 text-[11px]"
          />
        </label>
        {(missingVideos > 0 || unapprovedVideos > 0) && (
          <div className="rounded-lg border border-warn/20 bg-warn/5 p-2 text-warn">
            {missingVideos > 0 ? `还有 ${missingVideos} 镜未生成视频。` : ''}
            {unapprovedVideos > 0 ? `还有 ${unapprovedVideos} 镜视频未采用。` : ''}
          </div>
        )}
        {episodeUrl && (
          <div className="space-y-2">
            <video src={episodeUrl} controls className="max-h-40 w-full rounded-lg bg-black" />
            <a
              href={episodeUrl}
              download={`${(data.exportPrefix as string | undefined) || storyboard.title || 'nx9-episode'}.mp4`}
              className="block w-full rounded-lg border border-brand/25 py-1.5 text-center text-[11px] text-brand"
            >
              下载 MP4
            </a>
          </div>
        )}
        {exportHistory.length > 0 && (
          <div className="rounded-lg border border-line/40 bg-surface/20 p-2">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="font-medium text-ink/65">导出历史</p>
              <span className="text-[9px] text-ink/35">保留最近 {exportHistory.length} 次</span>
            </div>
            <div className="max-h-36 space-y-1 overflow-y-auto nx9-scroll">
              {exportHistory.map((record) => (
                <div key={record.id} className="flex items-center gap-2 rounded-md bg-white p-1.5">
                  <button
                    type="button"
                    onClick={() => patch({ episodeUrl: record.url })}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-[9px] text-ink/65">{record.fileName}</p>
                    <p className="text-[8px] text-ink/35">
                      {record.episodeTitle || record.episodeId || '单集'} · {record.shotCount} 镜 · {record.durationSec.toFixed(0)}s · {new Date(record.createdAt).toLocaleString()}
                    </p>
                  </button>
                  {record.episodeId === activeEpisodeId && (
                    <span className="rounded bg-brand/10 px-1 py-0.5 text-[8px] text-brand">当前集</span>
                  )}
                  <a
                    href={record.url}
                    download={record.fileName}
                    className="rounded border border-brand/20 px-1.5 py-1 text-[8px] text-brand"
                  >下载</a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ComposerWorkspaceShell>
  );
}
