from pathlib import Path

ROOT = Path(r'F:\code\project\NX9')

def patch_rel(rel, pairs):
    p = ROOT / rel
    s = p.read_bytes().decode('utf-8-sig')
    norm = s.replace('\r\n', '\n')
    for old, new in pairs:
        if old not in norm:
            raise SystemExit(f'{rel}: MISSING:\n{old[:200]}')
        norm = norm.replace(old, new, 1)
    out = norm.replace('\n', '\r\n')
    p.write_bytes(out.encode('utf-8-sig' if s.startswith('\ufeff') else 'utf-8'))
    print(f'patched {rel}')

patch_rel(r'apps\web\src\blocks\core\clip-editor\SmartReplacePanel.tsx', [
    (
        """import {
  CLIP_GEN_MODELS,
  enrichPromptWithAssetMentions,
  collectAssetMentionUrls,
  type AssetLibraryKind,
  type TimelineClip,
} from '@nx9/shared';""",
        """import {
  CLIP_GEN_MODELS,
  DEFAULT_VIDEO_EDIT_PROVIDER,
  VIDEO_EDIT_PROVIDERS,
  enrichPromptWithAssetMentions,
  collectAssetMentionUrls,
  type AssetLibraryKind,
  type TimelineClip,
} from '@nx9/shared';""",
    ),
    (
        """type Step = 'frame' | 'edit' | 'video' | 'compare';
""",
        """type Step = 'frame' | 'edit' | 'video' | 'compare';

const videoEditProviders = VIDEO_EDIT_PROVIDERS;
const hasVideoEditFrameTracking = videoEditProviders.some((p) => p.supportsFrameTracking);
""",
    ),
    (
        """  const [videoModel, setVideoModel] = useState<string>(CLIP_GEN_MODELS[0]?.id ?? 'magic-hour');
""",
        """  const [videoModel, setVideoModel] = useState<string>(CLIP_GEN_MODELS[0]?.id ?? 'magic-hour');
  const [videoEditProviderId, setVideoEditProviderId] = useState<string>(DEFAULT_VIDEO_EDIT_PROVIDER);
""",
    ),
    (
        """    const prompt = buildEditPrompt(target, enrichInstruction(instruction));
    if (!hasMask) {
""",
        """    const prompt = buildEditPrompt(target, enrichInstruction(instruction));
    if (!hasVideoEditFrameTracking) {
      setTip('直接替换已禁用：当前没有已注册的跨帧自动追踪供应商（SAM/跟踪），首帧蒙版无法保证整段边缘稳定。');
      return;
    }
    if (!hasMask) {
""",
    ),
    (
        """            {replaceMode === 'direct' && (
              <p className="ed-hint">
                直接替换使用首帧蒙版作用于整段视频；当前未接入跨帧自动追踪（SAM/跟踪），运动镜头边缘可能出现闪烁，请按帧验收。
              </p>
            )}
            {replaceMode === 'direct' && (
              <p className="ed-hint">
                路线 B 当前仅 WAN VACE 单供应商，失败时无法自动切换供应商。
              </p>
            )}
""",
        """            {replaceMode === 'direct' && !hasVideoEditFrameTracking && (
              <p className="ed-warn">
                视频级直接替换当前不可用：未接入跨帧自动追踪（SAM/跟踪），首帧蒙版无法保证整段边缘稳定。请改用「重生成」路线。
              </p>
            )}
            {replaceMode === 'direct' && videoEditProviders.length > 0 && (
              <label className="ed-field">
                <span>视频级供应商（已注册 {videoEditProviders.length} 家）</span>
                <select
                  value={videoEditProviderId}
                  disabled={videoEditProviders.length < 2}
                  title={videoEditProviders.length < 2 ? '当前仅一家供应商，无可切换候选' : undefined}
                  onChange={(e) => setVideoEditProviderId(e.target.value)}
                >
                  {videoEditProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {replaceMode === 'direct' && videoEditProviders.length < 2 && (
              <p className="ed-hint">
                路线 B 当前仅 WAN VACE 单供应商，失败时会明确报错，不会自动切换供应商。
              </p>
            )}
""",
    ),
    (
        """                type="button"
                className="ed-btn ed-btn--primary"
                disabled={busy}
                onClick={() => void (replaceMode === 'direct' ? runDirectVideoEdit() : runImageEdit())}
""",
        """                type="button"
                className="ed-btn ed-btn--primary"
                disabled={busy || (replaceMode === 'direct' && !hasVideoEditFrameTracking)}
                title={
                  replaceMode === 'direct' && !hasVideoEditFrameTracking
                    ? '未接入跨帧自动追踪，直接替换路径已禁用'
                    : undefined
                }
                onClick={() => void (replaceMode === 'direct' ? runDirectVideoEdit() : runImageEdit())}
""",
    ),
    (
        """      const submitted = await api.videoEditSubmit({
        videoUrl: clip.assetUrl,
        maskUrl: uploaded.url,
        prompt,
      });
""",
        """      const submitted = await api.videoEditSubmit({
        videoUrl: clip.assetUrl,
        maskUrl: uploaded.url,
        prompt,
        providerId: videoEditProviderId,
      });
""",
    ),
    (
        """  }, [target, instruction, enrichInstruction, hasMask, buildMaskBlob, clip.assetUrl]);""",
        """  }, [target, instruction, enrichInstruction, hasMask, buildMaskBlob, clip.assetUrl, videoEditProviderId]);""",
    ),
])

