import {
  X,
  Key,
  Save,
  Radio,
  Image as ImageIcon,
  Cable,
  Palette,
  SlidersHorizontal,
  Loader2,
} from 'lucide-react';
import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import type {
  AppSettings,
  CanvasAppearance,
  CanvasEdgePathType,
  CanvasGridStyle,
  CanvasSocketStyle,
  CanvasThemeMode,
} from '@nx9/shared';
import { FLOW_EDGE_TYPES } from '../engine/flow-edge-types';
import { translate } from '@nx9/shared';
import { useCredentialVault } from '../stores/credential-vault';
import { useStageDeckFlag } from '../stores/stage-deck-flag';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { api } from '../api/client';
import { getRuntime } from '../platform/runtime-bridge';
import './settings-modal.css';

type SettingsSection = 'connection' | 'canvas' | 'prefs';

const SECTIONS: {
  id: SettingsSection;
  label: string;
  hint: string;
  icon: typeof Cable;
}[] = [
  { id: 'connection', label: '连接', hint: '模型与服务', icon: Cable },
  { id: 'canvas', label: '画布', hint: '主题与外观', icon: Palette },
  { id: 'prefs', label: '偏好', hint: '创作习惯', icon: SlidersHorizontal },
];

export function SettingsModal() {
  const { settingsOpen, toggleSettings, settings, load, save } = useCredentialVault();
  const [draft, setDraft] = useState<AppSettings>({});
  const [section, setSection] = useState<SettingsSection>('connection');
  const [vbStatus, setVbStatus] = useState<string | null>(null);
  const [luxStatus, setLuxStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settingsOpen && !settings) void load();
  }, [settingsOpen, settings, load]);

  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        toggleSettings(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen, toggleSettings]);

  useEffect(() => {
    if (!settingsOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [settingsOpen]);

  const close = useCallback(() => toggleSettings(false), [toggleSettings]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await save(draft);
      useStageDeckFlag.getState().setOverride(null);
      toggleSettings(false);
    } finally {
      setSaving(false);
    }
  }, [draft, save, toggleSettings]);

  if (!settingsOpen) return null;

  const active = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  return createPortal(
    <div className="nx9-settings" role="dialog" aria-modal="true" aria-label="设置">
      <button
        type="button"
        className="nx9-settings__backdrop"
        onClick={close}
        aria-label="关闭设置"
      />
      <div
        className="nx9-settings__panel"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="nx9-settings__header">
          <div className="nx9-settings__header-main">
            <span className="nx9-settings__icon">
              <Key size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="nx9-settings__title">设置</h2>
              <p className="nx9-settings__subtitle">
                {active.label} · {active.hint}
              </p>
            </div>
          </div>
          <button type="button" onClick={close} className="nx9-settings__close" title="关闭 (Esc)">
            <X size={18} />
          </button>
        </header>

        <div className="nx9-settings__shell">
          <nav className="nx9-settings__nav" aria-label="设置分区">
            {SECTIONS.map(({ id, label, hint, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                className={`nx9-settings__nav-item ${section === id ? 'is-on' : ''}`}
                aria-current={section === id ? 'page' : undefined}
              >
                <span className="nx9-settings__nav-icon">
                  <Icon size={14} />
                </span>
                <span className="nx9-settings__nav-text">
                  <span className="nx9-settings__nav-label">{translate(label)}</span>
                  <span className="nx9-settings__nav-hint">{hint}</span>
                </span>
              </button>
            ))}
          </nav>

          <div className="nx9-settings__body nx9-scroll">
            {section === 'connection' && (
              <ConnectionSettings
                draft={draft}
                setDraft={setDraft}
                vbStatus={vbStatus}
                setVbStatus={setVbStatus}
                luxStatus={luxStatus}
                setLuxStatus={setLuxStatus}
              />
            )}
            {section === 'canvas' && <CanvasSettings />}
            {section === 'prefs' && <PrefsSettings draft={draft} setDraft={setDraft} />}
          </div>
        </div>

        <footer className="nx9-settings__footer">
          <p className="nx9-settings__footer-hint">
            {section === 'canvas' ? '画布外观立即生效，仅当前工作区' : '连接与偏好需保存后生效'}
          </p>
          <div className="nx9-settings__footer-actions">
            <button type="button" className="nx9-settings__cancel" onClick={close}>
              取消
            </button>
            <button
              type="button"
              className="nx9-settings__save"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              保存设置
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/** @deprecated 使用 SettingsModal；保留别名避免旧引用断裂 */
export const SettingsDrawer = SettingsModal;

/* ── 连接设置 ── */
function ConnectionSettings({
  draft,
  setDraft,
  vbStatus,
  setVbStatus,
  luxStatus,
  setLuxStatus,
}: {
  draft: AppSettings;
  setDraft: (v: AppSettings) => void;
  vbStatus: string | null;
  setVbStatus: (v: string | null) => void;
  luxStatus: string | null;
  setLuxStatus: (v: string | null) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="nx9-settings__hero">
        <p className="nx9-settings__hero-title">模型与服务连接</p>
        <p className="nx9-settings__hero-desc">
          按生产流程拆开配置：文字负责剧本/提示词，图片负责出图，视频负责成片，音频负责配音。Magic Hour 的 Key 仍从{' '}
          <code className="text-ink/70">apps/server/.env</code> 读取。
        </p>
      </div>

      <SettingCard
        title="对话 / 文字模型"
        badge="剧本拆分 · 提示词 · 批审"
        description="这里用于 AI 剧本拆解、分镜文案、导演提示词等文字任务。留空 LLM Key 时，会回退使用主 API Key。"
      >
        <div className="nx9-settings__field-grid">
          <Field
            label="LLM API Key（推荐单独填写）"
            value={draft.llmApiKey ?? ''}
            onChange={(v) => setDraft({ ...draft, llmApiKey: v })}
          />
          <Field
            label="LLM 默认模型"
            value={draft.llmModel ?? ''}
            onChange={(v) => setDraft({ ...draft, llmModel: v })}
            placeholder="gpt-4o-mini / auto / 供应商模型名"
            plain
          />
        </div>
        <Field
          label="LLM Base URL（对话/文字模型）"
          value={draft.llmBaseUrl ?? ''}
          onChange={(v) => setDraft({ ...draft, llmBaseUrl: v })}
          placeholder="https://api.openai.com/v1"
          plain
        />
        <div className="nx9-settings__field-grid">
          <Field
            label="通用 / 图片 API Key（兼容旧主 Key）"
            value={draft.primaryApiKey ?? ''}
            onChange={(v) => setDraft({ ...draft, primaryApiKey: v })}
          />
          <Field
            label="通用 Base URL"
            value={draft.primaryBaseUrl ?? ''}
            onChange={(v) => setDraft({ ...draft, primaryBaseUrl: v })}
            placeholder="https://api.openai.com/v1"
            plain
          />
        </div>
      </SettingCard>

      <SettingCard
        title="图片模型"
        badge="分镜图 · 角色图 · Gemini · 720° 全景图"
        description="OpenAI 兼容图片模型用上面的通用 Key/Base URL；Gemini / Imagen 用本组 Key；Magic Hour 走 apps/server/.env 的 MAGIC_HOUR_API_KEY。"
      >
        <div className="nx9-settings__field-grid">
          <Field
            label="Gemini API Key（Google AI Studio）"
            value={draft.geminiApiKey ?? ''}
            onChange={(v) => setDraft({ ...draft, geminiApiKey: v })}
          />
          <Field
            label="Gemini Base URL"
            value={draft.geminiBaseUrl ?? ''}
            onChange={(v) => setDraft({ ...draft, geminiBaseUrl: v })}
            placeholder="https://generativelanguage.googleapis.com/v1beta"
            plain
          />
        </div>
        <p className="nx9-settings__hint">
          Pro 会员可在 Google AI Studio 申请 Key（免费图片额度按 Google 当日策略）。图像节点/素材库可选手动选择模型：Gemini 3.1 Flash Image（Pro 推荐）、3 Pro Image、2.5 Flash Image、Imagen 4/Ultra/Fast。填 Key 后保存并重启 server；也可在 apps/server/.env 写 GEMINI_API_KEY。若报 fetch failed/无法连接，需给 Node 配 HTTPS_PROXY 或填可访问的 Base URL 中转。若报 429 配额不足：Google AI Studio 网页 Pro ≠ API 出图额度，需在 https://ai.dev/rate-limit 查看，并为项目开通 Billing。
        </p>
        <Field
          label="RunningHub Key（可选）"
          value={draft.rhApiKey ?? ''}
          onChange={(v) => setDraft({ ...draft, rhApiKey: v })}
        />
        <p className="nx9-settings__hint">
          后续如果接 ComfyUI、RunningHub 或专门的全景图服务，会放在这一组，不再混进视频配置里。
        </p>
      </SettingCard>

      <SettingCard
        title="视频模型"
        badge="图生视频 · 文生视频 · Grok / xAI"
        description="正式生产建议选 xAI 官方；本地 GrokGo 保留给测试流程。旧自定义视频配置仍然保留。"
      >
        <SelectField
          label="当前视频通道"
          value={draft.videoProvider ?? 'custom'}
          onChange={(v) => setDraft({ ...draft, videoProvider: v as AppSettings['videoProvider'] })}
          options={[
            { value: 'xai', label: 'xAI 官方 Grok（正式）' },
            { value: 'grokgo', label: '本地 GrokGo（测试）' },
            { value: 'custom', label: '自定义兼容通道' },
          ]}
        />
        <div className="nx9-settings__inset">
          <p className="nx9-settings__inset-title">xAI 官方 Grok</p>
          <div className="nx9-settings__field-grid">
            <Field
              label="xAI 官方 API Key"
              value={draft.xaiApiKey ?? ''}
              onChange={(v) => setDraft({ ...draft, xaiApiKey: v })}
            />
            <Field
              label="xAI 官方 Base URL"
              value={draft.xaiBaseUrl ?? ''}
              onChange={(v) => setDraft({ ...draft, xaiBaseUrl: v })}
              placeholder="https://api.x.ai/v1"
              plain
            />
          </div>
        </div>
        <div className="nx9-settings__inset">
          <p className="nx9-settings__inset-title">本地 GrokGo 测试桥</p>
          <div className="nx9-settings__field-grid">
            <Field
              label="GrokGo Key"
              value={draft.grokGoApiKey ?? ''}
              onChange={(v) => setDraft({ ...draft, grokGoApiKey: v })}
            />
            <Field
              label="GrokGo Base URL"
              value={draft.grokGoBaseUrl ?? ''}
              onChange={(v) => setDraft({ ...draft, grokGoBaseUrl: v })}
              placeholder="http://127.0.0.1:8787/v1"
              plain
            />
          </div>
        </div>
        <details className="nx9-settings__details">
          <summary className="nx9-settings__details-summary">自定义兼容通道 / 旧配置</summary>
          <div className="mt-3 space-y-2">
            <div className="nx9-settings__field-grid">
              <Field
                label="自定义视频 API Key"
                value={draft.videoApiKey ?? ''}
                onChange={(v) => setDraft({ ...draft, videoApiKey: v })}
              />
              <Field
                label="自定义视频 API Base URL"
                value={draft.videoBaseUrl ?? ''}
                onChange={(v) => setDraft({ ...draft, videoBaseUrl: v })}
                placeholder="http://127.0.0.1:8787/v1"
                plain
              />
            </div>
          </div>
        </details>
      </SettingCard>

      <SettingCard
        title="音频模型"
        badge="AI 配音 · 旁白 · 声音克隆"
        description="云端 TTS、Voicebox 本地桥、LuxTTS 克隆都集中在这里。"
      >
        <div className="nx9-settings__field-grid">
          <Field
            label="TTS API Key（留空则用通用 Key）"
            value={draft.ttsApiKey ?? ''}
            onChange={(v) => setDraft({ ...draft, ttsApiKey: v })}
          />
          <Field
            label="TTS Base URL"
            value={draft.ttsBaseUrl ?? ''}
            onChange={(v) => setDraft({ ...draft, ttsBaseUrl: v })}
            placeholder="https://api.openai.com/v1"
            plain
          />
        </div>

        <div className="nx9-settings__inset">
          <div className="nx9-settings__inset-title">
            <Radio size={16} className="text-accent" />
            Voicebox 本地桥接
          </div>
          <label className="nx9-settings__check">
            <input
              type="checkbox"
              checked={draft.voiceboxEnabled ?? false}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  voiceboxEnabled: e.target.checked,
                  voiceboxBaseUrl:
                    draft.voiceboxBaseUrl ?? getRuntime().voiceboxBaseUrl ?? 'http://127.0.0.1:17493',
                })
              }
            />
            优先使用本地 Voicebox（需运行 Voicebox App）
          </label>
          <div className="nx9-settings__field-grid">
            <Field
              label="Voicebox Base URL"
              value={draft.voiceboxBaseUrl ?? getRuntime().voiceboxBaseUrl ?? 'http://127.0.0.1:17493'}
              onChange={(v) => setDraft({ ...draft, voiceboxBaseUrl: v })}
              placeholder="http://127.0.0.1:17493"
              plain
            />
            <Field
              label="默认音色 Profile"
              value={draft.voiceboxDefaultProfile ?? ''}
              onChange={(v) => setDraft({ ...draft, voiceboxDefaultProfile: v })}
              placeholder="音色名或 profile id"
              plain
            />
          </div>
          <button
            type="button"
            onClick={() =>
              void api
                .probeVoicebox(draft.voiceboxBaseUrl)
                .then((r) => setVbStatus(r.message ?? (r.available ? '已连接' : '未连接')))
                .catch((e) => setVbStatus(String(e)))
            }
            className="nx9-settings__link-btn"
          >
            探测连接
          </button>
          {vbStatus && <p className="nx9-settings__hint">{vbStatus}</p>}
        </div>

        <div className="nx9-settings__inset">
          <div className="nx9-settings__inset-title">
            <Radio size={16} className="text-brand" />
            LuxTTS 本地克隆
          </div>
          <p className="nx9-settings__hint">
            基于{' '}
            <a
              href="https://github.com/ysharma3501/LuxTTS"
              target="_blank"
              rel="noreferrer"
              className="text-brand hover:underline"
            >
              LuxTTS
            </a>
            ，需先运行 <code>pnpm run luxtts:install</code> 与 <code>pnpm run luxtts:start</code>
            。参考音频 ≥3 秒。
          </p>
          <label className="nx9-settings__check">
            <input
              type="checkbox"
              checked={draft.luxTtsEnabled ?? false}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  luxTtsEnabled: e.target.checked,
                  luxTtsBaseUrl: draft.luxTtsBaseUrl ?? getRuntime().luxTtsBaseUrl ?? 'http://127.0.0.1:17880',
                  luxTtsNoGpuFallback: draft.luxTtsNoGpuFallback ?? 'cloud',
                })
              }
            />
            优先使用 LuxTTS（有参考音频时）
          </label>
          <div className="nx9-settings__inset">
            <p className="text-xs font-medium">无 GPU 时保底策略</p>
            <p className="nx9-settings__hint">
              探测到 LuxTTS 跑在 CPU（或未检测到 CUDA/MPS）时，按你的选择处理；可在设置里随时切换。
            </p>
            <label className="flex items-start gap-2 text-xs cursor-pointer">
              <input
                type="radio"
                name="luxNoGpuFallback"
                className="mt-0.5"
                checked={(draft.luxTtsNoGpuFallback ?? 'cloud') === 'cloud'}
                onChange={() => setDraft({ ...draft, luxTtsNoGpuFallback: 'cloud' })}
              />
              <span>
                <span className="font-medium">改走云端 TTS</span>
                <span className="block text-[10px] text-ink/45">
                  跳过本地 LuxTTS，走 Voicebox 或云端 API（推荐，更快）
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs cursor-pointer">
              <input
                type="radio"
                name="luxNoGpuFallback"
                className="mt-0.5"
                checked={draft.luxTtsNoGpuFallback === 'cpu'}
                onChange={() => setDraft({ ...draft, luxTtsNoGpuFallback: 'cpu' })}
              />
              <span>
                <span className="font-medium">继续 LuxTTS CPU</span>
                <span className="block text-[10px] text-ink/45">完全离线克隆，速度较慢</span>
              </span>
            </label>
          </div>
          <Field
            label="LuxTTS Base URL"
            value={draft.luxTtsBaseUrl ?? getRuntime().luxTtsBaseUrl ?? 'http://127.0.0.1:17880'}
            onChange={(v) => setDraft({ ...draft, luxTtsBaseUrl: v })}
            placeholder="http://127.0.0.1:17880"
            plain
          />
          <Field
            label="默认参考音频（/media/audio/...）"
            value={draft.luxTtsDefaultReferenceAudio ?? ''}
            onChange={(v) => setDraft({ ...draft, luxTtsDefaultReferenceAudio: v })}
            placeholder="/media/uploads/ref-voice.wav"
            plain
          />
          <div className="nx9-settings__field-grid">
            <Field
              label="num_steps"
              value={String(draft.luxTtsNumSteps ?? 4)}
              onChange={(v) => setDraft({ ...draft, luxTtsNumSteps: Number(v) || 4 })}
              plain
            />
            <Field
              label="speed"
              value={String(draft.luxTtsSpeed ?? 1)}
              onChange={(v) => setDraft({ ...draft, luxTtsSpeed: Number(v) || 1 })}
              plain
            />
          </div>
          <label className="nx9-settings__check">
            <input
              type="checkbox"
              checked={draft.luxTtsReturnSmooth ?? false}
              onChange={(e) => setDraft({ ...draft, luxTtsReturnSmooth: e.target.checked })}
            />
            return_smooth（金属感时可开启）
          </label>
          <button
            type="button"
            onClick={() =>
              void api
                .probeLuxTts(draft.luxTtsBaseUrl)
                .then((r) => {
                  const parts = [
                    r.message ?? (r.available ? '已连接' : '未连接'),
                    r.gpuAvailable === true
                      ? `GPU 可用${r.cudaAvailable ? ' (CUDA)' : r.mpsAvailable ? ' (MPS)' : ''}`
                      : r.available
                        ? '未检测到 GPU'
                        : '',
                    r.effectiveStrategy,
                    r.recommendation ? `提示：${r.recommendation}` : '',
                  ].filter(Boolean);
                  setLuxStatus(parts.join(' · '));
                })
                .catch((e) => setLuxStatus(String(e)))
            }
            className="nx9-settings__link-btn"
          >
            探测 LuxTTS
          </button>
          {luxStatus && (
            <p
              className={`nx9-settings__hint ${
                luxStatus.includes('未检测到 GPU') ? 'text-amber-700' : ''
              }`}
            >
              {luxStatus}
            </p>
          )}
        </div>
      </SettingCard>

      <SettingCard
        title="维护 / 诊断"
        badge="连接检测 · 数据迁移"
        description="这些不是模型参数，只在排查问题或迁移数据时使用。"
      >
        <div className="nx9-settings__inset">
          <p className="nx9-settings__inset-title">数据库（Prisma）</p>
          <p className="nx9-settings__hint">
            将 JSON 工作区迁移到 SQLite。迁移后设置环境变量 NX9_STORAGE=prisma 并重启服务。
          </p>
          <button
            type="button"
            onClick={() =>
              void api
                .migrateToPrisma()
                .then((r) => alert(`已迁移 ${r.migrated} 个工作区，跳过 ${r.skipped}`))
            }
            className="nx9-settings__link-btn"
          >
            迁移 JSON → Prisma
          </button>
        </div>
        <ProbeProvidersBlock />
      </SettingCard>

      <div className="nx9-settings__note">Stage Deck Canvas 已作为默认画布，始终启用。</div>
    </div>
  );
}

