import { X, Key, Save, Radio, Image as ImageIcon } from 'lucide-react';
import { useEffect, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type { AppSettings, CanvasAppearance, CanvasGridStyle, CanvasThemeMode } from '@nx9/shared';
import { translate } from '@nx9/shared';
import { useCredentialVault } from '../stores/credential-vault';
import { useStageDeckFlag } from '../stores/stage-deck-flag';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { api } from '../api/client';
import { getRuntime } from '../platform/runtime-bridge';

type SettingsSection = 'connection' | 'canvas' | 'prefs';

export function SettingsDrawer() {
  const { settingsOpen, toggleSettings, settings, load, save } = useCredentialVault();
  const [draft, setDraft] = useState<AppSettings>({});
  const [section, setSection] = useState<SettingsSection>('connection');
  const [vbStatus, setVbStatus] = useState<string | null>(null);
  const [luxStatus, setLuxStatus] = useState<string | null>(null);

  useEffect(() => {
    if (settingsOpen && !settings) void load();
  }, [settingsOpen, settings, load]);

  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  if (!settingsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="flex-1 bg-ink/20 backdrop-blur-[2px]"
        onClick={() => toggleSettings(false)}
        aria-label="关闭设置"
      />
      <div className="w-full max-w-md h-full bg-white shadow-panel flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div className="flex items-center gap-2">
            <Key size={18} className="text-brand" />
            <h2 className="text-lg font-semibold">设置</h2>
          </div>
          <button type="button" onClick={() => toggleSettings(false)} className="p-1 hover:text-brand">
            <X size={20} />
          </button>
        </div>

        {/* 分区 Tab */}
        <div className="flex border-b border-line">
          {([
            { id: 'connection' as const, label: translate('连接') },
            { id: 'canvas' as const, label: translate('画布') },
            { id: 'prefs' as const, label: translate('偏好') },
          ]).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={`flex-1 text-sm py-2.5 font-medium border-b-2 transition-colors ${
                section === id
                  ? 'border-brand text-brand'
                  : 'border-transparent text-ink/50 hover:text-ink/70'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto nx9-scroll p-5 space-y-4">
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

          {section === 'prefs' && (
            <PrefsSettings draft={draft} setDraft={setDraft} />
          )}
        </div>

        <div className="p-5 border-t border-line">
          <button
            type="button"
            onClick={() => {
              void save(draft).then(() => {
                useStageDeckFlag.getState().setOverride(null);
              });
            }}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand text-white py-2.5 hover:bg-brand/90"
          >
            <Save size={16} />
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 连接设置 ── */
function ConnectionSettings({
  draft, setDraft, vbStatus, setVbStatus, luxStatus, setLuxStatus,
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
      <div className="rounded-2xl border border-brand/15 bg-brand/[0.04] p-3">
        <p className="text-sm font-semibold text-ink">模型与服务连接</p>
        <p className="mt-1 text-[11px] leading-relaxed text-ink/50">
          按生产流程拆开配置：文字负责剧本/提示词，图片负责出图，视频负责成片，音频负责配音。Magic Hour 的 Key 仍从{' '}
          <code className="text-ink/70">apps/server/.env</code> 读取。
        </p>
      </div>

      <SettingCard
        title="对话 / 文字模型"
        badge="剧本拆分 · 提示词 · 批审"
        description="这里用于 AI 剧本拆解、分镜文案、导演提示词等文字任务。留空 LLM Key 时，会回退使用主 API Key。"
      >
        <Field
          label="LLM API Key（推荐单独填写）"
          value={draft.llmApiKey ?? ''}
          onChange={(v) => setDraft({ ...draft, llmApiKey: v })}
        />
        <Field
          label="LLM Base URL（对话/文字模型）"
          value={draft.llmBaseUrl ?? ''}
          onChange={(v) => setDraft({ ...draft, llmBaseUrl: v })}
          placeholder="https://api.openai.com/v1"
          plain
        />
        <Field
          label="LLM 默认模型"
          value={draft.llmModel ?? ''}
          onChange={(v) => setDraft({ ...draft, llmModel: v })}
          placeholder="gpt-4o-mini / auto / 供应商模型名"
          plain
        />
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
      </SettingCard>

      <SettingCard
        title="图片模型"
        badge="分镜图 · 角色图 · 720° 全景图"
        description="OpenAI 兼容图片模型默认使用上面的通用 Key/Base URL；Magic Hour 图片模型会自动走 .env 里的 MAGIC_HOUR_API_KEY。"
      >
        <Field
          label="RunningHub Key（可选）"
          value={draft.rhApiKey ?? ''}
          onChange={(v) => setDraft({ ...draft, rhApiKey: v })}
        />
        <p className="text-[10px] leading-relaxed text-ink/45">
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
        <div className="rounded-xl bg-surface/80 p-3 space-y-2">
          <p className="text-xs font-semibold text-ink/70">xAI 官方 Grok</p>
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
        <div className="rounded-xl bg-surface/80 p-3 space-y-2">
          <p className="text-xs font-semibold text-ink/70">本地 GrokGo 测试桥</p>
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
        <details className="rounded-xl border border-line/70 bg-white px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-ink/60">自定义兼容通道 / 旧配置</summary>
          <div className="mt-3 space-y-2">
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
        </details>
      </SettingCard>

      <SettingCard
        title="音频模型"
        badge="AI 配音 · 旁白 · 声音克隆"
        description="云端 TTS、Voicebox 本地桥、LuxTTS 克隆都集中在这里。"
      >
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

        <div className="rounded-xl border border-line/70 bg-white p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Radio size={16} className="text-accent" />
            Voicebox 本地桥接
          </div>
        <label className="flex items-center gap-2 text-sm">
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
        <button
          type="button"
          onClick={() =>
            void api
              .probeVoicebox(draft.voiceboxBaseUrl)
              .then((r) => setVbStatus(r.message ?? (r.available ? '已连接' : '未连接')))
              .catch((e) => setVbStatus(String(e)))
          }
          className="text-xs text-brand hover:underline"
        >
          探测连接
        </button>
        {vbStatus && <p className="text-[10px] text-ink/50">{vbStatus}</p>}
      </div>

        <div className="rounded-xl border border-line/70 bg-white p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Radio size={16} className="text-brand" />
          LuxTTS 本地克隆
        </div>
        <p className="text-[10px] text-ink/50 leading-relaxed">
          基于{' '}
          <a href="https://github.com/ysharma3501/LuxTTS" target="_blank" rel="noreferrer" className="text-brand hover:underline">LuxTTS</a>
          ，需先运行 <code className="text-[10px]">npm run luxtts:install</code> 与{' '}
          <code className="text-[10px]">npm run luxtts:start</code>。参考音频 ≥3 秒。
        </p>
        <label className="flex items-center gap-2 text-sm">
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
        <div className="rounded-lg bg-surface/80 p-2 space-y-1.5">
          <p className="text-xs font-medium text-ink/70">无 GPU 时保底策略</p>
          <p className="text-[10px] text-ink/45 leading-relaxed">
            探测到 LuxTTS 跑在 CPU（或未检测到 CUDA/MPS）时，按你的选择处理；可在设置里随时切换。
          </p>
          <label className="flex items-start gap-2 text-xs cursor-pointer">
            <input type="radio" name="luxNoGpuFallback" className="mt-0.5"
              checked={(draft.luxTtsNoGpuFallback ?? 'cloud') === 'cloud'}
              onChange={() => setDraft({ ...draft, luxTtsNoGpuFallback: 'cloud' })}
            />
            <span>
              <span className="font-medium">改走云端 TTS</span>
              <span className="block text-[10px] text-ink/45">跳过本地 LuxTTS，走 Voicebox 或云端 API（推荐，更快）</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-xs cursor-pointer">
            <input type="radio" name="luxNoGpuFallback" className="mt-0.5"
              checked={draft.luxTtsNoGpuFallback === 'cpu'}
              onChange={() => setDraft({ ...draft, luxTtsNoGpuFallback: 'cpu' })}
            />
            <span>
              <span className="font-medium">继续 LuxTTS CPU</span>
              <span className="block text-[10px] text-ink/45">完全离线克隆，速度较慢</span>
            </span>
          </label>
        </div>
        <Field label="LuxTTS Base URL"
          value={draft.luxTtsBaseUrl ?? getRuntime().luxTtsBaseUrl ?? 'http://127.0.0.1:17880'}
          onChange={(v) => setDraft({ ...draft, luxTtsBaseUrl: v })} placeholder="http://127.0.0.1:17880" plain
        />
        <Field label="默认参考音频（/media/audio/...）"
          value={draft.luxTtsDefaultReferenceAudio ?? ''}
          onChange={(v) => setDraft({ ...draft, luxTtsDefaultReferenceAudio: v })} placeholder="/media/uploads/ref-voice.wav" plain
        />
        <div className="grid grid-cols-2 gap-2">
          <Field label="num_steps" value={String(draft.luxTtsNumSteps ?? 4)}
            onChange={(v) => setDraft({ ...draft, luxTtsNumSteps: Number(v) || 4 })} plain
          />
          <Field label="speed" value={String(draft.luxTtsSpeed ?? 1)}
            onChange={(v) => setDraft({ ...draft, luxTtsSpeed: Number(v) || 1 })} plain
          />
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={draft.luxTtsReturnSmooth ?? false}
            onChange={(e) => setDraft({ ...draft, luxTtsReturnSmooth: e.target.checked })}
          />
          return_smooth（金属感时可开启）
        </label>
        <button type="button" onClick={() =>
          void api.probeLuxTts(draft.luxTtsBaseUrl).then((r) => {
            const parts = [
              r.message ?? (r.available ? '已连接' : '未连接'),
              r.gpuAvailable === true ? `GPU 可用${r.cudaAvailable ? ' (CUDA)' : r.mpsAvailable ? ' (MPS)' : ''}` : r.available ? '未检测到 GPU' : '',
              r.effectiveStrategy,
              r.recommendation ? `提示：${r.recommendation}` : '',
            ].filter(Boolean);
            setLuxStatus(parts.join(' · '));
          }).catch((e) => setLuxStatus(String(e)))
        } className="text-xs text-brand hover:underline">探测 LuxTTS</button>
        {luxStatus && <p className={`text-[10px] leading-relaxed ${luxStatus.includes('未检测到 GPU') ? 'text-amber-700' : 'text-ink/50'}`}>{luxStatus}</p>}
      </div>
      </SettingCard>

      <SettingCard
        title="维护 / 诊断"
        badge="连接检测 · 数据迁移"
        description="这些不是模型参数，只在排查问题或迁移数据时使用。"
      >
      <div className="rounded-xl border border-line/70 bg-white p-3 space-y-2">
        <p className="text-sm font-medium">数据库（Prisma）</p>
        <p className="text-[10px] text-ink/50">将 JSON 工作区迁移到 SQLite。迁移后设置环境变量 NX9_STORAGE=prisma 并重启服务。</p>
        <button type="button" onClick={() => void api.migrateToPrisma().then((r) => alert(`已迁移 ${r.migrated} 个工作区，跳过 ${r.skipped}`))}
          className="text-xs text-brand hover:underline">迁移 JSON → Prisma</button>
      </div>

      <ProbeProvidersBlock />
      </SettingCard>

      <div className="rounded-xl bg-surface/80 p-3 text-xs text-ink/50">
        Stage Deck Canvas 已作为默认画布，始终启用。
      </div>
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
      setCanvasAppearance({ ...canvasAppearance, ...patch });
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

  const theme = canvasAppearance.theme || 'light';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ImageIcon size={16} className="text-ink/50" />
        <span className="font-medium text-sm">画布与外观</span>
        <p className="text-[10px] text-ink/40 ml-auto">仅当前工作区生效</p>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-ink/60">主题模式</p>
        <div className="flex gap-1">
          {(['light', 'dark'] as CanvasThemeMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => update({ theme: mode })}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex-1 ${
                theme === mode
                  ? 'bg-brand/10 text-brand border-brand/30'
                  : 'border-line text-ink/60 hover:border-brand/30'
              }`}
            >
              {mode === 'light' ? '浅色' : '深色'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-ink/60">网格样式</p>
        <div className="flex gap-1">
          {(['dots', 'lines', 'blank'] as CanvasGridStyle[]).map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => update({ gridStyle: style })}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex-1 ${
                canvasAppearance.gridStyle === style
                  ? 'bg-brand/10 text-brand border-brand/30'
                  : 'border-line text-ink/60 hover:border-brand/30'
              }`}
            >
              {style === 'dots' ? '点' : style === 'lines' ? '线' : '空白'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-ink/60">背景图</p>
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
          <div className="relative rounded-lg border border-line overflow-hidden">
            <img src={canvasAppearance.backgroundImageUrl} alt="" className="w-full h-16 object-cover" />
            <button
              type="button"
              onClick={() => update({ backgroundImageUrl: null })}
              className="absolute top-1 right-1 p-0.5 rounded bg-black/40 text-white"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="w-full rounded-lg border border-dashed border-line py-3 text-xs text-ink/40 hover:border-brand/30 flex items-center justify-center gap-1"
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
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 偏好设置 ── */
function PrefsSettings({
  draft, setDraft,
}: {
  draft: AppSettings;
  setDraft: (v: AppSettings) => void;
}) {
  return (
    <>
      <PrefsCheckbox
        draft={draft} setDraft={setDraft}
        field="autoAdvanceEnabled" defaultVal={true}
        label="步骤完成自动前进"
      />
      <PrefsCheckbox
        draft={draft} setDraft={setDraft}
        field="reduceMotion" defaultVal={false}
        label="减少动画（提升大图性能）"
      />
      <PrefsCheckbox
        draft={draft} setDraft={setDraft}
        field="taskNotificationsEnabled" defaultVal={true}
        label="生成任务通知"
      />
      <PrefsCheckbox
        draft={draft} setDraft={setDraft}
        field="showEngineDebug" defaultVal={false}
        label="显示 Engine 调试信息"
      />
    </>
  );
}

function PrefsCheckbox({ draft, setDraft, field, defaultVal, label }: {
  draft: AppSettings;
  setDraft: (v: AppSettings) => void;
  field: keyof NonNullable<AppSettings['preferences']>;
  defaultVal: boolean;
  label: string;
}) {
  const prefs = draft.preferences;
  const checked = Boolean(prefs?.[field] ?? defaultVal);
  return (
    <label className="flex items-center gap-2 text-sm mt-3">
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
      {label}
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
    <section className="rounded-2xl border border-line bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.03)] space-y-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <span className="rounded-full bg-brand/8 px-2 py-0.5 text-[10px] font-medium text-brand">
            {badge}
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-ink/50">{description}</p>
      </div>
      <div className="space-y-3">{children}</div>
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
    <label className="block">
      <span className="text-xs font-medium text-ink/60 mb-1 block">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-line px-3 py-2 text-sm focus:outline-none focus:border-brand/40"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ── 探测模型 ── */
function ProbeProvidersBlock() {
  const [results, setResults] = useState<{ id: string; label: string; available: boolean; models?: string[]; message?: string }[] | null>(null);
  const [probing, setProbing] = useState(false);

  return (
    <div className="rounded-xl border border-line p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">探测模型</p>
        <button
          type="button"
          disabled={probing}
          onClick={() => {
            setProbing(true);
            void api.probeProviders().then((r) => setResults(r.providers)).catch(() => setResults([])).finally(() => setProbing(false));
          }}
          className="text-xs text-brand hover:underline disabled:opacity-40"
        >
          {probing ? '探测中…' : '探测模型'}
        </button>
      </div>
      {results && results.length === 0 && <p className="text-[10px] text-ink/50">未配置 Provider 或无可用 Provider</p>}
      {results && results.length > 0 && (
        <div className="space-y-1">
          {results.map((r) => (
            <div key={r.id} className={`flex items-center gap-2 text-xs ${r.available ? '' : 'opacity-40'}`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${r.available ? 'bg-green-500' : 'bg-red-400'}`} />
              <span className="font-medium">{r.label}</span>
              <span className="text-ink/50 ml-auto">{r.message}</span>
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
    <label className="block">
      <span className="text-xs font-medium text-ink/60 mb-1 block">{label}</span>
      <input
        type={plain ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-line px-3 py-2 text-sm focus:outline-none focus:border-brand/40"
        placeholder={placeholder ?? (plain ? '' : '••••••••')}
      />
    </label>
  );
}
