/**
 * 电影级灯光系统回归。
 *
 * 注意：本文件 import 走**相对路径直取源码**，而不是 '@nx9/director3d'。
 * 原因：`packages/director3d/src/index.ts` 会 re-export `runtime/*`、`sculpt/*` 等模块，
 * 其中若干是值导入 `@nx9/shared` 的 `FACE_RIG_PARAMS` / `emptyFaceRig`；而
 * `packages/shared/src/index.ts` 目前引用了若干尚不存在的 data/* 模块（既有缺陷），
 * 走 barrel 会在**加载期**解析失败。相对路径只依赖灯光预置 / 镜头投影 / store，
 * 与缺陷解耦（这几个模块对 shared 只有 `import type`，会被 esbuild 剥离）。
 */
import { describe, expect, it } from 'vitest';
import {
  AMBIENT_PRESETS,
  KEY_LIGHT_AZIMUTHS,
  KEY_LIGHT_ELEVATIONS,
  KEY_LIGHT_PRESETS,
  LIGHTING_RIG_PRESETS,
  RIM_LIGHT_PRESETS,
  buildLightingPromptFragment,
  buildSceneLightingPrompt,
  keyLightPresetAt,
  lightFromPreset,
  lightPosition,
  resolveRigLights,
} from '../../../../../packages/director3d/src/presets/lightingPresets';
import {
  DEFAULT_AMBIENT_INTENSITY,
  DEFAULT_SCENE_LIGHTS,
  PANORAMA_AMBIENT_INTENSITY,
  applySceneTemplateToShotState,
  emptyDirectorProject,
  normalizeDirectorProject,
  normalizeShotState,
  projectFromSceneTemplate,
  projectFromShotState,
  sceneTemplateFromProject,
  shotStateFromProject,
} from '../../../../../packages/director3d/src/schema/directorProject';
import {
  DEFAULT_PROMPT_DETAILS,
  PROMPT_DETAIL_LABELS,
  buildCameraPrompt,
} from '../../../../../packages/director3d/src/schema/cameraGeometry';
import { useDirectorStore } from '../../../../../packages/director3d/src/store/directorStore';

