import { create } from 'zustand';

/** 应用级表面：导航 / 制作台 / 高级画布。无右侧抽屉。 */
export type AppSurface = 'home' | 'studio' | 'canvas';

const STORAGE_KEY = 'nx9.app.surface';

function readStored(): AppSurface {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'studio' || v === 'canvas' || v === 'home') return v;
  } catch {
    /* ignore */
  }
  return 'home';
}

export const useAppSurface = create<{
  surface: AppSurface;
  setSurface: (surface: AppSurface) => void;
  goHome: () => void;
  goStudio: () => void;
  goCanvas: () => void;
}>((set) => ({
  surface: typeof window !== 'undefined' ? readStored() : 'home',
  setSurface: (surface) => {
    try {
      localStorage.setItem(STORAGE_KEY, surface);
    } catch {
      /* ignore */
    }
    set({ surface });
  },
  goHome: () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'home');
    } catch {
      /* ignore */
    }
    set({ surface: 'home' });
  },
  goStudio: () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'studio');
    } catch {
      /* ignore */
    }
    set({ surface: 'studio' });
  },
  goCanvas: () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'canvas');
    } catch {
      /* ignore */
    }
    set({ surface: 'canvas' });
  },
}));
