import { buildCameraPrompt, normalizeDirectorProject } from '@nx9/director3d';
import { buildLightRigPrompt, mergeUpstreamPrompt } from '@nx9/shared';
import { api } from '../../api/client';
import type { FlowExecuteDeps } from './types';

export async function executeToolOps(deps: FlowExecuteDeps): Promise<void> {
  const { block, kind, prompt, upstream, updateNodeData, ctx } = deps;
  const d = block.data ?? {};
  if (kind === 'cinema-prompt' || kind === 'camera-prompt' || kind === 'prompt-studio') {
    const text = (d.content as string) || prompt;
    if (!String(text ?? '').trim()) throw new Error('提示词节点文本为空，禁止空成功');
    updateNodeData(block.id, { status: 'success', output: text, content: text });
    return;
  }

  if (kind === 'angle-visual') {
    const text = (d.content as string) || prompt;
    if (!String(text ?? '').trim()) throw new Error('角度可视化文本为空，禁止空成功');
    updateNodeData(block.id, { status: 'success', output: text, content: text });
    return;
  }

  if (kind === 'style-lab') {
    const tab = (d.styleLabTab as string) ?? 'style';
    if (tab === 'style') {
      const sourceUrl = upstream.pictures[0] || (d.sourceUrl as string);
      if (!sourceUrl) throw new Error('缺少参考图，禁止空成功');
      const styleRes = await api.extractStyle(sourceUrl);
      if (!styleRes.ok || !styleRes.combinedPrompt?.trim()) {
        throw new Error(styleRes.message ?? '风格提取失败（无可用 style/scene），禁止空成功');
      }
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
    if (!String(text ?? '').trim()) throw new Error('风格实验室文本为空，禁止空成功');
    updateNodeData(block.id, { status: 'success', output: text, content: text });
    return;
  }

  if (kind === 'local-enhance') {
    const mode = (d.enhanceMode as string) ?? 'picture';
    if (mode === 'diff') {
      throw new Error(
        '画面对比（diff）尚未接入像素差分实现；旧 picture-diff 节点请改用其他工具，禁止空成功',
      );
    }
    if (mode === 'clip') {
      const sourceUrl = upstream.clips[0] || (d.videoUrl as string);
      if (!sourceUrl) throw new Error('缺少视频，禁止空成功');
      const res = await api.topazVideo({
        sourceUrl,
        upscaleModel: (d.upscaleModel as string) ?? 'iris-3',
        upscaleFactor: (d.upscaleFactor as number) ?? 2,
        enableInterpolation: Boolean(d.enableInterpolation),
        topazVideoPath: (d.topazVideoPath as string) || undefined,
      });
      if (!res.ok || !res.url) throw new Error('本地增强（视频）失败，禁止空成功');
      updateNodeData(block.id, { status: 'success', videoUrl: res.url, outputUrl: res.url });
      return;
    }
    const sourceUrl = upstream.pictures[0];
    if (!sourceUrl) throw new Error('缺少图片，禁止空成功');
    const res = await api.topazGigapixel({
      sourceUrl,
      scale: (d.scale as number) ?? 2,
      model: (d.model as string) ?? 'std',
      executablePath: (d.executablePath as string) || undefined,
    });
    if (!res.ok || !res.url) throw new Error('本地增强（图片）失败，禁止空成功');
    updateNodeData(block.id, { status: 'success', previewUrl: res.url, outputUrl: res.url });
    return;
  }

  if (kind === 'model-market') {
    const source = (d.marketSource as string) ?? 'fal';
    if (source === 'comfy') {
      const workflowJson = (d.workflowJson as string) ?? '';
      if (!workflowJson.trim()) throw new Error('Workflow JSON 为空，禁止空成功');
      const workflow = JSON.parse(workflowJson) as Record<string, unknown>;
      const p = mergeUpstreamPrompt(upstream, (d.content as string) ?? '');
      const res = await api.proxyComfy({
        workflow,
        baseUrl: ((d.comfyBaseUrl as string) ?? '').trim() || undefined,
        prompt: p.trim() || undefined,
      });
      if (!res.ok || !res.url) throw new Error(res.message ?? 'ComfyUI 未返回图片，禁止空成功');
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
    if (!res.ok || !res.url) throw new Error('Fal 未返回图片，禁止空成功');
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
    if (!String(text ?? '').trim()) {
      throw new Error(
        kind === 'reference-board' ? '参考板文本为空，禁止空成功' : '分镜脚本文本为空，禁止空成功',
      );
    }
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
    if (!workflowText.trim()) throw new Error('Comfy 工作流：未填写 Workflow JSON，禁止空成功');
    let workflow: Record<string, unknown>;
    try {
      workflow = JSON.parse(workflowText);
    } catch {
      throw new Error('Comfy 工作流：Workflow JSON 解析失败，禁止空成功');
    }
    const res = (await api.proxyComfy({
      workflow,
      baseUrl: (d.baseUrl as string) || undefined,
      prompt: (prompt || (d.content as string)) || undefined,
    })) as { ok: boolean; url?: string; message?: string };
    if (!res.ok || !res.url) throw new Error(res.message ?? 'Comfy 工作流运行失败，禁止空成功');
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
    if (!clip) throw new Error('需要上游视频，禁止空成功');
    if (!subtitle.trim()) throw new Error('字幕为空，禁止空成功');
    const res = await api.renderShotMp4({
      videoUrl: clip,
      subtitle: subtitle.trim(),
      durationSec: (d.durationSec as number) ?? 4,
      skipReview: true,
    });
    if (!res.ok || !res.url) throw new Error(res.message ?? '字幕烧录失败，禁止空成功');
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
    if (!text.trim() && cameraSequence.length === 0) {
      throw new Error('场面调度无可输出的机位序列，禁止空成功');
    }
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
    if (!source) throw new Error('需要上游图像，禁止空成功');
    const res = await api.generateDepthPass({ sourceUrl: source });
    if (!res.ok || !res.depthUrl) throw new Error(res.message ?? '深度通道失败，禁止空成功');
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
    // 旧 kind 已迁移到 local-enhance(diff)；执行层禁止再空成功只写 imageA/B
    throw new Error(
      'picture-diff 已下线空成功路径：像素对比未实现。请迁移为 local-enhance 或其他工具（禁止假绿）',
    );
  }

  if (kind === 'director-3d') {
    const cam =
      (d.lastCameraPrompt as string) || (d.content as string) || upstream.prompts.join(', ');
    const previewUrl = (d.lastCaptureUrl as string) || upstream.pictures[0];
    if (!String(cam ?? '').trim() && !previewUrl) {
      throw new Error('3D 导演台无可输出的机位提示或截图，禁止空成功');
    }
    updateNodeData(block.id, {
      status: 'success',
      upstream,
      content: cam,
      outputPrompt: cam,
      previewUrl,
    });
    return;
  }

  if (kind === 'link-parser') {
    const url = (d.url as string) || upstream.prompts[0] || '';
    if (!url.trim()) throw new Error('链接为空，禁止空成功');
    const res = await api.parseLink(url.trim(), (d.hint as string) || prompt || undefined);
    if (!res.ok || !String(res.prompt ?? '').trim()) {
      throw new Error('链接解析失败或结果为空，禁止空成功');
    }
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
    if (!videoUrl) throw new Error('clip-sink 无上游视频，禁止空成功');
    updateNodeData(block.id, {
      status: 'success',
      videoUrl,
      previewUrl: videoUrl,
    });
    return;
  }

  if (kind === 'style-atelier') {
    const sourceUrl = upstream.pictures[0] || (d.sourceUrl as string);
    if (!sourceUrl) throw new Error('缺少参考图，禁止空成功');
    const styleRes = await api.extractStyle(sourceUrl);
    if (!styleRes.ok || !styleRes.combinedPrompt?.trim()) {
      throw new Error(
        (styleRes as { message?: string }).message ?? '风格提取失败（无可用 style/scene），禁止空成功',
      );
    }
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
    if (!String(text ?? '').trim()) throw new Error('标签工坊文本为空，禁止空成功');
    updateNodeData(block.id, { status: 'success', output: text, content: text });
    return;
  }

  if (kind === 'batch-runner') {
    const pictures = upstream.pictures;
    if (pictures.length === 0) throw new Error('无上游图片，禁止空成功');
    const mode = (d.mode as string) ?? 'resize';
    const out: string[] = [];
    for (const url of pictures) {
      if (mode === 'resize') {
        const res = await api.resizeImage({ sourceUrl: url, width: 1024, height: 1024 });
        if (!res.ok || !res.url) throw new Error('批量缩放失败，禁止空成功');
        out.push(res.url);
      } else if (mode === 'grid-split') {
        const res = await api.gridSplit({ sourceUrl: url, rows: 2, cols: 2 });
        if (!res.ok || !res.urls?.length) throw new Error('批量宫格拆分失败，禁止空成功');
        out.push(...res.urls);
      } else {
        const res = await api.reversePrompt(url);
        if (!res.ok || !res.prompt?.trim()) {
          throw new Error((res as { message?: string }).message ?? `反推失败：${url}，禁止空成功`);
        }
        out.push(res.prompt);
      }
    }
    if (out.length === 0) throw new Error('批量处理无有效产物，禁止空成功');
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
    if (!sourceUrl) throw new Error('缺少宫格/分镜图，禁止空成功');
    const res = await api.gridReversePrompts({
      sourceUrl,
      rows: (d.rows as number) ?? 3,
      cols: (d.cols as number) ?? 3,
      storyPrompt: mergeUpstreamPrompt(upstream, d.storyPrompt as string | undefined) || undefined,
    });
    const usable = (res.cells ?? []).filter(
      (c) => Boolean(c.imagePrompt?.trim() || c.videoPrompt?.trim()),
    );
    if (usable.length === 0) {
      throw new Error('宫格反推无可用提示词（可能全部解析失败），禁止空成功');
    }
    updateNodeData(block.id, {
      status: 'success',
      gridCells: res.cells,
      splitUrls: res.splitUrls,
      pictures: res.splitUrls,
      content: res.cells.map((c) => c.videoPrompt || c.imagePromptZh || '').join('\n\n'),
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
    if (!res.ok || !res.url) throw new Error('Fal 未返回图片，禁止空成功');
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
    if (!sourceUrl) throw new Error('缺少图片，禁止空成功');
    const res = await api.topazGigapixel({
      sourceUrl,
      scale: (d.scale as number) ?? 2,
      model: (d.model as string) ?? 'std',
      executablePath: (d.executablePath as string) || undefined,
    });
    if (!res.ok || !res.url) throw new Error('Topaz 放大失败，禁止空成功');
    updateNodeData(block.id, {
      status: 'success',
      previewUrl: res.url,
      outputUrl: res.url,
    });
    return;
  }

  if (kind === 'topaz-clip') {
    const sourceUrl = upstream.clips[0] || (d.videoUrl as string);
    if (!sourceUrl) throw new Error('缺少视频，禁止空成功');
    const res = await api.topazVideo({
      sourceUrl,
      upscaleModel: (d.upscaleModel as string) ?? 'iris-3',
      upscaleFactor: (d.upscaleFactor as number) ?? 2,
      enableInterpolation: Boolean(d.enableInterpolation),
      topazVideoPath: (d.topazVideoPath as string) || undefined,
    });
    if (!res.ok || !res.url) throw new Error('Topaz 视频处理失败，禁止空成功');
    updateNodeData(block.id, {
      status: 'success',
      videoUrl: res.url,
      outputUrl: res.url,
    });
    return;
  }

  if (kind === 'control-preprocess') {
    const src = upstream.pictures[0] || (d.imageUrl as string);
    if (!src) throw new Error('ControlNet 缺少上游图片，禁止空成功');
    const mode = (d.mode as string) ?? 'depth';
    if (mode === 'depth') {
      const r = await api.generateDepthPass({ sourceUrl: src });
      if (!r.ok || !r.depthUrl) throw new Error(r.message ?? '深度预处理失败，禁止空成功');
      updateNodeData(block.id, { status: 'success', previewUrl: r.depthUrl, output: r.depthUrl, meta: { mode } });
    } else if (mode === 'canny') {
      const r = await api.proxyFal({ model: 'fal-ai/image-to-canny', input: { image_url: src } });
      if (!r.ok || !r.url) throw new Error('Canny 预处理失败，禁止空成功');
      updateNodeData(block.id, { status: 'success', previewUrl: r.url, output: r.url, meta: { mode } });
    } else throw new Error(`未知 ControlNet 模式: ${mode}，禁止空成功`);
    return;
  }

  if (kind === 'reference-analyze') {
    const url = upstream.clips[0] || (d.videoUrl as string);
    if (!url) throw new Error('参考反推缺少上游视频，禁止空成功');
    const notes = (d.notes as string) ?? '';
    const res = await api.analyzeReferenceVideo({ videoUrl: url, notes: notes || undefined, targetShotCount: 5 });
    if (!res.ok || !String(res.markdown ?? '').trim()) {
      throw new Error(res.message ?? '参考反推未解析出分镜表，禁止空成功');
    }
    updateNodeData(block.id, {
      status: 'success',
      analyzeResult: res.markdown,
      output: res.markdown,
      content: res.markdown,
      shots: res.shots,
    });
    return;
  }
}
