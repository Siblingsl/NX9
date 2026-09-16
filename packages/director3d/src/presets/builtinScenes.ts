/**
 * NX9 3D 导演台 · 内置场景模板。
 *
 * 用内置程序化模型 + 地面/背景色 + 整组布光拼成「一键可用」的整场景：
 * 应用后直接得到可拍摄的镜头视野（相机位/目标点/FOV 一并落地）。
 * 场景只替换非角色物体，当前镜头里已绑定的角色会被保留。
 */
import type { DirectorObject, DirectorProject } from '../schema/directorProject';
import { lookupBuiltinAsset } from './builtinAssets';
import { lightFromPreset, lookupLightingRigPreset, resolveRigLights } from './lightingPresets';

export interface BuiltinSceneObjectSpec {
  assetId: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  name?: string;
}

export interface BuiltinSceneDef {
  id: string;
  label: string;
  description: string;
  backgroundColor: string;
  groundOpacity: number;
  /** 整组布光方案 id（LIGHTING_RIG_PRESETS） */
  rigId: string;
  camera: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
  };
  objects: BuiltinSceneObjectSpec[];
}

export const BUILTIN_SCENES: BuiltinSceneDef[] = [
  {
    id: 'living-room',
    label: '客厅',
    description: '沙发 + 茶几 + 电视墙 + 边柜，三点布光的标准室内景',
    backgroundColor: '#1b1d24',
    groundOpacity: 0.6,
    rigId: 'three-point',
    camera: { position: [0, 1.6, 5.4], target: [0, 1.15, -0.5], fov: 45 },
    objects: [
      { assetId: 'rug', position: [0, 0, 0] },
      { assetId: 'sofa', position: [0, 0, -1.9], name: '沙发' },
      { assetId: 'table-dining', position: [0, 0, 0.15], scale: [0.7, 0.7, 0.7], name: '茶几' },
      { assetId: 'tv-screen', position: [0, 0, 2.7], rotation: [0, 180, 0], name: '电视' },
      { assetId: 'bookshelf', position: [-2.5, 0, -1.8], rotation: [0, 90, 0] },
      { assetId: 'cabinet', position: [2.4, 0, -1.8], rotation: [0, -90, 0] },
      { assetId: 'table-lamp', position: [2.4, 0.95, -1.8], name: '边柜台灯' },
      { assetId: 'planter', position: [-2.3, 0, 1.5] },
    ],
  },
  {
    id: 'bedroom',
    label: '卧室',
    description: '双人床 + 床头柜 + 顶光美容布光，柔和的夜间室内景',
    backgroundColor: '#191a22',
    groundOpacity: 0.55,
    rigId: 'butterfly',
    camera: { position: [0, 1.55, 5], target: [0, 1.0, -1], fov: 45 },
    objects: [
      { assetId: 'bed', position: [0, 0, -1.2] },
      { assetId: 'rug', position: [0, 0, 1.5] },
      { assetId: 'bookshelf', position: [-2.2, 0, -1.2], rotation: [0, 90, 0] },
      { assetId: 'cabinet', position: [2.2, 0, -1.2], rotation: [0, -90, 0] },
      { assetId: 'table-lamp', position: [2.2, 0.95, -1.2], name: '床头灯' },
      { assetId: 'window-frame', position: [-2.95, 0, -1], rotation: [0, 90, 0] },
      { assetId: 'chair', position: [1.8, 0, 0.4], rotation: [0, -140, 0] },
    ],
  },
  {
    id: 'office',
    label: '办公室',
    description: '办公桌 + 会议椅 + 文件柜 + 机柜，中性三点布光的办公空间',
    backgroundColor: '#1a1d22',
    groundOpacity: 0.65,
    rigId: 'three-point',
    camera: { position: [0, 1.6, 5.2], target: [0, 1.05, -1.2], fov: 45 },
    objects: [
      { assetId: 'desk', position: [0, 0, -1.6] },
      { assetId: 'chair', position: [0, 0, -0.55], rotation: [0, 180, 0], name: '办公椅' },
      { assetId: 'chair', position: [-1.2, 0, -2.8], name: '访客椅' },
      { assetId: 'bookshelf', position: [-2.4, 0, -1.6], rotation: [0, 90, 0] },
      { assetId: 'cabinet', position: [2.3, 0, -1.6], rotation: [0, -90, 0] },
      { assetId: 'table-lamp', position: [-1.1, 0.78, -1.6], name: '台灯' },
      { assetId: 'server-rack', position: [2.6, 0, 1.0], rotation: [0, -90, 0] },
      { assetId: 'tv-screen', position: [2.2, 0, 1.4], rotation: [0, -120, 0], name: '演示屏' },
    ],
  },
  {
    id: 'classroom',
    label: '教室',
    description: '黑板 + 讲台 + 课桌阵列 + 投影幕，高调白棚布光的教学场景',
    backgroundColor: '#1c1e24',
    groundOpacity: 0.7,
    rigId: 'high-key-studio',
    camera: { position: [0, 1.6, 5.6], target: [0, 1.1, -1.5], fov: 45 },
    objects: [
      { assetId: 'blackboard', position: [0, 0, -2.9] },
      { assetId: 'projection-screen', position: [1.9, 0, -2.9] },
      { assetId: 'podium', position: [-1.9, 0, -2.4], rotation: [0, 25, 0] },
      { assetId: 'window-frame', position: [-2.95, 0, -0.4], rotation: [0, 90, 0] },
      { assetId: 'desk', position: [-1.4, 0, 0.4], scale: [0.8, 1, 0.8], name: '课桌 1' },
      { assetId: 'chair', position: [-1.4, 0, 0.95], rotation: [0, 180, 0], name: '课椅 1' },
      { assetId: 'desk', position: [0.2, 0, 0.4], scale: [0.8, 1, 0.8], name: '课桌 2' },
      { assetId: 'chair', position: [0.2, 0, 0.95], rotation: [0, 180, 0], name: '课椅 2' },
      { assetId: 'desk', position: [-1.4, 0, 1.7], scale: [0.8, 1, 0.8], name: '课桌 3' },
      { assetId: 'chair', position: [-1.4, 0, 2.25], rotation: [0, 180, 0], name: '课椅 3' },
      { assetId: 'desk', position: [0.2, 0, 1.7], scale: [0.8, 1, 0.8], name: '课桌 4' },
      { assetId: 'chair', position: [0.2, 0, 2.25], rotation: [0, 180, 0], name: '课椅 4' },
    ],
  },
  {
    id: 'street',
    label: '街道',
    description: '路灯 + 电线杆 + 长椅 + 轿车，赛博霓虹夜戏外景',
    backgroundColor: '#0c0d14',
    groundOpacity: 0.85,
    rigId: 'neon-night',
    camera: { position: [0, 1.7, 6], target: [0, 1.2, -1.2], fov: 40 },
    objects: [
      { assetId: 'utility-pole', position: [-2.6, 0, -2] },
      { assetId: 'street-lamp', position: [-2.4, 0, 2], name: '路灯 A' },
      { assetId: 'street-lamp', position: [2.6, 0, -3], rotation: [0, 180, 0], name: '路灯 B' },
      { assetId: 'bench', position: [-1.8, 0, 0.6], rotation: [0, 90, 0] },
      { assetId: 'fence', position: [2.4, 0, 1.6], rotation: [0, -30, 0] },
      { assetId: 'car-sedan', position: [1.4, 0, -1.2], rotation: [0, -8, 0] },
      { assetId: 'traffic-cone', position: [0.2, 0, 1.6] },
      { assetId: 'tree', position: [3.2, 0, 2.6] },
      { assetId: 'rock', position: [3, 0, -0.4] },
    ],
  },
  {
    id: 'forest',
    label: '森林',
    description: '树木 + 灌木 + 山体，黄昏逆光的外景林地',
    backgroundColor: '#0f1410',
    groundOpacity: 0.9,
    rigId: 'golden-hour-backlight',
    camera: { position: [0, 1.6, 5.4], target: [0, 1.2, -2], fov: 45 },
    objects: [
      { assetId: 'tree', position: [-2.6, 0, -1.4], name: '树 A' },
      { assetId: 'tree', position: [2.4, 0, -2.2], name: '树 B' },
      { assetId: 'tree', position: [0.4, 0, -3.4], name: '树 C' },
      { assetId: 'tree', position: [-3.4, 0, 1.6], name: '树 D' },
      { assetId: 'tree', position: [3.2, 0, 1.2], name: '树 E' },
      { assetId: 'bush', position: [-1.4, 0, 0.4] },
      { assetId: 'bush', position: [1.8, 0, 0.2] },
      { assetId: 'bush', position: [0.2, 0, 1.8] },
      { assetId: 'rock', position: [-0.8, 0, -0.6] },
      { assetId: 'rock', position: [2, 0, -0.9] },
      { assetId: 'log', position: [1, 0, 1], rotation: [0, 25, 0] },
      { assetId: 'mountain', position: [-6, 0, -14], name: '远山 A' },
      { assetId: 'mountain', position: [6, 0, -16], name: '远山 B' },
    ],
  },
  {
    id: 'interrogation-room',
    label: '审讯室',
    description: '铁桌 + 对坐椅 + 门，顶位硬光的低调高反差景',
    backgroundColor: '#0d0f12',
    groundOpacity: 0.85,
    rigId: 'interrogation',
    camera: { position: [0, 1.55, 4.2], target: [0, 1.05, -0.6], fov: 45 },
    objects: [
      { assetId: 'table-dining', position: [0, 0, -0.4], scale: [0.62, 0.62, 0.62], name: '审讯桌' },
      { assetId: 'chair', position: [0, 0, -1.5], name: '被讯问席' },
      { assetId: 'chair', position: [-1.15, 0, 0.9], rotation: [0, 180, 0], name: '审讯席' },
      { assetId: 'crate', position: [-2.2, 0, -1.6] },
      { assetId: 'door-frame', position: [2.9, 0, -1.6], rotation: [0, -90, 0] },
      { assetId: 'speaker', position: [2.6, 0, 0.6], rotation: [0, -90, 0] },
    ],
  },
  {
    id: 'studio-set',
    label: '摄影棚片场',
    description: '背景屏幕 + 立柱 + 长椅 + 机位三脚架，高调白棚的拍摄现场',
    backgroundColor: '#15171c',
    groundOpacity: 0.7,
    rigId: 'high-key-studio',
    camera: { position: [0, 1.6, 5.8], target: [0, 1.2, -1], fov: 40 },
    objects: [
      { assetId: 'projection-screen', position: [0, 0, -3], name: '背景幕' },
      { assetId: 'pillar', position: [-2.6, 0, -1.5] },
      { assetId: 'pillar', position: [2.6, 0, -1.5] },
      { assetId: 'bench', position: [0, 0, 0.4] },
      { assetId: 'podium', position: [-1.8, 0, 0.2] },
      { assetId: 'speaker', position: [2, 0, 1], rotation: [0, -30, 0] },
      { assetId: 'tripod-camera', position: [1.2, 0, 2.2], rotation: [0, -12, 0], name: '机位三脚架' },
      { assetId: 'crate', position: [-2.4, 0, 1.6] },
      { assetId: 'traffic-cone', position: [2.6, 0, 2.4] },
    ],
  },
];

