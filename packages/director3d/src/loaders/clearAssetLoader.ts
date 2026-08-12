import { useLoader } from '@react-three/fiber';
import { TextureLoader } from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

export function clearAssetLoaderCache(url: string) {
  useLoader.clear(TextureLoader, url);
  useLoader.clear(GLTFLoader, url);
  useLoader.clear(OBJLoader, url);
  useLoader.clear(FBXLoader, url);
}
