import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BlockDefinition } from '@nx9/shared';
import { isPrivateWorkspace } from '@nx9/shared';
import { SettingsModal } from '../panels/SettingsModal';
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
import { useFlowRuntime, useRemotionUi } from '../stores/flow-runtime';
import { useExecutionQueue } from '../stores/execution-queue';
import { useAssetLibraryModalUi } from '../stores/asset-library-modal-ui';
import { useCreateWorkspaceDialogUi } from '../stores/create-workspace-dialog-ui';
import { useSkillVault } from '../stores/skill-vault';
import { isSurfaceEnabled } from '../config/product-surface';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { useAppSurface } from '../stores/app-surface';
import { HomeNavPage } from '../pages/HomeNavPage';
import { ProductionStudioPage } from '../pages/ProductionStudioPage';
import { CanvasStageShell } from './canvas-stage/CanvasStageShell';

const StageDeckSurface = lazy(() =>
  import('../engine/stage-deck/StageDeckSurface').then((m) => ({ default: m.StageDeckSurface })),
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

export default function AppShell() {
  const surface = useAppSurface((s) => s.surface);
  const goHome = useAppSurface((s) => s.goHome);
  const goStudio = useAppSurface((s) => s.goStudio);
  const {
    activeId,
    fetchAll,
    create,
    closeWorkspace,
    selectWorkspace,
    reloadToken,
  } = useWorkspaceCatalog();
  const toggleSettings = useCredentialVault((s) => s.toggleSettings);
  const toggleSkills = useSkillVault((s) => s.toggleDrawer);
  const requestSpawn = useFlowCommands((s) => s.requestSpawn);
  const runtime = useFlowRuntime((s) => s.runtime);
  const batchPhase = useExecutionQueue((s) => s.phase);
  const batchProgress = useExecutionQueue((s) => s.progress);
  const batchTaskId = useExecutionQueue((s) => s.taskId);
  useTaskStream(batchTaskId);
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
  const bootstrapped = useRef(false);
  const userBootstrapped = useRef(false);
  const canvasTheme = useWorkspaceDocument((s) => s.canvasAppearance.theme);
  const requestBootstrapCorePipeline = useFlowCommands((s) => s.requestBootstrapCorePipeline);

  useEffect(() => {
    document.body.classList.toggle('nx9-app-dark-body', canvasTheme === 'dark');
    return () => document.body.classList.remove('nx9-app-dark-body');
  }, [canvasTheme]);

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
        await create({ title: '我的第一部剧', visibility: 'private' });
      }
    })();
  }, [fetchAll, create]);

  const onPickBlock = useCallback(
    (def: BlockDefinition) => {
      requestSpawn(def.kind);
      appendLog(`添加工具: ${def.label}`);
    },
    [requestSpawn, appendLog],
  );

  useEffect(() => {
    if (reloadToken > 0) setFlowKey((k) => k + 1);
  }, [reloadToken]);

  const handleCreatePrivate = useCallback(
    async (title: string, opts?: { bootstrapCorePipeline?: boolean }) => {
      setCreateSubmitting(true);
      try {
        if (opts?.bootstrapCorePipeline) {
          requestBootstrapCorePipeline();
        }
        await create({ title, visibility: 'private' });
        closeCreateDialog();
        if (opts?.bootstrapCorePipeline) {
          toastSuccess(`「${title}」已创建；可在制作台做剧，或打开高级画布查看流程`);
          appendLog(`已创建项目：${title}（含核心流程登记）`);
          goStudio();
        } else {
          toastSuccess(`项目「${title}」已创建`);
          appendLog(`已创建私有项目：${title}`);
          goStudio();
        }
      } catch (e) {
        const msg = String(e);
        appendLog(`创建私有项目失败: ${msg}`);
        toastError('创建私有项目失败，请确认后端服务已启动');
        throw e;
      } finally {
        setCreateSubmitting(false);
      }
    },
    [create, closeCreateDialog, appendLog, requestBootstrapCorePipeline, goStudio],
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

  const isCanvas = surface === 'canvas';
  const isStudio = surface === 'studio';
  const isHome = surface === 'home';

  return (
    <div className={`h-full flex flex-col ${canvasTheme === 'dark' ? 'nx9-app-dark' : ''}`}>
      <div className="flex-1 flex min-h-0">
        <main className="flex-1 min-w-0 bg-surface relative flex flex-col">
          {isHome && <HomeNavPage />}

          {isStudio && <ProductionStudioPage />}

          {isCanvas &&
            (activeId ? (
              <CanvasStageShell
                projects={railItems}
                activeProjectId={activeId}
                batchRunning={batchPhase === 'running'}
                batchProgress={batchProgress}
                canUndo={runtime?.canUndo ?? false}
                canRedo={runtime?.canRedo ?? false}
                user={user}
                onGoHome={goHome}
                onGoStudio={goStudio}
                onSelectProject={(id) => void selectWorkspace(id)}
                onCreateProject={openCreateDialog}
                onPickBlock={onPickBlock}
                onUndo={() => runtime?.undo()}
                onRedo={() => runtime?.redo()}
                onBatchRun={() => void handleBatchRun()}
                onOpenAssets={() => toggleAssetLibModal()}
                onOpenSettings={() => toggleSettings(true)}
                onOpenHistory={() => setHistoryOpen(true)}
              >
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center h-full text-white/50 text-sm">
                      正在打开舞台…
                    </div>
                  }
                >
                  <StageDeckSurface key={`${activeId}-${flowKey}`} workspaceId={activeId} />
                </Suspense>
              </CanvasStageShell>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-ink/50 flex-1 gap-2 px-6 text-center">
                <p className="text-sm font-medium text-ink/70">选择或新建项目后再打开画布</p>
                <button
                  type="button"
                  onClick={goHome}
                  className="text-xs text-brand hover:underline"
                >
                  返回导航
                </button>
              </div>
            ))}

          <Suspense fallback={null}>
            {isSurfaceEnabled('assetLibraryModal') && <AssetLibraryModal />}
            <CreateWorkspaceDialog
              open={createDialogOpen}
              onClose={closeCreateDialog}
              onConfirm={handleCreatePrivate}
              submitting={createSubmitting}
              defaultTitle={`项目 ${railItems.length + 1}`}
              defaultBootstrapCore
            />
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

      {isSurfaceEnabled('settings') && <SettingsModal />}
      <Suspense fallback={null}>
        {isSurfaceEnabled('skillsDrawer') && <SkillsDrawer />}
        <Director3dPanel />
        {isCanvas && isSurfaceEnabled('stageDeckTour') && <StageDeckTour />}
      </Suspense>
      {isCanvas && isSurfaceEnabled('logPanel') && <LogPanel />}
      <ToastHost />
    </div>
  );
}
