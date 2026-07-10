import { Injectable } from '@nestjs/common';

@Injectable()
export class MockGatewayService {
  async proxyImage() {
    return { ok: true, url: '/media/images/fixture-mock-gen.png', urls: ['/media/images/fixture-mock-gen.png'] };
  }
  async proxyVideo() {
    return { ok: true, status: 'success', url: '/media/videos/fixture-6s.mp4' };
  }
  async proxyTts() {
    return { ok: true, url: '/media/audio/fixture-tts.mp3', bytes: 8192, provider: 'openai-compatible' };
  }
  async proxyLlm() {
    return { choices: [{ message: { content: 'FIXTURE LLM response' } }] };
  }
  async proxyFal() {
    return { url: '/media/images/fixture-mock-fal.png' };
  }
}
