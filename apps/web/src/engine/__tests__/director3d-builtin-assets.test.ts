/**
 * 内置模型资产库回归。
 *
 * 注意：本文件 import 走**相对路径直取源码**，而不是 '@nx9/director3d'。
 * 原因：`packages/director3d/src/index.ts` 会 re-export `runtime/*`、`sculpt/*` 等模块，
 * 其中若干是值导入 `@nx9/shared` 的 `FACE_RIG_PARAMS` / `emptyFaceRig`；而
 * `packages/shared/src/index.ts` 目前引用了若干尚不存在的 data/* 模块（既有缺陷），
 * 走 barrel 会在**加载期**解析失败。相对路径只依赖内置资产 / 内置场景 / 镜头投影 / store，
 * 与缺陷解耦（这几个模块对 shared 只有 `import type`，会被 esbuild 剥离）。
 */
import { describe, expect, it } from 'vitest';
import {
  BUILTIN_ASSETS,
  BUILTIN_ASSET_CATEGORIES,
  builtinAssetsByCategory,
  lookupBuiltinAsset,
  resolvePartArgs,
} from '../../../../../packages/director3d/src/presets/builtinAssets';
import {
  BUILTIN_SCENES,
  applyBuiltinScene,
} from '../../../../../packages/director3d/src/presets/builtinScenes';
import {
  emptyDirectorProject,
  normalizeShotState,
  projectFromShotState,
  sceneTemplateFromProject,
  shotStateFromProject,
} from '../../../../../packages/director3d/src/schema/directorProject';
import { useDirectorStore } from '../../../../../packages/director3d/src/store/directorStore';

