import { MathUtils, type Object3D } from 'three';
import type { PosePreset } from '../presets/characterPresets';
import { normalizeNodeName } from '../sculpt/sculpt-contract';

function collectNamed(root: Object3D): Map<string, Object3D> {
  const map = new Map<string, Object3D>();
  root.traverse((o) => {
    if (o.name) map.set(normalizeNodeName(o.name), o);
  });
  return map;
}

function setEulerDeg(node: Object3D | undefined, deg: [number, number, number]) {
  if (!node) return;
  node.rotation.set(
    MathUtils.degToRad(deg[0]),
    MathUtils.degToRad(deg[1]),
    MathUtils.degToRad(deg[2]),
  );
}

/**
 * P4：把导演台摆姿预设写到契约骨（与捏模 Armature 同名）。
 * 缺骨不抛，便于代理/正式模渐进覆盖。
 */
export function applyPoseToArmature(root: Object3D, pose: PosePreset): void {
  const named = collectNamed(root);
  setEulerDeg(named.get(normalizeNodeName('Root')) ?? named.get(normalizeNodeName('Hips')), pose.body);
  setEulerDeg(named.get(normalizeNodeName('Chest')) ?? named.get(normalizeNodeName('Spine')), pose.torso);
  setEulerDeg(named.get(normalizeNodeName('Head')), pose.head);
  setEulerDeg(named.get(normalizeNodeName('UpperArm.L')), pose.armL);
  setEulerDeg(named.get(normalizeNodeName('UpperArm.R')), pose.armR);
  setEulerDeg(named.get(normalizeNodeName('UpperLeg.L')), pose.legL);
  setEulerDeg(named.get(normalizeNodeName('UpperLeg.R')), pose.legR);
}
