import { useCallback, useEffect, useMemo } from 'react';
import {
  isBuiltinVideoModelId,
  listConnectedVideoModels,
  listMergedVideoModelOptions,
  listVideoGenModelOptions,
  resolveActiveVideoConnectionModel,
  type AppSettings,
  type ConnectedVideoModelOption,
  type MergedModelOption,
  type ModelConnection,
} from '@nx9/shared';
import { useCredentialVault } from '../stores/credential-vault';

/**
 * 视频生成模型下拉：内置目录（NX9 自带）+「设置 → 连接」里视频连接的默认模型与 availableModels。
 *
 * - `options` / `connected` 保持既有语义（仅连接），兼容老调用方；
 * - `mergedOptions` 供新下拉使用：内置在前、带 source 与分组标题；
 * - 选中内置模型只写节点 model（由调用方 patch），不会改动/激活任何连接；
 *   选中连接模型时行为与既有完全一致（激活连接并回写 videoApiKey/videoBaseUrl）。
 */
export function useConnectedVideoModels(currentModel?: string) {
  const settings = useCredentialVault((s) => s.settings);
  const load = useCredentialVault((s) => s.load);
  const save = useCredentialVault((s) => s.save);
  const openSettingsTo = useCredentialVault((s) => s.openSettingsTo);

  useEffect(() => {
    if (!settings) void load();
  }, [settings, load]);

  const connected = useMemo(
    () => listConnectedVideoModels(settings?.connections),
    [settings?.connections],
  );

  const options = useMemo(
    () => listVideoGenModelOptions(settings?.connections),
    [settings?.connections],
  );

  const mergedOptions = useMemo(
    (): MergedModelOption[] => listMergedVideoModelOptions(settings?.connections),
    [settings?.connections],
  );

  const resolveConnected = useCallback(
    (modelId: string): ConnectedVideoModelOption | undefined =>
      connected.find((m) => m.id === modelId || m.connectionModel === modelId),
    [connected],
  );

  /** 已知模型 = 用户连接模型 ∪ 内置目录模型（内置同样不能被回落逻辑覆盖） */
  const isKnownModel = useCallback(
    (modelId: string) => Boolean(resolveConnected(modelId)) || isBuiltinVideoModelId(modelId),
    [resolveConnected],
  );

  const selectModel = useCallback(
    async (modelId: string, onLocalPatch: (model: string) => void) => {
      onLocalPatch(modelId);
      const hit = resolveConnected(modelId);
      const conns = settings?.connections;
      if (!hit || !conns?.length) return;

      const target = conns.find((c) => c.id === hit.connectionId);
      if (!target || target.kind !== 'video') return;

      const provider = (['xai', 'grokgo', 'custom'].includes(target.provider)
        ? target.provider
        : 'custom') as AppSettings['videoProvider'];

      const next: ModelConnection[] = conns.map((c) => {
        if (c.kind !== 'video') return c;
        if (c.id !== hit.connectionId) return { ...c, isActive: false };
        return {
          ...c,
          isActive: true,
          model: hit.connectionModel,
        };
      });

      await save({
        connections: next,
        videoApiKey: target.apiKey,
        videoBaseUrl: target.baseUrl,
        videoProvider: provider,
      });
    },
    [resolveConnected, save, settings?.connections],
  );

  /** 节点 model 无效时回落到当前视频连接默认模型 */
  const preferredModel = useMemo(() => {
    const raw = (currentModel ?? '').trim();
    if (raw && isKnownModel(raw)) return raw;
    const activeModel = resolveActiveVideoConnectionModel(settings?.connections);
    if (activeModel && resolveConnected(activeModel)) return activeModel;
    return connected[0]?.id ?? '';
  }, [connected, currentModel, isKnownModel, resolveConnected, settings?.connections]);

  return {
    options,
    mergedOptions,
    connected,
    hasConnections: connected.length > 0,
    /** 内置目录始终可用（与是否有连接无关） */
    hasBuiltins: mergedOptions.some((m) => m.source === 'builtin'),
    preferredModel,
    isKnownModel,
    selectModel,
    openConnectionsSettings: () => openSettingsTo('connection'),
  };
}
