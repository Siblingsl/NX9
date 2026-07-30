import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow } from '@xyflow/react';
import {
  BUILTIN_REFERENCE_PLAYBOOKS,
  assembleReferencePrompt,
  migrateLegacyBoardData,
  switchPlaybook,
  syncReferenceBoardEmitFields,
  validateReferenceSlots,
  type ReferenceBoardData,
  type ReferenceSlot,
} from '@nx9/shared';
import { ComposerWorkspaceShell } from '../composer/ComposerWorkspaceShell';
import { useAttachedNodeData } from '../generation/use-attached-node-data';
import ImageUploadSlot from '../../../../../blocks/shared/ImageUploadSlot';
import { api } from '../../../../../api/client';
import { getGenPack } from '../../../../../engine/gen-skill-runtime';

export interface ReferenceBoardWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

function MediaThumb({
  url,
  mediaType,
  label,
}: {
  url?: string;
  mediaType: string;
  label: string;
}) {
  if (!url) {
    return (
      <div className="aspect-video rounded-lg border border-dashed border-line bg-surface flex items-center justify-center text-[10px] text-ink/40">
        空
      </div>
    );
  }
  if (mediaType === 'video' || /\.(mp4|webm|mov)(\?|$)/i.test(url)) {
    return (
      <video
        src={url}
        className="aspect-video w-full rounded-lg border border-line object-cover bg-black"
        muted
        playsInline
        controls
        title={label}
      />
    );
  }
  return <img src={url} alt={label} className="aspect-video w-full rounded-lg border border-line object-cover" />;
}

