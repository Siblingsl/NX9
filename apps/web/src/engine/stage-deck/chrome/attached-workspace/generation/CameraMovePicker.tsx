/**
 * 大师运镜选择器（增量新增）。
 *
 * 词库：`@nx9/shared` 的 `CAMERA_MOVE_LIBRARY`
 * （源码 `packages/shared/src/data/camera-move-library.ts`，共 50+ 条经典运镜）。
 *
 * 交互：按家族分组 + 搜索 + 多选 + 一键清除；选中即把运镜片段注入提示词。
 * 落库约定：**不新增持久化字段名**，注入结果由调用方写回既有提示词字段
 * （视频/图片工作台走 `useLocalNodePrompt.applyText`，分镜编辑走 `editDraft.videoPrompt`）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, Search } from 'lucide-react';
import {
  CAMERA_MOVE_FAMILY_LABELS,
  CAMERA_MOVE_FAMILY_ORDER,
  buildCameraMovePrompt,
  cameraMovesByFamily,
  searchCameraMoves,
  withCameraMovePrompt,
  type CameraMoveDef,
  type CameraMoveFamily,
} from '@nx9/shared';
import { ComposerPopover } from '../composer/ComposerPopover';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

const EMPTY_IDS: string[] = [];

export type CameraMovePickerVariant = 'toolbar' | 'header' | 'inline';

export interface CameraMovePickerProps {
  /** 当前提示词文本（注入基准 + 预览） */
  value: string;
  /** 注入结果回调：把完整新文本写回既有提示词字段 */
  onApply: (next: string) => void;
  /** 切换节点/镜头时重置会话内选中态 */
  resetKey?: string;
  variant?: CameraMovePickerVariant;
  disabled?: boolean;
  /** 默认注入语言（英文片段适合多数模型；中文适合国内模型） */
  defaultLang?: 'en' | 'zh';
}

const TRIGGER_CLASS: Record<CameraMovePickerVariant, string> = {
  toolbar:
    'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] transition-colors',
  header:
    'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition-colors',
  inline: 'sg-btn sg-btn--ghost inline-flex items-center gap-1',
};

/** 是否已注入运镜行（英文 `camera movement:` / 中文 `运镜：`） */
function hasCameraMoveLine(text: string): boolean {
  return text
    .split('\n')
    .some((line) => {
      const t = line.trim();
      return t.toLowerCase().startsWith('camera movement:') || t.startsWith('运镜：');
    });
}

