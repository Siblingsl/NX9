import React from 'react';
import {
  X,
  Key,
  Save,
  Radio,
  Image as ImageIcon,
  Cable,
  Palette,
  SlidersHorizontal,
  BarChart3,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  MoreHorizontal,
  ChevronDown,
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
  ModelConnection,
} from '@nx9/shared';
import { FLOW_EDGE_TYPES } from '../engine/flow-edge-types';
import { perfTierLabel, resolvePerfTier, translate, BUILTIN_CONNECTION_PRESETS } from '@nx9/shared';
import { useCredentialVault } from '../stores/credential-vault';
import { confirmDelete } from '../stores/confirm-dialog';
import { useStageDeckFlag } from '../stores/stage-deck-flag';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { useFlowGraphMirror } from '../stores/flow-graph-mirror';
import { useDevPromptOverrides } from '../stores/dev-prompt-overrides';
import { api } from '../api/client';
import { getRuntime } from '../platform/runtime-bridge';
import './settings-modal.css';

type SettingsSection = 'connection' | 'services' | 'canvas' | 'prefs' | 'usage';

const SECTIONS: {
  id: SettingsSection;
  label: string;
  hint: string;
  icon: typeof Cable;
}[] = [
  { id: 'connection', label: '连接', hint: '模型供应商', icon: Cable },
  { id: 'services', label: '服务', hint: '本地桥 · 诊断', icon: Radio },
  { id: 'canvas', label: '画布', hint: '主题与外观', icon: Palette },
  { id: 'prefs', label: '偏好', hint: '创作习惯', icon: SlidersHorizontal },
  { id: 'usage', label: '用量', hint: 'Token 使用统计', icon: BarChart3 },
];