describe('director3d 电影级灯光系统', () => {
  it('提供 24 个主光位与 9 个轮廓光预置', () => {
    expect(KEY_LIGHT_PRESETS).toHaveLength(24);
    expect(RIM_LIGHT_PRESETS).toHaveLength(9);
    expect(AMBIENT_PRESETS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(KEY_LIGHT_PRESETS.map((preset) => preset.id)).size).toBe(24);
    expect(new Set(RIM_LIGHT_PRESETS.map((preset) => preset.id)).size).toBe(9);
  });

  it('主光位覆盖 8 方位 × 3 高度，且每格都有中英描述', () => {
    expect(KEY_LIGHT_AZIMUTHS).toHaveLength(8);
    expect(KEY_LIGHT_ELEVATIONS).toHaveLength(3);
    for (const azimuth of KEY_LIGHT_AZIMUTHS) {
      for (const tier of KEY_LIGHT_ELEVATIONS) {
        const preset = keyLightPresetAt(azimuth.azimuth, tier.slug);
        expect(preset, `${azimuth.slug}/${tier.slug} 缺少主光预设`).toBeDefined();
        expect(preset!.label).toMatch(/[\u4e00-\u9fa5]/);
        expect(preset!.prompt.length).toBeGreaterThan(8);
        expect(preset!.azimuth).toBe(azimuth.azimuth);
        expect(preset!.elevation).toBe(tier.elevation);
        expect(preset!.distance).toBeGreaterThan(0);
        expect(preset!.color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('轮廓光预置覆盖硬/柔、冷/暖、高低位差异', () => {
    const types = new Set(RIM_LIGHT_PRESETS.map((preset) => preset.type));
    expect(types.size).toBeGreaterThan(1);
    const colors = new Set(RIM_LIGHT_PRESETS.map((preset) => preset.color));
    expect(colors.size).toBeGreaterThanOrEqual(5);
    expect(RIM_LIGHT_PRESETS.some((preset) => preset.elevation < 0)).toBe(true);
    expect(RIM_LIGHT_PRESETS.some((preset) => preset.elevation > 40)).toBe(true);
    for (const preset of RIM_LIGHT_PRESETS) {
      expect(preset.role).toBe('rim');
      expect(preset.intensity).toBeGreaterThan(0);
    }
  });

  it('整组布光方案 ≥6 且每盏灯都能解析到具体预置', () => {
    expect(LIGHTING_RIG_PRESETS.length).toBeGreaterThanOrEqual(6);
    const ids = LIGHTING_RIG_PRESETS.map((rig) => rig.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rig of LIGHTING_RIG_PRESETS) {
      const lights = resolveRigLights(rig);
      expect(lights.length, `${rig.id} 灯光解析数量`).toBe(rig.lights.length);
      expect(lights.every((light) => light.intensity > 0)).toBe(true);
      expect(rig.ambientIntensity).toBeGreaterThanOrEqual(0);
      expect(rig.exposure).toBeGreaterThan(0);
      expect(rig.prompt.length).toBeGreaterThan(10);
    }
    const threePoint = LIGHTING_RIG_PRESETS.find((rig) => rig.id === 'three-point');
    const resolved = resolveRigLights(threePoint!);
    expect(resolved.some((light) => light.role === 'key')).toBe(true);
    expect(resolved.some((light) => light.role === 'fill')).toBe(true);
    expect(resolved.some((light) => light.role === 'rim')).toBe(true);
  });

  it('buildLightingPromptFragment 生成含方位 / 颜色 / 强度的英文片段', () => {
    const key = lightFromPreset(KEY_LIGHT_PRESETS.find((preset) => preset.id === 'key-front-right-high')!, 'l1');
    const rim = lightFromPreset(RIM_LIGHT_PRESETS.find((preset) => preset.id === 'rim-cool-hard')!, 'l2');
    const fragment = buildLightingPromptFragment([key, rim], { ambientIntensity: 0.25 });
    expect(fragment).toContain('lighting:');
    expect(fragment).toContain('key directional light');
    expect(fragment).toContain('rim spot light');
    expect(fragment).toContain('front-right 45°');
    expect(fragment).toContain('#fff5ea');
    expect(fragment).toContain('intensity 1.13');
    expect(fragment).toContain('30° cone');
    expect(fragment).toContain('ambient fill intensity 0.25');
    expect(buildLightingPromptFragment([], {})).toBe('');
    expect(buildLightingPromptFragment([{ ...key, visible: false }], {})).toBe('');
  });

  it('老镜头数据缺 lights 时补默认两灯且不丢场景', () => {
    const legacy = {
      version: 2 as const,
      stateVersion: 3,
      shotId: 'shot-legacy',
      environment: {
        backgroundColor: '#101010',
        groundVisible: true,
        groundOpacity: 0.5,
      },
      objects: [
        {
          id: 'prop-1',
          name: '旧桌子',
          kind: 'prop' as const,
          geometryType: 'box' as const,
          visible: true,
          locked: false,
          transform: {
            position: [1, 0, 2] as [number, number, number],
            rotation: [0, 0, 0] as [number, number, number],
            scale: [1, 1, 1] as [number, number, number],
          },
        },
      ],
      camera: {
        position: [0, 1.6, 5] as [number, number, number],
        target: [0, 1, 0] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        fov: 50,
        aspectRatio: '16:9' as const,
      },
      candidates: [],
      dirty: false,
      updatedAt: '2026-08-12T00:00:00.000Z',
    };
    const state = normalizeShotState(legacy, 'shot-legacy');
    expect(state.objects).toHaveLength(1);
    expect(state.environment.lights).toEqual(DEFAULT_SCENE_LIGHTS);
    expect(state.environment.ambientIntensity).toBe(DEFAULT_AMBIENT_INTENSITY);
    expect(state.environment.exposure).toBe(1);

    const project = projectFromShotState(state);
    expect(project.objects[0]?.name).toBe('旧桌子');
    expect(project.scene.lights).toEqual(DEFAULT_SCENE_LIGHTS);
    expect(project.scene.ambientIntensity).toBe(DEFAULT_AMBIENT_INTENSITY);
  });

  it('带全景的老数据沿用 0.35 环境基线，不突变画面', () => {
    const legacy = {
      version: 2 as const,
      stateVersion: 0,
      shotId: 'shot-pano',
      environment: {
        panoramaUrl: 'https://cdn.example/pano.jpg',
        backgroundColor: '#101010',
        groundVisible: true,
        groundOpacity: 0.5,
      },
      objects: [],
      camera: {
        position: [0, 1.6, 5] as [number, number, number],
        target: [0, 1, 0] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        fov: 50,
        aspectRatio: '16:9' as const,
      },
      candidates: [],
      dirty: false,
      updatedAt: '2026-08-12T00:00:00.000Z',
    };
    expect(normalizeShotState(legacy, 'shot-pano').environment.ambientIntensity).toBe(
      PANORAMA_AMBIENT_INTENSITY,
    );
  });

  it('project ↔ shotState 往返保留灯组 / 环境基线 / 曝光', () => {
    const project = emptyDirectorProject();
    const rig = LIGHTING_RIG_PRESETS.find((item) => item.id === 'neon-night')!;
    project.scene.lights = resolveRigLights(rig).map((preset, index) => lightFromPreset(preset, `light-${index}`));
    project.scene.ambientIntensity = rig.ambientIntensity;
    project.scene.exposure = rig.exposure;
    project.scene.lightingPresetId = rig.id;

    const state = shotStateFromProject(project, 'shot-1');
    expect(state.environment.lights).toHaveLength(project.scene.lights.length);
    expect(state.environment.lightingPresetId).toBe('neon-night');
    expect(state.environment.exposure).toBe(rig.exposure);

    const roundTrip = projectFromShotState(state);
    expect(roundTrip.scene.lights).toEqual(project.scene.lights);
    expect(roundTrip.scene.ambientIntensity).toBe(rig.ambientIntensity);
    expect(roundTrip.scene.exposure).toBe(rig.exposure);
    expect(roundTrip.scene.lightingPresetId).toBe('neon-night');
  });

  it('normalizeShotState / normalizeDirectorProject 不与被复用的默认灯共享引用', () => {
    const a = normalizeShotState(undefined, 'shot-a');
    const b = normalizeDirectorProject({ version: 1, cameras: [], objects: [] });
    a.environment.lights![0]!.intensity = 99;
    expect(b.scene.lights[0]!.intensity).toBe(DEFAULT_SCENE_LIGHTS[0]!.intensity);
    expect(DEFAULT_SCENE_LIGHTS[0]!.intensity).not.toBe(99);
  });

  it('场景模板携带灯组并可应用到当前镜头（含旧模板升级）', () => {
    const project = emptyDirectorProject();
    const rig = LIGHTING_RIG_PRESETS.find((item) => item.id === 'interrogation')!;
    project.scene.lights = resolveRigLights(rig).map((preset, index) => lightFromPreset(preset, `t-${index}`));
    project.scene.ambientIntensity = rig.ambientIntensity;
    project.scene.exposure = rig.exposure;
    project.scene.lightingPresetId = rig.id;
    project.objects.push({
      id: 'builtin-1',
      name: '讲台',
      kind: 'prop',
      builtinAssetId: 'podium',
      visible: true,
      locked: false,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    });

    const template = sceneTemplateFromProject(project, '审讯室');
    expect(template.environment.lights).toHaveLength(project.scene.lights.length);
    expect(template.environment.lightingPresetId).toBe('interrogation');
    expect(template.objects[0]?.builtinAssetId).toBe('podium');

    const restored = projectFromSceneTemplate(template);
    expect(restored.scene.lights).toEqual(project.scene.lights);
    expect(restored.scene.exposure).toBe(rig.exposure);
    expect(restored.scene.lightingPresetId).toBe('interrogation');

    const applied = applySceneTemplateToShotState(
      normalizeShotState(undefined, 'shot-a', emptyDirectorProject()),
      template,
    );
    expect(applied.environment.lights).toHaveLength(project.scene.lights.length);
    expect(applied.environment.ambientIntensity).toBe(rig.ambientIntensity);
    expect(applied.environment.lightingPresetId).toBe('interrogation');

    // 旧模板（lights 为 {id,type,intensity,position}）读取时升级为球坐标灯
    const legacyTemplate = {
      ...template,
      environment: {
        ...template.environment,
        lights: [
          { id: 'ambient', type: 'ambient', intensity: 0.35 },
          { id: 'key', type: 'directional', intensity: 0.9, position: [5, 10, 4] },
        ],
        ambientIntensity: undefined,
        exposure: undefined,
      },
    };
    const upgraded = projectFromSceneTemplate(legacyTemplate as unknown as typeof template);
    expect(upgraded.scene.lights).toHaveLength(2);
    expect(upgraded.scene.lights[1]!.azimuth).toBeCloseTo(51.34, 1);
    expect(upgraded.scene.lights[1]!.elevation).toBeCloseTo(57.4, 1);
    expect(upgraded.scene.lights[1]!.distance).toBeCloseTo(11.87, 1);
  });

  it('提示词细节开关默认开启灯光，关闭后不再注入灯光片段', () => {
    expect(DEFAULT_PROMPT_DETAILS.lighting).toBe(true);
    expect(PROMPT_DETAIL_LABELS.some((item) => item.id === 'lighting')).toBe(true);

    const camera = {
      id: 'c1',
      name: '主镜头',
      fov: 50,
      transform: {
        position: [0, 1.6, 5] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [1, 1, 1] as [number, number, number],
      },
      target: [0, 1, 0] as [number, number, number],
      captures: [],
    };
    const lightingPrompt = buildSceneLightingPrompt({
      lights: [lightFromPreset(KEY_LIGHT_PRESETS[0]!, 'k1')],
      ambientIntensity: 0.4,
      exposure: 1,
    });
    expect(lightingPrompt).toContain('lighting:');

    const withLighting = buildCameraPrompt(camera, { lightingPrompt });
    expect(withLighting).toContain('lighting:');
    const withoutLighting = buildCameraPrompt(camera, {
      lightingPrompt,
      details: { lighting: false },
    });
    expect(withoutLighting).not.toContain('lighting:');
    // 灯光片段必须排在运镜之前，避免被 promptSkin 的运镜裁剪规则截断
    expect(withLighting.indexOf('lighting:')).toBeLessThan(withLighting.indexOf('camera movement:'));
  });

  it('预览用的 buildCameraPrompt 不传 lightingPrompt 时输出与旧版一致', () => {
    const camera = {
      id: 'c1',
      name: '主镜头',
      fov: 50,
      transform: {
        position: [0, 1.6, 5] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [1, 1, 1] as [number, number, number],
      },
      target: [0, 1, 0] as [number, number, number],
      captures: [],
    };
    expect(buildCameraPrompt(camera)).toBe(buildCameraPrompt(camera, { details: { lighting: true } }));
  });

  it('store：应用整组布光 / 单灯预置 / 手动改灯都会同步场景与方案标记', () => {
    useDirectorStore.setState({ project: emptyDirectorProject() });
    const store = useDirectorStore.getState();
    const rig = LIGHTING_RIG_PRESETS.find((item) => item.id === 'low-key-noir')!;

    store.applyLightingRigPreset(rig.id);
    let scene = useDirectorStore.getState().project.scene;
    expect(scene.lightingPresetId).toBe(rig.id);
    expect(scene.lights).toHaveLength(resolveRigLights(rig).length);
    expect(scene.ambientIntensity).toBe(rig.ambientIntensity);
    expect(scene.exposure).toBe(rig.exposure);

    store.applyKeyLightPreset('key-back-high');
    scene = useDirectorStore.getState().project.scene;
    const key = scene.lights.find((light) => light.role === 'key');
    expect(key?.azimuth).toBe(180);
    expect(key?.elevation).toBe(55);
    expect(scene.lightingPresetId).toBeNull();

    const rimId = scene.lights.find((light) => light.role === 'rim')?.id;
    expect(rimId).toBeDefined();
    store.updateLight(rimId!, { intensity: 3.5 });
    expect(
      useDirectorStore.getState().project.scene.lights.find((light) => light.id === rimId)?.intensity,
    ).toBe(3.5);

    store.addLight('spot', 'practical');
    scene = useDirectorStore.getState().project.scene;
    const added = scene.lights[scene.lights.length - 1]!;
    expect(added.type).toBe('spot');
    expect(added.coneAngle).toBe(45);

    store.removeLight(added.id);
    expect(useDirectorStore.getState().project.scene.lights.some((light) => light.id === added.id)).toBe(false);

    store.setSceneLighting({ ambientIntensity: 0.12, exposure: 1.4 });
    scene = useDirectorStore.getState().project.scene;
    expect(scene.ambientIntensity).toBe(0.12);
    expect(scene.exposure).toBe(1.4);
  });

  it('store：addCapture 把灯光片段写进候选帧提示词', () => {
    useDirectorStore.setState({ project: emptyDirectorProject() });
    const store = useDirectorStore.getState();
    store.applyLightingRigPreset('three-point');
    const capture = store.addCapture('data:image/png;base64,AAAA');
    expect(capture).not.toBeNull();
    expect(capture!.cameraPrompt).toContain('lighting:');
    expect(capture!.cameraPrompt).toContain('key directional light');

    useDirectorStore.getState().setPromptDetail('lighting', false);
    const second = useDirectorStore.getState().addCapture('data:image/png;base64,BBBB');
    expect(second!.cameraPrompt).not.toContain('lighting:');
  });

  it('lightPosition 换算与面板读数一致（0°/90°/高位/低位）', () => {
    const base = lightFromPreset(KEY_LIGHT_PRESETS[0]!, 'l');
    const front = lightPosition({ ...base, azimuth: 0, elevation: 0, distance: 4 });
    expect(front[0]).toBeCloseTo(0, 5);
    expect(front[1]).toBeCloseTo(0, 5);
    expect(front[2]).toBeCloseTo(4, 5);

    const right = lightPosition({ ...base, azimuth: 90, elevation: 0, distance: 4 });
    expect(right[0]).toBeCloseTo(4, 5);
    expect(right[2]).toBeCloseTo(0, 5);

    const top = lightPosition({ ...base, azimuth: 0, elevation: 88, distance: 6 });
    expect(top[1]).toBeCloseTo(6 * Math.sin((88 * Math.PI) / 180), 5);
    expect(Math.abs(top[2])).toBeLessThan(0.25);

    const ambient = lightPosition({ ...base, type: 'ambient', distance: 8 });
    expect(ambient).toEqual([0, 0, 0]);
  });
});
