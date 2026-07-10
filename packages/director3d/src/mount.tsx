import { createRoot, type Root } from 'react-dom/client';
import { Director3dShell } from './app/Director3dShell';
import type { Director3dHostOptions, Director3dMountHandle } from './bridge/types';

const roots = new WeakMap<HTMLElement, Root>();
const renderers = new Map<HTMLElement, { dispose: () => void }>();

export function mountDirector3d(
  container: HTMLElement,
  options: Director3dHostOptions,
): Director3dMountHandle {
  let root = roots.get(container);
  if (!root) {
    root = createRoot(container);
    roots.set(container, root);
  }

  const wrappedOptions: Director3dHostOptions = {
    ...options,
    onRendererReady: (renderer) => {
      renderers.set(container, renderer);
    },
  };

  root.render(<Director3dShell options={wrappedOptions} />);

  return {
    dispose() {
      const r = renderers.get(container);
      if (r) {
        r.dispose();
        renderers.delete(container);
      }
      root!.unmount();
      roots.delete(container);
      container.replaceChildren();
    },
  };
}
