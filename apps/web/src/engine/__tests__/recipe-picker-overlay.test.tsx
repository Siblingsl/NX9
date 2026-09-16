/**
 * 模板选择器（RecipePickerOverlay）入口回归：新增模板必须能在空白画布上被看到。
 *
 * 为什么需要 mock：`@nx9/shared` barrel（index.ts）引用了 8 个尚不存在的 data/* 模块
 * （既有缺陷），直接 import 会解析失败。这里按仓库既有做法（见
 * apps/web/src/blocks/craft/__tests__/CameraMoveTimelineEditor.test.tsx）把 barrel 工厂
 * 指到**真实源码模块** workflow-templates.ts，断言对着真实模板数据，不用桩数据。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@nx9/shared', async () => {
  const templates = await import('../../../../../packages/shared/src/data/workflow-templates');
  return {
    listWorkflowTemplates: templates.listWorkflowTemplates,
    isWorkflowTemplateListed: templates.isWorkflowTemplateListed,
  };
});

import { RecipePickerOverlay } from '../stage-deck/chrome/RecipePickerOverlay';
import { FIRST_LANE_STORAGE_KEY } from '../first-lane';

const NEW_TEMPLATE_IDS = [
  'tpl-multigrid-multicam',
  'tpl-multigrid-story',
  'tpl-multigrid-frame',
  'tpl-character-sheet-desk',
  'tpl-bgm-beat-camera',
] as const;

/** 既有推荐位（追加分组不该挤掉它们） */
const EXISTING_FEATURED_IDS = [
  'tpl-core-episode',
  'tpl-ai-short-film',
  'tpl-text-to-picture',
  'tpl-image-to-clip',
] as const;

function renderPicker() {
  const onPick = vi.fn();
  const onBlank = vi.fn();
  render(<RecipePickerOverlay onPick={onPick} onBlank={onBlank} />);
  return { onPick, onBlank };
}

describe('模板选择器：新增模板入口', () => {
  beforeEach(() => {
    window.localStorage.setItem(FIRST_LANE_STORAGE_KEY, '1');
  });

  it('已解锁：5 条新模板全部出现在选择器里', () => {
    renderPicker();
    for (const id of NEW_TEMPLATE_IDS) {
      expect(screen.getByTestId(`recipe-pick-${id}`), `${id} 未被投放`).toBeTruthy();
    }
  });

  it('已解锁：既有推荐位一字未动（追加不挤掉存量）', () => {
    renderPicker();
    for (const id of EXISTING_FEATURED_IDS) {
      expect(screen.getByTestId(`recipe-pick-${id}`)).toBeTruthy();
    }
  });

  it('已解锁：新模板落在「推演与设定表」分组标题下', () => {
    renderPicker();
    expect(screen.getByText(/推演与设定表/)).toBeTruthy();
  });

  it('点击新模板回调对应模板 id（可一键拉起）', () => {
    const { onPick } = renderPicker();
    fireEvent.click(screen.getByTestId('recipe-pick-tpl-multigrid-multicam'));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('tpl-multigrid-multicam');
  });

  it('未解锁（首用单车道）：不投放新模板，只保留核心流程', () => {
    window.localStorage.removeItem(FIRST_LANE_STORAGE_KEY);
    renderPicker();
    expect(screen.getByTestId('recipe-picker').getAttribute('data-first-lane')).toBe('on');
    for (const id of NEW_TEMPLATE_IDS) {
      expect(screen.queryByTestId(`recipe-pick-${id}`), `${id} 不该越过单车道`).toBeNull();
    }
    expect(screen.getByTestId('recipe-pick-tpl-core-episode')).toBeTruthy();
  });

  it('空白画布入口仍在（回归：新增分组不破坏原有出口）', () => {
    const { onBlank } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: /空白画布/ }));
    expect(onBlank).toHaveBeenCalledTimes(1);
  });
});
