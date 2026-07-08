import { useMemo } from 'react';
import { useDirectorStore } from '../store/directorStore';
import type { ViewportAspectRatio } from '../schema/directorProject';

function aspectToRatio(r: ViewportAspectRatio): number {
  if (r === '9:16') return 9 / 16;
  if (r === '1:1') return 1;
  return 16 / 9;
}

export function AspectGuide() {
  const aspect = useDirectorStore((s) => s.project.viewportAspectRatio);
  const ruleOfThirds = useDirectorStore((s) => s.project.scene.ruleOfThirds);
  const ratio = useMemo(() => aspectToRatio(aspect), [aspect]);

  return (
    <>
      <div className="nx9-stage-aspect-guide">
        <div
          className="nx9-stage-aspect-frame"
          style={{
            width: ratio >= 1 ? 'min(92%, calc(82vh * ' + ratio + '))' : 'min(calc(82vh * ' + ratio + '), 92%)',
            aspectRatio: String(ratio),
          }}
        />
      </div>
      {ruleOfThirds && <div className="nx9-stage-thirds" />}
    </>
  );
}
