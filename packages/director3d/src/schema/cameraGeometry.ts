/**
 * NX9 camera geometry + film vocabulary for Stage Composer.
 *
 * Spherical orbit / FOV↔focal / angle & shot-size classifiers are adapted from
 * FramePilot `editorMath.ts` (MIT © 2026 Abdurrahman Fakhrul / @rahmanef63).
 * Prompt wording and NX9 DirectorCameraShot wiring are NX9-owned.
 */
import { Vector3 } from 'three';
import type { DirectorCameraShot } from './directorProject';

export interface CameraViewSnapshot {
  fov: number;
  position: [number, number, number];
  target: [number, number, number];
}

export interface Pt3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraOrbit {
  az: number;
  el: number;
  dist: number;
}

export const DEFAULT_DIRECTOR_VIEW: CameraViewSnapshot = {
  fov: 50,
  position: [0, 1.55, 5.4],
  target: [0, 1.05, 0],
};

const FRUSTUM_DEPTH = 1.8;

export const deg2rad = (d: number): number => (d * Math.PI) / 180;
export const rad2deg = (r: number): number => (r * 180) / Math.PI;
export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const norm360 = (a: number): number => ((a % 360) + 360) % 360;
export const norm180 = (a: number): number => {
  let x = norm360(a);
  return x > 180 ? x - 360 : x;
};

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const lerpAngle = (a: number, b: number, t: number): number => a + norm180(b - a) * t;
export const smoothstep = (t: number): number => t * t * (3 - 2 * t);

