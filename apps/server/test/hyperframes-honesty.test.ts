import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HyperframesService } from '../src/modules/montage/hyperframes.service';
import {
  applyHyperframesTaskUpdate,
  HF_PRODUCER_UNAVAILABLE,
} from '../src/modules/montage/hyperframes-task';

const root = resolve(__dirname, '../src/modules/montage');

function readMontage(rel: string) {
  return readFileSync(resolve(root, rel), 'utf8');
}

describe('SRV-02 HyperFrames 禁止黑片占位', () => {
  it('service / renderer 均不再调用 lavfi 黑场', () => {
    const service = readMontage('hyperframes.service.ts');
    const renderer = readMontage('hyperframes.renderer.ts');
    expect(service).not.toMatch(/lavfi/);
    expect(service).not.toMatch(/color=c=#000/);
    expect(renderer).not.toMatch(/lavfi/);
    expect(renderer).not.toMatch(/color=c=#000/);
    expect(service).toContain('HF_PRODUCER_UNAVAILABLE');
    expect(renderer).toContain('HF_PRODUCER_UNAVAILABLE');
  });

  it('producer 不可用文案明确拒绝占位', () => {
    expect(HF_PRODUCER_UNAVAILABLE).toMatch(/拒绝占位黑片/);
  });
});

describe('SRV-03 HyperFrames 取消 CAS', () => {
  it('cancelled 不被 done / error 覆写', () => {
    expect(
      applyHyperframesTaskUpdate({ status: 'cancelled' }, { status: 'done', url: '/x.mp4' }),
    ).toBeNull();
    expect(
      applyHyperframesTaskUpdate({ status: 'cancelled' }, { status: 'error', message: 'fail' }),
    ).toBeNull();
  });

  it('rendering 可以变为 done', () => {
    expect(
      applyHyperframesTaskUpdate({ status: 'rendering' }, { status: 'done', url: '/x.mp4' }),
    ).toEqual({ status: 'done', url: '/x.mp4' });
  });

  it('cancelTask 把 queued 标为 cancelled，已结束任务拒绝再取消', () => {
    const svc = new HyperframesService();
    (svc as unknown as { persistFile: string }).persistFile = '';
    expect(svc.cancelTask('missing')).toBe(false);

    (svc as unknown as { tasks: Map<string, { status: string }> }).tasks.set('hf-q', {
      status: 'queued',
    });
    expect(svc.cancelTask('hf-q')).toBe(true);
    expect(svc.getTaskStatus('hf-q')?.status).toBe('cancelled');

    (svc as unknown as { tasks: Map<string, { status: string }> }).tasks.set('hf-d', {
      status: 'done',
    });
    expect(svc.cancelTask('hf-d')).toBe(false);
    expect(svc.getTaskStatus('hf-d')?.status).toBe('done');
  });
});
