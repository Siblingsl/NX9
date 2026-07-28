/**
 * F-030 acceptance test — 爆款流程补智能剪辑
 *
 * G1 验收清单:
 * - [x] 爆款模板含剪辑节点
 * - [x] Playbook 含对应步且就绪正确
 *
 * G2: pb-viral-short playbook smart-edit step pipeline verification
 * G3: 本文件 + 缺陷分析同步
 */
import { describe, it, expect } from 'vitest';
import {
  PLAYBOOK_DEFINITIONS,
  type PlaybookStepDef,
  type PlaybookId,
} from '@nx9/shared';
import {
  readinessRegistry,
  has_timeline_draft,
  has_viral_output,
  export_ready,
  type PlaybookReadinessContext,
} from '@nx9/shared';
import { evaluatePlaybookStep } from '@nx9/shared';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const WEB_ROOT = resolve(__dirname, '..', '..', '..', 'apps', 'web', 'src');
const SHARED_ROOT = resolve(__dirname, '..', '..', '..', 'packages', 'shared', 'src');

function readShared(relPath: string): string {
  return readFileSync(resolve(SHARED_ROOT, relPath), 'utf-8');
}

function emptyCtx(overrides?: Partial<PlaybookReadinessContext>): PlaybookReadinessContext {
  return {
    session: { playbookId: 'pb-viral-short' as PlaybookId, currentStepId: 'source', skippedStepIds: [], failedStepIds: [], waitingStepIds: [] },
    nodes: [],
    chainShots: [],
    voice: { lines: [] },
    characters: [],
    environments: [],
    ...overrides,
  };
}

const viralPlaybook = PLAYBOOK_DEFINITIONS.find((p) => p.id === 'pb-viral-short')!;
const viralSteps = viralPlaybook.steps;

