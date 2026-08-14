import { buildCameraPrompt, normalizeDirectorProject } from '@nx9/director3d';
import { buildLightRigPrompt, mergeUpstreamPrompt } from '@nx9/shared';
import { api } from '../../api/client';
import type { FlowExecuteDeps } from './types';

export async function executeToolOps(deps: FlowExecuteDeps): Promise<void> {
  const { block, kind, prompt, upstream, updateNodeData, ctx } = deps;
  const d = block.data ?? {};
  if (kind === 'cinema-prompt' || kind === 'camera-prompt' || kind === 'prompt-studio') {
    const text = (d.content as string) || prompt;
    updateNodeData(block.id, { status: 'success', output: text, content: text });
    return;
  }

  if (kind === 'angle-visual') {
    const text = (d.content as string) || prompt;
    updateNodeData(block.id, { status: 'success', output: text, content: text });
    return;
  }

  if (kind === 'style-lab') {
    const tab = (d.styleLabTab as string) ?? 'style';
    if (tab === 'style') {
      const sourceUrl = upstream.pictures[0] || (d.sourceUrl as string);
      if (!sourceUrl) throw new Error('缺少参考图');
      const styleRes = await api.extractStyle(sourceUrl);
      updateNodeData(block.id, {
        status: 'success',
        styleResult: styleRes,
        content: styleRes.combinedPrompt,
        styleTokens: styleRes.styleTokens,
        negativePrompt: styleRes.negativePrompt,
      });
      return;
    }
    const text = (d.content as string) || prompt;
    updateNodeData(block.id, { status: 'success', output: text, content: text });
    return;
  }

  if (kind === 'local-enhance') {
    const mode = (d.enhanceMode as string) ?? 'picture';
    if (mode === 'clip') {
      const sourceUrl = upstream.clips[0] || (d.videoUrl as string);
      if (!sourceUrl) throw new Error('缺少视频');
      const res = await api.topazVideo({
        sourceUrl,
        upscaleModel: (d.upscaleModel as string) ?? 'iris-3',
        upscaleFactor: (d.upscaleFactor as number) ?? 2,
        enableInterpolation: Boolean(d.enableInterpolation),
        topazVideoPath: (d.topazVideoPath as string) || undefined,
      });
      updateNodeData(block.id, { status: 'success', videoUrl: res.url, outputUrl: res.url });
      return;
    }
    const sourceUrl = upstream.pictures[0];
    if (!sourceUrl) throw new Error('缺少图片');
    const res = await api.topazGigapixel({
      sourceUrl,
      scale: (d.scale as number) ?? 2,
      model: (d.model as string) ?? 'std',
      executablePath: (d.executablePath as string) || undefined,
    });
    updateNodeData(block.id, { status: 'success', previewUrl: res.url, outputUrl: res.url });
    return;
  }

  if (kind === 'model-market') {
    const source = (d.marketSource as string) ?? 'fal';
    if (source === 'comfy') {
      const workflowJson = (d.workflowJson as string) ?? '';
      if (!workflowJson.trim()) throw new Error('Workflow JSON 为空');
      const workflow = JSON.parse(workflowJson) as Record<string, unknown>;
      const p = mergeUpstreamPrompt(upstream, (d.content as string) ?? '');
      const res = await api.proxyComfy({
        workflow,
        baseUrl: ((d.comfyBaseUrl as string) ?? '').trim() || undefined,
        prompt: p.trim() || undefined,
      });
      if (!res.ok || !res.url) throw new Error(res.message ?? 'ComfyUI 未返回图片');
      updateNodeData(block.id, {
        status: 'success',
        previewUrl: res.url,
        outputUrl: res.url,
        comfyPromptId: res.promptId,
      });
      return;
    }
    const modelId = (d.falModel as string) || 'fal-ai/birefnet/v2';
    const p = mergeUpstreamPrompt(upstream, (d.content as string) ?? '');
    const input: Record<string, unknown> = {};
    if (p.trim()) input.prompt = p.trim();
    if (upstream.pictures[0]) input.image_url = upstream.pictures[0];
    const res = await api.proxyFal({ model: modelId, input });
    if (!res.url) throw new Error('Fal 未返回图片');
    updateNodeData(block.id, {
      status: 'success',
      previewUrl: res.url,
      outputUrl: res.url,
      falOutput: res.output,
    });
    return;
  }

  if (kind === 'shot-script' || kind === 'reference-board') {
    const text = (d.content as string) || prompt;
    updateNodeData(block.id, {
      status: 'success',
      output: text,
      content: text,
      meta: d.meta,
    });
    return;
  }

  if (kind === 'comfy-workflow') {
    const workflowText = (d.workflowText as string) ?? '';
    if (!workflowText.trim()) throw new Error('Comfy 工作流：未填写 Workflow JSON');
    let workflow: Record<string, unknown>;
    try {
      workflow = JSON.parse(workflowText);
    } catch {
      throw new Error('Comfy 工作流：Workflow JSON 解析失败');
    }
    const res = (await api.proxyComfy({
      workflow,
      baseUrl: (d.baseUrl as string) || undefined,
      prompt: (prompt || (d.content as string)) || undefined,
    })) as { ok: boolean; url?: string; message?: string };
    if (!res.ok || !res.url) throw new Error(res.message ?? 'Comfy 工作流运行失败');
    updateNodeData(block.id, {
      status: 'success',
      previewUrl: res.url,
      content: prompt || (d.content as string) || '',
    });
    return;
  }

  if (kind === 'subtitle-burn') {
    const clip = upstream.clips?.[0];
    const subtitle = (d.subtitle as string) || prompt || upstream.prompts?.[0] || '';
    if (!clip) throw new Error('需要上游视频');
    if (!subtitle.trim()) throw new Error('字幕为空');
    const res = await api.renderShotMp4({
      videoUrl: clip,
      subtitle: subtitle.trim(),
      durationSec: (d.durationSec as number) ?? 4,
      skipReview: true,
    });
    if (!res.ok || !res.url) throw new Error(res.message ?? '字幕烧录失败');
    updateNodeData(block.id, {
      status: 'success',
      outputClip: res.url,
      clips: [res.url],
      content: subtitle,
    });
    return;
  }

  if (kind === 'blocking-stage') {
    const scene = normalizeDirectorProject(d.scene);
    const cameraSequence = scene.cameras.map((c) => ({
      name: c.name,
      prompt: buildCameraPrompt(c),
    }));
    const text = cameraSequence.map((c) => c.prompt).join('\n');
    updateNodeData(block.id, {
      status: 'success',
      cameraSequence,
      content: text,
      output: text,
      meta: { cameraSequence, actorCount: scene.objects.filter((o) => o.kind === 'character').length },
    });
    return;
  }

  if (kind === 'light-rig') {
    const presetId = (d.lightPresetId as string) ?? 'three-point-soft';
    const content = buildLightRigPrompt(presetId, (d.extra as string) || upstream.prompts?.[0] || prompt);
    updateNodeData(block.id, {
      status: 'success',
      content,
      output: content,
      outputPrompt: content,
      meta: { lightPresetId: presetId },
      pictures: upstream.pictures?.length ? upstream.pictures : undefined,
    });
    return;
  }

  if (kind === 'depth-pass') {
    const source = upstream.pictures?.[0];
    if (!source) throw new Error('需要上游图像');
    const res = await api.generateDepthPass({ sourceUrl: source });
    if (!res.ok || !res.depthUrl) throw new Error(res.message ?? '深度通道失败');
    updateNodeData(block.id, {
      status: 'success',
      depthUrl: res.depthUrl,
      normalUrl: res.normalUrl,
      pictures: [res.depthUrl, res.normalUrl].filter(Boolean) as string[],
      meta: { sourceUrl: source, method: res.method },
    });
    return;
  }

  if (kind === 'picture-diff') {
    const imageA = upstream.pictures?.[0] || (d.imageA as string) || '';
    const imageB = upstream.pictures?.[1] || (d.imageB as string) || '';
    if (!imageA || !imageB) throw new Error('picture-diff 需要 2 张上游图片');
    updateNodeData(block.id, {
      status: 'success',
      imageA,
      imageB,
    });
    return;
  }

  if (kind === 'director-3d') {
    const cam =
      (d.lastCameraPrompt as string) || (d.content as string) || upstream.prompts.join(', ');
    updateNodeData(block.id, {
      status: 'success',
      upstream,
      content: cam,
      outputPrompt: cam,
      previewUrl: (d.lastCaptureUrl as string) || upstream.pictures[0],
    });
    return;
  }

  if (kind === 'link-parser') {
    const url = (d.url as string) || upstream.prompts[0] || '';
    if (!url.trim()) throw new Error('链接为空');
    const res = await api.parseLink(url.trim(), (d.hint as string) || prompt || undefined);
    updateNodeData(block.id, {
      status: 'success',
      parseResult: res,
      content: res.prompt,
      output: res.prompt,
      title: res.title,
      summary: res.summary,
    });
    return;
  }

  if (kind === 'clip-sink') {
    const videoUrl = upstream.clips[0] || (d.videoUrl as string);
    updateNodeData(block.id, {
      status: 'success',
      videoUrl,
      previewUrl: videoUrl,
    });
    return;
  }

  if (kind === 'style-atelier') {
    const sourceUrl = upstream.pictures[0] || (d.sourceUrl as string);
    if (!sourceUrl) throw new Error('缺少参考图');
    const styleRes = await api.extractStyle(sourceUrl);
    updateNodeData(block.id, {
      status: 'success',
      styleResult: styleRes,
      content: styleRes.combinedPrompt,
      styleTokens: styleRes.styleTokens,
      negativePrompt: styleRes.negativePrompt,
    });
    return;
  }

  if (kind === 'tag-atelier') {
    const text = (d.content as string) || prompt;
    updateNodeData(block.id, { status: 'success', output: text, content: text });
    return;
  }

  if (kind === 'batch-runner') {
    const pictures = upstream.pictures;
    if (pictures.length === 0) throw new Error('无上游图片');
    const mode = (d.mode as string) ?? 'resize';
    const out: string[] = [];
    for (const url of pictures) {
      if (mode === 'resize') {
        const res = await api.resizeImage({ sourceUrl: url, width: 1024, height: 1024 });
        out.push(res.url);
      } else if (mode === 'grid-split') {
        const res = await api.gridSplit({ sourceUrl: url, rows: 2, cols: 2 });
        out.push(...res.urls);
      } else {
        const res = await api.reversePrompt(url);
        out.push(res.prompt);
      }
    }
    updateNodeData(block.id, {
      status: 'success',
      batchResults: out,
      pictures: mode === 'reverse-prompt' ? undefined : out,
      content: mode === 'reverse-prompt' ? out.join('\n\n') : undefined,
      mode,
    });
    return;
  }

  if (kind === 'grid-prompt-reverse') {
    const sourceUrl = upstream.pictures[0] || (d.sourceUrl as string) || (d.previewUrl as string);
    if (!sourceUrl) throw new Error('缺少宫格/分镜图');
    const res = await api.gridReversePrompts({
      sourceUrl,
      rows: (d.rows as number) ?? 3,
      cols: (d.cols as number) ?? 3,
      storyPrompt: mergeUpstreamPrompt(upstream, d.storyPrompt as string | undefined) || undefined,
    });
    updateNodeData(block.id, {
      status: 'success',
      gridCells: res.cells,
      splitUrls: res.splitUrls,
      pictures: res.splitUrls,
      content: res.cells.map((c) => c.videoPrompt).join('\n\n'),
    });
    return;
  }

  if (kind === 'fal-market') {
    const modelId = (d.falModel as string) || 'fal-ai/birefnet/v2';
    const prompt = mergeUpstreamPrompt(upstream, (d.content as string) ?? '');
    const input: Record<string, unknown> = {};
    if (prompt.trim()) input.prompt = prompt.trim();
    if (upstream.pictures[0]) input.image_url = upstream.pictures[0];
    const res = await api.proxyFal({ model: modelId, input });
    if (!res.url) throw new Error('Fal 未返回图片');
    updateNodeData(block.id, {
      status: 'success',
      previewUrl: res.url,
      outputUrl: res.url,
      falOutput: res.output,
    });
    return;
  }

  // VG-19: motion-story 已迁移为 clip-gen（见 migrateBlockKind），勿再旁路组装器

  if (kind === 'topaz-picture') {
    const sourceUrl = upstream.pictures[0];
    if (!sourceUrl) throw new Error('缺少图片');
    const res = await api.topazGigapixel({
      sourceUrl,
      scale: (d.scale as number) ?? 2,
      model: (d.model as string) ?? 'std',
      executablePath: (d.executablePath as string) || undefined,
    });
    updateNodeData(block.id, {
      status: 'success',
      previewUrl: res.url,
      outputUrl: res.url,
    });
    return;
  }

  if (kind === 'topaz-clip') {
    const sourceUrl = upstream.clips[0] || (d.videoUrl as string);
    if (!sourceUrl) throw new Error('缺少视频');
    const res = await api.topazVideo({
      sourceUrl,
      upscaleModel: (d.upscaleModel as string) ?? 'iris-3',
      upscaleFactor: (d.upscaleFactor as number) ?? 2,
      enableInterpolation: Boolean(d.enableInterpolation),
      topazVideoPath: (d.topazVideoPath as string) || undefined,
    });
    updateNodeData(block.id, {
      status: 'success',
      videoUrl: res.url,
      outputUrl: res.url,
    });
    return;
  }

  if (kind === 'control-preprocess') {
    const src = upstream.pictures[0] || (d.imageUrl as string);
    if (!src) throw new Error('ControlNet 缺少上游图片');
    const mode = (d.mode as string) ?? 'depth';
    if (mode === 'depth') {
      const r = await api.generateDepthPass({ sourceUrl: src });
      updateNodeData(block.id, { status: 'success', previewUrl: r.depthUrl, output: r.depthUrl, meta: { mode } });
    } else if (mode === 'canny') {
      const r = await api.proxyFal({ model: 'fal-ai/image-to-canny', input: { image_url: src } });
      updateNodeData(block.id, { status: 'success', previewUrl: r.url, output: r.url, meta: { mode } });
    } else throw new Error(`未知 ControlNet 模式: ${mode}`);
    return;
  }

  if (kind === 'reference-analyze') {
    const url = upstream.clips[0] || (d.videoUrl as string);
    if (!url) throw new Error('参考反推缺少上游视频');
    const notes = (d.notes as string) ?? '';
    const res = await api.analyzeReferenceVideo({ videoUrl: url, notes: notes || undefined, targetShotCount: 5 });
    updateNodeData(block.id, { status: 'success', analyzeResult: res.markdown, output: res.markdown, content: res.markdown });
    return;
  }
}
