import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { GatewayService } from '../gateway/gateway.service';

export interface EditMaskedBody {
  imageUrl: string;
  maskUrl: string;
  prompt: string;
  engine?: 'gemini-edit' | 'fal-inpaint';
  referenceImageUrls?: string[];
}

/**
 * SE-SPEC-01: 智能替换蒙版编辑专用契约。
 * mask + prompt + engine 缺一即稳定 400；不静默降级为无蒙版的全图编辑。
 */
@Controller('api/picture')
export class PictureController {
  constructor(private readonly gateway: GatewayService) {}

  @Post('edit-masked')
  editMasked(@Body() body: EditMaskedBody) {
    const imageUrl = String(body?.imageUrl ?? '').trim();
    const maskUrl = String(body?.maskUrl ?? '').trim();
    const prompt = String(body?.prompt ?? '').trim();
    if (!imageUrl || !maskUrl || !prompt) {
      throw new BadRequestException('edit-masked 需要 imageUrl、maskUrl 与 prompt');
    }
    const engine = body?.engine === 'fal-inpaint' ? 'fal-inpaint' : 'gemini-edit';
    const refs = Array.isArray(body?.referenceImageUrls)
      ? body.referenceImageUrls.filter(
          (u): u is string => typeof u === 'string' && Boolean(u.trim()),
        )
      : [];

    if (engine === 'fal-inpaint') {
      return this.gateway.proxyFal({
        model: 'fal-ai/fast-sdxl/inpainting',
        input: { image_url: imageUrl, mask_url: maskUrl, prompt },
      });
    }
    return this.gateway.proxyImage({
      prompt,
      model: 'gemini-2.5-flash-image',
      referenceImageUrls: [imageUrl, ...refs],
      n: 1,
    });
  }
}