describe('F-030 acceptance', () => {
  // ═══════════ G1.1: 爆款模板含智能剪辑步骤 ═══════════
  describe('G1.1 pb-viral-short 含智能剪辑步骤', () => {
    it('playbook 存在', () => {
      expect(viralPlaybook).toBeDefined();
      expect(viralPlaybook.id).toBe('pb-viral-short');
      expect(viralPlaybook.label).toBe('爆款短视频');
    });

    it('playbook 含 smart-edit 步骤', () => {
      const smartStep = viralSteps.find((s) => s.id === 'smart-edit');
      expect(smartStep).toBeDefined();
      expect(smartStep!.label).toContain('智能剪辑');
      expect(smartStep!.canvasNodeKinds).toContain('clip-editor');
    });

    it('smart-edit 步骤使用 has_timeline_draft 就绪条件', () => {
      const smartStep = viralSteps.find((s) => s.id === 'smart-edit')!;
      expect(smartStep.readinessKey).toBe('has_timeline_draft');
    });

    it('smart-edit 标记为 optional', () => {
      const smartStep = viralSteps.find((s) => s.id === 'smart-edit')!;
      expect(smartStep.optional).toBe(true);
    });

    it('smart-edit primaryAction 可 spawn clip-editor', () => {
      const smartStep = viralSteps.find((s) => s.id === 'smart-edit')!;
      expect(smartStep.primaryAction).toBeDefined();
      expect(smartStep.primaryAction!.type).toBe('focus_block');
      expect(smartStep.primaryAction!.kind).toBe('clip-editor');
      expect((smartStep.primaryAction as any).spawnIfMissing).toBe(true);
    });

    it('共 5 个步骤（source, analyze, generate, smart-edit, export）', () => {
      expect(viralSteps.length).toBe(5);
      const ids = viralSteps.map((s) => s.id);
      expect(ids).toEqual(['source', 'analyze', 'generate', 'smart-edit', 'export']);
    });
  });

  // ═══════════ G1.2: has_timeline_draft 可用且有注册 ═══════════
  describe('G1.2 has_timeline_draft 可用', () => {
    it('readinessRegistry 注册了 has_timeline_draft', () => {
      expect(readinessRegistry).toHaveProperty('has_timeline_draft');
    });

    it('无时间线返回 false', () => {
      const ctx = emptyCtx({
        nodes: [{ id: 'ed', type: 'clip-editor', data: {} }],
      });
      expect(has_timeline_draft(ctx)).toBe(false);
    });

    it('有 clips 返回 true', () => {
      const ctx = emptyCtx({
        nodes: [{ id: 'ed', type: 'clip-editor', data: { timelineDraft: { clips: [{ id: 'c1' }] } } }],
      });
      expect(has_timeline_draft(ctx)).toBe(true);
    });

    it('tracks 含 clips 返回 true', () => {
      const ctx = emptyCtx({
        nodes: [{ id: 'ed', type: 'clip-editor', data: { timelineDraft: { tracks: [{ clips: [{ id: 'c1' }] }] } } }],
      });
      expect(has_timeline_draft(ctx)).toBe(true);
    });

    it('无 clip-editor 节点返回 false', () => {
      const ctx = emptyCtx();
      expect(has_timeline_draft(ctx)).toBe(false);
    });

    it('多个节点只有 clip-editor 判断时间线', () => {
      const ctx = emptyCtx({
        nodes: [
          { id: 'pg', type: 'picture-gen', data: { timelineDraft: { clips: [{ id: 'fake' }] } } },
          { id: 'ed', type: 'clip-editor', data: {} },
        ],
      });
      expect(has_timeline_draft(ctx)).toBe(false);
    });

    it('只检查 clip-editor 节点（在 viral 上下文里）', () => {
      const step = viralSteps.find((s) => s.id === 'smart-edit')!;
      const ctxWithDraft = emptyCtx({
        nodes: [{ id: 'ed', type: 'clip-editor', data: { timelineDraft: { clips: [{ id: 'v1' }] } } }],
      });
      expect(evaluatePlaybookStep(step, ctxWithDraft).ready).toBe(true);

      const ctxNoDraft = emptyCtx({
        nodes: [{ id: 'ed', type: 'clip-editor', data: {} }],
      });
      expect(evaluatePlaybookStep(step, ctxNoDraft).ready).toBe(false);
    });
  });

  // ═══════════ G2: 就绪矩阵 — 所有步骤门禁验证 ═══════════
  describe('G2 就绪矩阵：pb-viral-short 全部步骤', () => {
    it('source 步用 has_source_text', () => {
      const step = viralSteps.find((s) => s.id === 'source')!;
      expect(step.readinessKey).toBe('has_source_text');
      expect(readinessRegistry).toHaveProperty('has_source_text');
    });

    it('analyze 步用 has_reference_board', () => {
      const step = viralSteps.find((s) => s.id === 'analyze')!;
      expect(step.readinessKey).toBe('has_reference_board');
      expect(readinessRegistry).toHaveProperty('has_reference_board');
    });

    it('generate 步用 has_viral_output', () => {
      const step = viralSteps.find((s) => s.id === 'generate')!;
      expect(step.readinessKey).toBe('has_viral_output');
      expect(readinessRegistry).toHaveProperty('has_viral_output');
    });

    it('smart-edit 步用 has_timeline_draft', () => {
      const step = viralSteps.find((s) => s.id === 'smart-edit')!;
      expect(step.readinessKey).toBe('has_timeline_draft');
      expect(readinessRegistry).toHaveProperty('has_timeline_draft');
    });

    it('export 步用 export_ready', () => {
      const step = viralSteps.find((s) => s.id === 'export')!;
      expect(step.readinessKey).toBe('export_ready');
      expect(readinessRegistry).toHaveProperty('export_ready');
    });

    it('所有 readiness key 均已注册', () => {
      for (const step of viralSteps) {
        const registered = readinessRegistry[step.readinessKey];
        if (!registered) {
          throw new Error(`未注册 readiness key: ${step.readinessKey} (step=${step.id})`);
        }
        expect(typeof registered).toBe('function');
      }
    });
  });

  // ═══════════ has_viral_output 详测 ═══════════
  describe('has_viral_output 行为', () => {
    it('已注册', () => {
      expect(readinessRegistry).toHaveProperty('has_viral_output');
    });

    it('picture-gen 有 status+mediaUrl 返回 true', () => {
      const ctx = emptyCtx({
        nodes: [{ id: 'pg', type: 'picture-gen', data: { status: 'done', mediaUrl: 'https://img/x.png' } }],
      });
      expect(has_viral_output(ctx)).toBe(true);
    });

    it('clip-gen 有 status+mediaUrl 返回 true', () => {
      const ctx = emptyCtx({
        nodes: [{ id: 'cg', type: 'clip-gen', data: { status: 'success', mediaUrl: 'https://vid/x.mp4' } }],
      });
      expect(has_viral_output(ctx)).toBe(true);
    });

    it('clip-gen 有 mediaUrls 数组返回 true', () => {
      const ctx = emptyCtx({
        nodes: [{ id: 'cg', type: 'clip-gen', data: { status: 'done', mediaUrls: ['https://vid/x.mp4'] } }],
      });
      expect(has_viral_output(ctx)).toBe(true);
    });

    it('status 非 done/success 返回 false', () => {
      const ctx = emptyCtx({
        nodes: [{ id: 'cg', type: 'clip-gen', data: { status: 'running', mediaUrl: 'https://vid/x.mp4' } }],
      });
      expect(has_viral_output(ctx)).toBe(false);
    });

    it('无节点返回 false', () => {
      const ctx = emptyCtx();
      expect(has_viral_output(ctx)).toBe(false);
    });

    it('无 mediaUrl/mediaUrls 返回 false', () => {
      const ctx = emptyCtx({
        nodes: [{ id: 'cg', type: 'clip-gen', data: { status: 'done' } }],
      });
      expect(has_viral_output(ctx)).toBe(false);
    });
  });

  // ═══════════ 核心视频步不永久卡死 ═══════════
  describe('核心视频步（generate）不永久卡死', () => {
    it('generate 步不是 all_videos_approved 类（不卡死）', () => {
      const step = viralSteps.find((s) => s.id === 'generate')!;
      expect(step.readinessKey).not.toBe('all_videos_approved');
      expect(step.readinessKey).not.toBe('review_gate_passed');
    });

    it('generate 步 readinessKey 是宽进条件 has_viral_output', () => {
      const step = viralSteps.find((s) => s.id === 'generate')!;
      // has_viral_output 是 OR 条件（picture-gen 或 clip-gen 任一满足即可）
      expect(step.readinessKey).toBe('has_viral_output');
    });

    it('smart-edit 是 optional：不 ready 不阻止 export', () => {
      const step = viralSteps.find((s) => s.id === 'smart-edit')!;
      expect(step.optional).toBe(true);
    });

    it('pb-viral-short 非可选步只有 source、analyze、generate、export', () => {
      const mandatory = viralSteps.filter((s) => !s.optional);
      const ids = mandatory.map((s) => s.id);
      expect(ids).toContain('source');
      expect(ids).toContain('generate');
      expect(ids).toContain('export');
      expect(ids).toContain('analyze');
      expect(ids).not.toContain('smart-edit');
    });
  });

  // ═══════════ export_ready 详测 ═══════════
  describe('export_ready 行为', () => {
    it('已注册', () => {
      expect(readinessRegistry).toHaveProperty('export_ready');
    });

    it('无 export-pack 节点返回 false', () => {
      const ctx = emptyCtx();
      expect(export_ready(ctx)).toBe(false);
    });

    it('export-pack 有时间线返回 true', () => {
      const ctx = emptyCtx({
        nodes: [{ id: 'ep', type: 'export-pack', data: { timelineDraft: { clips: [{ id: 'c1' }] } } }],
      });
      expect(export_ready(ctx)).toBe(true);
    });

    it('export-pack 有 episodeUrl 返回 true', () => {
      const ctx = emptyCtx({
        nodes: [{ id: 'ep', type: 'export-pack', data: { episodeUrl: 'https://out/x.mp4' } }],
      });
      expect(export_ready(ctx)).toBe(true);
    });

    it('export-pack 有成功历史+URL 返回 true', () => {
      const ctx = emptyCtx({
        nodes: [{ id: 'ep', type: 'export-pack', data: { exportHistory: [{ status: 'success', url: 'https://out/x.mp4' }] } }],
      });
      expect(export_ready(ctx)).toBe(true);
    });

    it('export-pack 无产物返回 false', () => {
      const ctx = emptyCtx({
        nodes: [{ id: 'ep', type: 'export-pack', data: {} }],
      });
      expect(export_ready(ctx)).toBe(false);
    });
  });

  // ═══════════ 步骤视觉态：smart-edit 不阻塞下游 ═══════════
  describe('步骤视觉态：smart-edit 不阻塞 export', () => {
    const { evaluateStepVisualState } = require('@nx9/shared');

    it('smart-edit not ready + optional → 不阻塞 future 的 export', () => {
      const session = {
        playbookId: 'pb-viral-short' as PlaybookId,
        currentStepId: 'smart-edit',
        skippedStepIds: [] as string[],
        failedStepIds: [] as string[],
        waitingStepIds: [] as string[],
      };
      const ctx = emptyCtx({
        session,
      });
      // smart-edit 是 current，但 has_timeline_draft = false → 'current' (not 'done')
      const smartStep = viralSteps.find((s) => s.id === 'smart-edit')!;
      const smartIdx = viralSteps.indexOf(smartStep);
      const smartState = evaluateStepVisualState(smartStep, smartIdx, session, ctx);
      // 未 ready 且是 current → 'current'
      expect(smartState).toBe('current');

      // export 在后面（index=4 > currentIdx=3），应为 'future'
      const exportStep = viralSteps.find((s) => s.id === 'export')!;
      const exportIdx = viralSteps.indexOf(exportStep);
      const exportState = evaluateStepVisualState(exportStep, exportIdx, session, ctx);
      expect(exportState).toBe('future');
    });

    it('current 在 export 时，不 ready 的 smart-edit 显示 blocked（历史步骤未完成）', () => {
      const session = {
        playbookId: 'pb-viral-short' as PlaybookId,
        currentStepId: 'export',
        skippedStepIds: [] as string[],
        failedStepIds: [] as string[],
        waitingStepIds: [] as string[],
      };
      const ctx = emptyCtx({ session });
      const smartStep = viralSteps.find((s) => s.id === 'smart-edit')!;
      const smartIdx = viralSteps.indexOf(smartStep);
      const smartState = evaluateStepVisualState(smartStep, smartIdx, session, ctx);
      // smart-edit 在 export 之前 (3 < 4) 且未 ready → 'blocked'
      // 但因为 optional=true，用户可跳过
      expect(smartState).toBe('blocked');
    });

    it('smart-edit 被 skipped 后 → skipped', () => {
      const session = {
        playbookId: 'pb-viral-short' as PlaybookId,
        currentStepId: 'export',
        skippedStepIds: ['smart-edit'],
        failedStepIds: [] as string[],
        waitingStepIds: [] as string[],
      };
      const ctx = emptyCtx({ session });
      const smartStep = viralSteps.find((s) => s.id === 'smart-edit')!;
      const smartIdx = viralSteps.indexOf(smartStep);
      const smartState = evaluateStepVisualState(smartStep, smartIdx, session, ctx);
      expect(smartState).toBe('skipped');
    });
  });

  // ═══════════ 源码门禁 ═══════════
  describe('源码门禁', () => {
    it('playbook-definitions.ts 中 pb-viral-short 含 smart-edit 步骤定义', () => {
      const src = readShared('data/playbook-definitions.ts');
      expect(src).toContain("id: 'smart-edit'");
      expect(src).toContain('F-030');
      expect(src).toContain("kind: 'clip-editor'");
    });

    it('playbook-readiness.ts 中 has_timeline_draft 函数存在', () => {
      const src = readShared('utils/playbook-readiness.ts');
      expect(src).toContain('export function has_timeline_draft');
    });

    it('readinessRegistry 注册了 has_timeline_draft', () => {
      const src = readShared('utils/playbook-readiness.ts');
      expect(src).toContain('has_timeline_draft');
    });

    it('readinessRegistry 注册了 has_viral_output', () => {
      const src = readShared('utils/playbook-readiness.ts');
      expect(src).toContain('has_viral_output');
    });
  });

  // ═══════════ pb-viral-short 完整步骤参数矩阵 ═══════════
  describe('pb-viral-short 每个步骤的参数完整性', () => {
    const stepParams: Array<{
      id: string;
      label: string;
      readinessKey: string;
      canvasNodeKinds: string[];
      optional: boolean;
    }> = [
      {
        id: 'source',
        label: '① 链接采集',
        readinessKey: 'has_source_text',
        canvasNodeKinds: ['link-parser', 'asset-import'],
        optional: false,
      },
      {
        id: 'analyze',
        label: '② 参考约束',
        readinessKey: 'has_reference_board',
        canvasNodeKinds: ['reference-board', 'link-parser'],
        optional: false,
      },
      {
        id: 'generate',
        label: '③ 生成',
        readinessKey: 'has_viral_output',
        canvasNodeKinds: ['picture-gen', 'clip-gen'],
        optional: false,
      },
      {
        id: 'smart-edit',
        label: '④ 智能剪辑',
        readinessKey: 'has_timeline_draft',
        canvasNodeKinds: ['clip-editor'],
        optional: true,
      },
      {
        id: 'export',
        label: '⑤ 导出',
        readinessKey: 'export_ready',
        canvasNodeKinds: ['export-pack'],
        optional: false,
      },
    ];

    for (const expected of stepParams) {
      it(`步骤 ${expected.id} 参数完整`, () => {
        const step = viralSteps.find((s) => s.id === expected.id);
        expect(step, `步骤 ${expected.id} 缺失`).toBeDefined();
        expect(step!.label).toBe(expected.label);
        expect(step!.readinessKey).toBe(expected.readinessKey);
        expect(step!.canvasNodeKinds.sort()).toEqual(expected.canvasNodeKinds.sort());
        expect(!!step!.optional).toBe(expected.optional);
      });
    }
  });
});
