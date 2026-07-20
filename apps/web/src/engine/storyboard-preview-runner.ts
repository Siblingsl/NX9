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
    modelId: (data.model as string) || 'gemini-2.5-flash-image',
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
  const configuredModel = (pictureNodeData.model as string) || 'gemini-2.5-flash-image';
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
  dimension: 'character' | 'scene' | 'other',
): Promise<StoryboardPreviewConsistencyReport> {
  const withImages = frames.filter((f) => f.imageUrl);
  const label =
    dimension === 'character' ? '角色一致性'
      : dimension === 'scene' ? '场景一致性'
        : '其它一致性';
  if (withImages.length === 0) {
    return {
      checkedAt: new Date().toISOString(),
      overallScore: 0,
      dimensions: [{
        id: dimension,
        label,
        score: 0,
        issues: [{ frameId: frames[0]?.id ?? 'none', message: '尚无预览图，无法检查' }],
      }],
      threshold: 80,
      suggestRegenerateFrameIds: [],
    };
  }
  if (withImages.length === 1 && dimension !== 'other') {
    // 单帧：仍按 prompt 与画面是否匹配做单图质检
  }

  const focus =
    dimension === 'character'
      ? '角色外观、服装、发型、体型、脸部特征跨镜是否一致'
      : dimension === 'scene'
        ? '场景环境、布景、光线、空间布局、时代材质跨镜是否一致'
        : '轴线/景别逻辑、道具连贯、光色基调、时间线衔接是否合理';

  const res = (await api.proxyLlm({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: [
          `你是分镜 continuity supervisor。检查分镜关键帧预览图的${focus}。`,
          '输出 JSON：{"score":0-100,"frameScores":[{"frameLabel":"Shot01","score":0-100}],"issues":[{"frameLabel":"Shot01","message":"..."}]}',
          'score 为该维度综合分；frameScores 为每镜该维度分。',
        ].join('\n'),
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
  const frameScoreMap = new Map<string, number>();
  try {
    const parsed = JSON.parse(raw) as {
      score?: number;
      frameScores?: Array<{ frameLabel?: string; frameId?: string; score?: number }>;
      issues?: Array<{ frameLabel?: string; frameId?: string; message?: string }>;
    };
    score = Math.max(0, Math.min(100, Math.round(parsed.score ?? score)));
    for (const item of parsed.frameScores ?? []) {
      const frame =
        withImages.find((f) => f.label === item.frameLabel)
        ?? withImages.find((f) => f.id === item.frameId);
      if (frame && item.score != null) {
        frameScoreMap.set(frame.id, Math.max(0, Math.min(100, Math.round(item.score))));
      }
    }
    for (const issue of parsed.issues ?? []) {
      const frame =
        withImages.find((f) => f.label === issue.frameLabel)
        ?? withImages.find((f) => f.id === issue.frameId);
      issues.push({
        frameId: frame?.id ?? withImages[0].id,
        message: issue.message ?? '一致性问题',
      });
    }
  } catch {
    issues.push({ frameId: withImages[0].id, message: raw.slice(0, 120) });
  }

  // 无逐帧分时，用综合分回填
  if (frameScoreMap.size === 0) {
    for (const f of withImages) frameScoreMap.set(f.id, score);
  }

  return {
    checkedAt: new Date().toISOString(),
    overallScore: score,
    dimensions: [{ id: dimension, label, score, issues }],
    threshold: 80,
    suggestRegenerateFrameIds: [...frameScoreMap.entries()]
      .filter(([, s]) => s < 80)
      .map(([id]) => id),
  };
}

/**
 * 关键帧完整评分：角色一致性 + 场景一致性 + 其它一致性。
 * 综合分 < 80 标记 suggestRegenerate。
 */
export async function scoreStoryboardKeyframes(
  frames: StoryboardPreviewFrame[],
  threshold = 80,
): Promise<{
  report: StoryboardPreviewConsistencyReport;
  frames: StoryboardPreviewFrame[];
}> {
  const [character, scene, other] = await Promise.all([
    checkStoryboardConsistencyWithAi(frames, 'character'),
    checkStoryboardConsistencyWithAi(frames, 'scene'),
    checkStoryboardConsistencyWithAi(frames, 'other'),
  ]);

  const dimChar = character.dimensions[0]?.score ?? 0;
  const dimScene = scene.dimensions[0]?.score ?? 0;
  const dimOther = other.dimensions[0]?.score ?? 0;
  const overallScore = Math.round((dimChar + dimScene + dimOther) / 3);

  const issues = [
    ...character.dimensions.flatMap((d) => d.issues),
    ...scene.dimensions.flatMap((d) => d.issues),
    ...other.dimensions.flatMap((d) => d.issues),
  ];

  // 逐帧：若该帧在任一维度 issue 中出现，或综合分 < threshold，建议重生成
  const issueFrameIds = new Set(issues.map((i) => i.frameId));
  const nextFrames = frames.map((frame) => {
    if (!frame.imageUrl) {
      return {
        ...frame,
        consistencyScore: null,
        scoreBreakdown: null,
        suggestRegenerate: false,
      };
    }
    // 无独立逐帧三维时，用整体分作基准，有 issue 的帧额外扣分
    const penalty = issueFrameIds.has(frame.id) ? 12 : 0;
    const characterScore = Math.max(0, dimChar - (issueFrameIds.has(frame.id) ? 8 : 0));
    const sceneScore = Math.max(0, dimScene - (issueFrameIds.has(frame.id) ? 8 : 0));
    const otherScore = Math.max(0, dimOther - (issueFrameIds.has(frame.id) ? 8 : 0));
    const score = Math.max(0, Math.min(100, Math.round((characterScore + sceneScore + otherScore) / 3) - (penalty > 8 ? 0 : 0)));
    return {
      ...frame,
      consistencyScore: score,
      scoreBreakdown: {
        character: characterScore,
        scene: sceneScore,
        other: otherScore,
      },
      suggestRegenerate: score < threshold,
    };
  });

  const suggestRegenerateFrameIds = nextFrames
    .filter((f) => f.suggestRegenerate)
    .map((f) => f.id);

  const report: StoryboardPreviewConsistencyReport = {
    checkedAt: new Date().toISOString(),
    overallScore,
    threshold,
    dimensions: [
      { id: 'character', label: '角色一致性', score: dimChar, issues: character.dimensions[0]?.issues ?? [] },
      { id: 'scene', label: '场景一致性', score: dimScene, issues: scene.dimensions[0]?.issues ?? [] },
      { id: 'other', label: '其它一致性', score: dimOther, issues: other.dimensions[0]?.issues ?? [] },
    ],
    suggestRegenerateFrameIds,
  };

  return { report, frames: nextFrames };
}