/* ── 画布与外观 ── */
function CanvasSettings() {
  const canvasAppearance = useWorkspaceDocument((s) => s.canvasAppearance);
  const setCanvasAppearance = useWorkspaceDocument((s) => s.setCanvasAppearance);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const update = useCallback(
    (patch: Partial<CanvasAppearance>) => {
      const next = { ...canvasAppearance, ...patch };
      setCanvasAppearance(next);
      if (patch.theme) {
        localStorage.setItem('nx9:canvas_theme', patch.theme);
      }
    },
    [canvasAppearance, setCanvasAppearance],
  );

  const handleUpload = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return;
      setUploading(true);
      try {
        const res = await api.uploadAsset(file);
        update({ backgroundImageUrl: res.url });
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [update],
  );

  const theme = canvasAppearance.theme || 'dark';

  return (
    <div className="space-y-4">
      <div className="nx9-settings__hero">
        <p className="nx9-settings__hero-title">画布与外观</p>
        <p className="nx9-settings__hero-desc">
          主题、网格与背景图仅作用于当前工作区，修改后即时预览，无需等待全局保存。
        </p>
      </div>

      <SettingCard title="主题模式" badge="全局节点同步" description="默认深色 desk · 浅色为暖纸风格">
        <div className="nx9-settings__segment">
          {(['dark', 'light'] as CanvasThemeMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => update({ theme: mode })}
              className={`nx9-settings__segment-btn ${theme === mode ? 'is-on' : ''}`}
            >
              {mode === 'light' ? '浅色' : '深色（默认）'}
            </button>
          ))}
        </div>
      </SettingCard>

      <SettingCard title="网格样式" badge="画布底纹" description="点阵适合精密对齐，线格更易读尺度，空白更干净">
        <div className="nx9-settings__segment">
          {(['dots', 'lines', 'blank'] as CanvasGridStyle[]).map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => update({ gridStyle: style })}
              className={`nx9-settings__segment-btn ${
                canvasAppearance.gridStyle === style ? 'is-on' : ''
              }`}
            >
              {style === 'dots' ? '点阵' : style === 'lines' ? '线格' : '空白'}
            </button>
          ))}
        </div>
      </SettingCard>

      <SettingCard
        title="连接点样式"
        badge="节点端口"
        description="左右各一口；上下能力口按节点配置。「移入显示」平时隐藏，鼠标移入卡片再出现"
      >
        <div className="nx9-settings__segment">
          {(
            [
              { id: 'dot' as const, label: '点状' },
              { id: 'plus' as const, label: '卡外加号' },
              { id: 'hidden' as const, label: '移入显示' },
            ] satisfies { id: CanvasSocketStyle; label: string }[]
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => update({ socketStyle: id })}
              className={`nx9-settings__segment-btn ${
                (canvasAppearance.socketStyle ?? 'dot') === id ? 'is-on' : ''
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </SettingCard>

      <SettingCard
        title="连接线线条类型"
        badge="全局"
        description="作用于画布全部连接线；能力连线仍为直线。悬停连线中点可断开"
      >
        <div className="nx9-settings__segment nx9-settings__segment--wrap">
          {FLOW_EDGE_TYPES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => update({ edgePathType: id as CanvasEdgePathType })}
              className={`nx9-settings__segment-btn ${
                (canvasAppearance.edgePathType ?? 'default') === id ? 'is-on' : ''
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </SettingCard>

      <SettingCard title="背景图" badge="可选" description="上传后可调透明度，避免压过节点可读性">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUpload(f);
          }}
        />
        {canvasAppearance.backgroundImageUrl ? (
          <div className="nx9-settings__bg-preview">
            <img src={canvasAppearance.backgroundImageUrl} alt="" />
            <button
              type="button"
              onClick={() => update({ backgroundImageUrl: null })}
              className="nx9-settings__bg-clear"
              aria-label="移除背景图"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="nx9-settings__upload"
          >
            <ImageIcon size={14} />
            {uploading ? '上传中…' : '上传背景图'}
          </button>
        )}
        {canvasAppearance.backgroundImageUrl && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-ink/50">透明度</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round((canvasAppearance.backgroundImageOpacity ?? 0.35) * 100)}
              onChange={(e) => update({ backgroundImageOpacity: Number(e.target.value) / 100 })}
              className="flex-1 accent-brand"
            />
            <span className="text-[10px] text-ink/40 tabular-nums w-8 text-right">
              {Math.round((canvasAppearance.backgroundImageOpacity ?? 0.35) * 100)}%
            </span>
          </div>
        )}
      </SettingCard>
    </div>
  );
}

