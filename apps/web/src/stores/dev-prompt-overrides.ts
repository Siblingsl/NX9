import { create } from 'zustand';

export type DevPromptOverrideKey =
  | 'clipGen.enrichSuffix'
  | 'directorDesk.consistencySuffix'
  | 'directorDesk.styleLockAppendix'
  | 'assetGate.extractSystem'
  | `scriptDesk.skill.${string}`
  | 'storyboard.episodeBreakdownSystem'
  | 'storyboard.episodePlannerSystem';

export interface DevPromptOverridesState {
  enabled: boolean;
  values: Partial<Record<DevPromptOverrideKey, string>>;
  setEnabled: (v: boolean) => void;
  setValue: (key: DevPromptOverrideKey, value: string) => void;
  clearKey: (key: DevPromptOverrideKey) => void;
  clearAll: () => void;
  exportJson: () => string;
  importJson: (json: string) => boolean;
}

function load(): { enabled: boolean; values: Partial<Record<DevPromptOverrideKey, string>> } {
  try {
    const raw = localStorage.getItem('nx9-dev-prompt-overrides');
    if (raw) return JSON.parse(raw) as { enabled: boolean; values: Partial<Record<DevPromptOverrideKey, string>> };
  } catch { /* ignore */ }
  return { enabled: false, values: {} };
}

function save(state: { enabled: boolean; values: Partial<Record<DevPromptOverrideKey, string>> }) {
  try {
    localStorage.setItem('nx9-dev-prompt-overrides', JSON.stringify(state));
  } catch { /* ignore */ }
}

const initial = load();

export const useDevPromptOverrides = create<DevPromptOverridesState>((set, get) => ({
  enabled: initial.enabled,
  values: initial.values,
  setEnabled: (enabled) => {
    set({ enabled });
    save({ enabled, values: get().values });
  },
  setValue: (key, value) => {
    const values = { ...get().values, [key]: value };
    set({ values });
    save({ enabled: get().enabled, values });
  },
  clearKey: (key) => {
    const { [key]: _, ...rest } = get().values;
    set({ values: rest });
    save({ enabled: get().enabled, values: rest });
  },
  clearAll: () => {
    set({ values: {} });
    save({ enabled: get().enabled, values: {} });
  },
  exportJson: () => JSON.stringify({ version: 1, values: get().values }, null, 2),
  importJson: (json) => {
    try {
      const parsed = JSON.parse(json) as { version?: number; values?: Record<string, string> };
      if (typeof parsed !== 'object' || !parsed.values) return false;
      const values: Partial<Record<DevPromptOverrideKey, string>> = {};
      for (const [k, v] of Object.entries(parsed.values)) {
        if (typeof v === 'string' && v.trim()) values[k as DevPromptOverrideKey] = v.trim();
      }
      set({ values });
      save({ enabled: get().enabled, values });
      return true;
    } catch {
      return false;
    }
  },
}));

/** 生产/全局双闸：仅当 DEV 模式 AND 设置开启时返回 true */
export function isDevPromptEnabled(): boolean {
  return import.meta.env.DEV === true && useDevPromptOverrides.getState().enabled;
}
