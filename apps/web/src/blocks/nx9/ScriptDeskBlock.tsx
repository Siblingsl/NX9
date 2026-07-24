import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  Check,
  FileUp,
  Loader2,
  MessageSquareText,
  Plus,
  Sparkles,
} from 'lucide-react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import {
  normalizeScriptDeskPrompts,
  DEFAULT_SCRIPT_DESK_SKILL_PROMPTS,
  type ScriptDeskSkillPromptPack,
  type ScreenplayPackage,
  type ScriptDeskAgentSession,
  type ScriptDeskSkillId,
  emptyScreenplayPackage,
  screenplayFullText,
  screenplayWordCount,
  touchScreenplayPackage,
  unconfirmIfEdited,
} from '@nx9/shared';
import { enrichPromptWithAssetMentions } from '@nx9/shared';
import { api } from '../../api/client';
import { useAllAssetLibraryItems } from '../../hooks/use-asset-library-items';
import { isDevPromptEnabled, useDevPromptOverrides } from '../../stores/dev-prompt-overrides';
import { BlockShell } from '../shared/BlockShell';
import { ScreenModal } from '../../components/ui/ScreenModal';
import { useActivityLog } from '../../stores/activity-log';
import {
  appendAgentMessage,
  applyPendingMessagePatch,
  confirmPackage,
  extractBibleFromPackage,
  ingestScreenplayText,
  packageSummaryLine,
  persistScriptDeskPackage,
  readScriptDeskPackage,
  runGenerateScreenplaySkill,
  runScriptDeskSkill,
} from '../../engine/script-desk-runner';
import './script-desk.css';
import './script-desk.v2.css';

type EntryMode = 'agent' | 'ingest';
type RightTab = 'screenplay' | 'bible' | 'diagnostics';

const SKILL_CHIPS: Array<{ id: ScriptDeskSkillId; label: string }> = [
  { id: 'topic', label: '选题' },
  { id: 'world', label: '世界观' },
  { id: 'character', label: '人物' },
  { id: 'plot', label: '剧情' },
  { id: 'pacing', label: '节奏' },
  { id: 'dialogue', label: '对白' },
  { id: 'hooks', label: '爆点' },
  { id: 'consistency', label: '一致性' },
  { id: 'generate', label: '生成剧本' },
];

function compact(text: string, max = 48) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function cardStatus(pkg: ScreenplayPackage, running: boolean): { text: string; cls: string } {
  if (running) return { text: 'Agent 中', cls: 'is-run' };
  if (pkg.status === 'confirmed') return { text: '成稿已确认', cls: 'is-ready' };
  const hasDiag = (pkg.diagnostics ?? []).some((d) => d.level === 'error' || d.level === 'warning');
  if (hasDiag && pkg.status === 'drafting') return { text: '有诊断', cls: 'is-warn' };
  if (pkg.status === 'drafting') return { text: '成稿草稿', cls: '' };
  return { text: '待输入', cls: '' };
}

function ScriptDeskBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const nodeData = props.data as Record<string, unknown> | undefined;
  const pkg = useMemo(() => readScriptDeskPackage(nodeData), [nodeData]);
  const session = (nodeData?.agentSession as ScriptDeskAgentSession | undefined) ?? {
    messages: [],
    updatedAt: new Date().toISOString(),
  };
  const entryMode = ((nodeData?.entryMode as EntryMode | undefined) ?? 'agent') as EntryMode;
  const status = (nodeData?.status as string | undefined) ?? 'idle';
  const legacyBreakdown = nodeData?.legacyScriptBreakdown;

  const [studioOpen, setStudioOpen] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>('screenplay');
  const [activeSkills, setActiveSkills] = useState<ScriptDeskSkillId[]>(['generate']);
  const [chatInput, setChatInput] = useState('');
  const [ingestText, setIngestText] = useState(() => screenplayFullText(pkg));
  const [atOpen, setAtOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tip, setTip] = useState('');
  const [rightDrawerOpen, setRightDrawerOpen] = useState(true);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { privateItems, publicItems, allItems } = useAllAssetLibraryItems();
  const libChars = useMemo(() => allItems.filter((i) => i.kind === 'character'), [allItems]);
  const libScenes = useMemo(() => allItems.filter((i) => i.kind === 'scene'), [allItems]);
  const hasLibraryItems = libChars.length > 0 || libScenes.length > 0;

  const epCount = pkg.screenplay.episodes.length;
  const charCount = pkg.bible.characters.length;
  const sceneCount = pkg.bible.scenes.length;
  const wordCount = screenplayWordCount(pkg);
  const diagCount = pkg.diagnostics?.length ?? 0;
  const st = cardStatus(pkg, busy || status === 'running');
  const title = pkg.brief.title || pkg.screenplay.episodes[0]?.title || '未命名剧本';
  const logline = pkg.brief.logline || pkg.screenplay.episodes[0]?.bodyMd || '';

  const savePkg = useCallback((next: ScreenplayPackage, extra: Record<string, unknown> = {}) => {
    persistScriptDeskPackage(updateNodeData, props.id, next, extra);
  }, [props.id, updateNodeData]);

  const setEntryMode = useCallback((mode: EntryMode) => {
    updateNodeData(props.id, { entryMode: mode });
  }, [props.id, updateNodeData]);

  const handleIngestSave = useCallback(() => {
    const text = ingestText.trim();
    if (!text) {
      setTip('请粘贴或上传剧本文本');
      return;
    }
    let next = ingestScreenplayText(pkg, text, 'pasted');
    if (pkg.status === 'confirmed') next = unconfirmIfEdited(next);
    savePkg(next, { entryMode: 'ingest' });
    setTip(pkg.status === 'confirmed' ? '成稿已失效，需重新确认' : '成稿已写入 package');
    appendLog(`编剧台：已保存成稿 · ${next.screenplay.episodes.length} 集`);
    setRightTab('screenplay');
  }, [appendLog, ingestText, pkg, savePkg]);

  const handleFile = useCallback(async (file: File) => {
    const text = await file.text();
    setIngestText(text);
    let next = ingestScreenplayText(pkg, text, 'uploaded');
    if (pkg.status === 'confirmed') next = unconfirmIfEdited(next);
    savePkg(next, { entryMode: 'ingest' });
    setTip(`已导入 ${file.name}`);
    appendLog(`编剧台：上传成稿 ${file.name}`);
  }, [appendLog, pkg, savePkg]);

  const handleExtractBible = useCallback(async () => {
    if (!screenplayFullText(pkg).trim()) {
      setTip('请先写入成稿');
      return;
    }
    setBusy(true);
    setTip('抽取 Bible 中…');
    try {
      updateNodeData(props.id, { status: 'running' });
      const next = await extractBibleFromPackage(pkg);
      savePkg(next);
      setRightTab('bible');
      setTip(`Bible 已更新 · 角 ${next.bible.characters.length} / 场 ${next.bible.scenes.length}`);
      appendLog(`编剧台：抽取 Bible · 角 ${next.bible.characters.length} / 场 ${next.bible.scenes.length}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      updateNodeData(props.id, { status: 'error', error: msg });
      setTip(`抽取失败：${msg}`);
      appendLog(`编剧台抽取失败：${msg}`);
    } finally {
      setBusy(false);
    }
  }, [appendLog, pkg, props.id, savePkg, updateNodeData]);

  const handleConfirm = useCallback(() => {
    const next = confirmPackage(pkg);
    if (next.status !== 'confirmed') {
      setTip(next.diagnostics?.find((d) => d.code === 'empty-screenplay')?.message || '无法确认');
      savePkg(next);
      return;
    }
    savePkg(next);
    setTip('成稿已确认，可送设定检查 / 分镜台');
    appendLog(`编剧台：确认成稿 · ${packageSummaryLine(next)}`);
  }, [appendLog, pkg, savePkg]);

  const toggleSkill = useCallback((id: ScriptDeskSkillId) => {
    setActiveSkills([id]);
  }, []);

  const handleAgentSend = useCallback(async () => {
    const instruction = chatInput.trim();
    const skillId = activeSkills[0] ?? 'generate';
    if (!instruction && skillId !== 'consistency' && skillId !== 'generate') {
      setTip('请输入说明或选择生成/一致性技能');
      return;
    }
    const enrichedInstruction = enrichPromptWithAssetMentions(instruction || `执行技能：${skillId}`, privateItems, publicItems);
    setBusy(true);
    updateNodeData(props.id, { status: 'running', entryMode: 'agent' });
    let nextSession = appendAgentMessage(session, {
      role: 'user',
      content: enrichedInstruction,
      skillId,
    });
    updateNodeData(props.id, { agentSession: nextSession });
    try {
      const result = await runScriptDeskSkill(skillId, pkg, enrichedInstruction);
      nextSession = appendAgentMessage(nextSession, {
        role: 'assistant',
        content: result.assistantText,
        skillId,
        pendingPatch: result.patch,
        applied: false,
      });
      updateNodeData(props.id, {
        agentSession: nextSession,
        status: 'success',
      });
      setChatInput('');
      setTip(result.patch ? '有待应用产出，请点「应用此步产出」' : result.assistantText);
      appendLog(`编剧台 Agent · ${skillId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      nextSession = appendAgentMessage(nextSession, {
        role: 'assistant',
        content: `失败：${msg}`,
        skillId,
      });
      updateNodeData(props.id, { agentSession: nextSession, status: 'error', error: msg });
      setTip(msg);
      appendLog(`编剧台 Agent 失败：${msg}`);
    } finally {
      setBusy(false);
    }
  }, [activeSkills, appendLog, chatInput, pkg, props.id, session, updateNodeData]);

  const handleApplyMessage = useCallback((messageId: string) => {
    const result = applyPendingMessagePatch(pkg, session, messageId);
    savePkg(result.package, { agentSession: result.session });
    setTip(result.package.status === 'drafting' && pkg.status === 'confirmed'
      ? '成稿已失效，需重新确认'
      : '已应用此步产出');
    appendLog('编剧台：已应用 Agent 产出');
  }, [appendLog, pkg, savePkg, session]);

  const handleExportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'screenplay-package'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [pkg, title]);

  const handleExportMd = useCallback(() => {
    const md = [
      `# ${title}`,
      pkg.brief.logline ? `> ${pkg.brief.logline}` : '',
      '',
      screenplayFullText(pkg),
      '',
      '## Bible · 人物',
      ...pkg.bible.characters.map((c) => `- **${c.name}**：${[c.identity, c.personality, c.appearance].filter(Boolean).join(' · ')}`),
      '',
      '## Bible · 场景',
      ...pkg.bible.scenes.map((s) => `- **${s.name}**：${[s.location, s.summary].filter(Boolean).join(' · ')}`),
    ].filter(Boolean).join('\n');
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'screenplay'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [pkg, title]);

  const handleRegenEpisode = useCallback(async (episodeIndex: number) => {
    setBusy(true);
    updateNodeData(props.id, { status: 'running' });
    try {
      const result = await runGenerateScreenplaySkill(pkg, '', episodeIndex);
      let next = touchScreenplayPackage(pkg, result.patch ?? {});
      if (pkg.status === 'confirmed') next = unconfirmIfEdited(next);
      savePkg(next);
      setTip(`第 ${episodeIndex} 集已续写`);
      appendLog(`编剧台：续写第 ${episodeIndex} 集`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTip(`续写失败：${msg}`);
      appendLog(`编剧台续写失败：${msg}`);
    } finally {
      setBusy(false);
      updateNodeData(props.id, { status: 'success' });
    }
  }, [appendLog, pkg, props.id, savePkg, updateNodeData]);

  const handleExportPackage = useCallback(async () => {
    try {
      const blob = await api.scriptExport(pkg);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title || 'screenplay-package'}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setTip('剧本包已导出');
    } catch {
      setTip('导出失败，已降级为本地 JSON 导出');
      handleExportJson();
    }
  }, [api, handleExportJson, pkg, title]);

  const patchBriefTitle = useCallback((value: string) => {
    let next = touchScreenplayPackage(pkg, { brief: { ...pkg.brief, title: value } });
    if (pkg.status === 'confirmed') next = unconfirmIfEdited(next);
    savePkg(next);
  }, [pkg, savePkg]);

  const patchEpisodeBody = useCallback((episodeId: string, bodyMd: string) => {
    const episodes = pkg.screenplay.episodes.map((ep) => (
      ep.id === episodeId
        ? { ...ep, bodyMd, updatedAt: new Date().toISOString() }
        : ep
    ));
    let next = touchScreenplayPackage(pkg, {
      screenplay: { ...pkg.screenplay, episodes },
    });
    if (pkg.status === 'confirmed') next = unconfirmIfEdited(next);
    savePkg(next);
  }, [pkg, savePkg]);

  const clearSession = useCallback(() => {
    updateNodeData(props.id, {
      agentSession: { messages: [], updatedAt: new Date().toISOString() },
    });
  }, [props.id, updateNodeData]);

  const footerHint = pkg.status === 'confirmed'
    ? '可送设定检查 / 可送分镜台'
    : pkg.status === 'drafting'
      ? '待确认成稿'
      : '待输入成稿';

  const skillName = activeSkills[0] ? SKILL_CHIPS.find((s) => s.id === activeSkills[0])?.label : '';

  return (
    <BlockShell {...props}>
      <div className="sd2-card">
        <button type="button" className="sd2-card__clickable" onClick={() => setStudioOpen(true)}>
          <div className="sd2-card__header">
            <span className="sd2-card__eyebrow">编剧台 · 成稿</span>
            <span className={`sd2-card__badge ${pkg.status === 'confirmed' ? 'is-ok' : ''}`}>
              {pkg.status === 'confirmed' ? '已确认' : '草稿'}
            </span>
          </div>
          <div className="sd2-card__title">{title}</div>
          <div className="sd2-card__meta">{epCount} 集 · Bible 角 {charCount} · 场 {sceneCount}</div>
          <div className="sd2-card__logline">{logline ? compact(logline, 72) : '点击打开编剧台 · Agent 共创或上传成稿'}</div>
          <div className="sd2-card__actions">
            <button type="button" className="sd2-btn sd2-btn--ghost" onClick={(e) => { e.stopPropagation(); setStudioOpen(true); }}>打开编剧台</button>
          </div>
        </button>
      </div>

      <ScreenModal
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        title="编剧台"
        subtitle="共创成稿 → 抽取 Bible → 确认交付"
        width="min(1180px, 100vw - 32px)"
        variant="default"
        className="sd2-modal"
        headerRight={(
          <div className="sd2-header-right">
            <input
              className="sd2-header-title"
              value={pkg.brief.title ?? ''}
              onChange={(e) => patchBriefTitle(e.target.value)}
              placeholder="剧名"
            />
            <span className={`sd2-header-status ${st.cls}`}>{st.text}</span>
            <button type="button" className={`sd2-header-btn ${rightDrawerOpen ? 'is-on' : ''}`} onClick={() => setRightDrawerOpen((v) => !v)}>
              稿纸
            </button>
            <div className="sd2-more-wrap">
              <button type="button" className="sd2-header-btn" onClick={() => setShowMoreMenu((v) => !v)} aria-label="更多">⋯</button>
              {showMoreMenu && (
                <div className="sd2-more-menu">
                  <button type="button" onClick={() => { handleExportMd(); setShowMoreMenu(false); }}>导出 MD</button>
                  <button type="button" onClick={() => { handleExportJson(); setShowMoreMenu(false); }}>导出 JSON</button>
                  <button type="button" onClick={() => { void handleExportPackage(); setShowMoreMenu(false); }}>导出 ZIP</button>
                  <button type="button" onClick={() => { clearSession(); setShowMoreMenu(false); }}>清空会话</button>
                  {!!legacyBreakdown && (
                    <div className="sd2-more-menu__warn">检测到旧版分镜表</div>
                  )}
                  {isDevPromptEnabled() && (
                    <div className="sd2-more-menu__dev">
                      <ScriptDeskDevPackOverlay pkg={pkg} session={session} savePkg={savePkg} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      >
        <div className="sd2-layout" onClick={() => { if (showMoreMenu) setShowMoreMenu(false); }}>
          <div className="sd2-flow">
            <span className="sd2-flow__step is-on">1 共创</span>
            <span className="sd2-flow__arrow" aria-hidden>→</span>
            <span className="sd2-flow__step">2 成稿</span>
            <span className="sd2-flow__arrow" aria-hidden>→</span>
            <span className="sd2-flow__step">3 确认</span>
          </div>

          <div className="sd2-skill-rail" role="tablist" aria-label="创作技能">
            {SKILL_CHIPS.filter((skill) => skill.id !== 'generate').map((skill) => (
              <button
                key={skill.id}
                type="button"
                role="tab"
                aria-selected={activeSkills.includes(skill.id)}
                className={`sd2-skill-chip ${activeSkills.includes(skill.id) ? 'is-on' : ''}`}
                onClick={() => { setEntryMode('agent'); toggleSkill(skill.id); }}
              >
                {skill.label}
              </button>
            ))}
            <span className="sd2-skill-rail__sep" />
            <button
              type="button"
              className={`sd2-skill-chip sd2-skill-chip--mode ${entryMode === 'agent' && activeSkills.includes('generate') ? 'is-on' : ''}`}
              onClick={() => { setEntryMode('agent'); toggleSkill('generate'); }}
            >
              生成剧本
            </button>
            <button
              type="button"
              className={`sd2-skill-chip sd2-skill-chip--mode ${entryMode === 'ingest' ? 'is-on' : ''}`}
              onClick={() => setEntryMode('ingest')}
            >
              上传成稿
            </button>
          </div>

          {entryMode === 'agent' && skillName && (
            <div className="sd2-skill-hint">本轮技能 · {skillName}</div>
          )}

          <div className="sd2-body">
            <div className="sd2-stage">
              {entryMode === 'ingest' ? (
                <div className="sd2-ingest">
                  <div className="sd2-ingest__intro">
                    <h3>导入已有成稿</h3>
                    <p>支持拖放或粘贴；写入后可抽取 Bible，再确认交付。</p>
                  </div>
                  <div className="sd2-ingest__drop">
                    <FileUp size={22} strokeWidth={1.5} />
                    <span>拖放 .txt / .md 到此处</span>
                    <button type="button" className="sd2-btn" onClick={() => fileRef.current?.click()}>选择文件</button>
                    <input ref={fileRef} type="file" accept=".txt,.md,text/plain,text/markdown" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }} />
                  </div>
                  <textarea
                    className="sd2-ingest__textarea"
                    value={ingestText}
                    onChange={(e) => setIngestText(e.target.value)}
                    placeholder="或直接粘贴小说 / 分集剧本… 支持「第N集」标题自动分集"
                  />
                  <div className="sd2-ingest__actions">
                    <button type="button" className="sd2-btn sd2-btn--primary" onClick={handleIngestSave}>写入成稿</button>
                    <button type="button" className="sd2-btn sd2-btn--ghost" onClick={() => setEntryMode('agent')}>改用 Agent 共创</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="sd2-messages">
                    {session.messages.length === 0 && (
                      <div className="sd2-empty-hero">
                        <p className="sd2-empty-hero__eyebrow">Agent 共创</p>
                        <h3 className="sd2-empty-hero__title">从选题到成稿，一步一步写清楚</h3>
                        <p className="sd2-empty-hero__desc">先点上方技能，再用自然语言说明本轮目标。产出需点「应用」才会写入稿纸。</p>
                        <div className="sd2-empty-hero__hints">
                          {(['topic', 'character', 'plot'] as ScriptDeskSkillId[]).map((id) => {
                            const label = SKILL_CHIPS.find((s) => s.id === id)?.label ?? id;
                            return (
                              <button
                                key={id}
                                type="button"
                                className="sd2-empty-hero__chip"
                                onClick={() => { setEntryMode('agent'); toggleSkill(id); }}
                              >
                                从「{label}」开始
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {session.messages.map((m) => (
                      <div key={m.id} className={`sd2-msg sd2-msg--${m.role}`}>
                        <div className="sd2-msg__meta">
                          {m.role === 'user' ? '你' : m.role === 'assistant' ? '编剧 Agent' : '系统'}
                          {m.skillId ? ` · ${m.skillId}` : ''}
                        </div>
                        <div className="sd2-msg__body">{m.content}</div>
                        {m.pendingPatch && !m.applied && (
                          <button type="button" className="sd2-btn sd2-btn--primary sd2-msg__apply" onClick={() => handleApplyMessage(m.id)}>应用此步产出</button>
                        )}
                        {m.applied && <div className="sd2-msg__applied">已应用</div>}
                      </div>
                    ))}
                  </div>
                  <div className="sd2-input-bar">
                    <div className="sd2-input-wrap">
                      <textarea
                        className="sd2-input"
                        value={chatInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          setChatInput(val);
                          const lastChar = val.slice(-1);
                          const prevChar = val.length > 1 ? val.slice(-2, -1) : '';
                          if (lastChar === '@' && prevChar !== '@') { setAtOpen(true); }
                          else if (atOpen && (lastChar === ' ' || lastChar === '\n')) { setAtOpen(false); }
                        }}
                        placeholder={skillName ? `围绕「${skillName}」描述本轮目标…  Ctrl/⌘+Enter 发送` : '描述本轮目标… 可跳步，不必走完所有技能'}
                        rows={2}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') { setAtOpen(false); return; }
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void handleAgentSend(); }
                        }}
                      />
                      {atOpen && (pkg.bible.characters.length > 0 || pkg.bible.scenes.length > 0 || hasLibraryItems) && (
                        <div className="sd2-at-dropdown">
                          {(pkg.bible.characters.length > 0 || pkg.bible.scenes.length > 0) && (
                            <div className="sd2-at-dropdown__group">Bible draft</div>
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
                    <button type="button" className="sd2-btn sd2-btn--primary" disabled={busy} onClick={() => void handleAgentSend()}>
                      {busy ? <Loader2 size={14} className="sd-spin" /> : <MessageSquareText size={14} />} 发送
                    </button>
                  </div>
                  {(pkg.bible.characters.length > 0 || hasLibraryItems) && (
                    <div className="sd2-ref-hint">
                      @ 可引用 {[...pkg.bible.characters.map((c) => c.name), ...libChars.map((i) => i.label)].slice(0, 6).join('、')}
                      {(pkg.bible.scenes.length > 0 || libScenes.length > 0) && ` · ${[...pkg.bible.scenes.map((s) => s.name), ...libScenes.map((i) => i.label)].slice(0, 4).join('、')}`}
                    </div>
                  )}
                </>
              )}
            </div>

            {rightDrawerOpen && (
              <aside className="sd2-drawer" aria-label="成稿稿纸">
                <div className="sd2-drawer__tabs">
                  <button type="button" className={rightTab === 'screenplay' ? 'is-on' : ''} onClick={() => setRightTab('screenplay')}>成稿</button>
                  <button type="button" className={rightTab === 'bible' ? 'is-on' : ''} onClick={() => setRightTab('bible')}>Bible</button>
                  <button type="button" className={rightTab === 'diagnostics' ? 'is-on' : ''} onClick={() => setRightTab('diagnostics')}>诊断</button>
                </div>
                <div className="sd2-drawer__body">
                  {rightTab === 'screenplay' && (
                    <>
                      <div className="sd2-field">
                        <span className="sd2-field__label">剧名</span>
                        <input value={pkg.brief.title ?? ''} onChange={(e) => patchBriefTitle(e.target.value)} placeholder="剧名" />
                      </div>
                      <div className="sd2-field">
                        <span className="sd2-field__label">logline</span>
                        <input value={pkg.brief.logline ?? ''} onChange={(e) => { let next = touchScreenplayPackage(pkg, { brief: { ...pkg.brief, logline: e.target.value } }); if (pkg.status === 'confirmed') next = unconfirmIfEdited(next); savePkg(next); }} placeholder="一句话故事" />
                      </div>
                      {(pkg.brief.hooks ?? []).length > 0 && (
                        <div className="sd2-hook-timeline" title="爆点轨">
                          <div className="sd2-hook-timeline__bar">
                            {(pkg.brief.hooks ?? []).map((hook, i) => (
                              <span key={i} className="sd2-hook-timeline__dot" title={hook} />
                            ))}
                          </div>
                        </div>
                      )}
                      {pkg.screenplay.episodes.length === 0 && <div className="sd2-empty">尚无分集成稿</div>}
                      {pkg.screenplay.episodes.map((ep) => (
                        <details key={ep.id} className="sd2-ep" open={ep.index === 1}>
                          <summary>{ep.title || `第${ep.index}集`}</summary>
                          <div className="sd2-ep__body">
                            <button type="button" className="sd2-btn sd2-btn--ghost" style={{ alignSelf: 'flex-end' }} disabled={busy} onClick={() => void handleRegenEpisode(ep.index)}>
                              <Plus size={11} /> 续写
                            </button>
                            <textarea value={ep.bodyMd} onChange={(e) => patchEpisodeBody(ep.id, e.target.value)} rows={8} />
                          </div>
                        </details>
                      ))}
                    </>
                  )}
                  {rightTab === 'bible' && (
                    <>
                      <div className="sd2-section-label">人物 draft（叙事层 · 不入库）</div>
                      {pkg.bible.characters.length === 0 && <div className="sd2-empty">暂无人物</div>}
                      {pkg.bible.characters.map((c) => (
                        <div key={c.id} className="sd2-bible-card">
                          <div className="sd2-bible-card__name">{c.name}</div>
                          <div className="sd2-bible-card__meta">{c.identity || c.personality || c.appearance ? [c.identity, c.personality, c.appearance].filter(Boolean).join(' · ') : '—'}</div>
                          <div className="sd2-bible-card__tag">{c.libraryStatus ?? 'draft'}</div>
                        </div>
                      ))}
                      <div className="sd2-section-label">场景 draft</div>
                      {pkg.bible.scenes.length === 0 && <div className="sd2-empty">暂无场景</div>}
                      {pkg.bible.scenes.map((s) => (
                        <div key={s.id} className="sd2-bible-card">
                          <div className="sd2-bible-card__name">{s.name}</div>
                          <div className="sd2-bible-card__meta">{s.location || s.summary ? [s.location, s.summary].filter(Boolean).join(' · ') : '—'}</div>
                          <div className="sd2-bible-card__tag">{s.libraryStatus ?? 'draft'}</div>
                        </div>
                      ))}
                      {pkg.bible.world && (
                        <>
                          <div className="sd2-section-label">世界观</div>
                          <div className="sd2-bible-card">
                            <div className="sd2-bible-card__meta">{[pkg.bible.world.era, pkg.bible.world.location, pkg.bible.world.worldview].filter(Boolean).join(' · ') || '—'}</div>
                          </div>
                        </>
                      )}
                    </>
                  )}
                  {rightTab === 'diagnostics' && (
                    <>
                      {(pkg.diagnostics ?? []).length === 0 && <div className="sd2-empty">暂无诊断</div>}
                      {(pkg.diagnostics ?? []).map((d, i) => (
                        <div key={`${d.code}-${i}`} className={`sd2-diag sd2-diag--${d.level}`}><b>{d.level}</b> {d.message}</div>
                      ))}
                    </>
                  )}
                </div>
              </aside>
            )}
          </div>

          <div className="sd2-bottom">
            <button type="button" className="sd2-btn sd2-btn--ghost" disabled={busy} onClick={() => void handleExtractBible()}>
              <Sparkles size={13} /> 抽取 Bible
            </button>
            <span className="sd2-bottom__diag">诊断 {diagCount}</span>
            <button type="button" className="sd2-btn sd2-btn--primary" disabled={busy || !screenplayFullText(pkg).trim()} onClick={handleConfirm}>
              <Check size={14} /> 确认成稿
            </button>
          </div>

          {tip ? <div className="sd2-tip">{tip}</div> : null}
        </div>
      </ScreenModal>
    </BlockShell>
  );
}

function ScriptDeskDevPackOverlay({ pkg: _pkg, session: _session, savePkg }: {
  pkg: ScreenplayPackage;
  session: ScriptDeskAgentSession;
  savePkg: (pkg: ScreenplayPackage, extra?: Record<string, unknown>) => void;
}) {
  const { values: _globalValues } = useDevPromptOverrides();
  const [pack, setPack] = useState<ScriptDeskSkillPromptPack>(() => normalizeScriptDeskPrompts({ version: 1, skills: {} }));
  const [tip, setTip] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  void _pkg; void _session; void savePkg;

  const full = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [id, val] of Object.entries(DEFAULT_SCRIPT_DESK_SKILL_PROMPTS)) {
      const override = pack.skills[id as ScriptDeskSkillId];
      out[id] = override ?? val ?? '';
    }
    return out;
  }, [pack.skills]);

  const updateSkill = useCallback((id: ScriptDeskSkillId, value: string) => {
    setPack((prev) => {
      const skills = { ...prev.skills, [id]: value.trim() || undefined };
      return { version: 1, skills };
    });
  }, []);

  const reset = useCallback(() => {
    setPack({ version: 1, skills: {} });
    setTip('已恢复默认');
  }, []);

  const save = useCallback(() => {
    setPack((current) => current);
    setTip('已保存到节点（保存后关闭重开生效）');
  }, []);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify({ kind: 'nx9-script-desk-prompt-pack', version: 1, skills: pack.skills }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'script-desk-prompt-pack.json'; a.click();
    URL.revokeObjectURL(url);
  }, [pack.skills]);

  const importJson = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed.kind !== 'nx9-script-desk-prompt-pack' || parsed.version !== 1) {
        setTip('非法 Pack 格式，拒绝导入');
        return;
      }
      const skills: Partial<Record<ScriptDeskSkillId, string>> = {};
      if (parsed.skills && typeof parsed.skills === 'object') {
        for (const [k, v] of Object.entries(parsed.skills)) {
          if (typeof v === 'string' && v.trim()) skills[k as ScriptDeskSkillId] = v.trim();
        }
      }
      setPack({ version: 1, skills });
      setTip('导入成功');
    } catch {
      setTip('导入失败：JSON 解析错误');
    }
  }, []);

  return (
    <div className="sd-legacy-note" style={{ borderColor: 'var(--desk-warn)', marginTop: 8 }}>
      <div className="sd-section-label" style={{ color: 'var(--desk-warn)', margin: '4px 0' }}>
        Dev · 技能 Prompt Pack
      </div>
      <div className="flex flex-col gap-1" style={{ maxHeight: 260, overflow: 'auto' }}>
        {Object.entries(full).map(([id, val]) => (
          <div key={id} className="flex flex-col gap-1">
            <label className="text-[9px] font-bold opacity-60">{id}</label>
            <textarea
              className="w-full border border-line rounded text-[9px] p-1 bg-surface resize-none font-mono"
              rows={2}
              value={val}
              onChange={(e) => updateSkill(id as ScriptDeskSkillId, e.target.value)}
            />
            <div className="flex justify-between text-[8px] text-ink/40">
              <span>
                {pack.skills[id as ScriptDeskSkillId]
                  ? '来源：节点 Pack'
                  : `全局${_globalValues[`scriptDesk.skill.${id}`] ? ' Override' : ' DEFAULT'}`}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        <button type="button" className="sd-btn" onClick={reset}>恢复默认</button>
        <button type="button" className="sd-btn" onClick={exportJson}>导出</button>
        <button type="button" className="sd-btn" onClick={() => fileRef.current?.click()}>导入</button>
        <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importJson(f);
          e.target.value = '';
        }} />
      </div>
      {tip ? <p className="text-[9px] mt-1" style={{ color: 'var(--desk-ok)' }}>{tip}</p> : null}
    </div>
  );
}

export default memo(ScriptDeskBlock);