/* ── 偏好设置 ── */
function PrefsSettings({
  draft,
  setDraft,
}: {
  draft: AppSettings;
  setDraft: (v: AppSettings) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="nx9-settings__hero">
        <p className="nx9-settings__hero-title">创作偏好</p>
        <p className="nx9-settings__hero-desc">控制流程节奏、动效与调试信息，保存后在本机生效。</p>
      </div>
      <div className="nx9-settings__pref-list">
        <PrefsCheckbox
          draft={draft}
          setDraft={setDraft}
          field="autoAdvanceEnabled"
          defaultVal={true}
          label="步骤完成自动前进"
          description="当前步骤成功后自动进入下一步，适合连续生产。"
        />
        <PrefsCheckbox
          draft={draft}
          setDraft={setDraft}
          field="reduceMotion"
          defaultVal={false}
          label="减少动画"
          description="降低动效与过渡，提升大图与复杂画布性能。"
        />
        <PrefsCheckbox
          draft={draft}
          setDraft={setDraft}
          field="taskNotificationsEnabled"
          defaultVal={true}
          label="生成任务通知"
          description="任务完成或失败时弹出提示，避免错过后台结果。"
        />
        <PrefsCheckbox
          draft={draft}
          setDraft={setDraft}
          field="showEngineDebug"
          defaultVal={false}
          label="显示 Engine 调试信息"
          description="面向排查问题；日常创作建议关闭。"
        />
      </div>
    </div>
  );
}

