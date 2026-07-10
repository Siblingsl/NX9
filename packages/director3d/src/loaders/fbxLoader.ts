import { useLoader } from '@react-three/fiber';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import type { Group } from 'three';

export function useFbx(url: string): Group {
  return useLoader(FBXLoader, url);
}