function DepthCompareLightbox({
  open,
  sourceUrl,
  depthUrl,
  onClose,
}: {
  open: boolean;
  sourceUrl?: string;
  depthUrl?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal
    >
      <div
        className="bg-surface rounded-2xl border border-line max-w-4xl w-full p-3 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-ink">原片 / 深度对照</span>
          <button type="button" className="text-xs text-ink/60 hover:text-ink" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] text-ink/50 mb-1">原片</p>
            {sourceUrl ? (
              <video src={sourceUrl} controls className="w-full rounded-lg bg-black max-h-[60vh]" />
            ) : (
              <p className="text-xs text-ink/40">无源视频</p>
            )}
          </div>
          <div>
            <p className="text-[10px] text-ink/50 mb-1">深度</p>
            {depthUrl ? (
              <video src={depthUrl} controls className="w-full rounded-lg bg-black max-h-[60vh]" />
            ) : (
              <p className="text-xs text-ink/40">无深度视频</p>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ReferenceBoardWorkspace({ blockId, kind, onCollapse }: ReferenceBoardWorkspaceProps) {
  const { updateNodeData } = useReactFlow();
  const data = useAttachedNodeData(blockId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingSlotId, setPendingSlotId] = useState<string | null>(null);
  const [pendingAccept, setPendingAccept] = useState('image/*');
  const [pendingMode, setPendingMode] = useState<'asset' | 'source' | 'depth-direct'>('asset');
  const [compareOpen, setCompareOpen] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState('');
  const [assembling, setAssembling] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const board: ReferenceBoardData = useMemo(
    () => migrateLegacyBoardData(data as Record<string, unknown>),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- migrate from node data snapshot
    [
      data.playbookId,
      data.slots,
      data.boardImages,
      data.styleNotes,
      data.userPromptExtras,
      data.assembledPrompt,
      data.enforce,
      data.aspect,
      data.palette,
      data.pictures,
      data.content,
    ],
  );

  const playbook = useMemo(
    () => BUILTIN_REFERENCE_PLAYBOOKS.find((p) => p.id === board.playbookId),
    [board.playbookId],
  );

  const persist = useCallback(
    (next: ReferenceBoardData) => {
      const emit = syncReferenceBoardEmitFields(next);
      updateNodeData(blockId, emit);
    },
    [blockId, updateNodeData],
  );

  // 首次进入旧板时写回 playbook 结构
  useEffect(() => {
    if (!data.playbookId || !Array.isArray(data.slots) || !(data.slots as unknown[]).length) {
      persist(board);
    }
    // only bootstrap once when missing structure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockId]);

  const updateSlot = useCallback(
    (slotId: string, patch: Partial<ReferenceSlot>) => {
      const slots = board.slots.map((s) => (s.id === slotId ? { ...s, ...patch } : s));
      persist({ ...board, slots });
    },
    [board, persist],
  );

  const onPlaybookChange = useCallback(
    (id: string) => {
      persist(switchPlaybook(id, board));
      setDraftPrompt('');
      setMsg(null);
    },
    [board, persist],
  );

  const openUpload = useCallback((slot: ReferenceSlot, mode: 'asset' | 'source' | 'depth-direct') => {
    setPendingSlotId(slot.id);
    setPendingMode(mode);
    if (mode === 'source' || mode === 'depth-direct' || slot.mediaType === 'video') {
      setPendingAccept('video/*,.mp4,.webm,.mov');
    } else {
      setPendingAccept('image/*');
    }
    queueMicrotask(() => fileRef.current?.click());
  }, []);

  const onFile = useCallback(
    async (file: File) => {
      if (!pendingSlotId) return;
      const slotId = pendingSlotId;
      setPendingSlotId(null);
      try {
        const res = await api.uploadAsset(file);
        const url = res.url;
        if (pendingMode === 'source') {
          updateSlot(slotId, {
            sourceVideoUrl: url,
            convertStatus: 'idle',
            convertError: undefined,
          });
          setMsg('源视频已上传，可一键转深度');
        } else if (pendingMode === 'depth-direct') {
          updateSlot(slotId, {
            assetUrl: url,
            convertStatus: 'ready',
            convertError: undefined,
          });
          setMsg('已填入深度视频（跳过转换）');
        } else {
          updateSlot(slotId, {
            assetUrl: url,
            convertStatus: board.slots.find((s) => s.id === slotId)?.role === 'depth_motion' ? 'ready' : undefined,
          });
        }
      } catch (e) {
        setMsg(`上传失败：${String(e)}`);
      }
    },
    [pendingSlotId, pendingMode, updateSlot, board.slots],
  );

  const convertDepth = useCallback(
    async (slot: ReferenceSlot) => {
      const source = slot.sourceVideoUrl;
      if (!source) {
        setMsg('请先上传源动作视频');
        return;
      }
      updateSlot(slot.id, { convertStatus: 'converting', convertError: undefined });
      setMsg('深度转换中…');
      try {
        const res = await api.convertDepthVideo({ sourceUrl: source, maxDurationSec: 60 });
        if (!res.ok || !res.depthVideoUrl) {
          updateSlot(slot.id, {
            convertStatus: 'error',
            convertError: res.message || '转换失败',
          });
          setMsg(res.message || '深度转换失败');
          return;
        }
        updateSlot(slot.id, {
          assetUrl: res.depthVideoUrl,
          sourceVideoUrl: res.sourceUrl || source,
          convertStatus: 'ready',
          convertError: undefined,
        });
        setMsg(res.message || '深度视频已就绪');
      } catch (e) {
        updateSlot(slot.id, {
          convertStatus: 'error',
          convertError: String(e),
        });
        setMsg(`深度转换失败：${String(e)}`);
      }
    },
    [updateSlot],
  );

  const assemble = useCallback(async () => {
    setAssembling(true);
    setMsg(null);
    try {
      const skillId = playbook?.skillId || 'gen-depth-action-replica';
      const pack = skillId ? await getGenPack(skillId) : null;
      const result = assembleReferencePrompt(board, pack);
      if (result.blocked) {
        setMsg(result.reason || '无法装配');
        setDraftPrompt('');
        return;
      }
      setDraftPrompt(result.prompt);
      setMsg('已生成提示词，确认后写入并传给下游');
    } catch (e) {
      setMsg(`装配失败：${String(e)}`);
    } finally {
      setAssembling(false);
    }
  }, [board, playbook?.skillId]);

  const confirmPrompt = useCallback(() => {
    const text = (draftPrompt || board.assembledPrompt || '').trim();
    if (!text) {
      setMsg('请先生成或填写提示词');
      return;
    }
    const check = validateReferenceSlots(board.slots, board.enforce ?? false);
    if (!check.ready && board.enforce) {
      setMsg(check.reason || '必填槽未齐');
      return;
    }
    persist({ ...board, assembledPrompt: text });
    setDraftPrompt(text);
    setMsg('已确认装配提示词，可连线至视频生成');
  }, [board, draftPrompt, persist]);

  const depthSlot = board.slots.find((s) => s.role === 'depth_motion');
  const readiness = validateReferenceSlots(board.slots, board.enforce ?? false);

  return (
    <ComposerWorkspaceShell
      kind={kind}
      status={data.status as any}
      onCollapse={onCollapse}
      showRun={false}
      showAi={false}
      showAdvanced={false}
      showHistory={false}
      heightClass="h-[min(540px,58vh)] max-h-[560px]"
      bodyClassName="flex-1 min-h-0 px-3 py-2 overflow-y-auto nx9-scroll nowheel overscroll-contain text-xs"
    >
      <input
        ref={fileRef}
        type="file"
        accept={pendingAccept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = '';
        }}
      />

      <div className="space-y-3 nodrag nopan">
        {/* Playbook */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[10px] text-ink/50 shrink-0">玩法</label>
          <select
            className="flex-1 min-w-[140px] rounded-lg border border-line bg-surface px-2 py-1 text-xs"
            value={board.playbookId}
            onChange={(e) => onPlaybookChange(e.target.value)}
          >
            {BUILTIN_REFERENCE_PLAYBOOKS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
                {p.stub ? '（预留）' : ''}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-[10px] text-ink/60">
            <input
              type="checkbox"
              checked={Boolean(board.enforce)}
              onChange={(e) => persist({ ...board, enforce: e.target.checked })}
            />
            强约束
          </label>
          <select
            className="rounded-lg border border-line bg-surface px-2 py-1 text-[10px]"
            value={board.aspect || playbook?.defaultAspect || '9:16'}
            onChange={(e) => persist({ ...board, aspect: e.target.value })}
          >
            {['9:16', '16:9', '1:1', '3:4', '4:3'].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        {playbook?.description && (
          <p className="text-[10px] text-ink/45 leading-snug">{playbook.description}</p>
        )}

        {/* Slots */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {board.slots.map((slot) => {
            const isDepth = slot.role === 'depth_motion';
            return (
              <div
                key={slot.id}
                className="rounded-xl border border-line/80 bg-surface/80 p-2 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-medium text-ink truncate">
                    {slot.label}
                    {slot.required ? <em className="text-brand not-italic ml-0.5">*</em> : null}
                  </span>
                  <label className="flex items-center gap-0.5 text-[9px] text-ink/50 shrink-0">
                    <input
                      type="checkbox"
                      checked={slot.lock}
                      onChange={(e) => updateSlot(slot.id, { lock: e.target.checked })}
                    />
                    锁
                  </label>
                </div>

                {isDepth ? (
                  <>
                    <MediaThumb
                      url={slot.assetUrl || slot.sourceVideoUrl}
                      mediaType="video"
                      label={slot.label}
                    />
                    {slot.convertStatus === 'converting' && (
                      <p className="text-[10px] text-brand">转换中…</p>
                    )}
                    {slot.convertStatus === 'error' && (
                      <p className="text-[10px] text-red-600">{slot.convertError || '转换失败'}</p>
                    )}
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="rounded-md border border-line px-1.5 py-0.5 text-[9px] hover:border-brand/50"
                        onClick={() => openUpload(slot, 'source')}
                      >
                        上传源视频
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-brand/40 bg-brand/10 px-1.5 py-0.5 text-[9px] text-brand disabled:opacity-40"
                        disabled={!slot.sourceVideoUrl || slot.convertStatus === 'converting'}
                        onClick={() => void convertDepth(slot)}
                      >
                        转深度
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-line px-1.5 py-0.5 text-[9px]"
                        onClick={() => openUpload(slot, 'depth-direct')}
                      >
                        直接填深度
                      </button>
                      {(slot.assetUrl || slot.sourceVideoUrl) && (
                        <button
                          type="button"
                          className="rounded-md border border-line px-1.5 py-0.5 text-[9px]"
                          onClick={() => setCompareOpen(true)}
                        >
                          对照
                        </button>
                      )}
                      <button
                        type="button"
                        className="rounded-md border border-line px-1.5 py-0.5 text-[9px] text-ink/45"
                        onClick={() =>
                          updateSlot(slot.id, {
                            assetUrl: undefined,
                            sourceVideoUrl: undefined,
                            convertStatus: 'idle',
                            convertError: undefined,
                          })
                        }
                      >
                        清空
                      </button>
                    </div>
                    {slot.sourceVideoUrl && slot.assetUrl && (
                      <div className="grid grid-cols-2 gap-1">
                        <div>
                          <p className="text-[8px] text-ink/40 mb-0.5">原</p>
                          <video src={slot.sourceVideoUrl} className="aspect-video w-full rounded object-cover bg-black" muted playsInline />
                        </div>
                        <div>
                          <p className="text-[8px] text-ink/40 mb-0.5">深</p>
                          <video src={slot.assetUrl} className="aspect-video w-full rounded object-cover bg-black" muted playsInline />
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <ImageUploadSlot
                      url={slot.assetUrl}
                      label={slot.mediaType === 'video' ? '上传视频' : '上传图片'}
                      compact
                      accept={slot.mediaType === 'video' ? 'video/*' : 'image/*'}
                      aspectClass="aspect-video"
                      onUploaded={(url) => updateSlot(slot.id, { assetUrl: url })}
                      onClear={() => updateSlot(slot.id, { assetUrl: undefined })}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Extras */}
        <textarea
          value={board.userPromptExtras ?? ''}
          onChange={(e) => persist({ ...board, userPromptExtras: e.target.value })}
          placeholder="补句：风格、台词、情绪、禁则…"
          className="w-full min-h-[52px] rounded-xl border border-line px-2 py-1.5 resize-y bg-surface"
        />

        {board.playbookId === 'mood-board' && (
          <div className="flex gap-1 flex-wrap">
            {(board.palette ?? ['#0F766E', '#1E3A5F', '#F4F1EA']).map((color, i) => (
              <input
                key={i}
                type="color"
                value={color}
                onChange={(e) => {
                  const next = [...(board.palette ?? [])];
                  next[i] = e.target.value;
                  persist({ ...board, palette: next });
                }}
                className="w-7 h-7 rounded border border-line cursor-pointer"
              />
            ))}
          </div>
        )}

        {/* Assemble */}
        <div className="rounded-xl border border-line/70 p-2 space-y-1.5 bg-surface">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="rounded-lg bg-brand text-white px-2.5 py-1 text-[11px] disabled:opacity-50"
              disabled={assembling}
              onClick={() => void assemble()}
            >
              {assembling ? '装配中…' : '生成提示词'}
            </button>
            <button
              type="button"
              className="rounded-lg border border-line px-2.5 py-1 text-[11px]"
              onClick={confirmPrompt}
            >
              确认写入
            </button>
            {!readiness.ready && (
              <span className="text-[10px] text-amber-700 self-center">{readiness.reason}</span>
            )}
          </div>
          <textarea
            value={draftPrompt || board.assembledPrompt || ''}
            onChange={(e) => setDraftPrompt(e.target.value)}
            placeholder="装配提示词预览…"
            className="w-full min-h-[72px] rounded-lg border border-line px-2 py-1.5 resize-y bg-canvas text-[11px] leading-relaxed"
          />
          {board.assembledPrompt && (
            <p className="text-[9px] text-ink/40 truncate">已确认：{board.assembledPrompt.slice(0, 80)}…</p>
          )}
        </div>

        {msg && <p className="text-[10px] text-ink/55">{msg}</p>}
      </div>

      <DepthCompareLightbox
        open={compareOpen}
        sourceUrl={depthSlot?.sourceVideoUrl}
        depthUrl={depthSlot?.assetUrl}
        onClose={() => setCompareOpen(false)}
      />
    </ComposerWorkspaceShell>
  );
}
