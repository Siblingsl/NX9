/**
 * R3 1.2 / 2.2: debounce 草稿必须能被 scope 级 flush / reset。
 */
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import {
  DebouncedFieldScopeProvider,
  DebouncedInput,
  flushDebouncedFields,
  resetDebouncedFields,
} from '../script-desk/use-debounced-field';

describe('useDebouncedField scope flush / reset', () => {
  it('键入即 onDirty；flush 提交草稿，committed 回写后重复 flush 不重复 commit', () => {
    const onDirty = vi.fn();
    const onCommit = vi.fn();
    const scope = 'flush-scope-1';
    const { rerender } = render(
      <DebouncedFieldScopeProvider scope={scope} onDirty={onDirty}>
        <DebouncedInput committed="旧正文" onCommit={onCommit} />
      </DebouncedFieldScopeProvider>,
    );
    const input = document.querySelector('input');
    expect(input).not.toBeNull();

    fireEvent.change(input!, { target: { value: '新正文' } });
    expect(onDirty).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();

    act(() => flushDebouncedFields(scope));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('新正文');

    rerender(
      <DebouncedFieldScopeProvider scope={scope} onDirty={onDirty}>
        <DebouncedInput committed="新正文" onCommit={onCommit} />
      </DebouncedFieldScopeProvider>,
    );
    act(() => flushDebouncedFields(scope));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('resetDebouncedFields 丢弃未提交草稿，后续 flush 不再写回幽灵字符', () => {
    const onDirty = vi.fn();
    const onCommit = vi.fn();
    const scope = 'reset-scope-1';
    render(
      <DebouncedFieldScopeProvider scope={scope} onDirty={onDirty}>
        <DebouncedInput committed="旧正文" onCommit={onCommit} />
      </DebouncedFieldScopeProvider>,
    );
    const input = document.querySelector('input');
    expect(input).not.toBeNull();

    fireEvent.change(input!, { target: { value: '幽灵字符' } });
    expect(onDirty).toHaveBeenCalledTimes(1);

    act(() => resetDebouncedFields(scope));
    expect((input as HTMLInputElement).value).toBe('旧正文');

    act(() => flushDebouncedFields(scope));
    expect(onCommit).not.toHaveBeenCalled();
  });
});
