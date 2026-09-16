/**
 * 预设段落选择器（增量新增）。
 *
 * 词表：`@nx9/shared` 的 `PRESET_SECTION_PRESETS`
 * （只读适配自 `packages/shared/src/data/*` 中原本没有前端入口的预设数组：
 *  电影感 `CINEMA_PROMPT_PRESETS` / 灯光 `LIGHT_RIG_PRESETS` /
 *  人像 `PORTRAIT_PRESETS` / 动漫标签 `ANIME_TAG_PRESETS`）。
 *
 * 交互：按 group 分组 + 搜索 + 多选 + 注入预览 + 一键清除，与既有
 * `CameraMovePicker`（大师运镜）同构。
 *
 * 落库约定：**不新增持久化字段名**。注入结果由调用方写回既有提示词字段
 * （生成工作台走 `useLocalNodePrompt.applyText`，分镜编辑走 `editDraft.videoPrompt`）。
 *
 * 与 `CameraMovePicker` 的差异（有意为之）：选中态**由提示词文本反推**，
 * 不再另存一份 session state。这样「界面有勾、词里没有」在结构上不可能出现：
 * 用户手动删掉注入行后，勾选会自动消失。前提是同一 section 内不存在
 * 「一条预设片段是另一条的连续子串」，该不变量由
 * `apps/web/src/engine/__tests__/preset-entrypoints.test.ts` 断言。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search, Sparkles } from 'lucide-react';
import {
  PRESET_SECTION_LABELS,
  PRESET_SECTION_PRESETS,
  buildSectionPrompt,
  groupPromptPresets,
  readPresetSections,
  withSectionPrompt,
  type PresetSectionKey,
  type PromptPreset,
} from '@nx9/shared';
import { ComposerPopover } from '../composer/ComposerPopover';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export type PresetSectionPickerVariant = 'toolbar' | 'header' | 'inline';

const TRIGGER_CLASS: Record<PresetSectionPickerVariant, string> = {
  toolbar: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] transition-colors',
  header: 'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition-colors',
  inline: 'sg-btn sg-btn--ghost inline-flex items-center gap-1',
};

const SEARCH_PLACEHOLDER: Record<PresetSectionKey, string> = {
  cinema: '搜索电影感：黄金时刻 / 黑色电影 / 青橙…',
  lighting: '搜索灯光：三点柔光 / 伦勃朗 / 霓虹…',
  portrait: '搜索人像：发型 / 五官 / 脸型 / 服饰…',
  anime: '搜索动漫标签：题材 / 风格 / 氛围 / 场景…',
};

export interface PresetSectionPickerProps {
  /** 接入哪个预设段落（决定词表、前缀与注入函数） */
  section: PresetSectionKey;
  /** 当前提示词文本（注入基准 + 选中态反推 + 预览） */
  value: string;
  /** 注入结果回调：把完整新文本写回既有提示词字段 */
  onApply: (next: string) => void;
  /** 切换节点 / 镜头时重置搜索框 */
  resetKey?: string;
  variant?: PresetSectionPickerVariant;
  disabled?: boolean;
}

/** 单条预设的注入片段：直接复用 section 的片段构造函数，保证与注入结果同源。 */
function fragmentOf(section: PresetSectionKey, preset: PromptPreset): string {
  return buildSectionPrompt(section, [preset.id]);
}

export function PresetSectionPicker({
  section,
  value,
  onApply,
  resetKey,
  variant = 'toolbar',
  disabled,
}: PresetSectionPickerProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setQuery('');
  }, [resetKey]);

  const presets = PRESET_SECTION_PRESETS[section];
  const label = PRESET_SECTION_LABELS[section];

  // 选中态由提示词文本反推：勾选与文本永远一致
  const injectedText = useMemo(() => readPresetSections(value)[section] ?? '', [value, section]);
  const activeIds = useMemo(() => {
    if (!injectedText) return [] as string[];
    return presets.filter((p) => injectedText.includes(fragmentOf(section, p))).map((p) => p.id);
  }, [injectedText, presets, section]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return presets;
    return presets.filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        p.label.toLowerCase().includes(q) ||
        p.text.toLowerCase().includes(q) ||
        (p.group ?? '').toLowerCase().includes(q),
    );
  }, [presets, query]);

  const grouped = useMemo(() => groupPromptPresets(results), [results]);

  const preview = useMemo(() => buildSectionPrompt(section, activeIds), [section, activeIds]);

  const applyIds = (ids: string[]) => {
    onApply(withSectionPrompt(section, value, ids));
  };

  const toggle = (preset: PromptPreset) => {
    const next = activeIds.includes(preset.id)
      ? activeIds.filter((id) => id !== preset.id)
      : [...activeIds, preset.id];
    applyIds(next);
  };

  const activeLabel = activeIds.length > 0 ? `${label} ${activeIds.length}` : label;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onMouseDown={stop}
        onClick={() => setOpen((v) => !v)}
        title={`${label}预设：分组浏览 · 可多选叠加 · 写入既有提示词字段`}
        className={`${TRIGGER_CLASS[variant]} ${
          open || activeIds.length > 0
            ? 'bg-brand/10 text-brand'
            : 'text-ink/55 hover:text-ink hover:bg-surface/90'
        } ${disabled ? 'opacity-45 cursor-not-allowed' : ''}`}
      >
        <Sparkles size={variant === 'header' ? 13 : 12} />
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
            <p className="text-[11px] font-medium text-ink/70">{label}预设</p>
            <span className="text-[9px] text-ink/35">按分组 · 可多选叠加</span>
          </div>

          <div className="relative px-1 mb-1.5">
            <Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={SEARCH_PLACEHOLDER[section]}
              className="w-full rounded-lg border border-line/50 pl-7 pr-2 py-1 text-[11px] focus:outline-none focus:border-brand/40"
            />
          </div>

          <div className="max-h-[236px] overflow-y-auto nx9-scroll pr-0.5">
            {grouped.length === 0 && (
              <p className="px-2 py-3 text-[10px] text-ink/35">没有匹配的{label}预设</p>
            )}
            {grouped.map(({ group, items }) => (
              <div key={group} className="mb-1.5">
                <p className="px-1.5 mb-0.5 text-[10px] font-medium text-ink/40 tracking-wide">
                  {group}
                </p>
                {items.map((p) => {
                  const active = activeIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggle(p)}
                      title={p.text}
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
                        <span className="block text-[11px] font-medium leading-tight">{p.label}</span>
                        <span className="block text-[9px] text-ink/40 leading-snug line-clamp-2">
                          {p.text}
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
              {preview ? `${preview}` : `未选择${label}预设（选择后追加到提示词）`}
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              <button
                type="button"
                disabled={activeIds.length === 0}
                onClick={() => applyIds([])}
                className="rounded-md border border-line/40 px-2 py-0.5 text-[9px] text-ink/55 hover:text-ink disabled:opacity-40"
              >
                清除{label}
              </button>
              <span className="text-[9px] text-ink/30">写入既有提示词字段，不新增字段</span>
            </div>
          </div>
        </div>
      </ComposerPopover>
    </>
  );
}