export function SettingsModal() {
  const { settingsOpen, toggleSettings, settings, load, save } = useCredentialVault();
  const [draft, setDraft] = useState<AppSettings>({});
  const [section, setSection] = useState<SettingsSection>('connection');
  const [vbStatus, setVbStatus] = useState<string | null>(null);
  const [luxStatus, setLuxStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // F-009: 监听命令面板或其他入口跳转到指定 Tab
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const section = e.detail?.section;
      if (section && ['connection', 'services', 'canvas', 'prefs', 'usage'].includes(section)) {
        setSection(section as SettingsSection);
      }
      if (section === 'skills') {
        window.dispatchEvent(new CustomEvent('nx9:openSkillLibrary'));
        toggleSettings(false);
      }
    };
    window.addEventListener('nx9:openSettingsSection', handler as EventListener);
    return () => window.removeEventListener('nx9:openSettingsSection', handler as EventListener);
  }, [toggleSettings]);

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
              <ConnectionSettings draft={draft} setDraft={setDraft} />
            )}
            {section === 'services' && (
              <ServicesSettings
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
            {section === 'usage' && <UsagePanelWrapper />}
          </div>
        </div>

        <footer className="nx9-settings__footer">
          <p className="nx9-settings__footer-hint">
            {section === 'canvas'
              ? '画布外观立即生效，仅当前工作区'
              : '连接、服务与偏好需保存后生效'}
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

/* ── 连接设置：扁平单列表，点选即当前 ── */
const MODALITY_LABELS: Record<string, string> = { llm: '文字', image: '图片', video: '视频', audio: '音频' };

function makeConnId(): string {
  return `conn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function hostOf(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0] ?? url;
  }
}

function ConnectionSettings({
  draft, setDraft,
}: {
  draft: AppSettings; setDraft: (v: AppSettings) => void;
}) {
  const saveSettings = useCredentialVault((s) => s.save);
  const [connections, setConnections] = useState<ModelConnection[]>(draft.connections ?? []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingKind, setAddingKind] = useState<ModelConnection['kind'] | null>(null);
  const [addMode, setAddMode] = useState<'preset' | 'custom'>('preset');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [focusKind, setFocusKind] = useState<ModelConnection['kind']>('llm');

  useEffect(() => {
    setConnections(draft.connections ?? []);
  }, [draft.connections]);

  const syncToDraft = useCallback((conns: ModelConnection[]) => {
    setConnections(conns);
    const next = { ...draft, connections: conns };
    for (const c of conns) {
      if (!c.isActive) continue;
      if (c.kind === 'llm') { next.llmApiKey = c.apiKey; next.llmBaseUrl = c.baseUrl; next.llmModel = c.model; }
      if (c.kind === 'image') {
        next.primaryApiKey = c.apiKey; next.primaryBaseUrl = c.baseUrl;
        if (c.provider === 'gemini') { next.geminiApiKey = c.apiKey; next.geminiBaseUrl = c.baseUrl; }
      }
      if (c.kind === 'video') {
        next.videoApiKey = c.apiKey; next.videoBaseUrl = c.baseUrl;
        next.videoProvider = (['xai', 'grokgo', 'custom'].includes(c.provider) ? c.provider : 'custom') as AppSettings['videoProvider'];
        if (c.provider === 'xai') next.xaiApiKey = c.apiKey;
        if (c.provider === 'grokgo') next.grokGoApiKey = c.apiKey;
      }
      if (c.kind === 'audio') { next.ttsApiKey = c.apiKey; next.ttsBaseUrl = c.baseUrl; }
    }
    setDraft(next);
    return next;
  }, [draft, setDraft]);

  /** 自动获取模型后立刻写入连接并落盘，关闭弹窗后再开仍是下拉 */
  const persistFetchedModels = useCallback((conn: ModelConnection) => {
    if (!conn.id) return;
    const now = new Date().toISOString();
    const conns = connections.map((c) =>
      c.id === conn.id ? { ...conn, updatedAt: now } : c,
    );
    if (!conns.some((c) => c.id === conn.id)) return;
    const next = syncToDraft(conns);
    void saveSettings(next);
  }, [connections, saveSettings, syncToDraft]);

  const setActive = (connId: string) => {
    const target = connections.find((c) => c.id === connId);
    if (!target) return;
    syncToDraft(connections.map((c) => (
      c.kind === target.kind ? { ...c, isActive: c.id === connId } : c
    )));
    setMenuId(null);
  };

  const upsertConnection = (conn: ModelConnection, activate: boolean) => {
    const now = new Date().toISOString();
    const idx = connections.findIndex((c) => c.id === conn.id);
    let conns: ModelConnection[];
    if (idx >= 0) {
      conns = [...connections];
      conns[idx] = { ...conn, updatedAt: now };
      if (activate) {
        conns = conns.map((c) => (
          c.kind === conn.kind ? { ...c, isActive: c.id === conn.id } : c
        ));
      }
    } else {
      const created = { ...conn, createdAt: now, updatedAt: now, isActive: activate };
      conns = activate
        ? [...connections.map((c) => (c.kind === conn.kind ? { ...c, isActive: false } : c)), created]
        : [...connections, created];
    }
    syncToDraft(conns);
    setEditingId(null);
    setAddingKind(null);
    setMenuId(null);
  };

  const deleteConnection = async (connId: string) => {
    const target = connections.find((c) => c.id === connId);
    if (!target) return;
    const ok = await confirmDelete({
      title: `删除连接「${target.label}」？`,
      description: '删除后不可恢复，已保存的密钥与端点配置将一并移除。',
    });
    if (!ok) return;
    let conns = connections.filter((c) => c.id !== connId);
    if (target.isActive) {
      const sibling = conns.find((c) => c.kind === target.kind);
      if (sibling) {
        conns = conns.map((c) => (
          c.kind === target.kind ? { ...c, isActive: c.id === sibling.id } : c
        ));
      }
    }
    syncToDraft(conns);
    setMenuId(null);
    if (editingId === connId) setEditingId(null);
  };

  const addPreset = (preset: typeof BUILTIN_CONNECTION_PRESETS[number]) => {
    upsertConnection({
      id: makeConnId(),
      label: preset.label,
      kind: preset.kind,
      provider: preset.provider,
      baseUrl: preset.baseUrl,
      model: preset.model,
      isActive: true,
    }, true);
    setAddingKind(null);
  };

  const forKind = (kind: string) => connections.filter((c) => c.kind === kind);
  const activeForKind = (kind: string) => forKind(kind).find((c) => c.isActive);

  const items = forKind(focusKind);
  const active = activeForKind(focusKind);
  const others = items.filter((c) => !c.isActive);
  const editingActive = Boolean(active && editingId === active.id);

  const openAdd = (kind: ModelConnection['kind'] = focusKind) => {
    setFocusKind(kind);
    setAddingKind(kind);
    setAddMode('preset');
  };

  return (
    <div className="nx9-conn">
      <div className="nx9-conn__tabs" role="tablist" aria-label="连接类型">
        {(['llm', 'image', 'video', 'audio'] as const).map((kind) => {
          const a = activeForKind(kind);
          const n = forKind(kind).length;
          return (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={focusKind === kind}
              className={`nx9-conn__tab ${focusKind === kind ? 'is-on' : ''} ${a ? 'has-active' : ''}`}
              onClick={() => { setFocusKind(kind); setMenuId(null); setEditingId(null); }}
            >
              <span className="nx9-conn__tab-label">{MODALITY_LABELS[kind]}</span>
              <span className="nx9-conn__tab-sub">{a ? a.label : n ? `${n}` : '—'}</span>
            </button>
          );
        })}
      </div>

      <div className="nx9-conn__stage" role="tabpanel">
        <div className="nx9-conn__stage-bar">
          <div>
            <p className="nx9-conn__eyebrow">{MODALITY_LABELS[focusKind]}模型</p>
            <p className="nx9-conn__stage-hint">切换不会删除已保存连接</p>
          </div>
          <button type="button" className="nx9-conn__add" onClick={() => openAdd()}>
            <Plus size={13} strokeWidth={2.25} />
            添加连接
          </button>
        </div>

        {items.length === 0 ? (
          <button type="button" className="nx9-conn__hero nx9-conn__hero--empty" onClick={() => openAdd()}>
            <span className="nx9-conn__hero-kicker">尚未配置</span>
            <span className="nx9-conn__hero-title">添加官方模型或自定义端点</span>
            <span className="nx9-conn__hero-cta">从主流预设开始</span>
          </button>
        ) : editingActive && active ? (
          <div className="nx9-conn__hero is-editing">
            <ConnEditForm
              conn={active}
              onSave={(next) => upsertConnection(next, true)}
              onCancel={() => setEditingId(null)}
              onPersist={persistFetchedModels}
            />
          </div>
        ) : active ? (
          <div className="nx9-conn__hero">
            <div className="nx9-conn__hero-body">
              <div className="nx9-conn__hero-text">
                <span className="nx9-conn__hero-kicker">当前使用</span>
                <h3 className="nx9-conn__hero-title">{active.label}</h3>
                <p className="nx9-conn__hero-meta">
                  {[active.model || active.provider, hostOf(active.baseUrl) || '未设置 Base URL']
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {!active.apiKey && (
                  <p className="nx9-conn__hero-warn">尚未填写 API Key — 点编辑完成配置</p>
                )}
              </div>
              <div className="nx9-conn__hero-actions">
                <button type="button" className="nx9-conn__ghost" onClick={() => setEditingId(active.id)}>编辑</button>
                <button
                  type="button"
                  className="nx9-conn__ghost is-danger"
                  onClick={() => void deleteConnection(active.id)}
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="nx9-conn__hero nx9-conn__hero--empty" style={{ cursor: 'default' }}>
            <span className="nx9-conn__hero-kicker">未选用</span>
            <span className="nx9-conn__hero-title">从下方已保存连接中设为当前</span>
          </div>
        )}

        {others.length > 0 && (
          <div className="nx9-conn__alts">
            <p className="nx9-conn__alts-label">已保存 · 可切换</p>
            <ul className="nx9-conn__alts-list">
              {others.map((c) => (
                <li key={c.id} className={`nx9-conn__alt ${editingId === c.id ? 'is-editing' : ''}`}>
                  {editingId === c.id ? (
                    <ConnEditForm
                      conn={c}
                      onSave={(next) => upsertConnection(next, false)}
                      onCancel={() => setEditingId(null)}
                      onPersist={persistFetchedModels}
                    />
                  ) : (
                    <>
                      <div className="nx9-conn__alt-text">
                        <span className="nx9-conn__alt-name">{c.label}</span>
                        <span className="nx9-conn__alt-meta">{c.model || c.provider}</span>
                      </div>
                      <button type="button" className="nx9-conn__use" onClick={() => setActive(c.id)}>
                        设为当前
                      </button>
                      <div className="nx9-conn__menu-wrap">
                        <button
                          type="button"
                          className="nx9-conn__menu-btn"
                          aria-label="更多"
                          onClick={() => setMenuId((id) => (id === c.id ? null : c.id))}
                        >
                          <MoreHorizontal size={15} />
                        </button>
                        {menuId === c.id && (
                          <ConnRowMenu
                            isActive={false}
                            onActivate={() => setActive(c.id)}
                            onEdit={() => { setEditingId(c.id); setMenuId(null); }}
                            onDelete={() => void deleteConnection(c.id)}
                            onClose={() => setMenuId(null)}
                          />
                        )}
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {addingKind && (
        <div className="nx9-settings__overlay" onClick={() => setAddingKind(null)}>
          <div className="nx9-settings__preset-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="添加连接">
            <div className="nx9-settings__preset-head">
              <h4>添加{MODALITY_LABELS[addingKind]}连接</h4>
              <button type="button" className="nx9-settings__close" onClick={() => setAddingKind(null)} aria-label="关闭">
                <X size={14} />
              </button>
            </div>
            <div className="nx9-settings__segment nx9-settings__preset-tabs">
              <button type="button" className={`nx9-settings__segment-btn ${addMode === 'preset' ? 'is-on' : ''}`} onClick={() => setAddMode('preset')}>主流官方</button>
              <button type="button" className={`nx9-settings__segment-btn ${addMode === 'custom' ? 'is-on' : ''}`} onClick={() => setAddMode('custom')}>自定义</button>
            </div>
            {addMode === 'preset' ? (
              <div className="nx9-conn__preset-list">
                {BUILTIN_CONNECTION_PRESETS.filter((p) => p.kind === addingKind).map((p, i) => (
                  <button key={i} type="button" className="nx9-conn__preset-row" onClick={() => { addPreset(p); setFocusKind(p.kind); }}>
                    <span className="nx9-conn__preset-text">
                      <span className="nx9-conn__alt-name">{p.label}</span>
                      <span className="nx9-conn__alt-meta">{[p.model, hostOf(p.baseUrl)].filter(Boolean).join(' · ')}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="nx9-settings__preset-body">
                <ConnEditForm
                  conn={{
                    id: '',
                    label: '',
                    kind: addingKind,
                    provider: 'custom',
                    baseUrl: '',
                    model: '',
                    isActive: true,
                  }}
                  onSave={(c) => {
                    upsertConnection({ ...c, id: makeConnId(), provider: c.provider || 'custom' }, true);
                    setFocusKind(addingKind);
                    setAddingKind(null);
                  }}
                  onCancel={() => setAddingKind(null)}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ServicesSettings({
  draft, setDraft, vbStatus, setVbStatus, luxStatus, setLuxStatus,
}: {
  draft: AppSettings; setDraft: (v: AppSettings) => void;
  vbStatus: string | null; setVbStatus: (v: string | null) => void;
  luxStatus: string | null; setLuxStatus: (v: string | null) => void;
}) {
  return (
    <div className="nx9-services space-y-3">
      <header className="nx9-conn__intro" style={{ marginBottom: 4 }}>
        <h3 className="nx9-conn__intro-title">服务与诊断</h3>
        <p className="nx9-conn__intro-desc">
          本地音频桥、BGM、可选供应商与连通性探测。模型 Key 请到「连接」配置。
        </p>
      </header>

      <SettingCard title="Voicebox 本地桥" badge="配音" description="本地 Voicebox 进程；启用后 TTS 可优先走本机。">
        <label className="nx9-settings__check">
          <input
            type="checkbox"
            checked={draft.voiceboxEnabled ?? false}
            onChange={(e) => setDraft({ ...draft, voiceboxEnabled: e.target.checked })}
          />
          启用 Voicebox
        </label>
        <div className="nx9-settings__field-grid">
          <Field label="Base URL" value={draft.voiceboxBaseUrl ?? 'http://127.0.0.1:17493'} onChange={(v) => setDraft({ ...draft, voiceboxBaseUrl: v })} placeholder="http://127.0.0.1:17493" plain />
          <Field label="默认音色" value={draft.voiceboxDefaultProfile ?? ''} onChange={(v) => setDraft({ ...draft, voiceboxDefaultProfile: v })} placeholder="profile id" plain />
        </div>
        <button
          type="button"
          onClick={() => void api.probeVoicebox(draft.voiceboxBaseUrl).then((r) => setVbStatus(r.message ?? (r.available ? '已连接' : '未连接'))).catch((e) => setVbStatus(String(e)))}
          className="nx9-settings__link-btn"
        >
          探测
        </button>
        {vbStatus && <p className="nx9-settings__hint">{vbStatus}</p>}
      </SettingCard>

      <SettingCard title="LuxTTS 克隆" badge="本地" description="本机音色克隆；无 GPU 时可改走云端或继续 CPU。">
        <label className="nx9-settings__check">
          <input
            type="checkbox"
            checked={draft.luxTtsEnabled ?? false}
            onChange={(e) => setDraft({
              ...draft,
              luxTtsEnabled: e.target.checked,
              luxTtsNoGpuFallback: draft.luxTtsNoGpuFallback ?? 'cloud',
            })}
          />
          启用 LuxTTS
        </label>
        <Field label="Base URL" value={draft.luxTtsBaseUrl ?? 'http://127.0.0.1:17880'} onChange={(v) => setDraft({ ...draft, luxTtsBaseUrl: v })} placeholder="http://127.0.0.1:17880" plain />
        <Field label="参考音频" value={draft.luxTtsDefaultReferenceAudio ?? ''} onChange={(v) => setDraft({ ...draft, luxTtsDefaultReferenceAudio: v })} placeholder="/media/uploads/ref-voice.wav" plain />
        <label className="flex items-center gap-2 text-xs">
          <input type="radio" name="luxGpu" checked={(draft.luxTtsNoGpuFallback ?? 'cloud') === 'cloud'} onChange={() => setDraft({ ...draft, luxTtsNoGpuFallback: 'cloud' })} />
          无 GPU 时改走云端
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="radio" name="luxGpu" checked={draft.luxTtsNoGpuFallback === 'cpu'} onChange={() => setDraft({ ...draft, luxTtsNoGpuFallback: 'cpu' })} />
          无 GPU 时继续 CPU
        </label>
        <button
          type="button"
          onClick={() => void api.probeLuxTts(draft.luxTtsBaseUrl).then((r) => {
            const parts = [r.message ?? (r.available ? '已连接' : '未连接'), r.gpuAvailable ? 'GPU 可用' : r.available ? '无 GPU' : '', r.recommendation].filter(Boolean);
            setLuxStatus(parts.join(' · '));
          }).catch((e) => setLuxStatus(String(e)))}
          className="nx9-settings__link-btn"
        >
          探测
        </button>
        {luxStatus && <p className="nx9-settings__hint">{luxStatus}</p>}
      </SettingCard>

      <SettingCard title="BGM" badge="配乐" description="背景音乐生成供应商；缺 Key 时 BGM 模式会明确报错。">
        <div className="nx9-settings__field-grid">
          <Field label="Provider" value={draft.bgmProvider ?? 'suno'} onChange={(v) => setDraft({ ...draft, bgmProvider: v })} plain />
          <Field label="API Key" value={draft.bgmApiKey ?? ''} onChange={(v) => setDraft({ ...draft, bgmApiKey: v })} />
        </div>
      </SettingCard>

      <SettingCard title="RunningHub" badge="可选" description="预留字段；未接全时不影响主制片链路。">
        <Field label="API Key" value={draft.rhApiKey ?? ''} onChange={(v) => setDraft({ ...draft, rhApiKey: v })} />
      </SettingCard>

      <SettingCard title="环境说明" badge="只读" description="部分能力仅通过服务端环境变量配置。">
        <p className="nx9-settings__hint">
          Magic Hour：在 <code>apps/server/.env</code> 配置 <code>MAGIC_HOUR_API_KEY</code> 后重启 server。
        </p>
        <p className="nx9-settings__hint">
          代理：系统或 Node <code>HTTPS_PROXY</code> / <code>HTTP_PROXY</code>。
        </p>
      </SettingCard>

      <SettingCard title="诊断与维护" badge="探测 · 迁移" description="排查供应商连通性，或执行本地数据迁移。">
        <ProbeProvidersBlock />
        <div className="nx9-settings__inset mt-2">
          <p className="nx9-settings__inset-title">数据库迁移</p>
          <button
            type="button"
            onClick={() => void api.migrateToPrisma().then((r) => alert(`已迁移 ${r.migrated} 个，跳过 ${r.skipped}`))}
            className="nx9-settings__link-btn"
          >
            JSON → Prisma
          </button>
        </div>
      </SettingCard>
    </div>
  );
}

function ConnRowMenu({
  isActive, onActivate, onEdit, onDelete, onClose,
}: {
  isActive: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  return (
    <div className="nx9-conn__menu" ref={ref} role="menu">
      {!isActive && (
        <button type="button" role="menuitem" onClick={onActivate}>设为当前</button>
      )}
      <button type="button" role="menuitem" onClick={onEdit}>
        <Pencil size={12} /> 编辑
      </button>
      <button type="button" role="menuitem" className="is-danger" onClick={onDelete}>
        <Trash2 size={12} /> 删除
      </button>
    </div>
  );
}

function normalizeAvailableModels(models?: string[] | null): string[] {
  if (!models?.length) return [];
  return Array.from(new Set(models.map((m) => m.trim()).filter(Boolean)));
}

function ConnEditForm({ conn, onSave, onCancel, onPersist }: {
  conn: ModelConnection;
  onSave: (c: ModelConnection) => void;
  onCancel: () => void;
  /** 获取模型后立刻写入 draft/磁盘，不关闭编辑态 */
  onPersist?: (c: ModelConnection) => void;
}) {
  const initialModels = normalizeAvailableModels(conn.availableModels);
  const [f, setF] = useState(conn);
  const [modelOptions, setModelOptions] = useState<string[] | null>(
    initialModels.length > 0 ? initialModels : null,
  );
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    setF(conn);
    const cached = normalizeAvailableModels(conn.availableModels);
    setModelOptions(cached.length > 0 ? cached : null);
    setFetchError(null);
  }, [conn]);

  const updateField = <K extends keyof ModelConnection>(key: K, value: ModelConnection[K]) => {
    setF((prev) => {
      if (key === 'baseUrl' || key === 'apiKey') {
        setModelOptions(null);
        setFetchError(null);
        return { ...prev, [key]: value, availableModels: undefined };
      }
      return { ...prev, [key]: value };
    });
  };

  const fetchModels = async () => {
    setFetchingModels(true);
    setFetchError(null);
    try {
      const res = await api.listConnectionModels(
        f.baseUrl ?? '',
        f.apiKey ?? '',
        f.id || undefined,
      );
      const models = normalizeAvailableModels(res.models);
      setModelOptions(models.length > 0 ? models : null);
      const nextModel =
        models.length > 0 && (!f.model || !models.includes(f.model))
          ? models[0]
          : f.model;
      const next: ModelConnection = {
        ...f,
        model: nextModel,
        availableModels: models.length > 0 ? models : undefined,
      };
      setF(next);
      onPersist?.(next);
    } catch (e) {
      setModelOptions(null);
      setFetchError(e instanceof Error ? e.message : String(e));
    } finally {
      setFetchingModels(false);
    }
  };

  const selectModels = modelOptions
    ? Array.from(new Set([...(f.model ? [f.model] : []), ...modelOptions]))
    : null;

  return (
    <div className="nx9-conn__form">
      <div className="nx9-settings__field-grid">
        <Field label="标签" value={f.label} onChange={(v) => updateField('label', v)} plain />
        <Field label="Provider" value={f.provider} onChange={(v) => updateField('provider', v)} plain />
      </div>
      <Field label="Base URL" value={f.baseUrl ?? ''} onChange={(v) => updateField('baseUrl', v)} placeholder="https://api.openai.com/v1" plain />
      <Field label="API Key" value={f.apiKey ?? ''} onChange={(v) => updateField('apiKey', v)} />
      <div className="nx9-conn__model-field">
        <span className="nx9-settings__label">默认模型</span>
        <div className="nx9-conn__model-row">
          {selectModels ? (
            <ConnModelPicker
              value={f.model ?? ''}
              options={selectModels}
              onChange={(v) => updateField('model', v)}
            />
          ) : (
            <input
              type="text"
              className="nx9-settings__input"
              value={f.model ?? ''}
              onChange={(e) => updateField('model', e.target.value)}
              placeholder="gpt-4o-mini"
            />
          )}
          <button
            type="button"
            className="nx9-conn__fetch-models"
            disabled={fetchingModels}
            onClick={() => void fetchModels()}
          >
            {fetchingModels ? <Loader2 size={13} className="animate-spin" /> : null}
            {fetchingModels ? '获取中' : '自动获取'}
          </button>
        </div>
        {fetchError && <p className="nx9-conn__fetch-error">{fetchError}</p>}
        {selectModels && !fetchError && (
          <p className="nx9-conn__fetch-ok">已获取 {modelOptions?.length ?? 0} 个模型，可下拉选择</p>
        )}
      </div>
      <div className="nx9-conn__form-actions">
        <button type="button" className="nx9-settings__link-btn" onClick={() => onSave(f)}>保存</button>
        <button type="button" className="nx9-settings__link-btn" onClick={onCancel} style={{ color: 'var(--set-muted)' }}>取消</button>
      </div>
    </div>
  );
}

function ConnModelPicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setPos(null);
  }, []);

  const updatePos = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    const preferred = 260;
    const spaceBelow = window.innerHeight - rect.bottom - gap - 12;
    const spaceAbove = rect.top - gap - 12;
    const placeAbove = spaceBelow < 160 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(140, Math.min(preferred, placeAbove ? spaceAbove : spaceBelow));
    setPos({
      top: placeAbove ? Math.max(12, rect.top - gap - maxHeight) : rect.bottom + gap,
      left: rect.left,
      width: rect.width,
      maxHeight,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || dropRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onReposition = () => updatePos();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, close, updatePos]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, value]);

  const filtered = query.trim()
    ? options.filter((m) => m.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  return (
    <div className={`nx9-conn__model-picker ${open ? 'is-open' : ''}`} ref={wrapRef}>
      <button
        type="button"
        className="nx9-conn__model-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (open) close();
          else {
            setOpen(true);
            requestAnimationFrame(updatePos);
          }
        }}
      >
        <span className="nx9-conn__model-trigger-text">{value || '选择模型'}</span>
        <ChevronDown size={14} strokeWidth={2} />
      </button>
      {open && pos && createPortal(
        <div
          ref={dropRef}
          className="nx9-conn__model-dropdown"
          role="presentation"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
            maxHeight: pos.maxHeight,
            zIndex: 10050,
          }}
        >
          <input
            type="text"
            className="nx9-conn__model-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="筛选模型…"
            autoFocus
          />
          <ul className="nx9-conn__model-options nx9-scroll" role="listbox" ref={listRef}>
            {filtered.map((m) => (
              <li key={m}>
                <button
                  type="button"
                  role="option"
                  aria-selected={m === value}
                  className={m === value ? 'is-on' : ''}
                  onClick={() => {
                    onChange(m);
                    close();
                  }}
                >
                  {m}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="nx9-conn__model-empty">无匹配模型</li>
            )}
          </ul>
        </div>,
        document.body,
      )}
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
  const nodeCount = useFlowGraphMirror((s) => s.nodes.length);
  const edgeCount = useFlowGraphMirror((s) => s.edges.length);
  const tier = resolvePerfTier(nodeCount, edgeCount);

  return (
    <div className="space-y-4">
      <div className="nx9-settings__hero">
        <p className="nx9-settings__hero-title">创作偏好</p>
        <p className="nx9-settings__hero-desc">控制流程节奏、动效与调试信息，保存后在本机生效。</p>
      </div>

      <div className="nx9-settings__pref-row" style={{ cursor: 'default' }}>
        <div className="flex-1 min-w-0">
          <span className="nx9-settings__pref-label">当前画布性能档位</span>
          <p className="nx9-settings__pref-desc">
            {perfTierLabel(tier)} · {nodeCount} 节点 / {edgeCount} 连线
            {tier === 'intensive'
              ? '（达阈值已降级特效；制作模式另有独立降载，不单独弹性能 Toast）'
              : '（少节点时制作模式不会误报性能 Toast）'}
          </p>
        </div>
        <span
          className="text-xs tabular-nums shrink-0 px-2 py-0.5 rounded border border-line"
          style={{ color: 'var(--desk-muted, #888)' }}
        >
          {tier}
        </span>
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

      {/* ── 开发者选项 — 仅 DEV 可见 ── */}
      {import.meta.env.DEV === true && <DevSection />}
    </div>
  );
}

function DevSection() {
  const dev = useDevPromptOverrides();
  const [importError, setImportError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3 border-t border-line pt-4 mt-4">
      <div className="nx9-settings__hero">
        <p className="nx9-settings__hero-title" style={{ color: 'var(--desk-warn)' }}>开发者选项</p>
        <p className="nx9-settings__hero-desc">
          仅开发环境可见。Prompt 热调覆盖优先级高于节点级 Pack。
        </p>
      </div>
      <label className="nx9-settings__pref-row" style={{ cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={dev.enabled}
          onChange={(e) => dev.setEnabled(e.target.checked)}
        />
        <div className="flex-1 min-w-0">
          <span className="nx9-settings__pref-label">启用 Prompt 热调</span>
          <p className="nx9-settings__pref-desc">开闸后编剧台/分镜台 Dev Pack 入口可见。</p>
        </div>
      </label>
      {dev.enabled && (
        <div className="space-y-2 pl-4 border-l-2" style={{ borderColor: 'var(--desk-warn)' }}>
          <textarea
            className="w-full border border-line rounded-lg p-2 text-[11px] font-mono bg-surface resize-y"
            rows={6}
            placeholder='{"episodeBreakdownSystem":"...","clipGen.enrichSuffix":"..."}'
            value={dev.exportJson()}
            onChange={() => {/* read-only preview */}}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="nx9-btn" onClick={dev.clearAll}>清空全部覆盖</button>
            <button type="button" className="nx9-btn" onClick={() => {
              const blob = new Blob([dev.exportJson()], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = 'dev-prompt-overrides.json'; a.click();
              URL.revokeObjectURL(url);
            }}>导出 JSON</button>
            <button type="button" className="nx9-btn" onClick={() => fileRef.current?.click()}>导入 JSON</button>
            <input ref={fileRef} type="file" accept=".json" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const text = await f.text();
              if (dev.importJson(text)) {
                setImportError('');
                e.target.value = '';
              } else {
                setImportError('非法 Pack 格式，拒绝导入');
              }
            }} />
          </div>
          {importError && <p className="text-[11px]" style={{ color: 'var(--desk-warn)' }}>{importError}</p>}
        </div>
      )}
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

function UsagePanelWrapper() {
  const UsagePanel = React.lazy(() => import('./UsagePanel').then((m) => ({ default: m.UsagePanel })));
  return (
    <div className="nx9-settings__section">
      <React.Suspense fallback={<div className="text-[11px] text-ink/40 p-4">加载中…</div>}>
        <UsagePanel />
      </React.Suspense>
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
