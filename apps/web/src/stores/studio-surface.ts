import { create } from 'zustand';

const STORAGE_KEY = 'nx9.studio.expertWorkflow';

function readStoredExpert(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * 制作台壳层偏好（与业务数据无关）。
 * expertWorkflow=false → 制作台默认（工具坞收起、生产文案）
 * expertWorkflow=true  → 专家编排（完整模块坞与工作流心智）
 */
export const useStudioSurface = create<{
  expertWorkflow: boolean;
  setExpertWorkflow: (on: boolean) => void;
  toggleExpertWorkflow: () => void;
}>((set, get) => ({
  expertWorkflow: typeof window !== 'undefined' ? readStoredExpert() : false,
  setExpertWorkflow: (on) => {
    try {
      localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
    set({ expertWorkflow: on });
  },
  toggleExpertWorkflow: () => {
    get().setExpertWorkflow(!get().expertWorkflow);
  },
}));
