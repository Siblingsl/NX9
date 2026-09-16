/**
 * BlockingPresetPanel —— 组件行为回归（3D 导演台「场面调度预设」面板）。
 *
 * 覆盖边界（本次新增）：`packages/shared/src/utils/blocking-layout.ts` 的纯函数有测试，
 * 但**这个面板此前没有任何组件级测试**：机位套用、走位解算、锁定演员跳过、
 * 「无镜头 / 无演员 / 全锁定」三条中文提示都没断言过。
 *
 * mock 手法：
 * - 面板走 `@nx9/shared`（既有缺陷：barrel 引用了 8 个不存在的 data/* 模块），
 *   用 barrel 替身指到真实源码模块 → 词表与几何解算都是真实实现；
 * - `useDirectorStore` 用**真实 zustand store**（不桩），所以断言的是
 *   「点按钮 → 真的写进 project.cameras / project.objects」这条真实链路。
 *   面板本身不需要 WebGL，测试不触碰 Canvas。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@nx9/shared', async () => {
  const { buildSharedBarrelMock } = await import('./support/shared-barrel-mock');
  return buildSharedBarrelMock();
});

import { BlockingPresetPanel } from '../../../../../packages/director3d/src/ui/BlockingPresetPanel';
import { useDirectorStore } from '../../../../../packages/director3d/src/store/directorStore';
import {
  emptyDirectorProject,
  type DirectorProject,
} from '../../../../../packages/director3d/src/schema/directorProject';
import {
  blockingCameraPatch,
  blockingLayoutLabel,
  listBlockingCameraPresets,
  listBlockingLayouts,
  solveBlockingLayout,
} from '../../../../../packages/shared/src/utils/blocking-layout';

function project(): DirectorProject {
  return useDirectorStore.getState().project;
}

function activeCamera() {
  const p = project();
  return p.cameras.find((c) => c.id === p.activeCameraId) ?? p.cameras[0]!;
}

function characters() {
  return project().objects.filter((o) => o.kind === 'character');
}

function visibleCharacters() {
  return characters().filter((o) => o.visible);
}

/** 场景里放 n 位可见演员（可选：把前 locked 位锁上） */
function seedCharacters(n: number, locked = 0) {
  const store = useDirectorStore.getState();
  for (let i = 0; i < n; i += 1) store.addCharacter();
  const ids = characters().map((o) => o.id);
  for (let i = 0; i < locked && i < ids.length; i += 1) {
    useDirectorStore.getState().toggleObjectLocked(ids[i]!);
  }
  return ids;
}

beforeEach(() => {
  const store = useDirectorStore.getState();
  store.replaceProject(emptyDirectorProject());
});

describe('BlockingPresetPanel：词表渲染', () => {
  it('机位与走位两组按钮都按真实词表逐条渲染，带上真实口径说明', () => {
    render(<BlockingPresetPanel />);

    expect(screen.getByLabelText('场面调度预设')).toBeTruthy();
    expect(screen.getByText('场面调度机位')).toBeTruthy();
    expect(screen.getByText('走位布局')).toBeTruthy();

    for (const preset of listBlockingCameraPresets()) {
      const button = screen.getByRole('button', { name: preset.label });
      // 说明来自真实词表（标签 / 名称 / 位置 / fov），不是硬编码文案
      expect(button.getAttribute('title')).toBe(
        `${preset.label} / ${preset.name} · pos ${preset.position.join(',')} · fov ${preset.fov}`,
      );
    }
    for (const layout of listBlockingLayouts()) {
      expect(screen.getByRole('button', { name: layout.label })).toBeTruthy();
    }
    // 未套用前不显示任何提示（不出现空成功文案）
    expect(document.querySelector('.nx9-stage-blocking-note')).toBeNull();
  });
});

describe('BlockingPresetPanel：套用场面调度机位', () => {
  it('点机位写入当前镜头的 name / fov / target / position，并如实提示已套用', () => {
    render(<BlockingPresetPanel />);
    const preset = listBlockingCameraPresets()[0]!;
    const expected = blockingCameraPatch(preset.id)!;
    const before = activeCamera();
    const beforeId = before.id;

    fireEvent.click(screen.getByRole('button', { name: preset.label }));

    const after = activeCamera();
    expect(after.id).toBe(beforeId); // 不切换激活镜头
    expect(after.name).toBe(expected.name);
    expect(after.fov).toBe(expected.fov);
    expect(after.target).toEqual(expected.target);
    expect(after.transform.position).toEqual(expected.position);
    // 旋转 / 缩放不动（只换机位位置）
    expect(after.transform.rotation).toEqual(before.transform.rotation);
    expect(after.transform.scale).toEqual(before.transform.scale);

    expect(document.querySelector('.nx9-stage-blocking-note')?.textContent).toBe(
      `已套用机位「${expected.name}」到当前镜头。`,
    );
  });

  it('逐条机位都能套用（词表一条不落），且都写进同一份 project.cameras', () => {
    render(<BlockingPresetPanel />);
    for (const preset of listBlockingCameraPresets()) {
      const expected = blockingCameraPatch(preset.id)!;
      fireEvent.click(screen.getByRole('button', { name: preset.label }));
      expect(activeCamera().name).toBe(expected.name);
      expect(project().cameras).toHaveLength(1);
    }
  });

  it('场景里没有镜头时明确提示「先在层里添加镜头」，不改任何数据', () => {
    useDirectorStore.getState().replaceProject({ ...emptyDirectorProject(), cameras: [], activeCameraId: '' });
    render(<BlockingPresetPanel />);
    const preset = listBlockingCameraPresets()[0]!;

    fireEvent.click(screen.getByRole('button', { name: preset.label }));

    expect(document.querySelector('.nx9-stage-blocking-note')?.textContent).toBe(
      '当前没有可套用的镜头，请先在「层」里添加镜头。',
    );
    expect(project().cameras).toHaveLength(0);
  });
});

