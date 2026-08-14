import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { CharacterFaceRig } from '@nx9/shared';
import { CharacterSculptScene } from './CharacterSculptScene';
import type { CharacterModelLoadOutcome } from './CharacterSculptScene';
import type { SculptCameraPresetId } from './sculpt-cameras';
import type { SculptCompatibilityReport } from './sculpt-contract';

export interface CharacterSculptViewportHandle {
  resetCamera: () => void;
  /** P2：命名机位（F 正面 / S 侧面 / Q 四分之三 / B 背面 / body 全览） */
  setCameraPreset: (presetId: SculptCameraPresetId) => void;
  getCompatibilityReport: () => SculptCompatibilityReport | null;
  /** B2：正式基模加载（manifest 缺失时回退代理） */
  loadCharacterModel: (options?: { glbUrl?: string; manifestUrl?: string }) => Promise<CharacterModelLoadOutcome | undefined>;
  /** FACE-P3：规范机位定妆截图（固定像素），失败或不可用时返回 null */
  exportCanonicalImage: (rig?: CharacterFaceRig) => string | null;
}

export const CharacterSculptViewport = forwardRef<
  CharacterSculptViewportHandle,
  {
    faceRig: CharacterFaceRig;
    previewNeutral?: boolean;
    /** P2：对称联动开关（默认 true） */
    symmetric?: boolean;
    /** B2：正式基模 URL；缺省走 /director3d/models/nx9-character-base.glb */
    modelUrl?: string;
    manifestUrl?: string;
    className?: string;
    onCompatibility?: (report: SculptCompatibilityReport) => void;
    onError?: (message: string) => void;
    /** P2：控制点拖拽松手后回传最终 faceRig */
    onFaceRigCommit?: (rig: CharacterFaceRig) => void;
  }
>(function CharacterSculptViewport(
  { faceRig, previewNeutral = false, symmetric = true, modelUrl, manifestUrl, className, onCompatibility, onError, onFaceRigCommit },
  ref,
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CharacterSculptScene | null>(null);
  const callbacksRef = useRef({ onCompatibility, onError, onFaceRigCommit });
  callbacksRef.current = { onCompatibility, onError, onFaceRigCommit };

  useImperativeHandle(ref, () => ({
    resetCamera: () => sceneRef.current?.resetCamera(),
    setCameraPreset: (presetId) => sceneRef.current?.setCameraPreset(presetId),
    getCompatibilityReport: () => sceneRef.current?.getCompatibilityReport() ?? null,
    loadCharacterModel: (options) => sceneRef.current?.loadCharacterModel(options) ?? Promise.resolve(undefined),
    exportCanonicalImage: (rig?: CharacterFaceRig) => sceneRef.current?.exportCanonicalImage(rig) ?? null,
  }));

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let scene: CharacterSculptScene;
    try {
      scene = new CharacterSculptScene(
        el,
        { faceRig, previewNeutral, symmetric },
        {
          onCompatibility: (r) => callbacksRef.current.onCompatibility?.(r),
          onError: (m) => callbacksRef.current.onError?.(m),
          onFaceRigCommit: (r) => callbacksRef.current.onFaceRigCommit?.(r),
        },
      );
    } catch (err) {
      callbacksRef.current.onError?.(err instanceof Error ? err.message : String(err));
      return;
    }
    sceneRef.current = scene;
    void scene.loadCharacterModel({ glbUrl: modelUrl, manifestUrl }).catch((err) => {
      callbacksRef.current.onError?.(err instanceof Error ? err.message : String(err));
    });

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
    sceneRef.current?.setState({ faceRig, previewNeutral, symmetric });
  }, [faceRig, previewNeutral, symmetric]);

  return <div ref={mountRef} className={className} />;
});
