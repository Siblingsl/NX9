/**
 * PresetSectionPicker —— 组件行为回归（预设段落选择器）。
 *
 * 覆盖边界（本次新增）：`preset-entrypoints.test.ts` 只覆盖纯函数（分组 / 注入 / 反推）与
 * 「每条预设可被前端入口取到」；**选择器的展开、多选叠加、清除、搜索与
 * 注入预览零覆盖**。
 *
 * mock 手法：`@nx9/shared` 走 barrel 替身（既有缺陷：barrel 引用了 8 个不存在的
 * data/* 模块），替身指到真实源码模块 → 预设词表 / 注入文本 / 选中态反推都是真实实现。
 * 选择器本身是受控组件（`value` + `onApply`），测试用一个极小的受控外壳模拟父组件。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('@nx9/shared', async () => {
  const { buildSharedBarrelMock } = await import('./support/shared-barrel-mock');
  return buildSharedBarrelMock();
});

import { PresetSectionPicker } from '../stage-deck/chrome/attached-workspace/generation/PresetSectionPicker';
import {
  PRESET_SECTION_LABELS,
  PRESET_SECTION_PRESETS,
  buildSectionPrompt,
  readPresetSections,
  withSectionPrompt,
} from '../../../../../packages/shared/src/utils/preset-entrypoints';

const SECTION = 'cinema' as const;
const LABEL = PRESET_SECTION_LABELS[SECTION];
const PRESETS = PRESET_SECTION_PRESETS[SECTION];

function sectionPreset(id: string) {
  const found = PRESETS.find((p) => p.id === id);
  if (!found) throw new Error('测试前置失败：预设段落缺少 ' + id);
  return found;
}
const FIRST = PRESETS[0]!;
const SECOND = PRESETS[1]!;

function fragment(id: string): string {
  return buildSectionPrompt(SECTION, [id]);
}

/** 成行的注入结果（带  前缀）——组件只在**成行**时才会反推出选中态 */
function injectedLine(ids: string[]): string {
  return withSectionPrompt(SECTION, '', ids);
}

/** 受控外壳：模拟父组件把注入结果写回提示词字段 */
function openPicker(initialValue = '') {
  let value = initialValue;
  const onApply = vi.fn((next: string) => {
    value = next;
  });
  const renderWith = (v: string) => (
    <PresetSectionPicker section={SECTION} value={v} onApply={onApply} resetKey="node-1" />
  );
  const view = render(renderWith(value));
  const panel = () => {
    const node = document.querySelector('.nx9-composer-popover');
    if (!node) throw new Error('选择器面板未渲染');
    return within(node as HTMLElement);
  };
  return {
    ...view,
    onApply,
    panel,
    currentValue: () => value,
    /** 重渲染；传 next 表示「父组件直接改写了提示词」（如用户手动删行） */
    rerender: (next?: string) => {
      if (next !== undefined) value = next;
      view.rerender(renderWith(value));
    },
    open: () =>
      fireEvent.click(
        screen.getByTitle(`${LABEL}预设：分组浏览 · 可多选叠加 · 写入既有提示词字段`),
      ),
  };
}

beforeEach(() => {
  expect(PRESETS.length).toBeGreaterThan(1);
});

