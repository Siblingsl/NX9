import { useEffect, useRef, useState } from 'react';
import {
  BackSide,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  SphereGeometry,
  TextureLoader,
  type Texture,
  WebGLRenderer,
  Vector3,
} from 'three';

export function isEquirectangularSize(width: number, height: number) {
  return width > 0 && height > 0 && width / height >= 1.85;
}

export function PanoramaViewer({ url, className }: { url: string; className?: string }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const container = viewportRef.current;
    if (!container) return;

    let disposed = false;
    let frame = 0;
    let longitude = 0;
    let latitude = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const fieldOfView = { value: 72 };
    let sphereTexture: Texture | null = null;
    const scene = new Scene();
    const camera = new PerspectiveCamera(fieldOfView.value, 1, 0.1, 1100);
    const renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    const textureLoader = new TextureLoader();
    const geometry = new SphereGeometry(50, 72, 48);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.className = 'nx9-panorama-viewer__canvas';
    container.append(renderer.domElement);

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const target = new Vector3();
    const render = () => {
      const phi = (90 - latitude) * (Math.PI / 180);
      const theta = longitude * (Math.PI / 180);
      target.set(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta),
      );
      camera.lookAt(target);
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(render);
    };

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const scale = fieldOfView.value / 720;
      longitude -= (event.clientX - lastX) * scale;
      latitude += (event.clientY - lastY) * scale;
      latitude = Math.max(-85, Math.min(85, latitude));
      lastX = event.clientX;
      lastY = event.clientY;
    };

    const onPointerEnd = (event: PointerEvent) => {
      dragging = false;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      fieldOfView.value = Math.max(
        34,
        Math.min(94, fieldOfView.value + event.deltaY * 0.045),
      );
      camera.fov = fieldOfView.value;
      camera.updateProjectionMatrix();
    };

    const activateTexture = () => {
      if (disposed) return;
      setStatus('ready');
      resize();
      frame = window.requestAnimationFrame(render);
    };

    textureLoader.load(
      url,
      (texture) => {
        if (disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = SRGBColorSpace;
        sphereTexture = texture;
        const material = new MeshBasicMaterial({
          map: texture,
          side: BackSide,
          toneMapped: false,
        });
        scene.add(new Mesh(geometry, material));
        activateTexture();
      },
      undefined,
      () => {
        if (!disposed) setStatus('error');
      },
    );

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerEnd);
    renderer.domElement.addEventListener('pointercancel', onPointerEnd);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerEnd);
      renderer.domElement.removeEventListener('pointercancel', onPointerEnd);
      renderer.domElement.removeEventListener('wheel', onWheel);
      const mesh = scene.children[0];
      if (mesh instanceof Mesh) {
        mesh.material.dispose();
      }
      geometry.dispose();
      sphereTexture?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [url]);

  return (
    <div className={['nx9-panorama-viewer', className].filter(Boolean).join(' ')}>
      <div className="nx9-panorama-viewer__viewport" ref={viewportRef} />
      {status === 'loading' ? <span className="nx9-panorama-viewer__overlay">全景加载中…</span> : null}
      {status === 'error' ? <span className="nx9-panorama-viewer__overlay">全景加载失败</span> : null}
      {status === 'ready' ? (
        <span className="nx9-panorama-viewer__hint">拖拽查看 · 滚轮缩放</span>
      ) : null}
    </div>
  );
}
