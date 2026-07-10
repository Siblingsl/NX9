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
  isPrivateWorkspace,
  newBacklotWorkspaceItem,
  newCharacterProfile,
  newSoundAsset,
  normalizeCharacterProfile,
  refreshCharacterPrompts,
  refreshVoicePrompts,
  refreshWorkspacePrompts,
  workspaceItemToCustomTemplate,
} from '@nx9/shared';
import {
  ArrowLeft,
  Globe2,
  FolderLock,
  Layers,
  Plus,
  Search,
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
import { PrivateProjectList } from './PrivateProjectList';
import {
  CharacterDetailFields,
  SceneDetailFields,
  ShotDetailFields,
  EmotionDetailFields,
  HookDetailFields,
  VoiceDetailFields,
} from './asset-library/AssetDetailFields';

const KIND_META: Record<
  AssetLibraryKind,
  { newLabel: string; emptyHint: string; promptPlaceholder: string }
> = {
  character: {
    newLabel: '新建角色',
    emptyHint: '创建角色用于一致性注入与 @角色 引用',
    promptPlaceholder: '一致性 prompt…',
  },
  scene: {
    newLabel: '新建场景',
    emptyHint: '场景描述，可在节点中 @场景 引用',
    promptPlaceholder: '环境、光线、空间描述…',
  },
  shot: {
    newLabel: '新建镜头',
    emptyHint: '运镜与机位描述，可在节点中 @镜头 引用',
    promptPlaceholder: '运镜、景别、机位描述…',
  },
  emotion: {
    newLabel: '新建情绪',
    emptyHint: '表情与氛围描述，可在节点中 @情绪 引用',
    promptPlaceholder: '表情、氛围、色调描述…',
  },
  hook: {
    newLabel: '新建钩子',
    emptyHint: '开场或结尾钩子，可在节点中 @钩子 引用',
    promptPlaceholder: '钩子文案…',
  },
  sound: {
    newLabel: '新建声音',
    emptyHint: '参考音频、配音样本，可在节点中 @声音 引用',
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
  const characters = useWorkspaceDocument((s) => s.characters.characters);
  const sounds = useWorkspaceDocument((s) => s.soundLibrary.sounds);
  const workspaceItems = useWorkspaceDocument((s) => s.backlotWorkspace.items);

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
    const tpl = publicTemplates.find((t) => t.id === editId && t.kind === tab);
    if (!tpl || tpl.kind === 'character') return undefined;
    return {
      id: tpl.id,
      kind: tpl.kind,
      label: tpl.label,
      promptEn: tpl.promptEn,
      promptZh: tpl.promptZh,
      hookPhase: tpl.hookPhase,
      creative: tpl.creative,
    };
  }, [tab, scope, workspaceItems, publicTemplates, editId]);

  const tabMeta = KIND_META[tab];
  const canEditPrivate =
    scope !== 'private' || (Boolean(selectedProjectId) && activeId === selectedProjectId);

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
        upsertBacklotWorkspace(item);
        return;
      }
      publicUpsertTemplate(workspaceItemToCustomTemplate(item, '公共库'));
    },
    [scope, upsertBacklotWorkspace, publicUpsertTemplate],
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

  const handleDelete = useCallback(
    (id: string) => {
      if (tab === 'character') {
        if (scope === 'private') removeCharacter(id);
        else publicRemoveCharacter(id);
      } else if (tab === 'sound') {
        if (scope === 'private') removeSound(id);
        else publicRemoveSound(id);
      } else if (scope === 'private') {
        removeBacklotWorkspace(id);
      } else {
        publicRemoveTemplate(id);
      }
      if (editId === id) setEditId(null);
    },
    [
      tab,
      scope,
      removeCharacter,
      publicRemoveCharacter,
      removeSound,
      publicRemoveSound,
      removeBacklotWorkspace,
      publicRemoveTemplate,
      editId,
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
    async (file: File, char: CharacterProfile, view: 'full' | 'front' | 'side' | 'back') => {
      const res = await api.uploadAsset(file);
      const key =
        view === 'full'
          ? 'fullSheetUrl'
          : view === 'front'
            ? 'frontViewUrl'
            : view === 'side'
              ? 'sideViewUrl'
              : 'backViewUrl';
      saveCharacter({
        ...char,
        creative: {
          ...char.creative,
          [key]: res.url,
        },
        referenceImageUrl: view === 'front' ? res.url : char.referenceImageUrl,
      });
    },
    [saveCharacter],
  );

  const handleUploadWorkspaceMedia = useCallback(
    async (file: File, item: BacklotWorkspaceItem, field: string) => {
      const res = await api.uploadAsset(file);
      const creative = { ...(item.creative as Record<string, unknown>), [field]: res.url };
      if (field === 'referenceUrls') {
        creative.referenceUrls = [res.url];
      }
      saveWorkspaceItem({ ...item, creative: creative as BacklotWorkspaceItem['creative'] });
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
                    {!items.some((i) => i.builtin) && (
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
                          {!item.builtin && (
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
