import { Suspense, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import type { WebGLRenderer } from 'three';
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
  onGLCreated?: (gl: WebGLRenderer) => void;
  onContextLost?: () => void;
  viewMode?: 'director' | 'camera';
  lineArtUrl?: string;
  compareMode?: boolean;
  diagnosticMode?: boolean;
}

export function DirectorCanvas({ performanceMode = 'normal', onCaptureReady, nodeCount = 0, onRendererReady, onGLCreated, onContextLost, viewMode: viewModeProp, lineArtUrl, compareMode, diagnosticMode }: DirectorCanvasProps) {
  const storeViewMode = useDirectorStore((s) => s.viewMode);
  const viewMode = viewModeProp ?? storeViewMode;
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const shadowsOff = performanceMode === 'low' || nodeCount >= 80;
  const dpr = performanceMode === 'low' ? 1 : Math.min(window.devicePixelRatio, 1.5);

  return (
    <div className="nx9-stage-canvas-wrap">
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
    {compareMode && lineArtUrl && <img className="nx9-stage-line-art-overlay" src={lineArtUrl} alt="线稿构图参考" />}
    {diagnosticMode && <div className="nx9-stage-diagnostic">诊断：对象与机位数据来自当前镜头状态</div>}
    </div>
  );
}
