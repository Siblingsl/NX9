/**
 * NX9 3D 导演台 · 电影级灯光预置库。
 *
 * 方位约定（全球统一，面板与渲染共用）：
 * - `azimuth` 0° = 主体正前方（与导演台默认机位同侧，世界 +Z），俯视顺时针增加。
 *   45° = 画面右前，90° = 画面右侧，135° = 画面右后，180° = 正后方逆光，
 *   225° = 画面左后，270° = 画面左侧，315° = 画面左前。
 * - `elevation` 为地平线以上仰角，负值表示低于主体（底光）。
 * - `distance` 单位为米，指灯到主体原点的直线距离。
 */
import {
  DEFAULT_SCENE_LIGHTS,
  type DirectorLight,
  type DirectorLightRole,
  type DirectorLightType,
} from '../schema/directorProject';
import { clamp, deg2rad, norm360 } from '../schema/cameraGeometry';

export interface DirectorLightPreset {
  id: string;
  /** 中文标签，直接用于面板按钮 */
  label: string;
  role: DirectorLightRole;
  /** 英文 prompt 片段，进入镜头语言描述 */
  prompt: string;
  type: DirectorLightType;
  azimuth: number;
  elevation: number;
  distance: number;
  intensity: number;
  color: string;
  coneAngle?: number;
  penumbra?: number;
  castShadow: boolean;
}

/** 8 个经典主光方位（影视布光方位系统）。 */
export const KEY_LIGHT_AZIMUTHS: { slug: string; azimuth: number; label: string; short: string; prompt: string }[] = [
  { slug: 'front', azimuth: 0, label: '正面', short: '正前', prompt: 'frontal key light, flat even modelling' },
  { slug: 'front-right', azimuth: 45, label: '前侧 45°（画面右）', short: '右前', prompt: 'key light 45° camera-right, classic portrait modelling' },
  { slug: 'right', azimuth: 90, label: '侧光 90°（画面右）', short: '右侧', prompt: 'key light 90° hard side light from camera-right' },
  { slug: 'back-right', azimuth: 135, label: '侧逆 135°（画面右后）', short: '右后', prompt: 'key light 135° back-side from camera-right' },
  { slug: 'back', azimuth: 180, label: '逆光 180°（正后方）', short: '正后', prompt: 'key light 180° backlight, subject in silhouette' },
  { slug: 'back-left', azimuth: 225, label: '侧逆 225°（画面左后）', short: '左后', prompt: 'key light 225° back-side from camera-left' },
  { slug: 'left', azimuth: 270, label: '侧光 270°（画面左）', short: '左侧', prompt: 'key light 270° hard side light from camera-left' },
  { slug: 'front-left', azimuth: 315, label: '前侧 315°（画面左）', short: '左前', prompt: 'key light 45° camera-left, classic portrait modelling' },
];

/** 3 个经典主光高度（与 8 个方位组合成 24 宫格）。 */
export const KEY_LIGHT_ELEVATIONS: { slug: 'high' | 'eye' | 'low'; label: string; elevation: number; prompt: string; distance: number; factor: number }[] = [
  { slug: 'high', label: '高位', elevation: 55, prompt: 'from a high angle, top-down face modelling', distance: 3.6, factor: 1.05 },
  { slug: 'eye', label: '平位', elevation: 15, prompt: 'at near eye level', distance: 3.2, factor: 1 },
  { slug: 'low', label: '低位', elevation: -20, prompt: 'from a low angle, upward menacing modelling', distance: 2.8, factor: 0.85 },
];

const KEY_AZIMUTH_FACTOR: Record<string, number> = {
  front: 1,
  'front-right': 1.08,
  right: 1.12,
  'back-right': 0.88,
  back: 0.78,
  'back-left': 0.88,
  left: 1.12,
  'front-left': 1.08,
};

