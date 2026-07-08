import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PATHS } from '../../config/app.config';

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

export interface TaskRecord {
  id: string;
  type: 'video' | 'montage' | 'grid' | 'batch' | 'voice';
  status: TaskStatus;
  progress: number;
  message?: string;
  result?: unknown;
  createdAt: number;
  updatedAt: number;
}

@Injectable()
export class TasksService {
  private readonly emitter = new EventEmitter();
  private tasks = new Map<string, TaskRecord>();
  private readonly storePath = join(PATHS.data, 'tasks.json');

  constructor() {
    this.load();
    this.emitter.setMaxListeners(50);
  }

  private load() {
    if (!existsSync(this.storePath)) return;
    try {
      const raw = JSON.parse(readFileSync(this.storePath, 'utf-8')) as TaskRecord[];
      for (const t of raw) this.tasks.set(t.id, t);
    } catch {
      /* ignore corrupt store */
    }
  }

  private persist() {
    const list = [...this.tasks.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 200);
    writeFileSync(this.storePath, JSON.stringify(list, null, 2));
  }

  create(type: TaskRecord['type'], message?: string): TaskRecord {
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const task: TaskRecord = {
      id,
      type,
      status: 'pending',
      progress: 0,
      message,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.tasks.set(id, task);
    this.persist();
    this.emitter.emit(id, task);
    return task;
  }

  get(id: string): TaskRecord | undefined {
    return this.tasks.get(id);
  }

  list(limit = 50): TaskRecord[] {
    return [...this.tasks.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
  }

  patch(id: string, patch: Partial<TaskRecord>): TaskRecord | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    const next = { ...task, ...patch, updatedAt: Date.now() };
    this.tasks.set(id, next);
    this.persist();
    this.emitter.emit(id, next);
    this.emitter.emit('task', next);
    return next;
  }

  subscribe(id: string, listener: (task: TaskRecord) => void) {
    this.emitter.on(id, listener);
    return () => this.emitter.off(id, listener);
  }

  subscribeAll(listener: (task: TaskRecord) => void) {
    this.emitter.on('task', listener);
    return () => this.emitter.off('task', listener);
  }

  /** Poll async video task with progress updates. */
  async pollVideoTask(
    taskId: string,
    pollFn: () => Promise<{ done: boolean; url?: string; error?: string; progress?: number }>,
    intervalMs = 3000,
    maxAttempts = 40,
  ) {
    this.patch(taskId, { status: 'running', progress: 5, message: '轮询视频任务…' });
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, intervalMs));
      try {
        const res = await pollFn();
        if (res.progress != null) {
          this.patch(taskId, { progress: res.progress, message: '生成中…' });
        }
        if (res.done && res.url) {
          return this.patch(taskId, {
            status: 'done',
            progress: 100,
            message: '视频生成完成',
            result: { url: res.url },
          });
        }
        if (res.error) {
          return this.patch(taskId, {
            status: 'failed',
            message: res.error,
          });
        }
      } catch (e) {
        return this.patch(taskId, { status: 'failed', message: String(e) });
      }
      this.patch(taskId, { progress: Math.min(90, 10 + i * 2) });
    }
    return this.patch(taskId, { status: 'failed', message: '视频任务超时' });
  }
}
