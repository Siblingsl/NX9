import { useCallback, useEffect, useRef, useState } from 'react';
import type { Director3dHostOptions } from '../bridge/types';
import { DirectorCanvas } from '../canvas/DirectorCanvas';
import { normalizeDirectorProject } from '../schema/directorProject';
import { useDirectorStore } from '../store/directorStore';
import { StageHeader } from './StageHeader';
import { StageRail } from './StageRail';
import { TransformRail } from './TransformRail';
import { AspectGuide } from './AspectGuide';
import { InspectorCard } from './InspectorCard';
import { Filmstrip } from './Filmstrip';
import '../styles/stage-deck.css';

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function StageDeckShell({ options }: { options: Director3dHostOptions }) {
  const mode = options.performanceMode ?? 'normal';
  const captureFnRef = useRef<(() => string) | null>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    useDirectorStore.getState().replaceProject(normalizeDirectorProject(options.project));
  }, [options.project]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        useDirectorStore.getState().undo();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        useDirectorStore.getState().deleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const flush = debounce((project: ReturnType<typeof useDirectorStore.getState>['project']) => {
      options.onProjectChange?.(project);
    }, 800);
    return useDirectorStore.subscribe((state, prev) => {
      if (state.project !== prev.project) flush(state.project);
    });
  }, [options.onProjectChange]);

  const handleCapture = useCallback(() => {
    const fn = captureFnRef.current;
    if (!fn) return;
    setCapturing(true);
    requestAnimationFrame(() => {
      try {
        const dataUrl = fn();
        const capture = useDirectorStore.getState().addCapture(dataUrl);
        if (capture) {
          void options.onCapture?.({
            dataUrl,
            cameraPrompt: capture.cameraPrompt,
            captureId: capture.id,
          });
        }
      } finally {
        setCapturing(false);
      }
    });
  }, [options]);

  return (
    <div className="nx9-stage">
      <StageHeader
        linkedShotId={options.linkedShotId}
        performanceLow={mode === 'low'}
        capturing={capturing}
        onCapture={handleCapture}
        onClose={options.onClose}
      />
      <div className="nx9-stage-body">
        <StageRail onUploadFile={options.onUploadFile} onSaveSceneTemplate={options.onSaveSceneTemplate} />
        <div className="nx9-stage-workspace">
          <div className="nx9-stage-viewport-shell">
            <DirectorCanvas
              performanceMode={mode}
              onCaptureReady={(fn) => {
                captureFnRef.current = fn;
              }}
            />
            <TransformRail />
            <AspectGuide />
          </div>
          <Filmstrip />
        </div>
        <InspectorCard />
      </div>
    </div>
  );
}