const KEY_COLOR = '#fff5ea';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildKeyLightPresets(): DirectorLightPreset[] {
  const presets: DirectorLightPreset[] = [];
  for (const el of KEY_LIGHT_ELEVATIONS) {
    for (const az of KEY_LIGHT_AZIMUTHS) {
      presets.push({
        id: `key-${az.slug}-${el.slug}`,
        label: `${az.label} · ${el.label}`,
        role: 'key',
        prompt: `${az.prompt}, ${el.prompt}`,
        type: 'directional',
        azimuth: az.azimuth,
        elevation: el.elevation,
        distance: el.distance,
        intensity: round2((KEY_AZIMUTH_FACTOR[az.slug] ?? 1) * el.factor),
        color: KEY_COLOR,
        castShadow: true,
      });
    }
  }
  return presets;
}

/** 24 个主光位预设：8 方位 × 3 高度。 */
export const KEY_LIGHT_PRESETS: DirectorLightPreset[] = buildKeyLightPresets();

/** 9 个轮廓光预设：覆盖冷/暖色温、硬/柔质感、高位与低位轮廓。 */
export const RIM_LIGHT_PRESETS: DirectorLightPreset[] = [
  {
    id: 'rim-cool-hard',
    label: '冷调硬轮廓',
    role: 'rim',
    prompt: 'cool blue hard rim light, crisp separation from background',
    type: 'spot',
    azimuth: 160,
    elevation: 45,
    distance: 4,
    intensity: 1.7,
    color: '#cfe4ff',
    coneAngle: 30,
    penumbra: 0.15,
    castShadow: false,
  },
  {
    id: 'rim-warm-soft',
    label: '暖调柔轮廓',
    role: 'rim',
    prompt: 'warm soft rim light, gentle edge glow on hair and shoulders',
    type: 'spot',
    azimuth: 200,
    elevation: 25,
    distance: 3.6,
    intensity: 0.95,
    color: '#ffd9a0',
    coneAngle: 60,
    penumbra: 0.8,
    castShadow: false,
  },
  {
    id: 'rim-white-hot',
    label: '白热硬轮廓',
    role: 'rim',
    prompt: 'blown-out white rim light, high-contrast halo',
    type: 'directional',
    azimuth: 180,
    elevation: 60,
    distance: 4.5,
    intensity: 2.2,
    color: '#ffffff',
    castShadow: false,
  },
  {
    id: 'rim-low-back',
    label: '低位逆光轮廓',
    role: 'rim',
    prompt: 'low backlight rim, floor bounce and upward edge glow',
    type: 'spot',
    azimuth: 180,
    elevation: -12,
    distance: 3.2,
    intensity: 1.3,
    color: '#ffb27a',
    coneAngle: 45,
    penumbra: 0.4,
    castShadow: false,
  },
  {
    id: 'rim-side-cool',
    label: '侧逆冷边',
    role: 'rim',
    prompt: 'cool side-back rim light from camera-right, thin edge highlight',
    type: 'directional',
    azimuth: 135,
    elevation: 20,
    distance: 3.4,
    intensity: 1.15,
    color: '#a9c8ff',
    castShadow: false,
  },
  {
    id: 'rim-neon-cyan',
    label: '霓虹青轮廓',
    role: 'rim',
    prompt: 'cyan neon practical rim light, wet cyberpunk edge',
    type: 'point',
    azimuth: 225,
    elevation: 10,
    distance: 3,
    intensity: 1.4,
    color: '#22d3ee',
    castShadow: false,
  },
  {
    id: 'rim-neon-magenta',
    label: '霓虹洋红轮廓',
    role: 'rim',
    prompt: 'magenta neon rim light, night club edge glow',
    type: 'point',
    azimuth: 135,
    elevation: 8,
    distance: 3,
    intensity: 1.35,
    color: '#f472b6',
    castShadow: false,
  },
  {
    id: 'rim-screen-white',
    label: '银幕冷白轮廓',
    role: 'rim',
    prompt: 'soft cool white rim light, subtle screen glow separation',
    type: 'spot',
    azimuth: 200,
    elevation: 35,
    distance: 4.2,
    intensity: 0.7,
    color: '#eaf2ff',
    coneAngle: 50,
    penumbra: 0.6,
    castShadow: false,
  },
  {
    id: 'rim-golden-edge',
    label: '黄昏金边轮廓',
    role: 'rim',
    prompt: 'golden hour edge light, warm sun flare rim on hair',
    type: 'directional',
    azimuth: 160,
    elevation: 25,
    distance: 4,
    intensity: 1.5,
    color: '#ffca7a',
    castShadow: false,
  },
];

