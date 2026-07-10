import { Grid, OrbitControls, PerspectiveCamera, TransformControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Group } from 'three';
import { MathUtils, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type {
  CharacterBodyType,
  DirectorCameraShot,
  DirectorObject,
  GeometryPrimitiveType,
} from '../schema/directorProject';
import { getCameraViewFromShot } from '../schema/cameraGeometry';
import { useDirectorStore } from '../store/directorStore';
import { StageActor } from '../runtime/StageActor';
import { ImportedMesh } from '../runtime/ImportedMesh';
import { PanoramaBackground } from '../runtime/PanoramaBackground';

function PropMesh({ type, color }: { type: GeometryPrimitiveType; color: string }) {
  const mat = <meshStandardMaterial color={color} />;
  switch (type) {
    case 'sphere':
      return (
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[0.5, 24, 24]} />
          {mat}
        </mesh>
      );
    case 'cylinder':
      return (
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[0.4, 0.4, 1, 24]} />
          {mat}
        </mesh>
      );
    case 'cone':
      return (
        <mesh castShadow receiveShadow>
          <coneGeometry args={[0.45, 1, 24]} />
          {mat}
        </mesh>
      );
    default:
      return (
        <mesh castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
          {mat}
        </mesh>
      );
  }
}

function ObjectGizmo({
  groupRef,
  enabled,
  mode,
  onChange,
}: {
  groupRef: React.RefObject<Group | null>;
  enabled: boolean;
  mode: 'translate' | 'rotate' | 'scale';
  onChange: () => void;
}) {
  const [target, setTarget] = useState<Group | null>(null);
  useLayoutEffect(() => {
    setTarget(groupRef.current);
  }, [groupRef, enabled]);
  if (!enabled || !target) return null;
  return <TransformControls object={target} mode={mode} onObjectChange={onChange} />;
}

