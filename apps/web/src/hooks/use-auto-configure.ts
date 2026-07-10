import { useCallback } from 'react';
import { resolveDefaultModel } from '@nx9/shared';

const HIDDEN_KEYS = ['cfg', 'seed', 'steps', 'lora', 'provider'];

export function useAutoConfigure() {
  const autoConfigure = useCallback((kind: 'picture' | 'video' | 'tts', userPrefs?: Record<string, unknown>) => {
    const config: Record<string, unknown> = {
      model: resolveDefaultModel(kind),
    };
    if (userPrefs) {
      for (const [key, val] of Object.entries(userPrefs)) {
        if (!HIDDEN_KEYS.includes(key)) {
          config[key] = val;
        }
      }
    }
    return config;
  }, []);

  const shouldHideParam = useCallback((paramKey: string): boolean => {
    return HIDDEN_KEYS.includes(paramKey);
  }, []);

  return { autoConfigure, shouldHideParam };
}
