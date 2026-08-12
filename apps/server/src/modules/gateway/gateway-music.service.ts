/**
 * GatewayMusicService — BGM 音乐生成网关适配器（F-014）。
 *
 * 未接入真实 provider 时必须明确 error，禁止 sleep 后返回不存在的 mp3。
 */
import { BadRequestException, Injectable } from '@nestjs/common';

export interface MusicTask {
  taskId: string;
  status: 'queued' | 'running' | 'done' | 'error';
  url?: string;
  error?: string;
}

export const BGM_NOT_IMPLEMENTED = (provider: string) =>
  `BGM provider '${provider}' 尚未接入真实生成 API，禁止占位成功。请等待官方接入，或改用已导入的 BGM 音频。`;

@Injectable()
export class GatewayMusicService {
  private tasks = new Map<string, MusicTask>();
  private counter = 0;

  /**
   * 提交 BGM 生成任务。
   * 支持 provider: 'suno' | 'udio' | 'elevenlabs'（通过 BGM_PROVIDER 配置）。
   * 真实 API 未落地前直接拒绝，不创建会假成功的任务。
   */
  async submit(prompt: string, _durationSec = 30, provider?: string, apiKey?: string): Promise<{ taskId: string }> {
    const activeProvider = provider ?? process.env.BGM_PROVIDER ?? 'none';
    const activeKey = apiKey ?? process.env.BGM_API_KEY ?? process.env.SUNO_API_KEY ?? process.env.UDIO_API_KEY ?? '';

    if (!prompt.trim()) {
      throw new BadRequestException('BGM 描述不能为空');
    }
    if ((activeProvider === 'none' || !activeProvider) && !activeKey) {
      throw new BadRequestException('BGM 服务未配置。请在设置中配置 BGM Provider 和 API Key。');
    }
    if (!activeKey) {
      throw new BadRequestException('BGM 服务未配置。请在设置中配置 BGM API Key。');
    }

    throw new BadRequestException(BGM_NOT_IMPLEMENTED(activeProvider || 'none'));
  }

  async getStatus(taskId: string): Promise<MusicTask> {
    const task = this.tasks.get(taskId);
    if (!task) throw new BadRequestException(`Task ${taskId} not found`);
    return task;
  }
}
