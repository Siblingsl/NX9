/**
 * ConsistencyCheckSection —— 组件行为回归（跨格 / 跨镜一致性校验面板）。
 *
 * 覆盖边界（本次新增）：面板此前只有纯函数层测试（`consistency-report.test.ts` /
 * `consistency-check.test.ts` 覆盖判定与取数壳层），**React 交互与中文提示零覆盖**。
 *
 * mock 手法：
 * - `@nx9/shared` 走 barrel 替身（既有缺陷：barrel 引用了 8 个不存在的 data/* 模块），
 *   替身指向**真实源码模块**，因此 `buildConsistencyReport` / `pickBestCell` 是真实实现；
 * - `../consistency-check` 只替换 `analyzeCellFaces` 的**网络边缘**（注入 analyze），
 *   限流 / 逐格结果 / 失败原因归一仍走真实壳层代码。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const hoisted = vi.hoisted(() => ({
  /** 服务端 `/api/tools/analyze-faces` 的替身：由各用例按 URL 注入成功 / 失败 */
  analyze: vi.fn(),
  /** 强制让取数壳层本身抛错（壳层正常不抛；这里专门覆盖面板的兜底分支） */
  forceThrow: null as string | null,
}));

vi.mock('@nx9/shared', async () => {
  const { buildSharedBarrelMock } = await import('./support/shared-barrel-mock');
  return buildSharedBarrelMock();
});

vi.mock('../consistency-check', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../consistency-check')>();
  return {
    ...actual,
    // 真实取数壳层 + 注入的网络边缘（缓存关掉，避免跨用例串味）
    analyzeCellFaces: async (
      urls: readonly string[],
      options?: Parameters<typeof actual.analyzeCellFaces>[1],
    ) => {
      if (hoisted.forceThrow) throw new Error(hoisted.forceThrow);
      return actual.analyzeCellFaces(urls, {
        ...options,
        cache: false,
        analyze: (imageUrl: string) => hoisted.analyze(imageUrl),
      });
    },
  };
});

import {
  ConsistencyCheckSection,
  type ConsistencyTarget,
} from '../stage-deck/chrome/attached-workspace/consistency/ConsistencyCheckSection';
import { useActivityLog } from '../../stores/activity-log';
import { useToast } from '../../stores/toast';

/** 一格人脸分析成功的结果体（与 api.analyzeFaces 的返回形状一致） */
function face(expression: string, description: string, confidence = 0.9) {
  return { expression, confidence, description };
}

/** 按 URL 分发服务端结果；未登记的 URL 一律 ok:false（不静默成功） */
function stubFaces(byUrl: Record<string, { ok: true; faces: ReturnType<typeof face>[] } | { ok: false; message?: string; summary?: string }>) {
  hoisted.analyze.mockImplementation(async (url: string) => {
    const hit = byUrl[url];
    if (!hit) return { ok: false, message: `未登记的分析结果：${url}` };
    return hit;
  });
}

const TARGETS: ConsistencyTarget[] = [
  { index: 0, label: '正面', url: '/media/a.png' },
  { index: 1, label: '侧面', url: '/media/b.png' },
  { index: 2, label: '背面', url: '/media/c.png' },
];

function renderSection(props: Partial<Parameters<typeof ConsistencyCheckSection>[0]> = {}) {
  const onJump = vi.fn();
  const view = render(
    <ConsistencyCheckSection targets={TARGETS} onJump={onJump} {...props} />,
  );
  return { onJump, ...view };
}

beforeEach(() => {
  hoisted.analyze.mockReset();
  hoisted.forceThrow = null;
  useToast.setState({ items: [] });
  useActivityLog.setState({ lines: [], open: false });
});

