import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Monitor, Upload, X } from 'lucide-react';
import { DEFAULT_CANVAS_APPEARANCE, type CanvasAppearance, type CanvasGridStyle, type CanvasThemeMode } from '@nx9/shared';
import { api } from '../api/client';
import { useWorkspaceDocument } from '../stores/workspace-document';

export type CanvasThemeUISetting = CanvasThemeMode | 'system';

export function CanvasAppearancePanel() {
  const canvasAppearance = useWorkspaceDocument((s) => s.canvasAppearance);
  const setCanvasAppearance = useWorkspaceDocument((s) => s.setCanvasAppearance);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [systemDark, setSystemDark] = useState(
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const themeSetting = (localStorage.getItem('nx9:canvas_theme') as CanvasThemeUISetting | null) || canvasAppearance.theme || 'dark';
  const effectiveTheme = themeSetting === 'system' ? (systemDark ? 'dark' : 'light') : themeSetting;

  // 当系统主题变化时或 themeSetting 变化时同步到 canvasAppearance
  useEffect(() => {
    if (canvasAppearance.theme !== effectiveTheme) {
      setCanvasAppearance({ ...canvasAppearance, theme: effectiveTheme });
    }
  }, [effectiveTheme]);

  const update = useCallback(
    (patch: Partial<CanvasAppearance>) => {
      setCanvasAppearance({ ...canvasAppearance, ...patch });
    },
    [canvasAppearance, setCanvasAppearance],
  );

  const handleThemeChange = (mode: CanvasThemeUISetting) => {
    localStorage.setItem('nx9:canvas_theme', mode);
    if (mode === 'system') {
      update({ theme: systemDark ? 'dark' : 'light' });
    } else {
      update({ theme: mode });
    }
  };

  const handleUpload = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return;
      setUploading(true);
      try {
        const res = await api.uploadAsset(file);
        update({ backgroundImageUrl: res.url });
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [update],
  );

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center gap-2">
        <Image size={16} className="text-ink/50" />
        <span className="font-medium text-sm">画布外观</span>
      </div>

      <div className="space-y-1">
        <p className="text-[10px] text-ink/50">主题模式</p>
        <div className="flex gap-1">
          {(['light', 'dark', 'system'] as CanvasThemeUISetting[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => handleThemeChange(mode)}
              className={`nodrag nopan text-[10px] px-3 py-1.5 rounded-lg border transition-colors flex-1 ${
                themeSetting === mode
                  ? 'bg-brand/10 text-brand border-brand/30'
                  : 'border-line text-ink/60 hover:border-brand/30'
              }`}
            >
              {mode === 'light' ? '浅色' : mode === 'dark' ? '深色' : <><Monitor size={10} className="inline" /> 系统</>}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-[10px] text-ink/50">网格样式</p>
        <div className="flex gap-1">
          {(['dots', 'lines', 'blank'] as CanvasGridStyle[]).map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => update({ gridStyle: style })}
              className={`nodrag nopan text-[10px] px-3 py-1.5 rounded-lg border transition-colors flex-1 ${
                canvasAppearance.gridStyle === style
                  ? 'bg-brand/10 text-brand border-brand/30'
                  : 'border-line text-ink/60 hover:border-brand/30'
              }`}
            >
              {style === 'dots' ? '点' : style === 'lines' ? '线' : '空白'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-[10px] text-ink/50">背景图</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUpload(f);
          }}
        />
        {canvasAppearance.backgroundImageUrl ? (
          <div className="relative rounded-lg border border-line overflow-hidden">
            <img
              src={canvasAppearance.backgroundImageUrl}
              alt=""
              className="w-full h-16 object-cover"
            />
            <button
              type="button"
              onClick={() => update({ backgroundImageUrl: null })}
              className="absolute top-1 right-1 p-0.5 rounded bg-black/40 text-white"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="w-full nodrag nopan rounded-lg border border-dashed border-line py-3 text-[10px] text-ink/40 hover:border-brand/30 flex items-center justify-center gap-1"
          >
            <Upload size={14} />
            {uploading ? '上传中…' : '上传背景图'}
          </button>
        )}
        {canvasAppearance.backgroundImageUrl && (
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-ink/40">透明度</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round((canvasAppearance.backgroundImageOpacity ?? 0.35) * 100)}
              onChange={(e) => update({ backgroundImageOpacity: Number(e.target.value) / 100 })}
              className="flex-1 accent-brand"
            />
          </div>
        )}
      </div>
    </div>
  );
}
