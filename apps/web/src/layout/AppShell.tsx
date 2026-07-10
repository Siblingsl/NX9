import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BlockDefinition } from '@nx9/shared';
import { isPrivateWorkspace } from '@nx9/shared';
import { ModuleDock } from '../engine/stage-deck/chrome/ModuleDock';
import { ContextRail } from '../engine/stage-deck/chrome/ContextRail';
import { useContextRailUi } from '../engine/stage-deck/stores/context-rail-ui';
import { StudioTopBar } from './StudioTopBar';
import { WorkspaceRail } from '../panels/WorkspaceRail';
import { SettingsDrawer } from '../panels/SettingsDrawer';
import { ShortcutsModal } from '../panels/ShortcutsModal';
import { LogPanel } from '../panels/LogPanel';
import { ToastHost } from '../components/ToastHost';
import { toastSuccess, toastError } from '../stores/toast';
import { useUserSession } from '../stores/user-session';
import { useTaskStream } from '../hooks/use-task-stream';
import { useWorkspaceCatalog } from '../stores/workspace-catalog';
import { useCredentialVault } from '../stores/credential-vault';
import { useActivityLog } from '../stores/activity-log';
import { useFlowCommands } from '../stores/flow-commands';
import { useFlowRuntime, useStoryboardUi, useRemotionUi } from '../stores/flow-runtime';
import { useExecutionQueue } from '../stores/execution-queue';
import { useDirector3dUi } from '../stores/director3d-ui';
import { useAssetLibraryModalUi } from '../stores/asset-library-modal-ui';
import { useCreateWorkspaceDialogUi } from '../stores/create-workspace-dialog-ui';
import { useSkillVault } from '../stores/skill-vault';
import { isSurfaceEnabled } from '../config/product-surface';

const StageDeckSurface = lazy(() =>
  import('../engine/stage-deck/StageDeckSurface').then((m) => ({ default: m.StageDeckSurface })),
);

const StoryboardPanel = lazy(() =>
  import('../panels/StoryboardPanel').then((m) => ({ default: m.StoryboardPanel })),
);
const AssetLibraryModal = lazy(() =>
  import('../panels/AssetLibraryModal').then((m) => ({ default: m.AssetLibraryModal })),
);
const CreateWorkspaceDialog = lazy(() =>
  import('../panels/CreateWorkspaceDialog').then((m) => ({ default: m.CreateWorkspaceDialog })),
);
const EpisodeStudioPanel = lazy(() =>
  import('../panels/EpisodeStudioPanel').then((m) => ({ default: m.EpisodeStudioPanel })),
);
const UsagePanel = lazy(() =>
  import('../panels/UsagePanel').then((m) => ({ default: m.UsagePanel })),
);
const GenerationHistoryPanel = lazy(() =>
  import('../panels/GenerationHistoryPanel').then((m) => ({ default: m.GenerationHistoryPanel })),
);
const Director3dPanel = lazy(() =>
  import('../panels/Director3dPanel').then((m) => ({ default: m.Director3dPanel })),
);
const SkillsDrawer = lazy(() =>
  import('../panels/SkillsDrawer').then((m) => ({ default: m.SkillsDrawer })),
);
const StageDeckTour = lazy(() =>
  import('../engine/stage-deck/chrome/StageDeckTour').then((m) => ({ default: m.StageDeckTour })),
);
const ProductionProgressWall = lazy(() =>
  import('../components/ProductionProgressWall').then((m) => ({ default: m.ProductionProgressWall })),
);

