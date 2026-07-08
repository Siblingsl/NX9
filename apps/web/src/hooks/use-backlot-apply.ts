import { useCallback } from 'react';
import type { BacklotApplyTarget, BacklotCustomTemplate, BacklotTemplateKind } from '@nx9/shared';
import { archetypeToCharacter } from '@nx9/shared';
import { emptyDirectorProject, normalizeDirectorProject } from '@nx9/director3d';
import { useFlowCommands } from '../stores/flow-commands';
import { useFlowRuntime, useStoryboardUi } from '../stores/flow-runtime';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { useDirector3dUi } from '../stores/director3d-ui';
import { useActivityLog } from '../stores/activity-log';

const FILLABLE_TYPES = new Set([
  'prompt',
  'chat-model',
  'memo',
  'cinema-prompt',
  'camera-prompt',
  'picture-gen',
  'clip-gen',
]);

const BLOCK_FOR_KIND: Partial<Record<BacklotTemplateKind, BacklotApplyTarget>> = {
  scene: 'picture-gen',
  shot: 'camera-prompt',
  emotion: 'cinema-prompt',
  hook: 'prompt',
};

export function useBacklotApply() {
  const requestSpawn = useFlowCommands((s) => s.requestSpawn);
  const runtime = useFlowRuntime((s) => s.runtime);
  const selectedShotId = useStoryboardUi((s) => s.selectedShotId);
  const updateShot = useWorkspaceDocument((s) => s.updateShot);
  const upsertCharacter = useWorkspaceDocument((s) => s.upsertCharacter);
  const addBacklotCustom = useWorkspaceDocument((s) => s.addBacklotCustom);
  const openForBlock = useDirector3dUi((s) => s.openForBlock);
  const appendLog = useActivityLog((s) => s.append);

  const fillSelection = useCallback(
    (promptEn: string, preferredType?: string) => {
      if (!runtime) {
        appendLog('画布尚未就绪');
        return false;
      }
      const selected = runtime.getNodes().filter((n) => n.selected);
      let targets = selected.filter((n) => n.type && FILLABLE_TYPES.has(n.type));
      if (targets.length === 0 && preferredType) {
        targets = selected.filter((n) => n.type === preferredType);
      }
      if (targets.length === 0) return false;
      for (const node of targets) {
        runtime.updateNodeData(node.id, { content: promptEn, status: 'idle' });
      }
      appendLog(`已填入 ${targets.length} 个模块`);
      return true;
    },
    [runtime, appendLog],
  );

  const spawnBlock = useCallback(
    (blockType: string, promptEn: string, extra?: Record<string, unknown>) => {
      requestSpawn(blockType, undefined, { content: promptEn, status: 'idle', ...extra });
      appendLog(`已添加 ${blockType} 模块`);
    },
    [requestSpawn, appendLog],
  );

  const applyToShot = useCallback(
    (promptEn: string, promptZh?: string) => {
      if (!selectedShotId) {
        appendLog('请先在故事板选中镜头');
        return false;
      }
      updateShot(selectedShotId, {
        promptEn,
        descriptionZh: promptZh ?? promptEn,
      });
      appendLog('已写入故事板镜头');
      return true;
    },
    [selectedShotId, updateShot, appendLog],
  );

  const importCharacterArchetype = useCallback(
    (
      archetype: Parameters<typeof archetypeToCharacter>[0],
      sourceTemplateId?: string,
    ) => {
      const profile = archetypeToCharacter(archetype, undefined, sourceTemplateId);
      upsertCharacter(profile);
      appendLog(`已导入角色：${profile.name}`);
      return profile;
    },
    [upsertCharacter, appendLog],
  );

  const openStageDeckScene = useCallback(
    (stageDeckScene?: unknown, panoramaUrl?: string) => {
      const base = stageDeckScene
        ? normalizeDirectorProject(stageDeckScene)
        : emptyDirectorProject();
      const withPano = panoramaUrl
        ? { ...base, panorama: { url: panoramaUrl, yaw: 0, exposure: 1 } }
        : base;
      openForBlock('backlot-scene', withPano);
      appendLog('已在 Stage Deck 打开场景');
    },
    [openForBlock, appendLog],
  );

  const saveCustomTemplate = useCallback(
    (item: BacklotCustomTemplate) => {
      addBacklotCustom(item);
      appendLog(`已保存自定义模板：${item.label}`);
    },
    [addBacklotCustom, appendLog],
  );

  const applyTemplate = useCallback(
    (
      tpl: {
        kind: BacklotTemplateKind;
        label: string;
        promptEn: string;
        promptZh?: string;
        defaultBlockType?: BacklotApplyTarget;
        characterArchetype?: Parameters<typeof archetypeToCharacter>[0];
        stageDeckScene?: unknown;
      },
      action: 'fill' | 'spawn' | 'shot' | 'character' | 'stage',
    ) => {
      const prompt = tpl.promptEn?.trim() || tpl.promptZh?.trim() || '';
      const blockType = tpl.defaultBlockType ?? BLOCK_FOR_KIND[tpl.kind] ?? 'prompt';

      if (action === 'character' && tpl.characterArchetype) {
        importCharacterArchetype(tpl.characterArchetype);
        return true;
      }
      if (action === 'stage') {
        openStageDeckScene(tpl.stageDeckScene);
        if (prompt) spawnBlock('prompt', prompt);
        return true;
      }
      if (action === 'shot') {
        return applyToShot(prompt, tpl.promptZh);
      }
      if (action === 'fill') {
        const ok = fillSelection(prompt, blockType);
        if (!ok) spawnBlock(blockType, prompt);
        return true;
      }
      spawnBlock(blockType, prompt);
      return true;
    },
    [
      fillSelection,
      spawnBlock,
      applyToShot,
      importCharacterArchetype,
      openStageDeckScene,
    ],
  );

  return {
    fillSelection,
    spawnBlock,
    applyToShot,
    importCharacterArchetype,
    openStageDeckScene,
    saveCustomTemplate,
    applyTemplate,
    selectedShotId,
  };
}
