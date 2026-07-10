import { useLoader } from '@react-three/fiber';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import type { Group } from 'three';

export function useObj(url: string): Group {
  return useLoader(OBJLoader, url);
}
