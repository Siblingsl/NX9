import { Suspense, useMemo } from 'react';
import { Box3, BufferGeometry, Vector3 } from 'three';
import { useGltf } from '../loaders/gltfLoader';
import { useObj } from '../loaders/objLoader';
import { useFbx } from '../loaders/fbxLoader';

const TRI_WARN = 100_000;
const TRI_REJECT = 500_000;

function countTriangles(root: import('three').Object3D): number {
  let total = 0;
  root.traverse((child) => {
    const geo = (child as import('three').Mesh).geometry;
    if (geo && geo instanceof BufferGeometry) {
      const idx = geo.index;
      if (idx) total += idx.count / 3;
      else if (geo.attributes.position) total += geo.attributes.position.count / 3;
    }
  });
  return Math.round(total);
}

function checkTriangles(root: import('three').Object3D, label: string) {
  const tri = countTriangles(root);
  if (tri > TRI_REJECT) {
    throw new Error(`${label}: 三角面数 ${tri} 超过上限 ${TRI_REJECT}，已拒绝加载`);
  }
  if (tri > TRI_WARN) {
    console.warn(`${label}: 三角面数 ${tri} 超过警告阈值 ${TRI_WARN}，可能影响性能`);
  }
  return root;
}

function normalizeScene(scene: import('three').Object3D) {
  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const max = Math.max(size.x, size.y, size.z);
  const scale = max > 0 ? 2 / max : 1;
  const center = box.getCenter(new Vector3());
  scene.position.sub(center.multiplyScalar(scale));
  scene.scale.setScalar(scale);
  return scene;
}

function GltfMesh({ url }: { url: string }) {
  const gltf = useGltf(url);
  const scene = useMemo(() => {
    const cloned = gltf.scene.clone();
    checkTriangles(cloned, url);
    return normalizeScene(cloned);
  }, [gltf.scene, url]);
  return <primitive object={scene} />;
}

function ObjMesh({ url }: { url: string }) {
  const obj = useObj(url);
  const scene = useMemo(() => {
    const cloned = obj.clone();
    checkTriangles(cloned, url);
    return normalizeScene(cloned);
  }, [obj, url]);
  return <primitive object={scene} />;
}

function FbxMesh({ url }: { url: string }) {
  const fbx = useFbx(url);
  const scene = useMemo(() => {
    const cloned = fbx.clone();
    checkTriangles(cloned, url);
    return normalizeScene(cloned);
  }, [fbx, url]);
  return <primitive object={scene} />;
}

export function ImportedMesh({ url }: { url: string }) {
  const lower = url.toLowerCase();
  return (
    <Suspense
      fallback={
        <mesh>
          <boxGeometry args={[0.4, 0.4, 0.4]} />
          <meshStandardMaterial color="#64748b" wireframe />
        </mesh>
      }
    >
      {lower.endsWith('.obj') ? (
        <ObjMesh url={url} />
      ) : lower.endsWith('.fbx') ? (
        <FbxMesh url={url} />
      ) : (
        <GltfMesh url={url} />
      )}
    </Suspense>
  );
}
