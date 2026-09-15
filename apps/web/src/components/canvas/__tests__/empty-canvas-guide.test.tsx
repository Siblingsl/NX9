import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  EmptyCanvasGuide,
  CANVAS_ONBOARD_STORAGE_KEY,
  clearCanvasOnboarded,
  hasCanvasOnboarded,
} from '../EmptyCanvasGuide';

describe('F-041 EmptyCanvasGuide', () => {
  beforeEach(() => {
    clearCanvasOnboarded();
    cleanup();
  });

  afterEach(() => {
    clearCanvasOnboarded();
    cleanup();
  });

  it('空画布且未 onboarded 时显示引导', () => {
    render(
      <EmptyCanvasGuide
        nodeCount={0}
        onPickPlaybook={() => {}}
        onOpenCommandPalette={() => {}}
        onLoadTemplate={() => {}}
      />,
    );
    expect(screen.getByTestId('empty-canvas-guide')).toBeTruthy();
    expect(screen.getByText('欢迎使用画布')).toBeTruthy();
    expect(screen.getByText('选择 Playbook 引导')).toBeTruthy();
    expect(screen.getByText('应用核心模板')).toBeTruthy();
    expect(screen.getByText('打开命令面板')).toBeTruthy();
  });

  it('非空画布不显示', () => {
    render(
      <EmptyCanvasGuide
        nodeCount={3}
        onPickPlaybook={() => {}}
        onOpenCommandPalette={() => {}}
        onLoadTemplate={() => {}}
      />,
    );
    expect(screen.queryByTestId('empty-canvas-guide')).toBeNull();
  });

  it('关闭后写入 localStorage，再次不显示', () => {
    const { rerender } = render(
      <EmptyCanvasGuide
        nodeCount={0}
        onPickPlaybook={() => {}}
        onOpenCommandPalette={() => {}}
        onLoadTemplate={() => {}}
      />,
    );
    fireEvent.click(screen.getByText('暂时不需要，开始空白画布'));
    expect(hasCanvasOnboarded()).toBe(true);
    expect(localStorage.getItem(CANVAS_ONBOARD_STORAGE_KEY)).toBe('1');
    expect(screen.queryByTestId('empty-canvas-guide')).toBeNull();

    rerender(
      <EmptyCanvasGuide
        nodeCount={0}
        onPickPlaybook={() => {}}
        onOpenCommandPalette={() => {}}
        onLoadTemplate={() => {}}
      />,
    );
    expect(screen.queryByTestId('empty-canvas-guide')).toBeNull();
  });
});
