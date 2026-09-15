import { useEffect, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { mediaPinKindLabel, type MediaPinKind } from '@nx9/shared';
import { loadImageElement } from '../shared/image-crop';

interface MediaFileInfo {
  size?: number;
  mimeType?: string;
  lastModified?: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

interface MediaFileInfoPanelProps {
  url: string;
  pinKind: MediaPinKind;
  label?: string;
  textContent?: string;
  onClose: () => void;
}

function fileNameFromUrl(url: string) {
  try {
    const path = new URL(url, window.location.href).pathname;
    return decodeURIComponent(path.split('/').pop() || '未命名文件');
  } catch {
    return decodeURIComponent(url.split('/').pop() || '未命名文件');
  }
}

function formatFileSize(size?: number) {
  if (!Number.isFinite(size) || (size ?? 0) < 0) return '不可用';
  const value = size ?? 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(durationSec?: number) {
  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 0) return null;
  const totalSeconds = Math.round(durationSec);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return minutes > 0 ? `${minutes}:${seconds}` : `0:${seconds}`;
}

function formatTime(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat('zh-CN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

function typeLabel(mimeType?: string) {
  if (!mimeType) return null;
  if (/^image\//i.test(mimeType)) return mimeType.replace(/^image\//i, '').toUpperCase();
  if (/^video\//i.test(mimeType)) return mimeType.replace(/^video\//i, '').toUpperCase();
  if (/^audio\//i.test(mimeType)) return mimeType.replace(/^audio\//i, '').toUpperCase();
  if (/text\/markdown/i.test(mimeType)) return 'Markdown';
  if (/^text\//i.test(mimeType)) return mimeType.replace(/^text\//i, '').toUpperCase();
  return mimeType;
}

function probeImage(url: string): Promise<Partial<MediaFileInfo>> {
  return loadImageElement(url).then((img) => ({
    width: img.naturalWidth,
    height: img.naturalHeight,
  }));
}

function probeClip(url: string): Promise<Partial<MediaFileInfo>> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => resolve({
      width: video.videoWidth || undefined,
      height: video.videoHeight || undefined,
      durationSec: Number.isFinite(video.duration) ? video.duration : undefined,
    });
    video.onerror = () => reject(new Error('无法读取视频元数据'));
    video.src = url;
  });
}

function probeSound(url: string): Promise<Partial<MediaFileInfo>> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => resolve({
      durationSec: Number.isFinite(audio.duration) ? audio.duration : undefined,
    });
    audio.onerror = () => reject(new Error('无法读取音频元数据'));
    audio.src = url;
  });
}

export function MediaFileInfoPanel({
  url,
  pinKind,
  label,
  textContent,
  onClose,
}: MediaFileInfoPanelProps) {
  const [info, setInfo] = useState<MediaFileInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setInfo(null);

    const metadata = pinKind === 'picture'
      ? probeImage(url)
      : pinKind === 'clip'
        ? probeClip(url)
        : pinKind === 'sound'
          ? probeSound(url)
          : Promise.resolve({});

    const source = fetch(url, { method: 'HEAD', signal: controller.signal })
      .then((res) => {
        if (!res.ok && res.status !== 405) throw new Error(`HTTP ${res.status}`);
        const lastModified = res.headers.get('last-modified');
        return {
          size: Number(res.headers.get('content-length')) || undefined,
          mimeType: res.headers.get('content-type')?.split(';')[0] || undefined,
          lastModified: lastModified ? new Date(lastModified).toISOString() : undefined,
        } satisfies Partial<MediaFileInfo>;
      })
      .catch(() => ({}));

    void Promise.all([metadata, source])
      .then(([metadataResult, sourceResult]) => {
        if (!cancelled) setInfo({ ...sourceResult, ...metadataResult });
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [pinKind, url]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const rows: Array<[string, string]> = [
    ['文件名', fileNameFromUrl(url)],
    ['类型', [mediaPinKindLabel(pinKind), typeLabel(info?.mimeType)].filter(Boolean).join(' · ')],
    ['大小', loading ? '读取中…' : formatFileSize(info?.size)],
  ];

  if (label) rows.splice(1, 0, ['名称', label]);

  if (info?.width && info?.height) {
    rows.push(['尺寸', `${info.width} × ${info.height}px`]);
  }
  const duration = formatDuration(info?.durationSec);
  if (duration) rows.push(['时长', duration]);
  if (pinKind === 'text' && textContent) {
    rows.push(['文本', `${textContent.length} 字 · ${textContent.split(/\r?\n/).length} 行`]);
  }
  const modifiedAt = formatTime(info?.lastModified);
  if (modifiedAt) rows.push(['修改时间', modifiedAt]);
  rows.push(['资源地址', url]);

  return (
    <div className="nx9-media-pin-lightbox__panel nx9-media-file-info">
      <p className="nx9-media-pin-lightbox__panel-title">文件信息</p>
      <dl>
        {rows.map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd title={name === '资源地址' ? url : undefined}>{value}</dd>
            {name === '资源地址' ? (
              <button type="button" onClick={() => void copyUrl()} aria-label="复制资源地址">
                {copied ? <Check size={12} /> : <Copy size={12} />}
              </button>
            ) : null}
          </div>
        ))}
      </dl>
      <div className="nx9-media-pin-lightbox__actions">
        <button type="button" onClick={onClose}>关闭</button>
      </div>
    </div>
  );
}
