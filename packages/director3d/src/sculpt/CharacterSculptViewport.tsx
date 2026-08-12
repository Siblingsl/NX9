import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { CharacterFaceRig } from '@nx9/shared';
import { CharacterSculptScene } from './CharacterSculptScene';
import type { SculptCompatibilityReport } from './sculpt-contract';

export interface CharacterSculptViewportHandle {
  resetCamera: () => void;
  getCompatibilityReport: () => SculptCompatibilityReport | null;
}

export const CharacterSculptViewport = forwardRef<
  CharacterSculptViewportHandle,
  {
    faceRig: CharacterFaceRig;
    previewNeutral?: boolean;
    className?: string;
    onCompatibility?: (report: SculptCompatibilityReport) => void;
    onError?: (message: string) => void;
  }
>(function CharacterSculptViewport(
  { faceRig, previewNeutral = false, className, onCompatibility, onError },
  ref,
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CharacterSculptScene | null>(null);
  const callbacksRef = useRef({ onCompatibility, onError });
  callbacksRef.current = { onCompatibility, onError };

  useImperativeHandle(ref, () => ({
    resetCamera: () => sceneRef.current?.resetCamera(),
    getCompatibilityReport: () => sceneRef.current?.getCompatibilityReport() ?? null,
  }));

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let scene: CharacterSculptScene;
    try {
      scene = new CharacterSculptScene(
        el,
        { faceRig, previewNeutral },
        {
          onCompatibility: (r) => callbacksRef.current.onCompatibility?.(r),
          onError: (m) => callbacksRef.current.onError?.(m),
        },
      );
    } catch (err) {
      callbacksRef.current.onError?.(err instanceof Error ? err.message : String(err));
      return;
    }
    sceneRef.current = scene;

    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      scene.setSize(cr.width, cr.height);
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      scene.destroy();
      sceneRef.current = null;
    };
    // 只在挂载时创建 Scene；后续 faceRig 走 setState
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.setState({ faceRig, previewNeutral });
  }, [faceRig, previewNeutral]);

  return <div ref={mountRef} className={className} />;
});
