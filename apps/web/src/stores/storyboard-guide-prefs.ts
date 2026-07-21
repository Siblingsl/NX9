import { create } from 'zustand';
import {
  STORYBOARD_GUIDE_KINDS,
  type StoryboardGuideKind,
} from '@nx9/shared';

const STORAGE_KEY = 'nx9.storyboardGuidePrefs.v1';

export type StoryboardGuidePrefs = {
  /** 预览 / 批审 UI 是否叠导引 */
  showOverlay: boolean;
  /** 导出 contact sheet 是否画导引 */
  showOnExport: boolean;
  /** 出视频是否合成引导图 + guide suffix */
  useForVideo: boolean;
  /** kind 开关；缺省 true */
  kinds: Record<StoryboardGuideKind, boolean>;
};

const defaultKinds = (): Record<StoryboardGuideKind, boolean> =>
  Object.fromEntries(STORYBOARD_GUIDE_KINDS.map((k) => [k, true])) as Record<
    StoryboardGuideKind,
    boolean
  >;

export const DEFAULT_STORYBOARD_GUIDE_PREFS: StoryboardGuidePrefs = {
  showOverlay: true,
  showOnExport: true,
  useForVideo: true,
  kinds: defaultKinds(),
};

function loadPrefs(): StoryboardGuidePrefs {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_STORYBOARD_GUIDE_PREFS, kinds: defaultKinds() };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STORYBOARD_GUIDE_PREFS, kinds: defaultKinds() };
    const parsed = JSON.parse(raw) as Partial<StoryboardGuidePrefs>;
    return {
      showOverlay: parsed.showOverlay ?? true,
      showOnExport: parsed.showOnExport ?? parsed.showOverlay ?? true,
      useForVideo: parsed.useForVideo ?? true,
      kinds: { ...defaultKinds(), ...(parsed.kinds ?? {}) },
    };
  } catch {
    return { ...DEFAULT_STORYBOARD_GUIDE_PREFS, kinds: defaultKinds() };
  }
}

function toData(s: StoryboardGuidePrefs): StoryboardGuidePrefs {
  return {
    showOverlay: s.showOverlay,
    showOnExport: s.showOnExport,
    useForVideo: s.useForVideo,
    kinds: { ...s.kinds },
  };
}

function persist(prefs: StoryboardGuidePrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toData(prefs)));
  } catch {
    /* ignore quota */
  }
}

type StoryboardGuidePrefsStore = StoryboardGuidePrefs & {
  setShowOverlay: (v: boolean) => void;
  setShowOnExport: (v: boolean) => void;
  setUseForVideo: (v: boolean) => void;
  toggleKind: (kind: StoryboardGuideKind) => void;
  setKind: (kind: StoryboardGuideKind, on: boolean) => void;
};

export const useStoryboardGuidePrefs = create<StoryboardGuidePrefsStore>((set, get) => {
  const initial = loadPrefs();
  return {
    ...initial,
    setShowOverlay: (showOverlay) => {
      set({ showOverlay });
      persist({ ...toData(get()), showOverlay });
    },
    setShowOnExport: (showOnExport) => {
      set({ showOnExport });
      persist({ ...toData(get()), showOnExport });
    },
    setUseForVideo: (useForVideo) => {
      set({ useForVideo });
      persist({ ...toData(get()), useForVideo });
    },
    toggleKind: (kind) => {
      const kinds = { ...get().kinds, [kind]: !get().kinds[kind] };
      set({ kinds });
      persist({ ...toData(get()), kinds });
    },
    setKind: (kind, on) => {
      const kinds = { ...get().kinds, [kind]: on };
      set({ kinds });
      persist({ ...toData(get()), kinds });
    },
  };
});

/** 非 React 路径（出片 runner）同步读取 */
export function readStoryboardGuidePrefs(): StoryboardGuidePrefs {
  return loadPrefs();
}

export function enabledGuideKinds(
  prefs: StoryboardGuidePrefs = loadPrefs(),
): StoryboardGuideKind[] {
  return STORYBOARD_GUIDE_KINDS.filter((k) => prefs.kinds[k] !== false);
}
