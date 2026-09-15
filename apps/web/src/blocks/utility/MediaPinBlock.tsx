import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import {
  Crop,
  Globe,
  Info,
  Layers2,
  Loader2,
  ScanFace,
  Sparkles,
  X,
} from 'lucide-react';
import {
  mediaPinKindLabel,
  resolveMediaPinItems,
  resolveMediaPinKind,
  syncMediaPinNodeFields,
  type MediaPinItem,
  type MediaPinKind,
} from '@nx9/shared';
import { api } from '../../api/client';
import { useFlowRuntime } from '../../stores/flow-runtime';
import { CanvasNodeShell } from '../shared/CanvasNodeShell';
import { isEquirectangularSize, PanoramaViewer } from '../shared/PanoramaViewer';
import { useImageEditProduce } from '../shared/use-image-edit-produce';
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
import { MediaFileInfoPanel } from './MediaFileInfoPanel';
import './media-pin.css';

interface LayerSeparationResult {
  foregroundUrl: string;
  backdropUrl: string;
  coverage: number;
  method: string;
}

interface FaceAnalysisResult {
  faces: {
    id: string;
    box: { x: number; y: number; width: number; height: number };
    expression: string;
    confidence: number;
    description: string;
  }[];
  summary: string;
}

type LightboxPanel = 'view' | 'pano' | 'crop' | 'clarity' | 'layers' | 'face' | 'info';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function expressionLabel(value: string) {
  const map: Record<string, string> = {
    neutral: '中性',
    happy: '喜悦',
    sad: '悲伤',
    angry: '愤怒',
    surprised: '惊讶',
    fearful: '恐惧',
    disgusted: '厌恶',
    focused: '专注',
  };
  return map[value.toLowerCase()] || value;
}