/** 环境光预设：为整场提供基线照度，不参与方位计算。 */
export const AMBIENT_PRESETS: DirectorLightPreset[] = [
  {
    id: 'ambient-studio',
    label: '摄影棚中性',
    role: 'ambient',
    prompt: 'neutral studio ambient fill',
    type: 'ambient',
    azimuth: 0,
    elevation: 0,
    distance: 0,
    intensity: 0.55,
    color: '#ffffff',
    castShadow: false,
  },
  {
    id: 'ambient-cool',
    label: '冷调环境',
    role: 'ambient',
    prompt: 'cool daylight ambient fill',
    type: 'ambient',
    azimuth: 0,
    elevation: 0,
    distance: 0,
    intensity: 0.5,
    color: '#dbe7ff',
    castShadow: false,
  },
  {
    id: 'ambient-warm',
    label: '暖调环境',
    role: 'ambient',
    prompt: 'warm tungsten ambient fill',
    type: 'ambient',
    azimuth: 0,
    elevation: 0,
    distance: 0,
    intensity: 0.5,
    color: '#ffe6c8',
    castShadow: false,
  },
  {
    id: 'ambient-dusk',
    label: '暮色环境',
    role: 'ambient',
    prompt: 'dusk ambient, dim blue-grey sky fill',
    type: 'ambient',
    azimuth: 0,
    elevation: 0,
    distance: 0,
    intensity: 0.35,
    color: '#6b7ba8',
    castShadow: false,
  },
  {
    id: 'ambient-night',
    label: '夜色低照度',
    role: 'ambient',
    prompt: 'low-ambient night scene, deep shadows',
    type: 'ambient',
    azimuth: 0,
    elevation: 0,
    distance: 0,
    intensity: 0.18,
    color: '#2f3a52',
    castShadow: false,
  },
  {
    id: 'ambient-high-key',
    label: '高调白棚',
    role: 'ambient',
    prompt: 'high-key white studio ambient, near shadowless',
    type: 'ambient',
    azimuth: 0,
    elevation: 0,
    distance: 0,
    intensity: 0.9,
    color: '#ffffff',
    castShadow: false,
  },
];

export interface LightingRigLightRef {
  source: 'key' | 'rim' | 'ambient';
  presetId: string;
  /** 整组方案对单灯的覆盖（如把主光位复用为补光） */
  override?: Partial<DirectorLightPreset>;
}

export interface LightingRigPreset {
  id: string;
  label: string;
  description: string;
  prompt: string;
  ambientIntensity: number;
  exposure: number;
  lights: LightingRigLightRef[];
}

