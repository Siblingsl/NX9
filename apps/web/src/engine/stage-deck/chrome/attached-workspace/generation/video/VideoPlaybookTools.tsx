import { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronDown, ImagePlus, Loader2, Plus, Trash2, Video, X } from 'lucide-react';
import type { ReferenceSlot, ReferenceSlotRole } from '@nx9/shared';
import { ComposerPopover } from '../../composer/ComposerPopover';
import { api } from '../../../../../../api/client';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function relabelGroup(slots: ReferenceSlot[], role: ReferenceSlotRole): ReferenceSlot[] {
  let i = 0;
  return slots.map((s) => {
    if (s.role !== role) return s;
    i += 1;
    const base = role === 'character' ? '人物' : role === 'scene' ? '场景' : s.label;
    return {
      ...s,
      label: role === 'character' || role === 'scene' ? `${base}${i}` : s.label,
      required: role === 'character' ? i === 1 : s.required,
    };
  });
}

function triggerClass(active: boolean) {
  return `inline-flex items-center gap-0.5 h-7 px-1.5 rounded-md border text-[10px] transition-colors shrink-0 ${
    active
      ? 'border-brand/30 bg-brand/8 text-brand'
      : 'border-line/40 text-ink/55 hover:border-line/60 hover:text-ink/75'
  }`;
}

