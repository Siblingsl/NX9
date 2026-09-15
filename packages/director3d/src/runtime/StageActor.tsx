import { Suspense, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { MathUtils, type Object3D } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { emptyFaceRig, type CharacterFaceRig } from '@nx9/shared';
import type { CharacterBodyType } from '../schema/directorProject';
import { lookupBody, mergePose, type PoseJointOverride } from '../presets/characterPresets';
import { applyFaceRigToObject } from '../sculpt/apply-face-rig';
import { loadCharacterModel, NX9_CHARACTER_BASE_GLB_URL } from '../sculpt/character-model-loader';
import { createCharacterBaseModel } from '../sculpt/procedural-base-model';
import { computeStageBodyScales } from './stage-body-bridge';
import { applyPoseToArmature } from './stage-actor-pose';

function deg(v: [number, number, number]) {
  return v.map((d) => MathUtils.degToRad(d)) as [number, number, number];
}

function cloneActorRoot(root: Object3D): Object3D {
  try {
    return cloneSkinned(root);
  } catch {
    return root.clone(true);
  }
}

/** 加载中 / 极端失败时的胶囊人偶，保证舞台永不空。 */
function CapsuleFallback({
  color = '#5E4D8A',
  bodyType = 'neutral',
  posePresetId = 'stand',
  poseJoints,
  faceRig,
}: {
  color?: string;
  bodyType?: CharacterBodyType;
  posePresetId?: string;
  poseJoints?: PoseJointOverride | null;
  faceRig?: CharacterFaceRig;
}) {
  const body = lookupBody(bodyType);
  const pose = mergePose(posePresetId, poseJoints);
  const s = computeStageBodyScales(faceRig);
  const mat = <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} />;

  return (
    <group
      scale={[body.scale[0], body.scale[1] * s.height, body.scale[2]]}
      position={[0, pose.offsetY ?? 0, 0]}
    >
      <group rotation={deg(pose.body)}>
        <group rotation={deg(pose.torso)}>
          <mesh position={[0, 0.95, 0]} scale={[1, s.torso, 1]}>
            <capsuleGeometry args={[0.18, 0.12, 6, 12]} />
            {mat}
          </mesh>
          <mesh position={[0, 1.38, 0]} scale={[1, s.torso, 1]}>
            <capsuleGeometry args={[0.22, 0.48, 6, 12]} />
            {mat}
          </mesh>
          <group rotation={deg(pose.head)} position={[0, 1.78 + (s.neck - 1) * 0.16, 0]} scale={s.neck}>
            <mesh>
              <sphereGeometry args={[0.17, 20, 20]} />
              {mat}
            </mesh>
          </group>
          <group rotation={deg(pose.armL)} position={[-0.34 * s.shoulder, 1.38, 0]} scale={[s.shoulder, 1, 1]}>
            <mesh position={[0, -0.22, 0]}>
              <capsuleGeometry args={[0.07, 0.36, 4, 8]} />
              {mat}
            </mesh>
            <mesh position={[0, -0.5, 0]} scale={s.hand}>
              <sphereGeometry args={[0.07, 12, 12]} />
              {mat}
            </mesh>
          </group>
          <group rotation={deg(pose.armR)} position={[0.34 * s.shoulder, 1.38, 0]} scale={[s.shoulder, 1, 1]}>
            <mesh position={[0, -0.22, 0]}>
              <capsuleGeometry args={[0.07, 0.36, 4, 8]} />
              {mat}
            </mesh>
            <mesh position={[0, -0.5, 0]} scale={s.hand}>
              <sphereGeometry args={[0.07, 12, 12]} />
              {mat}
            </mesh>
          </group>
        </group>
        <group rotation={deg(pose.legL)} position={[-0.11, 0.82, 0]}>
          <mesh position={[0, -0.28, 0]} scale={[1, s.leg, 1]}>
            <capsuleGeometry args={[0.08, 0.42, 4, 8]} />
            {mat}
          </mesh>
        </group>
        <group rotation={deg(pose.legR)} position={[0.11, 0.82, 0]}>
          <mesh position={[0, -0.28, 0]} scale={[1, s.leg, 1]}>
            <capsuleGeometry args={[0.08, 0.42, 4, 8]} />
            {mat}
          </mesh>
        </group>
      </group>
    </group>
  );
}

function BuiltinStageActor({
  color = '#5E4D8A',
  bodyType = 'neutral',
  posePresetId = 'stand',
  poseJoints,
  faceRig,
}: {
  color?: string;
  bodyType?: CharacterBodyType;
  posePresetId?: string;
  poseJoints?: PoseJointOverride | null;
  faceRig?: CharacterFaceRig;
}) {
  const body = lookupBody(bodyType);
  const [actor, setActor] = useState<Object3D | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadCharacterModel({
      glbUrl: NX9_CHARACTER_BASE_GLB_URL,
      // 舞台需要完整 Armature 才能写摆姿骨；瘦身 proxy 缺 UpperArm 等骨
      fallback: createCharacterBaseModel,
    }).then((result) => {
      if (cancelled) return;
      setActor(cloneActorRoot(result.root));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const liveRig = useMemo(() => faceRig ?? emptyFaceRig(), [faceRig]);

  useLayoutEffect(() => {
    if (!actor) return;
    const pose = mergePose(posePresetId, poseJoints);
    // 体型由 applyFaceRigToObject 写骨比例；外层只保留 bodyType 基础缩放，禁止再叠 computeStageBodyScales
    applyFaceRigToObject(actor, liveRig);
    applyPoseToArmature(actor, pose);
  }, [actor, liveRig, posePresetId, poseJoints]);

  if (!actor) {
    return (
      <CapsuleFallback
        color={color}
        bodyType={bodyType}
        posePresetId={posePresetId}
        poseJoints={poseJoints}
        faceRig={faceRig}
      />
    );
  }

  const pose = mergePose(posePresetId, poseJoints);

  return (
    <group scale={[body.scale[0], body.scale[1], body.scale[2]]} position={[0, pose.offsetY ?? 0, 0]}>
      <primitive object={actor} />
    </group>
  );
}

/**
 * 导演台角色：优先正式基模 / 契约代理（捏模同款），加载前用胶囊占位。
 * faceRig 驱动 morph + 骨比例；摆姿写到 Armature 同名骨。
 */
export function StageActor(props: {
  color?: string;
  bodyType?: CharacterBodyType;
  posePresetId?: string;
  poseJoints?: PoseJointOverride | null;
  faceRig?: CharacterFaceRig;
}) {
  return (
    <Suspense
      fallback={
        <CapsuleFallback
          color={props.color}
          bodyType={props.bodyType}
          posePresetId={props.posePresetId}
          poseJoints={props.poseJoints}
          faceRig={props.faceRig}
        />
      }
    >
      <BuiltinStageActor {...props} />
    </Suspense>
  );
}
