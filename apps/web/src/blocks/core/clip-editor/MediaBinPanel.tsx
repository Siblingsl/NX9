import { useCallback } from 'react';
import { Film, Music, Plus } from 'lucide-react';
import { MEDIA_DRAG_MIME, type MediaDropPayload } from './TimelinePanel';

export interface MediaBinShot {
  id: string;
  index: number;
  status?: string;
  durationSec?: number;
  videoAssetId?: string | null;
  firstFrameAssetId?: string | null;
  descriptionZh?: string;
}

export interface MediaBinPanelProps {
  shots: MediaBinShot[];
  clips: string[];
  sounds: string[];
  /** 点击加入：追加到对应类型轨道末尾 */
  onAdd: (payload: MediaDropPayload) => void;
}

function BinItem({
  payload,
  thumb,
  onAdd,
}: {
  payload: MediaDropPayload;
  thumb?: string | null;
  onAdd: (p: MediaDropPayload) => void;
}) {
  const onDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData(MEDIA_DRAG_MIME, JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'copy';
    },
    [payload],
  );

  return (
    <div className="ed-bin__item" draggable onDragStart={onDragStart} title={payload.label}>
      {thumb ? (
        <img src={thumb} alt="" className="ed-bin__thumb" draggable={false} />
      ) : (
        <span className="ed-bin__thumb ed-bin__thumb--icon">
          {payload.mediaType === 'audio' ? <Music size={14} /> : <Film size={14} />}
        </span>
      )}
      <span className="ed-bin__label">{payload.label}</span>
      <button
        type="button"
        className="ed-mini-btn"
        title="加入时间轴末尾"
        onClick={() => onAdd(payload)}
      >
        <Plus size={11} />
      </button>
    </div>
  );
}

export function MediaBinPanel({ shots, clips, sounds, onAdd }: MediaBinPanelProps) {
  const shotItems = shots.filter((s) => s.videoAssetId);
  const hasAny = shotItems.length > 0 || clips.length > 0 || sounds.length > 0;

  return (
    <div className="ed-bin">
      {!hasAny && (
        <div className="ed-empty">
          无上游素材。
          <br />
          连接导演台 / 视频 / 音频上游后在此出现。
        </div>
      )}

      {shotItems.length > 0 && (
        <section className="ed-bin__section">
          <h4>镜头（{shotItems.length}）</h4>
          {shotItems.map((s) => (
            <BinItem
              key={s.id}
              thumb={s.firstFrameAssetId}
              payload={{
                url: s.videoAssetId!,
                mediaType: 'video',
                label: `#${s.index} ${s.descriptionZh ?? ''}`.trim(),
                durationSec: s.durationSec,
                shotId: s.id,
              }}
              onAdd={onAdd}
            />
          ))}
        </section>
      )}

      {clips.length > 0 && (
        <section className="ed-bin__section">
          <h4>视频（{clips.length}）</h4>
          {clips.map((url, i) => (
            <BinItem
              key={url}
              payload={{ url, mediaType: 'video', label: `视频 ${i + 1} · ${url.slice(-24)}` }}
              onAdd={onAdd}
            />
          ))}
        </section>
      )}

      {sounds.length > 0 && (
        <section className="ed-bin__section">
          <h4>音频（{sounds.length}）</h4>
          {sounds.map((url, i) => (
            <BinItem
              key={url}
              payload={{ url, mediaType: 'audio', label: `音频 ${i + 1} · ${url.slice(-24)}` }}
              onAdd={onAdd}
            />
          ))}
        </section>
      )}
    </div>
  );
}
