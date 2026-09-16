/**
 * CharacterSheetWorkspace —— 组件行为回归（角色设定表工作区）。
 *
 * 覆盖边界（本次新增）：设定表此前只有纯函数层测试（`character-sheet-plan` /
 * `character-sheet-closure` / `character-sheet-block-map`），**面板交互与中文提示零覆盖**。
 *
 * mock 手法：
 * - `@nx9/shared` 走 barrel 替身（既有缺陷：barrel 引用了 8 个不存在的 data/* 模块）。
 *   本组件还要 `stripAssetPinRevision`，它所在的 `utils/collect-used-assets.ts` 会经
 *   `utils/asset-library.ts → utils/creative-asset-prompts.ts` 触到缺失的 `data/creative-asset-presets`，
 *   因此额外把那条链的**叶子** mock 成一个「一被调用就抛错」的哨兵：
 *   `stripAssetPinRevision` 仍是真实实现，只有无人调用的 `resolveAssetPromptText` 被替换。
 * - `@xyflow/react` 用内存流图（`updateNodeData` 是 spy 且真的落 data 并触发重渲染）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

const poisons = vi.hoisted(() => ({
  resolveAssetPromptText: vi.fn(() => {
    throw new Error('测试哨兵：本次角色设定表面板路径不应调用 resolveAssetPromptText');
  }),
}));

type FlowNode = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

const flow = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state: { nodes: FlowNode[]; edges: Array<Record<string, unknown>> } = {
    nodes: [],
    edges: [],
  };
  const emit = () => listeners.forEach((fn) => fn());
  const updateNodeData = vi.fn(
    (
      id: string,
      patchOrUpdater:
        | Record<string, unknown>
        | ((node: { id: string; data: Record<string, unknown> }) => Record<string, unknown>),
    ) => {
      const at = state.nodes.findIndex((node) => node.id === id);
      if (at < 0) throw new Error('updateNodeData：未知节点 ' + id);
      const node = state.nodes[at]!;
      const next =
        typeof patchOrUpdater === 'function'
          ? patchOrUpdater({ id, data: node.data })
          : patchOrUpdater;
      const data = { ...node.data, ...next };
      state.nodes = state.nodes.map((item, i) => (i === at ? { ...item, data } : item));
      emit();
    },
  );
  return { state, listeners, updateNodeData };
});

// 被污染的叶子（见文件头说明）：必须在 `@nx9/shared` 替身取真实模块之前注册
vi.mock('../../../../../packages/shared/src/utils/creative-asset-prompts', () => poisons);

vi.mock('@nx9/shared', async () => {
  const { buildSharedBarrelMock, loadPoisonedBarrelExtras } = await import(
    './support/shared-barrel-mock'
  );
  return buildSharedBarrelMock(await loadPoisonedBarrelExtras());
});

vi.mock('@xyflow/react', async () => {
  const React = await import('react');
  const useFlowNodes = () =>
    React.useSyncExternalStore(
      (fn: () => void) => {
        flow.listeners.add(fn);
        return () => flow.listeners.delete(fn);
      },
      () => flow.state.nodes,
      () => flow.state.nodes,
    );
  return {
    useNodes: useFlowNodes,
    useEdges: () => flow.state.edges,
    useNodesData: (id: string) => useFlowNodes().find((node) => node.id === id),
    useReactFlow: () => ({ updateNodeData: flow.updateNodeData }),
  };
});

vi.mock('../../api/client', () => {
  const ok = vi.fn(async () => ({ ok: true }));
  return {
    api: new Proxy({}, { get: () => ok }),
  };
});

import { CharacterSheetWorkspace } from '../stage-deck/chrome/attached-workspace/tool/CharacterSheetWorkspace';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { useToast } from '../../stores/toast';
import {
  CHARACTER_SHEET_KINDS,
  lookupCharacterSheetKindDef,
} from '../../../../../packages/shared/src/utils/character-sheet-plan';

const BLOCK_ID = 'cs-1';

function kindDef(id: string) {
  const def = CHARACTER_SHEET_KINDS.find((k) => k.id === id);
  if (!def) throw new Error('测试前置失败：版面表缺少 ' + id);
  return def;
}
const KIND_TURNAROUND = kindDef('turnaround');
const KIND_EXPRESSION = kindDef('expression');

/** 素材库角色（只填本面板真正读到的字段） */
function character(id: string, name: string, referenceImageUrl?: string) {
  return {
    id,
    kind: 'character' as const,
    scope: 'private' as const,
    label: name,
    name,
    prompt: '',
    consistencyPrompt: `${name}的锁定外观：黑发、蓝色外套`,
    referenceImageUrl,
  };
}

