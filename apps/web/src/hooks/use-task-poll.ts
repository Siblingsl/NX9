import { useState, useRef, useCallback, useEffect } from 'react';
import { api } from '../api/client';

export type TaskStatus = 'idle' | 'queued' | 'rendering' | 'done' | 'error';

interface TaskState {
  status: TaskStatus;
  url?: string;
  message?: string;
}

export function useTaskPoll() {
  const [task, setTask] = useState<TaskState>({ status: 'idle' });
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const startPolling = useCallback((taskId: string) => {
    setTask({ status: 'queued' });
    intervalRef.current = setInterval(async () => {
      try {
        const res = await api.getTaskStatus(taskId);
        const s = res.status as TaskStatus;
        if (s === 'done') {
          setTask({ status: 'done', url: res.url });
          if (intervalRef.current) clearInterval(intervalRef.current);
        } else if (s === 'error') {
          setTask({ status: 'error', message: res.message || '渲染失败' });
          if (intervalRef.current) clearInterval(intervalRef.current);
        } else {
          setTask({ status: s });
        }
      } catch {
        setTask({ status: 'error', message: '轮询失败' });
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, 2000);
  }, []);

  const reset = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTask({ status: 'idle' });
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { task, startPolling, reset };
}
