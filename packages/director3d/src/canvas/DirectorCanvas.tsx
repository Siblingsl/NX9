import { Suspense, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, PerspectiveCamera, View } from '@react-three/drei';
import type { PerspectiveCamera as PerspectiveCameraType, WebGLRenderer } from 'three';
import { Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useDirectorStore, type StageQuadPane } from '../store/directorStore';
import { captureViewport } from '../io/capture';
import { getCameraViewFromShot } from '../schema/cameraGeometry';
import { SceneContent } from './SceneContent';

export interface DirectorCanvasProps {
  performanceMode?: 'normal' | 'low';
  onCaptureReady?: (capture: () => string) => void;
  nodeCount?: number;
  onRendererReady?: (renderer: { dispose: () => void }) => void;
  onGLCreated?: (gl: WebGLRenderer) => void;
  onContextLost?: () => void;
  viewMode?: 'director' | 'camera';
  lineArtUrl?: string;
  compareMode?: boolean;
  diagnosticMode?: boolean;
  /** Tab hidden: pause frameloop but keep GL + scissor Views mounted (never dispose). */
  renderPaused?: boolean;
}

function FlyRig({ enabled }: { enabled: boolean }) {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const velocity = useRef(new Vector3());
  const look = useRef({ active: false, lastX: 0, lastY: 0 });

  useLayoutEffect(() => {
    if (!enabled) return;
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      keys.current[e.code] = true;
      if (e.code === 'KeyF') useDirectorStore.getState().frameSelection();
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [enabled]);

  useLayoutEffect(() => {
    if (!enabled) return;
    const el = gl.domElement;
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 2) return;
      look.current = { active: true, lastX: e.clientX, lastY: e.clientY };
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!look.current.active) return;
      const dx = e.clientX - look.current.lastX;
      const dy = e.clientY - look.current.lastY;
      look.current.lastX = e.clientX;
      look.current.lastY = e.clientY;
      camera.rotation.order = 'YXZ';
      camera.rotation.y -= dx * 0.0025;
      camera.rotation.x -= dy * 0.0025;
      camera.rotation.x = Math.max(-1.2, Math.min(1.2, camera.rotation.x));
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 2) return;
      look.current.active = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('contextmenu', onContextMenu);
    return () => {
      look.current.active = false;
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('contextmenu', onContextMenu);
    };
  }, [enabled, gl, camera]);

  useFrame((_, dt) => {
    if (!enabled) return;
    const speed = (keys.current.ShiftLeft || keys.current.ShiftRight ? 8 : 3.2) * dt;
    const forward = new Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    else forward.normalize();
    const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();
    velocity.current.set(0, 0, 0);
    if (keys.current.KeyW) velocity.current.add(forward);
    if (keys.current.KeyS) velocity.current.sub(forward);
    if (keys.current.KeyA) velocity.current.sub(right);
    if (keys.current.KeyD) velocity.current.add(right);
    if (keys.current.KeyQ) velocity.current.y -= 1;
    if (keys.current.KeyE) velocity.current.y += 1;
    if (velocity.current.lengthSq() > 0) {
      velocity.current.normalize().multiplyScalar(speed);
      camera.position.add(velocity.current);
    }
  });

  return null;
}

function ShotCamera({ viewMode }: { viewMode: 'director' | 'camera' }) {
  const project = useDirectorStore((s) => s.project);
  const active = project.cameras.find((c) => c.id === project.activeCameraId) ?? project.cameras[0];
  const camRef = useRef<PerspectiveCameraType>(null);

  useLayoutEffect(() => {
    if (viewMode !== 'camera' || !active || !camRef.current) return;
    const snap = getCameraViewFromShot(active);
    camRef.current.position.set(...snap.position);
    camRef.current.fov = active.fov;
    camRef.current.lookAt(...snap.target);
    camRef.current.updateProjectionMatrix();
  }, [viewMode, active]);

  if (viewMode === 'camera' && active) {
    const snap = getCameraViewFromShot(active);
    return <PerspectiveCamera ref={camRef} makeDefault position={snap.position} fov={active.fov} />;
  }
  return <PerspectiveCamera makeDefault position={[4, 3, 6]} fov={50} />;
}