export function getOrbit(camPos: Pt3, target: Pt3): CameraOrbit {
  const dx = camPos.x - target.x;
  const dy = camPos.y - target.y;
  const dz = camPos.z - target.z;
  const dist = Math.max(0.05, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const el = rad2deg(Math.asin(clamp(dy / dist, -1, 1)));
  const az = norm360(rad2deg(Math.atan2(dx, dz)));
  return { az, el, dist };
}

export function setOrbit(az: number, el: number, dist: number, target: Pt3): Pt3 {
  const eClamped = clamp(el, -85, 88);
  const dClamped = clamp(dist, 0.3, 30);
  const e = deg2rad(eClamped);
  const a = deg2rad(az);
  return {
    x: target.x + dClamped * Math.cos(e) * Math.sin(a),
    y: target.y + dClamped * Math.sin(e),
    z: target.z + dClamped * Math.cos(e) * Math.cos(a),
  };
}

/** Full-frame half-height ≈ 12mm sensor model (FramePilot / CAG). */
export const focalLengthMm = (fov: number): number => Math.round(12 / Math.tan(deg2rad(fov) / 2));
export const fovFromFocalMm = (mm: number): number => rad2deg(2 * Math.atan(12 / Math.max(1, mm)));

export function aspectNumber(value: string): number {
  const [a, b] = String(value || '16:9').split(':').map(Number);
  return a > 0 && b > 0 ? a / b : 16 / 9;
}

export const subjectHeightM = (kind: 'person' | 'object' = 'person'): number =>
  kind === 'person' ? 1.75 : 1.4;

export function angleLabel(el: number, roll = 0): string {
  let a: string;
  if (el >= 62) a = "BIRD'S EYE";
  else if (el >= 16) a = 'HIGH ANGLE';
  else if (el >= -10) a = 'EYE LEVEL';
  else if (el >= -40) a = 'LOW ANGLE';
  else a = "WORM'S EYE";
  if (Math.abs(roll) >= 7) a += ' · DUTCH';
  return a;
}

export function shotLabel(dist: number, fov: number, h = subjectHeightM()): string {
  const span = 2 * dist * Math.tan(deg2rad(fov) / 2);
  const r = span / h;
  if (r < 0.3) return 'EXTREME CLOSE-UP';
  if (r < 0.58) return 'CLOSE-UP';
  if (r < 0.95) return 'MEDIUM CLOSE-UP';
  if (r < 1.45) return 'MEDIUM SHOT';
  if (r < 2.2) return 'FULL SHOT';
  if (r < 3.6) return 'WIDE SHOT';
  return 'EXTREME WIDE';
}

export function shotDistance(r: number, fov: number, h = subjectHeightM()): number {
  return clamp((r * h) / (2 * Math.tan(deg2rad(fov) / 2)), 0.3, 30);
}

export function viewLabel(az: number, subjectYawDeg = 0): string {
  const rel = norm180(az - subjectYawDeg);
  const abs = Math.abs(rel);
  let base: string;
  let sided = true;
  if (abs <= 22) {
    base = 'front view';
    sided = false;
  } else if (abs <= 67) {
    base = 'three-quarter front view';
  } else if (abs <= 112) {
    base = 'side profile view';
  } else if (abs <= 157) {
    base = 'three-quarter back view';
  } else {
    base = 'back view';
    sided = false;
  }
  if (!sided) return base;
  const side = rel > 0 ? 'from the left' : 'from the right';
  return `${base} ${side} (~${Math.round(abs)}° off-axis)`;
}

const ANGLE_EN: Record<string, string> = {
  "BIRD'S EYE": "bird's-eye view",
  'HIGH ANGLE': 'high angle',
  'EYE LEVEL': 'eye-level shot',
  'LOW ANGLE': 'low angle',
  "WORM'S EYE": "worm's-eye view",
};

export type CameraMoveId =
  | 'static'
  | 'dolly-in'
  | 'dolly-out'
  | 'truck-left'
  | 'truck-right'
  | 'pedestal-up'
  | 'pedestal-down'
  | 'pan-left'
  | 'pan-right'
  | 'tilt-up'
  | 'tilt-down'
  | 'orbit'
  | 'crane-up'
  | 'crane-down'
  | 'handheld';

const MOVE_PHRASE: Record<CameraMoveId, string> = {
  static: 'locked-off camera',
  'dolly-in': 'slow dolly in',
  'dolly-out': 'slow dolly out',
  'truck-left': 'truck left',
  'truck-right': 'truck right',
  'pedestal-up': 'pedestal up',
  'pedestal-down': 'pedestal down',
  'pan-left': 'pan left',
  'pan-right': 'pan right',
  'tilt-up': 'tilt up',
  'tilt-down': 'tilt down',
  orbit: 'orbit around subject',
  'crane-up': 'crane up',
  'crane-down': 'crane down',
  handheld: 'handheld move',
};

/** Foldable prompt detail switches (FramePilot-style). */
export interface PromptDetailFlags {
  shotSize: boolean;
  angle: boolean;
  view: boolean;
  lens: boolean;
  dof: boolean;
  dutch: boolean;
  movement: boolean;
  framing: boolean;
  subjectFacing: boolean;
  atmosphere: boolean;
  /** 场景灯光描述（由 buildLightingPromptFragment 生成） */
  lighting: boolean;
}

export const DEFAULT_PROMPT_DETAILS: PromptDetailFlags = {
  shotSize: true,
  angle: true,
  view: true,
  lens: true,
  dof: false,
  dutch: true,
  movement: true,
  framing: false,
  subjectFacing: false,
  atmosphere: false,
  lighting: true,
};

export const PROMPT_DETAIL_LABELS: { id: keyof PromptDetailFlags; label: string }[] = [
  { id: 'shotSize', label: '景别' },
  { id: 'angle', label: '角度' },
  { id: 'view', label: '朝向' },
  { id: 'lens', label: '焦段' },
  { id: 'dof', label: '景深' },
  { id: 'dutch', label: '荷兰角' },
  { id: 'movement', label: '运镜' },
  { id: 'framing', label: '构图' },
  { id: 'subjectFacing', label: '主体朝向' },
  { id: 'atmosphere', label: '氛围' },
  { id: 'lighting', label: '灯光' },
];

export interface BuildCameraPromptOptions {
  roll?: number;
  subjectYawDeg?: number;
  move?: CameraMoveId | string | null;
  subjectKind?: 'person' | 'object';
  details?: Partial<PromptDetailFlags>;
  /** 场景灯光英文片段；仅在 details.lighting 打开且非空时进入 prompt */
  lightingPrompt?: string;
}

function dofPhrase(dist: number, lensMm: number): string {
  const shallow = lensMm >= 50 || dist < 1.8;
  if (shallow) return 'shallow depth of field, soft background bokeh';
  if (lensMm <= 28 || dist > 4) return 'deep focus, crisp foreground and background';
  return 'moderate depth of field';
}

function framingPhrase(az: number, el: number): string {
  if (Math.abs(el) < 8 && Math.abs(norm180(az)) < 15) return 'centered subject framing';
  if (Math.abs(el) < 12) return 'rule-of-thirds framing';
  return 'dynamic off-center framing';
}

export function describeCameraShot(
  camera: DirectorCameraShot,
  opts: BuildCameraPromptOptions = {},
): {
  orbit: CameraOrbit;
  angle: string;
  shot: string;
  lensMm: number;
  view: string;
  prompt: string;
  parts: string[];
} {
  const details: PromptDetailFlags = { ...DEFAULT_PROMPT_DETAILS, ...opts.details };
  const pos: Pt3 = {
    x: camera.transform.position[0],
    y: camera.transform.position[1],
    z: camera.transform.position[2],
  };
  const target: Pt3 = { x: camera.target[0], y: camera.target[1], z: camera.target[2] };
  const orbit = getOrbit(pos, target);
  const roll = opts.roll ?? camera.transform.rotation[2] ?? 0;
  const angle = angleLabel(orbit.el, roll);
  const shot = shotLabel(orbit.dist, camera.fov, subjectHeightM(opts.subjectKind ?? 'person'));
  const lensMm = focalLengthMm(camera.fov);
  const view = viewLabel(orbit.az, opts.subjectYawDeg ?? 0);
  const baseAngle = angle.replace(' · DUTCH', '');
  const angleEn = ANGLE_EN[baseAngle] ?? baseAngle.toLowerCase();
  const moveKey = (opts.move ?? 'static') as CameraMoveId;
  const movePhrase = MOVE_PHRASE[moveKey] ?? String(opts.move || 'locked-off camera');

  const parts: string[] = [];
  if (details.shotSize) parts.push(shot.toLowerCase());
  if (details.angle) parts.push(angleEn);
  if (details.view) parts.push(view);
  if (details.lens) parts.push(`~${lensMm}mm full-frame lens`);
  if (details.dof) parts.push(dofPhrase(orbit.dist, lensMm));
  if (details.dutch && Math.abs(roll) >= 7) parts.push(`dutch angle ${Math.round(roll)}°`);
  if (details.framing) parts.push(framingPhrase(orbit.az, orbit.el));
  if (details.subjectFacing) {
    const facing = viewLabel(orbit.az, opts.subjectYawDeg ?? 0);
    parts.push(`subject ${facing.includes('front') ? 'facing camera' : 'angled to camera'}`);
  }
  if (details.atmosphere) {
    parts.push(lensMm >= 50 ? 'cinematic intimate atmosphere' : 'cinematic open atmosphere');
  }
  if (details.lighting && opts.lightingPrompt?.trim()) {
    parts.push(opts.lightingPrompt.trim());
  }
  if (details.movement) parts.push(`camera movement: ${movePhrase}`);

  const prompt = parts.length > 0 ? parts.join(', ') : `${shot.toLowerCase()}, ${angleEn}`;
  return { orbit, angle, shot, lensMm, view, prompt, parts };
}

export function buildCameraPrompt(
  camera: DirectorCameraShot,
  opts: BuildCameraPromptOptions = {},
): string {
  return describeCameraShot(camera, opts).prompt;
}

export function getCameraViewFromShot(camera: DirectorCameraShot): CameraViewSnapshot {
  const rig = new Vector3(...camera.transform.position);
  const target = new Vector3(...camera.target);
  const forward = target.clone().sub(rig).normalize();
  const viewPos = rig.clone().add(forward.multiplyScalar(FRUSTUM_DEPTH));
  return {
    fov: camera.fov,
    position: [viewPos.x, viewPos.y, viewPos.z],
    target: camera.target,
  };
}

export function applyOrbitToCamera(
  camera: DirectorCameraShot,
  orbit: Partial<CameraOrbit> & { fov?: number },
): DirectorCameraShot {
  const pos: Pt3 = {
    x: camera.transform.position[0],
    y: camera.transform.position[1],
    z: camera.transform.position[2],
  };
  const target: Pt3 = { x: camera.target[0], y: camera.target[1], z: camera.target[2] };
  const cur = getOrbit(pos, target);
  const next = setOrbit(
    orbit.az ?? cur.az,
    orbit.el ?? cur.el,
    orbit.dist ?? cur.dist,
    target,
  );
  return {
    ...camera,
    fov: orbit.fov ?? camera.fov,
    transform: {
      ...camera.transform,
      position: [next.x, next.y, next.z],
    },
  };
}

export function interpolateCamera(
  a: DirectorCameraShot,
  b: DirectorCameraShot,
  tRaw: number,
): DirectorCameraShot {
  const t = smoothstep(clamp(tRaw, 0, 1));
  const ta: Pt3 = { x: a.target[0], y: a.target[1], z: a.target[2] };
  const tb: Pt3 = { x: b.target[0], y: b.target[1], z: b.target[2] };
  const oa = getOrbit(
    { x: a.transform.position[0], y: a.transform.position[1], z: a.transform.position[2] },
    ta,
  );
  const ob = getOrbit(
    { x: b.transform.position[0], y: b.transform.position[1], z: b.transform.position[2] },
    tb,
  );
  const target: Pt3 = {
    x: lerp(ta.x, tb.x, t),
    y: lerp(ta.y, tb.y, t),
    z: lerp(ta.z, tb.z, t),
  };
  const pos = setOrbit(lerpAngle(oa.az, ob.az, t), lerp(oa.el, ob.el, t), lerp(oa.dist, ob.dist, t), target);
  return {
    ...a,
    fov: lerp(a.fov, b.fov, t),
    target: [target.x, target.y, target.z],
    transform: {
      ...a.transform,
      position: [pos.x, pos.y, pos.z],
      rotation: [
        lerp(a.transform.rotation[0], b.transform.rotation[0], t),
        lerp(a.transform.rotation[1], b.transform.rotation[1], t),
        lerp(a.transform.rotation[2], b.transform.rotation[2], t),
      ],
    },
  };
}
