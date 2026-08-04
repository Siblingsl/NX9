/**
 * F-006 / F-007 / F-008 行为验收
 * 等价手工勾选：默认仅左右口 / Playbook 就绪矩阵 / 视频批准写回链
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PLAYBOOK_DEFINITIONS,
  WORKFLOW_TEMPLATES,
  approveStoryboardVideoShot,
  buildChainStoryboardPayload,
  evaluatePlaybookStep,
  has_reference_board,
  has_timeline_draft,
  has_video_assets,
  has_viral_output,
  isExecPortsEnabled,
  normalizeDataEdgeHandlesAwayFromExec,
  patchChainShot,
  readChainStoryboard,
  rejectStoryboardVideoShot,
  resolveVideoStatusBadge,
  resolveVisibleVerticalSockets,
  validateConnectionWithHandles,
  type PlaybookReadinessContext,
  type StoryboardShot,
} from '@nx9/shared';

const root = resolve(__dirname, '../../..');

function emptyCtx(partial: Partial<PlaybookReadinessContext> = {}): PlaybookReadinessContext {
  return {
    storyboard: { shots: [] },
    voice: { lines: [] },
    nodes: [],
    ...partial,
  };
}

function mkShot(partial: Partial<StoryboardShot> & { id: string }): StoryboardShot {
  return {
    index: 1,
    descriptionZh: partial.descriptionZh ?? partial.id,
    promptEn: partial.promptEn ?? partial.id,
    status: 'draft',
    ...partial,
  } as StoryboardShot;
}

describe('F-006 连接点默认仅左右', () => {
  it('新建生图节点默认无上下口（showExecPorts 缺省=false）', () => {
    expect(isExecPortsEnabled(undefined)).toBe(false);
    expect(isExecPortsEnabled({})).toBe(false);
    expect(isExecPortsEnabled({ showExecPorts: false })).toBe(false);
    expect(isExecPortsEnabled({ showExecPorts: true })).toBe(true);
    expect(resolveVisibleVerticalSockets('picture-gen', {})).toHaveLength(0);
    expect(resolveVisibleVerticalSockets('picture-gen', { showExecPorts: true }).length).toBeGreaterThan(0);
  });

  it('编剧台默认开启顶口 exec-picture，可连图像生成', () => {
    expect(isExecPortsEnabled(undefined, 'script-desk')).toBe(true);
    expect(isExecPortsEnabled({}, 'script-desk')).toBe(true);
    expect(isExecPortsEnabled({ showExecPorts: false }, 'script-desk')).toBe(false);
    const ports = resolveVisibleVerticalSockets('script-desk', {});
    expect(ports.some((p) => p.id === 'exec-picture')).toBe(true);
    const ok = validateConnectionWithHandles(
      'picture-gen',
      'script-desk',
      { showExecPorts: true },
      {},
      'exec-picture',
      'exec-picture',
    );
    expect(ok.ok).toBe(true);
  });

  it('松手吸附：未开启能力口时拒绝 exec handle', () => {
    const denied = validateConnectionWithHandles(
      'picture-gen',
      'storyboard-desk',
      { showExecPorts: false },
      { showExecPorts: false },
      'exec-picture',
      'exec-picture',
    );
    expect(denied.ok).toBe(false);
    expect(denied.reason).toBe('exec_ports_disabled');

    const allowed = validateConnectionWithHandles(
      'picture-gen',
      'storyboard-desk',
      { showExecPorts: true },
      { showExecPorts: true },
      'exec-picture',
      'exec-picture',
    );
    expect(allowed.ok).toBe(true);

    const horizontal = validateConnectionWithHandles(
      'picture-gen',
      'director-desk',
      {},
      {},
      'picture',
      'picture',
    );
    expect(horizontal.ok).toBe(true);
  });

  it('核心模板能力挂载仍可用（desk/picture showExecPorts + exec 边）', () => {
    const tpl = WORKFLOW_TEMPLATES.find((t) => t.id === 'tpl-core-episode');
    expect(tpl).toBeTruthy();
    const built = tpl!.build();
    const desk = built.blocks.find((b) => b.type === 'storyboard-desk');
    const picture = built.blocks.find((b) => b.type === 'picture-gen');
    expect(desk?.data?.showExecPorts).toBe(true);
    expect(picture?.data?.showExecPorts).toBe(true);
    const execEdge = built.links.find(
      (l) =>
        (l.sourceHandle === 'exec-picture' || l.targetHandle === 'exec-picture') &&
        (l.source === picture?.id || l.target === picture?.id),
    );
    expect(execEdge).toBeTruthy();
    const check = validateConnectionWithHandles(
      'picture-gen',
      'storyboard-desk',
      picture?.data as Record<string, unknown>,
      desk?.data as Record<string, unknown>,
      'exec-picture',
      'exec-picture',
    );
    expect(check.ok).toBe(true);
  });

  it('核心模板编剧→分镜走左右 prompt，不得挂 exec', () => {
    const tpl = WORKFLOW_TEMPLATES.find((t) => t.id === 'tpl-core-episode');
    const built = tpl!.build();
    const script = built.blocks.find((b) => b.type === 'script-desk');
    const desk = built.blocks.find((b) => b.type === 'storyboard-desk');
    const dataEdge = built.links.find(
      (l) => l.source === script?.id && l.target === desk?.id,
    );
    expect(dataEdge?.sourceHandle).toBe('prompt');
    expect(dataEdge?.targetHandle).toBe('prompt');

    const execEdge = built.links.find(
      (l) =>
        l.sourceHandle === 'exec-picture' &&
        l.targetHandle === 'exec-picture',
    );
    expect(execEdge).toBeTruthy();
  });

  it('normalizeDataEdgeHandlesAwayFromExec 纠正误挂顶口的数据边', () => {
    const nodes = [
      { id: 's', type: 'script-desk' },
      { id: 'd', type: 'storyboard-desk' },
    ];
    const fixed = normalizeDataEdgeHandlesAwayFromExec(nodes, [
      { id: 'e1', source: 's', target: 'd', sourceHandle: null, targetHandle: 'exec-picture' },
    ]);
    expect(fixed[0].sourceHandle).toBe('prompt');
    expect(fixed[0].targetHandle).toBe('prompt');
  });

  it('核心模板无出图→导演旁路（出图只挂分镜）', () => {
    const tpl = WORKFLOW_TEMPLATES.find((t) => t.id === 'tpl-core-episode');
    const built = tpl!.build();
    const picture = built.blocks.find((b) => b.type === 'picture-gen');
    const director = built.blocks.find((b) => b.type === 'director-desk');
    const bypass = built.links.find(
      (l) => l.source === picture?.id && l.target === director?.id,
    );
    expect(bypass).toBeUndefined();
  });

  it('normalize 拆除已挂分镜时的出图→导演旁路', () => {
    const nodes = [
      { id: 'p', type: 'picture-gen' },
      { id: 'd', type: 'storyboard-desk' },
      { id: 'dir', type: 'director-desk' },
    ];
    const fixed = normalizeDataEdgeHandlesAwayFromExec(nodes, [
      {
        id: 'exec',
        source: 'p',
        target: 'd',
        sourceHandle: 'exec-picture',
        targetHandle: 'exec-picture',
      },
      {
        id: 'bypass',
        source: 'p',
        target: 'dir',
        sourceHandle: 'picture',
        targetHandle: 'picture',
      },
      {
        id: 'chain',
        source: 'd',
        target: 'dir',
        sourceHandle: 'prompt',
        targetHandle: 'prompt',
      },
    ]);
    expect(fixed.some((l) => l.id === 'bypass')).toBe(false);
    expect(fixed.some((l) => l.id === 'exec')).toBe(true);
    expect(fixed.some((l) => l.id === 'chain')).toBe(true);
  });

  it('源码守卫：无运行时强制覆写；spawn/校验已接线', () => {
    const deskSrc = readFileSync(
      resolve(root, 'apps/web/src/blocks/craft/storyboard-desk/use-storyboard-desk.tsx'),
      'utf8',
    );
    expect(deskSrc.includes('updateNodeData(id, { showExecPorts: true })')).toBe(false);
    expect(deskSrc.includes('不再运行时覆写')).toBe(true);

    const shellSrc = readFileSync(
      resolve(root, 'apps/web/src/blocks/shared/BlockShell.tsx'),
      'utf8',
    );
    // 编剧台（设定板宿主）默认开启顶口；其它节点仍缺省关闭
    expect(shellSrc.includes("type === 'script-desk'")).toBe(true);
    expect(shellSrc.includes('configuredShowExecPorts')).toBe(true);

    const flowSrc = readFileSync(
      resolve(root, 'apps/web/src/engine/FlowSurface.tsx'),
      'utf8',
    );
    expect(flowSrc.includes('validateConnectionWithHandles')).toBe(true);
    expect(flowSrc.includes('上下口为能力挂载')).toBe(true);
  });
});

describe('F-007 Playbook 就绪条件', () => {
  it('爆款参考步不再要分镜镜头（has_reference_board）', () => {
    const falseCtx = emptyCtx({
      nodes: [{ id: 'rb', type: 'reference-board', data: {} }],
      storyboard: { shots: [] },
    });
    expect(has_reference_board(falseCtx)).toBe(false);

    const withItems = emptyCtx({
      nodes: [{ id: 'rb', type: 'reference-board', data: { items: [{ url: 'https://x' }] } }],
    });
    expect(has_reference_board(withItems)).toBe(true);

    // 运算符优先级回归：非 reference-board 节点带 url 不得误判
    const decoy = emptyCtx({
      nodes: [{ id: 'pg', type: 'picture-gen', data: { url: 'https://decoy' } }],
    });
    expect(has_reference_board(decoy)).toBe(false);

    const viral = PLAYBOOK_DEFINITIONS.find((p) => p.id === 'pb-viral-short');
    const refStep = viral?.steps.find((s) => s.id === 'analyze');
    expect(refStep?.readinessKey).toBe('has_reference_board');
    expect(evaluatePlaybookStep(refStep!, withItems).ready).toBe(true);
    expect(evaluatePlaybookStep(refStep!, falseCtx).ready).toBe(false);
  });

  it('智能剪辑步要时间线（has_timeline_draft）', () => {
    const noDraft = emptyCtx({
      nodes: [{ id: 'ed', type: 'clip-editor', data: {} }],
    });
    expect(has_timeline_draft(noDraft)).toBe(false);

    const withDraft = emptyCtx({
      nodes: [
        {
          id: 'ed',
          type: 'clip-editor',
          data: { timelineDraft: { clips: [{ id: 'c1' }] } },
        },
      ],
    });
    expect(has_timeline_draft(withDraft)).toBe(true);

    const core = PLAYBOOK_DEFINITIONS.find((p) => p.id === 'pb-ai-comic-live');
    const editStep = core?.steps.find((s) => s.id === 'smart-edit');
    expect(editStep?.readinessKey).toBe('has_timeline_draft');
    expect(evaluatePlaybookStep(editStep!, withDraft).ready).toBe(true);
    expect(evaluatePlaybookStep(editStep!, noDraft).ready).toBe(false);
  });

  it('核心视频步不因未批准永久卡死（has_video_assets，非 all_videos_approved）', () => {
    const core = PLAYBOOK_DEFINITIONS.find((p) => p.id === 'pb-ai-comic-live');
    const videoStep = core?.steps.find((s) => s.id === 'video-gen');
    expect(videoStep?.readinessKey).toBe('has_video_assets');
    expect(core?.steps.some((s) => s.readinessKey === 'all_videos_approved')).toBe(false);

    const withVideosUnapproved = emptyCtx({
      chainShots: [
        { id: 's1', status: 'review', videoAssetId: 'v1', videoStatus: 'review' },
        { id: 's2', status: 'review', videoAssetId: 'v2', videoStatus: 'failed' },
      ],
    });
    expect(has_video_assets(withVideosUnapproved)).toBe(true);
    expect(evaluatePlaybookStep(videoStep!, withVideosUnapproved).ready).toBe(true);

    const missingVideo = emptyCtx({
      chainShots: [
        { id: 's1', status: 'review', videoAssetId: 'v1', videoStatus: 'approved' },
        { id: 's2', status: 'draft' },
      ],
    });
    expect(has_video_assets(missingVideo)).toBe(false);
    expect(evaluatePlaybookStep(videoStep!, missingVideo).ready).toBe(false);
  });

  it('爆款生成步用 has_viral_output', () => {
    const viral = PLAYBOOK_DEFINITIONS.find((p) => p.id === 'pb-viral-short');
    const genStep = viral?.steps.find((s) => s.id === 'generate');
    expect(genStep?.readinessKey).toBe('has_viral_output');

    const ready = emptyCtx({
      nodes: [
        {
          id: 'cg',
          type: 'clip-gen',
          data: { status: 'success', mediaUrl: 'https://media/x.mp4' },
        },
      ],
    });
    expect(has_viral_output(ready)).toBe(true);
    expect(evaluatePlaybookStep(genStep!, ready).ready).toBe(true);

    const notReady = emptyCtx({
      nodes: [{ id: 'cg', type: 'clip-gen', data: { status: 'success' } }],
    });
    expect(has_viral_output(notReady)).toBe(false);
  });
});

describe('F-008 视频批准 / 审片', () => {
  it('可单镜批准/打回', () => {
    const shot = mkShot({
      id: 's1',
      videoAssetId: 'https://v/1.mp4',
      videoStatus: 'review',
      status: 'review',
    });
    const approved = approveStoryboardVideoShot(shot);
    expect(approved).toBeTruthy();
    expect(approved!.videoStatus).toBe('approved');

    const rejected = rejectStoryboardVideoShot(shot, '运镜不对');
    expect(rejected).toBeTruthy();
    expect(rejected!.videoStatus).toBe('failed');
    expect(rejected!.reviewHistory?.at(-1)?.comment).toBe('运镜不对');

    expect(rejectStoryboardVideoShot(shot, '   ')).toBeNull();
    expect(approveStoryboardVideoShot(mkShot({ id: 'empty' }))).toBeNull();
  });

  it('可批量批准上游镜头（approve 助手对每镜生效）', () => {
    const shots = [
      mkShot({ id: 'a', videoAssetId: 'va', videoStatus: 'review' }),
      mkShot({ id: 'b', videoAssetId: 'vb', videoStatus: 'review' }),
    ];
    const patched = shots.map((s) => ({ ...s, ...approveStoryboardVideoShot(s)! }));
    expect(patched.every((s) => s.videoStatus === 'approved')).toBe(true);
  });

  it('状态持久化在链 desk（patch → read 刷新可见）', () => {
    let chain = buildChainStoryboardPayload(undefined, {
      shots: [
        mkShot({
          id: 's1',
          videoAssetId: 'https://v/1.mp4',
          videoStatus: 'review',
          status: 'review',
        }),
      ],
    });
    const approved = approveStoryboardVideoShot(chain.shots[0])!;
    const nextShots = patchChainShot(chain, 's1', approved);
    chain = buildChainStoryboardPayload(chain, { shots: nextShots });

    const deskData = { chainStoryboard: chain };
    const visible = readChainStoryboard(deskData);
    expect(visible?.shots[0].videoStatus).toBe('approved');

    const rejected = rejectStoryboardVideoShot(visible!.shots[0], '节奏慢');
    const afterReject = patchChainShot(chain, 's1', rejected!);
    chain = buildChainStoryboardPayload(chain, { shots: afterReject });
    const again = readChainStoryboard({ chainStoryboard: chain });
    expect(again?.shots[0].videoStatus).toBe('failed');
    expect(again?.shots[0].reviewHistory?.some((e) => e.comment === '节奏慢')).toBe(true);
  });

  it('徽章色：pending 灰 / approved 绿 / rejected 红', () => {
    expect(resolveVideoStatusBadge('review')).toEqual({ tone: 'pending', label: '待审核' });
    expect(resolveVideoStatusBadge('draft')).toEqual({ tone: 'pending', label: '待审核' });
    expect(resolveVideoStatusBadge('approved')).toEqual({ tone: 'approved', label: '已批准' });
    expect(resolveVideoStatusBadge('failed')).toEqual({ tone: 'rejected', label: '已打回' });
  });

  it('VideoWorkspace 源码接线：单镜批准/打回必填/徽章', () => {
    const src = readFileSync(
      resolve(root, 'apps/web/src/engine/stage-deck/chrome/attached-workspace/generation/video/VideoWorkspace.tsx'),
      'utf8',
    );
    expect(src.includes('approveStoryboardVideoShot')).toBe(true);
    expect(src.includes('rejectStoryboardVideoShot')).toBe(true);
    expect(src.includes('resolveVideoStatusBadge')).toBe(true);
    expect(src.includes('全部批准')).toBe(true);
    expect(src.includes('原因必填')).toBe(true);
    expect(src.includes('patchChainShotLocal')).toBe(true);
  });
});