patch_rel(r'apps\server\src\modules\montage\video-edit.service.ts', [
    (
        "import { resolveVideoEditProvider } from '@nx9/shared';",
        "import { resolveVideoEditProvider, VIDEO_EDIT_PROVIDERS } from '@nx9/shared';",
    ),
    (
        """    if (!body.videoUrl || !body.prompt?.trim()) {
      return { ok: false, message: 'videoUrl 与 prompt 必填' };
    }
    const provider = resolveVideoEditProvider(body.providerId);""",
        """    if (!body.videoUrl || !body.prompt?.trim()) {
      return { ok: false, message: 'videoUrl 与 prompt 必填' };
    }
    if (body.providerId && !VIDEO_EDIT_PROVIDERS.some((p) => p.id === body.providerId)) {
      return { ok: false, message: `未知视频编辑供应商：${body.providerId}` };
    }
    const provider = resolveVideoEditProvider(body.providerId);""",
    ),
])

patch_rel(r'packages\shared\src\types\smart-edit.ts', [
    (
        """  ops?: TimelineOp[];
  confidence: number;
}""",
        """  ops?: TimelineOp[];
  confidence: number;
  /** 结构化能力元数据（如 beat-cut 的算法与是否做过音频听感） */
  meta?: {
    algorithm?: 'reference-shot-durations' | 'bpm-interval' | 'audio-onset';
    source?: string;
    audioAnalyzed?: boolean;
  };
}""",
    ),
])

patch_rel(r'apps\web\src\engine\smart-edit-orchestrator.ts', [
    (
        """              ops,
              confidence: 0.6,
            };""",
        """              ops,
              confidence: 0.6,
              meta: {
                algorithm: 'reference-shot-durations' as const,
                source: 'analyze-reference',
                audioAnalyzed: false,
              },
            };""",
    ),
    (
        """        ? '参考节奏：已按参考视频分析镜头时长生成 beat-cut 建议（未做听音）。'
        : '未做听音/未分析参考：本次未生成 beat-cut 建议，时间线按等分时长编排。',""",
        """        ? '参考节奏：已按参考视频镜头分析生成 beat-cut 建议（algorithm: reference-shot-durations，未做音频听感）。'
        : '未做音频听感/未分析参考：本次未生成 beat-cut 建议，时间线按等分时长编排。',""",
    ),
])