function ImagePinLightbox({
  url,
  label,
  onClose,
  onCommitUrl,
  onProduceUrls,
}: {
  url: string;
  label?: string;
  onClose: () => void;
  onCommitUrl: (nextUrl: string) => void;
  onProduceUrls: (urls: string[]) => void | Promise<void>;
}) {
  const [panel, setPanel] = useState<LightboxPanel>('view');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, w: 100, h: 100 });
  const [amount, setAmount] = useState(40);
  const [scale, setScale] = useState<ClarityScale>(1);
  const [tolerance, setTolerance] = useState(34);
  const [layers, setLayers] = useState<LayerSeparationResult | null>(null);
  const [faces, setFaces] = useState<FaceAnalysisResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPanel('view');
    setLayers(null);
    setFaces(null);
    setError('');
    void loadImageElement(url)
      .then((img) => {
        if (cancelled) return;
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        setNatural({ w, h });
        setCrop(defaultCropRect(w, h));
        if (isEquirectangularSize(w, h)) setPanel('pano');
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
        if (panel !== 'view' && panel !== 'pano') setPanel('view');
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

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const uploadBlob = useCallback(async (blob: Blob, name: string) => {
    const file = new File([blob], name, { type: blob.type || 'image/png' });
    const res = await api.uploadAsset(file);
    if (!res?.url) throw new Error('上传失败，禁止空成功');
    return res.url;
  }, []);

  const applyCrop = useCallback(
    () => run(async () => {
      const blob = await cropImageToBlob(url, crop);
      const next = await uploadBlob(blob, 'media-pin-crop.png');
      onCommitUrl(next);
      setPanel('view');
    }),
    [crop, onCommitUrl, run, uploadBlob, url],
  );

  const applyClarity = useCallback(
    () => run(async () => {
      const blob = await applyLocalClarityToBlob(url, amount, scale);
      const next = await uploadBlob(blob, 'media-pin-clarity.png');
      onCommitUrl(next);
      setPanel('view');
    }),
    [amount, onCommitUrl, run, scale, uploadBlob, url],
  );

  const separateLayers = useCallback(
    () => run(async () => {
      const res = await api.separateImageLayers(url, tolerance);
      if (!res.ok || !res.foregroundUrl) {
        throw new Error('图层分离失败，禁止空成功');
      }
      const next = {
        foregroundUrl: res.foregroundUrl,
        backdropUrl: res.backdropUrl,
        coverage: res.coverage,
        method: res.method,
      };
      setLayers(next);
    }),
    [run, tolerance, url],
  );

  const analyzeFaces = useCallback(
    () => run(async () => {
      const res = await api.analyzeFaces(url);
      if (!res.ok) {
        throw new Error(res.summary || '表情分析失败，禁止空成功');
      }
      setFaces({ faces: res.faces, summary: res.summary });
    }),
    [run, url],
  );

  const pct = (value: number, total: number) =>
    total > 0 ? Math.round((value / total) * 100) : 0;

  const tools: { id: LightboxPanel; label: string; icon: typeof Crop }[] = [
    ...(isEquirectangularSize(natural.w, natural.h) ? [{ id: 'pano' as const, label: '全景', icon: Globe }] : []),
    { id: 'crop', label: '裁剪', icon: Crop },
    { id: 'clarity', label: '清晰度', icon: Sparkles },
    { id: 'layers', label: '分层', icon: Layers2 },
    { id: 'face', label: '表情', icon: ScanFace },
    { id: 'info', label: '信息', icon: Info },
  ];

  return createPortal(
    <div className="nx9-media-pin-lightbox" onClick={onClose} onPointerDown={stop}>
      <div className="nx9-media-pin-lightbox__stage" onClick={(e) => e.stopPropagation()} onPointerDown={stop}>
        <div className="nx9-media-pin-lightbox__toolbar">
          <div className="nx9-media-pin-lightbox__tools">
            {tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  type="button"
                  className={`nx9-media-pin-lightbox__tool${panel === tool.id ? ' is-active' : ''}`}
                  onClick={() => setPanel((p) => (p === tool.id ? 'view' : tool.id))}
                >
                  <Icon size={14} /> {tool.label}
                </button>
              );
            })}
          </div>
          <button type="button" className="nx9-media-pin-lightbox__close" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="nx9-media-pin-lightbox__media">
          {panel === 'pano' ? (
            <PanoramaViewer url={url} />
          ) : (
            <img src={url} alt="" className="nx9-media-pin-lightbox__img" />
          )}
          {panel === 'face'
            ? faces?.faces.map((face) => (
                <div
                  key={face.id}
                  className="nx9-media-pin-face-box"
                  style={{
                    left: `${face.box.x * 100}%`,
                    top: `${face.box.y * 100}%`,
                    width: `${face.box.width * 100}%`,
                    height: `${face.box.height * 100}%`,
                  }}
                >
                  <span>
                    {expressionLabel(face.expression)}
                    {face.confidence ? ` ${Math.round(face.confidence * 100)}%` : ''}
                  </span>
                </div>
              ))
            : null}
        </div>

        {panel === 'crop' && (
          <div className="nx9-media-pin-lightbox__panel">
            <p className="nx9-media-pin-lightbox__panel-title">裁剪并替换当前钉图</p>
            <div className="nx9-media-pin-lightbox__grid">
              {(['x', 'y', 'w', 'h'] as const).map((key) => (
                <label key={key}>
                  <span>{key.toUpperCase()}</span>
                  <input
                    type="number"
                    value={Math.round(crop[key])}
                    min={0}
                    max={key === 'x' || key === 'w' ? natural.w : natural.h}
                    onChange={(e) => setCrop((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                  />
                </label>
              ))}
            </div>
            <p className="nx9-media-pin-lightbox__hint">当前 {natural.w} × {natural.h}px · 裁剪 {pct(crop.w, natural.w)}% × {pct(crop.h, natural.h)}%</p>
            <div className="nx9-media-pin-lightbox__actions">
              <button type="button" onClick={() => setPanel('view')}>取消</button>
              <button type="button" className="is-primary" disabled={busy} onClick={() => void applyCrop()}>
                {busy && <Loader2 size={12} className="animate-spin" />} 应用
              </button>
            </div>
          </div>
        )}

        {panel === 'clarity' && (
          <div className="nx9-media-pin-lightbox__panel">
            <p className="nx9-media-pin-lightbox__panel-title">本地清晰度增强</p>
            <label className="nx9-media-pin-lightbox__slider">
              <span>强度 {amount}</span>
              <input type="range" min={0} max={100} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            </label>
            <div className="nx9-media-pin-lightbox__scales">
              {([1, 1.5, 2] as ClarityScale[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={scale === value ? 'is-active' : ''}
                  onClick={() => setScale(value)}
                >
                  {value}×
                </button>
              ))}
            </div>
            <div className="nx9-media-pin-lightbox__actions">
              <button type="button" onClick={() => setPanel('view')}>取消</button>
              <button type="button" className="is-primary" disabled={busy} onClick={() => void applyClarity()}>
                {busy && <Loader2 size={12} className="animate-spin" />} 应用
              </button>
            </div>
          </div>
        )}

        {panel === 'layers' && (
          <div className="nx9-media-pin-lightbox__panel">
            <p className="nx9-media-pin-lightbox__panel-title">快速主体 / 背景分离</p>
            <p className="nx9-media-pin-lightbox__hint">
              本地边界色分离适合干净背景；复杂发丝、透明物和语义多层仍需专业模型。
            </p>
            <label className="nx9-media-pin-lightbox__slider">
              <span>背景容差 {tolerance}</span>
              <input type="range" min={8} max={96} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} />
            </label>
            {layers ? (
              <div className="nx9-media-pin-result">
                <a href={layers.foregroundUrl} target="_blank" rel="noreferrer">前景 PNG</a>
                <a href={layers.backdropUrl} target="_blank" rel="noreferrer">背景层</a>
                <span>主体覆盖 {Math.round(layers.coverage * 100)}%</span>
              </div>
            ) : null}
            <div className="nx9-media-pin-lightbox__actions">
              <button type="button" onClick={() => setPanel('view')}>关闭</button>
              {layers ? (
                <button
                  type="button"
                  className="is-primary"
                  disabled={busy}
                  onClick={() => void onProduceUrls([layers.foregroundUrl, layers.backdropUrl])}
                >
                  生成图层节点
                </button>
              ) : (
                <button type="button" className="is-primary" disabled={busy} onClick={() => void separateLayers()}>
                  {busy && <Loader2 size={12} className="animate-spin" />} 开始分离
                </button>
              )}
            </div>
          </div>
        )}

        {panel === 'face' && (
          <div className="nx9-media-pin-lightbox__panel">
            <p className="nx9-media-pin-lightbox__panel-title">人脸表情分析</p>
            <p className="nx9-media-pin-lightbox__hint">使用视觉模型识别可见表情线索，不做身份识别。</p>
            {faces ? (
              <div className="nx9-media-pin-face-list">
                {faces.faces.length === 0 ? <span>{faces.summary}</span> : null}
                {faces.faces.map((face) => (
                  <div key={face.id}>
                    <strong>{face.id} · {expressionLabel(face.expression)}</strong>
                    <span>{Math.round(face.confidence * 100)}%{face.description ? ` · ${face.description}` : ''}</span>
                  </div>
                ))}
                {faces.faces.length > 0 ? <p>{faces.summary}</p> : null}
              </div>
            ) : null}
            <div className="nx9-media-pin-lightbox__actions">
              <button type="button" onClick={() => setPanel('view')}>关闭</button>
              <button type="button" className="is-primary" disabled={busy} onClick={() => void analyzeFaces()}>
                {busy && <Loader2 size={12} className="animate-spin" />} 分析表情
              </button>
            </div>
          </div>
        )}

        {panel === 'info' && (
          <MediaFileInfoPanel
            url={url}
            pinKind="picture"
            label={label}
            onClose={() => setPanel('view')}
          />
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
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showInfo) setShowInfo(false);
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
  }, [onClose, showInfo]);

  return createPortal(
    <div className="nx9-media-pin-lightbox" onClick={onClose} onPointerDown={stop}>
      <div className="nx9-media-pin-lightbox__stage" onClick={(e) => e.stopPropagation()} onPointerDown={stop}>
        <div className="nx9-media-pin-lightbox__toolbar">
          <div className="nx9-media-pin-lightbox__tools">
            <span className="nx9-media-pin-lightbox__tool is-active">{label || mediaPinKindLabel(pinKind)}</span>
            <button
              type="button"
              className={`nx9-media-pin-lightbox__tool${showInfo ? ' is-active' : ''}`}
              onClick={() => setShowInfo((value) => !value)}
            >
              <Info size={14} /> 信息
            </button>
          </div>
          <button type="button" className="nx9-media-pin-lightbox__close" onClick={onClose} aria-label="关闭">
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
            <a href={url} target="_blank" rel="noreferrer" className="nx9-media-pin-lightbox__link">打开资源</a>
          </div>
        ) : null}

        {showInfo && url ? (
          <MediaFileInfoPanel
            url={url}
            pinKind={pinKind}
            label={label}
            textContent={textContent}
            onClose={() => setShowInfo(false)}
          />
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function MediaPinBlock(props: NodeProps) {
  const { getNode, updateNodeData } = useReactFlow();
  const flowRuntime = useFlowRuntime((s) => s.runtime);
  const produce = useImageEditProduce(props.id);
  const dataRef = useRef<Record<string, unknown>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);

  const data = (props.data ?? {}) as Record<string, unknown>;
  dataRef.current = data;
  const items = useMemo(() => resolveMediaPinItems(data), [data]);
  const activeItem = items.find((item) => item.id === selectedId) ?? items[0];
  const url = activeItem?.url ?? '';
  const pinKind = activeItem?.pinKind ?? resolveMediaPinKind(data.pinKind, url);
  const label = activeItem?.label ?? activeItem?.filename ?? (data.pinLabel as string | undefined);
  const textContent = activeItem?.textContent ?? (data.textContent as string | undefined);

  const readCurrentItems = useCallback((): MediaPinItem[] => {
    const node = getNode(props.id);
    return resolveMediaPinItems(
      (node?.data as Record<string, unknown> | undefined) ?? dataRef.current,
    );
  }, [getNode, props.id]);

  const patchItems = useCallback(
    (next: MediaPinItem[]) => {
      const patch = syncMediaPinNodeFields(next, dataRef.current);
      if (flowRuntime?.updateNodeData) {
        flowRuntime.updateNodeData(props.id, patch);
        return;
      }
      updateNodeData(props.id, patch);
    },
    [flowRuntime, props.id, updateNodeData],
  );

  const commitActiveUrl = useCallback(
    (nextUrl: string) => {
      const current = readCurrentItems();
      const target = current.find((item) => item.id === activeItem?.id) ?? current[0];
      if (!target) return;
      patchItems(current.map((item) => (item.id === target.id ? { ...item, url: nextUrl } : item)));
    },
    [activeItem?.id, patchItems, readCurrentItems],
  );

  const removeItem = useCallback(
    (id: string) => {
      const next = readCurrentItems().filter((item) => item.id !== id);
      patchItems(next);
      if (selectedId === id) setSelectedId(null);
    },
    [patchItems, readCurrentItems, selectedId],
  );

  const canOpen = Boolean(url || textContent);

  return (
    <>
      <CanvasNodeShell {...props} onPreviewOpen={canOpen ? () => setLightbox(true) : undefined} />
      {items.length > 1 ? (
        <div className="nx9-media-pin-workbench nodrag nopan">
          <div className="nx9-media-pin-strip nx9-scroll">
            {items.map((item) => (
              <div key={item.id} className={`nx9-media-pin-thumb${item.id === activeItem?.id ? ' is-active' : ''}`}>
                <button type="button" onClick={() => setSelectedId(item.id)} title={item.label || item.filename || item.url}>
                  {item.pinKind === 'picture' ? (
                    <img src={item.url} alt="" loading="lazy" />
                  ) : (
                    <span>{mediaPinKindLabel(item.pinKind)}</span>
                  )}
                </button>
                <button type="button" onClick={() => removeItem(item.id)} aria-label="移除">
                  <X size={8} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {lightbox && pinKind === 'picture' && url ? (
        <ImagePinLightbox
          url={url}
          label={label}
          onClose={() => setLightbox(false)}
          onCommitUrl={commitActiveUrl}
          onProduceUrls={produce}
        />
      ) : null}
      {lightbox && pinKind !== 'picture' && (url || textContent) ? (
        <GenericPinLightbox
          pinKind={pinKind}
          url={url}
          label={label}
          textContent={textContent}
          onClose={() => setLightbox(false)}
        />
      ) : null}
    </>
  );
}

export default memo(MediaPinBlock);
