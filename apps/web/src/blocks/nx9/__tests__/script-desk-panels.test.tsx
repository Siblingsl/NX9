/**
 * Q-02: 编剧台拆分面板关键交互测试。
 * - 查找替换：已确认成稿替换后必须失效（P0 缺陷回归锁）
 * - 查找替换：无匹配不落盘
 * - 人物全局改名（B-08）：入口出现、确认改名回调携带正确参数
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import { emptyScreenplayPackage, type ScreenplayPackage } from '@nx9/shared';
import { ScreenplayPanel, type ScreenplayPanelProps } from '../script-desk/ScreenplayPanel';
import { BiblePanel, type BiblePanelProps } from '../script-desk/BiblePanel';

function confirmedPkg(): ScreenplayPackage {
  const pkg = emptyScreenplayPackage();
  return {
    ...pkg,
    status: 'confirmed',
    screenplay: {
      ...pkg.screenplay,
      episodes: [
        { id: 'ep-1', index: 1, title: '第1集', bodyMd: '林小满走进大厅，林小满抬头。', updatedAt: new Date().toISOString() },
      ],
    },
  };
}

function resolveSaved(
  savePkg: ScreenplayPanelProps['savePkg'],
  pkg: ScreenplayPackage,
): ScreenplayPackage {
  const arg = (savePkg as ReturnType<typeof vi.fn>).mock.calls[0][0] as
    | ScreenplayPackage
    | ((current: ScreenplayPackage) => ScreenplayPackage);
  return typeof arg === 'function' ? arg(pkg) : arg;
}

function screenplayProps(overrides: Partial<ScreenplayPanelProps> = {}): ScreenplayPanelProps {
  const dirtyRef: MutableRefObject<boolean> = { current: false };
  const pkg = overrides.pkg ?? confirmedPkg();
  return {
    pkg,
    dirtyRef,
    savePkg: vi.fn((nextOrFn) => (typeof nextOrFn === 'function' ? nextOrFn(pkg) : nextOrFn)),
    setTip: vi.fn(),
    patchBriefTitle: vi.fn(),
    busy: false,
    continueBusy: false,
    rewritingEpIndex: null,
    outlineView: false,
    setOutlineView: vi.fn(),
    findOpen: true,
    setFindOpen: vi.fn(),
    findText: '',
    setFindText: vi.fn(),
    replaceText: '',
    setReplaceText: vi.fn(),
    failedEpisodeIndexes: [],
    setFailedEpisodeIndexes: vi.fn(),
    onRetryFailed: vi.fn(async () => {}),
    skeletonIndexes: [],
    epMoreMenuId: null,
    setEpMoreMenuId: vi.fn(),
    dragEpId: null,
    setDragEpId: vi.fn(),
    onInsertEmptyEpisode: vi.fn(),
    onEpisodeReorder: vi.fn(),
    onRewriteEpisode: vi.fn(async () => {}),
    onRemoveEpisode: vi.fn(async () => {}),
    patchEpisodeBody: vi.fn(),
    scrollToEpisode: vi.fn(),
    openEpIds: new Set<string>(['ep-1']),
    setOpenEpIds: vi.fn(),
    selectedEpIds: new Set<string>(),
    onToggleSelectEpisode: vi.fn(),
    onBatchRewrite: vi.fn(),
    onClearSelectedEpisodes: vi.fn(),
    ...overrides,
  };
}

describe('ScreenplayPanel 查找替换', () => {
  it('已确认成稿替换成功后确认失效（status 回 drafting）', () => {
    const props = screenplayProps({ findText: '林小满', replaceText: '苏晚' });
    render(<ScreenplayPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '替换' }));
    expect(props.savePkg).toHaveBeenCalledTimes(1);
    const saved = resolveSaved(props.savePkg, props.pkg);
    expect(saved.status).toBe('drafting');
    expect(saved.screenplay.episodes[0].bodyMd).toBe('苏晚走进大厅，苏晚抬头。');
    expect(props.dirtyRef.current).toBe(true);
    expect(props.setTip).toHaveBeenCalledWith('已替换 2 处');
  });

  it('无匹配不落盘、确认态不变', () => {
    const props = screenplayProps({ findText: '不存在的词', replaceText: '苏晚' });
    render(<ScreenplayPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '替换' }));
    expect(props.savePkg).not.toHaveBeenCalled();
    expect(props.dirtyRef.current).toBe(false);
    expect(props.setTip).toHaveBeenCalledWith('未找到匹配内容');
  });
});

function biblePkg(): ScreenplayPackage {
  const pkg = emptyScreenplayPackage();
  return {
    ...pkg,
    bible: {
      ...pkg.bible,
      characters: [{ id: 'c1', name: '林小满', identity: '女主' }],
      scenes: [],
    },
  };
}

function bibleProps(overrides: Partial<BiblePanelProps> = {}): BiblePanelProps {
  return {
    pkg: biblePkg(),
    editingBibleId: 'c1',
    setEditingBibleId: vi.fn(),
    renamingBibleCharId: null,
    setRenamingBibleCharId: vi.fn(),
    renameCharText: '',
    setRenameCharText: vi.fn(),
    onRenameCharacter: vi.fn(async () => {}),
    patchBibleCharacter: vi.fn(),
    patchBibleScene: vi.fn(),
    patchBibleWorld: vi.fn(),
    removeBibleCharacter: vi.fn(async () => {}),
    removeBibleScene: vi.fn(async () => {}),
    mergeSelection: [],
    mergeType: null,
    setMergeSelection: vi.fn(),
    setMergeType: vi.fn(),
    toggleMergeSelect: vi.fn(),
    onBibleMerge: vi.fn(async () => {}),
    highlightedBibleId: null,
    openAssetAt: vi.fn(),
    ...overrides,
  };
}

describe('BiblePanel 人物全局改名（B-08）', () => {
  it('编辑态人物卡有「改名」入口，点击进入改名并预填原名', () => {
    const props = bibleProps();
    render(<BiblePanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '改名' }));
    expect(props.setRenamingBibleCharId).toHaveBeenCalledWith('c1');
    expect(props.setRenameCharText).toHaveBeenCalledWith('林小满');
  });

  it('确认改名回调携带 charId 与新名字；同名时按钮禁用', () => {
    const props = bibleProps({ renamingBibleCharId: 'c1', renameCharText: '苏晚' });
    render(<BiblePanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '确认改名' }));
    expect(props.onRenameCharacter).toHaveBeenCalledWith('c1', '苏晚');

    const sameName = bibleProps({ renamingBibleCharId: 'c1', renameCharText: '林小满' });
    render(<BiblePanel {...sameName} />);
    const btns = screen.getAllByRole('button', { name: '确认改名' });
    expect((btns[btns.length - 1] as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('ScreenplayPanel 集列表展开状态', () => {
  it('默认展开第 1 集，点击 summary 折叠时 setOpenEpIds 去掉该集', () => {
    const pkg = confirmedPkg();
    pkg.screenplay.episodes.push({
      id: 'ep-2',
      index: 2,
      title: '第2集',
      bodyMd: '第二集正文',
      updatedAt: new Date().toISOString(),
    });
    const setOpenEpIds = vi.fn();
    render(
      <ScreenplayPanel {...screenplayProps({
        pkg,
        findOpen: false,
        openEpIds: new Set(['ep-1']),
        setOpenEpIds,
      })} />,
    );
    const ep1 = document.getElementById('sd2-ep-ep-1') as HTMLDetailsElement | null;
    const ep2 = document.getElementById('sd2-ep-ep-2') as HTMLDetailsElement | null;
    expect(ep1?.open).toBe(true);
    expect(ep2?.open).toBe(false);
    const summary = ep1!.querySelector('summary');
    expect(summary).toBeTruthy();
    fireEvent.click(summary!);
    const toggleResults = setOpenEpIds.mock.calls
      .map((call) => call[0])
      .filter((fn): fn is (prev: Set<string>) => Set<string> => typeof fn === 'function')
      .map((fn) => fn(new Set(['ep-1'])))
      .filter((next) => !next.has('ep-1'));
    expect(toggleResults.length).toBeGreaterThan(0);
  });

  it('续写仅改 body 时不因 episodes 新引用强开第 1 集', () => {
    const pkg = confirmedPkg();
    pkg.screenplay.episodes = [
      {
        id: 'ep-1',
        index: 1,
        title: '第1集',
        bodyMd: '旧正文',
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'ep-2',
        index: 2,
        title: '第2集',
        bodyMd: '第二集',
        updatedAt: new Date().toISOString(),
      },
    ];
    const setOpenEpIds = vi.fn();
    const { rerender } = render(
      <ScreenplayPanel {...screenplayProps({
        pkg,
        findOpen: false,
        openEpIds: new Set(),
        setOpenEpIds,
      })} />,
    );
    setOpenEpIds.mockClear();
    const streamed = {
      ...pkg,
      screenplay: {
        ...pkg.screenplay,
        episodes: pkg.screenplay.episodes.map((ep) =>
          ep.id === 'ep-1' ? { ...ep, bodyMd: `${ep.bodyMd}流式追加` } : { ...ep },
        ),
      },
    };
    rerender(
      <ScreenplayPanel {...screenplayProps({
        pkg: streamed,
        findOpen: false,
        openEpIds: new Set(),
        setOpenEpIds,
      })} />,
    );
    // 用户已全折叠：body 流式更新不得再 setOpenEpIds 强开第 1 集
    const openers = setOpenEpIds.mock.calls
      .map((call) => call[0])
      .filter((fn): fn is (prev: Set<string>) => Set<string> => typeof fn === 'function')
      .map((fn) => fn(new Set()))
      .filter((next) => next.has('ep-1'));
    expect(openers).toHaveLength(0);
  });
});

describe('ScreenplayPanel 顶区折叠与跳转并入剧集', () => {
  it('有分集时设定/爆点默认收起，跳转与工具在剧集头', () => {
    const pkg = confirmedPkg();
    pkg.brief = {
      ...pkg.brief,
      title: '黑帮女大佬相亲',
      logline: '屌丝想安稳相亲',
      episodeCount: 3,
      hooks: ['爆点1', '爆点2'],
    };
    pkg.screenplay.episodes.push({
      id: 'ep-2',
      index: 2,
      title: '第2集',
      bodyMd: '第二集',
      updatedAt: new Date().toISOString(),
    });
    render(
      <ScreenplayPanel {...screenplayProps({
        pkg,
        findOpen: false,
        openEpIds: new Set(['ep-1']),
      })} />,
    );

    const briefToggle = screen.getByRole('button', { name: '设定' });
    const hooksToggle = screen.getByRole('button', { name: '爆点' });
    expect(briefToggle.getAttribute('aria-expanded')).toBe('false');
    expect(hooksToggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('一句话故事')).toBeNull();

    expect(screen.getByRole('navigation', { name: '分集跳转' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '大纲视图' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '查找替换' })).toBeTruthy();
    expect(screen.queryByText('跳转')).toBeNull();

    fireEvent.click(briefToggle);
    expect(briefToggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('一句话故事')).toBeTruthy();
  });

  it('无分集时设定默认展开，便于开写前填 brief', () => {
    const pkg = emptyScreenplayPackage();
    pkg.brief = { ...pkg.brief, title: '新剧' };
    render(
      <ScreenplayPanel {...screenplayProps({
        pkg,
        findOpen: false,
        openEpIds: new Set(),
      })} />,
    );
    expect(screen.getByRole('button', { name: '设定' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('剧名')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: '分集跳转' })).toBeNull();
  });
});

describe('BiblePanel 诊断高亮', () => {
  it('按人物 id 高亮（诊断 entityId 为 id）', () => {
    const props = bibleProps({ highlightedBibleId: 'c1', editingBibleId: null });
    const { container } = render(<BiblePanel {...props} />);
    expect(container.querySelector('.sd2-bible-card--highlight')).toBeTruthy();
  });
});

