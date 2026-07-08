import { useLoader } from '@react-three/fiber';
import { Suspense } from 'react';
import { BackSide, TextureLoader } from 'three';

function PanoramaSphereInner({ url, yaw }: { url: string; yaw: number }) {
  const texture = useLoader(TextureLoader, url);
  return (
    <mesh rotation={[0, (yaw * Math.PI) / 180, 0]}>
      <sphereGeometry args={[48, 64, 32]} />
      <meshBasicMaterial map={texture} side={BackSide} toneMapped={false} />
    </mesh>
  );
}

export function PanoramaBackground({ url, yaw = 0 }: { url: string; yaw?: number }) {
  return (
    <Suspense fallback={null}>
      <PanoramaSphereInner url={url} yaw={yaw} />
    </Suspense>
  );
}