function SceneObject({
  object,
  selected,
  onSelect,
}: {
  object: DirectorObject;
  selected: boolean;
  onSelect: () => void;
}) {
  const groupRef = useRef<Group>(null);
  const transformMode = useDirectorStore((s) => s.transformMode);
  const updateTransform = useDirectorStore((s) => s.updateObjectTransform);

  if (!object.visible) return null;

  const [px, py, pz] = object.transform.position;
  const [rx, ry, rz] = object.transform.rotation;
  const [sx, sy, sz] = object.transform.scale;

  const sync = () => {
    const g = groupRef.current;
    if (!g) return;
    updateTransform(object.id, {
      position: [g.position.x, g.position.y, g.position.z],
      rotation: [
        MathUtils.radToDeg(g.rotation.x),
        MathUtils.radToDeg(g.rotation.y),
        MathUtils.radToDeg(g.rotation.z),
      ],
      scale: [g.scale.x, g.scale.y, g.scale.z],
    });
  };

  return (
    <>
      <group
        ref={groupRef}
        position={[px, py, pz]}
        rotation={[rx, ry, rz].map((d) => MathUtils.degToRad(d)) as [number, number, number]}
        scale={[sx, sy, sz]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        {object.kind === 'character' ? (
          <StageActor
            color={object.color}
            bodyType={object.bodyType as CharacterBodyType}
            posePresetId={object.posePresetId}
          />
        ) : object.kind === 'mesh' && object.meshUrl ? (
          <ImportedMesh url={object.meshUrl} />
        ) : (
          <PropMesh type={object.geometryType ?? 'box'} color={object.color ?? '#888'} />
        )}
      </group>
      <ObjectGizmo
        groupRef={groupRef}
        enabled={selected && !object.locked}
        mode={transformMode}
        onChange={sync}
      />
    </>
  );
}

function CameraMarker({
  camera,
  selected,
  onSelect,
}: {
  camera: DirectorCameraShot;
  selected: boolean;
  onSelect: () => void;
}) {
  const groupRef = useRef<Group>(null);
  const transformMode = useDirectorStore((s) => s.transformMode);
  const updateTransform = useDirectorStore((s) => s.updateObjectTransform);
  const [px, py, pz] = camera.transform.position;

  return (
    <>
      <group
        ref={groupRef}
        position={[px, py, pz]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <mesh>
          <octahedronGeometry args={[0.22, 0]} />
          <meshStandardMaterial color="#A13D63" emissive="#A13D63" emissiveIntensity={0.35} />
        </mesh>
      </group>
      <ObjectGizmo
        groupRef={groupRef}
        enabled={selected}
        mode={transformMode}
        onChange={() => {
          const g = groupRef.current;
          if (!g) return;
          updateTransform(camera.id, { position: [g.position.x, g.position.y, g.position.z] });
        }}
      />
    </>
  );
}

function CameraViewSync({
  controlsRef,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const viewMode = useDirectorStore((s) => s.viewMode);
  const project = useDirectorStore((s) => s.project);
  const camera = useMemo(
    () => project.cameras.find((c) => c.id === project.activeCameraId),
    [project.cameras, project.activeCameraId],
  );

  useEffect(() => {
    const ctl = controlsRef.current;
    if (!ctl || viewMode !== 'camera' || !camera) return;
    const snap = getCameraViewFromShot(camera);
    ctl.object.position.set(...snap.position);
    ctl.target.set(...snap.target);
    ctl.update();
  }, [viewMode, camera, controlsRef]);

  return null;
}

export function SceneContent({
  controlsRef,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const project = useDirectorStore((s) => s.project);
  const selectedId = useDirectorStore((s) => s.selectedObjectId);
  const selectObject = useDirectorStore((s) => s.selectObject);
  const viewMode = useDirectorStore((s) => s.viewMode);

  return (
    <>
      {project.panorama?.url && (
        <PanoramaBackground url={project.panorama.url} yaw={project.panorama.yaw} />
      )}
      <ambientLight intensity={project.panorama ? 0.35 : 0.55} />
      <directionalLight position={[5, 10, 4]} intensity={0.9} castShadow />
      {project.scene.showGrid && (
        <Grid args={[24, 24]} cellSize={0.5} sectionSize={2} fadeDistance={28} position={[0, 0, 0]} />
      )}
      {project.scene.showGround && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.01, 0]}>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial color="#1e2430" transparent opacity={project.scene.groundOpacity} />
        </mesh>
      )}

      {project.objects.map((obj) => (
        <SceneObject
          key={obj.id}
          object={obj}
          selected={selectedId === obj.id}
          onSelect={() => selectObject(obj.id)}
        />
      ))}

      {viewMode === 'director' &&
        project.cameras.map((cam) => (
          <CameraMarker
            key={cam.id}
            camera={cam}
            selected={selectedId === cam.id}
            onSelect={() => selectObject(cam.id)}
          />
        ))}

      <CameraViewSync controlsRef={controlsRef} />
    </>
  );
}

export function ViewportCamera({ viewMode }: { viewMode: 'director' | 'camera' }) {
  const project = useDirectorStore((s) => s.project);
  const active = project.cameras.find((c) => c.id === project.activeCameraId);

  if (viewMode === 'camera' && active) {
    const snap = getCameraViewFromShot(active);
    return <PerspectiveCamera makeDefault position={snap.position} fov={active.fov} />;
  }

  return <PerspectiveCamera makeDefault position={[4, 3, 6]} fov={50} />;
}

export function CaptureBridge({ onGl }: { onGl: (gl: import('three').WebGLRenderer) => void }) {
  const { gl } = useThree();
  useEffect(() => {
    onGl(gl);
  }, [gl, onGl]);
  return null;
}

export function OrbitControlsWrapper({
  controlsRef,
  viewMode,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  viewMode: 'director' | 'camera';
}) {
  const project = useDirectorStore((s) => s.project);
  const target = useMemo(() => {
    if (viewMode === 'camera') {
      const cam = project.cameras.find((c) => c.id === project.activeCameraId);
      return cam ? new Vector3(...cam.target) : new Vector3(0, 1, 0);
    }
    return new Vector3(0, 1, 0);
  }, [viewMode, project.activeCameraId, project.cameras]);

  return <OrbitControls ref={controlsRef} makeDefault target={target} />;
}
