/**
 * 编剧台左侧对话区：消息列表 / 搜索折叠 / 流式预览 / 首次生成浮层 / 输入栏。
 */
import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  ChevronDown,
  ChevronUp,
  FolderOpen,
  FileUp,
  MessageSquareText,
  Square,
} from 'lucide-react';
import {
  type ScreenplayPackage,
  type ScriptDeskAgentSession,
  type ScriptDeskSkillId,
  summarizePackagePatch,
} from '@nx9/shared';
import { SKILL_CHIPS, SCRIPT_DESK_ERROR_HINTS, type EntryMode } from './desk-helpers';

export interface ChatStageLibItem {
  id: string;
  label: string;
}

export interface ChatStageLlmOption {
  id: string;
  label: string;
  connectionModel: string;
}

export interface ChatStageProps {
  pkg: ScreenplayPackage;
  session: ScriptDeskAgentSession;
  title: string;
  hasDraftMemory: boolean;
  skillName: string;
  busy: boolean;
  /** 当前文字模型展示名 */
  llmModelLabel: string;
  /** 可点选的文字模型（凭证仓连接） */
  llmOptions: ChatStageLlmOption[];
  llmOptionId: string;
  onSelectLlmModel: (optionId: string) => void;
  onOpenLlmSettings: () => void;
  chatInput: string;
  setChatInput: Dispatch<SetStateAction<string>>;
  atOpen: boolean;
  setAtOpen: Dispatch<SetStateAction<boolean>>;
  showGenFloat: boolean;
  genFloatExpanded: boolean;
  setGenFloatExpanded: Dispatch<SetStateAction<boolean>>;
  genEpisodeCount: number | 'all';
  setGenEpisodeCount: Dispatch<SetStateAction<number | 'all'>>;
  setFirstGenFloatDeferred: Dispatch<SetStateAction<boolean>>;
  setTip: Dispatch<SetStateAction<string>>;
  libChars: ChatStageLibItem[];
  libScenes: ChatStageLibItem[];
  hasLibraryItems: boolean;
  streamPreview: string;
  chatSearch: string;
  setChatSearch: Dispatch<SetStateAction<string>>;
  collapsedMsgIds: Set<string>;
  onToggleCollapseMessage: (id: string) => void;
  onCollapseApplied: () => void;
  onChatContextMenu: (e: React.MouseEvent) => void;
  onToggleSkill: (id: ScriptDeskSkillId) => void;
  onSetEntryMode: (mode: EntryMode) => void;
  onOpenDrafts: () => void;
  onApplyMessage: (id: string) => void;
  onDiscardMessage: (id: string) => void;
  onGenStart: () => void;
  onAbort: () => void;
  onAgentSend: () => void;
}

