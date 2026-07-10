import { Injectable } from '@nestjs/common';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

export type TaskKind = 'image' | 'video' | 'tts' | 'export';
export type TaskStatus = 'queued' | 'running' | 'failed' | 'cancelled' | 'done';

export interface ProductionTask {
  id: string;
  kind: TaskKind;
  label: string;
  status: TaskStatus;
  progress?: number;
  shotId?: string;
  error?: string;
  workspaceId?: string;
  createdAt: string;
  updatedAt?: string;
}

@Injectable()
export class QueueService {
  private readonly dbPath: string;
  private tasks: ProductionTask[] = [];

  constructor() {
    this.dbPath = join(process.cwd(), 'data', 'task-queue.json');
    this.load();
  }

  private load(): void {
    try {
      if (existsSync(this.dbPath)) {
        this.tasks = JSON.parse(readFileSync(this.dbPath, 'utf-8'));
      }
    } catch { this.tasks = []; }
  }

  private save(): void {
    try {
      const dir = join(process.cwd(), 'data');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(this.dbPath, JSON.stringify(this.tasks, null, 2));
    } catch { }
  }

  enqueue(task: Omit<ProductionTask, 'id' | 'createdAt' | 'status'>): ProductionTask {
    const entry: ProductionTask = {
      ...task,
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      status: 'queued',
      createdAt: new Date().toISOString(),
    };
    this.tasks.push(entry);
    this.save();
    return entry;
  }

  list(workspaceId?: string): ProductionTask[] {
    const items = workspaceId
      ? this.tasks.filter((t) => t.workspaceId === workspaceId)
      : this.tasks;
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  update(id: string, patch: Partial<ProductionTask>): ProductionTask | null {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    this.tasks[idx] = { ...this.tasks[idx], ...patch, updatedAt: new Date().toISOString() };
    this.save();
    return this.tasks[idx];
  }

  clearDone(): number {
    const before = this.tasks.length;
    this.tasks = this.tasks.filter((t) => t.status !== 'done');
    this.save();
    return before - this.tasks.length;
  }
}