function PrefsCheckbox({
  draft,
  setDraft,
  field,
  defaultVal,
  label,
  description,
}: {
  draft: AppSettings;
  setDraft: (v: AppSettings) => void;
  field: keyof NonNullable<AppSettings['preferences']>;
  defaultVal: boolean;
  label: string;
  description: string;
}) {
  const prefs = draft.preferences;
  const checked = Boolean(prefs?.[field] ?? defaultVal);
  return (
    <label className="nx9-settings__pref-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) =>
          setDraft({
            ...draft,
            preferences: {
              ...draft.preferences!,
              [field]: e.target.checked,
            },
          })
        }
      />
      <span className="nx9-settings__pref-copy">
        <span className="nx9-settings__pref-label">{label}</span>
        <span className="nx9-settings__pref-desc">{description}</span>
      </span>
    </label>
  );
}

function SettingCard({
  title,
  badge,
  description,
  children,
}: {
  title: string;
  badge: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="nx9-settings__card">
      <div className="nx9-settings__card-head">
        <div className="nx9-settings__card-title-row">
          <h3 className="nx9-settings__card-title">{title}</h3>
          <span className="nx9-settings__badge">{badge}</span>
        </div>
        <p className="nx9-settings__card-desc">{description}</p>
      </div>
      <div className="nx9-settings__fields">{children}</div>
    </section>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="nx9-settings__field">
      <span className="nx9-settings__label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="nx9-settings__select">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProbeProvidersBlock() {
  const [results, setResults] = useState<
    { id: string; label: string; available: boolean; models?: string[]; message?: string }[] | null
  >(null);
  const [probing, setProbing] = useState(false);

  return (
    <div className="nx9-settings__inset">
      <div className="flex items-center justify-between gap-2">
        <p className="nx9-settings__inset-title">探测模型</p>
        <button
          type="button"
          disabled={probing}
          onClick={() => {
            setProbing(true);
            void api
              .probeProviders()
              .then((r) => setResults(r.providers))
              .catch(() => setResults([]))
              .finally(() => setProbing(false));
          }}
          className="nx9-settings__link-btn"
        >
          {probing ? '探测中…' : '探测模型'}
        </button>
      </div>
      {results && results.length === 0 && (
        <p className="nx9-settings__hint">未配置 Provider 或无可用 Provider</p>
      )}
      {results && results.length > 0 && (
        <div className="space-y-1.5">
          {results.map((r) => (
            <div key={r.id} className={`nx9-settings__probe-row ${r.available ? '' : 'opacity-45'}`}>
              <span className={`nx9-settings__probe-dot ${r.available ? 'is-ok' : 'is-bad'}`} />
              <span className="font-medium">{r.label}</span>
              <span className="ml-auto text-[11px] opacity-70">{r.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  plain,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  plain?: boolean;
}) {
  return (
    <label className="nx9-settings__field">
      <span className="nx9-settings__label">{label}</span>
      <input
        type={plain ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="nx9-settings__input"
        placeholder={placeholder ?? (plain ? '' : '••••••••')}
      />
    </label>
  );
}
