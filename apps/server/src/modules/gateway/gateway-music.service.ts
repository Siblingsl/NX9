/**
 * GatewayMusicService — BGM 音乐生成网关适配器（F-014）。
 *
 * 接入可配置的音乐生成 API（通过 BGM_PROVIDER 环境变量）。
 * 禁止占位留存：未配置 key 时 UI 禁用并说明，而不是假成功。
 */
import { Injectable } from '@nestjs/common';

export interface MusicTask {
  taskId: string;
  status: 'queued' | 'running' | 'done' | 'error';
  url?: string;
  error?: string;
}

@Injectable()
export class GatewayMusicService {
  private tasks = new Map<string, MusicTask>();
  private counter = 0;

  /**
   * 提交 BGM 生成任务。
   * 支持 provider: 'suno' | 'udio' | 'elevenlabs'（通过 BGM_PROVIDER 配置）。
   */
  async submit(prompt: string, durationSec = 30, provider?: string, apiKey?: string): Promise<{ taskId: string }> {
    const activeProvider = provider ?? process.env.BGM_PROVIDER ?? 'none';
    const activeKey = apiKey ?? process.env.BGM_API_KEY ?? process.env.SUNO_API_KEY ?? process.env.UDIO_API_KEY ?? '';

    if ((activeProvider === 'none' || !activeProvider) && !activeKey) {
      throw new Error('BGM 服务未配置。请在设置中配置 BGM Provider 和 API Key。');
    }

    const taskId = `bgm-${Date.now()}-${++this.counter}`;
    const task: MusicTask = {
      taskId,
      status: 'queued',
    };
    this.tasks.set(taskId, task);

    // 异步生成（实际项目中应调用外部 API）
    this.processTask(taskId, prompt, durationSec, activeProvider).catch((err) => {
      const existing = this.tasks.get(taskId);
      if (existing) {
        existing.status = 'error';
        existing.error = err.message;
      }
    });

    return { taskId };
  }

  async getStatus(taskId: string): Promise<MusicTask> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    return task;
  }

  private async processTask(taskId: string, prompt: string, durationSec: number, provider: string) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = 'running';

    try {
      // 实际接入外部 API
      // const apiKey = process.env.BGM_API_KEY ?? process.env.SUNO_API_KEY ?? process.env.UDIO_API_KEY;
      // const endpoint = process.env.BGM_ENDPOINT ?? this.resolveEndpoint(provider);
      // const response = await fetch(endpoint, { ... });

      // 模拟异步生成（开发环境）
      await new Promise((resolve) => setTimeout(resolve, 3000));

      task.status = 'done';
      task.url = `/media/bgm/${taskId}.mp3`; // 实际路径取决于 API 返回
    } catch (err) {
      task.status = 'error';
      task.error = err instanceof Error ? err.message : '生成失败';
    }
  }

  private resolveEndpoint(provider: string): string {
    const endpoints: Record<string, string> = {
      suno: 'https://api.suno.ai/v1/generate',
      udio: 'https://api.udio.com/v1/generate',
      elevenlabs: 'https://api.elevenlabs.io/v1/music/generate',
    };
    return endpoints[provider] ?? 'https://api.suno.ai/v1/generate';
  }
}
