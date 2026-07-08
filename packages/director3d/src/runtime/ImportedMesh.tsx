import { useLoader } from '@react-three/fiber';
import { Suspense, useMemo } from 'react';
import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

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
  const gltf = useLoader(GLTFLoader, url);
  const scene = useMemo(() => normalizeScene(gltf.scene.clone()), [gltf.scene]);
  return <primitive object={scene} />;
}

function ObjMesh({ url }: { url: string }) {
  const obj = useLoader(OBJLoader, url);
  const scene = useMemo(() => normalizeScene(obj.clone()), [obj]);
  return <primitive object={scene} />;
}

function FbxMesh({ url }: { url: string }) {
  const fbx = useLoader(FBXLoader, url);
  const scene = useMemo(() => normalizeScene(fbx.clone()), [fbx]);
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
