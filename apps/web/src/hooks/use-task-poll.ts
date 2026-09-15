import { useState, useRef, useCallback, useEffect } from 'react';
import { api } from '../api/client';

export type TaskStatus = 'idle' | 'queued' | 'rendering' | 'done' | 'error' | 'cancelled';

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
        const raw = res.status;
        if (raw === 'done') {
          if (!res.url) {
            setTask({
              status: 'error',
              message: res.message || '渲染完成但无输出地址，禁止空成功',
            });
          } else {
            setTask({ status: 'done', url: res.url });
          }
          if (intervalRef.current) clearInterval(intervalRef.current);
        } else if (raw === 'cancelled') {
          // F-046: 取消与失败分流，禁止后续写成 success
          setTask({
            status: 'cancelled',
            message: res.message || '渲染已取消',
          });
          if (intervalRef.current) clearInterval(intervalRef.current);
        } else if (raw === 'error') {
          setTask({
            status: 'error',
            message: res.message || '渲染失败',
          });
          if (intervalRef.current) clearInterval(intervalRef.current);
        } else {
          setTask({ status: (raw as TaskStatus) || 'queued' });
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
