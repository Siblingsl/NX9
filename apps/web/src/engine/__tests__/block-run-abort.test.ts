import { describe, expect, it, vi } from 'vitest';
import {
  abortBlockRun,
  beginBlockRunAbort,
  endBlockRunAbort,
  getBlockRunAbortSignal,
  sleepUntilAborted,
} from '../block-run-abort';

describe('block-run-abort', () => {
  it('按 blockId 登记后可跨「假 remount」中止', () => {
    const c1 = beginBlockRunAbort('pic-a');
    expect(c1.signal.aborted).toBe(false);
    expect(getBlockRunAbortSignal('pic-a')).toBe(c1.signal);

    // 模拟组件 remount：丢掉局部 ref，只靠 registry 停
    const stopped = abortBlockRun('pic-a');
    expect(stopped).toBe(true);
    expect(c1.signal.aborted).toBe(true);
    expect(getBlockRunAbortSignal('pic-a')).toBeUndefined();
  });

  it('begin 会中止同节点上一次运行', () => {
    const c1 = beginBlockRunAbort('pic-b');
    const c2 = beginBlockRunAbort('pic-b');
    expect(c1.signal.aborted).toBe(true);
    expect(c2.signal.aborted).toBe(false);
    endBlockRunAbort('pic-b', c2);
    expect(getBlockRunAbortSignal('pic-b')).toBeUndefined();
  });

  it('end 只清理自己的 controller，不误清后继运行', () => {
    const c1 = beginBlockRunAbort('pic-c');
    const c2 = beginBlockRunAbort('pic-c');
    endBlockRunAbort('pic-c', c1);
    expect(getBlockRunAbortSignal('pic-c')).toBe(c2.signal);
    endBlockRunAbort('pic-c', c2);
  });

  it('sleepUntilAborted 在 abort 时立即结束', async () => {
    const c = new AbortController();
    const spy = vi.fn();
    const p = sleepUntilAborted(10_000, c.signal).then(spy).catch((e: unknown) => e);
    c.abort();
    const err = await p;
    expect(spy).not.toHaveBeenCalled();
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe('AbortError');
  });
});
