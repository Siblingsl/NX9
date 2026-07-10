const URL_IN_TEXT_RE = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

/** Strip trailing punctuation often glued to share-text URLs. */
function cleanUrlToken(raw: string): string {
  return raw.replace(/[.,;:!?)]+$/g, '');
}

/** Extract the first http(s) URL from plain text or share copy (e.g. Douyin). */
export function extractUrlFromText(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('URL 为空');

  try {
    return new URL(trimmed).href;
  } catch {
    // Not a bare URL — fall through to regex extraction.
  }

  const match = trimmed.match(URL_IN_TEXT_RE);
  if (!match?.[0]) throw new Error('未在文本中找到有效链接，请粘贴 http(s) 链接');

  return cleanUrlToken(match[0]);
}

export async function fetchRemote(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? 15000;
  const { timeoutMs: _timeout, ...rest } = init ?? {};

  try {
    return await fetch(url, {
      ...rest,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: '*/*',
        ...rest.headers,
      },
      signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
      redirect: rest.redirect ?? 'follow',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`网络请求失败: ${msg}`);
  }
}
