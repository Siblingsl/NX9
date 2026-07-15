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
import { Lock, Plus, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { BlockShell } from '../shared/BlockShell';
import ImageUploadSlot from '../shared/ImageUploadSlot';
import { AssetLinkField, assetRefFromData, patchWithAssetRef } from '../shared/AssetLinkField';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { useActivityLog } from '../../stores/activity-log';
import { toastSuccess } from '../../stores/toast';

function line(...parts: Array<string | undefined | null | false>): string {
  return parts.filter((part) => part && String(part).trim()).join('\n');
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

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[10px] font-medium text-ink/45">{children}</span>;
}

function CharacterSheetBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const [editing, setEditing] = useState(false);
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
  const syncedAt = data.backlotSyncedAt as string | undefined;
  const prompt = useMemo(() => buildLockedCharacterPrompt(data), [data]);
  const duplicate = useMemo(
    () => characters.some((c) => c.name.trim() === name.trim() && c.id !== data.characterId),
    [characters, data.characterId, name],
  );
  const health = [name.trim(), appearance.trim(), prompt.trim(), previewUrl].filter(Boolean).length;

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
    appendLog(`已载入角色设定：${character.name}`);
    setEditing(true);
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
    appendLog('已打开新增角色设定；可手动填写，或由设定检查/AI 拆分后自动补入。');
    setEditing(true);
  }, [appendLog, commit]);

  const saveToLibrary = useCallback(() => {
    const finalName = name.trim();
    if (!finalName || !appearance.trim()) {
      appendLog('角色设定：请至少填写角色名和固定外貌锚点');
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
    setEditing(false);
  }, [aliases, appendLog, appearance, backUrl, characters, data.characterId, forbidden, frontUrl, fullSheetUrl, identity, locked, name, personality, prompt, props.id, sideUrl, updateNodeData, upsertCharacter, upstream?.pictures, wardrobe]);

  return (
    <BlockShell {...props}>
      <div className="relative w-[300px] nodrag nopan text-xs text-ink">
        <div className="space-y-2">
          <div className="rounded-xl border border-line/60 bg-white p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">角色设定库</p>
                <p className="text-[9px] text-ink/40">已有 {characters.length} 个角色 · 负责一致性，不负责生图</p>
              </div>
              {locked && <Lock size={12} className="text-brand" />}
            </div>
            <div className="max-h-28 space-y-1 overflow-y-auto nx9-scroll">
              {characters.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line bg-surface/40 px-2 py-3 text-center text-[10px] text-ink/45">
                  暂无角色。运行设定检查后可 AI 自动填入，也可以手动新增。
                </div>
              ) : characters.slice(0, 8).map((character) => {
                const ext = getCharacterCreative(character);
                const url = ext.fullSheetUrl ?? ext.frontViewUrl ?? character.referenceImageUrl ?? '';
                return (
                  <button key={character.id} type="button" onClick={() => loadCharacter(character)} className="flex w-full items-center gap-2 rounded-lg border border-line/45 bg-white px-2 py-1.5 text-left hover:border-brand/35 hover:bg-brand/5">
                    {url ? <img src={url} alt="" className="h-8 w-6 rounded border border-line object-cover" /> : <span className="grid h-8 w-6 place-items-center rounded border border-dashed border-line text-ink/25"><UserRound size={12} /></span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-medium text-ink/75">{character.name}</span>
                      <span className="block truncate text-[9px] text-ink/40">{character.bible?.identity || character.descriptionZh || '未补身份'}</span>
                    </span>
                    {ext.consistency?.locked && <Lock size={11} className="text-brand" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded-lg border border-line/60 p-2">
              <p className="text-ink/35">当前编辑</p>
              <p className="mt-0.5 truncate font-medium">{name || '未选择'}</p>
            </div>
            <div className="rounded-lg border border-line/60 p-2">
              <p className="text-ink/35">健康</p>
              <p className="mt-0.5 truncate font-medium">{health}/4{duplicate ? ' · 疑似重复' : syncedAt ? ' · 已入库' : ''}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={createCharacter}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-[12px] font-medium text-white"
          >
            <Plus size={13} />
            新增角色设定
          </button>
          <p className="flex items-center justify-center gap-1 text-center text-[9px] text-ink/35"><Sparkles size={10} />可由设定检查/AI 自动填入；图片交给图像生成节点。</p>
        </div>

        {editing && (
          <div className="absolute left-[calc(100%+12px)] top-0 z-30 w-[360px] space-y-2 rounded-2xl border border-line bg-white p-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">编辑角色一致性</p>
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-2 py-1 text-[11px] text-ink/45 hover:bg-surface">关闭</button>
            </div>
            <AssetLinkField
              kind="character"
              assetRef={assetRef}
              onChange={(ref) => updateNodeData(props.id, { ...patchWithAssetRef(ref), characterId: ref?.id, characterName: ref?.label ?? name })}
            />
            <div className="grid grid-cols-2 gap-2">
              <label><Label>角色名</Label><input value={name} onChange={(e) => commit({ characterName: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5" /></label>
              <label><Label>身份</Label><input value={identity} onChange={(e) => commit({ identity: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5" /></label>
            </div>
            <label><Label>别名/剧中称呼（防重复匹配）</Label><input value={aliasesText} onChange={(e) => commit({ aliases: e.target.value })} placeholder="老林、林先生、林侦探" className="w-full rounded-lg border border-line px-2 py-1.5" /></label>
            <label><Label>固定外貌锚点（必须）</Label><textarea value={appearance} onChange={(e) => commit({ appearanceAnchor: e.target.value })} className="h-20 w-full resize-y rounded-xl border border-brand/25 bg-brand/[0.03] px-2 py-1.5" placeholder="发型、脸型、瞳色、身形、标志物、服装轮廓…" /></label>
            <div className="grid grid-cols-2 gap-2">
              <label><Label>服装/标志物</Label><textarea value={wardrobe} onChange={(e) => commit({ wardrobeAnchor: e.target.value })} className="h-16 w-full resize-y rounded-lg border border-line px-2 py-1.5" /></label>
              <label><Label>禁改项</Label><textarea value={forbidden} onChange={(e) => commit({ forbiddenTraits: e.target.value })} className="h-16 w-full resize-y rounded-lg border border-line px-2 py-1.5" /></label>
            </div>
            <label><Label>性格/表演边界</Label><input value={personality} onChange={(e) => commit({ personality: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5" /></label>
            <div className="rounded-xl border border-line/60 p-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-medium text-ink/50">参考图</span>
                <button type="button" onClick={fillFromUpstream} className="text-[10px] text-brand hover:underline">用上游图</button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                <ImageUploadSlot url={fullSheetUrl} label="主参考" compact onUploaded={(url) => commit({ fullSheetUrl: url })} onClear={() => commit({ fullSheetUrl: '' })} />
                <ImageUploadSlot url={frontUrl} label="正面" compact onUploaded={(url) => commit({ frontUrl: url })} onClear={() => commit({ frontUrl: '' })} />
                <ImageUploadSlot url={sideUrl} label="侧面" compact onUploaded={(url) => commit({ sideUrl: url })} onClear={() => commit({ sideUrl: '' })} />
                <ImageUploadSlot url={backUrl} label="背面" compact onUploaded={(url) => commit({ backUrl: url })} onClear={() => commit({ backUrl: '' })} />
              </div>
            </div>
            <details className="rounded-xl border border-line/60 bg-surface/30">
              <summary className="cursor-pointer px-2 py-1.5 text-[10px] font-medium text-ink/55">生成约束 Prompt</summary>
              <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap px-2 pb-2 text-[10px] text-ink/65">{prompt}</pre>
            </details>
            <div className="flex gap-2">
              <label className="flex flex-1 items-center gap-1.5 rounded-lg border border-line px-2 py-1.5 text-[10px] text-ink/55">
                <input type="checkbox" checked={locked} onChange={(e) => commit({ assetLocked: e.target.checked })} />
                锁定
              </label>
              <button type="button" onClick={saveToLibrary} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-brand px-2 py-1.5 text-[11px] font-medium text-white">
                <ShieldCheck size={13} />
                保存到角色库
              </button>
            </div>
          </div>
        )}
      </div>
    </BlockShell>
  );
}

export default memo(CharacterSheetBlock);
