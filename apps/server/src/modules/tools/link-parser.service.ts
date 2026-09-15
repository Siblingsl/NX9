import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { classifyLinkParserUrl, detectLinkParserPlatform } from '@nx9/shared';
import { GatewayService } from '../gateway/gateway.service';
import { extractUrlFromText, fetchRemote } from '../../common/url-utils';

@Injectable()
export class LinkParserService {
  constructor(private readonly gateway: GatewayService) {}

  async parseLink(url: string, hint?: string) {
    const trimmed = extractUrlFromText(url);
    const classified = classifyLinkParserUrl(trimmed);
    if (!classified.ok) {
      throw new HttpException(
        `${classified.message} (${classified.code})`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    let title = '';
    let description = '';
    try {
      const res = await fetchRemote(trimmed, { timeoutMs: 8000 });
      const html = await res.text();
      const ogTitle = html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1];
      const ogDesc = html.match(/property=["']og:description["']\s+content=["']([^"']+)["']/i)?.[1];
      const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
      title = (ogTitle || titleTag || '').trim();
      description = (ogDesc || '').trim();
    } catch {
      // network fetch optional — LLM fallback below
    }

    const llmRes = (await this.gateway.proxyLlm({
      messages: [
        {
          role: 'system',
          content:
            '你是自媒体链接分析助手。根据 URL 和页面元信息，输出 JSON：{"title":"","summary":"","prompt":"","mediaKind":"picture|clip|sound|none"}。prompt 为可用于 AI 创作的英文提示词摘要，mediaKind 推断内容类型。',
        },
        {
          role: 'user',
          content: [
            `URL: ${trimmed}`,
            title ? `页面标题: ${title}` : '',
            description ? `描述: ${description}` : '',
            hint ? `用户备注: ${hint}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
    })) as { choices?: { message?: { content?: string } }[] };

    let parsed: {
      title?: string;
      summary?: string;
      prompt?: string;
      mediaKind?: string;
    } = {};
    try {
      const raw = llmRes.choices?.[0]?.message?.content ?? '{}';
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      parsed = { title: title || trimmed, summary: description, prompt: hint ?? title };
    }

    const platform = classified.platform ?? detectLinkParserPlatform(trimmed);
    const outPrompt = String(parsed.prompt || parsed.summary || title || hint || '').trim();
    if (!outPrompt) {
      // 无可用 prompt 时禁止 ok:true 空成功（前端也会拒，此处双端门禁）
      throw new HttpException(
        '链接解析失败或结果为空，禁止空成功 (PARSE_EMPTY)',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return {
      ok: true,
      url: trimmed,
      title: parsed.title || title || trimmed,
      summary: parsed.summary || description || '',
      prompt: outPrompt,
      mediaKind: parsed.mediaKind || 'none',
      platform: platform?.id ?? null,
      platformLabel: platform?.label ?? null,
    };
  }
}