export function lookupBuiltinScene(id: string): BuiltinSceneDef | undefined {
  return BUILTIN_SCENES.find((scene) => scene.id === id);
}

export interface ApplyBuiltinSceneOptions {
  /** 生成对象 id 的前缀；重复应用同一场景时必须区分，避免图层 id 冲突 */
  idPrefix?: string;
}

/**
 * 把内置场景落到当前工程：
 * - 保留当前镜头已放置的角色；
 * - 替换全部非角色物体为场景内容；
 * - 落地布光（灯组 + 环境基线 + 曝光）与镜头视野（机位/目标/FOV）；
 * - 清空全景背景（内置场景自带环境，不做叠加）。
 */
export function applyBuiltinScene(
  project: DirectorProject,
  scene: BuiltinSceneDef,
  options: ApplyBuiltinSceneOptions = {},
): DirectorProject {
  const prefix = options.idPrefix ?? `scene-${scene.id}-${Date.now().toString(36)}`;
  const rig = lookupLightingRigPreset(scene.rigId);
  const lights = rig
    ? resolveRigLights(rig).map((preset, index) => lightFromPreset(preset, `${prefix}-light-${index}`))
    : project.scene.lights;

  const objects: DirectorObject[] = scene.objects.map((spec, index) => {
    const asset = lookupBuiltinAsset(spec.assetId);
    return {
      id: `${prefix}-obj-${index}`,
      name: spec.name ?? asset?.label ?? spec.assetId,
      kind: 'prop',
      visible: true,
      locked: false,
      builtinAssetId: spec.assetId,
      transform: {
        position: [...spec.position] as [number, number, number],
        rotation: [...(spec.rotation ?? [0, 0, 0])] as [number, number, number],
        scale: [...(spec.scale ?? [1, 1, 1])] as [number, number, number],
      },
    };
  });

  const characters = project.objects.filter((object) => object.kind === 'character');
  const active = project.cameras.find((camera) => camera.id === project.activeCameraId) ?? project.cameras[0];
  const cameraId = active?.id ?? `${prefix}-cam`;
  const camera = {
    id: cameraId,
    name: active?.name ?? '主镜头',
    fov: scene.camera.fov,
    transform: {
      position: [...scene.camera.position] as [number, number, number],
      rotation: active?.transform.rotation ? ([...active.transform.rotation] as [number, number, number]) : ([0, 0, 0] as [number, number, number]),
      scale: [1, 1, 1] as [number, number, number],
    },
    target: [...scene.camera.target] as [number, number, number],
    captures: [],
  };

  return {
    ...project,
    version: 1,
    scene: {
      ...project.scene,
      lights,
      ambientIntensity: rig ? rig.ambientIntensity : project.scene.ambientIntensity,
      exposure: rig ? rig.exposure : project.scene.exposure,
      lightingPresetId: rig ? rig.id : project.scene.lightingPresetId ?? null,
      backgroundColor: scene.backgroundColor,
      groundOpacity: scene.groundOpacity,
      showGround: true,
    },
    panorama: null,
    objects: [...objects, ...characters.map((character) => structuredClone(character))],
    cameras: [camera],
    activeCameraId: cameraId,
    assets: project.assets,
  };
}
