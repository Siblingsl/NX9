import type { Node, Edge } from '@xyflow/react';
import {
  buildStoryboardFramePrompt,
  buildPictureGenDelegatePatch,
  resolveConnectedPictureGenId,
  resolveImageRequestSize,
  type StoryboardPreviewFrame,
  type StoryboardPreviewConsistencyReport,
  type StoryboardPreviewPictureSettings,
} from '@nx9/shared';
import { api } from '../api/client';
import { runPictureGenJob } from './picture-gen-runner';

export function findConnectedPictureGenNode(
  previewBlockId: string,
  nodes: Node[],
  edges: Edge[],
): Node | undefined {
  const id = resolveConnectedPictureGenId(previewBlockId, nodes, edges);
  return id ? nodes.find((n) => n.id === id) : undefined;
}

export function resolvePictureGenSettings(
  pictureNodeData: Record<string, unknown>,
  previewSettings?: StoryboardPreviewPictureSettings,
) {
  const data = previewSettings
    ? { ...pictureNodeData, ...buildPictureGenDelegatePatch(previewSettings) }
    : pictureNodeData;
  const quality = (data.quality as string) || 'auto';
  const aspectRatio = (data.aspectRatio as string) || '16:9';
  const resolvedSize = resolveImageRequestSize({
    quality,
    aspectRatio: aspectRatio === 'custom' ? undefined : aspectRatio,
    width: aspectRatio === 'custom' ? (data.width as number) || 1024 : undefined,
    height: aspectRatio === 'custom' ? (data.height as number) || 1024 : undefined,
    snapToStep: (data.snapToStep as boolean) ?? true,
  });
  return {
    modelId: (data.model as string) || 'dall-e-3',
    size: resolvedSize.size,
  };
}

/** 通过连接的图像生成节点执行单帧出图（分镜预览不直接调 API） */
export async function generateStoryboardFrameImage(
  frame: StoryboardPreviewFrame,
  pictureNodeData: Record<string, unknown>,
  previewSettings?: StoryboardPreviewPictureSettings,
): Promise<string> {
  const prompt = buildStoryboardFramePrompt(frame);
  if (!prompt.trim()) throw new Error('Prompt 为空');

  const { modelId, size } = resolvePictureGenSettings(pictureNodeData, previewSettings);
  const urls = await runPictureGenJob({
    prompt,
    modelId,
    size,
    referenceImageUrl: frame.referenceImageUrl ?? undefined,
    n: 1,
  });
  const imageUrl = urls[0];
  if (!imageUrl) throw new Error('图像生成失败');
  return imageUrl;
}

/** 通过连接的图像生成节点创建可直接加载到 Three.js 的 2:1 全景环境。 */
export async function generateStoryboardPanorama720(
  prompt: string,
  pictureNodeData: Record<string, unknown>,
): Promise<string> {
  if (!prompt.trim()) throw new Error('请先描述全景场景');
  const configuredModel = (pictureNodeData.model as string) || 'dall-e-3';
  const modelId = configuredModel === 'flux-i2i' ? 'flux-dev' : configuredModel;
  const urls = await runPictureGenJob({
    prompt,
    modelId,
    size: '2048x1024',
    n: 1,
    mode: 'panorama-720',
  });
  const imageUrl = urls[0];
  if (!imageUrl) throw new Error('全景图生成失败');
  return imageUrl;
}

export async function checkStoryboardConsistencyWithAi(
  frames: StoryboardPreviewFrame[],
  dimension: 'character' | 'scene',
): Promise<StoryboardPreviewConsistencyReport> {
  const withImages = frames.filter((f) => f.imageUrl);
  if (withImages.length < 2) {
    const label = dimension === 'character' ? '角色一致性' : '场景一致性';
    return {
      checkedAt: new Date().toISOString(),
      overallScore: withImages.length === 0 ? 0 : 100,
      dimensions: [
        {
          id: dimension,
          label,
          score: withImages.length === 0 ? 0 : 100,
          issues:
            withImages.length === 0
              ? [{ frameId: frames[0]?.id ?? 'none', message: '尚无预览图，无法检查' }]
              : [],
        },
      ],
    };
  }

  const focus =
    dimension === 'character'
      ? '角色外观、服装、发型、体型是否一致'
      : '场景环境、布景、光线、空间布局是否一致';

  const res = (await api.proxyLlm({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `你是分镜 continuity supervisor。检查多张分镜预览图的${focus}。输出 JSON：{"score":0-100,"issues":[{"frameLabel":"Shot01","message":"..."}]}`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: withImages
              .map((f) => `${f.label} (${f.startSec}-${f.endSec}s): ${f.promptSummary}`)
              .join('\n'),
          },
          ...withImages.slice(0, 6).map((f) => ({
            type: 'image_url',
            image_url: { url: f.imageUrl! },
          })),
        ],
      },
    ],
  })) as { content?: string; choices?: { message?: { content?: string } }[] };

  const raw = res.content ?? res.choices?.[0]?.message?.content ?? '{}';
  let score = 85;
  const issues: Array<{ frameId: string; message: string }> = [];
  try {
    const parsed = JSON.parse(raw) as {
      score?: number;
      issues?: Array<{ frameLabel?: string; frameId?: string; message?: string }>;
    };
    score = Math.max(0, Math.min(100, Math.round(parsed.score ?? score)));
    for (const issue of parsed.issues ?? []) {
      const frame =
        withImages.find((f) => f.label === issue.frameLabel) ??
        withImages.find((f) => f.id === issue.frameId);
      issues.push({
        frameId: frame?.id ?? withImages[0].id,
        message: issue.message ?? '一致性问题',
      });
    }
  } catch {
    issues.push({ frameId: withImages[0].id, message: raw.slice(0, 120) });
  }

  const label = dimension === 'character' ? '角色一致性' : '场景一致性';
  return {
    checkedAt: new Date().toISOString(),
    overallScore: score,
    dimensions: [{ id: dimension, label, score, issues }],
  };
}