describe('PresetSectionPicker：触发器', () => {
  it('默认显示段落名；未选中时面板给出「未选择」预览，清除按钮禁用', () => {
    const picker = openPicker();
    const trigger = screen.getByRole('button', {
      name: new RegExp(`^${LABEL}$`),
    }) as HTMLButtonElement;
    expect(trigger.disabled).toBe(false);
    expect(trigger.textContent).toContain(LABEL);

    picker.open();
    const panel = picker.panel();
    expect(panel.getByText(`${LABEL}预设`)).toBeTruthy();
    expect(panel.getByText('按分组 · 可多选叠加')).toBeTruthy();
    expect(panel.getByText(`未选择${LABEL}预设（选择后追加到提示词）`)).toBeTruthy();
    expect((panel.getByRole('button', { name: `清除${LABEL}` }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(picker.onApply).not.toHaveBeenCalled();
  });

  it('disabled=true 时触发器不可点（不展开面板）', () => {
    render(<PresetSectionPicker section={SECTION} value="" onApply={vi.fn()} disabled />);
    const trigger = screen.getByRole('button', { name: new RegExp(`^${LABEL}$`) }) as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
    fireEvent.click(trigger);
    expect(document.querySelector('.nx9-composer-popover')).toBeNull();
  });

  it('已注入的段落直接反映在触发器与勾选态上（选中态由提示词文本反推）', () => {
    const picker = openPicker(injectedLine([FIRST.id]));
    expect(
      screen.getByRole('button', { name: new RegExp(`^${LABEL} 1$`) }),
    ).toBeTruthy();

    picker.open();
    const panel = picker.panel();
    const item = panel.getByTitle(FIRST.text);
    expect(item.className).toContain('bg-brand/10');
    // 预览里也出现该片段（词条文本与预览文本相同 → 用 getAllByText 计数）
    expect(panel.getAllByText(fragment(FIRST.id)).length).toBeGreaterThan(0);
  });

  it('用户手动删掉注入行后勾选自动消失（界面不会与文本不一致）', () => {
    const picker = openPicker(injectedLine([FIRST.id]));
    picker.open();
    expect(picker.panel().getByTitle(FIRST.text).className).toContain('bg-brand/10');
    expect(screen.getByRole('button', { name: new RegExp(`^${LABEL} 1$`) })).toBeTruthy();

    // 用户手动把注入行删掉（父组件直接改写 value）
    picker.rerender('');

    expect(picker.panel().getByTitle(FIRST.text).className).not.toContain('bg-brand/10');
    expect(screen.getByRole('button', { name: new RegExp(`^${LABEL}$`) })).toBeTruthy();
    expect(
      picker.panel().getByText(`未选择${LABEL}预设（选择后追加到提示词）`),
    ).toBeTruthy();
  });
});

describe('PresetSectionPicker：多选叠加与清除', () => {
  it('点一条预设：注入该条片段（写入既有文本，不新增字段）', () => {
    const picker = openPicker('主体描述第一行');
    picker.open();
    fireEvent.click(picker.panel().getByTitle(FIRST.text));

    expect(picker.onApply).toHaveBeenCalledTimes(1);
    const next = picker.onApply.mock.calls[0]![0] as string;
    expect(next).toContain('主体描述第一行');
    expect(next).toContain(fragment(FIRST.id));
    expect(readPresetSections(next)[SECTION]).toBe(fragment(FIRST.id));
    // 勾选与触发器计数跟着更新
    picker.rerender();
    expect(screen.getByRole('button', { name: new RegExp(`^${LABEL} 1$`) })).toBeTruthy();
  });

  it('再点第二条：两条叠加且顺序与选择顺序一致', () => {
    const picker = openPicker('');
    picker.open();
    fireEvent.click(picker.panel().getByTitle(FIRST.text));
    picker.rerender();
    fireEvent.click(picker.panel().getByTitle(SECOND.text));
    picker.rerender();

    const next = picker.currentValue();
    expect(readPresetSections(next)[SECTION]).toBe(buildSectionPrompt(SECTION, [FIRST.id, SECOND.id]));
    expect(screen.getByRole('button', { name: new RegExp(`^${LABEL} 2$`) })).toBeTruthy();
  });

  it('再点已选中的一条：取消该条，其余保留（勾选与文本同步）', () => {
    const picker = openPicker('');
    picker.open();
    fireEvent.click(picker.panel().getByTitle(FIRST.text));
    picker.rerender();
    fireEvent.click(picker.panel().getByTitle(SECOND.text));
    picker.rerender();

    fireEvent.click(picker.panel().getByTitle(FIRST.text));
    picker.rerender();

    const next = picker.currentValue();
    expect(readPresetSections(next)[SECTION]).toBe(fragment(SECOND.id));
    expect(screen.getByRole('button', { name: new RegExp(`^${LABEL} 1$`) })).toBeTruthy();
    expect(picker.panel().getByTitle(FIRST.text).className).not.toContain('bg-brand/10');
    expect(picker.panel().getByTitle(SECOND.text).className).toContain('bg-brand/10');
  });

  it('「清除<段落>」在已选中时可用，点击后本段整行移除，其它内容不动', () => {
    const picker = openPicker('');
    picker.open();
    fireEvent.click(picker.panel().getByTitle(FIRST.text));
    picker.rerender();

    const clear = picker.panel().getByRole('button', { name: `清除${LABEL}` }) as HTMLButtonElement;
    expect(clear.disabled).toBe(false);
    fireEvent.click(clear);
    picker.rerender();

    expect(readPresetSections(picker.currentValue())[SECTION]).toBeUndefined();
    expect(screen.getByRole('button', { name: new RegExp(`^${LABEL}$`) })).toBeTruthy();
  });
});

describe('PresetSectionPicker：搜索与分组', () => {
  it('按分组渲染（分组名来自真实词表），并列出每条预设的标签与片段预览', () => {
    const picker = openPicker();
    picker.open();
    const panel = picker.panel();
    const groups = Array.from(document.querySelectorAll('.nx9-composer-popover p'))
      .map((node) => node.textContent ?? '')
      .filter(Boolean);
    for (const preset of PRESETS) {
      if (!preset.group) continue;
      expect(groups).toContain(preset.group);
    }
    expect(panel.getByText(FIRST.label)).toBeTruthy();
    expect(panel.getByText(FIRST.text)).toBeTruthy();
  });

  it('搜索按 id / 标签 / 片段文本过滤；无命中时给出中文空态', () => {
    const picker = openPicker();
    picker.open();
    const panel = picker.panel();
    const search = panel.getByPlaceholderText(/^搜索/) as HTMLInputElement;
    expect(search.placeholder).toContain(LABEL);

    fireEvent.change(search, { target: { value: FIRST.id } });
    expect(panel.getByText(FIRST.label)).toBeTruthy();
    expect(panel.queryByText(SECOND.label)).toBeNull();

    fireEvent.change(search, { target: { value: '绝不存在的预设词' } });
    expect(panel.getByText(`没有匹配的${LABEL}预设`)).toBeTruthy();
    expect(panel.queryByText(FIRST.label)).toBeNull();
  });

  it('resetKey 变化时清空搜索框（换节点 / 换镜头后不残留过滤）', () => {
    const onApply = vi.fn();
    const { rerender } = render(
      <PresetSectionPicker section={SECTION} value="" onApply={onApply} resetKey="node-1" />,
    );
    fireEvent.click(screen.getByTitle(`${LABEL}预设：分组浏览 · 可多选叠加 · 写入既有提示词字段`));
    const search = () =>
      document.querySelector('.nx9-composer-popover input[type="text"]') as HTMLInputElement;
    fireEvent.change(search(), { target: { value: FIRST.id } });
    expect(search().value).toBe(FIRST.id);

    rerender(<PresetSectionPicker section={SECTION} value="" onApply={onApply} resetKey="node-2" />);
    expect(search().value).toBe('');
  });
});
