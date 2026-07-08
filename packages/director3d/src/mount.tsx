import { createRoot, type Root } from 'react-dom/client';
import { Director3dShell } from './app/Director3dShell';
import type { Director3dHostOptions, Director3dMountHandle } from './bridge/types';

const roots = new WeakMap<HTMLElement, Root>();

export function mountDirector3d(
  container: HTMLElement,
  options: Director3dHostOptions,
): Director3dMountHandle {
  let root = roots.get(container);
  if (!root) {
    root = createRoot(container);
    roots.set(container, root);
  }

  root.render(<Director3dShell options={options} />);

  return {
    dispose() {
      root!.unmount();
      roots.delete(container);
      container.replaceChildren();
    },
  };
}
