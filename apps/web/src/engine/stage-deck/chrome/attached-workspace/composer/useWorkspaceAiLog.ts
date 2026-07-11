import { useCallback } from 'react';
import { useActivityLog } from '../../../../../stores/activity-log';

export function useWorkspaceAiLog() {
  const appendLog = useActivityLog((s) => s.append);

  return useCallback(
    (id: string) => {
      const labels: Record<string, string> = {
        optimize: 'AI 优化',
        complete: 'AI 补全',
        rewrite: 'Prompt 重写',
        translate: 'Prompt 翻译',
        shorten: '缩短',
        expand: '扩写',
      };
      appendLog(`${labels[id] ?? id}（即将推出）`);
    },
    [appendLog],
  );
}
