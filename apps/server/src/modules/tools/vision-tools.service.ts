import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { GatewayService } from '../gateway/gateway.service';
import { resolveMediaUrl } from '../../common/media-path';

@Injectable()
export class VisionToolsService {
  constructor(private readonly gateway: GatewayService) {}

  private imageUrlForVision(url: string): string {
    const local = resolveMediaUrl(url);
    if (!local) return url;
    const buf = readFileSync(local);
    const ext = local.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
    return `data:image/${ext};base64,${buf.toString('base64')}`;
  }

  private async visionJson(imageUrl: string, instruction: string) {
    const visionUrl = this.imageUrlForVision(imageUrl);
    const res = (await this.gateway.proxyLlm({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: instruction },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this image.' },
            { type: 'image_url', image_url: { url: visionUrl } },
          ],
        },
      ],
    })) as { choices?: { message?: { content?: string } }[] };
    const raw = res.choices?.[0]?.message?.content ?? '{}';
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { prompt: raw, summary: raw };
    }
  }

  async reversePrompt(imageUrl: string) {
    const data = await this.visionJson(
      imageUrl,
      'Output JSON: {"prompt":"detailed English image generation prompt","tags":["..."],"style":"..."}',
    );
    return {
      ok: true,
      prompt: String(data.prompt ?? ''),
      tags: Array.isArray(data.tags) ? data.tags : [],
      style: String(data.style ?? ''),
    };
  }

  async extractStyle(imageUrl: string) {
    const data = await this.visionJson(
      imageUrl,
      'Separate style from content. JSON: {"styleTokens":"reusable English style description","sceneTokens":"subject and scene only","negativePrompt":"things to avoid"}',
    );
    return {
      ok: true,
      styleTokens: String(data.styleTokens ?? ''),
      sceneTokens: String(data.sceneTokens ?? ''),
      negativePrompt: String(data.negativePrompt ?? ''),
      combinedPrompt: [data.styleTokens, data.sceneTokens].filter(Boolean).join(', '),
    };
  }

  async quickMontage(topic: string, durationSec = 30) {
    const res = (await this.gateway.proxyLlm({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `你是短视频导演（对标智能成片）。根据主题生成 ${Math.max(3, Math.min(12, Math.round(durationSec / 5)))} 个镜头的 Markdown 分镜表。
表头：| 镜号 | 景别 | 画面描述 | 英文提示词 | 时长 |
只输出表格。`,
        },
        { role: 'user', content: `主题：${topic}\n目标时长约 ${durationSec} 秒` },
      ],
    })) as { choices?: { message?: { content?: string } }[] };
    const markdown = res.choices?.[0]?.message?.content ?? '';
    return { ok: Boolean(markdown.trim()), markdown, topic, durationSec };
  }

  async replicateVideoPlan(url: string, notes?: string) {
    const res = (await this.gateway.proxyLlm({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            '你是爆款视频复刻分析师（对标小云雀/LibTV）。根据链接与备注，输出 JSON：{"title":"","rhythm":"剪辑节奏描述","structure":["段落1","段落2"],"storyboardMarkdown":"完整分镜 Markdown 表","promptPack":"英文风格 prompt 摘要"}',
        },
        {
          role: 'user',
          content: [`参考链接: ${url}`, notes ? `备注: ${notes}` : ''].filter(Boolean).join('\n'),
        },
      ],
    })) as { choices?: { message?: { content?: string } }[] };
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(res.choices?.[0]?.message?.content ?? '{}');
    } catch {
      parsed = {};
    }
    return {
      ok: true,
      url,
      title: String(parsed.title ?? url),
      rhythm: String(parsed.rhythm ?? ''),
      structure: Array.isArray(parsed.structure) ? parsed.structure : [],
      storyboardMarkdown: String(parsed.storyboardMarkdown ?? ''),
      promptPack: String(parsed.promptPack ?? ''),
    };
  }
}
