import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AssetLibraryKind,
  AssetScope,
  BacklotWorkspaceItem,
  CharacterProfile,
  SoundAssetProfile,
} from '@nx9/shared';
import {
  ASSET_LIBRARY_TABS,
  BUILTIN_BACKLOT_TEMPLATES,
  isPrivateWorkspace,
  MAX_ENV_REFERENCE_IMAGES,
  newBacklotWorkspaceItem,
  newCharacterProfile,
  newSoundAsset,
  normalizeCharacterProfile,
  refreshCharacterPrompts,
  refreshVoicePrompts,
  refreshWorkspacePrompts,
  templateToWorkspaceItem,
  workspaceItemToCustomTemplate,
  buildCostumeSheetGenerationPrompt,
  buildCharacterSheetGenerationPrompt,
  applyCroppedPanelsToCharacter,
  CHARACTER_SHEET_PANEL_LAYOUT,
  resolveConnectedPictureGenId,
  getSceneCreative,
} from '@nx9/shared';
import {
  sceneCandidateToWorkspaceItem,
  workspaceItemToEnvironmentProfile,
} from '../engine/script-asset-candidates';
import {
  ArrowLeft,
  Globe2,
  FolderLock,
  Layers,
  Plus,
  Sparkles,
  Loader2,
  Search,
  ShieldCheck,
  AlertTriangle,
  Network,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { useAssetLibraryItems } from '../hooks/use-asset-library-items';
import { useAssetLibraryModalUi } from '../stores/asset-library-modal-ui';
import { usePublicAssetLibrary } from '../stores/public-asset-library';
import { useWorkspaceCatalog } from '../stores/workspace-catalog';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { useActivityLog } from '../stores/activity-log';
import { toastSuccess } from '../stores/toast';
import { useFlowRuntime } from '../stores/flow-runtime';
import { useAssetLibraryGenSettings } from '../stores/asset-library-gen-settings';
import AssetLibraryGenSettings, { resolveAssetLibraryImageRequest } from './asset-library/AssetLibraryGenSettings';
import { runPictureGenJob } from '../engine/picture-gen-runner';
import { cropCharacterSheetPanels } from '../engine/character-sheet-crop';
import { PrivateProjectList } from './PrivateProjectList';
import {
  CharacterDetailFields,
  CostumeDetailFields,
  SceneDetailFields,
  ShotDetailFields,
  EmotionDetailFields,
  HookDetailFields,
  VoiceDetailFields,
} from './asset-library/AssetDetailFields';

function normalizeName(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function AssetHealthPanel({
  tab,
  characters,
  workspaceItems,
  storyboard,
}: {
  tab: AssetLibraryKind;
  characters: CharacterProfile[];
  workspaceItems: BacklotWorkspaceItem[];
  storyboard: ReturnType<typeof useWorkspaceDocument.getState>['storyboard'];
}) {
  const analysis = useMemo(() => {
    const characterNames = new Map<string, CharacterProfile[]>();
    for (const c of characters) {
      const key = normalizeName(c.name);
      if (!key) continue;
      characterNames.set(key, [...(characterNames.get(key) ?? []), c]);
    }
    const sceneItems = workspaceItems.filter((item) => item.kind === 'scene');
    const sceneNames = new Map<string, BacklotWorkspaceItem[]>();
    for (const item of sceneItems) {
      const key = normalizeName(item.label);
      if (!key) continue;
      sceneNames.set(key, [...(sceneNames.get(key) ?? []), item]);
    }
    const usedCharacterNames = new Set(
      storyboard.shots.flatMap((shot) => shot.characterNames ?? []).map(normalizeName).filter(Boolean),
    );
    const usedSceneNames = new Set(
      storyboard.shots.map((shot) => normalizeName(shot.sceneName)).filter(Boolean),
    );
    const duplicateCharacters = [...characterNames.values()].filter((items) => items.length > 1).length;
    const duplicateScenes = [...sceneNames.values()].filter((items) => items.length > 1).length;
    const unusedCharacters = characters.filter((c) => !usedCharacterNames.has(normalizeName(c.name))).length;
    const unusedScenes = sceneItems.filter((s) => !usedSceneNames.has(normalizeName(s.label))).length;
    const missingCharacterPrompts = characters.filter((c) => !c.consistencyPrompt?.trim()).length;
    const missingScenePrompts = sceneItems.filter((s) => !(s.promptEn || (s.creative as any)?.prompts?.scene?.text)?.trim()).length;
    const unlockedCharacters = characters.filter((c) => !(c.creative as any)?.consistency?.locked).length;
    const unlockedScenes = sceneItems.filter((s) => !(s.creative as any)?.locked).length;
    const invalidShotCharacterRefs = storyboard.shots
      .flatMap((shot) => shot.characterNames ?? [])
      .filter((name) => name && !characterNames.has(normalizeName(name))).length;
    const invalidShotSceneRefs = storyboard.shots
      .filter((shot) => shot.sceneName && !sceneNames.has(normalizeName(shot.sceneName))).length;
    return {
      duplicateCharacters,
      duplicateScenes,
      unusedCharacters,
      unusedScenes,
      missingCharacterPrompts,
      missingScenePrompts,
      unlockedCharacters,
      unlockedScenes,
      invalidShotCharacterRefs,
      invalidShotSceneRefs,
      relationCount: storyboard.shots.length,
    };
  }, [characters, storyboard.shots, workspaceItems]);

  const issues = tab === 'character'
    ? [
        ['重复', analysis.duplicateCharacters],
        ['未使用', analysis.unusedCharacters],
        ['缺 Prompt', analysis.missingCharacterPrompts],
        ['未锁定', analysis.unlockedCharacters],
        ['失效引用', analysis.invalidShotCharacterRefs],
      ] as const
    : tab === 'scene'
      ? [
          ['重复', analysis.duplicateScenes],
          ['未使用', analysis.unusedScenes],
          ['缺 Prompt', analysis.missingScenePrompts],
          ['未锁定', analysis.unlockedScenes],
          ['失效引用', analysis.invalidShotSceneRefs],
        ] as const
      : [
          ['关系', analysis.relationCount],
          ['未使用', 0],
          ['冲突', 0],
        ] as const;
  const bad = issues.reduce((sum, [, n]) => sum + n, 0);

  return (
    <div className="shrink-0 border-b border-line bg-surface/35 px-4 py-2">
      <div className="flex items-center gap-2">
        <div className={`grid h-7 w-7 place-items-center rounded-lg ${bad ? 'bg-warn/10 text-warn' : 'bg-ok/10 text-ok'}`}>
          {bad ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-ink">素材健康检查</p>
          <p className="truncate text-[10px] text-ink/45">防重复、引用失效、素材污染、Prompt 漂移；关系图当前覆盖 {analysis.relationCount} 个分镜引用。</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {issues.map(([label, count]) => (
            <span key={label} className={`rounded-full px-2 py-0.5 text-[10px] ${count ? 'bg-warn/10 text-warn' : 'bg-white text-ink/40'}`}>
              {label} {count}
            </span>
          ))}
          <span className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] text-ink/45">
            <Network size={10} />
            影响分析
          </span>
        </div>
      </div>
    </div>
  );
}

const KIND_META: Record<
  AssetLibraryKind,
  { newLabel: string; emptyHint: string; promptPlaceholder: string }
> = {
  character: {
    newLabel: '新建角色',
    emptyHint: '角色设定主入口：档案、三视图、设定板生成；可在生成节点 @角色 引用',
    promptPlaceholder: '一致性 prompt…',
  },
  costume: {
    newLabel: '新建服装',
    emptyHint: '创建服装套装，维护面料/配色/标志物，可在生成节点 @服装 引用',
    promptPlaceholder: '造型、面料、配色、标志物…',
  },
  scene: {
    newLabel: '新建场景',
    emptyHint: '场景设定主入口：空间锚点、多参考图、环境圣经同步；可在生成节点 @场景 引用',
    promptPlaceholder: '环境、光线、空间描述…',
  },
  shot: {
    newLabel: '新建镜头',
    emptyHint: '运镜与机位描述，可在生成节点 @镜头 引用',
    promptPlaceholder: '运镜、景别、机位描述…',
  },
  emotion: {
    newLabel: '新建情绪',
    emptyHint: '表情与氛围描述，可在生成节点 @情绪 引用',
    promptPlaceholder: '表情、氛围、色调描述…',
  },
  hook: {
    newLabel: '新建钩子',
    emptyHint: '开场或结尾钩子，可在生成节点 @钩子 引用',
    promptPlaceholder: '钩子文案…',
  },
  sound: {
    newLabel: '新建声音',
    emptyHint: '参考音频、配音样本，可在生成节点 @声音 引用',
    promptPlaceholder: '声音描述…',
  },
};

export function AssetLibraryModal() {
  const open = useAssetLibraryModalUi((s) => s.open);
  const scope = useAssetLibraryModalUi((s) => s.scope);
  const tab = useAssetLibraryModalUi((s) => s.tab);
  const view = useAssetLibraryModalUi((s) => s.view);
  const selectedProjectId = useAssetLibraryModalUi((s) => s.selectedProjectId);
  const navigateRequest = useAssetLibraryModalUi((s) => s.navigateRequest);
  const setOpen = useAssetLibraryModalUi((s) => s.setOpen);
  const setScope = useAssetLibraryModalUi((s) => s.setScope);
  const setTab = useAssetLibraryModalUi((s) => s.setTab);
  const enterProject = useAssetLibraryModalUi((s) => s.enterProject);
  const backToProjects = useAssetLibraryModalUi((s) => s.backToProjects);
  const clearNavigateRequest = useAssetLibraryModalUi((s) => s.clearNavigateRequest);

  const activeId = useWorkspaceCatalog((s) => s.activeId);
  const catalogItems = useWorkspaceCatalog((s) => s.items);
  const privateProjects = useMemo(
    () => catalogItems.filter(isPrivateWorkspace),
    [catalogItems],
  );
  const catalogLoading = useWorkspaceCatalog((s) => s.loading);
  const selectWorkspace = useWorkspaceCatalog((s) => s.selectWorkspace);
  const createProject = useWorkspaceCatalog((s) => s.create);

  const selectedProject = useMemo(
    () => privateProjects.find((w) => w.id === selectedProjectId),
    [privateProjects, selectedProjectId],
  );

  const upsertCharacter = useWorkspaceDocument((s) => s.upsertCharacter);
  const removeCharacter = useWorkspaceDocument((s) => s.removeCharacter);
  const upsertSound = useWorkspaceDocument((s) => s.upsertSound);
  const removeSound = useWorkspaceDocument((s) => s.removeSound);
  const upsertBacklotWorkspace = useWorkspaceDocument((s) => s.upsertBacklotWorkspace);
  const removeBacklotWorkspace = useWorkspaceDocument((s) => s.removeBacklotWorkspace);
  const setEnvironments = useWorkspaceDocument((s) => s.setEnvironments);
  const environmentLibrary = useWorkspaceDocument((s) => s.environments);
  const characters = useWorkspaceDocument((s) => s.characters.characters);
  const sounds = useWorkspaceDocument((s) => s.soundLibrary.sounds);
  const workspaceItems = useWorkspaceDocument((s) => s.backlotWorkspace.items);
  const storyboard = useWorkspaceDocument((s) => s.storyboard);

  const fetchPublic = usePublicAssetLibrary((s) => s.fetch);
  const publicUpsertCharacter = usePublicAssetLibrary((s) => s.upsertCharacter);
  const publicRemoveCharacter = usePublicAssetLibrary((s) => s.removeCharacter);
  const publicUpsertSound = usePublicAssetLibrary((s) => s.upsertSound);
  const publicRemoveSound = usePublicAssetLibrary((s) => s.removeSound);
  const publicUpsertTemplate = usePublicAssetLibrary((s) => s.upsertTemplate);
  const publicRemoveTemplate = usePublicAssetLibrary((s) => s.removeTemplate);
  const publicCharacters = usePublicAssetLibrary((s) => s.payload.characters);
  const publicSounds = usePublicAssetLibrary((s) => s.payload.sounds);
  const publicTemplates = usePublicAssetLibrary((s) => s.payload.templates);

  const appendLog = useActivityLog((s) => s.append);
  const { items } = useAssetLibraryItems(scope, tab);

  const [query, setQuery] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [costumeGenBusy, setCostumeGenBusy] = useState(false);
  const [costumeGenProgress, setCostumeGenProgress] = useState<string | null>(null);
  const [charSheetGenBusy, setCharSheetGenBusy] = useState(false);
  const [charSheetGenProgress, setCharSheetGenProgress] = useState<string | null>(null);
  const runtime = useFlowRuntime((s) => s.runtime);
  const characterSheetGen = useAssetLibraryGenSettings((s) => s.characterSheet);
  const costumeSheetGen = useAssetLibraryGenSettings((s) => s.costumeSheet);
  const setCharacterSheetGen = useAssetLibraryGenSettings((s) => s.setCharacterSheet);
  const setCostumeSheetGen = useAssetLibraryGenSettings((s) => s.setCostumeSheet);

  useEffect(() => {
    if (open) void fetchPublic();
  }, [open, fetchPublic]);

  useEffect(() => {
    if (!open || !navigateRequest) return;
    if (navigateRequest.scope) setScope(navigateRequest.scope);
    setTab(navigateRequest.tab);
    if (navigateRequest.scope === 'public') {
      if (navigateRequest.itemId) setEditId(navigateRequest.itemId);
    } else {
      const projectId = navigateRequest.projectId ?? activeId;
      if (projectId) {
        void selectWorkspace(projectId);
        enterProject(projectId);
      }
      if (navigateRequest.itemId) setEditId(navigateRequest.itemId);
    }
    clearNavigateRequest();
  }, [
    open,
    navigateRequest,
    activeId,
    setScope,
    setTab,
    selectWorkspace,
    enterProject,
    clearNavigateRequest,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.prompt.toLowerCase().includes(q) ||
        (i.description?.toLowerCase().includes(q) ?? false),
    );
  }, [items, query]);

  const selectedChar = useMemo(
    () =>
      tab === 'character'
        ? (scope === 'private' ? characters : publicCharacters).find((c) => c.id === editId)
        : undefined,
    [tab, scope, characters, publicCharacters, editId],
  );

  const selectedSound = useMemo(
    () =>
      tab === 'sound'
        ? (scope === 'private' ? sounds : publicSounds).find((s) => s.id === editId)
        : undefined,
    [tab, scope, sounds, publicSounds, editId],
  );

  const selectedWorkspaceItem = useMemo((): BacklotWorkspaceItem | undefined => {
    if (tab === 'character' || tab === 'sound') return undefined;
    if (scope === 'private') {
      return workspaceItems.find((i) => i.id === editId && i.kind === tab);
    }
    const tpl =
      publicTemplates.find((x) => x.id === editId && x.kind === tab)
      ?? BUILTIN_BACKLOT_TEMPLATES.find((x) => x.id === editId && x.kind === tab);
    if (!tpl || tpl.kind === 'character') return undefined;
    // 只读预览内置/公共模板；要编辑请点「导入」
    return {
      id: tpl.id,
      kind: tpl.kind as Exclude<AssetLibraryKind, 'character' | 'sound'>,
      label: tpl.label,
      promptEn: tpl.promptEn,
      promptZh: tpl.promptZh,
      hookPhase: tpl.hookPhase,
      creative: 'creative' in tpl ? tpl.creative : undefined,
      sourceTemplateId: tpl.id,
    };
  }, [tab, scope, workspaceItems, publicTemplates, editId]);

  const costumeBindOptions = useMemo(() => {
    const privateCostumes = workspaceItems
      .filter((i) => i.kind === 'costume')
      .map((i) => ({
        id: i.id,
        label: i.label,
        prompt: i.promptEn || i.promptZh || '',
      }));
    const publicCostumes = [
      ...publicTemplates.filter((x) => x.kind === 'costume'),
      ...BUILTIN_BACKLOT_TEMPLATES.filter((x) => x.kind === 'costume'),
    ].map((i) => ({
      id: i.id,
      label: i.label,
      prompt: i.promptEn || i.promptZh || '',
    }));
    const seen = new Set<string>();
    const out: Array<{ id: string; label: string; prompt: string }> = [];
    for (const row of [...privateCostumes, ...publicCostumes]) {
      const key = row.id || row.label;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
    return out;
  }, [workspaceItems, publicTemplates]);

  const tabMeta = KIND_META[tab];
  const canEditPrivate =
    scope !== 'private' || (Boolean(selectedProjectId) && activeId === selectedProjectId);
  const canCreateAsset = scope === 'public' || canEditPrivate;

  /** 环境圣经 → 素材库场景页：补齐缺失条目，保证主路径只认素材库也能看到 extract 结果 */
  useEffect(() => {
    if (!open || scope !== 'private' || tab !== 'scene' || !canEditPrivate) return;
    const envs = environmentLibrary?.environments ?? [];
    if (envs.length === 0) return;
    const items = useWorkspaceDocument.getState().backlotWorkspace.items;
    for (const env of envs) {
      const existing = items.find((item) => {
        if (item.kind !== 'scene') return false;
        const creative = getSceneCreative(item);
        return (
          creative.environmentId === env.id
          || item.id === `scene-${env.id}`
          || normalizeName(item.label) === normalizeName(env.name)
        );
      });
      if (!existing) {
        upsertBacklotWorkspace(sceneCandidateToWorkspaceItem(env));
      }
    }
  }, [open, scope, tab, canEditPrivate, environmentLibrary, upsertBacklotWorkspace]);

  const handleEnterProject = useCallback(
    (id: string) => {
      void selectWorkspace(id);
      enterProject(id);
      setEditId(null);
      setQuery('');
      appendLog(`已进入私有项目素材库`);
    },
    [selectWorkspace, enterProject, appendLog],
  );

  const handleCreateProject = useCallback(
    async (title: string) => {
      const ws = await createProject({ title, visibility: 'private' });
      handleEnterProject(ws.id);
      toastSuccess(`私有项目「${title}」已创建`);
      appendLog(`已创建私有项目：${title}`);
    },
    [createProject, handleEnterProject, appendLog],
  );

  const saveCharacter = useCallback(
    (c: CharacterProfile) => {
      const next = normalizeCharacterProfile(c);
      if (scope === 'private') upsertCharacter(next);
      else publicUpsertCharacter(next);
    },
    [scope, upsertCharacter, publicUpsertCharacter],
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
              || normalizeName(env.name) === normalizeName(item.label)
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
      publicUpsertTemplate(workspaceItemToCustomTemplate(item, '公共库'));
    },
    [scope, upsertBacklotWorkspace, publicUpsertTemplate, setEnvironments],
  );

  const saveSound = useCallback(
    (s: SoundAssetProfile) => {
      if (scope === 'private') upsertSound(s);
      else publicUpsertSound(s);
    },
    [scope, upsertSound, publicUpsertSound],
  );

  const handleCreate = useCallback(() => {
    if (scope === 'private' && !canEditPrivate) return;
    if (tab === 'character') {
      const c = newCharacterProfile();
      saveCharacter(c);
      setEditId(c.id);
      return;
    }
    if (tab === 'sound') {
      const s = refreshVoicePrompts(newSoundAsset());
      saveSound(s);
      setEditId(s.id);
      return;
    }
    if (scope === 'private') {
      const item = refreshWorkspacePrompts(
        newBacklotWorkspaceItem(tab as Exclude<AssetLibraryKind, 'character' | 'sound'>),
      );
      saveWorkspaceItem(item);
      setEditId(item.id);
      return;
    }
    const tpl = workspaceItemToCustomTemplate(
      refreshWorkspacePrompts(
        newBacklotWorkspaceItem(tab as Exclude<AssetLibraryKind, 'character' | 'sound'>),
      ),
      '公共库',
    );
    publicUpsertTemplate(tpl);
    setEditId(tpl.id);
  }, [
    scope,
    canEditPrivate,
    tab,
    saveCharacter,
    saveSound,
    saveWorkspaceItem,
    publicUpsertTemplate,
  ]);

  const handleCloneBuiltin = useCallback(
    (templateId: string) => {
      if (tab === 'character' || tab === 'sound') return;
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
      saveWorkspaceItem,
      publicUpsertTemplate,
      appendLog,
    ],
  );

  const handleDelete = useCallback(
    (id: string) => {
      if (tab === 'character') {
        if (scope === 'private') removeCharacter(id);
        else publicRemoveCharacter(id);
      } else if (tab === 'sound') {
        if (scope === 'private') removeSound(id);
        else publicRemoveSound(id);
      } else if (scope === 'private') {
        if (tab === 'scene') {
          const item = workspaceItems.find((x) => x.id === id);
          if (item) {
            const env = workspaceItemToEnvironmentProfile(item);
            const current = useWorkspaceDocument.getState().environments?.environments ?? [];
            setEnvironments({
              version: 1,
              environments: current.filter(
                (e) => e.id !== env.id && normalizeName(e.name) !== normalizeName(item.label),
              ),
            });
          }
        }
        removeBacklotWorkspace(id);
      } else {
        publicRemoveTemplate(id);
      }
      if (editId === id) setEditId(null);
    },
    [
      tab,
      scope,
      editId,
      workspaceItems,
      removeCharacter,
      publicRemoveCharacter,
      removeSound,
      publicRemoveSound,
      removeBacklotWorkspace,
      publicRemoveTemplate,
      setEnvironments,
    ],
  );

  const handleUploadImage = useCallback(
    async (file: File, char: CharacterProfile) => {
      const res = await api.uploadAsset(file);
      saveCharacter({ ...char, referenceImageUrl: res.url });
    },
    [saveCharacter],
  );

  const handleUploadCharacterView = useCallback(
    async (file: File, char: CharacterProfile, view: string) => {
      const res = await api.uploadAsset(file);
      const fieldMap: Record<string, string> = {
        full: 'fullSheetUrl',
        front: 'frontViewUrl',
        threeQuarter: 'threeQuarterViewUrl',
        side: 'sideViewUrl',
        back: 'backViewUrl',
        silhouetteFront: 'silhouetteFrontUrl',
        silhouetteSide: 'silhouetteSideUrl',
        emotionalCloseup: 'emotionalCloseupUrl',
      };

      // variant uploads: expr:id / micro:id / angle:id / pose:id / costumeDetail:id / hand:id
      if (view.includes(':')) {
        const [group, id] = view.split(':');
        const creative = { ...(char.creative ?? {}) } as Record<string, unknown>;
        const groupKey =
          group === 'expr' ? 'expressions'
            : group === 'micro' ? 'microExpressions'
              : group === 'angle' ? 'angles'
                : group === 'pose' ? 'poses'
                  : group === 'costumeDetail' ? 'costumeDetails'
                    : group === 'hand' ? 'handRefs'
                      : null;
        if (!groupKey) return;
        const list = Array.isArray(creative[groupKey]) ? [...(creative[groupKey] as any[])] : [];
        const idx = list.findIndex((item) => item.id === id);
        if (idx >= 0) list[idx] = { ...list[idx], imageUrl: res.url };
        else list.push({ id, label: id, imageUrl: res.url });
        creative[groupKey] = list;
        saveCharacter({ ...char, creative: creative as CharacterProfile['creative'] });
        return;
      }

      const key = fieldMap[view] ?? 'frontViewUrl';
      saveCharacter({
        ...char,
        creative: {
          ...char.creative,
          [key]: res.url,
        },
        referenceImageUrl: view === 'front' || view === 'full' ? res.url : char.referenceImageUrl,
      });
    },
    [saveCharacter],
  );


  const findPictureGenNode = useCallback(() => {
    const nodes = runtime?.getNodes() ?? [];
    const edges = runtime?.getEdges() ?? [];
    // 1) 选中节点若连着图像生成
    const selectedId = useFlowRuntime.getState().selectedBlockId;
    if (selectedId) {
      const via = resolveConnectedPictureGenId(selectedId, nodes, edges);
      if (via) {
        const n = nodes.find((x) => x.id === via);
        if (n?.type === 'picture-gen') return n;
      }
      const self = nodes.find((x) => x.id === selectedId);
      if (self?.type === 'picture-gen') return self;
    }
    // 2) 分镜台已连接的图像节点
    for (const n of nodes) {
      if (n.type !== 'storyboard-desk') continue;
      const via = resolveConnectedPictureGenId(n.id, nodes, edges);
      if (via) {
        const pic = nodes.find((x) => x.id === via);
        if (pic?.type === 'picture-gen') return pic;
      }
    }
    // 3) 画布上第一个图像生成节点
    return nodes.find((n) => n.type === 'picture-gen');
  }, [runtime]);


  const resolveAssetGenRequest = useCallback((
    kind: 'character-sheet' | 'costume-sheet',
    pictureNode?: { data?: Record<string, unknown> } | null,
  ) => {
    const ui = kind === 'character-sheet' ? characterSheetGen : costumeSheetGen;
    const picData = (pictureNode?.data ?? {}) as Record<string, unknown>;
    // 素材库 UI 选择优先；图像节点参数仅作缺省回填
    return resolveAssetLibraryImageRequest(ui, {
      model: (picData.model as string) || undefined,
      quality: (picData.quality as string) || undefined,
      aspectRatio: (picData.aspectRatio as string) || (kind === 'character-sheet' ? '4:3' : '1:1'),
      resolutionTier: (picData.resolutionTier as string) || undefined,
      width: (picData.width as number) || undefined,
      height: (picData.height as number) || undefined,
    });
  }, [characterSheetGen, costumeSheetGen]);

  const generateCostumeSheets = useCallback(
    async (items: BacklotWorkspaceItem[]) => {
      if (scope !== 'private') {
        appendLog('服装设定板：请先导入到私有项目库再生成');
        return;
      }
      if (!canEditPrivate) {
        appendLog('服装设定板：当前项目不可编辑');
        return;
      }
      const targets = items.filter((i) => i.kind === 'costume');
      if (targets.length === 0) {
        appendLog('服装设定板：没有可生成的服装条目');
        return;
      }
      const pictureNode = findPictureGenNode();
      if (!pictureNode) {
        appendLog('服装设定板：画布上未找到「图像生成」节点。请先在画布添加「图像生成」。');
        return;
      }

      setCostumeGenBusy(true);
      setCostumeGenProgress(`0/${targets.length}`);
      appendLog(`开始生成服装设定板 · ${targets.length} 件 · 经节点 ${pictureNode.id}`);

      const { modelId, quality, aspectRatio, size, resolutionTier } = resolveAssetGenRequest('costume-sheet', pictureNode);
      appendLog(`服装设定板参数 · 模型 ${modelId} · 清晰度 ${resolutionTier} · 质量 ${quality} · 比例 ${aspectRatio} · ${size}`);

      let ok = 0;
      let fail = 0;
      for (let i = 0; i < targets.length; i++) {
        const item = targets[i];
        setCostumeGenProgress(`${i + 1}/${targets.length}`);
        try {
          const refreshed = refreshWorkspacePrompts(item);
          const prompt = buildCostumeSheetGenerationPrompt(refreshed);
          const urls = await runPictureGenJob({
            prompt,
            modelId,
            size,
            n: 1,
            resolutionTier,
          });
          const imageUrl = urls[0];
          if (!imageUrl) throw new Error('未返回图片');
          const ext = (refreshed.creative ?? {}) as Record<string, unknown>;
          saveWorkspaceItem({
            ...refreshed,
            creative: {
              ...ext,
              sheetUrl: imageUrl,
            } as BacklotWorkspaceItem['creative'],
          });
          ok += 1;
          appendLog(`服装设定板完成 · ${item.label}`);
        } catch (e) {
          fail += 1;
          appendLog(`服装设定板失败 · ${item.label}: ${String(e)}`);
        }
      }

      setCostumeGenBusy(false);
      setCostumeGenProgress(null);
      appendLog(`服装设定板批量结束 · 成功 ${ok} · 失败 ${fail}`);
      if (ok > 0) toastSuccess(`服装设定板完成 ${ok}/${targets.length}`);
    },
    [appendLog, canEditPrivate, findPictureGenNode, resolveAssetGenRequest, saveWorkspaceItem, scope],
  );

  const generateCharacterMasterSheet = useCallback(
    async (char: CharacterProfile) => {
      if (scope === 'private' && !canEditPrivate) {
        appendLog('角色设定板：当前项目不可编辑');
        return;
      }
      const pictureNode = findPictureGenNode();
      if (!pictureNode) {
        appendLog('角色设定板：画布上未找到「图像生成」节点。请先在画布添加「图像生成」。');
        return;
      }

      setCharSheetGenBusy(true);
      setCharSheetGenProgress('生成整板 0/2');
      appendLog(`开始生成角色设定板 · ${char.name || char.id}`);

      try {
        const refreshed = refreshCharacterPrompts(char);
        const prompt = buildCharacterSheetGenerationPrompt(refreshed);
        const { modelId, quality, aspectRatio, size, resolutionTier } = resolveAssetGenRequest('character-sheet', pictureNode);
        appendLog(`角色设定板参数 · 模型 ${modelId} · 清晰度 ${resolutionTier} · 质量 ${quality} · 比例 ${aspectRatio} · ${size}`);
        const refUrl =
          refreshed.creative?.fullSheetUrl
          || refreshed.referenceImageUrl
          || refreshed.creative?.frontViewUrl
          || undefined;

        setCharSheetGenProgress('生成整板 1/2');
        const urls = await runPictureGenJob({
          prompt,
          modelId,
          size,
          n: 1,
          resolutionTier,
          referenceImageUrl: refUrl || undefined,
        });
        const sheetUrl = urls[0];
        if (!sheetUrl) throw new Error('设定板未返回图片');

        setCharSheetGenProgress('裁切回填 2/2');
        const blobs = await cropCharacterSheetPanels(sheetUrl);
        const panelUrls: Record<string, string> = {};
        const entries = Object.entries(blobs);
        for (let i = 0; i < entries.length; i++) {
          const [panelId, blob] = entries[i];
          setCharSheetGenProgress(`上传裁切 ${i + 1}/${entries.length}`);
          const file = new File([blob], `char-sheet-${char.id}-${panelId}.jpg`, { type: 'image/jpeg' });
          const uploaded = await api.uploadAsset(file);
          panelUrls[panelId] = uploaded.url;
        }

        const next = applyCroppedPanelsToCharacter(refreshed, {
          panelUrls,
          fullSheetUrl: sheetUrl,
          overwrite: true,
        });
        saveCharacter(next);
        appendLog(`角色设定板完成并回填 ${Object.keys(panelUrls).length} 格 · ${char.name || char.id}`);
        toastSuccess(`设定板已回填 ${Object.keys(panelUrls).length} 个面板`);
      } catch (e) {
        appendLog(`角色设定板失败: ${String(e)}`);
      } finally {
        setCharSheetGenBusy(false);
        setCharSheetGenProgress(null);
      }
    },
    [appendLog, canEditPrivate, findPictureGenNode, resolveAssetGenRequest, saveCharacter, scope],
  );

  const handleUploadWorkspaceMedia = useCallback(
    async (file: File, item: BacklotWorkspaceItem, field: string) => {
      const res = await api.uploadAsset(file);
      const creative = { ...(item.creative as Record<string, unknown>) };
      if (field === 'referenceUrls') {
        const prev = Array.isArray(creative.referenceUrls)
          ? (creative.referenceUrls.filter(Boolean) as string[])
          : [];
        if (prev.includes(res.url)) {
          appendLog('参考图已存在，跳过重复上传');
          return;
        }
        if (prev.length >= MAX_ENV_REFERENCE_IMAGES) {
          appendLog(`参考图已达上限 ${MAX_ENV_REFERENCE_IMAGES} 张`);
          return;
        }
        creative.referenceUrls = [...prev, res.url];
      } else {
        creative[field] = res.url;
      }
      saveWorkspaceItem({ ...item, creative: creative as BacklotWorkspaceItem['creative'] });
    },
    [appendLog, saveWorkspaceItem],
  );

  const handleRemoveSceneRef = useCallback(
    (item: BacklotWorkspaceItem, index: number) => {
      const creative = getSceneCreative(item);
      const refs = [...(creative.referenceUrls ?? [])];
      if (index < 0 || index >= refs.length) return;
      refs.splice(index, 1);
      saveWorkspaceItem({
        ...item,
        creative: { ...creative, referenceUrls: refs } as BacklotWorkspaceItem['creative'],
      });
    },
    [saveWorkspaceItem],
  );

  const handleUploadAudio = useCallback(
    async (file: File, target: { kind: 'character' | 'sound'; id: string }) => {
      const res = await api.uploadAsset(file);
      if (target.kind === 'character') {
        const c = (scope === 'private' ? characters : publicCharacters).find((x) => x.id === target.id);
        if (!c) return;
        saveCharacter({ ...c, referenceAudioUrl: res.url });
      } else {
        const s = (scope === 'private' ? sounds : publicSounds).find((x) => x.id === target.id);
        if (!s) return;
        saveSound({ ...s, audioUrl: res.url });
      }
    },
    [scope, characters, publicCharacters, sounds, publicSounds, saveCharacter, saveSound],
  );

  const promoteToPublic = useCallback(() => {
    if (!selectedWorkspaceItem || scope !== 'private') return;
    const tpl = workspaceItemToCustomTemplate(selectedWorkspaceItem, '公共库');
    publicUpsertTemplate(tpl);
    toastSuccess('已复制到公共素材库');
  }, [selectedWorkspaceItem, scope, publicUpsertTemplate]);

  const handleScopeChange = useCallback(
    (next: AssetScope) => {
      setScope(next);
      setEditId(null);
      setQuery('');
    },
    [setScope],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        aria-label="关闭素材库"
        onClick={() => setOpen(false)}
      />
      <div className="relative w-[min(960px,96vw)] h-[min(720px,90vh)] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-line">
        <header className="shrink-0 h-14 border-b border-line flex items-center px-5 gap-3">
          {scope === 'private' && view === 'assets' && (
            <button
              type="button"
              onClick={() => {
                backToProjects();
                setEditId(null);
                setQuery('');
              }}
              className="p-1.5 rounded-lg hover:bg-surface text-ink/50"
              title="返回项目列表"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <Layers size={20} className="text-brand shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-base text-ink">素材库</h2>
            <p className="text-[11px] text-ink/40 truncate">
              {scope === 'private'
                ? view === 'projects'
                  ? '项目私有 · 选择项目'
                  : `项目私有 · ${selectedProject?.title ?? '…'}`
                : '公共素材 · 全项目可用'}
            </p>
          </div>
          <div className="flex rounded-xl border border-line p-0.5 bg-surface">
            <button
              type="button"
              onClick={() => handleScopeChange('private')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                scope === 'private' ? 'bg-white shadow-sm text-brand' : 'text-ink/50'
              }`}
            >
              <FolderLock size={14} />
              项目私有
            </button>
            <button
              type="button"
              onClick={() => handleScopeChange('public')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                scope === 'public' ? 'bg-white shadow-sm text-brand' : 'text-ink/50'
              }`}
            >
              <Globe2 size={14} />
              公共
            </button>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-2 rounded-lg hover:bg-surface text-ink/50"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex flex-1 min-h-0 flex-col">
          {scope === 'private' && view === 'projects' ? (
            <PrivateProjectList
              projects={privateProjects}
              activeDocId={activeId}
              loading={catalogLoading}
              onSelect={handleEnterProject}
              onCreate={handleCreateProject}
            />
          ) : (
            <>
              <div className="shrink-0 flex gap-1 px-4 py-2 border-b border-line overflow-x-auto nx9-scroll">
                {ASSET_LIBRARY_TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => {
                      setTab(t.key);
                      setEditId(null);
                    }}
                    className={`shrink-0 text-xs px-3 py-1.5 rounded-full border ${
                      tab === t.key
                        ? 'bg-brand/10 border-brand/40 text-brand font-medium'
                        : 'border-line text-ink/60 hover:border-brand/20'
                    }`}
                    title={t.hint}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <AssetHealthPanel
                tab={tab}
                characters={characters}
                workspaceItems={workspaceItems}
                storyboard={storyboard}
              />

              {!canEditPrivate ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <FolderLock size={36} className="text-brand/50 mb-3" />
                  <p className="text-sm text-ink/55">正在加载项目素材…</p>
                </div>
              ) : (
                <>
                  <div className="shrink-0 px-4 py-2 border-b border-line flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search
                        size={14}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/30"
                      />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={`搜索${ASSET_LIBRARY_TABS.find((t) => t.key === tab)?.label ?? ''}…`}
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-line"
                      />
                    </div>
                    <span className="text-[10px] text-ink/40 shrink-0">{filtered.length} 项</span>
                    {tab === 'costume' && scope === 'private' && canEditPrivate && (
                      <button
                        type="button"
                        disabled={costumeGenBusy || workspaceItems.filter((i) => i.kind === 'costume').length === 0}
                        onClick={() => void generateCostumeSheets(workspaceItems.filter((i) => i.kind === 'costume'))}
                        className="shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-brand/30 bg-brand/5 text-brand disabled:opacity-45"
                        title="批量生成当前私有库全部服装设定板（需画布有图像生成节点）"
                      >
                        {costumeGenBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        {costumeGenBusy ? (costumeGenProgress || '生成中') : '批量设定板'}
                      </button>
                    )}
                    {canCreateAsset && (
                      <button
                        type="button"
                        onClick={handleCreate}
                        className="shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-brand text-white"
                      >
                        <Plus size={14} />
                        {tabMeta.newLabel}
                      </button>
                    )}
                  </div>

                  {costumeGenBusy ? (
                    <div className="shrink-0 px-4 py-1.5 text-[11px] text-brand bg-brand/5 border-b border-brand/15">
                      服装设定板生成中 {costumeGenProgress || ''} · 请保持画布图像生成节点可用
                    </div>
                  ) : null}
                  {charSheetGenBusy ? (
                    <div className="shrink-0 px-4 py-1.5 text-[11px] text-brand bg-brand/5 border-b border-brand/15">
                      角色设定板生成/裁切中 {charSheetGenProgress || ''} · 完成后自动回填各参考格
                    </div>
                  ) : null}

                  <div className="flex-1 flex min-h-0">
                    <ul className="w-52 shrink-0 border-r border-line overflow-y-auto nx9-scroll p-2 space-y-0.5">
                      {filtered.length === 0 && (
                        <li className="text-[11px] text-ink/40 p-3 text-center">{tabMeta.emptyHint}</li>
                      )}
                      {filtered.map((item) => (
                        <li key={item.id} className="group relative">
                          <button
                            type="button"
                            onClick={() => setEditId(item.id)}
                            className={`w-full text-left text-xs px-2.5 py-2 rounded-lg truncate pr-8 ${
                              editId === item.id
                                ? 'bg-brand/10 text-brand'
                                : 'hover:bg-surface text-ink/80'
                            }`}
                          >
                            {item.builtin && (
                              <span className="text-[9px] text-ink/30 mr-1">内置</span>
                            )}
                            {item.label}
                          </button>
                          {item.builtin ? (
                            <button
                              type="button"
                              title="导入到当前库并编辑"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCloneBuiltin(item.id);
                              }}
                              className="absolute right-1 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] text-brand/80 hover:bg-brand/10 opacity-0 group-hover:opacity-100"
                            >
                              导入
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDelete(item.id)}
                              className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded text-ink/30 hover:text-red-600 opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>

                    <div className="flex-1 overflow-y-auto nx9-scroll p-4">
                      {!editId && (
                        <p className="text-sm text-ink/40 text-center mt-12">选择或新建素材进行编辑</p>
                      )}

                      {tab === 'character' && selectedChar && (
                        <CharacterDetailFields
                          character={selectedChar}
                          onChange={saveCharacter}
                          onRefreshPrompts={() => saveCharacter(refreshCharacterPrompts(selectedChar))}
                          onUploadImage={(f) => void handleUploadImage(f, selectedChar)}
                          onUploadAudio={(f) => void handleUploadAudio(f, { kind: 'character', id: selectedChar.id })}
                          onUploadView={(view, f) => void handleUploadCharacterView(f, selectedChar, view)}
                          costumeOptions={costumeBindOptions}
                          generatingMasterSheet={charSheetGenBusy}
                          masterSheetProgress={charSheetGenProgress}
                          onGenerateMasterSheet={() => void generateCharacterMasterSheet(selectedChar)}
                          genSettingsSlot={(
                            <AssetLibraryGenSettings
                              preset="character-sheet"
                              value={characterSheetGen}
                              onChange={setCharacterSheetGen}
                              hint="与图像生成节点同级：模型 / 清晰度 / 质量 / 比例"
                            />
                          )}
                        />
                      )}

                      {tab === 'sound' && selectedSound && (
                        <VoiceDetailFields
                          sound={selectedSound}
                          onChange={saveSound}
                          onRefreshPrompts={() => saveSound(refreshVoicePrompts(selectedSound))}
                          onUploadAudio={(f) => void handleUploadAudio(f, { kind: 'sound', id: selectedSound.id })}
                        />
                      )}

                      {tab === 'scene' && selectedWorkspaceItem && (
                        <SceneDetailFields
                          item={selectedWorkspaceItem}
                          onChange={saveWorkspaceItem}
                          onRefreshPrompts={() => saveWorkspaceItem(refreshWorkspacePrompts(selectedWorkspaceItem))}
                          onUploadRef={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'referenceUrls')}
                          onUploadSheet={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'sheetUrl')}
                          onRemoveRef={(idx) => handleRemoveSceneRef(selectedWorkspaceItem, idx)}
                        />
                      )}

                      {tab === 'costume' && selectedWorkspaceItem && scope === 'public' && selectedWorkspaceItem.sourceTemplateId === selectedWorkspaceItem.id && (
                        <div className="mb-3 rounded-xl border border-brand/20 bg-brand/5 px-3 py-2 text-[11px] text-ink/70">
                          当前为模板预览。点击左侧「导入」复制到可编辑库后再改字段与参考图。
                          <button
                            type="button"
                            className="ml-2 text-brand hover:underline"
                            onClick={() => handleCloneBuiltin(selectedWorkspaceItem.id)}
                          >
                            立即导入
                          </button>
                        </div>
                      )}
                      {tab === 'costume' && selectedWorkspaceItem && (
                        <CostumeDetailFields
                          item={selectedWorkspaceItem}
                          onChange={saveWorkspaceItem}
                          onRefreshPrompts={() => saveWorkspaceItem(refreshWorkspacePrompts(selectedWorkspaceItem))}
                          onUploadRef={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'referenceUrls')}
                          onUploadSheet={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'sheetUrl')}
                          generatingSheet={costumeGenBusy}
                          genSettingsSlot={(
                            <AssetLibraryGenSettings
                              preset="costume-sheet"
                              value={costumeSheetGen}
                              onChange={setCostumeSheetGen}
                              hint="与图像生成节点同级：模型 / 清晰度 / 质量 / 比例；批量设定板共用此参数"
                            />
                          )}
                          onGenerateSheet={
                            scope === 'private' && canEditPrivate
                              ? () => {
                                  // 内置/公共预览：先导入再生成
                                  const isPreviewOnly = Boolean(
                                    selectedWorkspaceItem.sourceTemplateId
                                    && selectedWorkspaceItem.sourceTemplateId === selectedWorkspaceItem.id
                                    && !workspaceItems.some((w) => w.id === selectedWorkspaceItem.id),
                                  );
                                  if (isPreviewOnly) {
                                    handleCloneBuiltin(selectedWorkspaceItem.id);
                                    appendLog('已导入服装模板，请在导入后的条目上再次点击生成设定板');
                                    return;
                                  }
                                  void generateCostumeSheets([selectedWorkspaceItem]);
                                }
                              : undefined
                          }
                        />
                      )}

                      {tab === 'shot' && selectedWorkspaceItem && (
                        <ShotDetailFields
                          item={selectedWorkspaceItem}
                          onChange={saveWorkspaceItem}
                          onRefreshPrompts={() => saveWorkspaceItem(refreshWorkspacePrompts(selectedWorkspaceItem))}
                          onUploadGif={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'gifUrl')}
                          onUploadExample={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'exampleImageUrl')}
                        />
                      )}

                      {tab === 'emotion' && selectedWorkspaceItem && (
                        <EmotionDetailFields
                          item={selectedWorkspaceItem}
                          onChange={saveWorkspaceItem}
                          onRefreshPrompts={() => saveWorkspaceItem(refreshWorkspacePrompts(selectedWorkspaceItem))}
                          onUploadImage={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'imageUrl')}
                        />
                      )}

                      {tab === 'hook' && selectedWorkspaceItem && (
                        <HookDetailFields
                          item={selectedWorkspaceItem}
                          onChange={saveWorkspaceItem}
                          onRefreshPrompts={() => saveWorkspaceItem(refreshWorkspacePrompts(selectedWorkspaceItem))}
                        />
                      )}

                      {scope === 'private' && selectedWorkspaceItem && tab !== 'character' && tab !== 'sound' && (
                        <button
                          type="button"
                          onClick={promoteToPublic}
                          className="mt-4 text-xs text-accent hover:underline"
                        >
                          复制到公共库
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}