describe('director3d 内置模型资产库', () => {
  it('内置模型 ≥30 且 id 唯一', () => {
    expect(BUILTIN_ASSETS.length).toBeGreaterThanOrEqual(30);
    const ids = BUILTIN_ASSETS.map((asset) => asset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('六个类别都有可用模型', () => {
    expect(BUILTIN_ASSET_CATEGORIES).toHaveLength(6);
    for (const category of BUILTIN_ASSET_CATEGORIES) {
      const assets = builtinAssetsByCategory(category.id);
      expect(assets.length, `${category.id} 分类为空`).toBeGreaterThan(0);
      expect(assets.every((asset) => asset.category === category.id)).toBe(true);
    }
  });

  it('每个模型都有中文名、缩略色与合法尺寸', () => {
    for (const asset of BUILTIN_ASSETS) {
      expect(asset.label, `${asset.id} 缺少中文名`).toMatch(/[\u4e00-\u9fa5]/);
      expect(asset.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(asset.size).toHaveLength(3);
      expect(asset.size.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
      expect(asset.parts.length).toBeGreaterThan(0);
    }
  });

  it('模型部件数值合法且贴地（无负高度构件）', () => {
    for (const asset of BUILTIN_ASSETS) {
      for (const part of asset.parts) {
        expect(part.size.every((value) => Number.isFinite(value) && value > 0), `${asset.id} 尺寸非法`).toBe(true);
        expect(part.position.every((value) => Number.isFinite(value)), `${asset.id} 位置非法`).toBe(true);
        expect(part.position[1], `${asset.id} 部件沉入地面`).toBeGreaterThanOrEqual(0);
        expect(part.color).toMatch(/^#[0-9a-f]{6}$/i);
        if (part.rotation) {
          expect(part.rotation.every((value) => Number.isFinite(value))).toBe(true);
        }
      }
    }
  });

  it('resolvePartArgs 按几何类型给出 three 参数', () => {
    const box = resolvePartArgs({ geometry: 'box', size: [2, 3, 4], position: [0, 0, 0], color: '#ffffff' });
    expect(box).toEqual([2, 3, 4]);

    const sphere = resolvePartArgs({ geometry: 'sphere', size: [1.2], position: [0, 0, 0], color: '#ffffff' });
    expect(sphere[0]).toBeCloseTo(0.6, 5);
    expect(sphere[1]).toBeGreaterThan(2);

    const cylinder = resolvePartArgs({ geometry: 'cylinder', size: [0.6, 1.5], position: [0, 0, 0], color: '#ffffff' });
    expect(cylinder[0]).toBeCloseTo(0.3, 5);
    expect(cylinder[1]).toBeCloseTo(0.3, 5);
    expect(cylinder[2]).toBeCloseTo(1.5, 5);

    const cone = resolvePartArgs({ geometry: 'cone', size: [0.3, 0.65], position: [0, 0, 0], color: '#ffffff' });
    expect(cone[0]).toBeCloseTo(0.15, 5);
    expect(cone[1]).toBeCloseTo(0.65, 5);

    const plane = resolvePartArgs({ geometry: 'plane', size: [2.4, 1.6], position: [0, 0, 0], color: '#ffffff' });
    expect(plane).toEqual([2.4, 1.6]);
  });

  it('内置场景 ≥6 且引用的模型与布光方案都存在', () => {
    expect(BUILTIN_SCENES.length).toBeGreaterThanOrEqual(6);
    const ids = BUILTIN_SCENES.map((scene) => scene.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const scene of BUILTIN_SCENES) {
      expect(scene.label).toMatch(/[\u4e00-\u9fa5]/);
      expect(scene.objects.length).toBeGreaterThanOrEqual(6);
      expect(scene.camera.position).toHaveLength(3);
      expect(scene.camera.target).toHaveLength(3);
      expect(scene.camera.fov).toBeGreaterThan(10);
      for (const spec of scene.objects) {
        const asset = lookupBuiltinAsset(spec.assetId);
        expect(asset, `${scene.id} 引用了不存在的模型 ${spec.assetId}`).toBeDefined();
      }
    }
  });

  it('applyBuiltinScene 落地模型 / 布光 / 镜头视野并保留角色', () => {
    const project = emptyDirectorProject();
    project.objects.push({
      id: 'character-1',
      name: '演员 1',
      kind: 'character',
      visible: true,
      locked: false,
      transform: { position: [1, 0, 1], rotation: [0, 0, 0], scale: [1, 1, 1] },
    });
    const scene = BUILTIN_SCENES.find((item) => item.id === 'living-room')!;
    const next = applyBuiltinScene(project, scene, { idPrefix: 'test-scene' });

    expect(next.objects.filter((object) => object.kind === 'character')).toHaveLength(1);
    expect(next.objects.filter((object) => object.builtinAssetId)).toHaveLength(scene.objects.length);
    for (const object of next.objects.filter((item) => item.builtinAssetId)) {
      expect(lookupBuiltinAsset(object.builtinAssetId)).toBeDefined();
      expect(object.meshUrl).toBeUndefined();
      expect(object.kind).toBe('prop');
    }
    expect(next.scene.lightingPresetId).toBe(scene.rigId);
    expect(next.scene.lights.length).toBeGreaterThanOrEqual(3);
    expect(next.scene.backgroundColor).toBe(scene.backgroundColor);
    expect(next.scene.showGround).toBe(true);
    expect(next.panorama).toBeNull();
    expect(next.cameras[0]?.transform.position).toEqual(scene.camera.position);
    expect(next.cameras[0]?.target).toEqual(scene.camera.target);
    expect(next.cameras[0]?.fov).toBe(scene.camera.fov);
  });

  it('重复应用同一场景不会产生重复 id', () => {
    const project = emptyDirectorProject();
    const a = applyBuiltinScene(project, BUILTIN_SCENES[0]!, { idPrefix: 'a' });
    const b = applyBuiltinScene(a, BUILTIN_SCENES[0]!, { idPrefix: 'b' });
    const ids = b.objects.map((object) => object.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(b.scene.lights.length).toBe(a.scene.lights.length);
  });

  it('内置对象数据可序列化并穿过镜头状态往返', () => {
    const project = applyBuiltinScene(emptyDirectorProject(), BUILTIN_SCENES[5]!, { idPrefix: 'forest' });
    const state = shotStateFromProject(project, 'shot-forest');
    const parsed = JSON.parse(JSON.stringify(state)) as unknown;
    const roundTrip = projectFromShotState(normalizeShotState(parsed, 'shot-forest'));
    const builtins = roundTrip.objects.filter((object) => object.builtinAssetId);
    expect(builtins.length).toBe(project.objects.filter((object) => object.builtinAssetId).length);
    for (const object of builtins) {
      const asset = lookupBuiltinAsset(object.builtinAssetId);
      expect(asset, `${object.name} 内置模型丢失`).toBeDefined();
      expect(resolvePartArgs(asset!.parts[0]!)).not.toHaveLength(0);
    }
    expect(roundTrip.scene.lights).toEqual(project.scene.lights);
  });

  it('场景模板导出保留 builtinAssetId', () => {
    const project = applyBuiltinScene(emptyDirectorProject(), BUILTIN_SCENES[3]!, { idPrefix: 'classroom' });
    const template = sceneTemplateFromProject(project, '教室');
    expect(template.objects.length).toBe(project.objects.length);
    expect(template.objects.every((object) => object.builtinAssetId)).toBe(true);
  });

  it('store：放置内置模型走 builtinAssetId 分支且可被检查器选中', () => {
    useDirectorStore.setState({ project: emptyDirectorProject() });
    const store = useDirectorStore.getState();
    store.addBuiltinObject('sofa', '沙发');
    const project = useDirectorStore.getState().project;
    const placed = project.objects.find((object) => object.builtinAssetId === 'sofa');
    expect(placed).toBeDefined();
    expect(placed!.name).toBe('沙发');
    expect(placed!.kind).toBe('prop');
    expect(placed!.meshUrl).toBeUndefined();
    expect(useDirectorStore.getState().selectedObjectId).toBe(placed!.id);
  });

  it('未知内置 id 不会渲染幽灵对象（lookup 返回 undefined）', () => {
    expect(lookupBuiltinAsset('not-a-real-asset')).toBeUndefined();
    expect(lookupBuiltinAsset(undefined)).toBeUndefined();
  });
});
