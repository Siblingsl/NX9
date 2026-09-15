import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

export interface TaskSnapshot {
  id: string;
  status: string;
  progress: number;
  message?: string;
  url?: string;
  result?: unknown;
}

/** 任务完成产物地址：兼容顶层 url 与 result.url */
export function taskOutputUrl(data: TaskSnapshot): string | undefined {
  if (typeof data.url === 'string' && data.url.trim()) return data.url.trim();
  const result = data.result;
  if (result && typeof result === 'object' && 'url' in result) {
    const nested = (result as { url?: unknown }).url;
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
  }
  return undefined;
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

    const settleFromSnapshot = (data: TaskSnapshot) => {
      onUpdate?.(data);
      if (data.status === 'done') {
        clearTimeout(timeout);
        es.close();
        if (!taskOutputUrl(data)) {
          reject(new Error('任务完成但无输出地址，禁止空成功'));
          return;
        }
        resolve(data);
        return;
      }
      if (data.status === 'failed' || data.status === 'cancelled') {
        clearTimeout(timeout);
        es.close();
        reject(new Error(data.message ?? '任务失败'));
      }
    };

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as TaskSnapshot;
        settleFromSnapshot(data);
      } catch {
        /* ignore */
      }
    };

    es.onerror = async () => {
      es.close();
      try {
        const t = (await api.getTask(taskId)) as TaskSnapshot;
        if (t.status === 'done' || t.status === 'failed' || t.status === 'cancelled') {
          settleFromSnapshot(t);
          return;
        }
        clearTimeout(timeout);
        reject(new Error(t.message ?? '任务流中断，请重试'));
      } catch (e) {
        clearTimeout(timeout);
        reject(e);
      }
    };
  });
}