/** 整组布光方案：主光 + 轮廓光 + 补光 + 环境基线一次性落地。 */
export const LIGHTING_RIG_PRESETS: LightingRigPreset[] = [
  {
    id: 'three-point',
    label: '三点布光',
    description: '经典主光 + 侧前补光 + 冷轮廓，人像与对话戏通用',
    prompt: 'classic three-point lighting, soft key, gentle fill, cool rim separation',
    ambientIntensity: 0.25,
    exposure: 1,
    lights: [
      { source: 'key', presetId: 'key-front-right-high' },
      { source: 'key', presetId: 'key-front-left-eye', override: { role: 'fill', label: '补光 · 左前平位', intensity: 0.45, color: '#cfe0ff', castShadow: false, prompt: 'soft fill light 45° camera-left' } },
      { source: 'rim', presetId: 'rim-cool-hard' },
    ],
  },
  {
    id: 'rembrandt',
    label: '伦勃朗',
    description: '侧前高位主光，面颊三角光斑，低调古典人像',
    prompt: 'Rembrandt lighting, triangular cheek highlight, deep shadow side, classical portrait',
    ambientIntensity: 0.15,
    exposure: 0.98,
    lights: [
      { source: 'key', presetId: 'key-front-right-eye', override: { azimuth: 55, elevation: 40, intensity: 1.3, distance: 3 } },
      { source: 'key', presetId: 'key-front-left-low', override: { role: 'fill', label: '补光 · 左前低位', intensity: 0.2, color: '#dbe7ff', castShadow: false } },
      { source: 'rim', presetId: 'rim-screen-white' },
    ],
  },
  {
    id: 'butterfly',
    label: '蝴蝶光',
    description: '正上方正面主光，鼻下蝴蝶影，时尚美妆质感',
    prompt: 'butterfly lighting, overhead frontal key, glamour beauty dish, soft even skin',
    ambientIntensity: 0.7,
    exposure: 1.08,
    lights: [
      { source: 'key', presetId: 'key-front-high', override: { intensity: 1.25, elevation: 62, distance: 3.2 } },
      { source: 'key', presetId: 'key-front-left-eye', override: { role: 'fill', label: '补光 · 左前平位', intensity: 0.3, color: '#fff0e0', castShadow: false } },
      { source: 'ambient', presetId: 'ambient-high-key' },
    ],
  },
  {
    id: 'golden-hour-backlight',
    label: '黄昏逆光',
    description: '低位暖阳逆光 + 金边轮廓 + 暖环境，情绪外景',
    prompt: 'golden hour backlight, warm sun flare, long shadows, lens haze, romantic exterior',
    ambientIntensity: 0.3,
    exposure: 1.15,
    lights: [
      { source: 'key', presetId: 'key-back-low', override: { color: '#ffcf8f', intensity: 1.4, distance: 5, label: '主光 · 逆光低位暖阳' } },
      { source: 'key', presetId: 'key-front-eye', override: { role: 'fill', label: '补光 · 正面暖反光', intensity: 0.35, color: '#ffd9b0', castShadow: false } },
      { source: 'rim', presetId: 'rim-golden-edge' },
      { source: 'ambient', presetId: 'ambient-warm' },
    ],
  },
  {
    id: 'neon-night',
    label: '赛博霓虹',
    description: '青色主位 + 洋红轮廓的对撞霓虹，夜戏街头',
    prompt: 'cyberpunk neon night, cyan and magenta practicals, wet reflections, high contrast',
    ambientIntensity: 0.18,
    exposure: 1.25,
    lights: [
      { source: 'rim', presetId: 'rim-neon-cyan', override: { role: 'key', label: '霓虹青主位', intensity: 1.6, distance: 3.4 } },
      { source: 'rim', presetId: 'rim-neon-magenta' },
      { source: 'key', presetId: 'key-right-low', override: { role: 'fill', label: '补光 · 右侧低位', intensity: 0.28, color: '#8ea2ff', castShadow: false } },
      { source: 'ambient', presetId: 'ambient-night' },
    ],
  },
  {
    id: 'interrogation',
    label: '审讯室',
    description: '顶位硬光压暗眼窝，冷白高对比，极低环境光',
    prompt: 'interrogation room lighting, harsh top light, deep eye shadows, cold clinical contrast',
    ambientIntensity: 0.1,
    exposure: 0.95,
    lights: [
      { source: 'key', presetId: 'key-front-high', override: { intensity: 1.6, elevation: 68, color: '#eaf0ff', distance: 2.8 } },
      { source: 'key', presetId: 'key-front-right-low', override: { role: 'fill', label: '补光 · 右前低位', intensity: 0.18, color: '#c7d4ef', castShadow: false } },
      { source: 'rim', presetId: 'rim-cool-hard', override: { intensity: 0.6 } },
      { source: 'ambient', presetId: 'ambient-night' },
    ],
  },
  {
    id: 'high-key-studio',
    label: '高调白棚',
    description: '白棚高调，几乎无影，广告与产品人像',
    prompt: 'high-key white studio, shadowless even light, clean commercial look',
    ambientIntensity: 0.9,
    exposure: 1.1,
    lights: [
      { source: 'key', presetId: 'key-front-eye', override: { intensity: 1.2 } },
      { source: 'key', presetId: 'key-front-left-eye', override: { role: 'fill', label: '补光 · 左前平位', intensity: 0.8, castShadow: false } },
      { source: 'rim', presetId: 'rim-screen-white', override: { intensity: 0.5 } },
      { source: 'ambient', presetId: 'ambient-high-key', override: { intensity: 0.9 } },
    ],
  },
  {
    id: 'low-key-noir',
    label: '低调黑色电影',
    description: '90° 硬侧光 + 冷轮廓，大面积暗部，film noir',
    prompt: 'low-key film noir, hard side light, deep black shadows, cool rim, high contrast',
    ambientIntensity: 0.06,
    exposure: 0.9,
    lights: [
      { source: 'key', presetId: 'key-right-eye', override: { intensity: 1.35, azimuth: 100, elevation: 22 } },
      { source: 'rim', presetId: 'rim-cool-hard', override: { intensity: 1.2 } },
      { source: 'ambient', presetId: 'ambient-night', override: { intensity: 0.08 } },
    ],
  },
];

