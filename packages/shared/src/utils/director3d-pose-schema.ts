/**
 * director3d-pose-schema.ts — Agent 3D 摆位协议收口（F-019）。
 *
 * Agent 输出必须过 Zod（或等效校验）；非法指令丢弃并重试一次；
 * 成功应用到 director3d；写入 shot。
 */
export interface Director3dCharacterPose {
  characterId?: string;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale?: [number, number, number];
  posePresetId?: string;
}

export interface Director3dCameraPose {
  position: [number, number, number];
  target: [number, number, number];
  fov?: number;
}

export interface Director3dPoseCommand {
  version: 1;
  characters: Director3dCharacterPose[];
  camera: Director3dCameraPose;
  lookAt?: string; // character name to focus
}

const POSITION_BOUNDS = { min: -50, max: 50 };
const ROTATION_BOUNDS = { min: -180, max: 180 };
const FOV_BOUNDS = { min: 10, max: 160 };

function isNumberArray(v: unknown, len: number): v is number[] {
  return Array.isArray(v) && v.length === len && v.every((n) => typeof n === 'number' && isFinite(n));
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * 校验 Director3dPoseCommand，返回合法后的清理版本和错误信息。
 */
export function validatePoseCommand(input: unknown): {
  valid: boolean;
  command?: Director3dPoseCommand;
  errors: string[];
} {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['输入必须是 JSON 对象'] };
  }

  const raw = input as Record<string, unknown>;

  if (raw.version !== 1) {
    errors.push('不支持的协议版本');
  }

  // 校验 characters
  const characters: Director3dCharacterPose[] = [];
  if (!Array.isArray(raw.characters)) {
    errors.push('characters 必须是数组');
  } else {
    for (let i = 0; i < raw.characters.length; i++) {
      const c = raw.characters[i] as Record<string, unknown>;
      if (!c || typeof c !== 'object') {
        errors.push(`characters[${i}] 不是对象`);
        continue;
      }
      if (!c.name || typeof c.name !== 'string') {
        errors.push(`characters[${i}] 缺少 name`);
        continue;
      }
      if (!isNumberArray(c.position, 3)) {
        errors.push(`characters[${i}] position 必须是 [x,y,z] 数字数组`);
        continue;
      }
      const rotation = isNumberArray(c.rotation, 3) ? c.rotation : [0, 0, 0];
      characters.push({
        characterId: typeof c.characterId === 'string' ? c.characterId : undefined,
        name: c.name,
        position: c.position.map((n: number) => clamp(n, POSITION_BOUNDS.min, POSITION_BOUNDS.max)) as [number, number, number],
        rotation: rotation.map((n: number) => clamp(n, ROTATION_BOUNDS.min, ROTATION_BOUNDS.max)) as [number, number, number],
        scale: isNumberArray(c.scale ?? [], 3) ? (c.scale as number[]).map((n: number) => clamp(n, 0.01, 10)) as [number, number, number] : undefined,
        posePresetId: typeof c.posePresetId === 'string' ? c.posePresetId : undefined,
      });
    }
  }

  // 校验 camera
  const cameraRaw = raw.camera as Record<string, unknown> | undefined;
  if (!cameraRaw || !isNumberArray(cameraRaw.position, 3) || !isNumberArray(cameraRaw.target, 3)) {
    errors.push('camera 需要 position 和 target 数组');
  }

  const posArr: number[] = Array.isArray(cameraRaw?.position) ? cameraRaw!.position : [0, 1.6, 5];
  const tgtArr: number[] = Array.isArray(cameraRaw?.target) ? cameraRaw!.target : [0, 1.6, 0];
  const camera: Director3dCameraPose = {
    position: posArr.map((n) => clamp(Number(n) || 0, POSITION_BOUNDS.min, POSITION_BOUNDS.max)) as [number, number, number],
    target: tgtArr.map((n) => clamp(Number(n) || 0, POSITION_BOUNDS.min, POSITION_BOUNDS.max)) as [number, number, number],
    fov: typeof cameraRaw?.fov === 'number' ? clamp(cameraRaw.fov, FOV_BOUNDS.min, FOV_BOUNDS.max) : 50,
  };

  if (characters.length === 0 && errors.length === 0) {
    errors.push('至少需要一个角色');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    command: { version: 1, characters, camera, lookAt: typeof raw.lookAt === 'string' ? raw.lookAt : undefined },
    errors: [],
  };
}

export function poseCommandSummary(command: Director3dPoseCommand): string {
  const charSummary = command.characters.map((c) => c.name).join(', ');
  const cameraSummary = `cam at [${command.camera.position.map((n) => n.toFixed(1)).join(',')}]`;
  return `${charSummary} · ${cameraSummary}`;
}