/** 深度：与人物/场景同款下拉触发器 */
function DepthDropdownButton({
  slot,
  busy,
  onConvert,
  onDirect,
  onClear,
}: {
  slot: ReferenceSlot;
  busy: boolean;
  onConvert: () => void;
  onDirect: () => void;
  onClear: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const hasAsset = Boolean(slot.assetUrl);
  const hasSource = Boolean(slot.sourceVideoUrl);
  const converting = slot.convertStatus === 'converting' || busy;
  const preview = slot.assetUrl || slot.sourceVideoUrl;
  const status = converting
    ? '转换中'
    : hasAsset
      ? '已就绪'
      : hasSource
        ? '待转'
        : '未上传';
  const active = open || hasAsset || converting;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseDown={stop}
        onClick={() => setOpen((v) => !v)}
        className={triggerClass(active)}
        title="深度视频（动作锁）"
      >
        {converting ? (
          <Loader2 size={11} className="animate-spin opacity-70" />
        ) : (
          <Video size={11} className="opacity-70" />
        )}
        <span>
          深度<span className="text-warn/80">*</span>
        </span>
        <span className="text-[9px] opacity-60">{status}</span>
        <ChevronDown size={10} className="opacity-50" />
      </button>

      <ComposerPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={btnRef}
        placement="above"
        align="end"
        width={220}
        tone="desk"
      >
        <div className="px-2 pt-2 pb-1.5" onMouseDown={stop}>
          <p className="px-0.5 mb-1.5 text-[10px] font-medium text-ink/65">
            深度视频<span className="text-warn/80"> *</span>
          </p>

          {preview ? (
            <div className="relative mb-1.5 rounded-lg overflow-hidden border border-line/35 bg-ink/[0.06] aspect-video">
              <video src={preview} className="w-full h-full object-cover" muted playsInline controls />
              {converting ? (
                <div className="absolute inset-0 flex items-center justify-center bg-ink/45">
                  <Loader2 size={16} className="animate-spin text-white" />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mb-1.5 py-4 rounded-lg border border-dashed border-line/40 text-center text-[10px] text-ink/35">
              尚未填入深度视频
            </div>
          )}

          {slot.convertError ? (
            <p className="mb-1.5 px-0.5 text-[9px] text-warn/90 line-clamp-2">{slot.convertError}</p>
          ) : null}

          <div className="space-y-0.5">
            <button
              type="button"
              disabled={converting}
              onClick={() => {
                onConvert();
              }}
              className="w-full text-left px-2 py-1.5 rounded-md text-[11px] text-ink/75 hover:bg-ink/[0.04] disabled:opacity-40"
            >
              {hasSource && !hasAsset ? '继续转深度' : '上传源视频并转深度'}
            </button>
            <button
              type="button"
              disabled={converting}
              onClick={() => {
                onDirect();
              }}
              className="w-full text-left px-2 py-1.5 rounded-md text-[11px] text-ink/75 hover:bg-ink/[0.04] disabled:opacity-40"
            >
              直接填深度视频
            </button>
            {(hasAsset || hasSource) && (
              <button
                type="button"
                disabled={converting}
                onClick={() => {
                  onClear();
                }}
                className="w-full text-left px-2 py-1.5 rounded-md text-[11px] text-warn/80 hover:bg-ink/[0.04] disabled:opacity-40"
              >
                清空
              </button>
            )}
          </div>
        </div>
      </ComposerPopover>
    </>
  );
}

/** 人物 / 场景：下拉小框，可增减数量 */
function AssetGroupButton({
  role,
  label,
  required,
  slots,
  busyId,
  onUpload,
  onAdd,
  onRemove,
}: {
  role: 'character' | 'scene';
  label: string;
  required?: boolean;
  slots: ReferenceSlot[];
  busyId: string | null;
  onUpload: (slotId: string) => void;
  onAdd: () => void;
  onRemove: (slotId: string) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const filled = slots.filter((s) => s.assetUrl).length;
  const countLabel = String(filled);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseDown={stop}
        onClick={() => setOpen((v) => !v)}
        className={triggerClass(open || filled > 0)}
        title={`${label}参考（可增减）`}
      >
        <ImagePlus size={11} className="opacity-70" />
        <span>
          {label}
          {required ? <span className="text-warn/80">*</span> : null}
        </span>
        <span className="text-[9px] opacity-60 tabular-nums">{countLabel}</span>
        <ChevronDown size={10} className="opacity-50" />
      </button>

      <ComposerPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={btnRef}
        placement="above"
        align="end"
        width={220}
        tone="desk"
      >
        <div className="px-2 pt-2 pb-1.5" onMouseDown={stop}>
          <div className="flex items-center justify-between px-0.5 mb-1.5">
            <p className="text-[10px] font-medium text-ink/65">
              {label}参考
              {required ? <span className="text-warn/80"> *</span> : null}
            </p>
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex items-center gap-0.5 text-[9px] text-brand hover:opacity-80"
            >
              <Plus size={10} />
              添加
            </button>
          </div>

          {slots.length === 0 ? (
            <button
              type="button"
              onClick={onAdd}
              className="w-full py-3 rounded-lg border border-dashed border-line/40 text-[10px] text-ink/40 hover:border-brand/30 hover:text-ink/60"
            >
              点击添加{label}
            </button>
          ) : (
            <div className="space-y-1 max-h-[180px] overflow-y-auto nx9-scroll pr-0.5">
              {slots.map((slot, index) => {
                const busy = busyId === slot.id;
                return (
                  <div
                    key={slot.id}
                    className="flex items-center gap-1.5 rounded-md border border-line/30 px-1.5 py-1"
                  >
                    {slot.assetUrl ? (
                      <div className="relative w-8 h-8 rounded overflow-hidden border border-line/35 shrink-0 group">
                        <img src={slot.assetUrl} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => onUpload(slot.id)}
                          className="absolute inset-0 flex items-center justify-center bg-ink/50 text-white opacity-0 group-hover:opacity-100 text-[8px]"
                        >
                          换图
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onUpload(slot.id)}
                        className="w-8 h-8 rounded border border-dashed border-line/45 flex items-center justify-center text-ink/35 hover:border-brand/35 shrink-0"
                      >
                        {busy ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <ImagePlus size={11} />
                        )}
                      </button>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-ink/70 truncate">
                        {slot.label || `${label}${index + 1}`}
                        {slot.required ? <span className="text-warn/70">*</span> : null}
                      </p>
                      <p className="text-[8px] text-ink/35">
                        {slot.assetUrl ? '已上传' : '待上传'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="text-[9px] text-brand shrink-0"
                      onClick={() => onUpload(slot.id)}
                    >
                      {slot.assetUrl ? '更换' : '上传'}
                    </button>
                    <button
                      type="button"
                      disabled={role === 'character' && slots.length <= 1}
                      onClick={() => onRemove(slot.id)}
                      className="p-0.5 rounded text-ink/30 hover:text-warn disabled:opacity-25 shrink-0"
                      title={role === 'character' && slots.length <= 1 ? '至少保留一人' : '移除'}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ComposerPopover>
    </>
  );
}

export interface VideoPlaybookToolsProps {
  label: string;
  hint: string;
  slots: ReferenceSlot[];
  statusText?: string;
  onClearPlaybook: () => void;
  onSlotsChange: (slots: ReferenceSlot[]) => void;
  onBusy?: (msg: string) => void;
}

/**
 * 输入框上方玩法工具：深度 / 人物 / 场景统一为下拉触发器（右侧密排）。
 */
export function VideoPlaybookTools({
  label,
  hint,
  slots,
  statusText,
  onClearPlaybook,
  onSlotsChange,
  onBusy,
}: VideoPlaybookToolsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingSlotId, setPendingSlotId] = useState<string | null>(null);
  const [pendingMode, setPendingMode] = useState<'asset' | 'source' | 'depth'>('asset');
  const [busyId, setBusyId] = useState<string | null>(null);

  const depthSlot = useMemo(
    () => slots.find((s) => s.role === 'depth_motion'),
    [slots],
  );
  const characterSlots = useMemo(
    () => slots.filter((s) => s.role === 'character'),
    [slots],
  );
  const sceneSlots = useMemo(
    () => slots.filter((s) => s.role === 'scene'),
    [slots],
  );

  const patchSlot = useCallback(
    (id: string, patch: Partial<ReferenceSlot>) => {
      onSlotsChange(slots.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    },
    [onSlotsChange, slots],
  );

  const openPicker = (slotId: string, mode: 'asset' | 'source' | 'depth') => {
    setPendingSlotId(slotId);
    setPendingMode(mode);
    const slot = slots.find((s) => s.id === slotId);
    if (fileRef.current) {
      fileRef.current.accept =
        mode === 'source' || mode === 'depth' || slot?.mediaType === 'video'
          ? 'video/*'
          : 'image/*';
      fileRef.current.click();
    }
  };

  const convertFromUrl = async (slotId: string, sourceUrl: string) => {
    setBusyId(slotId);
    patchSlot(slotId, {
      sourceVideoUrl: sourceUrl,
      convertStatus: 'converting',
      convertError: undefined,
    });
    onBusy?.('深度转换中…');
    try {
      const res = await api.convertDepthVideo({ sourceUrl });
      if (!res.depthVideoUrl) {
        throw new Error(res.message || '深度转换未返回视频');
      }
      patchSlot(slotId, {
        assetUrl: res.depthVideoUrl,
        sourceVideoUrl: sourceUrl,
        convertStatus: 'ready',
        convertError: undefined,
      });
    } catch (e) {
      patchSlot(slotId, {
        convertStatus: 'error',
        convertError: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusyId(null);
      onBusy?.('');
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file || !pendingSlotId) return;
    const slotId = pendingSlotId;
    const mode = pendingMode;
    setPendingSlotId(null);
    setBusyId(slotId);
    onBusy?.('上传中…');
    try {
      const res = await api.uploadAsset(file);
      if (mode === 'source') {
        setBusyId(null);
        await convertFromUrl(slotId, res.url);
        return;
      }
      if (mode === 'depth') {
        patchSlot(slotId, {
          assetUrl: res.url,
          convertStatus: 'ready',
          convertError: undefined,
        });
      } else {
        patchSlot(slotId, { assetUrl: res.url, convertStatus: 'ready' });
      }
    } catch (e) {
      patchSlot(slotId, {
        convertStatus: 'error',
        convertError: e instanceof Error ? e.message : String(e),
      });
    } finally {
      if (mode !== 'source') {
        setBusyId(null);
        onBusy?.('');
      }
    }
  };

  const startDepthFlow = (slot: ReferenceSlot) => {
    if (slot.sourceVideoUrl && !slot.assetUrl) {
      void convertFromUrl(slot.id, slot.sourceVideoUrl);
      return;
    }
    openPicker(slot.id, 'source');
  };

  const addRoleSlot = (role: 'character' | 'scene') => {
    const next: ReferenceSlot = {
      id: uid(role),
      role,
      label: role === 'character' ? '人物' : '场景',
      mediaType: 'image',
      required: false,
      lock: true,
    };
    onSlotsChange(relabelGroup([...slots, next], role));
  };

  const removeRoleSlot = (slotId: string, role: 'character' | 'scene') => {
    const group = slots.filter((s) => s.role === role);
    if (role === 'character' && group.length <= 1) return;
    onSlotsChange(relabelGroup(slots.filter((s) => s.id !== slotId), role));
  };

  return (
    <div
      className="shrink-0 px-3 pt-1.5 pb-1 border-b border-line/25 nodrag nopan"
      onMouseDown={stop}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-brand/10 text-brand text-[10px] font-medium border border-brand/20 shrink-0">
          {label}
          <button
            type="button"
            onMouseDown={stop}
            onClick={onClearPlaybook}
            className="opacity-55 hover:opacity-100"
            title="清除热门玩法"
          >
            <X size={10} />
          </button>
        </span>
        <span
          className={`text-[9px] truncate min-w-0 flex-1 ${
            statusText ? 'text-warn/85' : 'text-ink/35'
          }`}
        >
          {statusText || hint}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {depthSlot ? (
            <DepthDropdownButton
              slot={depthSlot}
              busy={busyId === depthSlot.id}
              onConvert={() => startDepthFlow(depthSlot)}
              onDirect={() => openPicker(depthSlot.id, 'depth')}
              onClear={() =>
                patchSlot(depthSlot.id, {
                  assetUrl: undefined,
                  sourceVideoUrl: undefined,
                  convertStatus: 'idle',
                  convertError: undefined,
                })
              }
            />
          ) : null}
          <AssetGroupButton
            role="character"
            label="人物"
            required
            slots={characterSlots}
            busyId={busyId}
            onUpload={(id) => openPicker(id, 'asset')}
            onAdd={() => addRoleSlot('character')}
            onRemove={(id) => removeRoleSlot(id, 'character')}
          />
          <AssetGroupButton
            role="scene"
            label="场景"
            slots={sceneSlots}
            busyId={busyId}
            onUpload={(id) => openPicker(id, 'asset')}
            onAdd={() => addRoleSlot('scene')}
            onRemove={(id) => removeRoleSlot(id, 'scene')}
          />
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          void onFile(f);
        }}
      />
    </div>
  );
}
