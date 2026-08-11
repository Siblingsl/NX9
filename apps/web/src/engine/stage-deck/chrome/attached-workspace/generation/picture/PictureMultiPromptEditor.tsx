import { useLayoutEffect, useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { AssetMentionInput } from '../../../asset-mention/AssetMentionInput';
import type { AssetLibraryKind } from '@nx9/shared';
import type { LocalMediaMentionItem } from '../../../asset-mention/local-media-mention';
import { MAX_PICTURE_MULTI_PROMPTS } from './picture-pro-actions';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

const MENTIONS: AssetLibraryKind[] = ['character', 'scene', 'costume', 'prop'];

/** 超过此条数时，列表区域出现滚动（≤2 条外层弹性撑开） */
const SCROLL_AFTER_COUNT = 2;

export interface PictureMultiPromptEditorProps {
  prompts: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  localMedia?: LocalMediaMentionItem[];
}

function autosizeTextareas(root: HTMLElement | null) {
  if (!root) return;
  root.querySelectorAll('textarea').forEach((el) => {
    const ta = el as HTMLTextAreaElement;
    ta.style.height = '0px';
    ta.style.height = `${Math.max(40, ta.scrollHeight)}px`;
  });
}

export function PictureMultiPromptEditor({
  prompts,
  onChange,
  placeholder = '描述这一张图的画面… 输入 @ 引用素材',
  localMedia,
}: PictureMultiPromptEditorProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const needListScroll = prompts.length > SCROLL_AFTER_COUNT;

  useLayoutEffect(() => {
    autosizeTextareas(listRef.current);
  }, [prompts]);

  const updateAt = (index: number, text: string) => {
    const next = [...prompts];
    next[index] = text;
    onChange(next);
    // 下一帧再量高，等 React 写入 value
    requestAnimationFrame(() => autosizeTextareas(listRef.current));
  };

  const removeAt = (index: number) => {
    if (prompts.length <= 1) {
      onChange(['']);
      return;
    }
    onChange(prompts.filter((_, i) => i !== index));
  };

  const addSlot = () => {
    if (prompts.length >= MAX_PICTURE_MULTI_PROMPTS) return;
    onChange([...prompts, '']);
  };

  return (
    <div className="flex flex-col gap-1.5 nodrag nopan" onMouseDown={stop}>
      <div
        ref={listRef}
        className={
          needListScroll
            ? 'max-h-[min(260px,38vh)] overflow-y-auto nowheel overscroll-contain nx9-scroll pr-0.5'
            : 'overflow-visible'
        }
      >
        {prompts.map((text, index) => (
          <div
            key={`mp-${index}`}
            className="border-b border-line/45 last:border-b-0 pb-2.5 mb-2.5 last:mb-0 last:pb-1"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink/55">
                <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded bg-brand/10 text-brand text-[10px] tabular-nums">
                  {index + 1}
                </span>
                第 {index + 1} 张
              </span>
              <button
                type="button"
                onMouseDown={stop}
                onClick={() => removeAt(index)}
                disabled={prompts.length <= 1 && !text.trim()}
                className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] text-ink/35 hover:text-red-500 disabled:opacity-30 disabled:pointer-events-none nodrag nopan"
                title="删除此提示词"
              >
                <Trash2 size={11} />
                删除
              </button>
            </div>
            <AssetMentionInput
              as="textarea"
              value={text}
              onChange={(next) => updateAt(index, next)}
              placeholder={placeholder}
              kinds={MENTIONS}
              localMedia={localMedia}
              highlightMentions
              className="w-full min-h-[40px] border-0 text-[12px] leading-relaxed resize-none overflow-hidden focus:outline-none bg-transparent text-ink/85 placeholder:text-ink/28 nodrag nopan"
              tone="desk"
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onMouseDown={stop}
        onClick={addSlot}
        disabled={prompts.length >= MAX_PICTURE_MULTI_PROMPTS}
        className="shrink-0 inline-flex items-center justify-center gap-1 w-full py-1.5 rounded-lg border border-dashed border-line/50 text-[11px] text-ink/45 hover:border-brand/35 hover:text-brand disabled:opacity-40 disabled:pointer-events-none nodrag nopan"
      >
        <Plus size={12} />
        添加提示词
        <span className="text-ink/30">
          ({prompts.length}/{MAX_PICTURE_MULTI_PROMPTS})
        </span>
      </button>
    </div>
  );
}
