/**
 * CapabilitySelfcheckPanel —— 组件行为回归（能力自检报告面板）。
 *
 * 覆盖边界（本次新增）：既有 `capability-selfcheck-shell.test.tsx` 只覆盖了
 * 「取数壳层 + 未取得完整结论横幅」这一条路径；**弹窗开关、严重度徽标、
 * 证据列表、「重新运行」忙碌态**都没有断言。
 *
 * 本文件不依赖 `@nx9/shared` barrel（该面板只吃 props + 本地纯类型）。
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CapabilitySelfcheckPanel } from '../stage-deck/chrome/CapabilitySelfcheckPanel';
import type {
  CapabilitySelfcheckReport,
} from '../../../../../packages/shared/src/utils/capability-selfcheck';

function report(overrides: Partial<CapabilitySelfcheckReport> = {}): CapabilitySelfcheckReport {
  return {
    counts: { error: 1, warn: 1, ok: 1, kinds: 3, catalogKinds: 3, templates: 3, checks: 3 },
    complete: true,
    summaryZh: '自检 3 项：通过 1 · 警告 1 · 错误 1',
    collectedAt: '2026-09-16T10:00:00.000Z',
    checks: [
      {
        id: 'catalog',
        label: '目录项',
        severity: 'ok',
        detailZh: '目录里 22 个 kind 都能解析。',
        evidence: ['multi-grid', 'character-sheet-desk'],
      },
      {
        id: 'loader',
        label: '前端 loader',
        severity: 'warn',
        detailZh: '有 1 个 kind 只在目录里出现。',
        evidence: [],
      },
      {
        id: 'socket',
        label: 'Socket 定义',
        severity: 'error',
        detailZh: '未找到 socket 定义文件。',
        evidence: ['apps/web/src/engine/socket-kinds.ts'],
      },
    ],
    ...overrides,
  };
}

describe('CapabilitySelfcheckPanel：开关', () => {
  it('report 为 null 时不渲染弹窗（未运行 / 已关闭）', () => {
    render(<CapabilitySelfcheckPanel report={null} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTestId('capability-selfcheck-body')).toBeNull();
  });

  it('打开后标题 / 摘要 / 正文出现；点遮罩与 Esc 都触发关闭', () => {
    const onClose = vi.fn();
    render(<CapabilitySelfcheckPanel report={report()} onClose={onClose} />);

    const dialog = screen.getByRole('dialog', { name: '能力自检' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('自检 3 项：通过 1 · 警告 1 · 错误 1')).toBeTruthy();
    expect(screen.getByTestId('capability-selfcheck-body')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('关闭'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    // 其它按键不关闭
    fireEvent.keyDown(window, { key: 'a' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('CapabilitySelfcheckPanel：报告渲染', () => {
  it('逐项渲染严重度徽标 / 标题 / 说明 / 证据，属性与真实严重度一致', () => {
    render(<CapabilitySelfcheckPanel report={report()} onClose={() => {}} />);

    const checks = screen.getByTestId('capability-selfcheck-checks');
    expect(checks.querySelectorAll('[data-check-id]')).toHaveLength(3);

    expect(checks.querySelector('[data-check-id="catalog"]')?.getAttribute('data-severity')).toBe(
      'ok',
    );
    expect(checks.querySelector('[data-check-id="loader"]')?.getAttribute('data-severity')).toBe(
      'warn',
    );
    expect(checks.querySelector('[data-check-id="socket"]')?.getAttribute('data-severity')).toBe(
      'error',
    );

    expect(screen.getByText('通过')).toBeTruthy();
    expect(screen.getByText('警告')).toBeTruthy();
    expect(screen.getByText('错误')).toBeTruthy();
    expect(screen.getByText('目录项')).toBeTruthy();
    expect(screen.getByText('目录里 22 个 kind 都能解析。')).toBeTruthy();
    // 证据逐条列出；无证据的项不渲染空列表
    expect(screen.getByText('· multi-grid')).toBeTruthy();
    expect(screen.getByText('· character-sheet-desk')).toBeTruthy();
    const loader = checks.querySelector('[data-check-id="loader"]')!;
    expect(loader.querySelectorAll('li')).toHaveLength(0);
    // 口径声明与取数时间（不让面板暗示「端到端可用」）
    expect(screen.getByText(/它不判断功能是否真的跑通，也不代表端到端可用/)).toBeTruthy();
    expect(screen.getByText(/取数时间：2026-09-16T10:00:00\.000Z/)).toBeTruthy();
  });

  it('complete=false 时给出「未取得完整结论」提示，且各检查项照旧展示（不吞掉失败）', () => {
    render(
      <CapabilitySelfcheckPanel
        report={report({ complete: false, summaryZh: '自检未取得完整结论', collectedAt: undefined })}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText(/本次自检未取得完整结论（数据源缺失或事实为空）/)).toBeTruthy();
    expect(screen.getByTestId('capability-selfcheck-checks').querySelectorAll('[data-check-id]')).toHaveLength(3);
    // 没有取数时间时不渲染「取数时间：」尾巴
    expect(screen.queryByText(/取数时间：/)).toBeNull();
  });

  it('checks 为空数组时仍渲染口径声明（不出现空白的成功态）', () => {
    render(
      <CapabilitySelfcheckPanel
        report={report({ checks: [], complete: false, summaryZh: '未取得任何检查项' })}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('capability-selfcheck-checks').querySelectorAll('[data-check-id]')).toHaveLength(0);
    expect(screen.getByText(/自检只核对「源码级接线」/)).toBeTruthy();
    expect(screen.getByText(/本次自检未取得完整结论/)).toBeTruthy();
  });
});

describe('CapabilitySelfcheckPanel：重新运行', () => {
  it('传 onRerun 才有按钮；点击回调；busy 时禁用并改文案', () => {
    const onRerun = vi.fn();
    const { rerender } = render(
      <CapabilitySelfcheckPanel report={report()} onClose={() => {}} onRerun={onRerun} />,
    );

    const button = screen.getByRole('button', { name: '重新运行' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onRerun).toHaveBeenCalledTimes(1);

    rerender(
      <CapabilitySelfcheckPanel report={report()} onClose={() => {}} onRerun={onRerun} busy />,
    );
    const busyButton = screen.getByRole('button', { name: '运行中…' }) as HTMLButtonElement;
    expect(busyButton.disabled).toBe(true);
    fireEvent.click(busyButton);
    expect(onRerun).toHaveBeenCalledTimes(1); // 忙碌期间不再触发
  });

  it('不传 onRerun 时不渲染「重新运行」入口', () => {
    render(<CapabilitySelfcheckPanel report={report()} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: '重新运行' })).toBeNull();
    expect(screen.getByRole('button', { name: '关闭 (Esc)' })).toBeTruthy();
  });
});
