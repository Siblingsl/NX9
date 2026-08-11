import { memo, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { Crop, Loader2, Sparkles, X } from 'lucide-react';
import { resolveMediaPinKind, type MediaPinKind } from '@nx9/shared';
import { api } from '../../api/client';
import { useFlowRuntime } from '../../stores/flow-runtime';
import { CanvasNodeShell } from '../shared/CanvasNodeShell';
import {
  cropImageToBlob,
  defaultCropRect,
  loadImageElement,
  type CropRect,
} from '../shared/image-crop';
import {
  applyLocalClarityToBlob,
  type ClarityScale,
} from '../shared/image-local-clarity';
import './media-pin.css';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

type LightboxPanel = 'view' | 'crop' | 'clarity';

function ImagePinLightbox({
  url,
  onClose,
  onCommitUrl,
}: {
  url: string;
  onClose: () => void;
  onCommitUrl: (nextUrl: string) => void;
}) {
  const [panel, setPanel] = useState<LightboxPanel>('view');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, w: 100, h: 100 });
  const [amount, setAmount] = useState(40);
  const [scale, setScale] = useState<ClarityScale>(1);

  useEffect(() => {
    let cancelled = false;
    void loadImageElement(url)
      .then((img) => {
        if (cancelled) return;
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        setNatural({ w, h });
        setCrop(defaultCropRect(w, h));
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (panel !== 'view') setPanel('view');
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, panel]);

  const uploadBlob = useCallback(async (blob: Blob, name: string) => {
    const file = new File([blob], name, { type: blob.type || 'image/png' });
    const res = await api.uploadAsset(file);
    return res.url;
  }, []);

  const applyCrop = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const blob = await cropImageToBlob(url, crop);
      const next = await uploadBlob(blob, 'media-pin-crop.png');
      onCommitUrl(next);
      setPanel('view');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [url, crop, uploadBlob, onCommitUrl]);

  const applyClarity = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const blob = await applyLocalClarityToBlob(url, amount, scale);
      const next = await uploadBlob(blob, 'media-pin-clarity.png');
      onCommitUrl(next);
      setPanel('view');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [url, amount, scale, uploadBlob, onCommitUrl]);

  const pct = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

  return createPortal(
    <div className="nx9-media-pin-lightbox" onClick={onClose} onPointerDown={stop}>
      <div
        className="nx9-media-pin-lightbox__stage"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={stop}
      >
        <div className="nx9-media-pin-lightbox__toolbar">
          <div className="nx9-media-pin-lightbox__tools">
            <button
              type="button"
              className={`nx9-media-pin-lightbox__tool${panel === 'crop' ? ' is-active' : ''}`}
              onClick={() => setPanel((p) => (p === 'crop' ? 'view' : 'crop'))}
            >
              <Crop size={14} /> 裁剪
            </button>
            <button
              type="button"
              className={`nx9-media-pin-lightbox__tool${panel === 'clarity' ? ' is-active' : ''}`}
              onClick={() => setPanel((p) => (p === 'clarity' ? 'view' : 'clarity'))}
            >
              <Sparkles size={14} /> 清晰度
            </button>
          </div>
          <button
            type="button"
            className="nx9-media-pin-lightbox__close"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <img src={url} alt="" className="nx9-media-pin-lightbox__img" />

        {panel === 'crop' && (
          <div className="nx9-media-pin-lightbox__panel">
            <p className="nx9-media-pin-lightbox__panel-title">弹框裁剪</p>
            {natural.w > 0 ? (
              <div className="nx9-media-pin-lightbox__grid">
                {(['x', 'y', 'w', 'h'] as const).map((key) => (
                  <label key={key}>
                    {key.toUpperCase()}
                    <input
                      type="number"
                      min={0}
                      max={key === 'x' || key === 'w' ? natural.w : natural.h}
                      value={crop[key]}
                      onChange={(e) =>
                        setCrop((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                      }
                    />
                    <span>
                      {pct(crop[key], key === 'x' || key === 'w' ? natural.w : natural.h)}%
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="nx9-media-pin-lightbox__hint">读取尺寸中…</p>
            )}
            <div className="nx9-media-pin-lightbox__actions">
              <button type="button" onClick={() => setPanel('view')}>
                取消
              </button>
              <button type="button" className="is-primary" disabled={busy} onClick={() => void applyCrop()}>
                {busy && <Loader2 size={12} className="animate-spin" />}
                应用裁剪
              </button>
            </div>
          </div>
        )}

        {panel === 'clarity' && (
          <div className="nx9-media-pin-lightbox__panel">
            <p className="nx9-media-pin-lightbox__panel-title">本地清晰度</p>
            <p className="nx9-media-pin-lightbox__hint">浏览器内锐化 / 放大，不调用上游模型</p>
            <label className="nx9-media-pin-lightbox__slider">
              锐化 {amount}
              <input
                type="range"
                min={0}
                max={100}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </label>
            <div className="nx9-media-pin-lightbox__scales">
              {([1, 1.5, 2] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={scale === s ? 'is-active' : undefined}
                  onClick={() => setScale(s)}
                >
                  {s === 1 ? '原尺寸' : `${s}×`}
                </button>
              ))}
            </div>
            <div className="nx9-media-pin-lightbox__actions">
              <button type="button" onClick={() => setPanel('view')}>
                取消
              </button>
              <button
                type="button"
                className="is-primary"
                disabled={busy}
                onClick={() => void applyClarity()}
              >
                {busy && <Loader2 size={12} className="animate-spin" />}
                应用
              </button>
            </div>
          </div>
        )}

        {error ? <p className="nx9-media-pin-lightbox__error">{error}</p> : null}
      </div>
    </div>,
    document.body,
  );
}

function GenericPinLightbox({
  pinKind,
  url,
  label,
  textContent,
  onClose,
}: {
  pinKind: MediaPinKind;
  url: string;
  label?: string;
  textContent?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div className="nx9-media-pin-lightbox" onClick={onClose} onPointerDown={stop}>
      <div
        className="nx9-media-pin-lightbox__stage"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={stop}
      >
        <div className="nx9-media-pin-lightbox__toolbar">
          <div className="nx9-media-pin-lightbox__tools">
            <span className="nx9-media-pin-lightbox__tool is-active">{label || pinKind}</span>
          </div>
          <button
            type="button"
            className="nx9-media-pin-lightbox__close"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>
        {pinKind === 'clip' && url ? (
          <video src={url} controls autoPlay className="nx9-media-pin-lightbox__img" />
        ) : pinKind === 'sound' && url ? (
          <audio src={url} controls autoPlay className="nx9-media-pin-lightbox__audio-lg" />
        ) : pinKind === 'text' ? (
          <pre className="nx9-media-pin-lightbox__text">{textContent || url}</pre>
        ) : pinKind === 'mesh' && url ? (
          <div className="nx9-media-pin-lightbox__panel">
            <p className="nx9-media-pin-lightbox__panel-title">{label || '3D 模型'}</p>
            <p className="nx9-media-pin-lightbox__hint">模型已钉到画布，可连下游 3D 口</p>
            <a href={url} target="_blank" rel="noreferrer" className="nx9-media-pin-lightbox__link">
              打开资源
            </a>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function MediaPinBlock(props: NodeProps) {
  const data = (props.data ?? {}) as Record<string, unknown>;
  const url =
    (data.pinUrl as string | undefined) ||
    (data.previewUrl as string | undefined) ||
    (data.assetUrl as string | undefined) ||
    '';
  const pinKind = resolveMediaPinKind(data.pinKind, url);
  const label =
    (data.pinLabel as string | undefined) ||
    (data.filename as string | undefined) ||
    undefined;
  const textContent = data.textContent as string | undefined;
  const [lightbox, setLightbox] = useState(false);
  const [liveUrl, setLiveUrl] = useState(url);
  const { updateNodeData } = useReactFlow();
  const flowRuntime = useFlowRuntime((s) => s.runtime);

  useEffect(() => {
    setLiveUrl(url);
  }, [url]);

  const commitUrl = useCallback(
    (nextUrl: string) => {
      setLiveUrl(nextUrl);
      const patch = {
        pinUrl: nextUrl,
        previewUrl: pinKind === 'picture' ? nextUrl : '',
        assetUrl: nextUrl,
        status: 'done' as const,
      };
      if (flowRuntime?.updateNodeData) {
        flowRuntime.updateNodeData(props.id, patch);
        return;
      }
      updateNodeData(props.id, patch);
    },
    [flowRuntime, pinKind, props.id, updateNodeData],
  );

  const canOpen = Boolean(url || textContent);

  return (
    <>
      <CanvasNodeShell {...props} onPreviewOpen={canOpen ? () => setLightbox(true) : undefined} />
      {lightbox && pinKind === 'picture' && liveUrl ? (
        <ImagePinLightbox
          url={liveUrl}
          onClose={() => setLightbox(false)}
          onCommitUrl={commitUrl}
        />
      ) : null}
      {lightbox && pinKind !== 'picture' && (liveUrl || textContent) ? (
        <GenericPinLightbox
          pinKind={pinKind}
          url={liveUrl}
          label={label}
          textContent={textContent}
          onClose={() => setLightbox(false)}
        />
      ) : null}
    </>
  );
}

export default memo(MediaPinBlock);
