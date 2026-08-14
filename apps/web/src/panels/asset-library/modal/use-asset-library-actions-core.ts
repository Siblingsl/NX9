import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type {
  AssetLibraryKind,
  AssetScope,
  BacklotWorkspaceItem,
  CharacterProfile,
  SoundAssetProfile,
  StylePresetProfile,
} from '@nx9/shared';
import {
  BUILTIN_BACKLOT_TEMPLATES,
  BUILTIN_PUBLIC_SOUND_ASSETS,
  BUILTIN_STYLE_PRESETS,
  cloneSoundAsset,
  cloneStylePreset,
  getCostumeCreative,
  getPropCreative,
  getSceneCreative,
  getShotCreative,
  getVoiceCreative,
  isBuiltinSoundAsset,
  isBuiltinStylePreset,
  isSoundFavorite,
  newBacklotWorkspaceItem,
  newCharacterProfile,
  newSoundAsset,
  newStylePreset,
  normalizeCharacterProfile,
  refreshCharacterPrompts,
  refreshVoicePrompts,
  refreshWorkspacePrompts,
  templateToWorkspaceItem,
  workspaceItemToCustomTemplate,
} from '@nx9/shared';
import {
  disconnectAssetRefsOnDelete,
  rebindInvalidShotRefs,
  summarizeAssetUsageForDelete,
} from '../../../engine/asset-ref-rebind';
import { workspaceItemToEnvironmentProfile } from '../../../engine/script-asset-candidates';
import { useActivityLog } from '../../../stores/activity-log';
import { askConfirm, askConfirmWithOption, confirmDelete } from '../../../stores/confirm-dialog';
import { useFlowRuntime } from '../../../stores/flow-runtime';
import { usePublicAssetLibrary } from '../../../stores/public-asset-library';
import { toastError, toastSuccess } from '../../../stores/toast';
import { useWorkspaceCatalog } from '../../../stores/workspace-catalog';
import { useWorkspaceDocument } from '../../../stores/workspace-document';
import { ENTITY_CARD_TABS } from './meta';

export type AssetLibraryActionsCoreDeps = {
  scope: AssetScope;
  tab: AssetLibraryKind;
  editId: string | null;
  canEditPrivate: boolean;
  canDeleteItem: boolean;
  canWrite: boolean;
  selectedIds: Set<string>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  setEditId: Dispatch<SetStateAction<string | null>>;
  setTab: (tab: AssetLibraryKind) => void;
  setScope: (scope: AssetScope) => void;
  setQuery: Dispatch<SetStateAction<string>>;
  setSuggestCreateLabel: Dispatch<SetStateAction<string | null>>;
  healthAnalysis: ReturnType<typeof import('../AssetHealthBar').useAssetHealthAnalysis>;
  workspaceById: Map<string, BacklotWorkspaceItem>;
  soundsById: Map<string, SoundAssetProfile>;
  stylesById: Map<string, StylePresetProfile>;
  selectableBatchIds: string[];
};