export function lookupKeyLightPreset(id: string): DirectorLightPreset | undefined {
  return KEY_LIGHT_PRESETS.find((preset) => preset.id === id);
}

export function lookupRimLightPreset(id: string): DirectorLightPreset | undefined {
  return RIM_LIGHT_PRESETS.find((preset) => preset.id === id);
}

export function lookupLightingRigPreset(id: string): LightingRigPreset | undefined {
  return LIGHTING_RIG_PRESETS.find((preset) => preset.id === id);
}

/** 24 宫格取值：按方位 + 高度档定位主光预设。 */
export function keyLightPresetAt(azimuth: number, elevationSlug: 'high' | 'eye' | 'low'): DirectorLightPreset | undefined {
  return KEY_LIGHT_PRESETS.find(
    (preset) => preset.azimuth === azimuth && preset.elevation === KEY_LIGHT_ELEVATIONS.find((tier) => tier.slug === elevationSlug)?.elevation,
  );
}

function lookupBySource(source: LightingRigLightRef['source'], id: string): DirectorLightPreset | undefined {
  if (source === 'key') return lookupKeyLightPreset(id);
  if (source === 'rim') return lookupRimLightPreset(id);
  return AMBIENT_PRESETS.find((preset) => preset.id === id);
}

/** 展开整组方案；预设缺失的条目会被跳过（由单测保证不会发生）。 */
export function resolveRigLights(rig: LightingRigPreset): DirectorLightPreset[] {
  const resolved: DirectorLightPreset[] = [];
  for (const ref of rig.lights) {
    const base = lookupBySource(ref.source, ref.presetId);
    if (!base) continue;
    resolved.push({ ...base, ...ref.override });
  }
  return resolved;
}

/** 预设转为场景灯；`id` 由调用方提供以保证可序列化且稳定。 */
export function lightFromPreset(preset: DirectorLightPreset, id: string, name?: string): DirectorLight {
  const light: DirectorLight = {
    id,
    name: name ?? preset.label,
    role: preset.role,
    type: preset.type,
    azimuth: preset.azimuth,
    elevation: preset.elevation,
    distance: preset.type === 'ambient' ? 0 : preset.distance,
    intensity: preset.intensity,
    color: preset.color,
    castShadow: preset.castShadow,
    visible: true,
  };
  if (preset.coneAngle !== undefined) light.coneAngle = preset.coneAngle;
  if (preset.penumbra !== undefined) light.penumbra = preset.penumbra;
  return light;
}

/** 与 §光线方向 保持一致的中文/英文方位描述，供 prompt 与面板提示复用。 */
export function azimuthLabel(azimuth: number): { en: string; zh: string } {
  const az = norm360(azimuth);
  const step = Math.round(az / 45) % 8;
  const table: { en: string; zh: string }[] = [
    { en: 'frontal', zh: '正面' },
    { en: 'front-right 45°', zh: '右前 45°' },
    { en: 'camera-right 90°', zh: '右侧 90°' },
    { en: 'back-right 135°', zh: '右后 135°' },
    { en: 'backlight 180°', zh: '正后方 180°' },
    { en: 'back-left 225°', zh: '左后 225°' },
    { en: 'camera-left 270°', zh: '左侧 270°' },
    { en: 'front-left 315°', zh: '左前 315°' },
  ];
  return table[step]!;
}

