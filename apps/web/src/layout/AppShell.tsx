import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BlockDefinition } from '@nx9/shared';
import { isPrivateWorkspace } from '@nx9/shared';
import { SettingsModal } from '../panels/SettingsModal';
import { ShortcutsModal } from '../panels/ShortcutsModal';
import { LogPanel } from '../panels/LogPanel';
import { ToastHost } from '../components/ToastHost';
import { ConfirmHost } from '../components/ConfirmHost';
import { toastSuccess, toastError } from '../stores/toast';
import { useUserSession } from '../stores/user-session';
import { useTaskStream } from '../hooks/use-task-stream';
import { useWorkspaceCatalog } from '../stores/workspace-catalog';
import { useCredentialVault } from '../stores/credential-vault';
import { useActivityLog } from '../stores/activity-log';
import { useFlowCommands } from '../stores/flow-commands';
import { useFlowRuntime } from '../stores/flow-runtime';
import { useExecutionQueue } from '../stores/execution-queue';
import { useAssetLibraryModalUi } from '../stores/asset-library-modal-ui';
import { useSkillLibraryModalUi } from '../stores/skill-library-modal-ui';
import { useAssetTrashModalUi } from '../stores/asset-trash-modal-ui';
import { useCreateWorkspaceDialogUi } from '../stores/create-workspace-dialog-ui';
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
const SkillLibraryModal = lazy(() =>
  import('../panels/SkillLibraryModal').then((m) => ({ default: m.SkillLibraryModal })),
);
const AssetTrashModal = lazy(() =>
  import('../panels/AssetTrashModal').then((m) => ({ default: m.AssetTrashModal })),
);
const CreateWorkspaceDialog = lazy(() =>
  import('../panels/CreateWorkspaceDialog').then((m) => ({ default: m.CreateWorkspaceDialog })),
);
const Director3dPanel = lazy(() =>
  import('../panels/Director3dPanel').then((m) => ({ default: m.Director3dPanel })),
);

/** StrictMode 双挂载时防止并发创建默认「我的第一部剧」 */
let defaultWorkspaceBootstrapLock = false;

export default function AppShell() {
  const surface = useAppSurface((s) => s.surface);
  const goHome = useAppSurface((s) => s.goHome);
  const goStudio = useAppSurface((s) => s.goStudio);
  const {
    activeId,
    fetchAll,
    create,
    selectWorkspace,
    reloadToken,
  } = useWorkspaceCatalog();
  const toggleSettings = useCredentialVault((s) => s.toggleSettings);
  const requestSpawn = useFlowCommands((s) => s.requestSpawn);
  const runtime = useFlowRuntime((s) => s.runtime);
  const batchPhase = useExecutionQueue((s) => s.phase);
  const batchProgress = useExecutionQueue((s) => s.progress);
  const batchTaskId = useExecutionQueue((s) => s.taskId);
  useTaskStream(batchTaskId);
  const appendLog = useActivityLog((s) => s.append);
  const [flowKey, setFlowKey] = useState(0);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const toggleAssetLibModal = useAssetLibraryModalUi((s) => s.toggle);
  const toggleSkillLibModal = useSkillLibraryModalUi((s) => s.toggle);
  const openAssetTrash = useAssetTrashModalUi((s) => s.setOpen);
  const createDialogOpen = useCreateWorkspaceDialogUi((s) => s.open);
  const openCreateDialog = useCreateWorkspaceDialogUi((s) => s.openDialog);
  const closeCreateDialog = useCreateWorkspaceDialogUi((s) => s.closeDialog);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const bootstrapUser = useUserSession((s) => s.bootstrap);
  const user = useUserSession((s) => s.user);
  const bootstrapped = useRef(false);
  const userBootstrapped = useRef(false);
  const canvasTheme = useWorkspaceDocument((s) => s.canvasAppearance.theme);
  const requestBootstrapCorePipeline = useFlowCommands((s) => s.requestBootstrapCorePipeline);

  useEffect(() => {
    document.body.classList.toggle('nx9-app-dark-body', canvasTheme === 'dark');
    document.body.classList.toggle('nx9-app-dark', canvasTheme === 'dark');
    return () => {
      document.body.classList.remove('nx9-app-dark-body');
      document.body.classList.remove('nx9-app-dark');
    };
  }, [canvasTheme]);

  useEffect(() => {
    if (userBootstrapped.current) return;
    userBootstrapped.current = true;
    void bootstrapUser();
  }, [bootstrapUser]);

  useEffect(() => {
    void useCredentialVault.getState().load();
  }, []);

  useEffect(() => {
    void (async () => {
      await fetchAll();
      const current = useWorkspaceCatalog.getState().items.filter(isPrivateWorkspace);
      // StrictMode / HMR 下用模块级锁，避免空列表时连建多个默认项目
      if (current.length === 0 && !bootstrapped.current && !defaultWorkspaceBootstrapLock) {
        bootstrapped.current = true;
        defaultWorkspaceBootstrapLock = true;
        try {
          await create({ title: '我的第一部剧', visibility: 'private' });
        } catch {
          bootstrapped.current = false;
          defaultWorkspaceBootstrapLock = false;
        }
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
  const privateProjectCount = useMemo(
    () => catalogItems.filter(isPrivateWorkspace).length,
    [catalogItems],
  );
  /** 打开对话框时的建议名：按私有项目总数，避免用 rail 长度跳号/撞名 */
  const createDefaultTitle = `项目 ${privateProjectCount + 1}`;

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
                onOpenSkills={() => toggleSkillLibModal()}
                onOpenTrash={() => openAssetTrash(true)}
                onOpenSettings={() => toggleSettings(true)}
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
                  className="text-xs text-brand hover:underline"
                  onClick={goHome}
                >
                  返回导航
                </button>
              </div>
            ))}

          <Suspense fallback={null}>
            {isSurfaceEnabled('assetLibraryModal') && <AssetLibraryModal />}
            {isSurfaceEnabled('skillLibraryModal') && <SkillLibraryModal />}
            <AssetTrashModal />
            <CreateWorkspaceDialog
              open={createDialogOpen}
              onClose={closeCreateDialog}
              onConfirm={handleCreatePrivate}
              submitting={createSubmitting}
              defaultTitle={createDefaultTitle}
              defaultBootstrapCore
            />
          </Suspense>
        </main>
      </div>

      {isSurfaceEnabled('shortcuts') && (
        <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      )}

      {isSurfaceEnabled('settings') && <SettingsModal />}
      <Suspense fallback={null}>
        <Director3dPanel />
      </Suspense>
      {isCanvas && isSurfaceEnabled('logPanel') && <LogPanel />}
      <ToastHost />
      <ConfirmHost />
    </div>
  );
}
