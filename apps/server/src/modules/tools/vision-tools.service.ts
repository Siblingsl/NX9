import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { GatewayService } from '../gateway/gateway.service';
import { resolveMediaUrl } from '../../common/media-path';

/** 去 markdown 围栏后提取 JSON 对象；失败返回 null（禁止空对象假成功）。 */
function extractLlmJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const tryParse = (input: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(input) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(candidate);
  if (direct) return direct;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) return tryParse(candidate.slice(start, end + 1));
  return null;
}

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

  private async visionJson(imageUrl: string, instruction: string): Promise<{
    data: Record<string, unknown>;
    parseFailed: boolean;
    raw: string;
  }> {
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
    const raw = res.choices?.[0]?.message?.content ?? '';
    const data = extractLlmJsonObject(raw);
    if (!data) {
      return { data: {}, parseFailed: true, raw };
    }
    return { data, parseFailed: false, raw };
  }

  async reversePrompt(imageUrl: string) {
    const { data, parseFailed } = await this.visionJson(
      imageUrl,
      'Output JSON: {"prompt":"detailed English image generation prompt","tags":["..."],"style":"..."}',
    );
    const prompt = String(data.prompt ?? '').trim();
    if (parseFailed || !prompt) {
      return {
        ok: false as const,
        prompt: '',
        tags: [] as string[],
        style: '',
        message: parseFailed
          ? 'LLM 返回无法解析为 JSON，反推失败，禁止空成功'
          : 'LLM JSON 缺少 prompt 字段，禁止空成功',
      };
    }
    return {
      ok: true as const,
      prompt,
      tags: Array.isArray(data.tags) ? data.tags.filter((t): t is string => typeof t === 'string') : [],
      style: String(data.style ?? ''),
    };
  }

  async extractStyle(imageUrl: string) {
    const { data, parseFailed } = await this.visionJson(
      imageUrl,
      'Separate style from content. JSON: {"styleTokens":"reusable English style description","sceneTokens":"subject and scene only","negativePrompt":"things to avoid"}',
    );
    const styleTokens = String(data.styleTokens ?? '').trim();
    const sceneTokens = String(data.sceneTokens ?? '').trim();
    const negativePrompt = String(data.negativePrompt ?? '').trim();
    const combinedPrompt = [styleTokens, sceneTokens].filter(Boolean).join(', ');
    if (parseFailed || !combinedPrompt) {
      return {
        ok: false as const,
        styleTokens: '',
        sceneTokens: '',
        negativePrompt: '',
        combinedPrompt: '',
        message: parseFailed
          ? 'LLM 返回无法解析为 JSON，风格提取失败，禁止空成功'
          : 'LLM JSON 缺少可用的 style/scene 字段，禁止空成功',
      };
    }
    return {
      ok: true as const,
      styleTokens,
      sceneTokens,
      negativePrompt,
      combinedPrompt,
    };
  }

  async analyzeFaces(imageUrl: string) {
    const { data, parseFailed } = await this.visionJson(
      imageUrl,
      `Analyze visible human-like faces for storyboard pre-visualization. Do not identify real people.
Output JSON exactly as:
{"faces":[{"box":{"x":0,"y":0,"width":0,"height":0},"expression":"neutral|happy|sad|angry|surprised|fearful|disgusted|focused","confidence":0,"description":"visible expression cues"}],"summary":"overall performance note"}
Box values are normalized from 0 to 1 relative to image width/height. If no face is visible, return {"faces":[],"summary":"未检测到可见人脸"}.`,
    );
    if (parseFailed) {
      return {
        ok: false as const,
        faces: [] as Array<{
          id: string;
          box: { x: number; y: number; width: number; height: number };
          expression: string;
          confidence: number;
          description: string;
        }>,
        summary: 'LLM 返回无法解析为 JSON，表情分析失败（未假装无人脸），禁止空成功',
        analyzedAt: new Date().toISOString(),
      };
    }
    const rawFaces = Array.isArray(data.faces) ? data.faces : [];
    const faces = rawFaces.slice(0, 12).map((item, index) => {
      const face = (item ?? {}) as Record<string, unknown>;
      const box = (face.box ?? {}) as Record<string, unknown>;
      const clamp = (value: unknown) => Math.max(0, Math.min(1, Number(value) || 0));
      const x = clamp(box.x);
      const y = clamp(box.y);
      return {
        id: `face-${index + 1}`,
        box: {
          x,
          y,
          width: Math.min(1 - x, Math.max(0.01, clamp(box.width))),
          height: Math.min(1 - y, Math.max(0.01, clamp(box.height))),
        },
        expression: String(face.expression ?? 'neutral'),
        confidence: Math.max(0, Math.min(1, Number(face.confidence) || 0)),
        description: String(face.description ?? ''),
      };
    });
    return {
      ok: true as const,
      faces,
      summary: String(data.summary ?? (faces.length ? '已完成表情分析' : '未检测到可见人脸')),
      analyzedAt: new Date().toISOString(),
    };
  }

  async quickMontage(topic: string, durationSec = 30) {
    const res = (await this.gateway.proxyLlm({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `你是短视频导演。根据主题生成 ${Math.max(3, Math.min(12, Math.round(durationSec / 5)))} 个镜头的 Markdown 分镜表。
表头：| 镜号 | 景别 | 画面描述 | 英文提示词 | 时长 |
只输出表格。`,
        },
        { role: 'user', content: `主题：${topic}\n目标时长约 ${durationSec} 秒` },
      ],
    })) as { choices?: { message?: { content?: string } }[] };
    const markdown = res.choices?.[0]?.message?.content ?? '';
    if (!markdown.trim()) {
      return { ok: false, markdown: '', topic, durationSec, message: '快捷分镜未返回内容，禁止空成功' };
    }
    return { ok: true, markdown, topic, durationSec };
  }

  async replicateVideoPlan(url: string, notes?: string) {
    const target = (url ?? '').trim();
    if (!target) {
      return { ok: false, url: '', title: '', rhythm: '', structure: [], storyboardMarkdown: '', promptPack: '', message: '参考链接为空，禁止空成功' };
    }
    const res = (await this.gateway.proxyLlm({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            '你是爆款视频复刻分析师。根据链接与备注，输出 JSON：{"title":"","rhythm":"剪辑节奏描述","structure":["段落1","段落2"],"storyboardMarkdown":"完整分镜 Markdown 表","promptPack":"英文风格 prompt 摘要"}',
        },
        {
          role: 'user',
          content: [`参考链接: ${target}`, notes ? `备注: ${notes}` : ''].filter(Boolean).join('\n'),
        },
      ],
    })) as { choices?: { message?: { content?: string } }[] };

    const raw = res.choices?.[0]?.message?.content ?? '';
    const parsed = extractLlmJsonObject(raw);
    if (!parsed) {
      return {
        ok: false,
        url: target,
        title: '',
        rhythm: '',
        structure: [],
        storyboardMarkdown: '',
        promptPack: '',
        message: 'LLM 返回无法解析为 JSON，禁止空成功',
      };
    }

    const title = String(parsed.title ?? '').trim();
    const rhythm = String(parsed.rhythm ?? '').trim();
    const structure = Array.isArray(parsed.structure)
      ? parsed.structure.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [];
    const storyboardMarkdown = String(parsed.storyboardMarkdown ?? '').trim();
    const promptPack = String(parsed.promptPack ?? '').trim();
    const hasSubstance =
      Boolean(storyboardMarkdown) || Boolean(rhythm) || structure.length > 0 || Boolean(promptPack);
    if (!hasSubstance) {
      return {
        ok: false,
        url: target,
        title,
        rhythm,
        structure,
        storyboardMarkdown,
        promptPack,
        message: 'LLM JSON 缺少可复用的复刻内容（分镜/节奏/结构均为空），禁止空成功',
      };
    }

    return {
      ok: true,
      url: target,
      title: title || target,
      rhythm,
      structure,
      storyboardMarkdown,
      promptPack,
    };
  }
}