describe('ConsistencyCheckSection：空态 / 无上游', () => {
  it('一格都没出图：按钮禁用，且点击给出中文原因，不发任何分析请求', () => {
    renderSection({ targets: [{ index: 0, label: '正面' }, { index: 1, label: '侧面' }] });
    const button = screen.getByRole('button', { name: /一致性校验/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('title')).toBe('还没有任何格出图');
    // 未出图时不发起任何请求
    expect(hoisted.analyze).not.toHaveBeenCalled();
    // 空态说明文案在（不是空白成功态）
    expect(screen.getByText(/对已出图的格做图像级体检/)).toBeTruthy();
    expect(screen.queryByText(/本次比对未发现格间不一致/)).toBeNull();
  });

  it('「挑最优格」在校验前禁用，并提示先做一次校验', () => {
    renderSection();
    const pick = screen.getByRole('button', { name: /挑最优格/ }) as HTMLButtonElement;
    expect(pick.disabled).toBe(true);
    expect(pick.getAttribute('title')).toBe('先做一次一致性校验');
  });
});

describe('ConsistencyCheckSection：校验 → 报告渲染', () => {
  it('点校验：按全部格（含未出图格）传 URL，报告落地并写入操作日志', async () => {
    stubFaces({
      '/media/a.png': { ok: true, faces: [face('neutral', 'short black hair, blue jacket')] },
      '/media/b.png': { ok: true, faces: [face('neutral', 'short black hair, blue jacket')] },
      '/media/c.png': { ok: true, faces: [face('neutral', 'short black hair, blue jacket')] },
    });
    renderSection({ contextZh: '画面推演（3×3）', scopeLabelZh: '多格推演' });

    fireEvent.click(screen.getByRole('button', { name: /一致性校验/ }));

    await waitFor(() => expect(hoisted.analyze).toHaveBeenCalledTimes(3));
    // 传的是全量格子（未出图的格传空串，由壳层计 skipped），下标与 targets 对齐
    expect(hoisted.analyze.mock.calls.map((c) => c[0])).toEqual([
      '/media/a.png',
      '/media/b.png',
      '/media/c.png',
    ]);
    // 报告概览与「可用分析」计数（真实 buildConsistencyReport 产出）
    expect(await screen.findByText(/可用分析 3\/3 格/)).toBeTruthy();
    expect(screen.getByText(/画面推演（3×3）/)).toBeTruthy();
    // 按钮文案改为「重新校验」
    expect(screen.getByRole('button', { name: /重新校验/ })).toBeTruthy();
    // 会话日志如实记录（scopeLabelZh 参与文案）
    const lines = useActivityLog.getState().lines;
    expect(lines.some((line) => line.includes('一致性校验 · 多格推演'))).toBe(true);
  });

  it('人脸有无不一致 → 错误级条目；「证据」可展开看到逐格原始值；「跳到该格」回调对应该格', async () => {
    stubFaces({
      '/media/a.png': { ok: true, faces: [face('neutral', 'short black hair, blue jacket')] },
      '/media/b.png': { ok: true, faces: [face('neutral', 'short black hair, blue jacket')] },
      '/media/c.png': { ok: true, faces: [] },
    });
    const { onJump } = renderSection();
    fireEvent.click(screen.getByRole('button', { name: /一致性校验/ }));

    // 背面格未检出人脸 → 错误级（真实 compareFacePresence）
    expect(await screen.findByText('错误')).toBeTruthy();
    expect(screen.getByText(/背面未检出人脸/)).toBeTruthy();
    expect(screen.getByText(/对照 #1 #2/)).toBeTruthy();

    // 证据未展开时看不到逐格条目
    expect(screen.queryByText(/0 张人脸（未检出）/)).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: /证据/ })[0]);
    expect(screen.getByText(/0 张人脸（未检出）/)).toBeTruthy();
    // 证据逐格列出取值：两格「1 张人脸」+ 一格「0 张人脸（未检出）」
    expect(screen.getAllByText(/1 张人脸/)).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: '跳到该格' })[0]);
    expect(onJump).toHaveBeenCalledWith(2);
  });

  it('外观关键词偏离多数基线 → 警告级条目，证据里带具体取值', async () => {
    stubFaces({
      '/media/a.png': { ok: true, faces: [face('neutral', 'short black hair, blue jacket')] },
      '/media/b.png': { ok: true, faces: [face('neutral', 'short black hair, blue jacket')] },
      '/media/c.png': { ok: true, faces: [face('neutral', 'long red hair, green dress')] },
    });
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /一致性校验/ }));

    // 外观偏基线 → 警告级（真实 findAppearanceConflicts），且不假报错误级
    await waitFor(() => expect(screen.getAllByText('警告').length).toBeGreaterThan(0));
    expect(screen.queryByText('错误')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: /证据/ })[0]);
    // 证据条目形如「#3 背面：<原始描述>」
    expect(screen.getByText(/#3 背面：/)).toBeTruthy();
  });

  it('校验结果全一致时不假报问题：明确写「未发现格间不一致」', async () => {
    stubFaces({
      '/media/a.png': { ok: true, faces: [face('neutral', 'short black hair, blue jacket')] },
      '/media/b.png': { ok: true, faces: [face('neutral', 'short black hair, blue jacket')] },
      '/media/c.png': { ok: true, faces: [face('neutral', 'short black hair, blue jacket')] },
    });
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /一致性校验/ }));
    expect(
      await screen.findByText(/本次比对未发现格间不一致（判定为启发式，仅供参考）。/),
    ).toBeTruthy();
  });
});