export function useAssetLibraryActionsCore(deps: AssetLibraryActionsCoreDeps) {
  const {
    scope,
    tab,
    editId,
    canEditPrivate,
    canDeleteItem,
    canWrite,
    selectedIds,
    setSelectedIds,
    setEditId,
    setTab,
    setScope,
    setQuery,
    setSuggestCreateLabel,
    healthAnalysis,
    workspaceById,
    soundsById,
    stylesById,
    selectableBatchIds,
  } = deps;

  const appendLog = useActivityLog((s) => s.append);
  const activeId = useWorkspaceCatalog((s) => s.activeId);

  const upsertCharacter = useWorkspaceDocument((s) => s.upsertCharacter);
  const removeCharacter = useWorkspaceDocument((s) => s.removeCharacter);
  const upsertSound = useWorkspaceDocument((s) => s.upsertSound);
  const removeSound = useWorkspaceDocument((s) => s.removeSound);
  const upsertBacklotWorkspace = useWorkspaceDocument((s) => s.upsertBacklotWorkspace);
  const removeBacklotWorkspace = useWorkspaceDocument((s) => s.removeBacklotWorkspace);
  const setEnvironments = useWorkspaceDocument((s) => s.setEnvironments);
  const characters = useWorkspaceDocument((s) => s.characters.characters);
  const sounds = useWorkspaceDocument((s) => s.soundLibrary.sounds);
  const workspaceItems = useWorkspaceDocument((s) => s.backlotWorkspace.items);

  const publicUpsertCharacter = usePublicAssetLibrary((s) => s.upsertCharacter);
  const publicRemoveCharacter = usePublicAssetLibrary((s) => s.removeCharacter);
  const publicUpsertSound = usePublicAssetLibrary((s) => s.upsertSound);
  const publicRemoveSound = usePublicAssetLibrary((s) => s.removeSound);
  const publicUpsertTemplate = usePublicAssetLibrary((s) => s.upsertTemplate);
  const publicRemoveTemplate = usePublicAssetLibrary((s) => s.removeTemplate);
  const publicUpsertStyle = usePublicAssetLibrary((s) => s.upsertStyle);
  const publicRemoveStyle = usePublicAssetLibrary((s) => s.removeStyle);
  const publicCharacters = usePublicAssetLibrary((s) => s.payload.characters);
  const publicSounds = usePublicAssetLibrary((s) => s.payload.sounds);
  const publicTemplates = usePublicAssetLibrary((s) => s.payload.templates);
  const publicStyles = usePublicAssetLibrary((s) => s.payload.styles ?? []);

  const saveCharacter = useCallback(
    async (c: CharacterProfile) => {
      const next = normalizeCharacterProfile(c);
      const prev =
        (scope === 'private' ? characters : publicCharacters).find((x) => x.id === next.id);
      const oldName = prev?.name?.trim() ?? '';
      const newName = next.name?.trim() ?? '';
      if (prev && oldName && newName && oldName !== newName) {
        const sync = await askConfirm({
          title: '角色已改名',
          description: `将「${oldName}」改为「${newName}」。是否同步更新分镜引用，并把旧名写入别名？\n选「仅改库名」则镜表仍用旧名，可能出现失效引用。`,
          confirmLabel: '同步更新分镜',
          cancelLabel: '仅改库名',
          tone: 'neutral',
        });
        let toSave = next;
        if (sync) {
          const aliases = [...(next.creative?.aliases ?? [])];
          if (!aliases.some((a) => a.trim().toLowerCase() === oldName.toLowerCase())) {
            aliases.push(oldName);
          }
          toSave = {
            ...next,
            creative: { ...next.creative, aliases },
          };
          const runtime = useFlowRuntime.getState().runtime;
          if (runtime?.getNodes && runtime.updateNodeData) {
            const n = rebindInvalidShotRefs(runtime.getNodes(), runtime.updateNodeData, {
              kind: 'character',
              oldName,
              newId: next.id,
              newName,
            });
            toastSuccess(
              n > 0
                ? `已改名并同步 ${n} 镜引用 · 旧名已写入别名`
                : '已改名（当前无分镜引用需同步）· 旧名已写入别名',
            );
          } else {
            toastSuccess('已改名并写入别名（画布未就绪，分镜未同步）');
          }
        }
        if (scope === 'private') upsertCharacter(toSave);
        else publicUpsertCharacter(toSave);
        return;
      }
      if (scope === 'private') upsertCharacter(next);
      else publicUpsertCharacter(next);
    },
    [scope, characters, publicCharacters, upsertCharacter, publicUpsertCharacter],
  );

  const saveWorkspaceItem = useCallback(
    (item: BacklotWorkspaceItem) => {
      if (scope === 'private') {
        let next = item;
        if (item.kind === 'scene') {
          const currentEnvs = useWorkspaceDocument.getState().environments?.environments ?? [];
          const existingEnv = currentEnvs.find((env) => {
            const creative = getSceneCreative(item);
            return (
              env.id === creative.environmentId
              || env.id === item.id.replace(/^scene-/, '')
              || (env.name ?? '').trim().toLowerCase() === (item.label ?? '').trim().toLowerCase()
            );
          });
          const env = workspaceItemToEnvironmentProfile(item, existingEnv);
          next = {
            ...item,
            creative: {
              ...getSceneCreative(item),
              environmentId: env.id,
              sceneCode: env.sceneCode,
              props: env.props,
              referenceUrls: env.referenceUrls,
            } as BacklotWorkspaceItem['creative'],
          };
          setEnvironments({
            version: 1,
            environments: [...currentEnvs.filter((e) => e.id !== env.id), env],
          });
        }
        upsertBacklotWorkspace(next);
        return;
      }
      const existing = publicTemplates.find((t) => t.id === item.id);
      const isBuiltinOnly =
        !existing
        && BUILTIN_BACKLOT_TEMPLATES.some((t) => t.id === item.id && t.kind === item.kind);
      // 内置镜头词典只读：禁止同 id 就地覆盖；请走「导入副本」
      if (isBuiltinOnly && item.kind === 'shot') {
        toastError('内置镜头不可修改，请先导入副本');
        return;
      }
      if (isBuiltinOnly) {
        publicUpsertTemplate(
          workspaceItemToCustomTemplate(item, '公共库', undefined, {
            id: item.id,
            createdAt: Date.now(),
          }),
        );
        return;
      }
      publicUpsertTemplate(
        workspaceItemToCustomTemplate(
          item,
          existing?.group || '公共库',
          undefined,
          existing
            ? { id: existing.id, createdAt: existing.createdAt }
            : { id: item.id, createdAt: Date.now() },
        ),
      );
    },
    [scope, upsertBacklotWorkspace, publicUpsertTemplate, setEnvironments, publicTemplates],
  );

  const saveSound = useCallback(
    (s: SoundAssetProfile) => {
      if (isBuiltinSoundAsset(s)) {
        toastError('内置声音不可修改，请先导入副本');
        return;
      }
      if (scope === 'private') upsertSound(s);
      else publicUpsertSound(s);
    },
    [scope, upsertSound, publicUpsertSound],
  );

  const handleCreate = useCallback((prefillLabel?: string) => {
    if (scope === 'private' && !canEditPrivate) return;
    if (tab === 'hook' || tab === 'emotion') return;
    const label = prefillLabel?.trim();
    if (tab === 'character') {
      const c = newCharacterProfile(label || undefined);
      saveCharacter(c);
      setEditId(c.id);
      setSuggestCreateLabel(null);
      return;
    }
    if (tab === 'sound') {
      const s = refreshVoicePrompts(newSoundAsset(label || undefined));
      saveSound(s);
      setEditId(s.id);
      setSuggestCreateLabel(null);
      return;
    }
    if (tab === 'style') {
      if (scope !== 'public') return;
      const s = newStylePreset({ name: label || '未命名风格' });
      publicUpsertStyle(s);
      setEditId(s.id);
      setSuggestCreateLabel(null);
      setQuery('');
      return;
    }
    if (scope === 'private') {
      const item = refreshWorkspacePrompts({
        ...newBacklotWorkspaceItem(tab as Exclude<AssetLibraryKind, 'character' | 'sound' | 'style'>),
        ...(label ? { label } : {}),
      });
      saveWorkspaceItem(item);
      setEditId(item.id);
      setSuggestCreateLabel(null);
      setQuery('');
      return;
    }
    const tpl = workspaceItemToCustomTemplate(
      refreshWorkspacePrompts({
        ...newBacklotWorkspaceItem(tab as Exclude<AssetLibraryKind, 'character' | 'sound' | 'style'>),
        ...(label ? { label } : {}),
      }),
      '公共库',
    );
    publicUpsertTemplate(tpl);
    setEditId(tpl.id);
    setSuggestCreateLabel(null);
  }, [
    scope,
    canEditPrivate,
    tab,
    saveCharacter,
    saveSound,
    saveWorkspaceItem,
    publicUpsertTemplate,
    publicUpsertStyle,
    setEditId,
    setSuggestCreateLabel,
    setQuery,
  ]);

  const handleCloneBuiltin = useCallback(
    (templateId: string) => {
      if (tab === 'style') {
        if (scope !== 'public') return;
        const source =
          stylesById.get(templateId)
          ?? BUILTIN_STYLE_PRESETS.find((s) => s.id === templateId);
        if (!source) return;
        if (!isBuiltinStylePreset(source) && publicStyles.some((s) => s.id === templateId)) {
          // 已是自定义条目：再复制一份
          const copy = cloneStylePreset(source);
          publicUpsertStyle(copy);
          setEditId(copy.id);
          toastSuccess(`已复制「${copy.name}」`);
          return;
        }
        const copy = cloneStylePreset(source);
        publicUpsertStyle(copy);
        setEditId(copy.id);
        toastSuccess(`已导入风格副本「${copy.name}」`);
        return;
      }
      if (tab === 'sound') {
        const source =
          soundsById.get(templateId)
          ?? BUILTIN_PUBLIC_SOUND_ASSETS.find((s) => s.id === templateId);
        if (!source) return;
        if (scope === 'private' && !canEditPrivate) return;
        const copy = refreshVoicePrompts(cloneSoundAsset(source));
        if (scope === 'private') {
          upsertSound(copy);
        } else {
          publicUpsertSound(copy);
        }
        setEditId(copy.id);
        toastSuccess(
          isBuiltinSoundAsset(source)
            ? `已导入声音副本「${copy.name}」`
            : `已复制「${copy.name}」`,
        );
        return;
      }
      if (tab === 'character') return;
      if (scope === 'private' && !canEditPrivate) return;
      const tpl = BUILTIN_BACKLOT_TEMPLATES.find((x) => x.id === templateId && x.kind === tab);
      if (!tpl || tpl.kind === 'character') return;
      const base = templateToWorkspaceItem(tpl, tpl.id);
      if (!base) return;
      const item = refreshWorkspacePrompts(base);
      if (scope === 'private') {
        saveWorkspaceItem(item);
        setEditId(item.id);
        toastSuccess(`已从模板导入「${item.label}」`);
        appendLog(`服装/素材库：导入模板 ${item.label}`);
        return;
      }
      const custom = workspaceItemToCustomTemplate(item, tpl.group || '公共库');
      publicUpsertTemplate(custom);
      setEditId(custom.id);
      toastSuccess(`已导入公共库「${custom.label}」`);
    },
    [
      tab,
      scope,
      canEditPrivate,
      stylesById,
      publicStyles,
      publicUpsertStyle,
      soundsById,
      upsertSound,
      publicUpsertSound,
      saveWorkspaceItem,
      publicUpsertTemplate,
      appendLog,
      setEditId,
    ],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (tab === 'shot') {
        const isBuiltin =
          !publicTemplates.some((t) => t.id === id && t.kind === 'shot')
          && BUILTIN_BACKLOT_TEMPLATES.some((t) => t.id === id && t.kind === 'shot');
        if (isBuiltin) {
          toastError('内置镜头不可删除');
          return;
        }
      }
      if (tab === 'style') {
        const style =
          stylesById.get(id)
          ?? BUILTIN_STYLE_PRESETS.find((s) => s.id === id);
        if (isBuiltinStylePreset(style)) {
          toastError('内置风格不可删除');
          return;
        }
      }
      if (tab === 'sound') {
        const sound =
          soundsById.get(id)
          ?? BUILTIN_PUBLIC_SOUND_ASSETS.find((s) => s.id === id);
        if (isBuiltinSoundAsset(sound)) {
          toastError('内置声音不可删除');
          return;
        }
      }

      let label = id;
      if (tab === 'character') {
        label = characters.find((c) => c.id === id)?.name
          ?? publicCharacters.find((c) => c.id === id)?.name
          ?? id;
      } else if (tab === 'sound') {
        label = soundsById.get(id)?.name ?? id;
      } else if (tab === 'style') {
        label = stylesById.get(id)?.name ?? id;
      } else {
        label =
          workspaceItems.find((x) => x.id === id)?.label
          ?? publicTemplates.find((t) => t.id === id)?.label
          ?? id;
      }
      const usage = summarizeAssetUsageForDelete(healthAnalysis, {
        kind: tab,
        id,
        label,
        characters,
      });
      const usageHint = usage.labels.length
        ? `\n\n⚠ 仍被引用：${usage.labels.join('；')}。`
        : '';

      const result = await askConfirmWithOption({
        title: '移入回收站？',
        description: `「${label}」将移入回收站，30 天内可恢复。${usageHint}`,
        confirmLabel: '移入回收站',
        option: usage.labels.length
          ? {
              label: '同时断开镜表/绑定引用（推荐，避免幽灵失效）',
              defaultChecked: true,
            }
          : {
              label: '同时扫描并断开残留引用',
              defaultChecked: false,
            },
      });
      if (!result.confirmed) return;

      const runtime = useFlowRuntime.getState().runtime;
      if (result.optionChecked && runtime?.getNodes && runtime.updateNodeData) {
        const cleared = disconnectAssetRefsOnDelete(
          runtime.getNodes(),
          runtime.updateNodeData,
          { kind: tab, id, label },
          (cid, patch) => {
            const cur = characters.find((c) => c.id === cid);
            if (cur) upsertCharacter({ ...cur, ...patch, creative: { ...cur.creative, ...patch.creative } });
          },
          characters,
        );
        // 场景挂接的 propIds
        if (tab === 'prop') {
          for (const item of workspaceItems) {
            if (item.kind !== 'scene') continue;
            const ext = (item.creative ?? {}) as { propIds?: string[] };
            const propIds = ext.propIds ?? [];
            if (!propIds.includes(id)) continue;
            upsertBacklotWorkspace({
              ...item,
              creative: { ...ext, propIds: propIds.filter((pid) => pid !== id) },
            });
          }
        }
        if (cleared > 0) toastSuccess(`已断开 ${cleared} 处引用`);
      }

      if (tab === 'character') {
        if (scope === 'private') removeCharacter(id);
        else publicRemoveCharacter(id);
      } else if (tab === 'sound') {
        if (scope === 'private') removeSound(id);
        else publicRemoveSound(id);
      } else if (tab === 'style') {
        if (scope === 'public') publicRemoveStyle(id);
      } else if (scope === 'private') {
        if (tab === 'scene') {
          const item = workspaceItems.find((x) => x.id === id);
          if (item) {
            const env = workspaceItemToEnvironmentProfile(item);
            const current = useWorkspaceDocument.getState().environments?.environments ?? [];
            setEnvironments({
              version: 1,
              environments: current.filter(
                (e) => e.id !== env.id && (e.name ?? '').trim().toLowerCase() !== (item.label ?? '').trim().toLowerCase(),
              ),
            });
          }
        }
        removeBacklotWorkspace(id);
      } else {
        publicRemoveTemplate(id);
      }
      if (editId === id) setEditId(null);
      toastSuccess('已移入回收站');
    },
    [
      tab,
      scope,
      editId,
      workspaceItems,
      publicTemplates,
      removeCharacter,
      publicRemoveCharacter,
      removeSound,
      publicRemoveSound,
      publicRemoveStyle,
      removeBacklotWorkspace,
      publicRemoveTemplate,
      setEnvironments,
      stylesById,
      soundsById,
      healthAnalysis,
      characters,
      publicCharacters,
      upsertCharacter,
      upsertBacklotWorkspace,
      setEditId,
    ],
  );

  // F-038: 从公共库复制非内置条目到当前项目私有库（UX-10：复制后自动切私有并选中）
  const handleCopyPublicToWorkspace = useCallback(
    (itemId: string) => {
      if (!activeId) {
        toastSuccess('请先打开一个项目');
        return;
      }
      const publicChar = publicCharacters.find((c) => c.id === itemId);
      if (publicChar) {
        const copied = refreshCharacterPrompts(
          normalizeCharacterProfile({
            ...publicChar,
            id: `char_${Date.now().toString(36)}`,
            sourceTemplateId: publicChar.id,
          }),
        );
        upsertCharacter(copied);
        setScope('private');
        setTab('character');
        setEditId(copied.id);
        setQuery('');
        toastSuccess(`已复制「${copied.name}」到当前项目并开始编辑`);
        appendLog(`素材库：复制公共角色「${copied.name}」到项目`);
        return;
      }
      const publicSound = publicSounds.find((s) => s.id === itemId);
      if (publicSound || soundsById.get(itemId)) {
        const source = publicSound ?? soundsById.get(itemId);
        if (!source || isBuiltinSoundAsset(source)) return;
        const copy = refreshVoicePrompts(cloneSoundAsset(source));
        upsertSound(copy);
        setScope('private');
        setTab('sound');
        setEditId(copy.id);
        setQuery('');
        toastSuccess(`已复制「${copy.name}」到当前项目`);
        return;
      }
      const tpl = publicTemplates.find((t) => t.id === itemId);
      if (!tpl) return;
      const workspaceItem = templateToWorkspaceItem(tpl, tpl.id);
      if (!workspaceItem) return;
      const item = refreshWorkspacePrompts(workspaceItem);
      saveWorkspaceItem(item);
      setScope('private');
      setTab(item.kind);
      setEditId(item.id);
      setQuery('');
      toastSuccess(`已复制「${item.label}」到当前项目并开始编辑`);
      appendLog(`素材库：复制公共素材「${item.label}」到项目`);
    },
    [
      activeId,
      publicCharacters,
      publicSounds,
      publicTemplates,
      soundsById,
      upsertCharacter,
      upsertSound,
      saveWorkspaceItem,
      appendLog,
      setScope,
      setTab,
      setEditId,
      setQuery,
    ],
  );

  /** 私有 → 公共：发布副本到跨项目公共库 */
  const handlePublishToPublic = useCallback(
    async (itemId: string) => {
      if (!canWrite) {
        toastError('当前无权写入公共库');
        return;
      }
      if (tab === 'character') {
        const char = characters.find((c) => c.id === itemId);
        if (!char) return;
        const ok = await askConfirm({
          title: '发布到公共库？',
          description: `将「${char.name}」发布为公共副本，供各项目复用。不会删除项目内原条目。`,
          confirmLabel: '发布',
        });
        if (!ok) return;
        const published = refreshCharacterPrompts(
          normalizeCharacterProfile({
            ...char,
            id: `char_pub_${Date.now().toString(36)}`,
            sourceTemplateId: char.id,
          }),
        );
        publicUpsertCharacter(published);
        toastSuccess(`已发布「${published.name}」到公共库`);
        appendLog(`素材库：发布角色「${published.name}」到公共`);
        return;
      }
      if (tab === 'sound') {
        const sound = sounds.find((s) => s.id === itemId);
        if (!sound) return;
        const ok = await askConfirm({
          title: '发布到公共库？',
          description: `将「${sound.name}」发布为公共副本。`,
          confirmLabel: '发布',
        });
        if (!ok) return;
        const published = refreshVoicePrompts(cloneSoundAsset(sound));
        publicUpsertSound(published);
        toastSuccess(`已发布「${published.name}」到公共库`);
        return;
      }
      if (!ENTITY_CARD_TABS.has(tab) && tab !== 'shot') return;
      const item = workspaceItems.find((x) => x.id === itemId);
      if (!item || item.kind !== tab) return;
      const ok = await askConfirm({
        title: '发布到公共库？',
        description: `将「${item.label}」发布为公共副本，供各项目复用。`,
        confirmLabel: '发布',
      });
      if (!ok) return;
      const tpl = workspaceItemToCustomTemplate(item, '从项目发布');
      publicUpsertTemplate(tpl);
      toastSuccess(`已发布「${tpl.label}」到公共库`);
      appendLog(`素材库：发布「${tpl.label}」到公共`);
    },
    [
      canWrite,
      tab,
      characters,
      sounds,
      workspaceItems,
      publicUpsertCharacter,
      publicUpsertSound,
      publicUpsertTemplate,
      appendLog,
    ],
  );

  const handleToggleCharacterLock = useCallback(
    (id: string) => {
      const pool = scope === 'private' ? characters : publicCharacters;
      const char = pool.find((c) => c.id === id);
      if (!char) return;
      const locked = Boolean(char.creative?.consistency?.locked);
      const nextLocked = !locked;
      const snap = char.consistencyPrompt?.trim() || '';
      saveCharacter({
        ...char,
        creative: {
          ...char.creative,
          viewsLocked: nextLocked,
          consistency: {
            ...char.creative?.consistency,
            locked: nextLocked,
            lockedPromptSnapshot: nextLocked
              ? snap
              : char.creative?.consistency?.lockedPromptSnapshot,
            lockedAt: nextLocked
              ? new Date().toISOString()
              : char.creative?.consistency?.lockedAt,
          },
        },
      });
    },
    [scope, characters, publicCharacters, saveCharacter],
  );

  const handleToggleEntityLock = useCallback(
    (id: string) => {
      if (!ENTITY_CARD_TABS.has(tab)) return;
      const item = workspaceById.get(id);
      if (!item || item.kind !== tab) return;
      if (tab === 'costume') {
        const ext = getCostumeCreative(item);
        const locked = !ext.locked;
        const prompt = item.promptEn?.trim() || ext.prompts?.costume?.text?.trim() || '';
        saveWorkspaceItem({
          ...item,
          creative: {
            ...ext,
            locked,
            lockedPromptSnapshot: locked ? prompt : ext.lockedPromptSnapshot,
            lockedAt: locked ? new Date().toISOString() : ext.lockedAt,
          },
        });
        return;
      }
      if (tab === 'prop') {
        const ext = getPropCreative(item);
        const locked = !ext.locked;
        const prompt = item.promptEn?.trim() || ext.prompts?.prop?.text?.trim() || '';
        saveWorkspaceItem({
          ...item,
          creative: {
            ...ext,
            locked,
            lockedPromptSnapshot: locked ? prompt : ext.lockedPromptSnapshot,
            lockedAt: locked ? new Date().toISOString() : ext.lockedAt,
          },
        });
        return;
      }
      const ext = getSceneCreative(item);
      const locked = !ext.locked;
      const prompt = item.promptEn?.trim() || ext.prompts?.scene?.text?.trim() || '';
      saveWorkspaceItem({
        ...item,
        creative: {
          ...ext,
          locked,
          lockedPromptSnapshot: locked ? prompt : ext.lockedPromptSnapshot,
          lockedAt: locked ? new Date().toISOString() : ext.lockedAt,
        },
      });
    },
    [tab, workspaceById, saveWorkspaceItem],
  );

  const toggleBatchSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [selectableBatchIds, setSelectedIds]);

  const selectAllBatch = useCallback(() => {
    setSelectedIds(new Set(selectableBatchIds));
  }, [setSelectedIds]);

  const clearBatchSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, [setSelectedIds]);

  const handleBatchSetLock = useCallback(
    (locked: boolean) => {
      const ids = [...selectedIds];
      if (ids.length === 0) return;
      if (tab === 'character') {
        const pool = scope === 'private' ? characters : publicCharacters;
        for (const id of ids) {
          const char = pool.find((c) => c.id === id);
          if (!char) continue;
          const snap = char.consistencyPrompt?.trim() || '';
          saveCharacter({
            ...char,
            creative: {
              ...char.creative,
              viewsLocked: locked,
              consistency: {
                ...char.creative?.consistency,
                locked,
                lockedPromptSnapshot: locked
                  ? snap
                  : char.creative?.consistency?.lockedPromptSnapshot,
                lockedAt: locked
                  ? new Date().toISOString()
                  : char.creative?.consistency?.lockedAt,
              },
            },
          });
        }
      } else if (ENTITY_CARD_TABS.has(tab)) {
        for (const id of ids) {
          const item = workspaceById.get(id);
          if (!item || item.kind !== tab) continue;
          if (tab === 'costume') {
            const ext = getCostumeCreative(item);
            const prompt = item.promptEn?.trim() || ext.prompts?.costume?.text?.trim() || '';
            saveWorkspaceItem({
              ...item,
              creative: {
                ...ext,
                locked,
                lockedPromptSnapshot: locked ? prompt : ext.lockedPromptSnapshot,
                lockedAt: locked ? new Date().toISOString() : ext.lockedAt,
              },
            });
          } else if (tab === 'prop') {
            const ext = getPropCreative(item);
            const prompt = item.promptEn?.trim() || ext.prompts?.prop?.text?.trim() || '';
            saveWorkspaceItem({
              ...item,
              creative: {
                ...ext,
                locked,
                lockedPromptSnapshot: locked ? prompt : ext.lockedPromptSnapshot,
                lockedAt: locked ? new Date().toISOString() : ext.lockedAt,
              },
            });
          } else {
            const ext = getSceneCreative(item);
            const prompt = item.promptEn?.trim() || ext.prompts?.scene?.text?.trim() || '';
            saveWorkspaceItem({
              ...item,
              creative: {
                ...ext,
                locked,
                lockedPromptSnapshot: locked ? prompt : ext.lockedPromptSnapshot,
                lockedAt: locked ? new Date().toISOString() : ext.lockedAt,
              },
            });
          }
        }
      }
      toastSuccess(locked ? `已锁定 ${ids.length} 项` : `已解锁 ${ids.length} 项`);
      setSelectedIds(new Set());
    },
    [
      selectedIds,
      tab,
      scope,
      characters,
      publicCharacters,
      workspaceById,
      saveCharacter,
      saveWorkspaceItem,
      setSelectedIds,
    ],
  );

  const handleBatchDelete = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length === 0 || !canDeleteItem) return;
    const labels = ids.map((id) => {
      if (tab === 'character') {
        return (scope === 'private' ? characters : publicCharacters).find((c) => c.id === id)?.name ?? id;
      }
      return (
        workspaceItems.find((x) => x.id === id)?.label
        ?? publicTemplates.find((t) => t.id === id)?.label
        ?? id
      );
    });
    const cited = ids.filter((id) => {
      const label =
        tab === 'character'
          ? (scope === 'private' ? characters : publicCharacters).find((c) => c.id === id)?.name ?? id
          : workspaceItems.find((x) => x.id === id)?.label
            ?? publicTemplates.find((t) => t.id === id)?.label
            ?? id;
      return summarizeAssetUsageForDelete(healthAnalysis, {
        kind: tab,
        id,
        label,
        characters: scope === 'private' ? characters : publicCharacters,
      }).labels.length > 0;
    });
    const usageHint = cited.length
      ? `\n\n⚠ 其中 ${cited.length} 项仍被引用，移入回收站后可能出现失效引用。`
      : '';
    const ok = await confirmDelete({
      title: `移入回收站 ${ids.length} 项？`,
      description: `将移入：${labels.slice(0, 8).join('、')}${labels.length > 8 ? '…' : ''}。30 天内可恢复。${usageHint}`,
    });
    if (!ok) return;
    for (const id of ids) {
      if (tab === 'character') {
        if (scope === 'private') removeCharacter(id);
        else publicRemoveCharacter(id);
      } else if (scope === 'private') {
        if (tab === 'scene') {
          const item = workspaceItems.find((x) => x.id === id);
          if (item) {
            const env = workspaceItemToEnvironmentProfile(item);
            const current = useWorkspaceDocument.getState().environments?.environments ?? [];
            setEnvironments({
              version: 1,
              environments: current.filter(
                (e) => e.id !== env.id && (e.name ?? '').trim().toLowerCase() !== (item.label ?? '').trim().toLowerCase(),
              ),
            });
          }
        }
        if (ENTITY_CARD_TABS.has(tab)) removeBacklotWorkspace(id);
      } else if (ENTITY_CARD_TABS.has(tab)) {
        publicRemoveTemplate(id);
      }
    }
    setSelectedIds(new Set());
    toastSuccess(`已移入回收站 ${ids.length} 项`);
  }, [
    selectedIds,
    canDeleteItem,
    tab,
    scope,
    characters,
    publicCharacters,
    workspaceItems,
    publicTemplates,
    healthAnalysis,
    removeCharacter,
    publicRemoveCharacter,
    removeBacklotWorkspace,
    publicRemoveTemplate,
    setEnvironments,
    setSelectedIds,
  ]);

  const isBuiltinShotId = useCallback(
    (id: string) =>
      !publicTemplates.some((t) => t.id === id && t.kind === 'shot')
      && BUILTIN_BACKLOT_TEMPLATES.some((t) => t.id === id && t.kind === 'shot'),
    [publicTemplates],
  );

  const handleEditShot = useCallback(
    (id: string) => {
      if (isBuiltinShotId(id)) {
        toastError('内置镜头不可修改，请用「导入副本」');
        return;
      }
      setEditId(id);
    },
    [isBuiltinShotId, setEditId],
  );

  const handleToggleShotFavorite = useCallback(
    (id: string) => {
      if (isBuiltinShotId(id)) {
        toastError('内置镜头不可修改，请先导入副本');
        return;
      }
      const base = workspaceById.get(id);
      if (!base || base.kind !== 'shot') return;
      const ext = getShotCreative(base);
      saveWorkspaceItem({ ...base, creative: { ...ext, favorite: !ext.favorite } });
    },
    [workspaceById, isBuiltinShotId, saveWorkspaceItem],
  );

  const handleToggleShotLock = useCallback(
    (id: string) => {
      if (isBuiltinShotId(id)) {
        toastError('内置镜头不可修改，请先导入副本');
        return;
      }
      const base = workspaceById.get(id);
      if (!base || base.kind !== 'shot') return;
      const ext = getShotCreative(base);
      const locked = !ext.locked;
      const prompt = base.promptEn?.trim() || ext.prompts?.shot?.text?.trim() || '';
      saveWorkspaceItem({
        ...base,
        creative: {
          ...ext,
          locked,
          lockedPromptSnapshot: locked ? prompt : ext.lockedPromptSnapshot,
          lockedAt: locked ? new Date().toISOString() : ext.lockedAt,
        },
      });
    },
    [workspaceById, isBuiltinShotId, saveWorkspaceItem],
  );

  const handleEditStyle = useCallback(
    (id: string) => {
      // 内置也可打开只读预览；真正写入由 handleSaveStyle / 上传拦截
      setEditId(id);
    },
    [setEditId],
  );

  const handleToggleStyleFavorite = useCallback(
    (id: string) => {
      const style = stylesById.get(id);
      if (!style) return;
      if (isBuiltinStylePreset(style)) {
        toastError('内置风格不可修改，请先导入副本');
        return;
      }
      publicUpsertStyle({ ...style, favorite: !style.favorite });
    },
    [stylesById, publicUpsertStyle],
  );

  const handleSaveStyle = useCallback(
    (next: StylePresetProfile) => {
      if (scope !== 'public') return;
      if (isBuiltinStylePreset(next)) {
        toastError('内置风格不可修改，请先导入副本');
        return;
      }
      publicUpsertStyle(next);
    },
    [scope, publicUpsertStyle],
  );

  const handleEditSound = useCallback((id: string) => {
    setEditId(id);
  }, [setEditId]);

  const handleToggleSoundFavorite = useCallback(
    (id: string) => {
      const sound = soundsById.get(id);
      if (!sound) return;
      if (isBuiltinSoundAsset(sound)) {
        toastError('内置声音不可修改，请先导入副本');
        return;
      }
      const nextFav = !isSoundFavorite(sound);
      const ext = getVoiceCreative(sound);
      saveSound({
        ...sound,
        favorite: nextFav,
        creative: { ...ext, favorite: nextFav },
      });
    },
    [soundsById, saveSound],
  );

  return {
    saveCharacter,
    saveWorkspaceItem,
    saveSound,
    handleCreate,
    handleCloneBuiltin,
    handleDelete,
    handleCopyPublicToWorkspace,
    handlePublishToPublic,
    handleToggleCharacterLock,
    handleToggleEntityLock,
    toggleBatchSelect,
    selectAllBatch,
    clearBatchSelection,
    handleBatchSetLock,
    handleBatchDelete,
    isBuiltinShotId,
    handleEditShot,
    handleToggleShotFavorite,
    handleToggleShotLock,
    handleEditStyle,
    handleToggleStyleFavorite,
    handleSaveStyle,
    handleEditSound,
    handleToggleSoundFavorite,
  };
}
