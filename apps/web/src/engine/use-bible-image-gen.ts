/**
 * use-bible-image-gen — 资产库 Bible→定妆/场景图生成 Hook（F-037）。
 *
 * 角色/场景详情 → 调用同一生成引擎 → 写回 referenceImageUrl。
 */
import { useCallback, useState } from 'react';
import { buildBibleImagePrompt, type AssetBibleImageRequest } from '@nx9/shared';
import { api } from '../api/client';
import { getGenPack } from './gen-skill-runtime';

export function useBibleImageGen() {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (request: AssetBibleImageRequest): Promise<string | null> => {
    setGenerating(true);
    setError(null);
    try {
      const skillId = request.kind === 'character' ? 'gen-bible-character' : 'gen-bible-scene';
      const pack = await getGenPack(skillId);
      const prompt = buildBibleImagePrompt(request, pack);
      const res = await api.proxyImage({ prompt, size: '1024x1024' }) as { url?: string; message?: string };
      if (res.url) {
        return res.url;
      }
      throw new Error(res.message || 'Bible 图像生成未返回 URL，禁止空成功');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bible 图像生成失败，禁止空成功';
      setError(msg);
      return null;
    } finally {
      setGenerating(false);
    }
  }, []);

  return { generate, generating, error };
}
