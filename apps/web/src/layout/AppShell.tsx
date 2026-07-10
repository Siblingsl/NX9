import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { BlockDefinition } from '@nx9/shared';
import { ModuleDock } from '../engine/stage-deck/chrome/ModuleDock';
import { StageDeckTour } from '../engine/stage-deck/chrome/StageDeckTour';
import { ContextRail } from '../engine/stage-deck/chrome/ContextRail';
import { useContextRailUi } from '../engine/stage-deck/stores/context-rail-ui';
import { StudioTopBar } from './StudioTopBar';
import { WorkspaceRail } from '../panels/WorkspaceRail';
import { SettingsDrawer } from '../panels/SettingsDrawer';
import { SkillsDrawer } from '../panels/SkillsDrawer';
import { StoryboardPanel } from '../panels/StoryboardPanel';
import { AssetLibraryPanel } from '../panels/AssetLibraryPanel';
import { EpisodeStudioPanel } from '../panels/EpisodeStudioPanel';
import { UsagePanel } from '../panels/UsagePanel';
import { GenerationHistoryPanel } from '../panels/GenerationHistoryPanel';

import { BacklotLibraryPanel } from '../panels/BacklotLibraryPanel';
import { ShortcutsModal } from '../panels/ShortcutsModal';
import { LogPanel } from '../panels/LogPanel';
import { ToastHost } from '../components/ToastHost';
import { ProductionProgressWall } from '../components/ProductionProgressWall';
import { Director3dPanel } from '../panels/Director3dPanel';
import { useUserSession } from '../stores/user-session';
import { useTaskStream } from '../hooks/use-task-stream';
import { useWorkspaceCatalog } from '../stores/workspace-catalog';
import { useCredentialVault } from '../stores/credential-vault';
import { useActivityLog } from '../stores/activity-log';
import { useFlowCommands } from '../stores/flow-commands';
import { useSkillVault } from '../stores/skill-vault';
import { useFlowRuntime, useStoryboardUi, useRemotionUi } from '../stores/flow-runtime';
import { useExecutionQueue } from '../stores/execution-queue';
import { useDirector3dUi } from '../stores/director3d-ui';
import { useBacklotLibraryUi } from '../stores/backlot-library-ui';

const StageDeckSurface = lazy(() =>
  import('../engine/stage-deck/StageDeckSurface').then((m) => ({ default: m.StageDeckSurface })),
);

export default function AppShell() {
  const {
    items,
    activeId,
    fetchAll,
    setActive,
    create,
    rename,
    remove,
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
  const [assetLibOpen, setAssetLibOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const backlotOpen = useBacklotLibraryUi((s) => s.open);
  const setBacklotOpen = useBacklotLibraryUi((s) => s.setOpen);

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
        await create('默认工作区');
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

  const handleCreate = useCallback(async () => {
    await create(`工作区 ${items.length + 1}`);
    setFlowKey((k) => k + 1);
  }, [create, items.length]);

  const handleBatchRun = useCallback(async () => {
    if (!runtime) {
      appendLog('画布尚未就绪');
      return;
    }
    await runtime.runBatch();
  }, [runtime, appendLog]);

  const openDirector3d = useDirector3dUi((s) => s.openStandalone);

  useEffect(() => {
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
        assetLibOpen={assetLibOpen}
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
          setAssetLibOpen(false);
        }}
        onToggleUsage={() => {
          setUsageOpen((v) => !v);
          setRemotionOpen(false);
        }}
        onOpenBacklot={() => requestRailTab('library', { librarySub: 'templates' })}
        onOpenWorkflowTemplates={() => requestRailTab('library', { librarySub: 'workflow' })}
        onOpenHistory={() => requestRailTab('library', { librarySub: 'history' })}
        onToggleAssetLib={() => setAssetLibOpen((v) => !v)}
        onOpenSkills={() => toggleSkills(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenSettings={() => toggleSettings(true)}
      />

      <ProductionProgressWall />

      <WorkspaceRail
        items={items}
        activeId={activeId}
        onSelect={(id) => {
          setActive(id);
          setFlowKey((k) => k + 1);
        }}
        onCreate={() => void handleCreate()}
        onRename={(id, title) => void rename(id, title)}
        onDelete={(id) => void remove(id)}
      />

      <div className="flex-1 flex min-h-0">
        <ModuleDock onPick={onPickBlock} />

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
                <ContextRail selectedBlockId={selectedBlockId} />
              </div>
            </Suspense>
          ) : (
            <div className="flex items-center justify-center h-full text-ink/50 flex-1">
              选择或创建工作区
            </div>
          )}
          <StoryboardPanel />
          <AssetLibraryPanel open={assetLibOpen} onClose={() => setAssetLibOpen(false)} />
          <BacklotLibraryPanel
            open={backlotOpen}
            onClose={() => setBacklotOpen(false)}
            dockLeftOfStoryboard={storyboardOpen}
          />
          <GenerationHistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />
          <EpisodeStudioPanel open={remotionOpen} onClose={() => setRemotionOpen(false)} />
          <UsagePanel open={usageOpen} onClose={() => setUsageOpen(false)} />
        </main>
      </div>

      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <SettingsDrawer />
      <SkillsDrawer />
      <LogPanel />
      <ToastHost />
      <Director3dPanel />
      <StageDeckTour />
    </div>
  );
}
