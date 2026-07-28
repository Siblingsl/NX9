/**
 * use-unified-mentions — `@` 提及注入全节点统一 Hook（F-024）。
 *
 * 所有生成入口走同一 resolveMentionsForPrompt。
 */
import { useMemo } from 'react';
import { useEdges, useNodes } from '@xyflow/react';
import {
  resolveMentionsForPrompt,
  buildPromptWithReferences,
  type MentionRef,
} from '@nx9/shared';

/**
 * 从上游节点收集 @ 可引用的资产。
 */
export function useUnifiedMentions(blockId: string): {
  mentions: MentionRef[];
  resolve: (text: string) => { resolved: string; unresolved: string[] };
} {
  const nodes = useNodes();
  const edges = useEdges();

  const mentions = useMemo(() => {
    const refs: MentionRef[] = [];
    const incoming = edges.filter((e) => e.target === blockId);
    for (const edge of incoming) {
      const src = nodes.find((n) => n.id === edge.source);
      if (!src) continue;
      const data = src.data as Record<string, unknown>;

      // 从 picture-gen 收集图片
      const mediaUrls = data.mediaUrls as string[] | undefined;
      if (Array.isArray(mediaUrls)) {
        mediaUrls.forEach((url, i) => {
          refs.push({ id: `${src.id}-pic-${i}`, kind: 'picture', url, label: `${src.type} 图${i + 1}` });
        });
      }
      const mediaUrl = data.mediaUrl as string | undefined;
      if (mediaUrl) {
        refs.push({ id: `${src.id}-pic`, kind: 'picture', url: mediaUrl, label: `${src.type} 图` });
      }

      // 从 clip-gen 收集视频
      const videoUrl = data.videoUrl as string | undefined;
      if (videoUrl) {
        refs.push({ id: `${src.id}-clip`, kind: 'clip', url: videoUrl, label: `${src.type} 视频` });
      }

      // 从 sound-gen 收集音频
      const audioUrl = data.audioUrl as string | undefined;
      if (audioUrl) {
        refs.push({ id: `${src.id}-sound`, kind: 'sound', url: audioUrl, label: `${src.type} 音频` });
      }

      // 从 character/data 收集角色引用
      const characterIds = data.characterIds as string[] | undefined;
      if (Array.isArray(characterIds)) {
        characterIds.forEach((cid) => {
          refs.push({ id: cid, kind: 'character', label: cid });
        });
      }
    }
    return refs;
  }, [blockId, nodes, edges]);

  const resolve = useMemo(
    () => (text: string) => resolveMentionsForPrompt(text, mentions),
    [mentions],
  );

  return { mentions, resolve };
}
