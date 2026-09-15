import { useEffect, useRef } from 'react';

/**
 * 跨组件「打开工作台」信号：节点 data.openDeskAt 时间戳。
 * 步骤条 / handoff 等外部入口写入该字段，工作台组件消费：时间戳变化一次，开台一次。
 */
export function useOpenDeskSignal(openDeskAt: unknown, open: () => void): void {
  const handledRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const at = typeof openDeskAt === 'number' ? openDeskAt : undefined;
    if (!at || at === handledRef.current) return;
    handledRef.current = at;
    open();
  }, [openDeskAt, open]);
}
