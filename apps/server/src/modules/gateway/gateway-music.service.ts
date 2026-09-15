/**
 * GatewayMusicService — BGM 音乐生成网关适配器（F-014）。
 *
 * 已接入 Suno 兼容聚合协议（提交 /generate → 轮询 /generate/record-info）。
 * 未配置通道时仍必须明确 error，禁止 sleep 后返回不存在的 mp3；
 * 未知 provider 同样明确拒绝，不创建会假成功的任务。
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

export interface MusicTask {
  taskId: string;
  status: 'queued' | 'running' | 'done' | 'error';
  url?: string;
  error?: string;
  /** 上游任务号：本地 id → 上游 id 的映射（提交为两段式） */
  upstreamTaskId?: string;
  /** 提交所需通道快照（base/key），轮询时复用；对外返回时剥离 */
  channel?: { baseUrl: string; apiKey: string };
}

export const BGM_NOT_IMPLEMENTED = (provider: string) =>
  `BGM provider '${provider}' 尚未接入。当前支持 Suno 兼容聚合协议（provider='suno' + Base URL + Key），请在设置→BGM 配置，禁止空成功`;

const SUPPORTED_PROVIDERS = new Set(['suno', 'suno-compat']);

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** 上游状态 → 本地任务状态（宽解析，兼容常见聚合器返回值） */
function mapUpstreamStatus(raw: unknown): MusicTask['status'] | undefined {
  const s = String(raw ?? '').toUpperCase();
  if (!s) return undefined;
  if (/SUCCESS|COMPLETE|DONE|FINISH/.test(s)) return 'done';
  if (/FAIL|ERROR|SENSITIVE|REJECT|BLOCK/.test(s)) return 'error';
  if (/RUN|GENERATING|PROCESSING|STREAM|PLAYING/.test(s)) return 'running';
  if (/PENDING|QUEU|WAIT|SUBMIT/.test(s)) return 'queued';
  return undefined;
}

