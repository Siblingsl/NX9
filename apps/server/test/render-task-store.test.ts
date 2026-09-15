import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync as readSrc } from 'node:fs';
import { resolve } from 'node:path';
import {
  loadTaskRecords,
  markInterruptedOnRestart,
  saveTaskRecords,
} from '../src/modules/montage/render-task-store';
import { RemotionRenderer } from '../src/modules/montage/remotion.renderer';

describe('SRV-04 渲染任务落盘', () => {
  it('原子写入后可再读回', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nx9-rt-'));
    const file = join(dir, 'hyperframes.json');
    try {
      saveTaskRecords(file, {
        'hf-1': { status: 'queued', updatedAt: 2 },
        'hf-2': { status: 'done', url: '/x.mp4', updatedAt: 1 },
      });
      const loaded = loadTaskRecords<{ status: string; url?: string }>(file);
      expect(loaded['hf-1']?.status).toBe('queued');
      expect(loaded['hf-2']?.url).toBe('/x.mp4');
      expect(readFileSync(file, 'utf8')).toContain('hf-1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('HyperFrames / Remotion 服务都接了落盘', () => {
    const root = resolve(__dirname, '../src/modules/montage');
    expect(readSrc(join(root, 'hyperframes.service.ts'), 'utf8')).toContain('loadTaskRecords');
    expect(readSrc(join(root, 'hyperframes.service.ts'), 'utf8')).toContain('saveTaskRecords');
    expect(readSrc(join(root, 'remotion.renderer.ts'), 'utf8')).toContain('loadTaskRecords');
    expect(readSrc(join(root, 'remotion.renderer.ts'), 'utf8')).toContain('cancelTask');
  });

  it('Remotion 取消 CAS：cancelled 不被 done 覆写', () => {
    const renderer = new RemotionRenderer();
    (renderer as unknown as { persistFile: string }).persistFile = '';
    const jobs = (renderer as unknown as { jobs: Map<string, { status: string; taskId: string; progress: number; createdAt: number; updatedAt: number }> }).jobs;
    jobs.clear();
    jobs.set('r-1', {
      taskId: 'r-1',
      status: 'queued',
      progress: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    expect(renderer.cancelTask('r-1')).toBe(true);
    expect(renderer.getStatus('r-1')?.status).toBe('cancelled');
    const commit = (
      renderer as unknown as {
        commitJob: (id: string, next: { status: string }) => boolean;
      }
    ).commitJob.bind(renderer);
    expect(commit('r-1', { status: 'done' })).toBe(false);
    expect(renderer.getStatus('r-1')?.status).toBe('cancelled');
  });
});

describe('SE-DEEP-07 服务重启收口：三类渲染任务不悬挂', () => {
  it('markInterruptedOnRestart 只改进行中状态，已完成不动', () => {
    const tasks = new Map([
      ['q', { status: 'queued' }],
      ['r', { status: 'rendering' }],
      ['run', { status: 'running' }],
      ['d', { status: 'done', url: '/a.mp4' }],
      ['e', { status: 'error' }],
      ['c', { status: 'cancelled' }],
    ]);
    const marked = markInterruptedOnRestart(tasks, ['queued', 'rendering', 'running'], (t) => {
      t.status = 'error';
    });
    expect(marked).toBe(3);
    expect(tasks.get('q')?.status).toBe('error');
    expect(tasks.get('r')?.status).toBe('error');
    expect(tasks.get('run')?.status).toBe('error');
    expect(tasks.get('d')?.status).toBe('done');
    expect(tasks.get('e')?.status).toBe('error');
    expect(tasks.get('c')?.status).toBe('cancelled');
  });

  it('HyperFrames / Remotion / video-edit 三服务 constructor 均接重启收口', () => {
    const root = resolve(__dirname, '../src/modules/montage');
    for (const file of ['hyperframes.service.ts', 'remotion.renderer.ts', 'video-edit.service.ts']) {
      const src = readSrc(join(root, file), 'utf8');
      expect(src, file).toContain('markInterruptedOnRestart');
      expect(src, file).toContain('服务重启');
    }
  });
});
