import type {
  AppSettings,
  PublicLibraryPayload,
  SkillDetail,
  SkillSummary,
  StoryboardShot,
  UsageSummary,
  UserSummary,
  VoicePayload,
  WorkspacePayload,
  WorkspaceSummary,
} from '@nx9/shared';

function userHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('nx9-user-session');
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { state?: { userId?: string } };
    const id = parsed?.state?.userId;
    return id ? { 'X-NX9-User-Id': id } : {};
  } catch {
    return {};
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...userHeaders(),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  status: () => request<{ ok: boolean; version: string }>('/api/status'),

  listWorkspaces: (ownerId?: string) =>
    request<WorkspaceSummary[]>(
      ownerId ? `/api/workspaces?ownerId=${encodeURIComponent(ownerId)}` : '/api/workspaces',
    ),
  createWorkspace: (title?: string, ownerId?: string, visibility?: import('@nx9/shared').WorkspaceVisibility) =>
    request<WorkspaceSummary>('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ title, ownerId, visibility }),
    }),
  loadWorkspace: (id: string) => request<WorkspacePayload>(`/api/workspaces/${id}`),
  saveWorkspace: (id: string, payload: WorkspacePayload) =>
    request<WorkspaceSummary>(`/api/workspaces/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  renameWorkspace: (id: string, title: string) =>
    request<WorkspaceSummary>(`/api/workspaces/${id}/title`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  deleteWorkspace: (id: string) =>
    request<{ ok: boolean }>(`/api/workspaces/${id}`, { method: 'DELETE' }),

  getSettings: () => request<AppSettings>('/api/settings'),
  getSettingsRaw: () => request<AppSettings>('/api/settings/raw'),
  saveSettings: (body: AppSettings) =>
    request<AppSettings>('/api/settings', { method: 'POST', body: JSON.stringify(body) }),

  uploadAsset: (file: File, onProgress?: (pct: number) => void) => {
    return new Promise<{ url: string; filename: string; thumbUrl?: string }>((resolve, reject) => {
      const form = new FormData();
      form.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/assets/upload');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const body = JSON.parse(xhr.responseText) as {
              ok?: boolean;
              url?: string;
              filename?: string;
              thumbUrl?: string | null;
            };
            if (!body.url) {
              reject(new Error('上传响应缺少 url'));
              return;
            }
            resolve({
              url: body.url,
              filename: body.filename ?? file.name,
              thumbUrl: body.thumbUrl ?? undefined,
            });
          } catch {
            reject(new Error('上传响应解析失败'));
          }
          return;
        }
        reject(new Error(xhr.responseText || `Upload failed ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(form);
    });
  },

  proxyLlm: (body: Record<string, unknown>, signal?: AbortSignal) =>
    request<unknown>('/api/gateway/llm', { method: 'POST', body: JSON.stringify(body), signal }),
  proxyLlmStream: (body: { messages: { role: string; content: string }[]; model?: string }, onChunk: (text: string) => void, signal?: AbortSignal): Promise<string> =>
    fetch('/api/gateway/llm/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    }).then(async (res) => {
      if (!res.ok) throw new Error(`LLM stream error: ${res.status}`);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split('\n').filter((l) => l.startsWith('data: '))) {
          const json = JSON.parse(line.slice(6));
          if (json.done) return json.full as string;
          if (json.text) { full += json.text; onChunk(json.text); }
        }
      }
      return full;
    }),
  proxyImage: (body: Record<string, unknown>) =>
    request<unknown>('/api/gateway/image', { method: 'POST', body: JSON.stringify(body) }),
  proxyVideo: (body: Record<string, unknown>) =>
    request<{
      ok: boolean;
      url?: string;
      status: string;
      taskId?: string;
      message?: string;
    }>('/api/gateway/video', { method: 'POST', body: JSON.stringify(body) }),
  proxyTts: (body: {
    input: string;
    voice?: string;
    model?: string;
    response_format?: string;
    referenceAudioUrl?: string;
    useLuxTts?: boolean;
    luxTtsProfileId?: string;
    profileId?: string;
    num_steps?: number;
    t_shift?: number;
    speed?: number;
    rms?: number;
    ref_duration?: number;
    luxTtsNoGpuFallback?: 'cpu' | 'cloud';
    fallbackVoice?: string;
  }) =>
    request<{
      ok: boolean;
      url: string;
      bytes: number;
      provider?: string;
      fallback?: {
        from: 'luxtts';
        to: 'cloud' | 'cpu';
        reason: string;
        applied: 'cpu' | 'cloud';
      };
    }>('/api/gateway/tts', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listSkills: () => request<SkillSummary[]>('/api/skills'),
  readSkill: (id: string) => request<SkillDetail>(`/api/skills/${id}`),
  createSkill: (body: { id: string; name?: string; description?: string }) =>
    request<SkillSummary>('/api/skills', { method: 'POST', body: JSON.stringify(body) }),
  saveSkill: (id: string, content: string) =>
    request<{ ok: boolean }>(`/api/skills/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
  deleteSkill: (id: string) =>
    request<{ ok: boolean }>(`/api/skills/${id}`, { method: 'DELETE' }),

  agentShotScript: (text: string) =>
    request<{
      ok: boolean;
      rows: { durationSec: number; shotType: string; dialogue: string; action: string }[];
    }>('/api/agent/shot-script', { method: 'POST', body: JSON.stringify({ text }) }),

  dialogueParse: (text: string) =>
    request<{
      ok: boolean;
      lines: { speaker: string; text: string; emotion?: string }[];
    }>('/api/agent/dialogue-parse', { method: 'POST', body: JSON.stringify({ text }) }),

  seedSeedanceSkills: () =>
    request<{ imported: number; skipped: number }>('/api/skills/seed/seedance', {
      method: 'POST',
    }),

  generateVoiceLines: (workspaceId: string, lineIds?: string[], voice?: WorkspacePayload['voice']) =>
    request<{
      ok: number;
      failed: number;
      results: { id: string; status: string; audioAssetId?: string }[];
    }>(`/api/workspaces/${workspaceId}/voice/generate`, {
      method: 'POST',
      body: JSON.stringify({ lineIds, voice }),
    }),

  gridSplit: (body: { sourceUrl: string; rows?: number; cols?: number }) =>
    request<{ ok: boolean; urls: string[]; rows: number; cols: number }>('/api/grid/split', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  gridCompose: (body: { imageUrls: string[]; rows: number; cols: number }) =>
    request<{ ok: boolean; url: string }>('/api/grid/compose', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  gridGenerate: (body: { prompt: string; rows?: number; cols?: number; style?: 'cinematic' | 'line-art' }) =>
    request<{ ok: boolean; url: string; message?: string; style?: string }>('/api/grid/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  gridShotSketch: (body: { descriptionZh: string; promptEn?: string; shotType?: string; artStylePrompt?: string }) =>
    request<{ ok: boolean; url: string; prompt: string; message?: string }>('/api/grid/shot-sketch', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  gridReversePrompts: (body: {
    sourceUrl: string;
    rows?: number;
    cols?: number;
    storyPrompt?: string;
  }) =>
    request<import('@nx9/shared').GridReversePromptsResult>('/api/grid/reverse-prompts', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  pollVideo: (taskId: string, baseUrl?: string) =>
    request<{
      ok: boolean;
      url?: string;
      status: 'success' | 'processing' | 'failed';
      taskId: string;
      message?: string;
    }>('/api/gateway/video/poll', {
      method: 'POST',
      body: JSON.stringify({ taskId, baseUrl }),
    }),

  concatClips: (videoUrls: string[], title?: string, transition?: string) =>
    request<{ ok: boolean; url?: string; status: string; message?: string; segmentCount?: number }>(
      '/api/montage/concat-clips',
      { method: 'POST', body: JSON.stringify({ videoUrls, title, transition }) },
    ),

  extractFrames: (videoUrl: string, count?: number) =>
    request<{ ok: boolean; frames: string[]; message?: string }>('/api/montage/extract-frames', {
      method: 'POST',
      body: JSON.stringify({ videoUrl, count }),
    }),

  photoSpeak: (body: {
    imageUrl: string;
    text: string;
    voice?: string;
    resolution?: string;
    referenceAudioUrl?: string;
    useLuxTts?: boolean;
    characterId?: string;
  }) =>
    request<{
      ok: boolean;
      status: string;
      url?: string;
      audioUrl?: string;
      ttsProvider?: string;
      ttsFallback?: {
        from: 'luxtts';
        to: 'cloud' | 'cpu';
        reason: string;
        applied: 'cpu' | 'cloud';
      };
      durationSec?: number;
      message?: string;
    }>('/api/montage/photo-speak', { method: 'POST', body: JSON.stringify(body) }),

  topazStatus: (gigapixelPath?: string, topazVideoPath?: string) => {
    const q = new URLSearchParams();
    if (gigapixelPath) q.set('gigapixelPath', gigapixelPath);
    if (topazVideoPath) q.set('topazVideoPath', topazVideoPath);
    const suffix = q.toString() ? `?${q}` : '';
    return request<{
      ok: boolean;
      gigapixel: { installed: boolean; executablePath: string; defaultPath: string };
      video: { installed: boolean; ffmpegPath: string; defaultDir: string; modelEnvReady: boolean };
    }>(`/api/topaz/status${suffix}`);
  },

  topazGigapixel: (body: {
    sourceUrl: string;
    scale?: number;
    model?: string;
    executablePath?: string;
  }) =>
    request<{ ok: boolean; url: string; scale: number; model: string }>('/api/topaz/gigapixel', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  topazVideo: (body: {
    sourceUrl: string;
    upscaleModel?: string;
    upscaleFactor?: number;
    enableInterpolation?: boolean;
    topazVideoPath?: string;
    useGpu?: boolean;
  }) =>
    request<{ ok: boolean; url: string; filterChain: string }>('/api/topaz/video', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  resizeImage: (body: {
    sourceUrl: string;
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  }) =>
    request<{ ok: boolean; url: string; width: number; height: number }>('/api/image-ops/resize', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  mergeImages: (body: {
    imageUrls: string[];
    direction?: 'horizontal' | 'vertical' | 'grid';
    cols?: number;
  }) =>
    request<{ ok: boolean; url: string; count: number }>('/api/image-ops/merge', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  upscaleImage: (body: { sourceUrl: string; scale?: number }) =>
    request<{ ok: boolean; url: string; width: number; height: number; scale: number }>(
      '/api/image-ops/upscale',
      { method: 'POST', body: JSON.stringify(body) },
    ),

  stripMetadata: (body: { sourceUrl: string }) =>
    request<{ ok: boolean; url: string }>('/api/image-ops/strip-metadata', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  proxyFal: (body: { model: string; input: Record<string, unknown> }) =>
    request<{ ok: boolean; url?: string; taskId?: string; output?: Record<string, unknown> }>('/api/gateway/fal', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  proxyComfy: (body: {
    workflow: Record<string, unknown>;
    baseUrl?: string;
    prompt?: string;
  }) =>
    request<{ ok: boolean; url?: string; promptId?: string; message?: string }>(
      '/api/gateway/comfy',
      { method: 'POST', body: JSON.stringify(body) },
    ),

  parseLink: (url: string, hint?: string) =>
    request<{
      ok: boolean;
      url: string;
      title: string;
      summary: string;
      prompt: string;
      mediaKind: string;
    }>('/api/tools/parse-link', {
      method: 'POST',
      body: JSON.stringify({ url, hint }),
    }),

  captureUrl: (url: string) =>
    request<{ ok: boolean; url: string; filename: string }>('/api/tools/capture-url', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),

  importPromptPackage: (url: string) =>
    request<{ ok: boolean; count: number; items: { id: string; label: string; kind: string; prompt: string; tags: string[] }[] }>('/api/tools/import-prompt-package', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),

  proxyDownload: (url: string) =>
    request<{ ok: boolean; url: string; filename: string }>('/api/tools/proxy-download', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),

  reversePrompt: (imageUrl: string) =>
    request<{ ok: boolean; prompt: string; tags: string[]; style: string }>(
      '/api/tools/reverse-prompt',
      { method: 'POST', body: JSON.stringify({ imageUrl }) },
    ),

  extractStyle: (imageUrl: string) =>
    request<{
      ok: boolean;
      styleTokens: string;
      sceneTokens: string;
      negativePrompt: string;
      combinedPrompt: string;
    }>('/api/tools/extract-style', { method: 'POST', body: JSON.stringify({ imageUrl }) }),

  quickMontage: (topic: string, durationSec?: number) =>
    request<{ ok: boolean; markdown: string; topic: string; durationSec: number }>(
      '/api/tools/quick-montage',
      { method: 'POST', body: JSON.stringify({ topic, durationSec }) },
    ),

  replicateVideo: (url: string, notes?: string) =>
    request<{
      ok: boolean;
      url: string;
      title: string;
      rhythm: string;
      structure: string[];
      storyboardMarkdown: string;
      promptPack: string;
    }>('/api/tools/replicate-video', {
      method: 'POST',
      body: JSON.stringify({ url, notes }),
    }),

  exportContactSheet: (shots: StoryboardShot[], cols?: number) =>
    request<{ ok: boolean; url: string; shotCount: number }>('/api/montage/contact-sheet', {
      method: 'POST',
      body: JSON.stringify({ shots, cols }),
    }),

  checkReviewGate: (shots: StoryboardShot[], gateMode?: string) =>
    request<{ ok: boolean; pending: number[] }>('/api/montage/review-gate', {
      method: 'POST',
      body: JSON.stringify({ shots, gateMode }),
    }),

  renderShotMp4: (body: {
    videoUrl: string;
    audioUrl?: string;
    subtitle?: string;
    durationSec?: number;
    shots?: StoryboardShot[];
    skipReview?: boolean;
  }) =>
    request<{ ok: boolean; url?: string; status: string; message?: string; pending?: number[] }>(
      '/api/montage/render-shot',
      { method: 'POST', body: JSON.stringify(body) },
    ),

  mixAudio: (audioUrls: string[], normalize?: boolean) =>
    request<{ ok: boolean; url?: string; status: string; message?: string; trackCount?: number; failedTracks?: number }>(
      '/api/montage/mix-audio',
      { method: 'POST', body: JSON.stringify({ audioUrls, normalize }) },
    ),

  colorGrade: (body: { sourceUrl: string; brightness?: number; contrast?: number; saturation?: number }) =>
    request<{ ok: boolean; url?: string; status: string; message?: string; mediaKind?: string }>(
      '/api/montage/color-grade',
      { method: 'POST', body: JSON.stringify(body) },
    ),

  thumbnailCompose: (body: { imageUrl: string; title?: string; safeZone?: string }) =>
    request<{ ok: boolean; url: string }>('/api/image-ops/thumbnail-compose', { method: 'POST', body: JSON.stringify(body) }),

  probeMediaDuration: (sourceUrl: string) =>
    request<{ ok: boolean; durationSec: number }>('/api/montage/probe-duration', {
      method: 'POST',
      body: JSON.stringify({ sourceUrl }),
    }),

  transcribeAudio: (sourceUrl: string, language?: string) =>
    request<{ ok: boolean; srtContent: string; cues: { start: number; end: number; text: string }[] }>(
      '/api/montage/transcribe',
      { method: 'POST', body: JSON.stringify({ sourceUrl, language }) },
    ),

  generateDepthPass: (body: { sourceUrl: string }) =>
    request<{
      ok: boolean;
      depthUrl?: string;
      normalUrl?: string;
      status: string;
      message?: string;
      method?: string;
    }>('/api/montage/depth-pass', { method: 'POST', body: JSON.stringify(body) }),

  ffmpegStatus: () => request<{ available: boolean }>('/api/montage/ffmpeg'),

  listAssets: () =>
    request<{ name: string; size: number; updatedAt: number }[]>('/api/assets/uploads'),

  loadPublicLibrary: () => request<PublicLibraryPayload>('/api/public-library'),
  savePublicLibrary: (payload: PublicLibraryPayload) =>
    request<PublicLibraryPayload>('/api/public-library', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  createTask: (type: string, message?: string) =>
    request<{ id: string; status: string; progress: number }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ type, message }),
    }),

  getTask: (id: string) =>
    request<{ id: string; status: string; progress: number; message?: string; result?: unknown }>(
      `/api/tasks/${id}`,
    ),

  listTasks: () =>
    request<{ id: string; status: string; progress: number; type: string }[]>('/api/tasks'),

  updateTask: (
    id: string,
    body: { progress?: number; status?: string; message?: string; result?: unknown },
  ) =>
    request<{ id: string; status: string; progress: number }>(`/api/tasks/${id}/progress`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  exportWorkspaceJson: (id: string) => request<WorkspacePayload>(`/api/workspaces/${id}/export`),

  importWorkspaceJson: (payload: WorkspacePayload, title?: string) =>
    request<WorkspaceSummary>('/api/workspaces/import', {
      method: 'POST',
      body: JSON.stringify({ payload, title }),
    }),

  scriptSkeleton: (body: { sourceText: string }) =>
    request<{ ok: boolean; skeleton: import('@nx9/shared').StorySkeleton }>('/api/agent/script/skeleton', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  scriptAdaptation: (body: { sourceText: string }) =>
    request<{ ok: boolean; adaptation: string }>('/api/agent/script/adaptation', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  scriptScreenplay: (body: { sourceText: string }) =>
    request<{ ok: boolean; screenplay: string }>('/api/agent/script/screenplay', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  directorPlan: (body: { sourceText: string }) =>
    request<{ ok: boolean; plan: string }>('/api/agent/production/director-plan', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  storyboardTable: (body: { sourceText: string }) =>
    request<{ ok: boolean; table: import('@nx9/shared').StoryboardTableRow[] }>('/api/agent/production/storyboard-table', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  materializeShots: (body: { table: import('@nx9/shared').StoryboardTableRow[] }) =>
    request<{ ok: boolean; shots: StoryboardShot[] }>('/api/agent/production/materialize-shots', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  extractAssets: (body: { sourceText: string }) =>
    request<{ ok: boolean; characters: import('@nx9/shared').CharacterProfile[]; scenes: { id: string; name: string; description: string }[] }>('/api/agent/extract-assets', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  sceneSplit: (body: { sourceText: string; mode?: 'llm' | 'rule' }) =>
    request<{ ok: boolean; scenes: import('@nx9/shared').SceneSplitRecord[] }>('/api/agent/scene-split', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  extractEnvironments: (body: { scenes: import('@nx9/shared').SceneSplitRecord[] }) =>
    request<{ ok: boolean; environments: import('@nx9/shared').EnvironmentProfile[] }>('/api/agent/extract-environments', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  novelEvents: (body: { sourceText: string }) =>
    request<{ ok: boolean; events: { id: string; name: string; description: string; order: number }[] }>('/api/agent/novel-events', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  analyzeReferenceVideo: (body: {
    videoUrl: string;
    notes?: string;
    targetShotCount?: number;
  }) =>
    request<{
      ok: boolean;
      markdown: string;
      shots: StoryboardShot[];
      message?: string;
    }>('/api/montage/analyze-reference', { method: 'POST', body: JSON.stringify(body) }),

  exportTimelineJson: (shots: StoryboardShot[], title?: string) =>
    request<{ ok: boolean; timeline: unknown; url: string }>('/api/montage/export-timeline', {
      method: 'POST',
      body: JSON.stringify({ shots, title }),
    }),

  concatEpisode: (body: {
    shots: StoryboardShot[];
    requireApproved?: boolean;
    title?: string;
    audioUrl?: string;
  }) =>
    request<{
      ok: boolean;
      url?: string;
      status: string;
      message?: string;
      segmentCount?: number;
      vertical?: boolean;
    }>('/api/montage/concat-episode', { method: 'POST', body: JSON.stringify(body) }),

  probeVoicebox: (baseUrl?: string) =>
    request<{ available: boolean; baseUrl: string; profiles?: { id: string; name: string }[]; message?: string }>(
      '/api/gateway/voicebox/probe',
      { method: 'POST', body: JSON.stringify({ baseUrl }) },
    ),

  probeLuxTts: (baseUrl?: string) =>
    request<{
      available: boolean;
      baseUrl: string;
      device?: string;
      activeDevice?: string;
      modelLoaded?: boolean;
      model?: string;
      cachedProfiles?: number;
      message?: string;
      gpuAvailable?: boolean;
      cudaAvailable?: boolean;
      mpsAvailable?: boolean;
      runningOnCpu?: boolean;
      recommendedFallback?: 'cpu' | 'cloud' | null;
      recommendation?: string | null;
      noGpuFallback?: 'cpu' | 'cloud';
      effectiveStrategy?: string;
    }>('/api/gateway/luxtts/probe', { method: 'POST', body: JSON.stringify({ baseUrl }) }),

  probeProviders: () =>
    request<{
      providers: {
        id: string;
        label: string;
        available: boolean;
        models?: string[];
        message?: string;
      }[];
    }>('/api/gateway/providers/probe', { method: 'POST' }),

  listUsers: () => request<UserSummary[]>('/api/users'),
  bootstrapUser: () => request<UserSummary>('/api/users/bootstrap'),
  createUser: (name: string, email?: string) =>
    request<UserSummary>('/api/users', { method: 'POST', body: JSON.stringify({ name, email }) }),

  usageSummary: (days = 7, userId?: string) =>
    request<UsageSummary>(
      `/api/usage/summary?days=${days}${userId ? `&userId=${encodeURIComponent(userId)}` : ''}`,
    ),
  usageRecent: (limit = 50, userId?: string) =>
    request<{ id: string; kind: string; model?: string | null; units: number; createdAt: number }[]>(
      `/api/usage/recent?limit=${limit}${userId ? `&userId=${encodeURIComponent(userId)}` : ''}`,
    ),

  renderHyperframes: (body: { timeline: unknown; templateId?: string; transitionPack?: string }) =>
    request<{ ok: boolean; taskId?: string; status: string }>('/api/montage/render-hyperframes', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getTaskStatus: (taskId: string) =>
    request<{ ok: boolean; status: string; url?: string; message?: string }>(`/api/montage/tasks/${taskId}`),

  renderRemotion: (body: { timeline: unknown; codec?: string }) =>
    request<{ ok: boolean; taskId: string; status: string; message: string }>('/api/montage/render-remotion', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getRemotionTaskStatus: (taskId: string) =>
    request<{ ok: boolean; status: string; progress: number; message?: string; url?: string }>(`/api/montage/remotion-tasks/${taskId}`),

  storageMode: () => request<{ mode: string }>('/api/admin/storage'),
  migrateToPrisma: (ownerId?: string) =>
    request<{ migrated: number; skipped: number; ownerId: string }>('/api/admin/migrate-json-to-prisma', {
      method: 'POST',
      body: JSON.stringify({ ownerId }),
    }),
};
