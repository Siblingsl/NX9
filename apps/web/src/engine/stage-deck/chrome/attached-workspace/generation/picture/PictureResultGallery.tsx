import { useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Expand,
  FileText,
  History,
  Mountain,
  PackagePlus,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { setMediaPinDragData } from '../../../../../media-pin-drag';
import type { PictureGenerationHistoryEntry } from '../../../../../picture-gen-history';
import { ComposerPopover } from '../../composer/ComposerPopover';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

const iconBtnClass =
  'inline-flex h-4 w-4 items-center justify-center rounded text-ink/45 hover:bg-brand/10 hover:text-brand';

/** PG-10: 下载生成图（跨域失败时回退新窗口打开） */
async function downloadImage(url: string, index: number): Promise<void> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ext = blob.type.includes('png') ? 'png' : 'jpg';
    a.href = objectUrl;
    a.download = `nx9-picture-${Date.now()}-${index + 1}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

export interface PictureResultGalleryProps {
  urls: string[];
  selectedIndex?: number;
  onSelect?: (index: number) => void;
  /** 确认后删除第 index 张生成图 */
  onDelete?: (index: number) => void;
  /** PG-10/PG-23: 把选中生成图入库为场景 / 道具 / 角色定妆 */
  onSaveToLibrary?: (url: string, kind: 'scene' | 'prop') => void;
  onSaveToCharacter?: (url: string, characterId: string) => void;
  characters?: { id: string; name: string }[];
  history?: PictureGenerationHistoryEntry[];
  onRestoreHistory?: (id: string) => void;
  /** PG-45: 只恢复该轮用户提示词，不替换当前生成结果 */
  onRestorePrompt?: (entryId: string) => void;
  /** PG-33: 批量失败条目（第 n 条 + 错误摘要） */
  failures?: { index: number; error: string }[];
  /** 拖出钉板时的来源节点 id */
  sourceBlockId?: string;
  /** 最近一次实际发给上游的编译提示词（兼容旧调用；优先用 compiledPromptsByUrl） */
  compiledPrompt?: string;
  /** 每张生成图自己的发送稿（url → prompt） */
  compiledPromptsByUrl?: Record<string, string>;
  /** @deprecated 空列表直接不渲染，保留以免调用方报错 */
  emptyHint?: string;
  showLabel?: boolean;
}

/** 工作区内生成结果条 — 无结果时不渲染；样式由父级双列布局承载 */
export function PictureResultGallery({
  urls,
  selectedIndex = 0,
  onSelect,
  onDelete,
  onSaveToLibrary,
  onSaveToCharacter,
  characters = [],
  history = [],
  onRestoreHistory,
  onRestorePrompt,
  failures = [],
  sourceBlockId,
  compiledPrompt,
  compiledPromptsByUrl,
  showLabel = true,
}: PictureResultGalleryProps) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [charMenu, setCharMenu] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const draggedRef = useRef(false);
  const promptBtnRef = useRef<HTMLButtonElement>(null);

  if (urls.length === 0 && failures.length === 0) return null;

  const pendingUrl = pendingDelete != null ? urls[pendingDelete] : null;
  const safeIndex = Math.min(Math.max(selectedIndex, 0), Math.max(0, urls.length - 1));
  const selectedUrl = urls[safeIndex];
  const promptText = (
    (selectedUrl && compiledPromptsByUrl?.[selectedUrl]?.trim()) ||
    (selectedUrl && compiledPromptsByUrl?.[selectedUrl.trim()]?.trim()) ||
    // 仅选中最新一张时，才允许回退到单值 compiledPrompt
    (safeIndex === 0 ? compiledPrompt?.trim() : '') ||
    ''
  ).trim();
  const showActions = Boolean(selectedUrl || promptText);

  const closeOtherMenus = (keep?: 'char' | 'history' | 'prompt') => {
    if (keep !== 'char') setCharMenu(false);
    if (keep !== 'history') setHistoryOpen(false);
    if (keep !== 'prompt') setPromptOpen(false);
  };

  const handleCopyPrompt = async () => {
    if (!promptText) return;
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="min-w-0 flex flex-col gap-1.5 nodrag nopan" onMouseDown={stop}>
      {showLabel && (
        <div className="flex h-5 shrink-0 items-center justify-between gap-2 min-w-0">
          <div
            className="flex h-full items-center gap-1 min-w-0"
            title="拖出缩略图可钉到画布"
          >
            <span className="shrink-0 text-[9px] leading-none font-medium text-ink/50 tracking-wide">
              生成结果
            </span>
            <span className="shrink-0 text-[9px] leading-none text-ink/30 tabular-nums">
              {urls.length}
            </span>
          </div>
          {showActions ? (
            <div className="flex h-full shrink-0 items-center gap-0.5">
              {promptText ? (
                <>
                  <button
                    ref={promptBtnRef}
                    type="button"
                    onMouseDown={stop}
                    onClick={() => {
                      closeOtherMenus('prompt');
                      setPromptOpen((v) => !v);
                      setCopied(false);
                    }}
                    className={iconBtnClass}
                    title="查看发送稿"
                    aria-label="查看发送稿"
                  >
                    <FileText size={11} />
                  </button>
                  <ComposerPopover
                    open={promptOpen}
                    onClose={() => setPromptOpen(false)}
                    anchorRef={promptBtnRef}
                    placement="below"
                    align="end"
                    width={180}
                    tone="desk"
                  >
                    <div className="px-2 pt-1.5 pb-2" onMouseDown={stop}>
                      <div className="mb-1.5 flex items-center justify-between gap-1.5">
                        <span className="shrink-0 text-[10px] font-medium text-ink/75">发送稿</span>
                        <button
                          type="button"
                          onClick={() => void handleCopyPrompt()}
                          className="inline-flex shrink-0 items-center gap-0.5 rounded border border-brand/35 bg-brand/15 px-1.5 py-0.5 text-[9px] font-medium text-brand hover:bg-brand/25"
                          title="复制发送稿"
                          aria-label="复制发送稿"
                        >
                          {copied ? <Check size={10} /> : <Copy size={10} />}
                          {copied ? '已复制' : '复制'}
                        </button>
                      </div>
                      <pre className="max-h-28 overflow-y-auto nx9-scroll whitespace-pre-wrap break-words rounded-md border border-line/40 bg-surface px-1.5 py-1 text-[9px] leading-snug text-ink/75">
                        {promptText}
                      </pre>
                    </div>
                  </ComposerPopover>
                </>
              ) : null}
              {selectedUrl ? (
                <>
                  <button
                    type="button"
                    onMouseDown={stop}
                    onClick={() => void downloadImage(selectedUrl, selectedIndex ?? 0)}
                    className={iconBtnClass}
                    title="下载选中图"
                    aria-label="下载选中图"
                  >
                    <Download size={11} />
                  </button>
                  {onSaveToLibrary && (
                    <>
                      <button
                        type="button"
                        onMouseDown={stop}
                        onClick={() => onSaveToLibrary(selectedUrl, 'scene')}
                        className={iconBtnClass}
                        title="入库为场景参考"
                        aria-label="入库为场景参考"
                      >
                        <Mountain size={11} />
                      </button>
                      <button
                        type="button"
                        onMouseDown={stop}
                        onClick={() => onSaveToLibrary(selectedUrl, 'prop')}
                        className={iconBtnClass}
                        title="入库为道具参考"
                        aria-label="入库为道具参考"
                      >
                        <PackagePlus size={11} />
                      </button>
                    </>
                  )}
                  {onSaveToCharacter && characters.length > 0 && (
                    <span className="relative flex h-full items-center">
                      <button
                        type="button"
                        onMouseDown={stop}
                        onClick={() => {
                          closeOtherMenus('char');
                          setCharMenu((v) => !v);
                        }}
                        className={iconBtnClass}
                        title="入库为角色定妆"
                        aria-label="入库为角色定妆"
                      >
                        <UserPlus size={11} />
                      </button>
                      {charMenu && (
                        <div
                          className="absolute right-0 top-full z-30 mt-1 min-w-[140px] max-h-40 overflow-y-auto rounded-lg border border-line/40 bg-surface py-1 shadow-lg"
                          onMouseDown={stop}
                        >
                          {characters.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                onSaveToCharacter(selectedUrl, c.id);
                                setCharMenu(false);
                              }}
                              className="block w-full px-2 py-1 text-left text-[10px] text-ink/70 hover:bg-brand/10 hover:text-brand truncate"
                            >
                              {c.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </span>
                  )}
                  {history.length > 0 && onRestoreHistory && (
                    <button
                      type="button"
                      onMouseDown={stop}
                      onClick={() => {
                        closeOtherMenus('history');
                        setHistoryOpen((v) => !v);
                      }}
                      className={iconBtnClass}
                      title={`历史生成 ${history.length} 轮`}
                      aria-label={`历史生成 ${history.length} 轮`}
                    >
                      <History size={11} />
                    </button>
                  )}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      <div className="flex items-center gap-1.5 overflow-x-auto nx9-scroll nx9-picture-strip-scroll pb-0.5">
        {urls.map((url, i) => {
          const active = i === selectedIndex;
          return (
            <div
              key={`${url}-${i}`}
              draggable
              onDragStart={(e) => {
                draggedRef.current = true;
                const img = e.currentTarget.querySelector('img');
                setMediaPinDragData(
                  e.dataTransfer,
                  {
                    url,
                    source: 'generated',
                    label: `生成 ${i + 1}`,
                    pinKind: 'picture',
                    sourceBlockId,
                  },
                  img,
                );
              }}
              onDragEnd={() => {
                window.setTimeout(() => {
                  draggedRef.current = false;
                }, 0);
              }}
              className={`relative w-14 h-14 rounded-lg overflow-hidden border shrink-0 transition-all group cursor-grab active:cursor-grabbing ${
                active
                  ? 'border-brand/50 ring-1 ring-brand/25'
                  : 'border-line/40 hover:border-brand/30'
              }`}
            >
              <button
                type="button"
                onPointerDown={() => {
                  onSelect?.(i);
                  setPromptOpen(false);
                }}
                onDoubleClick={() => setLightbox(url)}
                className="absolute inset-0"
                title={`生成图 ${i + 1} · 拖出钉到画布 · 双击放大`}
              >
                <img src={url} alt="" className="w-full h-full object-cover pointer-events-none" />
              </button>
              <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent text-white text-[8px] text-center py-0.5">
                生成
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox(url);
                }}
                className="absolute top-0.5 left-0.5 p-0.5 rounded-md bg-ink/55 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                title="放大"
              >
                <Expand size={9} />
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingDelete(i);
                  }}
                  className="absolute top-0.5 right-0.5 p-0.5 rounded-md bg-ink/55 text-white opacity-0 group-hover:opacity-100 hover:bg-rose-600/90 transition-opacity"
                  title="删除"
                >
                  <Trash2 size={9} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {historyOpen && history.length > 0 && onRestoreHistory && (
        <div className="flex flex-col gap-1">
          <span className="text-[9px] text-ink/40">此前各轮 · 点击恢复为当前结果</span>
          <div className="flex items-center gap-1.5 overflow-x-auto nx9-scroll pb-0.5">
            {history.map((entry) => (
              <div key={entry.id} className="flex flex-col items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onMouseDown={stop}
                  onClick={() => onRestoreHistory(entry.id)}
                  className="relative w-12 h-12 rounded-lg overflow-hidden border border-line/40 hover:border-brand/40"
                  title={`${entry.prompt || '上一轮'} · ${new Date(entry.createdAt).toLocaleString()}`}
                >
                  <img src={entry.urls[0]} alt="" className="w-full h-full object-cover" />
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-ink/60 text-white text-[8px] text-center">
                    {entry.urls.length}
                  </span>
                </button>
                {onRestorePrompt && (
                  <button
                    type="button"
                    onMouseDown={stop}
                    onClick={() => onRestorePrompt(entry.id)}
                    className="text-[8px] text-ink/40 hover:text-brand whitespace-nowrap"
                    title="恢复该轮用户提示词，不替换当前生成图"
                  >
                    恢复提示词
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {failures.length > 0 && (
        <div className="flex flex-col gap-0.5 rounded-md border border-rose-500/20 bg-rose-500/5 px-2 py-1">
          <span className="text-[9px] font-medium text-rose-700/80">
            本批失败 {failures.length} 条
          </span>
          {failures.slice(0, 6).map((f) => (
            <span key={`${f.index}-${f.error.slice(0, 24)}`} className="text-[9px] text-rose-800/70 truncate">
              第 {f.index + 1} 条 · {f.error}
            </span>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/70 p-6"
          onClick={() => setLightbox(null)}
          onMouseDown={stop}
        >
          <img
            src={lightbox}
            alt=""
            className="max-w-full max-h-full rounded-xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {pendingDelete != null && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center p-6"
          style={{ background: 'rgba(8, 9, 11, 0.78)' }}
          onClick={() => setPendingDelete(null)}
          onMouseDown={stop}
        >
          <div
            className="w-[280px] rounded-2xl border p-4"
            style={{
              background: 'var(--desk-bg-2, #1c1e21)',
              borderColor: 'var(--desk-line-strong, rgba(255,255,255,0.12))',
              boxShadow: '0 20px 48px rgba(0,0,0,0.55)',
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={stop}
          >
            <p className="text-[13px] font-medium text-ink mb-1">移入资产回收站？</p>
            <p className="text-[11px] text-ink/50 mb-3 leading-relaxed">
              将移出本工作区生成结果，并保留在资产回收站 30 天，可随时恢复。若提示词里仍有对应
              @生成 引用，需自行清理。
            </p>
            {pendingUrl && (
              <img
                src={pendingUrl}
                alt=""
                className="w-full h-28 object-cover rounded-xl border border-line/30 mb-3"
              />
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="px-3 py-1.5 rounded-lg text-[12px] text-ink/60 hover:bg-surface/80"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  const idx = pendingDelete;
                  setPendingDelete(null);
                  if (lightbox === pendingUrl) setLightbox(null);
                  onDelete?.(idx);
                }}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-white bg-rose-600 hover:bg-rose-500"
              >
                移入回收站
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
