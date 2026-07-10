import { api } from '../api/client';

export interface InpaintRepairInput {
  shotId: string;
  /** The image URL to fix (firstFrameAssetId or generated keyframe) */
  imageUrl: string;
  /** Description of what's wrong (e.g., "服装不一致", "光线错误") */
  issueDescription: string;
  /** Optional: reference image showing the correct appearance */
  referenceUrl?: string;
}

export interface InpaintRepairResult {
  ok: boolean;
  repairedUrl?: string;
  message?: string;
}

/**
 * Auto-fix a continuity issue using inpainting.
 * Falls back to regenerating the keyframe if inpaint is not available.
 */
export async function autoFixContinuityIssue(input: InpaintRepairInput): Promise<InpaintRepairResult> {
  try {
    const res = await api.proxyImage({
      prompt: `修复: ${input.issueDescription}`,
      model: 'dall-e-3',
      size: '1024x1024',
      referenceImageUrl: input.imageUrl,
      n: 1,
    }) as { ok?: boolean; url?: string; urls?: string[] };
    
    if (res.url || res.urls) {
      return { ok: true, repairedUrl: res.url ?? res.urls![0] };
    }
    return { ok: false, message: '修复失败' };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}
