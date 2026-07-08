import { X, Key, Save, Radio } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AppSettings } from '@nx9/shared';
import { useCredentialVault } from '../stores/credential-vault';
import { useStageDeckFlag } from '../stores/stage-deck-flag';
import { api } from '../api/client';
import { getRuntime } from '../platform/runtime-bridge';

export function SettingsDrawer() {
  const { settingsOpen, toggleSettings, settings, load, save } = useCredentialVault();
  const [draft, setDraft] = useState<AppSettings>({});
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
            <h2 className="text-lg font-semibold">连接设置</h2>
          </div>
          <button type="button" onClick={() => toggleSettings(false)} className="p-1 hover:text-brand">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto nx9-scroll p-5 space-y-4">
          <Field
            label="主 API Key"
            value={draft.primaryApiKey ?? ''}
            onChange={(v) => setDraft((d) => ({ ...d, primaryApiKey: v }))}
          />
          <Field
            label="RunningHub Key"
            value={draft.rhApiKey ?? ''}
            onChange={(v) => setDraft((d) => ({ ...d, rhApiKey: v }))}
          />
          <Field
            label="LLM Key"
            value={draft.llmApiKey ?? ''}
            onChange={(v) => setDraft((d) => ({ ...d, llmApiKey: v }))}
          />
          <Field
            label="TTS Key（AI 配音，留空则用主 Key）"
            value={draft.ttsApiKey ?? ''}
            onChange={(v) => setDraft((d) => ({ ...d, ttsApiKey: v }))}
          />
          <Field
            label="TTS Base URL"
            value={draft.ttsBaseUrl ?? ''}
            onChange={(v) => setDraft((d) => ({ ...d, ttsBaseUrl: v }))}
            placeholder="https://api.openai.com/v1"
          />

          <div className="rounded-xl border border-line p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Radio size={16} className="text-accent" />
              Voicebox 本地桥接
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.voiceboxEnabled ?? false}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    voiceboxEnabled: e.target.checked,
                    voiceboxBaseUrl:
                      d.voiceboxBaseUrl ?? getRuntime().voiceboxBaseUrl ?? 'http://127.0.0.1:17493',
                  }))
                }
              />
              优先使用本地 Voicebox（需运行 Voicebox App）
            </label>
            <Field
              label="Voicebox Base URL"
              value={draft.voiceboxBaseUrl ?? getRuntime().voiceboxBaseUrl ?? 'http://127.0.0.1:17493'}
              onChange={(v) => setDraft((d) => ({ ...d, voiceboxBaseUrl: v }))}
              placeholder="http://127.0.0.1:17493"
              plain
            />
            <Field
              label="默认音色 Profile"
              value={draft.voiceboxDefaultProfile ?? ''}
              onChange={(v) => setDraft((d) => ({ ...d, voiceboxDefaultProfile: v }))}
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

          <div className="rounded-xl border border-line p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Radio size={16} className="text-brand" />
              LuxTTS 本地克隆
            </div>
            <p className="text-[10px] text-ink/50 leading-relaxed">
              基于{' '}
              <a
                href="https://github.com/ysharma3501/LuxTTS"
                target="_blank"
                rel="noreferrer"
                className="text-brand hover:underline"
              >
                LuxTTS
              </a>
              ，需先运行 <code className="text-[10px]">npm run luxtts:install</code> 与{' '}
              <code className="text-[10px]">npm run luxtts:start</code>。参考音频 ≥3 秒。
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.luxTtsEnabled ?? false}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    luxTtsEnabled: e.target.checked,
                    luxTtsBaseUrl:
                      d.luxTtsBaseUrl ?? getRuntime().luxTtsBaseUrl ?? 'http://127.0.0.1:17880',
                    luxTtsNoGpuFallback: d.luxTtsNoGpuFallback ?? 'cloud',
                  }))
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
                <input
                  type="radio"
                  name="luxNoGpuFallback"
                  className="mt-0.5"
                  checked={(draft.luxTtsNoGpuFallback ?? 'cloud') === 'cloud'}
                  onChange={() => setDraft((d) => ({ ...d, luxTtsNoGpuFallback: 'cloud' }))}
                />
                <span>
                  <span className="font-medium">改走云端 TTS</span>
                  <span className="block text-[10px] text-ink/45">跳过本地 LuxTTS，走 Voicebox 或云端 API（推荐，更快）</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="luxNoGpuFallback"
                  className="mt-0.5"
                  checked={draft.luxTtsNoGpuFallback === 'cpu'}
                  onChange={() => setDraft((d) => ({ ...d, luxTtsNoGpuFallback: 'cpu' }))}
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
              onChange={(v) => setDraft((d) => ({ ...d, luxTtsBaseUrl: v }))}
              placeholder="http://127.0.0.1:17880"
              plain
            />
            <Field
              label="默认参考音频（/media/audio/...）"
              value={draft.luxTtsDefaultReferenceAudio ?? ''}
              onChange={(v) => setDraft((d) => ({ ...d, luxTtsDefaultReferenceAudio: v }))}
              placeholder="/media/uploads/ref-voice.wav"
              plain
            />
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="num_steps"
                value={String(draft.luxTtsNumSteps ?? 4)}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, luxTtsNumSteps: Number(v) || 4 }))
                }
                plain
              />
              <Field
                label="speed"
                value={String(draft.luxTtsSpeed ?? 1)}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, luxTtsSpeed: Number(v) || 1 }))
                }
                plain
              />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={draft.luxTtsReturnSmooth ?? false}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, luxTtsReturnSmooth: e.target.checked }))
                }
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
              className="text-xs text-brand hover:underline"
            >
              探测 LuxTTS
            </button>
            {luxStatus && (
              <p
                className={`text-[10px] leading-relaxed ${
                  luxStatus.includes('未检测到 GPU') ? 'text-amber-700' : 'text-ink/50'
                }`}
              >
                {luxStatus}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-line p-3 space-y-2">
            <p className="text-sm font-medium">数据库（Prisma）</p>
            <p className="text-[10px] text-ink/50">
              将 JSON 工作区迁移到 SQLite。迁移后设置环境变量 NX9_STORAGE=prisma 并重启服务。
            </p>
            <button
              type="button"
              onClick={() =>
                void api.migrateToPrisma().then((r) => {
                  alert(`已迁移 ${r.migrated} 个工作区，跳过 ${r.skipped}`);
                })
              }
              className="text-xs text-brand hover:underline"
            >
              迁移 JSON → Prisma
            </button>
          </div>

          <p className="text-xs text-ink/50 mb-2">
            Stage Deck Canvas 已作为默认画布；旧版左侧模块库与节点内表单已移除。
          </p>

          <label className="flex items-center gap-2 text-sm opacity-60">
            <input type="checkbox" checked disabled readOnly />
            Stage Deck Canvas（始终启用）
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.preferences?.reduceMotion ?? false}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  preferences: {
                    snapToGrid: d.preferences?.snapToGrid ?? true,
                    gridSize: d.preferences?.gridSize ?? 20,
                    autoSaveIntervalMs: d.preferences?.autoSaveIntervalMs ?? 700,
                    showBlockIndex: d.preferences?.showBlockIndex ?? true,
                    reduceMotion: e.target.checked,
                    stageDeckCanvas: d.preferences?.stageDeckCanvas,
                  },
                }))
              }
            />
            减少动画（提升大图性能）
          </label>
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