function ViewportScene({
  viewMode,
  interactionMode,
  controlsRef,
  ortho,
  interactive,
}: {
  viewMode: 'director' | 'camera';
  interactionMode: 'navigate' | 'subject' | 'camera';
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  ortho?: 'top' | 'left' | 'right';
  interactive: boolean;
}) {
  const fly = interactive && interactionMode === 'navigate' && !ortho && viewMode === 'director';
  const subject = interactionMode === 'subject';
  return (
    <>
      {ortho === 'top' ? (
        <OrthographicCamera makeDefault position={[0, 14, 0]} zoom={40} near={0.1} far={200} up={[0, 0, -1]} />
      ) : ortho === 'left' ? (
        <OrthographicCamera makeDefault position={[-14, 1.4, 0]} zoom={40} near={0.1} far={200} />
      ) : ortho === 'right' ? (
        <OrthographicCamera makeDefault position={[14, 1.4, 0]} zoom={40} near={0.1} far={200} />
      ) : (
        <ShotCamera viewMode={viewMode} />
      )}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        enableRotate={interactive && !ortho && !fly && !subject}
        enablePan={interactive && (!subject || Boolean(ortho))}
        enabled={interactive && (!subject || Boolean(ortho))}
        maxPolarAngle={Math.PI * 0.495}
      />
      <FlyRig enabled={fly} />
      <SceneContent controlsRef={controlsRef} />
    </>
  );
}

