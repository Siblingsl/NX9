import { MathUtils } from 'three';
import type { CharacterFaceRig } from '@nx9/shared';
import type { CharacterBodyType } from '../schema/directorProject';
import { lookupBody, lookupPose } from '../presets/characterPresets';
import { computeStageBodyScales } from './stage-body-bridge';

function deg(v: [number, number, number]) {
  return v.map((d) => MathUtils.degToRad(d)) as [number, number, number];
}

export function StageActor({
  color = '#5E4D8A',
  bodyType = 'neutral',
  posePresetId = 'stand',
  faceRig,
}: {
  color?: string;
  bodyType?: CharacterBodyType;
  posePresetId?: string;
  /** B4：捏模 faceRig.body → 舞台人偶比例桥接 */
  faceRig?: CharacterFaceRig;
}) {
  const body = lookupBody(bodyType);
  const pose = lookupPose(posePresetId);
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
