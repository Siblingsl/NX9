import { Grid, Html, OrbitControls, PerspectiveCamera, TransformControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Group } from 'three';
import { MathUtils, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type {
  CharacterBodyType,
  DirectorCameraShot,
  DirectorLight,
  DirectorObject,
  GeometryPrimitiveType,
} from '../schema/directorProject';
import { getCameraViewFromShot } from '../schema/cameraGeometry';
import { defaultLightingFallback, lightPosition } from '../presets/lightingPresets';
import { useDirectorStore } from '../store/directorStore';
import { StageActor } from '../runtime/StageActor';
import { ImportedMesh } from '../runtime/ImportedMesh';
import { BuiltinPropMesh } from '../runtime/BuiltinPropMesh';
import { PanoramaBackground } from '../runtime/PanoramaBackground';
import { clearAssetLoaderCache } from '../loaders/clearAssetLoader';

class AssetLoadBoundary extends React.Component<
  { label: string; url: string; children: React.ReactNode },
  { failed: boolean; nonce: number }
> {
  state = { failed: false, nonce: 0 };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  retry = () => {
    clearAssetLoaderCache(this.props.url);
    this.setState((current) => ({ failed: false, nonce: current.nonce + 1 }));
  };

  render() {
    if (this.state.failed) {
      return (
        <Html center>
          <div style={{ padding: 10, borderRadius: 8, background: 'rgba(20, 20, 24, .9)', color: '#fff', fontSize: 11, whiteSpace: 'nowrap' }}>
            {this.props.label}加载失败
            <button type="button" style={{ marginLeft: 8 }} onClick={this.retry}>重试</button>
          </div>
        </Html>
      );
    }
    return <React.Fragment key={this.state.nonce}>{this.props.children}</React.Fragment>;
  }
}

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

/**
 * 单盏场景灯。球坐标 → 世界坐标由 presets/lightingPresets 统一换算，
 * 保证灯光面板里的读数与画面里的实际灯位一致。
 *
 * 点光源与聚光灯使用 decay=0（常量衰减）：面板上同一根 intensity 滑块
 * 在方向光 / 点光 / 聚光灯下量纲一致，便于按预置数值复现布光。
 */
function SceneLight({ light }: { light: DirectorLight }) {
  const position = lightPosition(light);
  switch (light.type) {
    case 'ambient':
      return <ambientLight intensity={light.intensity} color={light.color} />;
    case 'spot':
      return (
        <spotLight
          position={position}
          color={light.color}
          intensity={light.intensity}
          /* coneAngle 为全锥角（度），three 需要半角（弧度） */
          angle={MathUtils.degToRad(Math.min(90, Math.max(2, light.coneAngle ?? 45)) / 2)}
          penumbra={light.penumbra ?? 0.4}
          decay={0}
          castShadow={light.castShadow}
        />
      );
    case 'point':
      return (
        <pointLight
          position={position}
          color={light.color}
          intensity={light.intensity}
          decay={0}
          castShadow={light.castShadow}
        />
      );
    default:
      return (
        <directionalLight
          position={position}
          color={light.color}
          intensity={light.intensity}
          castShadow={light.castShadow}
        />
      );
  }
}

/**
 * 场景灯光组：按 project.scene.lights 渲染；灯光被清空时回退默认两灯
 * （老版本硬编码的环境基线 + 主光），保证任何路径下画面都不会全黑。
 */
function LightingRig() {
  const lights = useDirectorStore((s) => s.project.scene.lights);
  const ambientIntensity = useDirectorStore((s) => s.project.scene.ambientIntensity);
  const hasRig = lights.length > 0;
  const fallback = useMemo(() => defaultLightingFallback(), []);
  const rig = hasRig ? lights : fallback.lights;
  const ambient = hasRig ? ambientIntensity : fallback.ambientIntensity;
  return (
    <>
      {ambient > 0 && <ambientLight intensity={ambient} />}
      {rig.filter((light) => light.visible).map((light) => (
        <SceneLight key={light.id} light={light} />
      ))}
    </>
  );
}

/** 曝光联动：toneMappingExposure 只在 r3f 已启用 tone mapping 时生效。 */
function ExposureSync() {
  const exposure = useDirectorStore((s) => s.project.scene.exposure);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (typeof exposure !== 'number' || !Number.isFinite(exposure)) return;
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);
  return null;
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
  const interactionMode = useDirectorStore((s) => s.interactionMode);
  const updateTransform = useDirectorStore((s) => s.updateObjectTransform);
  const dragging = useRef(false);
  const planeY = useRef(0);
  const { gl, camera } = useThree();

  useEffect(() => {
    if (interactionMode !== 'subject') {
      dragging.current = false;
      gl.domElement.style.cursor = '';
    }
  }, [interactionMode, gl]);

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

  const subjectDrag = interactionMode === 'subject' && !object.locked;

  const projectToGround = (clientX: number, clientY: number) => {
    const rect = gl.domElement.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    const from = new Vector3(ndcX, ndcY, 0).unproject(camera);
    const to = new Vector3(ndcX, ndcY, 1).unproject(camera);
    const dir = to.sub(from).normalize();
    if (Math.abs(dir.y) < 1e-6) return null;
    const t = (planeY.current - from.y) / dir.y;
    if (t < 0) return null;
    return {
      x: from.x + dir.x * t,
      z: from.z + dir.z * t,
    };
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
        onPointerDown={(e) => {
          if (!subjectDrag) return;
          e.stopPropagation();
          onSelect();
          dragging.current = true;
          planeY.current = groupRef.current?.position.y ?? py;
          gl.domElement.style.cursor = 'grabbing';
          const onMove = (ev: PointerEvent) => {
            if (!dragging.current || !groupRef.current) return;
            const hit = projectToGround(ev.clientX, ev.clientY);
            if (!hit) return;
            groupRef.current.position.x = hit.x;
            groupRef.current.position.z = hit.z;
            sync();
          };
          const onUp = () => {
            dragging.current = false;
            gl.domElement.style.cursor = '';
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
          };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        }}
      >
        {object.kind === 'character' ? (
          <StageActor
            color={object.color}
            bodyType={object.bodyType as CharacterBodyType}
            posePresetId={object.posePresetId}
            poseJoints={object.poseJoints}
            faceRig={object.faceRig}
          />
        ) : object.kind === 'mesh' && object.meshUrl ? (
          <AssetLoadBoundary label={object.name} url={object.meshUrl}><ImportedMesh url={object.meshUrl} /></AssetLoadBoundary>
        ) : object.builtinAssetId ? (
          <BuiltinPropMesh assetId={object.builtinAssetId} />
        ) : (
          <PropMesh type={object.geometryType ?? 'box'} color={object.color ?? '#888'} />
        )}
      </group>
      <ObjectGizmo
        groupRef={groupRef}
        enabled={selected && !object.locked && interactionMode !== 'navigate'}
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
  const [rx, ry, rz] = camera.transform.rotation;

  return (
    <>
      <group
        ref={groupRef}
        position={[px, py, pz]}
        rotation={[rx, ry, rz].map((d) => MathUtils.degToRad(d)) as [number, number, number]}
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
           updateTransform(camera.id, {
             position: [g.position.x, g.position.y, g.position.z],
             rotation: [
               MathUtils.radToDeg(g.rotation.x),
               MathUtils.radToDeg(g.rotation.y),
               MathUtils.radToDeg(g.rotation.z),
             ],
           });
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
        <AssetLoadBoundary label="全景图" url={project.panorama.url}><PanoramaBackground url={project.panorama.url} yaw={project.panorama.yaw} /></AssetLoadBoundary>
      )}
      <LightingRig />
      <ExposureSync />
      {project.scene.showGrid && (
        <Grid args={[24, 24]} cellSize={0.5} sectionSize={2} fadeDistance={28} position={[0, 0, 0]} />
      )}
      {project.scene.showGround && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.01, 0]}>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial color="#1e2430" transparent opacity={project.scene.groundOpacity} />
        </mesh>
      )}

      {project.objects.length === 0 && (
        <Html center>
          <div style={{ padding: 12, borderRadius: 10, background: 'rgba(20, 20, 24, .88)', color: '#fff', fontSize: 11, textAlign: 'center', width: 220 }}>
            当前镜头还没有角色或道具
            <br />
            请从镜头列表载入角色，或使用“添加”创建占位演员。
          </div>
        </Html>
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
