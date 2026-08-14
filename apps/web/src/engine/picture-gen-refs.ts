/**
 * PG-14 / PG-22 / PG-26：按 provider 限额打包参考图，并让发送集合与模式判定同源。
 *
 * - gemini 原生最多 3 张、openai 4 张；超出在客户端裁剪，避免服务端静默丢图
 * - 风格图排在主参考之后的安全位，避免被截在数组末尾
 * - 风格注记按下标指认；仅风格图时声明 style-only，避免被当主体编辑
 * - 角色定妆 / 场景图若注入，则升为图生图并进入可见参考；镜头已有 firstFrame 永不静默当主参考
 */
import {
  inferBasicPictureGenMode,
  isSpecializedPictureMode,
  resolveRuntimePictureGenMode,
  type PictureGenMode,
} from './stage-deck/chrome/attached-workspace/generation/picture/picture-gen-modes';

export const PROVIDER_NATIVE_REF_LIMIT: Record<string, number> = {
  gemini: 3,
  openai: 4,
  fal: 1,
  magichour: 0,
};

export interface PackedPictureRefs {
  primary?: string;
  extras: string[];
  style?: string;
  /** 风格图在实际发送列表中的 1-based 下标；未入列则为 null */
  styleSlot: number | null;
  truncatedCount: number;
  /** 注入 prompt 的风格注记（无风格或风格已被裁掉则为 null） */
  styleNote: string | null;
  /** 发给模型的有序列表（primary + extras） */
  sent: string[];
}

export type PictureInjectedRefRole = 'character' | 'environment';

export interface PictureInjectedRef {
  url: string;
  role: PictureInjectedRefRole;
}

export interface PictureSendRefs {
  mode: PictureGenMode;
  primary?: string;
  extras: string[];
  injected: PictureInjectedRef[];
  /** 用于模式判定的全部可见 URL（含风格 + 注入） */
  visibleForMode: string[];
}