describe('BlockingPresetPanel：套用走位布局', () => {
  it('按真实解算结果移动可见演员，并如实报告移动 / 跳过人数', () => {
    const ids = seedCharacters(3, 1); // 3 位演员，前 1 位锁定
    render(<BlockingPresetPanel />);
    const layout = listBlockingLayouts()[0]!;
    const lockedId = ids[0]!;
    const lockedBefore = project().objects.find((o) => o.id === lockedId)!.transform;

    fireEvent.click(screen.getByRole('button', { name: layout.label }));

    // 锁定演员原地不动
    expect(project().objects.find((o) => o.id === lockedId)!.transform).toEqual(lockedBefore);
    // 未锁定演员按真实解算结果落位（顺序 = 可见且未锁定的顺序）
    const movable = visibleCharacters().filter((o) => !o.locked);
    const solved = solveBlockingLayout(layout.id, movable.length);
    movable.forEach((object, index) => {
      expect(object.transform.position).toEqual(solved[index]!.position);
      expect(object.transform.rotation).toEqual(solved[index]!.rotation);
      // 走位不动 scale
      expect(object.transform.scale).toEqual([1, 1, 1]);
    });

    expect(document.querySelector('.nx9-stage-blocking-note')?.textContent).toBe(
      `已套用走位「${blockingLayoutLabel(layout.id)}」，移动 ${movable.length} 位演员；跳过 1 位已锁定演员。`,
    );
  });

  it('全部演员都锁定：不移动任何人，并如实说明原因', () => {
    seedCharacters(2, 2);
    render(<BlockingPresetPanel />);
    const layout = listBlockingLayouts()[0]!;
    const before = project().objects.map((o) => o.transform);

    fireEvent.click(screen.getByRole('button', { name: layout.label }));

    expect(project().objects.map((o) => o.transform)).toEqual(before);
    expect(document.querySelector('.nx9-stage-blocking-note')?.textContent).toBe(
      '全部 2 位演员都已锁定，未做任何移动。',
    );
  });

  it('场景里没有可见演员：明确提示先添加演员，不产生任何移动', () => {
    render(<BlockingPresetPanel />);
    const layout = listBlockingLayouts()[0]!;

    fireEvent.click(screen.getByRole('button', { name: layout.label }));

    expect(document.querySelector('.nx9-stage-blocking-note')?.textContent).toBe(
      '场景中没有可见演员，请先在「+」里添加演员。',
    );
    expect(project().objects).toHaveLength(0);
  });

  it('隐藏的演员不参与走位（不计入移动人数）', () => {
    const ids = seedCharacters(2, 0);
    useDirectorStore.getState().toggleObjectVisible(ids[1]!);
    render(<BlockingPresetPanel />);
    const layout = listBlockingLayouts()[1] ?? listBlockingLayouts()[0]!;
    const hiddenBefore = project().objects.find((o) => o.id === ids[1]!)!.transform;

    fireEvent.click(screen.getByRole('button', { name: layout.label }));

    expect(project().objects.find((o) => o.id === ids[1]!)!.transform).toEqual(hiddenBefore);
    expect(document.querySelector('.nx9-stage-blocking-note')?.textContent).toBe(
      `已套用走位「${blockingLayoutLabel(layout.id)}」，移动 1 位演员。`,
    );
  });

  it('已经套用过的布局按钮带上选中态（is-on），并随下一次套用转移', () => {
    seedCharacters(2, 0);
    render(<BlockingPresetPanel />);
    const [first, second] = listBlockingLayouts();
    if (!first || !second) throw new Error('测试前置失败：走位词表少于两条');

    fireEvent.click(screen.getByRole('button', { name: first.label }));
    expect(screen.getByRole('button', { name: first.label }).className).toContain('is-on');

    fireEvent.click(screen.getByRole('button', { name: second.label }));
    expect(screen.getByRole('button', { name: first.label }).className).not.toContain('is-on');
    expect(screen.getByRole('button', { name: second.label }).className).toContain('is-on');
  });
});

describe('BlockingPresetPanel：可撤销（与导演台 undo 同源）', () => {
  it('套用机位后 undo 能回到原机位（写的是同一份 store，不是旁路状态）', () => {
    render(<BlockingPresetPanel />);
    const before = activeCamera();
    const preset = listBlockingCameraPresets()[0]!;

    fireEvent.click(screen.getByRole('button', { name: preset.label }));
    expect(activeCamera().name).not.toBe(before.name);

    useDirectorStore.getState().undo();
    expect(activeCamera().name).toBe(before.name);
    expect(activeCamera().transform).toEqual(before.transform);
  });
});
