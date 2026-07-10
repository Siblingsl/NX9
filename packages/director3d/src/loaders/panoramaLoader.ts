import { useLoader } from '@react-three/fiber';
import { TextureLoader, type Texture } from 'three';

export function usePanorama(url: string): Texture {
  return useLoader(TextureLoader, url);
}
