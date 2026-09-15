import { useCallback } from 'react';
import { Film, Music, Plus } from 'lucide-react';
import { MEDIA_DRAG_MIME, type MediaDropPayload } from './TimelinePanel';

/** 内置贴纸：SVG 形状 → data URL，加入贴片轨后可用画布手柄/位姿编辑 */
const STICKERS: Array<{ id: string; label: string; svg: string }> = [
  { id: 'star', label: '星形', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="%23ffffff" d="M50 4 L61.8 38.2 L98 38.2 L68.5 59.5 L79.4 94 L50 72.7 L20.6 94 L31.5 59.5 L2 38.2 L38.2 38.2 Z"/></svg>' },
  { id: 'heart', label: '心形', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="%23ffffff" d="M50 85 C20 65 5 45 5 25 C5 10 20 5 30 15 C40 22 48 30 50 38 C52 30 60 22 70 15 C80 5 95 10 95 25 C95 45 80 65 50 85 Z"/></svg>' },
  { id: 'circle', label: '圆形', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="%23ffffff"/></svg>' },
  { id: 'square', label: '方形', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="6" y="6" width="88" height="88" rx="8" fill="%23ffffff"/></svg>' },
  { id: 'triangle', label: '三角', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="%23ffffff" d="M50 8 L94 90 L6 90 Z"/></svg>' },
  { id: 'arrow', label: '箭头', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="%23ffffff" d="M8 40 H62 V16 L96 50 L62 84 V60 H8 Z"/></svg>' },
  { id: 'check', label: '对勾', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="none" stroke="%23ffffff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" d="M12 52 L38 78 L88 22"/></svg>' },
  { id: 'cross', label: '叉', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="none" stroke="%23ffffff" stroke-width="14" stroke-linecap="round" d="M18 18 L82 82 M82 18 L18 82"/></svg>' },
  { id: 'play', label: '播放', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="%23ffffff" d="M28 14 L84 50 L28 86 Z"/></svg>' },
  { id: 'sparkle', label: '星光', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="%23ffffff" d="M50 2 L57 37 L92 30 L69 55 L94 78 L59 71 L52 98 L45 63 L10 70 L33 45 L8 22 L43 29 Z"/></svg>' },
  { id: 'flag', label: '旗帜', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="%23ffffff" d="M14 6 H22 V94 H14 Z M22 10 C36 6 44 18 58 14 C70 11 76 17 86 14 V52 C76 55 70 49 58 52 C44 56 36 44 22 48 Z"/></svg>' },
  { id: 'quote', label: '引号', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="%23ffffff" d="M20 18 C10 34 8 48 10 60 C12 70 18 76 26 76 C34 76 40 70 40 62 C40 54 36 48 30 46 C34 42 38 38 40 34 Z M62 18 C52 34 50 48 52 60 C54 70 60 76 68 76 C76 76 82 70 82 62 C82 54 78 48 72 46 C76 42 80 38 82 34 Z"/></svg>' },
];

const stickerUrl = (s: { svg: string }) => `data:image/svg+xml;utf8,${encodeURIComponent(s.svg)}`;

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
  /** SF-15：仅 music 配乐 URL；素材箱标签区分 BGM / 其它音频 */
  bgmUrls?: string[];
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

export function MediaBinPanel({ shots, clips, sounds, bgmUrls = [], onAdd }: MediaBinPanelProps) {
  const shotItems = shots.filter((s) => s.videoAssetId);
  const hasAny = shotItems.length > 0 || clips.length > 0 || sounds.length > 0;
  const bgmSet = new Set(bgmUrls);

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
          {sounds.map((url, i) => {
            const isBgm = bgmSet.has(url);
            return (
              <BinItem
                key={url}
                payload={{
                  url,
                  mediaType: 'audio',
                  label: `${isBgm ? 'BGM' : '音频'} ${i + 1} · ${url.slice(-24)}`,
                }}
                onAdd={onAdd}
              />
            );
          })}
        </section>
      )}

      <section className="ed-bin__section">
        <h4>贴纸（内置）</h4>
        <div className="ed-bin__stickers">
          {STICKERS.map((s) => (
            <button
              key={s.id}
              type="button"
              className="ed-bin__sticker"
              draggable
              title={`${s.label}：点击加入贴片轨，或拖到时间轴`}
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  MEDIA_DRAG_MIME,
                  JSON.stringify({
                    url: stickerUrl(s),
                    mediaType: 'image',
                    label: `贴纸·${s.label}`,
                  } satisfies MediaDropPayload),
                );
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() =>
                onAdd({ url: stickerUrl(s), mediaType: 'image', label: `贴纸·${s.label}` })
              }
            >
              <img src={stickerUrl(s)} alt={s.label} draggable={false} />
            </button>
          ))}
        </div>
        <small className="ed-field-hint">加入后可在预览画布直接拖动 / 缩放 / 旋转，或检查器调位姿。</small>
      </section>
    </div>
  );
}
