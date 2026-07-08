import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  BacklotCustomTemplate,
  BacklotTemplate,
  BacklotTemplateKind,
  CharacterProfile,
} from '@nx9/shared';
import {
  BACKLOT_TEMPLATE_TABS,
  listBacklotTemplates,
  listBacklotGroupOptions,
  backlotTemplatePrompt,
  characterToCustomTemplate,
  newBacklotWorkspaceItem,
  templateToWorkspaceItem,
  workspaceItemToCustomTemplate,
} from '@nx9/shared';
import {
  BookmarkPlus,
  Clapperboard,
  Layers,
  Mic,
  Search,
  Sparkles,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { useBacklotApply } from '../hooks/use-backlot-apply';
import { useBacklotLibraryUi } from '../stores/backlot-library-ui';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { useDirector3dUi } from '../stores/director3d-ui';
import { useActivityLog } from '../stores/activity-log';
import { toastSuccess } from '../stores/toast';

function newCharacter(): CharacterProfile {
  return {
    id: `char-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: '新角色',
    descriptionZh: '',
    consistencyPrompt: '',
    referenceImageUrl: null,
    referenceAudioUrl: null,
    tags: [],
  };
}

const WORKSPACE_TAB_META: Record<
  BacklotTemplateKind,
  { title: string; newLabel: string; emptyHint: string; promptPlaceholder: string }
> = {
  character: {
    title: '工作区角色',
    newLabel: '+ 新建角色',
    emptyHint: '创建角色用于一致性注入与配音',
    promptPlaceholder: '一致性 prompt…',
  },
  scene: {
    title: '工作区场景',
    newLabel: '+ 新建场景',
    emptyHint: '编辑场景描述，可直接应用到画布或保存为模板',
    promptPlaceholder: '环境、光线、空间描述（英文）…',
  },
  shot: {
    title: '工作区镜头',
    newLabel: '+ 新建镜头',
    emptyHint: '编辑运镜与机位描述，可直接应用或保存为模板',
    promptPlaceholder: '运镜、景别、机位描述（英文）…',
  },
  emotion: {
    title: '工作区情绪',
    newLabel: '+ 新建情绪',
    emptyHint: '编辑表情与氛围描述，可直接应用或保存为模板',
    promptPlaceholder: '表情、氛围、色调描述（英文）…',
  },
  hook: {
    title: '工作区钩子',
    newLabel: '+ 新建钩子',
    emptyHint: '编辑开场或结尾钩子，可直接应用或保存为模板',
    promptPlaceholder: '钩子文案（英文）…',
  },
};

function templateGroupName(
  t: BacklotTemplate | BacklotCustomTemplate,
  tab: BacklotTemplateKind,
): string {
  if (tab === 'hook' && 'hookPhase' in t && t.hookPhase) {
    return t.hookPhase === 'opening' ? '开场' : '结尾';
  }
  const g = t.group?.trim();
  if (!g || g === '我的工作区') return '未分组';
  return g;
}

function isCustomTemplate(t: BacklotTemplate | BacklotCustomTemplate): boolean {
  return 'createdAt' in t;
}

function WorkspaceApplyButtons({
  onSpawn,
  onFill,
  onShot,
}: {
  onSpawn: () => void;
  onFill: () => void;
  onShot: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-line">
      <button type="button" onClick={onSpawn} className="text-[11px] rounded-lg bg-brand text-white py-1.5">
        追加模块
      </button>
      <button type="button" onClick={onFill} className="text-[11px] rounded-lg border border-line py-1.5 hover:border-brand/40">
        填入选中
      </button>
      <button
        type="button"
        onClick={onShot}
        className="text-[11px] rounded-lg border border-line py-1.5 hover:border-brand/40 col-span-2"
      >
        写入故事板镜头
      </button>
    </div>
  );
}

function WorkspaceListSidebar({
  items,
  selectedId,
  onSelect,
  onDelete,
}: {
  items: { id: string; label: string }[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <ul className="w-[100px] border-r border-line p-1">
      {items.map((item) => (
        <li key={item.id} className="group relative">
          <button
            type="button"
            onClick={() => onSelect(item.id)}
            className={`w-full text-left text-[10px] pl-2 pr-6 py-1 rounded-lg truncate ${
              selectedId === item.id ? 'bg-brand/10 text-brand' : 'hover:bg-surface'
            }`}
          >
            {item.label}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.id);
            }}
            className="absolute right-0.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-ink/30 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
            title="删除"
          >
            <Trash2 size={12} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function SaveAsTemplateSection({
  expanded,
  onExpand,
  onCancel,
  groupOptions,
  saveGroupKey,
  showNewGroup,
  newGroupName,
  onGroupChange,
  onNewGroupNameChange,
  onSave,
  overwriteLabel,
}: {
  expanded: boolean;
  onExpand: () => void;
  onCancel: () => void;
  groupOptions: string[];
  saveGroupKey: string;
  showNewGroup: boolean;
  newGroupName: string;
  onGroupChange: (v: string) => void;
  onNewGroupNameChange: (v: string) => void;
  onSave: () => void;
  overwriteLabel?: string;
}) {
  if (!expanded) {
    return (
      <div className="pt-2 border-t border-line">
        <button
          type="button"
          onClick={onExpand}
          className="w-full text-[11px] rounded-lg border border-accent/30 text-accent py-1.5 flex items-center justify-center gap-1 hover:bg-accent/5"
        >
          <BookmarkPlus size={12} />
          保存为模板
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 pt-2 border-t border-line">
      <label className="text-[10px] text-ink/50">选择分组并保存</label>
      {overwriteLabel && (
        <p className="text-[10px] text-accent/80">将覆盖已有模板「{overwriteLabel}」</p>
      )}
      <div className="flex gap-1">
        <select
          value={showNewGroup ? '__new__' : saveGroupKey}
          onChange={(e) => onGroupChange(e.target.value)}
          className="flex-1 text-[10px] rounded-lg border border-line px-2 py-1 bg-white"
        >
          {groupOptions.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
          <option value="__new__">＋ 新建分组…</option>
        </select>
        <button
          type="button"
          onClick={onSave}
          className="shrink-0 text-[10px] px-2.5 rounded-lg bg-brand text-white flex items-center gap-0.5"
        >
          <BookmarkPlus size={12} />
          确定保存
        </button>
      </div>
      {showNewGroup && (
        <input
          value={newGroupName}
          onChange={(e) => onNewGroupNameChange(e.target.value)}
          placeholder="新分组名称 *"
          className="w-full text-[10px] rounded-lg border border-brand/40 px-2 py-1"
          autoFocus
        />
      )}
      <button type="button" onClick={onCancel} className="text-[10px] text-ink/40 hover:text-ink/60">
        取消
      </button>
    </div>
  );
}

function TemplateCard({
  label,
  description,
  promptPreview,
  isCustom,
  onFill,
  onSpawn,
  onShot,
  onCharacter,
  onStage,
  onImport,
  onDelete,
  showCharacter,
  showStage,
  showImport,
}: {
  label: string;
  description?: string;
  promptPreview: string;
  isCustom?: boolean;
  onFill: () => void;
  onSpawn: () => void;
  onShot: () => void;
  onCharacter?: () => void;
  onStage?: () => void;
  onImport?: () => void;
  onDelete?: () => void;
  showCharacter?: boolean;
  showStage?: boolean;
  showImport?: boolean;
}) {
  return (
    <li className="rounded-xl border border-line p-3 hover:border-brand/40 transition-colors">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm text-ink">{label}</p>
            {isCustom && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent shrink-0">
                自定义
              </span>
            )}
          </div>
          {description && <p className="text-xs text-ink/50 mt-1">{description}</p>}
          <p className="text-[10px] text-ink/40 mt-2 line-clamp-2 font-mono leading-relaxed">{promptPreview}</p>
        </div>
        {onDelete && (
          <button type="button" onClick={onDelete} className="p-1 text-ink/30 hover:text-red-600" title="删除">
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5 mt-2">
        <button type="button" onClick={onSpawn} className="text-[11px] rounded-lg bg-brand text-white py-1.5">
          追加模块
        </button>
        <button type="button" onClick={onFill} className="text-[11px] rounded-lg border border-line py-1.5 hover:border-brand/40">
          填入选中
        </button>
        <button type="button" onClick={onShot} className="text-[11px] rounded-lg border border-line py-1.5 hover:border-brand/40 col-span-2">
          写入故事板镜头
        </button>
        {showImport && onImport && (
          <button
            type="button"
            onClick={onImport}
            className="text-[11px] rounded-lg border border-brand/30 text-brand py-1.5 col-span-2"
          >
            导入到工作区
          </button>
        )}
        {showCharacter && onCharacter && (
          <button type="button" onClick={onCharacter} className="text-[11px] rounded-lg border border-accent/30 text-accent py-1.5 col-span-2">
            导入到角色库
          </button>
        )}
        {showStage && onStage && (
          <button type="button" onClick={onStage} className="text-[11px] rounded-lg border border-brand/30 text-brand py-1.5 col-span-2">
            在 Stage Deck 打开
          </button>
        )}
      </div>
    </li>
  );
}

export function BacklotLibraryPanel({
  open,
  onClose,
  dockLeftOfStoryboard = false,
}: {
  open: boolean;
  onClose: () => void;
  dockLeftOfStoryboard?: boolean;
}) {
  const [tab, setTab] = useState<BacklotTemplateKind>('character');
  const [query, setQuery] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [saveGroupKey, setSaveGroupKey] = useState('');
  const [saveTemplateExpanded, setSaveTemplateExpanded] = useState(false);
  const [showNewGroupOnSave, setShowNewGroupOnSave] = useState(false);
  const [newGroupNameOnSave, setNewGroupNameOnSave] = useState('');
  const [filterGroup, setFilterGroup] = useState('all');
  const [filterSource, setFilterSource] = useState<'all' | 'builtin' | 'custom'>('all');
  const [filterHookPhase, setFilterHookPhase] = useState<'all' | 'opening' | 'ending'>('all');

  const customItems = useWorkspaceDocument((s) => s.backlotCustom.items);
  const addBacklotCustom = useWorkspaceDocument((s) => s.addBacklotCustom);
  const workspaceItems = useWorkspaceDocument((s) => s.backlotWorkspace.items);
  const upsertBacklotWorkspace = useWorkspaceDocument((s) => s.upsertBacklotWorkspace);
  const removeBacklotWorkspace = useWorkspaceDocument((s) => s.removeBacklotWorkspace);
  const characters = useWorkspaceDocument((s) => s.characters.characters);
  const upsertCharacter = useWorkspaceDocument((s) => s.upsertCharacter);
  const removeCharacter = useWorkspaceDocument((s) => s.removeCharacter);
  const removeBacklotCustom = useWorkspaceDocument((s) => s.removeBacklotCustom);

  const navigateRequest = useBacklotLibraryUi((s) => s.navigateRequest);
  const clearNavigateRequest = useBacklotLibraryUi((s) => s.clearNavigateRequest);

  const directorOpen = useDirector3dUi((s) => s.open);
  const directorProject = useDirector3dUi((s) => s.project);
  const appendLog = useActivityLog((s) => s.append);

  const { applyTemplate, importCharacterArchetype, openStageDeckScene, selectedShotId } =
    useBacklotApply();

  const tabMeta = WORKSPACE_TAB_META[tab];
  const tabWorkspaceItems = useMemo(
    () => (tab === 'character' ? [] : workspaceItems.filter((i) => i.kind === tab)),
    [workspaceItems, tab],
  );

  const selectedChar =
    tab === 'character' ? (characters.find((c) => c.id === editId) ?? characters[0]) : undefined;
  const selectedWs =
    tab !== 'character' ? (tabWorkspaceItems.find((i) => i.id === editId) ?? tabWorkspaceItems[0]) : undefined;

  const linkedTemplate = useMemo(() => {
    const sourceId =
      tab === 'character' ? selectedChar?.sourceTemplateId : selectedWs?.sourceTemplateId;
    if (!sourceId) return undefined;
    return customItems.find((t) => t.id === sourceId);
  }, [tab, selectedChar?.sourceTemplateId, selectedWs?.sourceTemplateId, customItems]);

  useEffect(() => {
    if (!open || !navigateRequest) return;
    setTab(navigateRequest.tab);
    setEditId(navigateRequest.itemId);
    setFilterGroup('all');
    setFilterSource('all');
    setFilterHookPhase('all');
    setQuery('');
    setSaveGroupKey(listBacklotGroupOptions(navigateRequest.tab, customItems)[0] ?? '');
    setSaveTemplateExpanded(navigateRequest.expandSave ?? false);
    setShowNewGroupOnSave(false);
    setNewGroupNameOnSave('');
    clearNavigateRequest();
  }, [open, navigateRequest, customItems, clearNavigateRequest]);

  useEffect(() => {
    setSaveTemplateExpanded(false);
    setShowNewGroupOnSave(false);
    setNewGroupNameOnSave('');
  }, [editId, tab]);

  const groupOptions = useMemo(
    () => listBacklotGroupOptions(tab, customItems),
    [tab, customItems],
  );

  const allTabTemplates = useMemo(
    () => listBacklotTemplates(tab, customItems),
    [tab, customItems],
  );

  const filteredTemplates = useMemo(() => {
    let list = allTabTemplates;
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (t) =>
          t.label.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.promptEn.toLowerCase().includes(q) ||
          t.promptZh?.toLowerCase().includes(q) ||
          templateGroupName(t, tab).toLowerCase().includes(q),
      );
    }
    if (filterSource === 'custom') list = list.filter(isCustomTemplate);
    if (filterSource === 'builtin') list = list.filter((t) => !isCustomTemplate(t));
    if (filterGroup !== 'all') {
      list = list.filter((t) => templateGroupName(t, tab) === filterGroup);
    }
    if (tab === 'hook' && filterHookPhase !== 'all') {
      list = list.filter((t) => 'hookPhase' in t && t.hookPhase === filterHookPhase);
    }
    return list;
  }, [allTabTemplates, query, filterSource, filterGroup, filterHookPhase, tab]);

  const groupedTemplates = useMemo(() => {
    const map = new Map<string, Array<BacklotTemplate | BacklotCustomTemplate>>();
    for (const t of filteredTemplates) {
      const g = templateGroupName(t, tab);
      const items = map.get(g) ?? [];
      items.push(t);
      map.set(g, items);
    }
    for (const [g, items] of map) {
      items.sort((a, b) => {
        const ac = isCustomTemplate(a) ? 0 : 1;
        const bc = isCustomTemplate(b) ? 0 : 1;
        if (ac !== bc) return ac - bc;
        return a.label.localeCompare(b.label, 'zh');
      });
      map.set(g, items);
    }
    const order = [...groupOptions, ...[...map.keys()].filter((g) => !groupOptions.includes(g))];
    const keys = [...map.keys()].sort((a, b) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.localeCompare(b, 'zh');
    });
    return keys.map((g) => [g, map.get(g)!] as const);
  }, [filteredTemplates, tab, groupOptions]);

  const filterStats = useMemo(() => {
    const custom = filteredTemplates.filter(isCustomTemplate).length;
    return { total: filteredTemplates.length, custom };
  }, [filteredTemplates]);

  const resolveSaveGroup = useCallback((): string | null => {
    if (showNewGroupOnSave) {
      const name = newGroupNameOnSave.trim();
      if (!name) {
        appendLog('请输入新分组名称');
        return null;
      }
      return name;
    }
    const g = saveGroupKey.trim() || groupOptions[0];
    return g || '未分组';
  }, [showNewGroupOnSave, newGroupNameOnSave, saveGroupKey, groupOptions, appendLog]);

  const applyPrompt = useCallback(
    (
      kind: BacklotTemplateKind,
      label: string,
      promptEn: string,
      promptZh: string | undefined,
      action: 'fill' | 'spawn' | 'shot',
      extra?: { stageDeckScene?: unknown },
    ) => {
      if (!promptEn.trim() && !promptZh?.trim()) {
        appendLog('请先填写 prompt 内容');
        return;
      }
      applyTemplate(
        {
          kind,
          label,
          promptEn: promptEn.trim() || promptZh?.trim() || label,
          promptZh,
          stageDeckScene: extra?.stageDeckScene,
        },
        action,
      );
    },
    [applyTemplate, appendLog],
  );

  const handleTabChange = useCallback(
    (next: BacklotTemplateKind) => {
      setTab(next);
      setEditId(null);
      setFilterGroup('all');
      setFilterSource('all');
      setFilterHookPhase('all');
      setQuery('');
      setSaveGroupKey(listBacklotGroupOptions(next, customItems)[0] ?? '');
      setSaveTemplateExpanded(false);
      setShowNewGroupOnSave(false);
      setNewGroupNameOnSave('');
    },
    [customItems],
  );

  const handleSaveGroupChange = useCallback((v: string) => {
    if (v === '__new__') {
      setShowNewGroupOnSave(true);
      setSaveGroupKey('');
    } else {
      setShowNewGroupOnSave(false);
      setNewGroupNameOnSave('');
      setSaveGroupKey(v);
    }
  }, []);

  const collapseSaveTemplate = useCallback(() => {
    setSaveTemplateExpanded(false);
    setShowNewGroupOnSave(false);
    setNewGroupNameOnSave('');
  }, []);

  const handleDeleteWorkspaceItem = useCallback(
    (id: string) => {
      const label =
        tab === 'character'
          ? characters.find((c) => c.id === id)?.name
          : tabWorkspaceItems.find((i) => i.id === id)?.label;
      if (!window.confirm(`确定删除工作区项「${label ?? '未命名'}」？`)) return;
      if (tab === 'character') {
        removeCharacter(id);
      } else {
        removeBacklotWorkspace(id);
      }
      if (editId === id) setEditId(null);
      appendLog('已删除工作区项');
      toastSuccess('已删除工作区项');
    },
    [tab, characters, tabWorkspaceItems, removeCharacter, removeBacklotWorkspace, editId, appendLog],
  );

  const handleDeleteCustomTemplate = useCallback(
    (tpl: BacklotCustomTemplate) => {
      if (!window.confirm(`确定删除自定义模板「${tpl.label}」？`)) return;
      removeBacklotCustom(tpl.id);
      appendLog(`已删除模板：${tpl.label}`);
      toastSuccess(`已删除模板「${tpl.label}」`);
    },
    [removeBacklotCustom, appendLog],
  );

  const saveCharacterAsTemplate = useCallback(() => {
    if (!selectedChar) return;
    const label = selectedChar.name.trim();
    if (!label) {
      appendLog('请填写角色名称');
      return;
    }
    const group = resolveSaveGroup();
    if (!group) return;
    const existing = linkedTemplate?.kind === 'character' ? linkedTemplate : undefined;
    const item = characterToCustomTemplate(selectedChar, group, label, existing);
    addBacklotCustom(item);
    upsertCharacter({ ...selectedChar, sourceTemplateId: item.id });
    appendLog(
      existing ? `已更新角色模板：${label}` : `已将角色保存为模板：${label}`,
    );
    toastSuccess(existing ? `已更新模板「${label}」` : `已将「${label}」保存为模板`);
    collapseSaveTemplate();
  }, [
    selectedChar,
    resolveSaveGroup,
    linkedTemplate,
    addBacklotCustom,
    upsertCharacter,
    appendLog,
    collapseSaveTemplate,
  ]);

  const saveWorkspaceAsTemplate = useCallback(() => {
    if (!selectedWs) return;
    const label = selectedWs.label.trim();
    if (!label) {
      appendLog('请填写名称');
      return;
    }
    if (!selectedWs.promptEn.trim()) {
      appendLog('请先填写英文 prompt');
      return;
    }
    const group = resolveSaveGroup();
    if (!group) return;
    const existing = linkedTemplate?.kind === selectedWs.kind ? linkedTemplate : undefined;
    const item = workspaceItemToCustomTemplate(selectedWs, group, label, existing);
    addBacklotCustom(item);
    upsertBacklotWorkspace({ ...selectedWs, sourceTemplateId: item.id });
    appendLog(
      existing
        ? `已更新${BACKLOT_TEMPLATE_TABS.find((t) => t.key === tab)?.label}模板：${label}`
        : `已保存${BACKLOT_TEMPLATE_TABS.find((t) => t.key === tab)?.label}模板：${label}`,
    );
    toastSuccess(existing ? `已更新模板「${label}」` : `已将「${label}」保存为模板`);
    collapseSaveTemplate();
  }, [
    selectedWs,
    resolveSaveGroup,
    linkedTemplate,
    addBacklotCustom,
    upsertBacklotWorkspace,
    appendLog,
    tab,
    collapseSaveTemplate,
  ]);

  const importTemplateToWorkspace = useCallback(
    (tpl: BacklotTemplate | BacklotCustomTemplate) => {
      const custom = isCustomTemplate(tpl);
      if (tab === 'character') {
        if ('characterArchetype' in tpl && tpl.characterArchetype) {
          const profile = importCharacterArchetype(
            tpl.characterArchetype,
            custom ? tpl.id : undefined,
          );
          setEditId(profile.id);
          return;
        }
        const c = newCharacter();
        c.name = tpl.label;
        c.consistencyPrompt = tpl.promptEn;
        c.descriptionZh = tpl.promptZh ?? '';
        if (custom) c.sourceTemplateId = tpl.id;
        upsertCharacter(c);
        setEditId(c.id);
        appendLog(`已导入到工作区：${c.name}`);
        return;
      }
      const ws = templateToWorkspaceItem(tpl, custom ? tpl.id : undefined);
      if (!ws) return;
      upsertBacklotWorkspace(ws);
      setEditId(ws.id);
      appendLog(`已导入到工作区：${ws.label}`);
    },
    [tab, importCharacterArchetype, upsertBacklotWorkspace, upsertCharacter, appendLog],
  );

  const loadStageDeckToWorkspace = useCallback(() => {
    if (!directorOpen || !selectedWs || tab !== 'scene') {
      appendLog('请先打开 Stage Deck');
      return;
    }
    const promptEn =
      directorProject.panorama?.url
        ? `Panorama scene, ${directorProject.objects.length} objects placed`
        : `Stage scene with ${directorProject.objects.length} objects, ${directorProject.cameras.length} cameras`;
    upsertBacklotWorkspace({
      ...selectedWs,
      promptEn,
      stageDeckScene: directorProject,
    });
    appendLog('已从 Stage Deck 载入场景到工作区');
  }, [directorOpen, directorProject, selectedWs, tab, upsertBacklotWorkspace, appendLog]);

  const handleUploadCharImage = useCallback(
    async (file: File, charId: string) => {
      try {
        const res = await api.uploadAsset(file);
        const c = characters.find((x) => x.id === charId);
        if (!c) return;
        upsertCharacter({ ...c, referenceImageUrl: res.url });
        appendLog(`已上传角色参考图 · ${c.name}`);
      } catch (e) {
        appendLog(`上传失败: ${String(e)}`);
      }
    },
    [characters, upsertCharacter, appendLog],
  );

  const handleUploadCharAudio = useCallback(
    async (file: File, charId: string) => {
      try {
        const res = await api.uploadAsset(file);
        const c = characters.find((x) => x.id === charId);
        if (!c) return;
        upsertCharacter({ ...c, referenceAudioUrl: res.url });
        appendLog(`已上传克隆参考音 · ${c.name}`);
      } catch (e) {
        appendLog(`参考音上传失败: ${String(e)}`);
      }
    },
    [characters, upsertCharacter, appendLog],
  );

  const workspaceListItems = useMemo(
    () =>
      tab === 'character'
        ? characters.map((c) => ({
            id: c.id,
            label: `${c.name}${c.referenceAudioUrl ? ' 🎙' : ''}`,
          }))
        : tabWorkspaceItems.map((i) => ({ id: i.id, label: i.label })),
    [tab, characters, tabWorkspaceItems],
  );
  const workspaceSelectedId =
    tab === 'character' ? selectedChar?.id : selectedWs?.id;

  if (!open) return null;

  return (
    <aside
      className={`w-[360px] shrink-0 border-l border-line bg-white flex flex-col h-full absolute top-0 z-30 shadow-panel ${
        dockLeftOfStoryboard ? 'right-[360px]' : 'right-0'
      }`}
    >
      <div className="h-12 shrink-0 border-b border-line flex items-center px-3 gap-2">
        <Layers size={18} className="text-brand" />
        <span className="font-semibold text-sm flex-1">Backlot 模板库</span>
        <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-surface text-ink/50">
          <X size={16} />
        </button>
      </div>

      <div className="flex gap-1 px-2 py-2 border-b border-line overflow-x-auto nx9-scroll">
        {BACKLOT_TEMPLATE_TABS.map((t: (typeof BACKLOT_TEMPLATE_TABS)[number]) => (
          <button
            key={t.key}
            type="button"
            onClick={() => handleTabChange(t.key)}
            className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border ${
              tab === t.key ? 'bg-brand/10 border-brand/40 text-brand font-medium' : 'border-line text-ink/60'
            }`}
            title={t.hint}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-3 py-2 border-b border-line space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/30" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索模板…"
            className="w-full pl-8 pr-2 py-1.5 text-xs rounded-lg border border-line"
          />
        </div>
        {selectedShotId && (
          <p className="text-[10px] text-brand/70 flex items-center gap-1">
            <Clapperboard size={12} />
            已选故事板镜头，「写入镜头」可用
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            className="flex-1 min-w-[88px] text-[10px] rounded-lg border border-line px-2 py-1 bg-white"
          >
            <option value="all">全部分组</option>
            {groupOptions.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value as 'all' | 'builtin' | 'custom')}
            className="flex-1 min-w-[88px] text-[10px] rounded-lg border border-line px-2 py-1 bg-white"
          >
            <option value="all">全部来源</option>
            <option value="builtin">仅内置</option>
            <option value="custom">仅自定义</option>
          </select>
          {tab === 'hook' && (
            <select
              value={filterHookPhase}
              onChange={(e) =>
                setFilterHookPhase(e.target.value as 'all' | 'opening' | 'ending')
              }
              className="flex-1 min-w-[88px] text-[10px] rounded-lg border border-line px-2 py-1 bg-white"
            >
              <option value="all">全部钩子</option>
              <option value="opening">开场</option>
              <option value="ending">结尾</option>
            </select>
          )}
        </div>
        <p className="text-[10px] text-ink/40">
          共 {filterStats.total} 项模板
          {filterStats.custom > 0 ? ` · 自定义 ${filterStats.custom}` : ''}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto nx9-scroll">
        <div className="border-b border-line">
          <div className="px-3 py-2 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wide text-ink/40 flex items-center gap-1">
              {tab === 'character' && <User size={12} />}
              {tabMeta.title}
            </span>
            <button
              type="button"
              onClick={() => {
                if (tab === 'character') {
                  const c = newCharacter();
                  upsertCharacter(c);
                  setEditId(c.id);
                } else {
                  const item = newBacklotWorkspaceItem(tab);
                  upsertBacklotWorkspace(item);
                  setEditId(item.id);
                }
                setSaveGroupKey(groupOptions[0] ?? '');
                setSaveTemplateExpanded(false);
                setNewGroupNameOnSave('');
              }}
              className="text-[10px] text-brand font-medium"
            >
              {tabMeta.newLabel}
            </button>
          </div>
          <div className="flex min-h-[140px]">
            <WorkspaceListSidebar
              items={workspaceListItems}
              selectedId={workspaceSelectedId}
              onSelect={setEditId}
              onDelete={handleDeleteWorkspaceItem}
            />
            {tab === 'character' && selectedChar ? (
              <div className="flex-1 p-2 space-y-1.5 text-[10px] overflow-y-auto nx9-scroll">
                <input
                  value={selectedChar.name}
                  onChange={(e) => upsertCharacter({ ...selectedChar, name: e.target.value })}
                  className="w-full font-semibold text-xs border-b border-line pb-0.5 focus:outline-none"
                />
                <textarea
                  value={selectedChar.descriptionZh ?? ''}
                  onChange={(e) =>
                    upsertCharacter({ ...selectedChar, descriptionZh: e.target.value })
                  }
                  placeholder="中文人设…"
                  className="w-full min-h-[40px] rounded-lg border border-line px-1.5 py-1"
                />
                <textarea
                  value={selectedChar.consistencyPrompt ?? ''}
                  onChange={(e) =>
                    upsertCharacter({ ...selectedChar, consistencyPrompt: e.target.value })
                  }
                  placeholder={tabMeta.promptPlaceholder}
                  className="w-full min-h-[56px] rounded-lg border border-line px-1.5 py-1 font-mono"
                />
                {selectedChar.referenceImageUrl ? (
                  <img
                    src={selectedChar.referenceImageUrl}
                    alt=""
                    className="w-full rounded-lg border border-line max-h-24 object-cover"
                  />
                ) : (
                  <div className="rounded-lg border border-dashed border-line py-3 text-center text-ink/40">
                    无参考图
                  </div>
                )}
                <label className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-line py-1.5 cursor-pointer hover:border-brand/40">
                  <Upload size={12} />
                  上传参考图
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUploadCharImage(f, selectedChar.id);
                    }}
                  />
                </label>
                <div className="rounded-lg border border-line p-1.5 space-y-1.5">
                  <div className="flex items-center gap-1 text-ink/70 font-medium">
                    <Mic size={12} />
                    LuxTTS 克隆参考音
                  </div>
                  {selectedChar.referenceAudioUrl ? (
                    <audio src={selectedChar.referenceAudioUrl} controls className="w-full h-7" />
                  ) : (
                    <p className="text-[10px] text-ink/40">≥3 秒 wav/mp3，用于本地音色克隆</p>
                  )}
                  <label className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-line py-1.5 cursor-pointer hover:border-brand/40">
                    <Upload size={12} />
                    上传参考音
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleUploadCharAudio(f, selectedChar.id);
                      }}
                    />
                  </label>
                </div>
                <WorkspaceApplyButtons
                  onSpawn={() =>
                    applyPrompt(
                      'character',
                      selectedChar.name,
                      selectedChar.consistencyPrompt ?? '',
                      selectedChar.descriptionZh,
                      'spawn',
                    )
                  }
                  onFill={() =>
                    applyPrompt(
                      'character',
                      selectedChar.name,
                      selectedChar.consistencyPrompt ?? '',
                      selectedChar.descriptionZh,
                      'fill',
                    )
                  }
                  onShot={() =>
                    applyPrompt(
                      'character',
                      selectedChar.name,
                      selectedChar.consistencyPrompt ?? '',
                      selectedChar.descriptionZh,
                      'shot',
                    )
                  }
                />
                <SaveAsTemplateSection
                  expanded={saveTemplateExpanded}
                  onExpand={() => {
                    setSaveGroupKey(groupOptions[0] ?? '');
                    setSaveTemplateExpanded(true);
                  }}
                  onCancel={collapseSaveTemplate}
                  groupOptions={groupOptions}
                  saveGroupKey={saveGroupKey}
                  showNewGroup={showNewGroupOnSave}
                  newGroupName={newGroupNameOnSave}
                  onGroupChange={handleSaveGroupChange}
                  onNewGroupNameChange={setNewGroupNameOnSave}
                  onSave={saveCharacterAsTemplate}
                  overwriteLabel={linkedTemplate?.label}
                />
              </div>
            ) : tab !== 'character' && selectedWs ? (
              <div className="flex-1 p-2 space-y-1.5 text-[10px]">
                <input
                  value={selectedWs.label}
                  onChange={(e) => upsertBacklotWorkspace({ ...selectedWs, label: e.target.value })}
                  className="w-full font-semibold text-xs border-b border-line pb-0.5 focus:outline-none"
                />
                {tab === 'hook' && (
                  <div className="flex gap-1">
                    {(['opening', 'ending'] as const).map((phase) => (
                      <button
                        key={phase}
                        type="button"
                        onClick={() =>
                          upsertBacklotWorkspace({ ...selectedWs, hookPhase: phase })
                        }
                        className={`flex-1 text-[10px] py-1 rounded-lg border ${
                          selectedWs.hookPhase === phase
                            ? 'border-brand bg-brand/10 text-brand'
                            : 'border-line text-ink/50'
                        }`}
                      >
                        {phase === 'opening' ? '开场' : '结尾'}
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  value={selectedWs.promptEn}
                  onChange={(e) =>
                    upsertBacklotWorkspace({ ...selectedWs, promptEn: e.target.value })
                  }
                  placeholder={tabMeta.promptPlaceholder}
                  className="w-full min-h-[56px] rounded-lg border border-line px-1.5 py-1 font-mono"
                />
                <input
                  value={selectedWs.promptZh ?? ''}
                  onChange={(e) =>
                    upsertBacklotWorkspace({ ...selectedWs, promptZh: e.target.value })
                  }
                  placeholder="中文说明（可选）"
                  className="w-full text-xs rounded-lg border border-line px-1.5 py-1"
                />
                {tab === 'scene' && (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={loadStageDeckToWorkspace}
                      disabled={!directorOpen}
                      className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-line py-1.5 disabled:opacity-40"
                    >
                      <Sparkles size={12} />
                      从 Stage Deck 载入
                    </button>
                    {!!selectedWs.stageDeckScene && (
                      <button
                        type="button"
                        onClick={() => openStageDeckScene(selectedWs.stageDeckScene)}
                        className="flex-1 rounded-lg border border-brand/30 text-brand py-1.5"
                      >
                        在 Stage Deck 打开
                      </button>
                    )}
                  </div>
                )}
                <WorkspaceApplyButtons
                  onSpawn={() =>
                    applyPrompt(tab, selectedWs.label, selectedWs.promptEn, selectedWs.promptZh, 'spawn', {
                      stageDeckScene: selectedWs.stageDeckScene,
                    })
                  }
                  onFill={() =>
                    applyPrompt(tab, selectedWs.label, selectedWs.promptEn, selectedWs.promptZh, 'fill', {
                      stageDeckScene: selectedWs.stageDeckScene,
                    })
                  }
                  onShot={() =>
                    applyPrompt(tab, selectedWs.label, selectedWs.promptEn, selectedWs.promptZh, 'shot', {
                      stageDeckScene: selectedWs.stageDeckScene,
                    })
                  }
                />
                <SaveAsTemplateSection
                  expanded={saveTemplateExpanded}
                  onExpand={() => {
                    setSaveGroupKey(groupOptions[0] ?? '');
                    setSaveTemplateExpanded(true);
                  }}
                  onCancel={collapseSaveTemplate}
                  groupOptions={groupOptions}
                  saveGroupKey={saveGroupKey}
                  showNewGroup={showNewGroupOnSave}
                  newGroupName={newGroupNameOnSave}
                  onGroupChange={handleSaveGroupChange}
                  onNewGroupNameChange={setNewGroupNameOnSave}
                  onSave={saveWorkspaceAsTemplate}
                  overwriteLabel={linkedTemplate?.label}
                />
              </div>
            ) : (
              <p className="flex-1 p-3 text-ink/40 text-[10px]">{tabMeta.emptyHint}</p>
            )}
          </div>
        </div>

        <div className="border-b border-line px-3 py-2">
          <span className="text-[10px] uppercase tracking-wide text-ink/40">模板库</span>
          <p className="text-[10px] text-ink/40 mt-1">内置与已保存模板，可导入工作区或直接应用</p>
        </div>

        <div className="p-3 space-y-4">
          {groupedTemplates.length === 0 ? (
            <p className="text-xs text-ink/40 text-center py-8">
              {allTabTemplates.length === 0 ? '暂无模板' : '无匹配结果，试试调整筛选'}
            </p>
          ) : (
            groupedTemplates.map(([group, items]) => (
              <section key={group}>
                <h3 className="text-[10px] uppercase tracking-wide text-ink/40 mb-2 flex items-center gap-2">
                  {group}
                  <span className="text-ink/30 font-normal normal-case">
                    {items.filter(isCustomTemplate).length > 0 &&
                    items.some((t) => !isCustomTemplate(t))
                      ? '内置 + 自定义'
                      : items.every(isCustomTemplate)
                        ? '自定义分组'
                        : '内置'}
                  </span>
                </h3>
                <ul className="space-y-2">
                  {items.map((tpl) => {
                    const custom = isCustomTemplate(tpl);
                    const prompt = backlotTemplatePrompt(tpl);
                    return (
                      <TemplateCard
                        key={tpl.id}
                        label={tpl.label}
                        description={custom ? tpl.promptZh : tpl.description}
                        promptPreview={prompt}
                        isCustom={custom}
                        showImport={
                          tab !== 'character' ||
                          !('characterArchetype' in tpl && tpl.characterArchetype)
                        }
                        showCharacter={
                          tab === 'character' && 'characterArchetype' in tpl && !!tpl.characterArchetype
                        }
                        showStage={tab === 'scene' && 'stageDeckScene' in tpl && !!tpl.stageDeckScene}
                        onFill={() => applyTemplate(tpl, 'fill')}
                        onSpawn={() => applyTemplate(tpl, 'spawn')}
                        onShot={() => applyTemplate(tpl, 'shot')}
                        onImport={() => importTemplateToWorkspace(tpl)}
                        onCharacter={
                          'characterArchetype' in tpl && tpl.characterArchetype
                            ? () => applyTemplate(tpl, 'character')
                            : undefined
                        }
                        onStage={
                          'stageDeckScene' in tpl && tpl.stageDeckScene
                            ? () =>
                                applyTemplate(
                                  { ...tpl, stageDeckScene: tpl.stageDeckScene },
                                  'stage',
                                )
                            : undefined
                        }
                        onDelete={
                          custom ? () => handleDeleteCustomTemplate(tpl as BacklotCustomTemplate) : undefined
                        }
                      />
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
