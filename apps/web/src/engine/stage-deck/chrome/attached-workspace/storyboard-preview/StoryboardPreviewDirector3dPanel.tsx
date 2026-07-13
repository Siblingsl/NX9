import { Box, Globe2, Image as ImageIcon, Play, RefreshCw } from 'lucide-react';
import { normalizeDirectorProject } from '@nx9/director3d';
import type {
  StoryboardPreviewFrame,
  StoryboardPreviewPanorama720,
} from '@nx9/shared';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export interface StoryboardPreviewDirector3dPanelProps {
  frames: StoryboardPreviewFrame[];
  selectedFrameId?: string | null;
  panorama?: StoryboardPreviewPanorama720 | null;
  panoramaPrompt: string;
  directorData?: Record<string, unknown>;
  pictureConnected: boolean;
  directorConnected: boolean;
  generatingPanorama: boolean;
  onSelectFrame: (frameId: string | null) => void;
  onPanoramaPromptChange: (prompt: string) => void;
  onGeneratePanorama: () => void;
  onLoadPanorama: () => void;
  onOpenDirector3d: () => void;
}

/** 分镜预览内的 3D 调度区：环境生成、选帧、摆位入口与机位结果集中在这里。 */
export function StoryboardPreviewDirector3dPanel({
  frames,
  selectedFrameId,
  panorama,
  panoramaPrompt,
  directorData,
  pictureConnected,
  directorConnected,
  generatingPanorama,
  onSelectFrame,
  onPanoramaPromptChange,
  onGeneratePanorama,
  onLoadPanorama,
  onOpenDirector3d,
}: StoryboardPreviewDirector3dPanelProps) {
  const project = normalizeDirectorProject(directorData?.scene);
  const selectedFrame = frames.find((frame) => frame.id === selectedFrameId);
  const latestCapture =
    selectedFrame?.director3dGuide?.captureUrl ??
    (directorData?.lastCaptureUrl as string | undefined);
  const panoramaLoaded = Boolean(
    panorama?.imageUrl && project.panorama?.url === panorama.imageUrl,
  );
  const characterCount = project.objects.filter((object) => object.kind === 'character').length;

  return (
    <div className="p-3 space-y-3 nodrag nopan" onMouseDown={stop}>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-violet-500/10 text-violet-700 grid place-items-center">
          <Box size={15} />
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-ink">3D 导演</p>
          <p className="text-[9px] text-ink/40">全景环境 → 人物摆位 → 机位快照 → 正式出图</p>
        </div>
        <span
          className={`ml-auto text-[9px] px-1.5 py-0.5 rounded ${
            directorConnected ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'
          }`}
        >
          {directorConnected ? '3D 已就绪' : '请连接 3D 导演台'}
        </span>
      </div>

      <label className="flex items-center gap-2">
        <span className="text-[10px] text-ink/45 shrink-0">工作分镜</span>
        <select
          value={selectedFrameId ?? ''}
          onChange={(event) => onSelectFrame(event.target.value || null)}
          className="flex-1 min-w-0 rounded-lg border border-line/50 bg-white px-2 py-1 text-[11px] focus:outline-none focus:border-brand/40"
        >
          <option value="">仅搭建场景，不绑定分镜</option>
          {[...frames]
            .sort((a, b) => a.order - b.order)
            .map((frame) => (
              <option key={frame.id} value={frame.id} disabled={frame.locked}>
                {frame.label} · {frame.startSec.toFixed(0)}~{frame.endSec.toFixed(0)}s
                {frame.director3dGuide ? ' · 已有机位' : ''}
                {frame.locked ? ' · 已锁定' : ''}
              </option>
            ))}
        </select>
      </label>

      <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.035] overflow-hidden">
        <div className="flex items-center gap-2 px-2.5 py-2 border-b border-sky-500/15">
          <Globe2 size={13} className="text-sky-700" />
          <p className="text-[11px] font-medium text-sky-800">720° 全景环境</p>
          <span className="text-[9px] text-ink/35">标准 360×180 · 2:1</span>
          {panoramaLoaded && (
            <span className="ml-auto text-[9px] rounded bg-ok/10 text-ok px-1.5 py-0.5">
              已加载到 3D
            </span>
          )}
        </div>
        <div className="p-2.5 space-y-2">
          {panorama?.imageUrl && (
            <div className="aspect-[2/1] max-h-28 rounded-lg overflow-hidden border border-line/40 bg-[#12141a]">
              <img
                src={panorama.imageUrl}
                alt="720° 全景环境"
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <textarea
            value={panoramaPrompt}
            onChange={(event) => onPanoramaPromptChange(event.target.value)}
            placeholder="描述场景空间、时间、天气、材质和光线；人物将稍后在 3D 中放置…"
            rows={2}
            className="w-full rounded-lg border border-line/50 bg-white px-2.5 py-2 text-[11px] resize-none focus:outline-none focus:border-sky-500/40"
          />
          <div className="flex items-center gap-2">
            <p className="text-[9px] text-ink/35 flex-1">
              全景图只生成环境，不生成人物，避免人物被烘焙进背景。
            </p>
            {panorama?.imageUrl && (
              <button
                type="button"
                disabled={!directorConnected || panoramaLoaded}
                onClick={onLoadPanorama}
                className="px-2 py-1 rounded-lg border border-sky-500/25 text-sky-700 text-[10px] disabled:opacity-40"
              >
                {panoramaLoaded ? '已加载' : '加载到 3D'}
              </button>
            )}
            <button
              type="button"
              disabled={!pictureConnected || generatingPanorama || !panoramaPrompt.trim()}
              onClick={onGeneratePanorama}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-700 text-white text-[10px] disabled:opacity-40"
            >
              {generatingPanorama ? (
                <RefreshCw size={11} className="animate-spin" />
              ) : (
                <Globe2 size={11} />
              )}
              {panorama ? '重新生成全景' : '生成全景'}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.035] p-2.5">
        <div className="flex gap-3">
          <div className="w-28 shrink-0 aspect-video rounded-lg overflow-hidden border border-line/50 bg-[#12141a]">
            {latestCapture ? (
              <img src={latestCapture} alt="3D 机位快照" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full grid place-items-center text-white/35">
                <ImageIcon size={20} />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-ink">实时摆位与机位</p>
            <p className="mt-1 text-[9px] leading-relaxed text-ink/40">
              {project.cameras.length} 个机位 · {characterCount} 个人物 · 画幅{' '}
              {project.viewportAspectRatio}
            </p>
            <p className="mt-1 text-[9px] leading-relaxed text-ink/40 line-clamp-2">
              {selectedFrame?.director3dGuide?.cameraPrompt ??
                '进入舞台后放置人物、调整姿态和机位，记录帧会自动写回当前分镜。'}
            </p>
          </div>
        </div>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            disabled={!directorConnected || Boolean(selectedFrame?.locked)}
            onClick={onOpenDirector3d}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-700 text-white text-[11px] font-medium disabled:opacity-40"
          >
            <Play size={11} fill="currentColor" />
            {selectedFrame ? `摆位 ${selectedFrame.label}` : '打开 3D 场景'}
          </button>
        </div>
      </div>
    </div>
  );
}
