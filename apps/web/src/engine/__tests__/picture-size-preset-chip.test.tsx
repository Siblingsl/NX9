/**
 * PictureSizePresetChip —— 组件行为回归（出图尺寸预设 chip）。
 *
 * 覆盖边界（本次新增）：`preset-entrypoints.test.ts` 只覆盖纯函数（尺寸预设映射与反查）；
 * **chip 的「当前尺寸反查显示」与点选写回零覆盖**。
 *
 * 落库约定（本文件重点断言）：点选写入的是**既有** `aspectRatio: 'custom'` + `width` / `height`
 * 三个字段，不新增持久化字段名。
 *
 * mock 手法：`@nx9/shared` 走 barrel 替身（既有缺陷：barrel 引用了 8 个不存在的
 * data/* 模块），替身指到真实源码模块；`@xyflow/react` 只提供 `useNodesData`。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

const flow = vi.hoisted(() => ({
  data: {} as Record<string, Record<string, unknown>>,
}));

vi.mock('@nx9/shared', async () => {
  const { buildSharedBarrelMock } = await import('./support/shared-barrel-mock');
  return buildSharedBarrelMock();
});

vi.mock('@xyflow/react', () => ({
  useNodesData: (id: string) => ({ id, data: flow.data[id] ?? {} }),
}));

import { PictureSizePresetChip } from '../stage-deck/chrome/attached-workspace/generation/picture/PictureSizePresetChip';
import {
  PICTURE_SIZE_PRESET_OPTIONS,
  matchPictureGenSize,
  pictureSizePresetPatch,
} from '../../../../../packages/shared/src/utils/preset-entrypoints';

const BLOCK_ID = 'pic-1';
const TITLE = '出图尺寸预设：写入既有 aspectRatio=custom + width/height，与宽高比控件同源';

/** 取第 n 个真实尺寸预设（用真实词表，不硬编码尺寸字面量） */
function option(index: number) {
  const found = PICTURE_SIZE_PRESET_OPTIONS[index];
  if (!found) throw new Error('测试前置失败：尺寸预设不足 ' + (index + 1) + ' 条');
  return found;
}
const FIRST = option(0);
const SECOND = option(1);

function setData(data: Record<string, unknown>) {
  flow.data[BLOCK_ID] = data;
}

function renderChip(data: Record<string, unknown> = {}) {
  setData(data);
  const onPatch = vi.fn();
  const view = render(<PictureSizePresetChip blockId={BLOCK_ID} onPatch={onPatch} />);
  return { onPatch, ...view };
}

function chip(): HTMLButtonElement {
  return screen.getByTitle(TITLE) as HTMLButtonElement;
}

function popover(): ReturnType<typeof within> {
  const node = document.querySelector('.nx9-composer-popover');
  if (!node) throw new Error('尺寸弹层未渲染');
  return within(node as HTMLElement);
}

beforeEach(() => {
  flow.data = {};
});

describe('PictureSizePresetChip：当前尺寸反查显示', () => {
  it('默认（无 width/height、宽高比非 custom）显示「尺寸预设」且不高亮', () => {
    renderChip({});
    expect(chip().textContent).toBe('尺寸预设');
    expect(chip().className).not.toContain('bg-brand/10');
  });

  it('宽高比不是 custom 时不做反查（避免与宽高比 chip 抢显示语义）', () => {
    const patch = pictureSizePresetPatch(FIRST.id)!;
    renderChip({ aspectRatio: '16:9', width: patch.width, height: patch.height });
    expect(chip().textContent).toBe('尺寸预设');
  });

  it('aspectRatio=custom 且宽高命中预设时显示该预设名并高亮', () => {
    const patch = pictureSizePresetPatch(SECOND.id)!;
    // 尺寸用真实反查函数确认确实命中（若词表变化该断言会立刻失败，而不是静默漂移）
    expect(matchPictureGenSize(patch.width, patch.height)).toBe(SECOND.id);

    renderChip({ aspectRatio: 'custom', width: patch.width, height: patch.height });

    expect(chip().textContent).toBe(SECOND.label);
    expect(chip().className).toContain('bg-brand/10');

    fireEvent.click(chip());
    expect(popover().getByText(SECOND.label)).toBeTruthy();
    // 命中的那一项在弹层里被标为 active
    const hit = popover()
      .getAllByRole('button')
      .find((b: HTMLButtonElement) => b.textContent?.startsWith(SECOND.label));
    expect(hit?.className).toContain('text-brand');
  });

  it('custom 但宽高不命中任何预设时，回落显示「尺寸预设」', () => {
    renderChip({ aspectRatio: 'custom', width: 999, height: 1001 });
    expect(chip().textContent).toBe('尺寸预设');
  });
});

describe('PictureSizePresetChip：点选写回既有字段', () => {
  it('列出全部真实尺寸预设（标签 + id），点一项写入 aspectRatio=custom + width/height', () => {
    const { onPatch } = renderChip({ aspectRatio: '16:9' });
    fireEvent.click(chip());

    const options = popover().getAllByRole('button');
    expect(options).toHaveLength(PICTURE_SIZE_PRESET_OPTIONS.length);
    for (const candidate of PICTURE_SIZE_PRESET_OPTIONS) {
      expect(popover().getByText(candidate.label)).toBeTruthy();
      expect(popover().getByText(candidate.id)).toBeTruthy();
    }

    fireEvent.click(options[1]!); // 第 2 条真实预设

    expect(onPatch).toHaveBeenCalledTimes(1);
    const patch = onPatch.mock.calls[0]![0] as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual(['aspectRatio', 'height', 'width']);
    expect(patch.aspectRatio).toBe('custom');
    expect(patch).toEqual(pictureSizePresetPatch(SECOND.id));
    // 字段落在既有持久化字段上（不新增第三个尺寸字段）
    expect(typeof patch.width).toBe('number');
    expect(typeof patch.height).toBe('number');
  });

  it('选择后弹层关闭（不悬停），再次点击可重新打开', () => {
    const { onPatch } = renderChip({});
    fireEvent.click(chip());
    expect(document.querySelector('.nx9-composer-popover')).toBeTruthy();

    fireEvent.click(popover().getAllByRole('button')[0]!);
    expect(document.querySelector('.nx9-composer-popover')).toBeNull();
    expect(onPatch).toHaveBeenCalledTimes(1);

    fireEvent.click(chip());
    expect(document.querySelector('.nx9-composer-popover')).toBeTruthy();
  });

  it('每条预设都能写回，且写回值与真实映射一一对应', () => {
    const { onPatch } = renderChip({});
    fireEvent.click(chip());
    const buttons = popover().getAllByRole('button');

    PICTURE_SIZE_PRESET_OPTIONS.forEach((candidate, index) => {
      if (index > 0) fireEvent.click(chip());
      const current = document.querySelector('.nx9-composer-popover')
        ? within(document.querySelector('.nx9-composer-popover') as HTMLElement).getAllByRole('button')
        : buttons;
      fireEvent.click(current[index]!);
      expect(onPatch.mock.calls.at(-1)![0]).toEqual(pictureSizePresetPatch(candidate.id));
    });
    expect(onPatch).toHaveBeenCalledTimes(PICTURE_SIZE_PRESET_OPTIONS.length);
  });
});
