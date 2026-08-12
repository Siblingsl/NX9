import {
  CapsuleGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';
import { createProxyHeadMesh } from './procedural-head';
import { CLAY_COLOR, MESH_NAMES } from './sculpt-contract';

function clayMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: CLAY_COLOR,
    roughness: 0.62,
    metalness: 0,
  });
}

/**
 * P1 代理身：分段组节点与骨骼契约同名。
 * 只实现 Root（身高感）与 Clavicle.L/R（肩宽）。不要为空 morph 占位。
 */
export function createProxyCharacter(): Group {
  const mat = clayMaterial();
  const character = new Group();
  character.name = MESH_NAMES.root;

  const armature = new Group();
  armature.name = MESH_NAMES.armature;

  const root = new Group();
  root.name = 'Root';

  const bodyGeo = new CapsuleGeometry(0.2, 0.72, 6, 14);
  const bodyMesh = new Mesh(bodyGeo, mat);
  bodyMesh.name = MESH_NAMES.body;
  bodyMesh.position.y = 0.92;
  root.add(bodyMesh);

  const makeClavicle = (side: 'L' | 'R') => {
    const clav = new Group();
    clav.name = `Clavicle.${side}`;
    clav.position.set(side === 'L' ? -0.26 : 0.26, 1.42, 0);
    const arm = new Mesh(new CapsuleGeometry(0.065, 0.32, 4, 10), mat);
    arm.rotation.z = side === 'L' ? Math.PI / 2.4 : -Math.PI / 2.4;
    arm.position.set(side === 'L' ? -0.16 : 0.16, -0.08, 0);
    clav.add(arm);
    return clav;
  };

  root.add(makeClavicle('L'), makeClavicle('R'));

  const head = createProxyHeadMesh();
  head.position.set(0, 1.7, 0);
  root.add(head);

  armature.add(root);
  character.add(armature);
  return character;
}

/** 单测用：有 HeadMesh 但无 morph，验证驱动器缺 morph 不抛。 */
export function createBareSculptRoot(): Group {
  const root = new Group();
  root.name = MESH_NAMES.root;
  const mesh = new Mesh(new SphereGeometry(0.1, 8, 8), clayMaterial());
  mesh.name = MESH_NAMES.head;
  root.add(mesh);
  return root;
}