describe('ConsistencyCheckSection：失败分支不伪造结论', () => {
  it('个别格分析失败：该格逐格标注真实原因，其余格照常比对（不被当成「无人脸」）', async () => {
    stubFaces({
      '/media/a.png': { ok: true, faces: [face('neutral', 'short black hair, blue jacket')] },
      '/media/b.png': { ok: true, faces: [face('neutral', 'short black hair, blue jacket')] },
      '/media/c.png': { ok: false, message: '视觉服务未配置（禁止空成功）' },
    });
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /一致性校验/ }));

    // 失败格产出一条 cell-unanalyzed（真实 buildConsistencyReport），原因原样呈现
    expect(await screen.findByText(/没有可用的人脸分析结果：视觉服务未配置（禁止空成功）/)).toBeTruthy();
    expect(screen.getByText(/可用分析 2\/3 格/)).toBeTruthy();
    expect(screen.getByText(/分析失败 1 格/)).toBeTruthy();
    // 有失败格时不能给出「全一致」的假结论
    expect(screen.queryByText(/本次比对未发现格间不一致/)).toBeNull();
    // 该原因已由报告条目逐格覆盖 → 兜底清单不重复说一遍
    expect(screen.queryByText(/逐格失败原因/)).toBeNull();
  });

  it('只有 1 格有可用分析 → 报告口径为「不出结论」，不假报一致', async () => {
    stubFaces({
      '/media/a.png': { ok: true, faces: [face('neutral', 'short black hair, blue jacket')] },
      '/media/b.png': { ok: false, message: '视觉服务未配置（禁止空成功）' },
      '/media/c.png': { ok: false, message: '视觉服务未配置（禁止空成功）' },
    });
    const { onJump } = renderSection();
    fireEvent.click(screen.getByRole('button', { name: /一致性校验/ }));

    expect(await screen.findByText(/本次未出结论：/)).toBeTruthy();
    expect(screen.getAllByText(/少于 2 格，无法做格间比较/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/本次比对未发现格间不一致/)).toBeNull();
    // 唯一候选仍可被推荐，但理由里必须写明「未做格间比较」（不越权下结论）
    fireEvent.click(screen.getByRole('button', { name: /挑最优格/ }));
    expect(await screen.findByText('推荐格')).toBeTruthy();
    expect(screen.getByText(/仅此格有可用分析，未做格间比较/)).toBeTruthy();
    expect(onJump).toHaveBeenCalledWith(0);
  });

  it('1 成功 2 失败：逐格失败原因照样逐条可见（结论可以缺席，原因不许丢）', async () => {
    stubFaces({
      '/media/a.png': { ok: true, faces: [face('neutral', 'short black hair, blue jacket')] },
      '/media/b.png': { ok: false, message: '视觉服务未配置（禁止空成功）' },
      // 服务端把原因写在 summary 上时也要照说（message 优先、summary 兜底）
      '/media/c.png': { ok: false, summary: '服务端 502：视觉通道不可用' },
    });
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /一致性校验/ }));

    // 结论照旧缺席：可用分析不足 2 格就不做格间比较
    expect(await screen.findByText(/本次未出结论：/)).toBeTruthy();
    expect(screen.queryByText(/本次比对未发现格间不一致/)).toBeNull();
    // 逐格原因带格名逐条可见（不因为「结论出不来」就把原因一起丢掉）
    expect(screen.getByText(/逐格失败原因（2 格未参与格间比较，原因原样列出）：/)).toBeTruthy();
    expect(screen.getByText('· 侧面：视觉服务未配置（禁止空成功）')).toBeTruthy();
    expect(screen.getByText('· 背面：服务端 502：视觉通道不可用')).toBeTruthy();
    // 不可分析的格不得被当成「无人脸」参与比对（不虚构格间比较）
    expect(screen.queryByText('错误')).toBeNull();
    expect(screen.queryByText('警告')).toBeNull();
  });

  it('全部格分析失败 → 明确「无法推荐」，且排除理由为空、不给格号', async () => {
    stubFaces({
      '/media/a.png': { ok: false, message: '视觉服务未配置（禁止空成功）' },
      '/media/b.png': { ok: false, message: '视觉服务未配置（禁止空成功）' },
      '/media/c.png': { ok: false, message: '视觉服务未配置（禁止空成功）' },
    });
    const { onJump } = renderSection();
    fireEvent.click(screen.getByRole('button', { name: /一致性校验/ }));
    await screen.findByText(/本次未出结论：/);

    fireEvent.click(screen.getByRole('button', { name: /挑最优格/ }));
    expect(await screen.findByText('无法推荐')).toBeTruthy();
    expect(screen.getByText(/无法推荐：没有可用的人脸分析结果/)).toBeTruthy();
    // 无候选 → 不产生「跳到该格」入口，也不触发回调
    expect(screen.queryByRole('button', { name: '跳到该格' })).toBeNull();
    expect(onJump).not.toHaveBeenCalled();
  });

  it('接口 reject 不静默：逐格落「请求失败 + 真实原因」，报告仍不出结论', async () => {
    hoisted.analyze.mockImplementation(async (url: string) => {
      if (url === '/media/c.png') throw new Error('网络中断');
      return { ok: true, faces: [face('neutral', 'short black hair, blue jacket')] };
    });
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /一致性校验/ }));

    // 该原因同时出现在条目 messageZh 与证据 summaryZh 两处，故用 getAllByText
    expect((await screen.findAllByText(/人脸分析请求失败：网络中断/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/本次比对未发现格间不一致/)).toBeNull();
    // 取数壳层按设计不抛，因此这里**不该**出现兜底失败 toast
    expect(useToast.getState().items).toHaveLength(0);
  });

  it('取数壳层本身抛异常 → 兜底 toast + 操作日志如实报错，不生成报告', async () => {
    hoisted.forceThrow = '触发了兜底路径';
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /一致性校验/ }));

    await waitFor(() => {
      const items = useToast.getState().items;
      expect(items.some((i) => i.message.includes('一致性校验失败：触发了兜底路径'))).toBe(true);
    });
    expect(
      useActivityLog.getState().lines.some((line) => line.includes('一致性校验 · 失败：触发了兜底路径')),
    ).toBe(true);
    // 没有报告：概览与空态说明都不出现
    expect(screen.queryByText(/可用分析/)).toBeNull();
    expect(screen.queryByText(/本次未出结论：/)).toBeNull();
    // 按钮回到可点状态（busy 已复位）
    expect((screen.getByRole('button', { name: /一致性校验/ }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});

describe('ConsistencyCheckSection：挑最优格 / 过期提示', () => {
  it('挑最优格：优先格被选中，展示推荐理由与跳转入口，并写入日志', async () => {
    stubFaces({
      '/media/a.png': { ok: true, faces: [face('neutral', 'short black hair, blue jacket')] },
      '/media/b.png': { ok: true, faces: [face('neutral', 'short black hair, blue jacket')] },
      '/media/c.png': { ok: true, faces: [face('neutral', 'short black hair, blue jacket')] },
    });
    const { onJump } = renderSection({ preferIndexes: [1] });
    fireEvent.click(screen.getByRole('button', { name: /一致性校验/ }));
    await screen.findByText(/可用分析 3\/3 格/);

    fireEvent.click(screen.getByRole('button', { name: /挑最优格/ }));

    expect(await screen.findByText('推荐格')).toBeTruthy();
    // 判据：警告 / 提示都为 0 时，优先格胜出 → 第 2 格
    expect(onJump).toHaveBeenCalledWith(1);
    expect(screen.getByText(/候选排序（判据明细）/)).toBeTruthy();
    expect(useActivityLog.getState().lines.some((line) => line.includes('一致性校验 · 推荐'))).toBe(
      true,
    );
  });

  it('格图在上次校验后变化 → 提示报告可能过期，重新校验后提示消失', async () => {
    stubFaces({
      '/media/a.png': { ok: true, faces: [face('neutral', 'short black hair, blue jacket')] },
      '/media/b.png': { ok: true, faces: [face('neutral', 'short black hair, blue jacket')] },
      '/media/c.png': { ok: true, faces: [face('neutral', 'short black hair, blue jacket')] },
    });
    const { rerender } = render(
      <ConsistencyCheckSection targets={TARGETS} onJump={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /一致性校验/ }));
    await screen.findByText(/可用分析 3\/3 格/);
    expect(screen.queryByText(/当前报告可能已过期/)).toBeNull();

    // 换掉一格图 → 报告签名失配
    rerender(
      <ConsistencyCheckSection
        targets={[TARGETS[0]!, TARGETS[1]!, { index: 2, label: '背面', url: '/media/c2.png' }]}
        onJump={vi.fn()}
      />,
    );
    expect(screen.getByText(/当前报告可能已过期，建议「重新校验」。/)).toBeTruthy();

    stubFaces({
      '/media/a.png': { ok: true, faces: [face('neutral', 'short black hair, blue jacket')] },
      '/media/b.png': { ok: true, faces: [face('neutral', 'short black hair, blue jacket')] },
      '/media/c2.png': { ok: true, faces: [face('neutral', 'short black hair, blue jacket')] },
    });
    fireEvent.click(screen.getByRole('button', { name: /重新校验/ }));
    await waitFor(() => expect(screen.queryByText(/当前报告可能已过期/)).toBeNull());
  });
});
