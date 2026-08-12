/**
 * VG-02/03/04 + VG-13/14: 视频请求体扩展参数归一化，以及参考媒体可达性判定。
 * 把客户端的 seed / negativePrompt / modelParams / generateAudio / lastFrameUrl
 * 映射进 OpenAI 兼容 /videos/generations payload。
 */

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** 本机相对路径 / loopback HTTP，云端 provider 读不到 */
export function isLocallyBoundMediaUrl(url: string): boolean {
  const u = (url || '').trim();
  if (!u) return false;
  if (u.startsWith('/media/') || u.startsWith('file:')) return true;
  if (!/^https?:\/\//i.test(u)) return false;
  try {
    const host = new URL(u).hostname.toLowerCase();
    return LOOPBACK_HOSTS.has(host);
  } catch {
    return false;
  }
}

/** 本地媒体路径 → MIME（含视频，避免 mp4 被当成 jpeg） */
export function mimeFromMediaPath(path: string): string {
  const lower = (path.split('?')[0] ?? '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.m4v')) return 'video/x-m4v';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  return 'application/octet-stream';
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((u): u is string => typeof u === 'string' && Boolean(u.trim()))
    : [];
}

/**
 * VG-14: 请求是否携带参考图/参考视频/尾帧。
 * Magic Hour 吃不到这些字段，有则禁止回落。
 */
export function videoRequestNeedsReferenceChannel(body: Record<string, unknown>): boolean {
  const last = typeof body.lastFrameUrl === 'string' ? body.lastFrameUrl.trim() : '';
  return stringList(body.referenceImages).length > 0
    || stringList(body.referenceVideos).length > 0
    || Boolean(last);
}

/** 解析 Provider 参数（JSON 或 key=value[,;换行分隔]），失败返回 null */
export function parseModelParams(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const text = raw.trim();
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  const out: Record<string, unknown> = {};
  for (const pair of text.split(/[,;\n]+/)) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!key) continue;
    if (value === 'true') out[key] = true;
    else if (value === 'false') out[key] = false;
    else if (value !== '' && Number.isFinite(Number(value))) out[key] = Number(value);
    else out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

/** 不允许被 modelParams 覆盖的核心键 */
const PROTECTED_KEYS = new Set(['model', 'prompt']);

/**
 * 把扩展参数写入 payload（原地修改并返回）。
 * modelParams 最先合并，显式字段（seed / negative_prompt 等）优先级更高。
 */
export function applyVideoPayloadExtras(
  payload: Record<string, unknown>,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const params = parseModelParams(body.modelParams);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (PROTECTED_KEYS.has(key)) continue;
      payload[key] = value;
    }
  }

  const seed = Number(body.seed);
  if (body.seed !== undefined && body.seed !== null && body.seed !== '' && Number.isFinite(seed)) {
    payload.seed = seed;
  }

  const negative = typeof body.negativePrompt === 'string' ? body.negativePrompt.trim() : '';
  if (negative) payload.negative_prompt = negative;

  if (typeof body.generateAudio === 'boolean') {
    payload.generate_audio = body.generateAudio;
  }

  const lastFrame = typeof body.lastFrameUrl === 'string' ? body.lastFrameUrl.trim() : '';
  if (lastFrame) {
    payload.last_frame_url = lastFrame;
    payload.last_frame = { url: lastFrame };
  }

  return payload;
}
