/**
 * 链接解析支持平台矩阵（F-031）— 前后端与设置文案同源。
 */
export interface LinkParserPlatform {
  id: string;
  label: string;
  /** 主机/路径匹配（任一命中即视为该平台） */
  hostPatterns: RegExp[];
  /** 示例 URL（覆盖矩阵测例） */
  sampleUrls: string[];
  notes?: string;
}

export const LINK_PARSER_PLATFORMS: LinkParserPlatform[] = [
  {
    id: 'douyin',
    label: '抖音',
    hostPatterns: [/douyin\.com/i, /iesdouyin\.com/i],
    sampleUrls: ['https://www.douyin.com/video/7123456789012345678'],
  },
  {
    id: 'bilibili',
    label: 'B站',
    hostPatterns: [/bilibili\.com/i, /b23\.tv/i],
    sampleUrls: ['https://www.bilibili.com/video/BV1xx411c7mD', 'https://b23.tv/abcdef'],
  },
  {
    id: 'xiaohongshu',
    label: '小红书',
    hostPatterns: [/xiaohongshu\.com/i, /xhslink\.com/i],
    sampleUrls: ['https://www.xiaohongshu.com/explore/64abcdef0123456789abcdef'],
  },
  {
    id: 'weibo',
    label: '微博',
    hostPatterns: [/weibo\.com/i],
    sampleUrls: ['https://weibo.com/1234567890/AbCdEfGhI'],
  },
  {
    id: 'youtube',
    label: 'YouTube',
    hostPatterns: [/youtube\.com/i, /youtu\.be/i],
    sampleUrls: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ'],
  },
  {
    id: 'x-twitter',
    label: 'X/Twitter',
    hostPatterns: [/\bx\.com\b/i, /twitter\.com/i, /\bt\.co\b/i],
    sampleUrls: ['https://x.com/user/status/1234567890', 'https://twitter.com/user/status/123'],
  },
  {
    id: 'instagram',
    label: 'Instagram',
    hostPatterns: [/instagram\.com/i],
    sampleUrls: ['https://www.instagram.com/p/AbCdEfGhIjK/'],
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    hostPatterns: [/tiktok\.com/i],
    sampleUrls: ['https://www.tiktok.com/@user/video/7123456789012345678'],
  },
];

export function detectLinkParserPlatform(url: string): LinkParserPlatform | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  for (const p of LINK_PARSER_PLATFORMS) {
    if (p.hostPatterns.some((re) => re.test(trimmed))) return p;
  }
  return null;
}

export function isSupportedLinkParserUrl(url: string): boolean {
  return detectLinkParserPlatform(url) != null;
}

/** 设置页 / 错误提示同源文案 */
export function formatLinkParserSupportedLabel(): string {
  return LINK_PARSER_PLATFORMS.map((p) => p.label).join('/');
}

export type LinkParseErrorCode =
  | 'UNSUPPORTED_HOST'
  | 'NETWORK'
  | 'PARSE'
  | 'AUTH'
  | 'TIMEOUT';

export function mapLinkParseErrorCode(code: string): string {
  const supported = formatLinkParserSupportedLabel();
  const map: Record<string, string> = {
    UNSUPPORTED_HOST: `暂不支持解析此平台。支持：${supported}`,
    NETWORK: '网络请求失败，请检查网络后重试',
    PARSE: '链接内容解析失败，链接可能已失效',
    AUTH: '该平台需要登录才能访问，请手动上传素材',
    TIMEOUT: '解析超时（30s），请稍后重试',
  };
  return map[code] ?? `解析失败：${code}`;
}

/**
 * 校验 URL：非 http(s) 或不在矩阵内 → UNSUPPORTED_HOST。
 * 矩阵外 http(s) 仍可走通用 LLM 解析（返回 platform=null），由调用方决定是否放行。
 */
export function classifyLinkParserUrl(
  url: string,
  opts?: { requireNamedPlatform?: boolean },
):
  | { ok: true; platform: LinkParserPlatform | null }
  | { ok: false; code: LinkParseErrorCode; message: string } {
  const trimmed = url.trim();
  if (!trimmed) {
    return { ok: false, code: 'PARSE', message: mapLinkParseErrorCode('PARSE') };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, code: 'UNSUPPORTED_HOST', message: mapLinkParseErrorCode('UNSUPPORTED_HOST') };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, code: 'UNSUPPORTED_HOST', message: mapLinkParseErrorCode('UNSUPPORTED_HOST') };
  }
  const platform = detectLinkParserPlatform(trimmed);
  if (opts?.requireNamedPlatform && !platform) {
    return { ok: false, code: 'UNSUPPORTED_HOST', message: mapLinkParseErrorCode('UNSUPPORTED_HOST') };
  }
  return { ok: true, platform };
}