function setNodeData(data: Record<string, unknown>) {
  flow.state.nodes = [
    { id: BLOCK_ID, type: 'character-sheet-desk', position: { x: 0, y: 0 }, data },
  ];
  flow.state.edges = [];
}

function lastPatch(): Record<string, unknown> {
  const call = flow.updateNodeData.mock.calls.at(-1);
  if (!call) throw new Error('本用例未发生任何 updateNodeData');
  expect(call[0]).toBe(BLOCK_ID);
  return call[1] as Record<string, unknown>;
}

function advancedScope(): ReturnType<typeof within> {
  fireEvent.click(screen.getByTitle('更多设置'));
  const panel = document.querySelector('.nx9-composer-popover');
  if (!panel) throw new Error('参数面板未渲染');
  return within(panel as HTMLElement);
}

beforeEach(() => {
  flow.updateNodeData.mockClear();
  flow.listeners.clear();
  poisons.resolveAssetPromptText.mockClear();
  setNodeData({});
  useActivityLog.setState({ lines: [], open: false });
  useToast.setState({ items: [] });
  useWorkspaceDocument.setState({ characters: { characters: [] } as never });
});

describe('CharacterSheetWorkspace：空态 / 无参考图', () => {
  it('未出图：写回类操作逐条禁用并给出真实原因，空态文案如实说明「纯文字设定表」', () => {
    render(<CharacterSheetWorkspace blockId={BLOCK_ID} kind="character-sheet-desk" />);

    expect(
      screen.getByText(
        '无参考图：本次为纯文字设定表（一致性仅由锁定短语约束）；可连接上游图片或选择素材库角色',
      ),
    ).toBeTruthy();

    const compose = screen.getByRole('button', { name: '拼成设定表' }) as HTMLButtonElement;
    expect(compose.disabled).toBe(true);
    expect(compose.getAttribute('title')).toBe(
      '把逐格设定图按当前版面拼成一张设定表（缺图格用参考图占位并如实标注）',
    );
    expect(
      (screen.getByRole('button', { name: '登记为角色参考图' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    const download = screen.getByRole('button', { name: '下载设定表' }) as HTMLButtonElement;
    expect(download.disabled).toBe(true);
    expect(download.getAttribute('title')).toBe('还没有拼合设定表');

    const retry = screen.getByRole('button', { name: /重试未完成格/ }) as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    const resume = screen.getByRole('button', { name: /续查未完成格/ }) as HTMLButtonElement;
    expect(resume.disabled).toBe(true);

    expect((screen.getByRole('button', { name: /一致性校验/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    // 空态不得偷偷写回
    expect(flow.updateNodeData).not.toHaveBeenCalled();
    // 也不得触碰被污染的叶子
    expect(poisons.resolveAssetPromptText).not.toHaveBeenCalled();
  });

  it('三视图默认版面：格数 / 概览 / 主 CTA 文案都按真实版面表生成（无需参考图也要能出图）', () => {
    render(<CharacterSheetWorkspace blockId={BLOCK_ID} kind="character-sheet-desk" />);

    expect(screen.getAllByTitle('编辑后该格按此文本出图（中英同源）')).toHaveLength(
      KIND_TURNAROUND.cellCount,
    );
    const run = screen.getByRole('button', {
      name: `${KIND_TURNAROUND.label} · 批量出图`,
    }) as HTMLButtonElement;
    expect(run.disabled).toBe(false);

    const params = advancedScope();
    expect(
      params.getByText(
        new RegExp(
          `${KIND_TURNAROUND.label} · ${KIND_TURNAROUND.rows}×${KIND_TURNAROUND.cols} · ${KIND_TURNAROUND.cellCount} 格 · 模型 `,
        ),
      ),
    ).toBeTruthy();
    expect(params.getByText('一致性锁定短语（逐格复述）')).toBeTruthy();
  });
});

describe('CharacterSheetWorkspace：版面 / 一致性档位写回', () => {
  it('切版面写入固定字段组并清空上一版面的计划稿', () => {
    render(<CharacterSheetWorkspace blockId={BLOCK_ID} kind="character-sheet-desk" />);
    fireEvent.click(screen.getByRole('button', { name: KIND_EXPRESSION.label }));

    expect(lastPatch()).toEqual({
      characterSheetKind: KIND_EXPRESSION.id,
      characterSheetPlan: undefined,
      characterSheetCells: undefined,
      characterSheetRows: KIND_EXPRESSION.rows,
      characterSheetCols: KIND_EXPRESSION.cols,
    });
    expect(screen.getAllByTitle('编辑后该格按此文本出图（中英同源）')).toHaveLength(
      KIND_EXPRESSION.cellCount,
    );
    expect(
      screen.getByRole('button', { name: `${KIND_EXPRESSION.label} · 批量出图` }),
    ).toBeTruthy();
  });

  it('切一致性档位：写入 consistency 并清空计划稿，概览里的「一致性强度」跟着真实档位变化', () => {
    render(<CharacterSheetWorkspace blockId={BLOCK_ID} kind="character-sheet-desk" />);
    const params = advancedScope();
    expect(params.getByText(/一致性强度 0\.72/)).toBeTruthy(); // 默认「标准」

    fireEvent.click(screen.getByRole('button', { name: '一致性 严格' }));

    expect(lastPatch()).toEqual({
      consistency: 'strict',
      characterSheetPlan: undefined,
      characterSheetCells: undefined,
    });
    // 面板保持打开：读的是重新渲染后的真实强度
    expect(params.getByText(/一致性强度 0\.58/)).toBeTruthy();
    expect(params.queryByText(/一致性强度 0\.72/)).toBeNull();
  });

  it('「恢复默认提示词」写 undefined 并记日志', () => {
    render(<CharacterSheetWorkspace blockId={BLOCK_ID} kind="character-sheet-desk" />);
    fireEvent.click(screen.getByRole('button', { name: '恢复默认提示词' }));

    expect(lastPatch()).toEqual({
      characterSheetPlan: undefined,
      characterSheetCells: undefined,
    });
    expect(
      useActivityLog.getState().lines.some((l) => l.includes('角色设定表 · 已恢复默认提示词')),
    ).toBe(true);
  });
});

describe('CharacterSheetWorkspace：参数控件写回与非法值回落', () => {
  it('版面行列 / 宽高比 / 逐格并发 / 画风 / 负面词：控件变更写入同名 data 字段', () => {
    render(<CharacterSheetWorkspace blockId={BLOCK_ID} kind="character-sheet-desk" />);
    const params = advancedScope();

    const [rowsInput, colsInput] = params.getAllByRole('spinbutton') as HTMLInputElement[];
    fireEvent.change(rowsInput!, { target: { value: '2' } });
    expect(lastPatch()).toEqual({ characterSheetRows: 2 });
    fireEvent.change(colsInput!, { target: { value: '3' } });
    expect(lastPatch()).toEqual({ characterSheetCols: 3 });

    const aspect = params.getAllByRole('combobox')[0] as HTMLSelectElement;
    fireEvent.change(aspect, { target: { value: '1:1' } });
    expect(lastPatch()).toEqual({ aspectRatio: '1:1' });
    expect(aspect.value).toBe('1:1');

    const concurrency = params.getByTitle(
      '逐格出图的有界并发上限（1–4，缺省 2）；本批与逐格重跑都按它执行',
    ) as HTMLSelectElement;
    fireEvent.change(concurrency, { target: { value: '3' } });
    expect(lastPatch()).toEqual({ concurrency: 3 });

    fireEvent.change(params.getByPlaceholderText('例：赛璐璐平涂，主色深蓝，线稿干净'), {
      target: { value: '赛璐璐平涂' },
    });
    expect(lastPatch()).toEqual({ styleNote: '赛璐璐平涂' });
    fireEvent.change(params.getByPlaceholderText('例：戴眼镜、改发型、换服装'), {
      target: { value: '戴眼镜' },
    });
    expect(lastPatch()).toEqual({ negativePrompt: '戴眼镜' });
  });

  it('版面行列清空 / 写 0 时回落到该版面默认值（禁止写入非法行列）', () => {
    render(<CharacterSheetWorkspace blockId={BLOCK_ID} kind="character-sheet-desk" />);
    const params = advancedScope();
    const [rowsInput, colsInput] = params.getAllByRole('spinbutton') as HTMLInputElement[];

    fireEvent.change(rowsInput!, { target: { value: '' } });
    expect(lastPatch()).toEqual({ characterSheetRows: KIND_TURNAROUND.rows });
    fireEvent.change(colsInput!, { target: { value: '0' } });
    expect(lastPatch()).toEqual({ characterSheetCols: KIND_TURNAROUND.cols });
  });

  it('版面行列只改几何（格数由版面规格固定），并在容不下时回落默认并如实告警', () => {
    render(<CharacterSheetWorkspace blockId={BLOCK_ID} kind="character-sheet-desk" />);
    const params = advancedScope();
    const [rowsInput, colsInput] = params.getAllByRole('spinbutton') as HTMLInputElement[];

    // 2×4 容得下 4 格 → 几何生效，格数不变（格来自版面规格，不是行列乘积）
    fireEvent.change(rowsInput!, { target: { value: '2' } });
    expect(params.getByText(/· 2×4 · 4 格 ·/)).toBeTruthy();
    expect(screen.getAllByTitle('编辑后该格按此文本出图（中英同源）')).toHaveLength(
      KIND_TURNAROUND.cellCount,
    );
    // 逐格提示词里的行列定位跟着几何走
    const first = screen.getAllByTitle(
      '编辑后该格按此文本出图（中英同源）',
    )[0] as HTMLTextAreaElement;
    expect(first.value).toContain('第 1 行第 1 列');

    // 2×1 容不下 4 格 → 回落默认几何并如实告警（不静默改版面）
    fireEvent.change(colsInput!, { target: { value: '1' } });
    expect(lastPatch()).toEqual({ characterSheetCols: 1 });
    expect(screen.getByText('· 给定版面 2×1 容不下 4 格：已改用 1×4。')).toBeTruthy();
    expect(params.getByText(/· 1×4 · 4 格 ·/)).toBeTruthy();
  });
});

describe('CharacterSheetWorkspace：逐格提示词编辑', () => {
  it('改一格：写入 characterSheetPlan + characterSheetCells（promptEdited + 中英同源），展示「已改」', () => {
    render(<CharacterSheetWorkspace blockId={BLOCK_ID} kind="character-sheet-desk" />);
    const boxes = screen.getAllByTitle(
      '编辑后该格按此文本出图（中英同源）',
    ) as HTMLTextAreaElement[];

    fireEvent.change(boxes[2]!, { target: { value: '侧面格：披风下摆加长' } });

    const patch = lastPatch();
    expect(Object.keys(patch).sort()).toEqual(['characterSheetCells', 'characterSheetPlan']);
    const cells = patch.characterSheetCells as Array<Record<string, unknown>>;
    expect(cells).toHaveLength(KIND_TURNAROUND.cellCount);
    expect(cells[2]).toMatchObject({
      imagePromptZh: '侧面格：披风下摆加长',
      imagePrompt: '侧面格：披风下摆加长',
      promptEdited: true,
    });
    expect(cells[0]?.promptEdited).toBeUndefined();
    expect(screen.getByText('已改')).toBeTruthy();
    expect((boxes[2] as HTMLTextAreaElement).value).toBe('侧面格：披风下摆加长');
  });

  it('改编排后再切版面：旧改写不被沿用（计划回到按参数实时生成）', () => {
    render(<CharacterSheetWorkspace blockId={BLOCK_ID} kind="character-sheet-desk" />);
    const boxes = screen.getAllByTitle(
      '编辑后该格按此文本出图（中英同源）',
    ) as HTMLTextAreaElement[];
    fireEvent.change(boxes[0]!, { target: { value: '三视图专属改写' } });
    expect(screen.getByText('已改')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: KIND_EXPRESSION.label }));

    expect(screen.queryByText('已改')).toBeNull();
    for (const box of screen.getAllByTitle(
      '编辑后该格按此文本出图（中英同源）',
    ) as HTMLTextAreaElement[]) {
      expect(box.value).not.toContain('三视图专属改写');
    }
  });
});

describe('CharacterSheetWorkspace：素材库角色选择', () => {
  it('选中角色：带出角色设定与参考图，并清空逐格编辑稿，日志写明参考图来源', () => {
    useWorkspaceDocument.setState({
      characters: { characters: [character('c1', '林晓', '/media/lin.png')] } as never,
    });
    render(<CharacterSheetWorkspace blockId={BLOCK_ID} kind="character-sheet-desk" />);

    const select = screen.getByTitle(
      '选择素材库角色：带出设定与参考图，登记参考图时也写到该角色',
    ) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['未选角色', '林晓']);

    fireEvent.change(select, { target: { value: 'c1' } });

    const patch = lastPatch();
    expect(Object.keys(patch).sort()).toEqual([
      'characterSheetCells',
      'characterSheetPlan',
      'characterSheetReferenceImage',
      'characterSheetSubject',
    ]);
    expect(patch.characterSheetReferenceImage).toBe('/media/lin.png');
    expect(patch.characterSheetSubject).toMatchObject({ referenceImageUrl: '/media/lin.png' });
    expect(patch.characterSheetPlan).toBeUndefined();
    // 参考图已带入 → 不再是「纯文字设定表」
    expect(screen.queryByText(/无参考图：本次为纯文字设定表/)).toBeNull();
    expect(
      useActivityLog
        .getState()
        .lines.some((l) => l.includes('已选用角色「林晓」，参考图取自该角色的参考图')),
    ).toBe(true);
  });

  it('角色没有参考图：日志如实说明「本次为纯文字设定表」，不假装带出了图', () => {
    useWorkspaceDocument.setState({
      characters: { characters: [character('c2', '无名')] } as never,
    });
    render(<CharacterSheetWorkspace blockId={BLOCK_ID} kind="character-sheet-desk" />);
    fireEvent.change(
      screen.getByTitle('选择素材库角色：带出设定与参考图，登记参考图时也写到该角色'),
      { target: { value: 'c2' } },
    );

    expect(lastPatch().characterSheetReferenceImage).toBeUndefined();
    expect(
      useActivityLog
        .getState()
        .lines.some((l) => l.includes('已选用角色「无名」（该角色没有参考图：本次为纯文字设定表）')),
    ).toBe(true);
  });

  it('选中的角色已不在素材库（被回收站过滤掉）→ 明确中文提示，不写回错角色', async () => {
    useWorkspaceDocument.setState({
      characters: { characters: [character('c3', '将删除')] } as never,
    });
    render(<CharacterSheetWorkspace blockId={BLOCK_ID} kind="character-sheet-desk" />);
    const select = screen.getByTitle(
      '选择素材库角色：带出设定与参考图，登记参考图时也写到该角色',
    ) as HTMLSelectElement;

    // 选中前把角色从库里摘掉（等价于「已被移入回收站 / 素材库未刷新」）
    useWorkspaceDocument.setState({ characters: { characters: [] } as never });
    fireEvent.change(select, { target: { value: 'c3' } });

    const items = useToast.getState().items;
    expect(
      items.some((i) => i.message === '未找到该角色：可能已被移入回收站，请刷新素材库后再选'),
    ).toBe(true);
    expect(flow.updateNodeData).not.toHaveBeenCalled();
  });
});
