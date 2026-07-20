import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import {
  applyCroppedPanelsToCharacter,
  buildCharacterConsistencyPrompt,
  buildCharacterSheetGenerationPrompt,
  characterSheetFromNodeData,
  getCharacterCreative,
  getCostumeCreative,
  normalizeCharacterProfile,
  refreshCharacterPrompts,
  resolveConnectedPictureGenId,
  type CharacterProfile,
} from '@nx9/shared';
import { Loader2, Plus, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { BlockShell } from '../shared/BlockShell';
import { ScreenModal } from '../../components/ui/ScreenModal';
import ImageUploadSlot from '../shared/ImageUploadSlot';
import { AssetLinkField, assetRefFromData, patchWithAssetRef } from '../shared/AssetLinkField';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { useActivityLog } from '../../stores/activity-log';
import { toastSuccess } from '../../stores/toast';
import { useAssetLibraryGenSettings } from '../../stores/asset-library-gen-settings';
import AssetLibraryGenSettings, { resolveAssetLibraryImageRequest } from '../../panels/asset-library/AssetLibraryGenSettings';
import { useAllAssetLibraryItems } from '../../hooks/use-asset-library-items';
import { runPictureGenJob } from '../../engine/picture-gen-runner';
import { cropCharacterSheetPanels } from '../../engine/character-sheet-crop';
import { api } from '../../api/client';
import { ImageLightbox, type ImageLightboxItem } from '../../components/ui/ImageLightbox';
import './character-sheet.css';

/** 库 →（选中后）设定 → 参考 */
type StudioTab = 'library' | 'profile' | 'refs';

function galleryFromCharacter(character: CharacterProfile): ImageLightboxItem[] {
  const ext = getCharacterCreative(character);
  const items: ImageLightboxItem[] = [];
  const push = (url?: string | null, label?: string) => {
    const u = (url ?? '').trim();
    if (!u) return;
    if (items.some((x) => x.url === u)) return;
    items.push({ url: u, label: label || character.name });
  };
  push(ext.fullSheetUrl, '完整设定板');
  push(character.referenceImageUrl, '主参考');
  push(ext.frontViewUrl, '正面');
  push(ext.threeQuarterViewUrl, '3/4');
  push(ext.sideViewUrl, '侧面');
  push(ext.backViewUrl, '背面');
  push(ext.silhouetteFrontUrl, '剪影正');
  push(ext.silhouetteSideUrl, '剪影侧');
  push(ext.emotionalCloseupUrl, '情绪特写');
  for (const v of ext.expressions ?? []) push(v.imageUrl, `表情·${v.label}`);
  for (const v of ext.microExpressions ?? []) push(v.imageUrl, `微表情·${v.label}`);
  for (const v of ext.angles ?? []) push(v.imageUrl, `头部·${v.label}`);
  for (const v of ext.poses ?? []) push(v.imageUrl, `姿态·${v.label}`);
  for (const v of ext.costumeDetails ?? []) push(v.imageUrl, `细节·${v.label}`);
  for (const v of ext.handRefs ?? []) push(v.imageUrl, `手部·${v.label}`);
  return items;
}

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
  const wardrobe = (data.wardrobeAnchor as string | undefined)?.trim();
  const costumePrompt = (data.costumePrompt as string | undefined)?.trim();
  const costumeLabel = (data.costumeLabel as string | undefined)?.trim();
  return line(
    base,
    wardrobe ? `Wardrobe landmarks: ${wardrobe}` : '',
    costumePrompt
      ? `Costume lock (${costumeLabel || 'bound'}): ${costumePrompt}`
      : costumeLabel
        ? `Costume lock: ${costumeLabel}`
        : '',
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
  const { updateNodeData, getNodes, getEdges } = useReactFlow();
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
  const backlotItems = useWorkspaceDocument((s) => s.backlotWorkspace.items);
  const { allItems: costumeItems } = useAllAssetLibraryItems('costume');
  const characterSheetGen = useAssetLibraryGenSettings((s) => s.characterSheet);
  const setCharacterSheetGen = useAssetLibraryGenSettings((s) => s.setCharacterSheet);
  const upstream = props.data?.upstream as { pictures?: string[]; prompts?: string[] } | undefined;
  const data = props.data as Record<string, unknown>;
  const assetRef = assetRefFromData(data);
  const [sheetGenerating, setSheetGenerating] = useState(false);
  const [sheetPreviewOpen, setSheetPreviewOpen] = useState(false);
  const [sheetPreviewIndex, setSheetPreviewIndex] = useState(0);
  const [overrideGallery, setOverrideGallery] = useState<ImageLightboxItem[] | null>(null);

  // 默认打开顶部能力口，便于连接图像生成做设定板
  useEffect(() => {
    if (data.showExecPorts === undefined) {
      updateNodeData(props.id, { showExecPorts: true });
    }
  }, [data.showExecPorts, props.id, updateNodeData]);

  const name = (data.characterName as string | undefined) ?? (data.name as string | undefined) ?? '';
  const identity = (data.identity as string | undefined) ?? '';
  const appearance = (data.appearanceAnchor as string | undefined) ?? '';
  const wardrobe = (data.wardrobeAnchor as string | undefined) ?? '';
  const costumeId = (data.costumeId as string | undefined) ?? '';
  const costumeLabel = (data.costumeLabel as string | undefined) ?? '';
  const costumePrompt = (data.costumePrompt as string | undefined) ?? '';
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

  const characterGallery = useMemo<ImageLightboxItem[]>(() => {
    const items: ImageLightboxItem[] = [];
    const push = (url?: string | null, label?: string) => {
      const u = (url ?? '').trim();
      if (!u) return;
      if (items.some((x) => x.url === u)) return;
      items.push({ url: u, label: label || '角色图' });
    };
    push(fullSheetUrl, '完整设定板');
    push(frontUrl, '正面');
    push(sideUrl, '侧面');
    push(backUrl, '背面');
    push(previewUrl, '预览');
    for (const u of upstream?.pictures ?? []) push(u, '上游图');
    // 若当前节点已绑定角色库条目，把库内更多参考图并入图集
    const boundId = data.characterId as string | undefined;
    const bound = boundId ? characters.find((c) => c.id === boundId) : undefined;
    if (bound) {
      const ext = getCharacterCreative(bound);
      push(ext.fullSheetUrl, '库·设定板');
      push(ext.frontViewUrl, '库·正面');
      push(ext.threeQuarterViewUrl, '库·3/4');
      push(ext.sideViewUrl, '库·侧面');
      push(ext.backViewUrl, '库·背面');
      push(ext.silhouetteFrontUrl, '库·剪影正');
      push(ext.silhouetteSideUrl, '库·剪影侧');
      push(ext.emotionalCloseupUrl, '库·情绪特写');
      for (const v of ext.expressions ?? []) push(v.imageUrl, `表情·${v.label}`);
      for (const v of ext.microExpressions ?? []) push(v.imageUrl, `微表情·${v.label}`);
      for (const v of ext.angles ?? []) push(v.imageUrl, `头部·${v.label}`);
      for (const v of ext.poses ?? []) push(v.imageUrl, `姿态·${v.label}`);
      for (const v of ext.costumeDetails ?? []) push(v.imageUrl, `细节·${v.label}`);
      for (const v of ext.handRefs ?? []) push(v.imageUrl, `手部·${v.label}`);
    }
    return items;
  }, [fullSheetUrl, frontUrl, sideUrl, backUrl, previewUrl, upstream?.pictures, data.characterId, characters]);

  const openGalleryAt = useCallback((url?: string, preferredItems?: ImageLightboxItem[]) => {
    if (preferredItems && preferredItems.length > 0) {
      const idx = url ? preferredItems.findIndex((g) => g.url === url) : 0;
      setOverrideGallery(preferredItems);
      setSheetPreviewIndex(idx >= 0 ? idx : 0);
      setSheetPreviewOpen(true);
      return;
    }
    if (!url) return;
    const idx = characterGallery.findIndex((g) => g.url === url);
    setOverrideGallery(null);
    setSheetPreviewIndex(idx >= 0 ? idx : 0);
    setSheetPreviewOpen(true);
  }, [characterGallery]);
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


  const applyCostumeFromLibrary = useCallback((itemId: string) => {
    if (!itemId) {
      commit({
        costumeId: '',
        costumeLabel: '',
        costumePrompt: '',
        wardrobeAnchor: '',
      });
      appendLog('已清除绑定服装');
      return;
    }
    const hit = costumeItems.find((i) => i.id === itemId);
    if (!hit) {
      appendLog('服装库中未找到该套装');
      return;
    }
    // 若是工作区服装，尝试取更完整 creative prompt
    const ws = backlotItems.find((i) => i.id === itemId && i.kind === 'costume');
    const promptText = (
      (ws ? (getCostumeCreative(ws).prompts?.image?.text || getCostumeCreative(ws).prompts?.costume?.text || ws.promptEn || ws.promptZh) : '')
      || hit.prompt
      || hit.label
    ).trim();
    const wardrobeText = [
      hit.label,
      ws ? getCostumeCreative(ws).accessories : '',
      ws ? getCostumeCreative(ws).colorPalette : '',
    ].filter(Boolean).join(' · ');
    commit({
      costumeId: hit.id,
      costumeLabel: hit.label,
      costumePrompt: promptText,
      wardrobeAnchor: wardrobeText || hit.label,
    });
    appendLog(`已从服装库绑定：${hit.label}`);
    toastSuccess(`已绑定服装「${hit.label}」`);
  }, [appendLog, backlotItems, commit, costumeItems]);

  const generateCharacterSheetViaPicture = useCallback(async () => {
    if (!name.trim() || !appearance.trim()) {
      appendLog('角色设定板：请先填写角色名与外貌锚点');
      setStudioTab('profile');
      return;
    }
    const pictureId = resolveConnectedPictureGenId(props.id, getNodes(), getEdges());
    if (!pictureId) {
      appendLog('角色设定板：请先用顶部能力口连接「图像生成」节点');
      return;
    }
    const pictureNode = getNodes().find((n) => n.id === pictureId);
    if (!pictureNode) return;
    setSheetGenerating(true);
    try {
      const id = (data.characterId as string | undefined) ?? `char-${props.id}`;
      const previous = characters.find((c) => c.id === id);
      const profile = normalizeCharacterProfile(refreshCharacterPrompts({
        id,
        name: name.trim(),
        descriptionZh: [identity, personality].filter(Boolean).join(' · '),
        consistencyPrompt: prompt,
        referenceImageUrl: fullSheetUrl || frontUrl || null,
        bible: {
          identity: identity || undefined,
          appearance: appearance || undefined,
          personality: personality || undefined,
        },
        creative: {
          ...(previous?.creative ?? {}),
          costumeId: costumeId || null,
          costumeLabel: costumeLabel || null,
          costumePrompt: costumePrompt || null,
          fullSheetUrl: fullSheetUrl || null,
          frontViewUrl: frontUrl || null,
          sideViewUrl: sideUrl || null,
          backViewUrl: backUrl || null,
        },
      }));

      const sheetPrompt = buildCharacterSheetGenerationPrompt(profile);
      const picData = (pictureNode.data ?? {}) as Record<string, unknown>;
      const {
        modelId,
        quality,
        aspectRatio,
        size,
        resolutionTier,
      } = resolveAssetLibraryImageRequest(characterSheetGen, {
        model: (picData.model as string) || undefined,
        quality: (picData.quality as string) || undefined,
        aspectRatio: (picData.aspectRatio as string) || '4:3',
        resolutionTier: (picData.resolutionTier as string) || undefined,
        width: (picData.width as number) || undefined,
        height: (picData.height as number) || undefined,
      });
      appendLog(`角色设定板参数 · 模型 ${modelId} · 清晰度 ${resolutionTier} · 质量 ${quality} · 比例 ${aspectRatio} · ${size}`);
      const urls = await runPictureGenJob({
        prompt: sheetPrompt,
        modelId,
        size,
        n: 1,
        resolutionTier,
        referenceImageUrl: fullSheetUrl || frontUrl || undefined,
      });
      const sheetUrl = urls[0];
      if (!sheetUrl) throw new Error('设定板生成失败');

      // 裁切回填
      const blobs = await cropCharacterSheetPanels(sheetUrl);
      const panelUrls: Record<string, string> = {};
      for (const [panelId, blob] of Object.entries(blobs)) {
        const file = new File([blob], `cs-${props.id}-${panelId}.jpg`, { type: 'image/jpeg' });
        const uploaded = await api.uploadAsset(file);
        panelUrls[panelId] = uploaded.url;
      }
      const filled = applyCroppedPanelsToCharacter(profile, {
        panelUrls,
        fullSheetUrl: sheetUrl,
        overwrite: true,
      });
      const ext = filled.creative ?? {};
      commit({
        fullSheetUrl: ext.fullSheetUrl || sheetUrl,
        frontUrl: ext.frontViewUrl || frontUrl,
        sideUrl: ext.sideViewUrl || sideUrl,
        backUrl: ext.backViewUrl || backUrl,
        status: 'success',
      });
      // 同步角色库（若已有 id）
      upsertCharacter(filled);
      appendLog(`角色设定板已生成并回填 ${Object.keys(panelUrls).length} 格 · ${name}`);
      toastSuccess(`设定板已回填 ${Object.keys(panelUrls).length} 格`);
      setStudioTab('refs');
    } catch (e) {
      appendLog(`角色设定板生成失败: ${String(e)}`);
    } finally {
      setSheetGenerating(false);
    }
  }, [
    appearance, appendLog, backUrl, characters, commit, costumeId, costumeLabel, costumePrompt,
    data.characterId, frontUrl, fullSheetUrl, getEdges, getNodes, identity, name, personality,
    prompt, props.id, sideUrl, upsertCharacter, characterSheetGen,
  ]);


    const loadCharacter = useCallback((character: CharacterProfile) => {
    const ext = getCharacterCreative(character);
    commit({
      characterId: character.id,
      characterName: character.name,
      identity: character.bible?.identity ?? character.descriptionZh ?? '',
      appearanceAnchor: character.bible?.appearance ?? character.consistencyPrompt ?? '',
      wardrobeAnchor: ext.costumeLabel || '',
      costumeId: ext.costumeId ?? '',
      costumeLabel: ext.costumeLabel ?? '',
      costumePrompt: ext.costumePrompt ?? '',
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
      costumeId: '',
      costumeLabel: '',
      costumePrompt: '',
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
        costumeId: costumeId || ext.costumeId || null,
        costumeLabel: costumeLabel || ext.costumeLabel || null,
        costumePrompt: costumePrompt || ext.costumePrompt || null,
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
    aliases, appendLog, appearance, backUrl, characters, costumeId, costumeLabel, costumePrompt, data.characterId, forbidden,
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

          {/* 画布摘要卡：状态 + 关键指标 + 角色 chips，详表仅在工作台 */}
          <button
            type="button"
            className="cs-summary-card"
            onClick={openStudio}
            title="打开角色名册 · 从库选人再编辑"
          >
            {rosterStats.total > 0 ? (
              <>
                <div className="cs-summary-card__hero">
                  <div>
                    <span className="cs-summary-card__eyebrow">角色名册</span>
                    <strong>
                      {rosterStats.pending === 0
                        ? '名册齐备，可进分镜'
                        : `${rosterStats.pending} 人待补设定`}
                    </strong>
                    <p>
                      {rosterPreview[0]
                        ? `代表：${compact(rosterPreview[0].name, 12)}${
                            rosterPreview[0].identity && rosterPreview[0].identity !== '—'
                              ? ` · ${compact(rosterPreview[0].identity, 18)}`
                              : ''
                          }`
                        : '打开后从库选人、补参考与一致性 Prompt'}
                    </p>
                  </div>
                  <span className="cs-summary-card__metric">
                    {rosterStats.total}
                    <small>人</small>
                  </span>
                </div>
                <div className="cs-summary-card__stats" aria-label="角色库摘要">
                  <span><b>{rosterStats.ready}</b> 齐备</span>
                  <span><b>{rosterStats.needRef}</b> 缺图</span>
                  <span><b>{rosterStats.needAnchor}</b> 缺锚</span>
                </div>
                <div className="cs-summary-card__chips">
                  {(rosterPreview.length
                    ? rosterPreview.map((r) => r.name)
                    : ['角色库']
                  ).map((label) => (
                    <span key={label}>{compact(label, 10)}</span>
                  ))}
                </div>
                <div className="cs-summary-card__trail">
                  {rosterStats.pending === 0
                    ? '点击进入档案台 · 锁定与参考图管理'
                    : `待补 ${rosterStats.pending} · 点击开表补齐外观/参考`}
                </div>
              </>
            ) : (
              <>
                <div className="cs-summary-card__hero is-empty">
                  <div>
                    <span className="cs-summary-card__eyebrow">准备中</span>
                    <strong>建立角色名册</strong>
                    <p>开表新建，或由剧本拆分 / 设定检查同步角色候选后再编辑。</p>
                  </div>
                  <span className="cs-summary-card__metric">
                    0
                    <small>人</small>
                  </span>
                </div>
                <div className="cs-summary-card__stats" aria-label="空库状态">
                  <span><b>0</b> 齐备</span>
                  <span><b>—</b> 参考</span>
                  <span><b>—</b> 锁定</span>
                </div>
                <div className="cs-summary-card__chips">
                  <span>外观锚点</span>
                  <span>设定板</span>
                  <span>一致性</span>
                </div>
                <div className="cs-summary-card__trail">
                  点击进入角色档案台
                </div>
              </>
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
                              <span
                                className="cs-lib-thumb-btn"
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openGalleryAt(url, galleryFromCharacter(character));
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    openGalleryAt(url, galleryFromCharacter(character));
                                  }
                                }}
                                title="放大查看"
                              >
                                <img src={url} alt="" className="cs-lib-thumb" />
                              </span>
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

                <div className="cs-field">
                  <span className="cs-label">从服装库选择</span>
                  <div className="cs-costume-row">
                    <select
                      className="cs-select"
                      value={costumeId}
                      onChange={(e) => applyCostumeFromLibrary(e.target.value)}
                    >
                      <option value="">未绑定服装</option>
                      {costumeItems.map((item) => (
                        <option key={`${item.scope}-${item.id}`} value={item.id}>
                          {item.builtin ? '内置 · ' : item.scope === 'public' ? '公共 · ' : '私有 · '}
                          {item.label}
                        </option>
                      ))}
                    </select>
                    {costumeId ? (
                      <button
                        type="button"
                        className="cs-btn cs-btn--ghost cs-btn--sm"
                        onClick={() => applyCostumeFromLibrary('')}
                      >
                        清除
                      </button>
                    ) : null}
                  </div>
                  {costumeLabel ? (
                    <p className="cs-hint">
                      已绑定 <code>@服装:{costumeLabel}</code> · 保存角色时写入 Costume lock
                    </p>
                  ) : (
                    <p className="cs-hint">可从服装库绑定套装，保持跨镜造型一致</p>
                  )}
                </div>

                <div className="cs-grid-2">
                  <label className="cs-field">
                    <span className="cs-label">服装 / 标志物</span>
                    <textarea
                      className="cs-textarea cs-textarea--sm"
                      value={wardrobe}
                      onChange={(e) => commit({ wardrobeAnchor: e.target.value })}
                      placeholder="风衣、怀表、耳坠…（可被服装库绑定覆盖）"
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
                    <div className="cs-panel__acts">
                      <button
                        type="button"
                        className="cs-btn cs-btn--ghost cs-btn--sm"
                        onClick={fillFromUpstream}
                      >
                        用上游图
                      </button>
                      <button
                        type="button"
                        className="cs-btn cs-btn--soft cs-btn--sm"
                        disabled={sheetGenerating}
                        onClick={() => void generateCharacterSheetViaPicture()}
                        title="通过连接的图像生成节点出角色设定板"
                      >
                        {sheetGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        {sheetGenerating ? '生成中' : '生成设定板'}
                      </button>
                    </div>
                  </div>
                  <p className="cs-hint" style={{ marginTop: 0, marginBottom: 8 }}>
                    顶部能力口连接「图像生成」后，可一键生成角色设定板并写入主参考。
                  </p>
                  <div className="mb-2">
                    <AssetLibraryGenSettings
                      preset="character-sheet"
                      value={characterSheetGen}
                      onChange={setCharacterSheetGen}
                      compact
                      hint="与素材库共用参数"
                    />
                  </div>
                  <div className="cs-views">
                    <div className="cs-slot">
                      <ImageUploadSlot
                        url={fullSheetUrl}
                        label="完整设定板"
                        compact
                        gallery={characterGallery}
                        onUploaded={(url) => commit({ fullSheetUrl: url })}
                        onClear={() => commit({ fullSheetUrl: '' })}
                      />
                    </div>
                    <div className="cs-slot">
                      <ImageUploadSlot
                        url={frontUrl}
                        label="正面"
                        compact
                        gallery={characterGallery}
                        onUploaded={(url) => commit({ frontUrl: url })}
                        onClear={() => commit({ frontUrl: '' })}
                      />
                    </div>
                    <div className="cs-slot">
                      <ImageUploadSlot
                        url={sideUrl}
                        label="侧面"
                        compact
                        gallery={characterGallery}
                        onUploaded={(url) => commit({ sideUrl: url })}
                        onClear={() => commit({ sideUrl: '' })}
                      />
                    </div>
                    <div className="cs-slot">
                      <ImageUploadSlot
                        url={backUrl}
                        label="背面"
                        compact
                        gallery={characterGallery}
                        onUploaded={(url) => commit({ backUrl: url })}
                        onClear={() => commit({ backUrl: '' })}
                      />
                    </div>
                  </div>
                  <p className="cs-hint">
                    一键生成会裁切回填完整设定板与多面板资产；详细表情/微表情/手部格请在「素材库 · 角色」中查看。
                  </p>
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
      <ImageLightbox
        open={sheetPreviewOpen}
        items={overrideGallery && overrideGallery.length > 0 ? overrideGallery : characterGallery}
        index={sheetPreviewIndex}
        onClose={() => {
          setSheetPreviewOpen(false);
          setOverrideGallery(null);
        }}
      />
    </div>
  );
}

export default memo(CharacterSheetBlock);