function bindGlLifecycle(
  gl: WebGLRenderer,
  scene: import('three').Scene,
  onGLCreated?: (gl: WebGLRenderer) => void,
  onCaptureReady?: (capture: () => string) => void,
  onRendererReady?: (renderer: { dispose: () => void }) => void,
  onContextLost?: () => void,
) {
  gl.setClearColor('#0f1115');
  const canvas = gl.domElement;
  const onLost = (event: Event) => {
    event.preventDefault();
    onContextLost?.();
  };
  canvas.addEventListener('webglcontextlost', onLost, false);
  onGLCreated?.(gl);
  onCaptureReady?.(() => captureViewport(gl));
  onRendererReady?.({
    dispose: () => {
      canvas.removeEventListener('webglcontextlost', onLost, false);
      scene.traverse((child) => {
        const obj = child as import('three').Mesh;
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      gl.dispose();
    },
  });
}

const QUAD_PANES: { id: StageQuadPane; label: string }[] = [
  { id: 'camera', label: '机位' },
  { id: 'top', label: '顶视' },
  { id: 'left', label: '左视' },
  { id: 'right', label: '右视' },
];

export function listQuadPanes(): typeof QUAD_PANES {
  return QUAD_PANES;
}

export function DirectorCanvas({
  performanceMode = 'normal',
  onCaptureReady,
  nodeCount = 0,
  onRendererReady,
  onGLCreated,
  onContextLost,
  viewMode: viewModeProp,
  lineArtUrl,
  compareMode,
  diagnosticMode,
  renderPaused = false,
}: DirectorCanvasProps) {
  const storeViewMode = useDirectorStore((s) => s.viewMode);
  const viewMode = viewModeProp ?? storeViewMode;
  const interactionMode = useDirectorStore((s) => s.interactionMode);
  const viewportLayout = useDirectorStore((s) => s.viewportLayout);
  const activeQuadPane = useDirectorStore((s) => s.activeQuadPane);
  const setActiveQuadPane = useDirectorStore((s) => s.setActiveQuadPane);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const topControlsRef = useRef<OrbitControlsImpl | null>(null);
  const leftControlsRef = useRef<OrbitControlsImpl | null>(null);
  const rightControlsRef = useRef<OrbitControlsImpl | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const camTrack = useRef<HTMLDivElement>(null);
  const topTrack = useRef<HTMLDivElement>(null);
  const leftTrack = useRef<HTMLDivElement>(null);
  const rightTrack = useRef<HTMLDivElement>(null);
  const [tracksReady, setTracksReady] = useState(false);
  const shadowsOff = performanceMode === 'low' || nodeCount >= 80;
  const dpr = performanceMode === 'low' ? 1 : Math.min(window.devicePixelRatio, 1.5);
  const quad = viewportLayout === 'quad';
  const frameloop = renderPaused ? 'never' : 'always';

  const refreshTracks = useCallback(() => {
    const ready = Boolean(camTrack.current && topTrack.current && leftTrack.current && rightTrack.current);
    setTracksReady((prev) => (prev === ready ? prev : ready));
  }, []);

  useLayoutEffect(() => {
    if (!quad) {
      setTracksReady(false);
      return;
    }
    refreshTracks();
    const id = requestAnimationFrame(refreshTracks);
    return () => cancelAnimationFrame(id);
  }, [quad, refreshTracks]);

  const focusPane = (pane: StageQuadPane) => {
    setActiveQuadPane(pane);
  };

  return (
    <div
      ref={wrapRef}
      className={`nx9-stage-canvas-wrap${quad ? ' is-quad' : ''}${renderPaused ? ' is-paused' : ''}`}
      data-persist-gl="1"
    >
      {quad ? (
        <>
          <div
            ref={(el) => {
              (camTrack as React.MutableRefObject<HTMLDivElement | null>).current = el;
              refreshTracks();
            }}
            className={`nx9-stage-view-track${activeQuadPane === 'camera' ? ' is-active' : ''}`}
            data-label="机位"
            data-pane="camera"
            onPointerDownCapture={() => focusPane('camera')}
          />
          <div
            ref={(el) => {
              (topTrack as React.MutableRefObject<HTMLDivElement | null>).current = el;
              refreshTracks();
            }}
            className={`nx9-stage-view-track${activeQuadPane === 'top' ? ' is-active' : ''}`}
            data-label="顶视"
            data-pane="top"
            onPointerDownCapture={() => focusPane('top')}
          />
          <div
            ref={(el) => {
              (leftTrack as React.MutableRefObject<HTMLDivElement | null>).current = el;
              refreshTracks();
            }}
            className={`nx9-stage-view-track${activeQuadPane === 'left' ? ' is-active' : ''}`}
            data-label="左视"
            data-pane="left"
            onPointerDownCapture={() => focusPane('left')}
          />
          <div
            ref={(el) => {
              (rightTrack as React.MutableRefObject<HTMLDivElement | null>).current = el;
              refreshTracks();
            }}
            className={`nx9-stage-view-track${activeQuadPane === 'right' ? ' is-active' : ''}`}
            data-label="右视"
            data-pane="right"
            onPointerDownCapture={() => focusPane('right')}
          />
          {tracksReady && wrapRef.current && (
            <Canvas
              className="nx9-stage-canvas"
              dpr={dpr}
              shadows={!shadowsOff}
              frameloop={frameloop}
              eventSource={wrapRef.current}
              eventPrefix="client"
              gl={{
                antialias: !shadowsOff,
                preserveDrawingBuffer: true,
                powerPreference: 'high-performance',
              }}
              onCreated={({ gl, scene }) =>
                bindGlLifecycle(gl, scene, onGLCreated, onCaptureReady, onRendererReady, onContextLost)
              }
            >
              <Suspense fallback={null}>
                <View track={camTrack as React.MutableRefObject<HTMLElement>}>
                  <color attach="background" args={['#0f1115']} />
                  <ViewportScene
                    viewMode="camera"
                    interactionMode={interactionMode}
                    controlsRef={controlsRef}
                    interactive={activeQuadPane === 'camera'}
                  />
                </View>
                <View track={topTrack as React.MutableRefObject<HTMLElement>}>
                  <color attach="background" args={['#0f1115']} />
                  <ViewportScene
                    viewMode="director"
                    interactionMode="subject"
                    controlsRef={topControlsRef}
                    ortho="top"
                    interactive={activeQuadPane === 'top'}
                  />
                </View>
                <View track={leftTrack as React.MutableRefObject<HTMLElement>}>
                  <color attach="background" args={['#0f1115']} />
                  <ViewportScene
                    viewMode="director"
                    interactionMode="subject"
                    controlsRef={leftControlsRef}
                    ortho="left"
                    interactive={activeQuadPane === 'left'}
                  />
                </View>
                <View track={rightTrack as React.MutableRefObject<HTMLElement>}>
                  <color attach="background" args={['#0f1115']} />
                  <ViewportScene
                    viewMode="director"
                    interactionMode="subject"
                    controlsRef={rightControlsRef}
                    ortho="right"
                    interactive={activeQuadPane === 'right'}
                  />
                </View>
              </Suspense>
            </Canvas>
          )}
        </>
      ) : (
        <Canvas
          className="nx9-stage-canvas"
          dpr={dpr}
          shadows={!shadowsOff}
          frameloop={frameloop}
          gl={{
            antialias: !shadowsOff,
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance',
          }}
          onCreated={({ gl, scene }) =>
            bindGlLifecycle(gl, scene, onGLCreated, onCaptureReady, onRendererReady, onContextLost)
          }
        >
          <Suspense fallback={null}>
            <ViewportScene
              viewMode={viewMode}
              interactionMode={interactionMode}
              controlsRef={controlsRef}
              interactive
            />
          </Suspense>
        </Canvas>
      )}
      {compareMode && lineArtUrl && (
        <img className="nx9-stage-line-art-overlay" src={lineArtUrl} alt="线稿构图参考" />
      )}
      {diagnosticMode && <div className="nx9-stage-diagnostic">诊断：对象与机位数据来自当前镜头状态</div>}
      {interactionMode === 'navigate' && !quad && (
        <div className="nx9-stage-nav-hint">WASD 移动 · 右键环顾 · Q/E 升降 · Shift 加速 · F 框选主体</div>
      )}
      {interactionMode === 'subject' && !quad && (
        <div className="nx9-stage-nav-hint">主体模式：拖拽物体在地面平移 · 仍可用 gizmo 精调</div>
      )}
      {quad && (
        <div className="nx9-stage-nav-hint">四视口：点选激活窗格 · 顶/侧视可摆位 · 机位窗看镜头</div>
      )}
    </div>
  );
}
