import { Suspense, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useDirectorStore } from '../store/directorStore';
import { captureViewport } from '../io/capture';
import {
  CaptureBridge,
  OrbitControlsWrapper,
  SceneContent,
  ViewportCamera,
} from './SceneContent';

export interface DirectorCanvasProps {
  performanceMode?: 'normal' | 'low';
  onCaptureReady?: (capture: () => string) => void;
  nodeCount?: number;
  onRendererReady?: (renderer: { dispose: () => void }) => void;
}

export function DirectorCanvas({ performanceMode = 'normal', onCaptureReady, nodeCount = 0, onRendererReady }: DirectorCanvasProps) {
  const viewMode = useDirectorStore((s) => s.viewMode);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const shadowsOff = performanceMode === 'low' || nodeCount >= 80;
  const dpr = performanceMode === 'low' ? 1 : Math.min(window.devicePixelRatio, 1.5);

  return (
    <Canvas
      className="nx9-stage-canvas"
      dpr={dpr}
      shadows={!shadowsOff}
      gl={{
        antialias: !shadowsOff,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor('#0f1115');
        onCaptureReady?.(() => captureViewport(gl));
        onRendererReady?.({
          dispose: () => {
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
      }}
    >
      <Suspense fallback={null}>
        <ViewportCamera viewMode={viewMode} />
        <OrbitControlsWrapper controlsRef={controlsRef} viewMode={viewMode} />
        <SceneContent controlsRef={controlsRef} />
        <CaptureBridge
          onGl={(gl) => {
            onCaptureReady?.(() => captureViewport(gl));
          }}
        />
      </Suspense>
    </Canvas>
  );
}