function uniqueUrls(urls: Array<string | undefined | null>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const url = raw?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

export function providerRefLimit(provider: string | undefined): number {
  if (!provider) return 9;
  return PROVIDER_NATIVE_REF_LIMIT[provider] ?? 9;
}

export function packPictureRefs(opts: {
  provider: string | undefined;
  primary?: string | null;
  extras?: Array<string | undefined | null>;
  style?: string | null;
}): PackedPictureRefs {
  const limit = providerRefLimit(opts.provider);
  const primary = opts.primary?.trim() || undefined;
  const style = opts.style?.trim() || undefined;
  const extraOnly = uniqueUrls(opts.extras ?? []).filter(
    (u) => u !== primary && u !== style,
  );

  // 顺序：主参考 → 风格图（截断安全位）→ 其余额外参考
  const ordered = uniqueUrls([primary, style && style !== primary ? style : undefined, ...extraOnly]);
  const sent = limit <= 0 ? [] : ordered.slice(0, limit);
  const truncatedCount = Math.max(0, ordered.length - sent.length);

  const styleSlot = style ? (() => {
    const idx = sent.indexOf(style);
    return idx >= 0 ? idx + 1 : null;
  })() : null;

  let styleNote: string | null = null;
  if (style && styleSlot != null) {
    const styleOnly = sent.length === 1 && sent[0] === style;
    styleNote = styleOnly
      ? '[The attached reference is style-only; match its visual style, do not copy its subject]'
      : `[Reference image ${styleSlot} is a style reference; match its visual style, not its subject]`;
  }

  return {
    primary: sent[0],
    extras: sent.slice(1),
    style,
    styleSlot,
    truncatedCount,
    styleNote,
    sent,
  };
}

/**
 * PG-26：发送参考与模式判定同源。
 * - 用户可见：上传 / 上游 / @提及 / 本 job 图
 * - 角色定妆、场景图若注入，则进入可见集合并可能把文生图升为图生图
 * - 镜头已有 firstFrame 不传入本函数，避免静默图生图
 * - 全景 / 锁定的文生图专业动作不注入定妆图
 */
export function resolvePictureSendRefs(opts: {
  data: Record<string, unknown>;
  nodeRef?: string | null;
  multiRefs?: Array<string | undefined | null>;
  styleImageUrl?: string | null;
  upstreamPics?: Array<string | undefined | null>;
  mentionRefs?: Array<string | undefined | null>;
  jobImageUrls?: Array<string | undefined | null>;
  characterRef?: string | null;
  envRef?: string | null;
}): PictureSendRefs {
  const nodeRef = opts.nodeRef?.trim() || undefined;
  const style = opts.styleImageUrl?.trim() || undefined;
  const multiRefs = uniqueUrls(opts.multiRefs ?? []);
  const upstreamPics = uniqueUrls(opts.upstreamPics ?? []);
  const mentionRefs = uniqueUrls(opts.mentionRefs ?? []);
  const jobImageUrls = uniqueUrls(opts.jobImageUrls ?? []);
  const rawCharacterRef = opts.characterRef?.trim() || undefined;
  const rawEnvRef = opts.envRef?.trim() || undefined;
  const excludedRefs = new Set(
    Array.isArray(opts.data.excludedRefUrls)
      ? (opts.data.excludedRefUrls as string[]).filter(Boolean)
      : [],
  );
  // PG-38: 用户显式排除的注入参考不再进发送集合
  const characterRef = rawCharacterRef && !excludedRefs.has(rawCharacterRef) ? rawCharacterRef : undefined;
  const envRef = rawEnvRef && !excludedRefs.has(rawEnvRef) ? rawEnvRef : undefined;
  const proActionId = opts.data.pictureProAction as string | undefined;

  const userSubject = uniqueUrls([
    ...jobImageUrls,
    ...mentionRefs,
    nodeRef,
    ...multiRefs,
    ...upstreamPics,
  ]);
  const visibleForMode = uniqueUrls([...userSubject, style]);
  let mode = resolveRuntimePictureGenMode(opts.data, visibleForMode);

  const injected: PictureInjectedRef[] = [];
  const lockText =
    isSpecializedPictureMode(mode, proActionId) && mode === 'text-to-image';
  const canInject = mode !== 'panorama-720' && !lockText;
  if (canInject) {
    if (characterRef && !userSubject.includes(characterRef) && characterRef !== style) {
      injected.push({ url: characterRef, role: 'character' });
    }
    if (
      envRef &&
      !userSubject.includes(envRef) &&
      envRef !== style &&
      envRef !== characterRef
    ) {
      injected.push({ url: envRef, role: 'environment' });
    }
  }

  if (injected.length > 0 && !isSpecializedPictureMode(mode, proActionId)) {
    mode = inferBasicPictureGenMode(visibleForMode.length + injected.length);
  }

  if (mode === 'text-to-image' || mode === 'panorama-720') {
    return { mode, primary: undefined, extras: [], injected: [], visibleForMode };
  }

  const injectedUrls = injected.map((i) => i.url);
  const primary =
    jobImageUrls[0] ||
    mentionRefs[0] ||
    nodeRef ||
    multiRefs[0] ||
    upstreamPics[0] ||
    injectedUrls[0];
  const extras = uniqueUrls([
    ...multiRefs,
    ...mentionRefs,
    ...upstreamPics,
    ...jobImageUrls,
    ...injectedUrls,
  ]).filter((u) => u !== primary);

  return {
    mode,
    primary,
    extras,
    injected,
    visibleForMode: uniqueUrls([...visibleForMode, ...injectedUrls]),
  };
}

export function uniqueLibraryLabel(base: string, existingLabels: string[]): string {
  const trimmed = base.trim() || '生成图';
  const set = new Set(existingLabels);
  if (!set.has(trimmed)) return trimmed;
  let n = 2;
  while (set.has(`${trimmed} ${n}`)) n += 1;
  return `${trimmed} ${n}`;
}
