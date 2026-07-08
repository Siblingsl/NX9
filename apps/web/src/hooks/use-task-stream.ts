import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

export interface TaskSnapshot {
  id: string;
  status: string;
  progress: number;
  message?: string;
  result?: unknown;
}

export function useTaskStream(taskId: string | null) {
  const [task, setTask] = useState<TaskSnapshot | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!taskId) {
      setTask(null);
      return;
    }

    const es = new EventSource(`/api/tasks/${taskId}/stream`);
    esRef.current = es;

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as TaskSnapshot;
        setTask(data);
        if (['done', 'failed', 'cancelled'].includes(data.status)) {
          es.close();
        }
      } catch {
        /* ignore */
      }
    };

    es.onerror = () => {
      void api.getTask(taskId).then(setTask).catch(() => undefined);
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [taskId]);

  return task;
}

/** Poll video task with SSE fallback to REST polling. */
export async function watchVideoTask(taskId: string, onUpdate?: (t: TaskSnapshot) => void) {
  return new Promise<TaskSnapshot>((resolve, reject) => {
    const es = new EventSource(`/api/tasks/${taskId}/stream`);
    const timeout = setTimeout(() => {
      es.close();
      reject(new Error('任务超时'));
    }, 180_000);

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as TaskSnapshot;
        onUpdate?.(data);
        if (data.status === 'done') {
          clearTimeout(timeout);
          es.close();
          resolve(data);
        }
        if (data.status === 'failed' || data.status === 'cancelled') {
          clearTimeout(timeout);
          es.close();
          reject(new Error(data.message ?? '任务失败'));
        }
      } catch {
        /* ignore */
      }
    };

    es.onerror = async () => {
      es.close();
      try {
        const t = await api.getTask(taskId);
        resolve(t as TaskSnapshot);
      } catch (e) {
        reject(e);
      }
    };
  });
}
