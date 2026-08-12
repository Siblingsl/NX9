/**
 * VG-02/03/04: 视频请求扩展参数归一化（seed / negative_prompt / modelParams /
 * generate_audio / last_frame_url → OpenAI 兼容 payload）
 */
import { describe, expect, it } from 'vitest';
import {
  applyVideoPayloadExtras,
  isLocallyBoundMediaUrl,
  mimeFromMediaPath,
  parseModelParams,
  videoRequestNeedsReferenceChannel,
} from '../src/modules/gateway/video-payload.util';

describe('parseModelParams', () => {
  it('JSON 对象', () => {
    expect(parseModelParams('{"cfg_scale":7.5,"watermark":false}')).toEqual({
      cfg_scale: 7.5,
      watermark: false,
    });
  });

  it('key=value 列表（逗号/分号/换行分隔，数字与布尔归一）', () => {
    expect(parseModelParams('cfg_scale=7.5, watermark=false; style=anime')).toEqual({
      cfg_scale: 7.5,
      watermark: false,
      style: 'anime',
    });
  });

  it('非法输入返回 null', () => {
    expect(parseModelParams('{broken')).toBeNull();
    expect(parseModelParams('')).toBeNull();
    expect(parseModelParams(undefined)).toBeNull();
    expect(parseModelParams('[1,2]')).toBeNull();
  });
});

describe('applyVideoPayloadExtras', () => {
  it('seed / negativePrompt / generateAudio / lastFrameUrl 全量映射', () => {
    const payload: Record<string, unknown> = { model: 'veo', prompt: 'p' };
    applyVideoPayloadExtras(payload, {
      seed: 42,
      negativePrompt: ' blurry ',
      generateAudio: true,
      lastFrameUrl: 'https://media/end.png',
    });
    expect(payload.seed).toBe(42);
    expect(payload.negative_prompt).toBe('blurry');
    expect(payload.generate_audio).toBe(true);
    expect(payload.last_frame_url).toBe('https://media/end.png');
    expect(payload.last_frame).toEqual({ url: 'https://media/end.png' });
  });

  it('modelParams 合并但不覆盖 model/prompt；显式 seed 优先于 modelParams', () => {
    const payload: Record<string, unknown> = { model: 'veo', prompt: 'p' };
    applyVideoPayloadExtras(payload, {
      seed: 1,
      modelParams: 'model=hack, prompt=hack, seed=999, cfg_scale=5',
    });
    expect(payload.model).toBe('veo');
    expect(payload.prompt).toBe('p');
    expect(payload.seed).toBe(1);
    expect(payload.cfg_scale).toBe(5);
  });

  it('未提供的字段不写入 payload', () => {
    const payload: Record<string, unknown> = { model: 'veo', prompt: 'p' };
    applyVideoPayloadExtras(payload, {});
    expect('seed' in payload).toBe(false);
    expect('negative_prompt' in payload).toBe(false);
    expect('generate_audio' in payload).toBe(false);
    expect('last_frame_url' in payload).toBe(false);
  });

  it('generateAudio=false 也要显式透传（用户选无声）', () => {
    const payload: Record<string, unknown> = { model: 'veo', prompt: 'p' };
    applyVideoPayloadExtras(payload, { generateAudio: false });
    expect(payload.generate_audio).toBe(false);
  });
});

describe('isLocallyBoundMediaUrl (VG-13)', () => {
  it('相对 /media 与 loopback HTTP 判定为不可达', () => {
    expect(isLocallyBoundMediaUrl('/media/exports/depth.mp4')).toBe(true);
    expect(isLocallyBoundMediaUrl('http://127.0.0.1:3001/media/videos/a.mp4')).toBe(true);
    expect(isLocallyBoundMediaUrl('http://localhost:8787/media/x.png')).toBe(true);
    expect(isLocallyBoundMediaUrl('file:///tmp/a.mp4')).toBe(true);
  });

  it('公网 URL 与 data URI 不算本机绑定', () => {
    expect(isLocallyBoundMediaUrl('https://cdn.example.com/depth.mp4')).toBe(false);
    expect(isLocallyBoundMediaUrl('data:video/mp4;base64,AAA')).toBe(false);
    expect(isLocallyBoundMediaUrl('')).toBe(false);
  });
});

describe('mimeFromMediaPath (VG-13)', () => {
  it('视频扩展名不再回落成 jpeg', () => {
    expect(mimeFromMediaPath('/media/exports/depth.mp4')).toBe('video/mp4');
    expect(mimeFromMediaPath('clip.webm')).toBe('video/webm');
    expect(mimeFromMediaPath('frame.png')).toBe('image/png');
    expect(mimeFromMediaPath('photo.jpg')).toBe('image/jpeg');
  });
});

describe('videoRequestNeedsReferenceChannel (VG-14)', () => {
  it('参考图/参考视频/尾帧均视为需要参考通道', () => {
    expect(videoRequestNeedsReferenceChannel({ prompt: 'x' })).toBe(false);
    expect(videoRequestNeedsReferenceChannel({ imageUrl: '/media/a.png' })).toBe(false);
    expect(videoRequestNeedsReferenceChannel({ referenceVideos: ['/media/d.mp4'] })).toBe(true);
    expect(videoRequestNeedsReferenceChannel({ referenceImages: ['https://x/a.png'] })).toBe(true);
    expect(videoRequestNeedsReferenceChannel({ lastFrameUrl: 'https://x/end.png' })).toBe(true);
    expect(videoRequestNeedsReferenceChannel({ referenceVideos: [''] })).toBe(false);
  });
});
