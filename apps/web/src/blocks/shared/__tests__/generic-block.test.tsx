import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import GenericBlock from '../GenericBlock';
import type { NodeProps } from '@xyflow/react';

function renderGeneric(type: string, data: Record<string, unknown> = {}) {
  const props = {
    id: 'n1',
    type,
    data,
    selected: false,
    dragging: false,
    zIndex: 0,
    selectable: true,
    deletable: true,
    draggable: true,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  } as unknown as NodeProps;
  return render(
    <ReactFlowProvider>
      <GenericBlock {...props} />
    </ReactFlowProvider>,
  );
}

describe('F-040 GenericBlock', () => {
  beforeEach(() => {
    cleanup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('未知 kind 显示错误卡，非空白', () => {
    renderGeneric('totally-unknown-kind-xyz');
    const card = screen.getByTestId('generic-block-unknown');
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('未注册节点');
    expect(card.textContent).toContain('totally-unknown-kind-xyz');
  });

  it('可迁移的废弃 kind 提供迁移按钮文案', () => {
    renderGeneric('subtitle-burn');
    expect(screen.getByTestId('generic-block-unknown')).toBeTruthy();
    expect(screen.getByRole('button', { name: /迁移到 caption-asr/ })).toBeTruthy();
  });
});