const ROLE_EN: Record<DirectorLightRole, string> = {
  key: 'key',
  fill: 'fill',
  rim: 'rim',
  ambient: 'ambient',
  practical: 'practical',
};

const TYPE_EN: Record<DirectorLightType, string> = {
  directional: 'directional light',
  spot: 'spot light',
  point: 'point light',
  ambient: 'ambient light',
};

/** 单盏灯的自然语言描述（英文，进入镜头 prompt）。 */
export function describeDirectorLight(light: DirectorLight): string {
  const role = ROLE_EN[light.role] ?? light.role;
  if (light.type === 'ambient') {
    return `${role} light ${light.color} intensity ${light.intensity.toFixed(2)}`;
  }
  const az = azimuthLabel(light.azimuth);
  const el = Math.round(light.elevation);
  const elevationPhrase = el >= 40 ? `${el}° high` : el <= -5 ? `${Math.abs(el)}° low` : `${el}° eye level`;
  const cone =
    light.type === 'spot' && light.coneAngle !== undefined
      ? `, ${Math.round(light.coneAngle)}° cone${light.penumbra !== undefined ? ` penumbra ${light.penumbra.toFixed(2)}` : ''}`
      : '';
  return `${role} ${TYPE_EN[light.type]} from ${az.en} at ${elevationPhrase}, ${light.distance.toFixed(1)}m, ${light.color} intensity ${light.intensity.toFixed(2)}${cone}`;
}

export interface LightingPromptOptions {
  ambientIntensity?: number;
  exposure?: number;
}

/**
 * 生成镜头语言的灯光片段。无可见灯且无环境光时返回空串，避免污染 prompt。
 */
export function buildLightingPromptFragment(
  lights: DirectorLight[],
  options: LightingPromptOptions = {},
): string {
  const visible = lights.filter((light) => light.visible);
  const parts = visible.map(describeDirectorLight);
  const ambient = options.ambientIntensity;
  if (ambient !== undefined && ambient > 0) {
    parts.push(`ambient fill intensity ${ambient.toFixed(2)}`);
  }
  if (options.exposure !== undefined && options.exposure !== 1) {
    parts.push(`exposure ${options.exposure.toFixed(2)}`);
  }
  if (parts.length === 0) return '';
  return `lighting: ${parts.join('; ')}`;
}

/** 灯位球坐标 → 世界坐标（与渲染层共用，保证面板与画面一致）。 */
export function lightPosition(light: DirectorLight): [number, number, number] {
  if (light.type === 'ambient') return [0, 0, 0];
  const elevation = clamp(light.elevation, -85, 88);
  const e = deg2rad(elevation);
  const a = deg2rad(light.azimuth);
  const d = Math.max(0.1, light.distance);
  return [
    d * Math.cos(e) * Math.sin(a),
    d * Math.sin(e),
    d * Math.cos(e) * Math.cos(a),
  ];
}

export interface SceneLightingSlice {
  lights: DirectorLight[];
  ambientIntensity: number;
  exposure: number;
}

/** 从场景灯光设置直接产出 prompt 片段，供截帧、机位预览与提示词皮肤共用。 */
export function buildSceneLightingPrompt(scene: SceneLightingSlice): string {
  return buildLightingPromptFragment(scene.lights, {
    ambientIntensity: scene.ambientIntensity,
    exposure: scene.exposure,
  });
}

/** 旧数据兜底：当前无灯光时的默认主光/环境基线，与硬编码两灯视觉一致。 */
export function defaultLightingFallback(): { lights: DirectorLight[]; ambientIntensity: number; exposure: number } {
  return { lights: DEFAULT_SCENE_LIGHTS.map((light) => ({ ...light })), ambientIntensity: 0.55, exposure: 1 };
}