export function ChatStage({
  pkg,
  session,
  title,
  hasDraftMemory,
  skillName,
  busy,
  llmModelLabel,
  llmOptions,
  llmOptionId,
  onSelectLlmModel,
  onOpenLlmSettings,
  chatInput,
  setChatInput,
  atOpen,
  setAtOpen,
  showGenFloat,
  genFloatExpanded,
  setGenFloatExpanded,
  genEpisodeCount,
  setGenEpisodeCount,
  setFirstGenFloatDeferred,
  setTip,
  libChars,
  libScenes,
  hasLibraryItems,
  streamPreview,
  chatSearch,
  setChatSearch,
  collapsedMsgIds,
  onToggleCollapseMessage,
  onCollapseApplied,
  onChatContextMenu,
  onToggleSkill,
  onSetEntryMode,
  onOpenDrafts,
  onApplyMessage,
  onDiscardMessage,
  onGenStart,
  onAbort,
  onAgentSend,
}: ChatStageProps): ReactNode {
  const q = chatSearch.trim().toLowerCase();
  const visibleMessages = q
    ? session.messages.filter((m) => m.content.toLowerCase().includes(q) || (m.skillId ?? '').toLowerCase().includes(q))
    : session.messages;
  const pendingMsgIds = session.messages.filter((m) => m.pendingPatch && !m.applied && !m.discarded).map((m) => m.id);
  const [modelOpen, setModelOpen] = useState(false);
  const modelWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!modelOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (modelWrapRef.current?.contains(e.target as Node)) return;
      setModelOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModelOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [modelOpen]);

  return (
    <>
      <div className={`sd2-stage-chat${showGenFloat ? ' has-gen-float' : ''}`}>
        {(session.messages.length > 0 || chatSearch) && (
          <div className="sd2-chat-tools">
            <input
              className="sd2-chat-search"
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              placeholder="搜索对话…"
              aria-label="搜索对话"
            />
            <button type="button" className="sd2-btn sd2-btn--ghost" onClick={onCollapseApplied}>
              折叠已应用
            </button>
            {pendingMsgIds.length > 0 && (
              <button
                type="button"
                className="sd2-btn sd2-btn--ghost"
                onClick={() => {
                  const lastId = pendingMsgIds[pendingMsgIds.length - 1];
                  document.getElementById(`sd2-msg-${lastId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              >
                定位待应用
              </button>
            )}
          </div>
        )}
        <div className="sd2-messages" onContextMenu={onChatContextMenu}>
          {session.messages.length === 0 && !hasDraftMemory && (
            <div className="sd2-empty-hero">
              <p className="sd2-empty-hero__eyebrow">共创三步</p>
              <h3 className="sd2-empty-hero__title">从选题到成稿，一步一步写清楚</h3>
              <p className="sd2-empty-hero__desc">
                <strong>技能</strong>＝本轮意图 · <strong>发送</strong>＝请求产出 · <strong>应用</strong>＝写入稿纸。未点应用不会改成稿。
              </p>
              <div className="sd2-empty-hero__entries">
                <button
                  type="button"
                  className="sd2-empty-hero__entry"
                  onClick={() => { onSetEntryMode('agent'); onToggleSkill('topic'); }}
                >
                  <MessageSquareText size={18} strokeWidth={1.5} />
                  <span>开始共创</span>
                  <small>先选上方技能定意图，再发送说明；产出确认后再写入</small>
                </button>
                <button
                  type="button"
                  className="sd2-empty-hero__entry"
                  onClick={() => onSetEntryMode('ingest')}
                >
                  <FileUp size={18} strokeWidth={1.5} />
                  <span>上传成稿</span>
                  <small>已有小说/剧本，导入后抽设定再确认交付</small>
                </button>
                <button
                  type="button"
                  className="sd2-empty-hero__entry"
                  onClick={onOpenDrafts}
                >
                  <FolderOpen size={18} strokeWidth={1.5} />
                  <span>打开草稿</span>
                  <small>继续之前存下的剧本草稿</small>
                </button>
              </div>
              <div className="sd2-empty-hero__hints">
                {(['topic', 'character', 'plot'] as ScriptDeskSkillId[]).map((id) => {
                  const label = SKILL_CHIPS.find((s) => s.id === id)?.label ?? id;
                  return (
                    <button
                      key={id}
                      type="button"
                      className="sd2-empty-hero__chip"
                      onClick={() => { onSetEntryMode('agent'); onToggleSkill(id); }}
                    >
                      意图：「{label}」
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {session.messages.length === 0 && hasDraftMemory && (
            <div className="sd2-chat-blank" aria-label="空白对话">
              <p className="sd2-chat-blank__hint">
                对话已清空 · 《{title}》成稿记忆仍在，可继续共创或续写
              </p>
            </div>
          )}
          {visibleMessages.map((m) => {
            const summaryLines = m.pendingPatch && !m.applied && !m.discarded
              ? summarizePackagePatch(pkg, m.pendingPatch)
              : null;
            const collapsed = collapsedMsgIds.has(m.id);
            return (
              <div key={m.id} className={`sd2-msg sd2-msg--${m.role}${collapsed ? ' is-collapsed' : ''}`}>
                <div id={`sd2-msg-${m.id}`} />
                <div className="sd2-msg__meta">
                  {m.role === 'user' ? '你' : m.role === 'assistant' ? '助手' : '系统'}
                  {m.skillId ? ` · ${m.skillId}` : ''}
                  {(m.applied || m.content.length > 280) && (
                    <button
                      type="button"
                      className="sd2-msg__collapse"
                      onClick={() => onToggleCollapseMessage(m.id)}
                    >
                      {collapsed ? '展开' : '折叠'}
                    </button>
                  )}
                </div>
                {!collapsed && <div className="sd2-msg__body">{m.content}</div>}
                {collapsed && (
                  <div className="sd2-msg__body sd2-msg__body--collapsed">
                    {m.content.slice(0, 80)}{m.content.length > 80 ? '…' : ''}
                  </div>
                )}
                {m.errorCode && SCRIPT_DESK_ERROR_HINTS[m.errorCode] && (
                  <div className="sd2-msg__hint">{SCRIPT_DESK_ERROR_HINTS[m.errorCode]}</div>
                )}
                {m.pendingPatch && !m.applied && !m.discarded && (
                  <div className="sd2-msg__patch-sum">
                    <div className="sd2-msg__patch-sum-title">待写入成稿（需点应用）：</div>
                    {summaryLines && summaryLines.map((line, i) => (
                      <div key={i} className="sd2-msg__patch-sum-line">{line}</div>
                    ))}
                    <div className="sd2-msg__apply-row">
                      <button type="button" className="sd2-btn sd2-btn--primary" onClick={() => onApplyMessage(m.id)}>应用写入</button>
                      <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => onDiscardMessage(m.id)}>丢弃</button>
                    </div>
                  </div>
                )}
                {m.applied && <div className="sd2-msg__applied">已写入稿纸</div>}
                {m.discarded && <div className="sd2-msg__applied" style={{ color: 'var(--sd2-faint)' }}>已丢弃</div>}
              </div>
            );
          })}
          {streamPreview && (
            <div className="sd2-msg sd2-msg--assistant is-streaming">
              <div className="sd2-msg__meta">助手 · 生成中</div>
              <div className="sd2-msg__body">{streamPreview}</div>
            </div>
          )}
        </div>
        {showGenFloat && (
          <div
            className={`sd2-gen-float${genFloatExpanded ? ' is-expanded' : ' is-collapsed'}`}
            role="dialog"
            aria-label="选择生成集数"
            aria-expanded={genFloatExpanded}
          >
            <div className="sd2-gen-float__sail" aria-hidden={!genFloatExpanded}>
              <div className="sd2-gen-float__sail-inner">
                <div className="sd2-gen-float__panel">
                  <div className="sd2-gen-float__body">
                    <div className="sd2-gen-float__opts">
                      {([1, 2, 3, 5, 10] as const).map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`sd2-gen-float__opt ${genEpisodeCount === n ? 'is-on' : ''}`}
                          onClick={() => setGenEpisodeCount(n)}
                          tabIndex={genFloatExpanded ? 0 : -1}
                        >
                          {n}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={`sd2-gen-float__opt ${genEpisodeCount === 'all' ? 'is-on' : ''}`}
                        onClick={() => setGenEpisodeCount('all')}
                        tabIndex={genFloatExpanded ? 0 : -1}
                      >
                        全部
                      </button>
                    </div>
                    <div className="sd2-gen-float__acts">
                      <button
                        type="button"
                        className="sd2-gen-float__later"
                        disabled={busy}
                        tabIndex={genFloatExpanded ? 0 : -1}
                        onClick={() => {
                          setFirstGenFloatDeferred(true);
                          setGenFloatExpanded(false);
                          setTip('已收起 · 点底边半圆或右侧「生成分集」可再开');
                        }}
                      >
                        稍后
                      </button>
                      <button
                        type="button"
                        className="sd2-btn sd2-btn--primary sd2-gen-float__go"
                        disabled={busy}
                        tabIndex={genFloatExpanded ? 0 : -1}
                        onClick={onGenStart}
                      >
                        {busy ? '生成中…' : '开始'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="sd2-gen-float__tab"
              onClick={() => setGenFloatExpanded(true)}
              aria-label="向上展开选集浮层"
              title="向上展开"
              tabIndex={genFloatExpanded ? -1 : 0}
              aria-hidden={genFloatExpanded}
            >
              <ChevronUp size={11} strokeWidth={2.75} aria-hidden />
            </button>
          </div>
        )}
      </div>
      <div className="sd2-input-bar">
        <div className="sd2-composer">
          <div className="sd2-composer__body">
            <textarea
              className="sd2-composer__field"
              value={chatInput}
              onChange={(e) => {
                const val = e.target.value;
                setChatInput(val);
                const lastChar = val.slice(-1);
                const prevChar = val.length > 1 ? val.slice(-2, -1) : '';
                if (lastChar === '@' && prevChar !== '@') { setAtOpen(true); }
                else if (atOpen && (lastChar === ' ' || lastChar === '\n')) { setAtOpen(false); }
              }}
              placeholder={skillName ? `本轮意图「${skillName}」· 补充说明后发送…` : '先点上方技能定意图，再说明本轮目标后发送…'}
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setAtOpen(false); setModelOpen(false); return; }
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onAgentSend(); }
              }}
              aria-label="共创指令"
            />
            {atOpen && (pkg.bible.characters.length > 0 || pkg.bible.scenes.length > 0 || hasLibraryItems) && (
              <div className="sd2-at-dropdown">
                {(pkg.bible.characters.length > 0 || pkg.bible.scenes.length > 0) && (
                  <div className="sd2-at-dropdown__group">设定草稿</div>
                )}
                {pkg.bible.characters.map((c) => (
                  <button key={c.id} type="button" className="sd2-at-dropdown__item" onClick={() => { setChatInput((prev) => prev.replace(/@\s*$/, `@${c.name} `)); setAtOpen(false); }}>人物：{c.name}</button>
                ))}
                {pkg.bible.scenes.map((s) => (
                  <button key={s.id} type="button" className="sd2-at-dropdown__item" onClick={() => { setChatInput((prev) => prev.replace(/@\s*$/, `@${s.name} `)); setAtOpen(false); }}>场景：{s.name}</button>
                ))}
                {hasLibraryItems && (
                  <>
                    <div className="sd2-at-dropdown__group">素材库</div>
                    {libChars.map((item) => (
                      <button key={item.id} type="button" className="sd2-at-dropdown__item" onClick={() => { setChatInput((prev) => prev.replace(/@\s*$/, `@角色:${item.label} `)); setAtOpen(false); }}>人物：{item.label}</button>
                    ))}
                    {libScenes.map((item) => (
                      <button key={item.id} type="button" className="sd2-at-dropdown__item" onClick={() => { setChatInput((prev) => prev.replace(/@\s*$/, `@场景:${item.label} `)); setAtOpen(false); }}>场景：{item.label}</button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
          <div className="sd2-composer__toolbar" role="toolbar" aria-label="发送工具栏">
            <div className="sd2-composer__meta">
              <div className="sd2-composer__model-wrap" ref={modelWrapRef}>
                <button
                  type="button"
                  className={`sd2-composer__model${llmModelLabel ? '' : ' sd2-composer__model--empty'}${modelOpen ? ' is-open' : ''}`}
                  title={llmModelLabel ? `文字模型 · ${llmModelLabel}` : '未配置文字模型 · 点击配置'}
                  aria-haspopup="listbox"
                  aria-expanded={modelOpen}
                  aria-label="选择文字模型"
                  onClick={() => {
                    if (!llmOptions.length) {
                      onOpenLlmSettings();
                      return;
                    }
                    setModelOpen((v) => !v);
                  }}
                >
                  <span className="sd2-composer__model-text">{llmModelLabel || '未配置模型'}</span>
                  <ChevronDown size={12} strokeWidth={2.25} aria-hidden />
                </button>
                {modelOpen && llmOptions.length > 0 && (
                  <div className="sd2-composer__model-menu" role="listbox" aria-label="文字模型列表">
                    {llmOptions.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        role="option"
                        aria-selected={opt.id === llmOptionId}
                        className={`sd2-composer__model-option${opt.id === llmOptionId ? ' is-on' : ''}`}
                        onClick={() => {
                          void onSelectLlmModel(opt.id);
                          setModelOpen(false);
                        }}
                      >
                        <span className="sd2-composer__model-option-name">{opt.connectionModel}</span>
                        <span className="sd2-composer__model-option-meta">{opt.label}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      className="sd2-composer__model-option sd2-composer__model-option--settings"
                      onClick={() => {
                        setModelOpen(false);
                        onOpenLlmSettings();
                      }}
                    >
                      管理连接…
                    </button>
                  </div>
                )}
              </div>
              {(pkg.bible.characters.length > 0 || hasLibraryItems) && (
                <span className="sd2-composer__at" title="输入 @ 引用人物 / 场景">
                  @ {[...pkg.bible.characters.map((c) => c.name), ...libChars.map((i) => i.label)].slice(0, 3).join(' · ')}
                  {[...pkg.bible.characters, ...libChars].length > 3 ? '…' : ''}
                </span>
              )}
            </div>
            <div className="sd2-composer__actions">
              <span className="sd2-composer__kbd" aria-hidden>Ctrl+Enter</span>
              <button
                type="button"
                className={`sd2-composer__send${busy ? ' is-stop' : ''}${!busy && !chatInput.trim() ? ' is-idle' : ''}`}
                onClick={busy ? onAbort : onAgentSend}
                title={busy ? '停止生成' : skillName ? `发送「${skillName}」请求` : '发送请求'}
                aria-label={busy ? '停止生成' : '发送请求'}
              >
                {busy ? (
                  <>
                    <Square size={11} fill="currentColor" strokeWidth={0} />
                    <span>停止</span>
                  </>
                ) : (
                  <>
                    <MessageSquareText size={14} strokeWidth={1.75} />
                    <span>发送</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