export function CameraMovePicker({
  value,
  onApply,
  resetKey,
  variant = 'toolbar',
  disabled,
  defaultLang = 'en',
}: CameraMovePickerProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [lang, setLang] = useState<'en' | 'zh'>(defaultLang);
  const [selected, setSelected] = useState<string[]>(EMPTY_IDS);

  // 切换节点 / 镜头时清空会话内选中态（提示词文本本身仍由调用方持有）
  useEffect(() => {
    setSelected(EMPTY_IDS);
    setQuery('');
  }, [resetKey]);

  // 外部把注入行删掉后，选中态一并视为清空，避免「界面有勾、词里没有」
  const injected = useMemo(() => hasCameraMoveLine(value), [value]);
  const activeIds = injected ? selected : EMPTY_IDS;

  const results = useMemo(() => searchCameraMoves(query), [query]);
  const grouped = useMemo(() => {
    return CAMERA_MOVE_FAMILY_ORDER.map((family) => ({
      family,
      moves: results.filter((m) => m.family === family),
    })).filter((g) => g.moves.length > 0);
  }, [results]);

  const preview = useMemo(() => buildCameraMovePrompt(activeIds, { lang }), [activeIds, lang]);

  const applyIds = (ids: string[], nextLang: 'en' | 'zh' = lang) => {
    setSelected(ids);
    onApply(withCameraMovePrompt(value, ids, { lang: nextLang }));
  };

  const toggle = (def: CameraMoveDef) => {
    const base = injected ? selected : EMPTY_IDS;
    const next = base.includes(def.id)
      ? base.filter((id) => id !== def.id)
      : [...base, def.id];
    applyIds(next);
  };

  const switchLang = (nextLang: 'en' | 'zh') => {
    setLang(nextLang);
    if (activeIds.length > 0) applyIds(activeIds, nextLang);
  };

  const activeLabel = activeIds.length > 0 ? `运镜 ${activeIds.length}` : '大师运镜';

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onMouseDown={stop}
        onClick={() => setOpen((v) => !v)}
        title="大师运镜：推/拉/摇/移/跟/升降/环绕/变焦/手持/航拍/特殊"
        className={`${TRIGGER_CLASS[variant]} ${
          open || activeIds.length > 0
            ? 'bg-brand/10 text-brand'
            : 'text-ink/55 hover:text-ink hover:bg-surface/90'
        } ${disabled ? 'opacity-45 cursor-not-allowed' : ''}`}
      >
        <Camera size={variant === 'header' ? 13 : 12} />
        <span className="max-w-[88px] truncate">{activeLabel}</span>
      </button>

      <ComposerPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={btnRef}
        placement="above"
        align="start"
        width={420}
        tone="desk"
      >
        <div className="px-2.5 pt-2.5 pb-2" onMouseDown={stop}>
          <div className="flex items-center gap-2 px-1 mb-2">
            <p className="text-[11px] font-medium text-ink/70">大师运镜</p>
            <span className="text-[9px] text-ink/35">按家族分组 · 可多选叠加</span>
            <div className="ml-auto flex items-center gap-0.5">
              {(['en', 'zh'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => switchLang(l)}
                  className={`px-1.5 py-0.5 rounded-md text-[9px] transition-colors ${
                    lang === l ? 'bg-brand/10 text-brand' : 'text-ink/45 hover:text-ink'
                  }`}
                >
                  {l === 'en' ? '英文' : '中文'}
                </button>
              ))}
            </div>
          </div>

          <div className="relative px-1 mb-1.5">
            <Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索运镜：缓推 / 环绕 / 希区柯克 / whip…"
              className="w-full rounded-lg border border-line/50 pl-7 pr-2 py-1 text-[11px] focus:outline-none focus:border-brand/40"
            />
          </div>

          <div className="max-h-[236px] overflow-y-auto nx9-scroll pr-0.5">
            {grouped.length === 0 && (
              <p className="px-2 py-3 text-[10px] text-ink/35">没有匹配的运镜</p>
            )}
            {grouped.map(({ family, moves }) => (
              <div key={family} className="mb-1.5">
                <p className="px-1.5 mb-0.5 text-[10px] font-medium text-ink/40 tracking-wide">
                  {CAMERA_MOVE_FAMILY_LABELS[family as CameraMoveFamily] ?? family}
                </p>
                {moves.map((m) => {
                  const active = activeIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggle(m)}
                      title={m.descZh}
                      className={`w-full flex items-start gap-2 px-1.5 py-1.5 rounded-lg text-left transition-colors ${
                        active ? 'bg-brand/10 text-ink' : 'text-ink/70 hover:bg-ink/[0.04]'
                      }`}
                    >
                      <span
                        className={`mt-0.5 shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center ${
                          active
                            ? 'border-brand bg-brand/15 text-brand'
                            : 'border-line/60 text-transparent'
                        }`}
                      >
                        <Check size={9} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[11px] font-medium leading-tight">
                          {m.labelZh}
                          <span className="ml-1 text-[9px] font-normal text-ink/35">
                            {m.labelEn}
                          </span>
                          {m.difficulty === 'pro' && (
                            <span className="ml-1 text-[8px] text-warn/80">进阶</span>
                          )}
                        </span>
                        <span className="block text-[9px] text-ink/40 leading-snug line-clamp-2">
                          {m.descZh}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="mt-1.5 border-t border-line/25 pt-1.5 px-1">
            <p className="text-[9px] text-ink/40">注入预览</p>
            <p className="text-[9px] text-ink/60 leading-snug break-words min-h-[12px]">
              {preview
                ? `${lang === 'zh' ? '运镜：' : 'camera movement: '}${preview}`
                : '未选择运镜（选择后追加到提示词）'}
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              <button
                type="button"
                disabled={activeIds.length === 0}
                onClick={() => applyIds(EMPTY_IDS)}
                className="rounded-md border border-line/40 px-2 py-0.5 text-[9px] text-ink/55 hover:text-ink disabled:opacity-40"
              >
                清除运镜
              </button>
              <span className="text-[9px] text-ink/30">
                写入既有提示词字段，不新增字段
              </span>
            </div>
          </div>
        </div>
      </ComposerPopover>
    </>
  );
}
