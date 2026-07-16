import { memo, useCallback, useMemo, useState } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import {
  buildCharacterConsistencyPrompt,
  characterSheetFromNodeData,
  getCharacterCreative,
  normalizeCharacterProfile,
  refreshCharacterPrompts,
  type CharacterProfile,
} from '@nx9/shared';
import { Plus, ShieldCheck, UserRound } from 'lucide-react';
import { BlockShell } from '../shared/BlockShell';
import { ScreenModal } from '../../components/ui/ScreenModal';
import ImageUploadSlot from '../shared/ImageUploadSlot';
import { AssetLinkField, assetRefFromData, patchWithAssetRef } from '../shared/AssetLinkField';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { useActivityLog } from '../../stores/activity-log';
import { toastSuccess } from '../../stores/toast';
import './character-sheet.css';

/** 库 →（选中后）设定 → 参考 */
type StudioTab = 'library' | 'profile' | 'refs';

function line(...parts: Array<string | undefined | null | false>): string {
  return parts.filter((part) => part && String(part).trim()).join('\n');
}

function compact(text: string, max = 36) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function buildLockedCharacterPrompt(data: Record<string, unknown>): string {
  const sheet = characterSheetFromNodeData(data);
  const base = buildCharacterConsistencyPrompt(sheet);
  const forbidden = (data.forbiddenTraits as string | undefined)?.trim();
  return line(
    base,
    forbidden ? `Never change: ${forbidden}` : '',
    'Keep the same face, hairstyle, outfit, body proportion, signature accessories and color palette across every shot.',
  );
}

/** 库内角色的卡片行状态：用于名册概览，不绑定「本节点正在编谁」 */
function characterRosterStatus(character: CharacterProfile): {
  label: string;
  tone: 'ok' | 'warn' | 'todo';
  hasRef: boolean;
  hasAppearance: boolean;
} {
  const ext = getCharacterCreative(character);
  const hasRef = Boolean(
    ext.fullSheetUrl || ext.frontViewUrl || character.referenceImageUrl,
  );
  const hasAppearance = Boolean(
    character.bible?.appearance?.trim()
    || character.consistencyPrompt?.trim(),
  );
  const locked = Boolean(ext.consistency?.locked || ext.viewsLocked);
  if (locked && hasAppearance && hasRef) {
    return { label: '齐备', tone: 'ok', hasRef, hasAppearance };
  }
  if (locked) return { label: '已锁', tone: 'ok', hasRef, hasAppearance };
  if (!hasAppearance) return { label: '缺锚点', tone: 'todo', hasRef, hasAppearance };
  if (!hasRef) return { label: '缺参考', tone: 'warn', hasRef, hasAppearance };
  return { label: '可入库', tone: 'warn', hasRef, hasAppearance };
}

function CharacterSheetBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioTab, setStudioTab] = useState<StudioTab>('library');
  /**
   * 仅当在本轮打开档案台后「点选库内角色 / 新建」才允许进设定·参考。
   * 关闭弹窗后清空，避免下次直接跳进某个残留角色。
   */
  const [sessionPicked, setSessionPicked] = useState(false);
  const appendLog = useActivityLog((s) => s.append);
  const upsertCharacter = useWorkspaceDocument((s) => s.upsertCharacter);
  const characters = useWorkspaceDocument((s) => s.characters.characters);
  const upstream = props.data?.upstream as { pictures?: string[]; prompts?: string[] } | undefined;
  const data = props.data as Record<string, unknown>;
  const assetRef = assetRefFromData(data);

  const name = (data.characterName as string | undefined) ?? (data.name as string | undefined) ?? '';
  const identity = (data.identity as string | undefined) ?? '';
  const appearance = (data.appearanceAnchor as string | undefined) ?? '';
  const wardrobe = (data.wardrobeAnchor as string | undefined) ?? '';
  const personality = (data.personality as string | undefined) ?? '';
  const forbidden = (data.forbiddenTraits as string | undefined) ?? '';
  const aliasesText = Array.isArray(data.aliases)
    ? (data.aliases as string[]).join('、')
    : ((data.aliases as string | undefined) ?? '');
  const aliases = useMemo(
    () => aliasesText.split(/[,，、\n]/).map((item) => item.trim()).filter(Boolean),
    [aliasesText],
  );
  const fullSheetUrl = (data.fullSheetUrl as string | undefined) ?? '';
  const frontUrl = (data.frontUrl as string | undefined) ?? '';
  const sideUrl = (data.sideUrl as string | undefined) ?? '';
  const backUrl = (data.backUrl as string | undefined) ?? '';
  const locked = Boolean(data.assetLocked);
  const previewUrl = fullSheetUrl || frontUrl || upstream?.pictures?.[0];
  const prompt = useMemo(() => buildLockedCharacterPrompt(data), [data]);
  const duplicate = useMemo(
    () => characters.some((c) => c.name.trim() === name.trim() && c.id !== data.characterId),
    [characters, data.characterId, name],
  );
  const health = [name.trim(), appearance.trim(), prompt.trim(), previewUrl].filter(Boolean).length;
  const refCount = [fullSheetUrl, frontUrl, sideUrl, backUrl].filter(Boolean).length;

  /** 设定 / 参考：必须先从库选人（或新建） */
  const canEditTabs = sessionPicked;

  const rosterStats = useMemo(() => {
    let lockedCount = 0;
    let needAnchor = 0;
    let needRef = 0;
    let ready = 0;
    for (const c of characters) {
      const s = characterRosterStatus(c);
      if (s.label === '齐备' || s.label === '已锁') lockedCount += 1;
      if (!s.hasAppearance) needAnchor += 1;
      else if (!s.hasRef) needRef += 1;
      if (s.tone === 'ok' && s.hasAppearance && s.hasRef) ready += 1;
    }
    return {
      total: characters.length,
      lockedCount,
      needAnchor,
      needRef,
      ready,
      pending: Math.max(0, characters.length - ready),
    };
  }, [characters]);

  const rosterPreview = useMemo(
    () => characters.slice(0, 4).map((c) => {
      const st = characterRosterStatus(c);
      return {
        id: c.id,
        name: c.name,
        identity: c.bible?.identity || c.descriptionZh || '—',
        status: st.label,
        tone: st.tone,
      };
    }),
    [characters],
  );

  const cardStatusText = rosterStats.total === 0
    ? '待建库'
    : rosterStats.pending === 0
      ? '名册齐备'
      : `待补 ${rosterStats.pending}`;
  const cardStatusClass = rosterStats.total === 0
    ? ''
    : rosterStats.pending === 0
      ? 'is-ready'
      : 'is-warn';

  const commit = useCallback(
    (patch: Record<string, unknown>) => {
      const next = { ...data, ...patch };
      const nextPrompt = buildLockedCharacterPrompt(next);
      updateNodeData(props.id, {
        ...patch,
        content: nextPrompt,
        output: nextPrompt,
        consistencyPrompt: nextPrompt,
        meta: {
          kind: 'character-consistency',
          locked: Boolean(next.assetLocked),
          hasReference: Boolean(next.fullSheetUrl || next.frontUrl || upstream?.pictures?.[0]),
        },
      });
    },
    [data, props.id, updateNodeData, upstream?.pictures],
  );

  const openStudio = useCallback(() => {
    // 每次打开都从库开始；未点选前不可进设定/参考
    setSessionPicked(false);
    setStudioTab('library');
    setStudioOpen(true);
  }, []);

  const closeStudio = useCallback(() => {
    setStudioOpen(false);
    setSessionPicked(false);
    setStudioTab('library');
  }, []);

  const tryOpenTab = useCallback((tab: StudioTab) => {
    if (tab !== 'library' && !sessionPicked) {
      appendLog('角色设定：请先在「库」中选择角色或新建，再进入设定 / 参考');
      setStudioTab('library');
      return;
    }
    setStudioTab(tab);
  }, [appendLog, sessionPicked]);

  const fillFromUpstream = useCallback(() => {
    const pics = upstream?.pictures ?? [];
    if (pics.length === 0) {
      appendLog('角色设定：没有上游图片。请连接图像生成节点或上传参考图。');
      return;
    }
    commit(pics.length >= 3
      ? { frontUrl: pics[0], sideUrl: pics[1], backUrl: pics[2] }
      : { fullSheetUrl: pics[0] });
    appendLog(`角色设定已引用上游图片 · ${Math.min(pics.length, 3)} 张`);
    setStudioTab('refs');
  }, [appendLog, commit, upstream?.pictures]);

  const loadCharacter = useCallback((character: CharacterProfile) => {
    const ext = getCharacterCreative(character);
    commit({
      characterId: character.id,
      characterName: character.name,
      identity: character.bible?.identity ?? character.descriptionZh ?? '',
      appearanceAnchor: character.bible?.appearance ?? character.consistencyPrompt ?? '',
      wardrobeAnchor: '',
      personality: character.bible?.personality ?? '',
      forbiddenTraits: ext.consistency?.negativePrompt ?? '',
      aliases: ext.aliases ?? [],
      fullSheetUrl: ext.fullSheetUrl ?? character.referenceImageUrl ?? '',
      frontUrl: ext.frontViewUrl ?? '',
      sideUrl: ext.sideViewUrl ?? '',
      backUrl: ext.backViewUrl ?? '',
      assetLocked: Boolean(ext.consistency?.locked ?? ext.viewsLocked),
    });
    setSessionPicked(true);
    setStudioTab('profile');
    appendLog(`已选中角色：${character.name} · 可编辑设定与参考`);
  }, [appendLog, commit]);

  const createCharacter = useCallback(() => {
    commit({
      characterId: undefined,
      characterName: '',
      identity: '',
      appearanceAnchor: '',
      wardrobeAnchor: '',
      personality: '',
      forbiddenTraits: '',
      aliases: [],
      fullSheetUrl: '',
      frontUrl: '',
      sideUrl: '',
      backUrl: '',
      assetLocked: true,
      backlotSyncedAt: undefined,
    });
    setSessionPicked(true);
    setStudioTab('profile');
    appendLog('已新建空白角色 · 填写后保存入库');
  }, [appendLog, commit]);

  const saveToLibrary = useCallback(() => {
    if (!sessionPicked) {
      appendLog('角色设定：请先在库中选择角色');
      setStudioTab('library');
      return;
    }
    const finalName = name.trim();
    if (!finalName || !appearance.trim()) {
      appendLog('角色设定：请至少填写角色名和固定外貌锚点');
      setStudioTab('profile');
      return;
    }
    const id = (data.characterId as string | undefined) ?? `char-${props.id}`;
    const previous = characters.find((c) => c.id === id);
    const ext = getCharacterCreative(previous ?? { id, name: finalName });
    const profile: CharacterProfile = normalizeCharacterProfile(refreshCharacterPrompts({
      id,
      name: finalName,
      descriptionZh: [identity, personality].filter(Boolean).join(' · '),
      consistencyPrompt: prompt,
      referenceImageUrl: fullSheetUrl || frontUrl || upstream?.pictures?.[0] || null,
      referenceAudioUrl: previous?.referenceAudioUrl ?? null,
      tags: [...new Set([...(previous?.tags ?? []), 'character-consistency'])],
      bible: {
        identity: identity || undefined,
        appearance: line(appearance, wardrobe && `服装：${wardrobe}`) || undefined,
        personality: personality || undefined,
        background: previous?.bible?.background,
        voice: previous?.bible?.voice,
        relationships: previous?.bible?.relationships,
      },
      creative: {
        ...ext,
        fullSheetUrl: fullSheetUrl || ext.fullSheetUrl,
        frontViewUrl: frontUrl || ext.frontViewUrl,
        sideViewUrl: sideUrl || ext.sideViewUrl,
        backViewUrl: backUrl || ext.backViewUrl,
        viewsLocked: locked,
        consistency: {
          ...ext.consistency,
          locked,
          consistencyPrompt: prompt,
          negativePrompt: forbidden || ext.consistency?.negativePrompt,
        },
        aliases: [...new Set([...(ext.aliases ?? []), ...aliases])],
      },
    }));
    upsertCharacter(profile);
    updateNodeData(props.id, {
      characterId: id,
      backlotSyncedAt: new Date().toISOString(),
      status: 'success',
      content: prompt,
      output: prompt,
    });
    toastSuccess(`角色「${finalName}」已保存到角色库`);
    appendLog(`角色一致性资产已保存 · ${finalName}`);
  }, [
    aliases, appendLog, appearance, backUrl, characters, data.characterId, forbidden,
    frontUrl, fullSheetUrl, identity, locked, name, personality, prompt, props.id,
    sessionPicked, sideUrl, updateNodeData, upsertCharacter, upstream?.pictures, wardrobe,
  ]);

  return (
    <div className="relative">
      <BlockShell {...props}>
        <div className="cs cs-card nodrag nopan">
          <div className="cs-card__toolbar">
            <span className={`cs-card__status ${cardStatusClass}`}>{cardStatusText}</span>
            <span className="cs-card__counts">
              库 <b>{rosterStats.total}</b>
              {' · '}
              齐备 <b>{rosterStats.ready}</b>
            </span>
          </div>

          {/* 名册概览：展示库内角色清单，不钉死「当前编辑的那一个」 */}
          <button
            type="button"
            className="cs-mini"
            onClick={openStudio}
            title="打开角色名册 · 从库选人再编辑"
          >
            {rosterStats.total > 0 ? (
              <>
                <div className="cs-mini__head cs-mini__head--roster">
                  <span>角色</span>
                  <span>身份</span>
                  <span>状态</span>
                </div>
                {rosterPreview.map((row) => (
                  <div key={row.id} className="cs-mini__row cs-mini__row--roster">
                    <span className="is-title">{compact(row.name, 10)}</span>
                    <span>{compact(row.identity, 12)}</span>
                    <span className={`cs-mini__badge is-${row.tone}`}>{row.status}</span>
                  </div>
                ))}
                {rosterStats.total > 4 ? (
                  <div className="cs-mini__more">
                    另有 {rosterStats.total - 4} 人 · 开表查看全部
                  </div>
                ) : null}
              </>
            ) : (
              <div className="cs-mini__empty">
                角色名册为空
                <br />
                开表从库新建，或由剧本拆分补入
              </div>
            )}
          </button>

          {rosterStats.needAnchor > 0 || rosterStats.needRef > 0 ? (
            <p className="cs-card__hint is-warn">
              {rosterStats.needAnchor > 0 ? `${rosterStats.needAnchor} 人缺锚点` : ''}
              {rosterStats.needAnchor > 0 && rosterStats.needRef > 0 ? ' · ' : ''}
              {rosterStats.needRef > 0 ? `${rosterStats.needRef} 人缺参考图` : ''}
            </p>
          ) : null}

          <div className="cs-card__actions">
            <button
              type="button"
              className="cs-btn cs-btn--primary"
              onClick={(e) => {
                e.stopPropagation();
                openStudio();
              }}
            >
              开表
            </button>
          </div>
        </div>
      </BlockShell>

      <ScreenModal
        open={studioOpen}
        onClose={closeStudio}
        title="角色设定 · 档案台"
        subtitle="先从库选人 · 再改设定与参考"
        width={920}
        variant="default"
        className="cs-modal"
      >
        <div className="cs cs-studio">
          <div className="cs-studio__tabs" role="tablist">
            {(
              [
                { id: 'library' as const, label: '库' },
                { id: 'profile' as const, label: '设定' },
                { id: 'refs' as const, label: '参考' },
              ] as const
            ).map((tab) => {
              const lockedTab = tab.id !== 'library' && !canEditTabs;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  disabled={lockedTab}
                  className={`cs-studio__tab ${studioTab === tab.id ? 'is-on' : ''} ${lockedTab ? 'is-dim' : ''}`}
                  onClick={() => tryOpenTab(tab.id)}
                  title={lockedTab ? '请先在库中选择角色或新建' : undefined}
                >
                  {tab.label}
                  {tab.id === 'library' ? ` · ${characters.length}` : ''}
                  {tab.id !== 'library' && lockedTab ? ' · 锁' : ''}
                  {tab.id === 'refs' && canEditTabs && refCount > 0 ? ` · ${refCount}` : ''}
                </button>
              );
            })}
          </div>

          <div className="cs-studio__body">
            {/* 统计始终是库级，不是「当前人」独占 */}
            <div className="cs-stats">
              <div className="cs-stats__cell">
                <span className="cs-stats__val">{rosterStats.total}</span>
                <span className="cs-stats__lab">库内角色</span>
              </div>
              <div className="cs-stats__cell">
                <span className="cs-stats__val">{rosterStats.ready}</span>
                <span className="cs-stats__lab">齐备</span>
              </div>
              <div className="cs-stats__cell">
                <span className="cs-stats__val">{rosterStats.needAnchor}</span>
                <span className="cs-stats__lab">缺锚点</span>
              </div>
              <div className="cs-stats__cell">
                <span className="cs-stats__val">{rosterStats.needRef}</span>
                <span className="cs-stats__lab">缺参考</span>
              </div>
            </div>

            {!canEditTabs && studioTab === 'library' && (
              <p className="cs-warn">
                请先点选下方库内角色，或「新建空白」，再进入设定 / 参考。
              </p>
            )}

            {canEditTabs && duplicate && (
              <p className="cs-warn">角色名与库内已有角色重复，保存会覆盖同 id 或产生歧义，请核对。</p>
            )}

            {canEditTabs && (
              <div className="cs-session-bar">
                当前编辑：
                <b>{name.trim() || '（未命名新建）'}</b>
                {identity.trim() ? ` · ${identity.trim()}` : ''}
                <button
                  type="button"
                  className="cs-btn cs-btn--ghost cs-btn--sm"
                  onClick={() => {
                    setSessionPicked(false);
                    setStudioTab('library');
                  }}
                >
                  重选
                </button>
              </div>
            )}

            {studioTab === 'library' && (
              <>
                <div className="cs-panel__head" style={{ marginBottom: 10 }}>
                  <h3 className="cs-panel__title">角色名册</h3>
                  <button type="button" className="cs-btn cs-btn--soft cs-btn--sm" onClick={createCharacter}>
                    <Plus size={12} /> 新建空白
                  </button>
                </div>
                {characters.length === 0 ? (
                  <div className="cs-empty">
                    暂无角色。可新建，或由剧本拆分 / 设定检查补入后再选人。
                  </div>
                ) : (
                  <ul className="cs-lib-list">
                    {characters.map((character) => {
                      const ext = getCharacterCreative(character);
                      const url =
                        ext.fullSheetUrl ?? ext.frontViewUrl ?? character.referenceImageUrl ?? '';
                      const st = characterRosterStatus(character);
                      const active = canEditTabs && (
                        character.id === data.characterId
                        || character.name.trim() === name.trim()
                      );
                      return (
                        <li key={character.id}>
                          <button
                            type="button"
                            className={`cs-lib-item ${active ? 'is-on' : ''}`}
                            onClick={() => loadCharacter(character)}
                          >
                            {url ? (
                              <img src={url} alt="" className="cs-lib-thumb" />
                            ) : (
                              <span className="cs-lib-thumb is-empty">
                                <UserRound size={14} />
                              </span>
                            )}
                            <span className="cs-lib-body">
                              <span className="cs-lib-name">{character.name}</span>
                              <span className="cs-lib-meta">
                                {character.bible?.identity
                                  || character.descriptionZh
                                  || '未补身份'}
                                {' · '}
                                {st.label}
                              </span>
                            </span>
                            <span className={`cs-mini__badge is-${st.tone}`}>{st.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}

            {studioTab === 'profile' && canEditTabs && (
              <>
                <div className="cs-panel">
                  <div className="cs-panel__head">
                    <h3 className="cs-panel__title">资产关联</h3>
                    <span className="cs-panel__meta">可选 · 链到角色库条目</span>
                  </div>
                  <AssetLinkField
                    kind="character"
                    assetRef={assetRef}
                    onChange={(ref) =>
                      updateNodeData(props.id, {
                        ...patchWithAssetRef(ref),
                        characterId: ref?.id,
                        characterName: ref?.label ?? name,
                      })
                    }
                  />
                </div>

                <div className="cs-grid-2">
                  <label className="cs-field">
                    <span className="cs-label">角色名 <span className="is-req">必填</span></span>
                    <input
                      className="cs-input"
                      value={name}
                      onChange={(e) => commit({ characterName: e.target.value })}
                      placeholder="林夏"
                    />
                  </label>
                  <label className="cs-field">
                    <span className="cs-label">身份</span>
                    <input
                      className="cs-input"
                      value={identity}
                      onChange={(e) => commit({ identity: e.target.value })}
                      placeholder="私家侦探 / 女主…"
                    />
                  </label>
                </div>

                <label className="cs-field">
                  <span className="cs-label">别名 / 剧中称呼</span>
                  <input
                    className="cs-input"
                    value={aliasesText}
                    onChange={(e) => commit({ aliases: e.target.value })}
                    placeholder="老林、林先生…"
                  />
                </label>

                <label className="cs-field">
                  <span className="cs-label">固定外貌锚点 <span className="is-req">必填</span></span>
                  <textarea
                    className="cs-textarea"
                    value={appearance}
                    onChange={(e) => commit({ appearanceAnchor: e.target.value })}
                    placeholder="发型、脸型、瞳色、身形、标志物、服装轮廓…（跨镜保持一致）"
                  />
                </label>

                <div className="cs-grid-2">
                  <label className="cs-field">
                    <span className="cs-label">服装 / 标志物</span>
                    <textarea
                      className="cs-textarea cs-textarea--sm"
                      value={wardrobe}
                      onChange={(e) => commit({ wardrobeAnchor: e.target.value })}
                      placeholder="风衣、怀表、耳坠…"
                    />
                  </label>
                  <label className="cs-field">
                    <span className="cs-label">禁改项</span>
                    <textarea
                      className="cs-textarea cs-textarea--sm"
                      value={forbidden}
                      onChange={(e) => commit({ forbiddenTraits: e.target.value })}
                      placeholder="不可改变的脸型、伤疤、瞳色…"
                    />
                  </label>
                </div>

                <label className="cs-field">
                  <span className="cs-label">性格 / 表演边界</span>
                  <input
                    className="cs-input"
                    value={personality}
                    onChange={(e) => commit({ personality: e.target.value })}
                    placeholder="克制、冷幽默；避免夸张表情…"
                  />
                </label>
              </>
            )}

            {studioTab === 'refs' && canEditTabs && (
              <>
                <div className="cs-panel">
                  <div className="cs-panel__head">
                    <h3 className="cs-panel__title">参考视图</h3>
                    <button
                      type="button"
                      className="cs-btn cs-btn--ghost cs-btn--sm"
                      onClick={fillFromUpstream}
                    >
                      用上游图
                    </button>
                  </div>
                  <div className="cs-views">
                    <div className="cs-slot">
                      <ImageUploadSlot
                        url={fullSheetUrl}
                        label="主参考"
                        compact
                        onUploaded={(url) => commit({ fullSheetUrl: url })}
                        onClear={() => commit({ fullSheetUrl: '' })}
                      />
                    </div>
                    <div className="cs-slot">
                      <ImageUploadSlot
                        url={frontUrl}
                        label="正面"
                        compact
                        onUploaded={(url) => commit({ frontUrl: url })}
                        onClear={() => commit({ frontUrl: '' })}
                      />
                    </div>
                    <div className="cs-slot">
                      <ImageUploadSlot
                        url={sideUrl}
                        label="侧面"
                        compact
                        onUploaded={(url) => commit({ sideUrl: url })}
                        onClear={() => commit({ sideUrl: '' })}
                      />
                    </div>
                    <div className="cs-slot">
                      <ImageUploadSlot
                        url={backUrl}
                        label="背面"
                        compact
                        onUploaded={(url) => commit({ backUrl: url })}
                        onClear={() => commit({ backUrl: '' })}
                      />
                    </div>
                  </div>
                </div>

                <div className="cs-panel">
                  <div className="cs-panel__head">
                    <h3 className="cs-panel__title">一致性 Prompt</h3>
                    <span className="cs-panel__meta">自动生成 · 随设定更新</span>
                  </div>
                  <pre className="cs-prompt">{prompt || '填写角色名与外貌锚点后生成'}</pre>
                </div>
              </>
            )}
          </div>

          <div className="cs-studio__foot">
            {canEditTabs ? (
              <label className="cs-check">
                <input
                  type="checkbox"
                  checked={locked}
                  onChange={(e) => commit({ assetLocked: e.target.checked })}
                />
                锁定一致性
              </label>
            ) : (
              <span className="cs-check">先从库选人</span>
            )}
            <p className="cs-studio__foot-hint">
              {canEditTabs
                ? `${name.trim() || '未命名'} · 健康 ${health}/4 · 参考 ${refCount}/4`
                : `名册 ${rosterStats.total} 人 · 齐备 ${rosterStats.ready} · 待补 ${rosterStats.pending}`}
            </p>
            <div className="cs-studio__foot-actions">
              {canEditTabs && studioTab !== 'refs' ? (
                <button
                  type="button"
                  className="cs-btn cs-btn--ghost"
                  onClick={() => setStudioTab(studioTab === 'library' ? 'profile' : 'refs')}
                >
                  下一步
                </button>
              ) : null}
              <button
                type="button"
                className="cs-btn cs-btn--primary"
                disabled={!canEditTabs}
                onClick={saveToLibrary}
              >
                <ShieldCheck size={13} /> 保存到角色库
              </button>
            </div>
          </div>
        </div>
      </ScreenModal>
    </div>
  );
}

export default memo(CharacterSheetBlock);