export default function AppShell() {
  const {
    activeId,
    fetchAll,
    create,
    rename,
    closeWorkspace,
    selectWorkspace,
    reloadToken,
  } = useWorkspaceCatalog();
  const toggleSettings = useCredentialVault((s) => s.toggleSettings);
  const toggleSkills = useSkillVault((s) => s.toggleDrawer);
  const requestSpawn = useFlowCommands((s) => s.requestSpawn);
  const runtime = useFlowRuntime((s) => s.runtime);
  const selectedBlockId = useFlowRuntime((s) => s.selectedBlockId);
  const toggleStoryboard = useStoryboardUi((s) => s.toggle);
  const storyboardOpen = useStoryboardUi((s) => s.open);
  const batchPhase = useExecutionQueue((s) => s.phase);
  const batchProgress = useExecutionQueue((s) => s.progress);
  const batchTaskId = useExecutionQueue((s) => s.taskId);
  const batchTask = useTaskStream(batchTaskId);
  const appendLog = useActivityLog((s) => s.append);
  const [flowKey, setFlowKey] = useState(0);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const assetLibModalOpen = useAssetLibraryModalUi((s) => s.open);
  const toggleAssetLibModal = useAssetLibraryModalUi((s) => s.toggle);
  const createDialogOpen = useCreateWorkspaceDialogUi((s) => s.open);
  const openCreateDialog = useCreateWorkspaceDialogUi((s) => s.openDialog);
  const closeCreateDialog = useCreateWorkspaceDialogUi((s) => s.closeDialog);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const remotionOpen = useRemotionUi((s) => s.open);
  const setRemotionOpen = useRemotionUi((s) => s.setOpen);
  const [usageOpen, setUsageOpen] = useState(false);
  const bootstrapUser = useUserSession((s) => s.bootstrap);
  const user = useUserSession((s) => s.user);
  const users = useUserSession((s) => s.users);
  const setUser = useUserSession((s) => s.setUser);
  const createUser = useUserSession((s) => s.createUser);
  const bootstrapped = useRef(false);
  const userBootstrapped = useRef(false);
  const requestRailTab = useContextRailUi((s) => s.requestTab);
  const openDirector3d = useDirector3dUi((s) => s.openStandalone);

  useEffect(() => {
    if (userBootstrapped.current) return;
    userBootstrapped.current = true;
    void bootstrapUser();
  }, [bootstrapUser]);

  useEffect(() => {
    void (async () => {
      await fetchAll();
      const current = useWorkspaceCatalog.getState().items;
      if (current.length === 0 && !bootstrapped.current) {
        bootstrapped.current = true;
        await create({ title: '默认工作区', visibility: 'private' });
      }
    })();
  }, [fetchAll, create]);

  const onPickBlock = useCallback(
    (def: BlockDefinition) => {
      requestSpawn(def.kind);
      appendLog(`从模块库选择: ${def.label}`);
    },
    [requestSpawn, appendLog],
  );

  useEffect(() => {
    if (reloadToken > 0) setFlowKey((k) => k + 1);
  }, [reloadToken]);

  const handleCreatePrivate = useCallback(
    async (title: string) => {
      setCreateSubmitting(true);
      try {
        await create({ title, visibility: 'private' });
        closeCreateDialog();
        toastSuccess(`私有项目「${title}」已创建`);
        appendLog(`已创建私有项目：${title}`);
      } catch (e) {
        const msg = String(e);
        appendLog(`创建私有项目失败: ${msg}`);
        toastError('创建私有项目失败，请确认后端服务已启动');
        throw e;
      } finally {
        setCreateSubmitting(false);
      }
    },
    [create, closeCreateDialog, appendLog],
  );

  const handleSelectWorkspace = useCallback(
    (id: string) => {
      void selectWorkspace(id);
    },
    [selectWorkspace],
  );

  const catalogItems = useWorkspaceCatalog((s) => s.items);
  const openWorkspaceIds = useWorkspaceCatalog((s) => s.openIds);
  const railItems = useMemo(
    () =>
      catalogItems.filter(
        (w) => isPrivateWorkspace(w) && openWorkspaceIds.includes(w.id),
      ),
    [catalogItems, openWorkspaceIds],
  );

  const handleBatchRun = useCallback(async () => {
    if (!runtime) {
      appendLog('画布尚未就绪');
      return;
    }
    await runtime.runBatch();
  }, [runtime, appendLog]);

  useEffect(() => {
    if (!isSurfaceEnabled('shortcuts')) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="h-full flex flex-col">
      <StudioTopBar
        batchPhase={batchPhase}
        batchProgress={batchProgress}
        batchTaskProgress={batchTask?.progress}
        storyboardOpen={storyboardOpen}
        canUndo={runtime?.canUndo ?? false}
        canRedo={runtime?.canRedo ?? false}
        user={user}
        users={users}
        remotionOpen={remotionOpen}
        usageOpen={usageOpen}
        assetLibOpen={assetLibModalOpen}
        onUndo={() => runtime?.undo()}
        onRedo={() => runtime?.redo()}
        onToggleStoryboard={() => {
          requestRailTab('storyboard');
          toggleStoryboard();
        }}
        onOpenDirector3d={() => openDirector3d()}
        onBatchRun={() => void handleBatchRun()}
        onSetUser={setUser}
        onCreateUser={(name) => void createUser(name)}
        onToggleRemotion={() => {
          setRemotionOpen(!remotionOpen);
          setUsageOpen(false);
        }}
        onToggleUsage={() => {
          setUsageOpen((v) => !v);
          setRemotionOpen(false);
        }}
        onOpenWorkflowTemplates={() => requestRailTab('library', { librarySub: 'workflow' })}
        onOpenHistory={() => requestRailTab('library', { librarySub: 'history' })}
        onToggleAssetLib={() => toggleAssetLibModal()}
        onOpenSkills={() => toggleSkills(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenSettings={() => toggleSettings(true)}
      />

      {isSurfaceEnabled('productionProgressWall') && (
        <Suspense fallback={null}>
          <ProductionProgressWall />
        </Suspense>
      )}

      {isSurfaceEnabled('workspaceRail') && (
        <WorkspaceRail
          items={railItems}
          activeId={activeId}
          onSelect={handleSelectWorkspace}
          onCreate={openCreateDialog}
          onRename={(id, title) => void rename(id, title)}
          onClose={(id) => void closeWorkspace(id)}
        />
      )}

      <div className="flex-1 flex min-h-0">
        {isSurfaceEnabled('moduleDock') && <ModuleDock onPick={onPickBlock} />}

        <main className="flex-1 min-w-0 bg-surface relative flex">
          {activeId ? (
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full text-ink/50 text-sm flex-1">
                  加载流程画布…
                </div>
              }
            >
              <div className="flex-1 min-w-0 flex">
                <div className="flex-1 min-w-0">
                  <StageDeckSurface key={`${activeId}-${flowKey}`} workspaceId={activeId} />
                </div>
                {isSurfaceEnabled('inspectorRail') && <ContextRail selectedBlockId={selectedBlockId} />}
              </div>
            </Suspense>
          ) : (
            <div className="flex items-center justify-center h-full text-ink/50 flex-1">
              选择或创建工作区
            </div>
          )}

      <Suspense fallback={null}>
        {isSurfaceEnabled('assetLibraryModal') && <AssetLibraryModal />}
        <CreateWorkspaceDialog
          open={createDialogOpen}
          onClose={closeCreateDialog}
          onConfirm={handleCreatePrivate}
          submitting={createSubmitting}
          defaultTitle={`私有项目 ${railItems.length + 1}`}
        />
        {isSurfaceEnabled('storyboard') && <StoryboardPanel />}
            {isSurfaceEnabled('generationHistory') && (
              <GenerationHistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />
            )}
            {isSurfaceEnabled('episodeStudio') && (
              <EpisodeStudioPanel open={remotionOpen} onClose={() => setRemotionOpen(false)} />
            )}
            {isSurfaceEnabled('usageTracking') && (
              <UsagePanel open={usageOpen} onClose={() => setUsageOpen(false)} />
            )}
          </Suspense>
        </main>
      </div>

      {isSurfaceEnabled('shortcuts') && (
        <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      )}

      {isSurfaceEnabled('settings') && <SettingsDrawer />}
      <Suspense fallback={null}>
        {isSurfaceEnabled('skillsDrawer') && <SkillsDrawer />}
        {isSurfaceEnabled('director3d') && <Director3dPanel />}
        {isSurfaceEnabled('stageDeckTour') && <StageDeckTour />}
      </Suspense>
      {isSurfaceEnabled('logPanel') && <LogPanel />}
      <ToastHost />
    </div>
  );
}
