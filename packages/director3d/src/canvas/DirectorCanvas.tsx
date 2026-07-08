import { Suspense, useRef } from 'react';
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
}

export function DirectorCanvas({ performanceMode = 'normal', onCaptureReady }: DirectorCanvasProps) {
  const viewMode = useDirectorStore((s) => s.viewMode);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  return (
    <Canvas
      className="nx9-stage-canvas"
      shadows={performanceMode !== 'low'}
      gl={{
        antialias: performanceMode !== 'low',
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      }}
      onCreated={({ gl }) => {
        gl.setClearColor('#0f1115');
        onCaptureReady?.(() => captureViewport(gl));
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
