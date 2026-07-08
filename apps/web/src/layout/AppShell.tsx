import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, BarChart3, Box, Clapperboard, Film, FolderOpen, History, HelpCircle, Layers, LayoutTemplate, Redo2, Settings, Sparkles, Undo2, User, Zap } from 'lucide-react';
import type { BlockDefinition } from '@nx9/shared';
import { ModuleDock } from '../engine/stage-deck/chrome/ModuleDock';
import { ModeCapsule } from '../engine/stage-deck/chrome/ModeCapsule';
import { PipelineCapsule } from '../engine/stage-deck/chrome/PipelineCapsule';
import { StageDeckTour } from '../engine/stage-deck/chrome/StageDeckTour';
import { ContextRail } from '../engine/stage-deck/chrome/ContextRail';
import { useContextRailUi } from '../engine/stage-deck/stores/context-rail-ui';
import { WorkspaceRail } from '../panels/WorkspaceRail';
import { SettingsDrawer } from '../panels/SettingsDrawer';
import { SkillsDrawer } from '../panels/SkillsDrawer';
import { StoryboardPanel } from '../panels/StoryboardPanel';
import { AssetLibraryPanel } from '../panels/AssetLibraryPanel';
import { RemotionPreviewPanel } from '../panels/RemotionPreviewPanel';
import { UsagePanel } from '../panels/UsagePanel';
import { GenerationHistoryPanel } from '../panels/GenerationHistoryPanel';
import { QuickMontagePanel } from '../panels/QuickMontagePanel';
import { WorkflowTemplatesPanel } from '../panels/WorkflowTemplatesPanel';
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
import { isDesktop } from '../platform/runtime-bridge';

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
  const [montageOpen, setMontageOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const backlotOpen = useBacklotLibraryUi((s) => s.open);
  const setBacklotOpen = useBacklotLibraryUi((s) => s.setOpen);
  const toggleBacklot = useBacklotLibraryUi((s) => s.toggle);
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
      <header className="h-14 shrink-0 border-b border-line bg-white flex items-center px-5 gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-brand flex items-center justify-center text-white font-bold text-sm">
            N9
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight">NX9 Studio</h1>
            <p className="text-[10px] text-ink/50">
              {isDesktop() ? 'Desktop' : 'Web'} · AI Workflow
              {batchPhase === 'running' && (
                <span className="ml-2 text-brand">
                  运行中 {batchProgress.done}/{batchProgress.total}
                  {batchTask && batchTask.progress > 0 && ` · ${batchTask.progress}%`}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <PipelineCapsule />
          <ModeCapsule />
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1 text-xs border border-line rounded-xl px-2 py-1">
          <User size={14} className="text-ink/50" />
          <select
            value={user?.id ?? ''}
            onChange={(e) => {
              const u = users.find((x) => x.id === e.target.value);
              if (u) setUser(u);
            }}
            className="bg-transparent outline-none max-w-[100px]"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="text-brand hover:underline"
            onClick={() => {
              const name = window.prompt('新用户名');
              if (name) void createUser(name);
            }}
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={() => runtime?.undo()}
          disabled={!runtime?.canUndo}
          className="p-2 rounded-xl hover:bg-surface disabled:opacity-30 text-ink/70"
          title="撤销 Ctrl+Z"
        >
          <Undo2 size={18} />
        </button>
        <button
          type="button"
          onClick={() => runtime?.redo()}
          disabled={!runtime?.canRedo}
          className="p-2 rounded-xl hover:bg-surface disabled:opacity-30 text-ink/70"
          title="重做 Ctrl+Y"
        >
          <Redo2 size={18} />
        </button>

        <button
          type="button"
          onClick={() => {
            requestRailTab('storyboard');
            toggleStoryboard();
          }}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm ${
            storyboardOpen
              ? 'border-brand bg-brand/5 text-brand'
              : 'border-line hover:border-brand/40 hover:text-brand'
          }`}
          title="故事板 (B)"
        >
          <Clapperboard size={16} />
          故事板
        </button>

        <button
          type="button"
          onClick={() => openDirector3d()}
          className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-sm hover:border-brand/40 hover:text-brand"
          title="3D 导演台预演"
        >
          <Box size={16} />
          3D 预演
        </button>

        <button
          type="button"
          onClick={() => void handleBatchRun()}
          disabled={batchPhase === 'running'}
          className="flex items-center gap-1.5 rounded-xl border border-brand bg-brand text-white px-3 py-1.5 text-sm hover:bg-brand/90 disabled:opacity-50"
        >
          <Zap size={16} />
          批量运行
        </button>

        <button
          type="button"
          onClick={() => {
            setRemotionOpen(!remotionOpen);
            setUsageOpen(false);
            setAssetLibOpen(false);
          }}
          className={`p-2 rounded-xl hover:bg-surface text-ink/70 hover:text-brand ${
            remotionOpen ? 'bg-brand/5 text-brand' : ''
          }`}
          title="Remotion 预览"
        >
          <Film size={18} />
        </button>

        <button
          type="button"
          onClick={() => {
            setUsageOpen((v) => !v);
            setRemotionOpen(false);
          }}
          className={`p-2 rounded-xl hover:bg-surface text-ink/70 hover:text-brand ${
            usageOpen ? 'bg-warn/10 text-warn' : ''
          }`}
          title="用量追踪"
        >
          <BarChart3 size={18} />
        </button>

        <button
          type="button"
          onClick={() => {
            setMontageOpen((v) => !v);
            setTemplatesOpen(false);
            setBacklotOpen(false);
          }}
          className={`p-2 rounded-xl hover:bg-surface text-ink/70 hover:text-brand ${
            montageOpen ? 'bg-warn/10 text-warn' : ''
          }`}
          title="智能创作台"
        >
          <Sparkles size={18} />
        </button>

        <button
          type="button"
          onClick={() => {
            requestRailTab('backlot');
            toggleBacklot();
            setTemplatesOpen(false);
            setMontageOpen(false);
          }}
          className={`p-2 rounded-xl hover:bg-surface text-ink/70 hover:text-brand ${
            backlotOpen ? 'bg-brand/5 text-brand' : ''
          }`}
          title="Backlot 模板库（角色/场景/镜头/情绪/钩子）"
        >
          <Layers size={18} />
        </button>

        <button
          type="button"
          onClick={() => {
            requestRailTab('workflow');
            setTemplatesOpen((v) => !v);
            setMontageOpen(false);
            setBacklotOpen(false);
          }}
          className={`p-2 rounded-xl hover:bg-surface text-ink/70 hover:text-brand ${
            templatesOpen ? 'bg-brand/5 text-brand' : ''
          }`}
          title="工作流模板"
        >
          <LayoutTemplate size={18} />
        </button>

        <button
          type="button"
          onClick={() => {
            requestRailTab('history');
            setHistoryOpen((v) => !v);
            setAssetLibOpen(false);
            setRemotionOpen(false);
            setUsageOpen(false);
          }}
          className={`p-2 rounded-xl hover:bg-surface text-ink/70 hover:text-brand ${
            historyOpen ? 'bg-accent/10 text-accent' : ''
          }`}
          title="生成历史"
        >
          <History size={18} />
        </button>

        <button
          type="button"
          onClick={() => setAssetLibOpen((v) => !v)}
          className={`p-2 rounded-xl hover:bg-surface text-ink/70 hover:text-brand ${
            assetLibOpen ? 'bg-brand/5 text-brand' : ''
          }`}
          title="资源库"
        >
          <FolderOpen size={18} />
        </button>

        <button
          type="button"
          onClick={() => toggleSkills(true)}
          className="p-2 rounded-xl hover:bg-surface text-ink/70 hover:text-brand"
          title="技能"
        >
          <BookOpen size={18} />
        </button>
        <button
          type="button"
          onClick={() => setShortcutsOpen(true)}
          className="p-2 rounded-xl hover:bg-surface text-ink/70 hover:text-brand"
          title="快捷键 (?)"
        >
          <HelpCircle size={18} />
        </button>
        <button
          type="button"
          onClick={() => toggleSettings(true)}
          className="p-2 rounded-xl hover:bg-surface text-ink/70 hover:text-brand"
          title="设置"
        >
          <Settings size={18} />
        </button>
      </header>

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
                <ContextRail selectedBlockId={runtime?.selectedBlockId ?? null} />
              </div>
            </Suspense>
          ) : (
            <div className="flex items-center justify-center h-full text-ink/50 flex-1">
              选择或创建工作区
            </div>
          )}
          <StoryboardPanel />
          <AssetLibraryPanel open={assetLibOpen} onClose={() => setAssetLibOpen(false)} />
          <QuickMontagePanel open={montageOpen} onClose={() => setMontageOpen(false)} />
          <WorkflowTemplatesPanel open={templatesOpen} onClose={() => setTemplatesOpen(false)} />
          <BacklotLibraryPanel
            open={backlotOpen}
            onClose={() => setBacklotOpen(false)}
            dockLeftOfStoryboard={storyboardOpen}
          />
          <GenerationHistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />
          <RemotionPreviewPanel open={remotionOpen} onClose={() => setRemotionOpen(false)} />
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
