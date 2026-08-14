/**
 * 按 blockId 登记在途运行的 AbortController。
 * 工作台组件 remount / HMR 后 useRef 会丢，但 cascade 闭包仍持有旧 controller；
 * 停止按钮必须能按节点 id 找到并 abort，否则会出现「点了停止毫无反应」。
 */

const controllers = new Map<string, AbortController>();

export function beginBlockRunAbort(blockId: string): AbortController {
  const prev = controllers.get(blockId);
  if (prev) prev.abort();
  const next = new AbortController();
  controllers.set(blockId, next);
  return next;
}

/** @returns 是否找到并中止了在途控制器 */
export function abortBlockRun(blockId: string): boolean {
  const cur = controllers.get(blockId);
  if (!cur) return false;
  cur.abort();
  controllers.delete(blockId);
  return true;
}

export function endBlockRunAbort(blockId: string, controller: AbortController): void {
  if (controllers.get(blockId) === controller) {
    controllers.delete(blockId);
  }
}

export function getBlockRunAbortSignal(blockId: string): AbortSignal | undefined {
  return controllers.get(blockId)?.signal;
}

/** 可中止的 sleep：abort 时立即抛 AbortError，避免轮询间隔内「停止无反应」 */
export function sleepUntilAborted(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw new DOMException('轮询已中止', 'AbortError');
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('轮询已中止', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