/** 从任意嵌套结构里提取音频 URL（兼容 camelCase / snake_case / 数组包装） */
function extractAudioUrl(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const rec = payload as Record<string, unknown>;
  for (const key of ['audioUrl', 'audio_url', 'music_url', 'musicUrl', 'url', 'audio']) {
    const v = rec[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  for (const key of ['data', 'result', 'clips', 'audio', 'items']) {
    const v = rec[key];
    if (Array.isArray(v) && v.length > 0) {
      const found = extractAudioUrl(v[0]);
      if (found) return found;
    } else if (v && typeof v === 'object') {
      const found = extractAudioUrl(v);
      if (found) return found;
    }
  }
  return undefined;
}

function extractUpstreamTaskId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const rec = payload as Record<string, unknown>;
  for (const key of ['taskId', 'task_id', 'id']) {
    const v = rec[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  const data = rec.data;
  if (data && typeof data === 'object') return extractUpstreamTaskId(data);
  return undefined;
}

@Injectable()
export class GatewayMusicService {
  private tasks = new Map<string, MusicTask>();

  /** HTTP 出口；测试通过覆盖此静态字段注入桩，避免被 Nest 误认为 DI 依赖 */
  static fetcher: FetchLike = (...args) => fetch(...(args as Parameters<typeof fetch>));

  private get fetcher(): FetchLike {
    return GatewayMusicService.fetcher;
  }

  /** 测试观察用：任务缓存（勿用于业务判断） */
  getStatusCache(): Map<string, MusicTask> {
    return this.tasks;
  }

  constructor(private readonly settings?: SettingsService) {}

  private resolveChannel(provider?: string, apiKey?: string, baseUrl?: string) {
    const cfg = this.settings?.getRaw();
    const activeProvider = (provider ?? cfg?.bgmProvider ?? process.env.BGM_PROVIDER ?? 'none').trim();
    const activeKey = (apiKey ?? cfg?.bgmApiKey ?? process.env.BGM_API_KEY ?? process.env.SUNO_API_KEY ?? '').trim();
    const activeBase = (baseUrl ?? cfg?.bgmBaseUrl ?? process.env.BGM_BASE_URL ?? '').trim().replace(/\/+$/, '');
    return { activeProvider, activeKey, activeBase };
  }

  /**
   * 提交 BGM 生成任务。
   * 协议：POST {baseUrl}/generate → {taskId}（兼容 {data:{taskId}} 包装）。
   * 未配置 / 未知 provider 时明确拒绝，不创建会假成功的任务。
   */
  async submit(
    prompt: string,
    durationSec = 30,
    provider?: string,
    apiKey?: string,
    baseUrl?: string,
  ): Promise<{ taskId: string }> {
    const text = (prompt ?? '').trim();
    if (!text) {
      throw new BadRequestException('BGM 描述不能为空，禁止空成功');
    }
    const { activeProvider, activeKey, activeBase } = this.resolveChannel(provider, apiKey, baseUrl);

    if (activeProvider === 'none' || !activeProvider) {
      throw new BadRequestException('BGM 服务未配置。请在设置中配置 BGM Provider 和 API Key，禁止空成功');
    }
    if (!SUPPORTED_PROVIDERS.has(activeProvider)) {
      throw new BadRequestException(BGM_NOT_IMPLEMENTED(activeProvider));
    }
    if (!activeKey) {
      throw new BadRequestException('BGM 服务未配置。请在设置中配置 BGM API Key，禁止空成功');
    }
    if (!activeBase) {
      throw new BadRequestException('BGM 服务未配置。请在设置中配置 BGM Base URL（Suno 兼容聚合端点），禁止空成功');
    }

    const taskId = `bgm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const task: MusicTask = {
      taskId,
      status: 'queued',
      channel: { baseUrl: activeBase, apiKey: activeKey },
    };
    this.tasks.set(taskId, task);

    // 两段式提交：立即返回本地 taskId，创建请求异步进行；失败落到 task.error
    void this.createUpstreamTask(task, text, durationSec).catch((e: unknown) => {
      task.status = 'error';
      task.error = e instanceof Error ? e.message : String(e);
    });
    return { taskId };
  }

  private async createUpstreamTask(task: MusicTask, prompt: string, durationSec: number): Promise<void> {
    const channel = task.channel!;
    const res = await this.fetcher(`${channel.baseUrl}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channel.apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        customMode: false,
        instrumental: true,
        durationSec: Math.max(5, Math.min(240, Math.round(durationSec || 30))),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`BGM 提交失败，禁止空成功 HTTP ${res.status}${body ? `：${body.slice(0, 200)}` : ''}`);
    }
    const payload: unknown = await res.json().catch(() => undefined);
    const upstreamTaskId = extractUpstreamTaskId(payload);
    if (!upstreamTaskId) {
      throw new Error('BGM 提交响应中未找到 taskId，禁止空成功');
    }
    task.upstreamTaskId = upstreamTaskId;
  }

  /** 查询任务状态；queued/running 时顺手向上游刷新一次（由客户端驱动轮询，服务端不设定时器） */
  async getStatus(taskId: string): Promise<MusicTask> {
    const task = this.tasks.get(taskId);
    if (!task) throw new BadRequestException(`Task ${taskId} not found，禁止空成功`);
    if (task.status !== 'queued' && task.status !== 'running') {
      return { ...task, channel: undefined };
    }
    if (task.upstreamTaskId && task.channel) {
      try {
        await this.refreshFromUpstream(task);
      } catch (e: unknown) {
        // 单次轮询失败不推翻任务，保留下一次机会；仅记录原因
        task.error = task.error ?? (e instanceof Error ? e.message : String(e));
      }
    } else if (!task.upstreamTaskId && task.error) {
      // 上游创建已失败：把错误抛给调用方
      throw new BadRequestException(task.error);
    }
    return { ...task, channel: undefined };
  }

  private async refreshFromUpstream(task: MusicTask): Promise<void> {
    const channel = task.channel!;
    const res = await this.fetcher(
      `${channel.baseUrl}/generate/record-info?taskId=${encodeURIComponent(task.upstreamTaskId!)}`,
      {
        headers: { Authorization: `Bearer ${channel.apiKey}` },
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!res.ok) {
      throw new Error(`BGM 轮询失败 HTTP ${res.status}，禁止空成功`);
    }
    const payload: unknown = await res.json().catch(() => undefined);
    if (!payload || typeof payload !== 'object') {
      throw new Error('BGM 轮询响应不是有效 JSON，禁止空成功');
    }
    const rec = payload as Record<string, unknown>;
    const inner = (rec.data ?? rec) as Record<string, unknown>;
    const mapped = mapUpstreamStatus(inner.status ?? rec.status);
    if (mapped === 'done') {
      const url = extractAudioUrl(payload);
      if (!url) {
        task.status = 'error';
        task.error = 'BGM 生成完成但响应中未找到音频 URL，禁止空成功';
      } else {
        task.status = 'done';
        task.url = url;
        task.error = undefined;
      }
    } else if (mapped === 'error') {
      task.status = 'error';
      task.error = typeof inner.message === 'string'
        ? inner.message
        : `BGM 生成失败（${String(inner.status ?? 'unknown')}）`;
    } else if (mapped) {
      task.status = mapped;
    }
  }
}
