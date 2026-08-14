import { faceRigValue, type CharacterFaceRig } from '@nx9/shared';

export interface StageBodyScales {
  height: number;
  shoulder: number;
  torso: number;
  leg: number;
  neck: number;
  hand: number;
}

function unit(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(-1, v / 100));
}

/** B4：把捏模 faceRig.body 映射成导演台人偶的可见比例，与 sculpt BONE_DRIVERS 同 k 值。 */
export function computeStageBodyScales(rig: CharacterFaceRig | undefined): StageBodyScales {
  return {
    height: 1 + unit(faceRigValue(rig, 'heightFeel')) * 0.12,
    shoulder: 1 + unit(faceRigValue(rig, 'shoulderWidth')) * 0.18,
    torso: 1 + unit(faceRigValue(rig, 'torsoLength')) * 0.16,
    leg: 1 + unit(faceRigValue(rig, 'legRatio')) * 0.14,
    neck: 1 + unit(faceRigValue(rig, 'neckLength')) * 0.22,
    hand: 1 + unit(faceRigValue(rig, 'handSize')) * 0.2,
  };
}
