import { useCallback, useEffect, useMemo } from 'react';
import {
  listConnectedPictureModels,
  type ConnectedPictureModelOption,
  type ModelConnection,
} from '@nx9/shared';
import { useCredentialVault } from '../stores/credential-vault';

/**
 * 图像生成模型下拉：展示「设置 → 连接」里图片连接的默认模型，
 * 以及「自动获取」缓存的 availableModels。
 * 切换模型时同步将该连接设为当前，并回写连接默认 model。
 */
export function useConnectedPictureModels(currentModel?: string) {
  const settings = useCredentialVault((s) => s.settings);
  const load = useCredentialVault((s) => s.load);
  const save = useCredentialVault((s) => s.save);
  const openSettingsTo = useCredentialVault((s) => s.openSettingsTo);

  useEffect(() => {
    if (!settings) void load();
  }, [settings, load]);

  const connected = useMemo(
    () => listConnectedPictureModels(settings?.connections),
    [settings?.connections],
  );

  const options = useMemo(
    () => connected.map((m) => ({ id: m.id, label: m.label })),
    [connected],
  );

  const resolveOption = useCallback(
    (modelId: string): ConnectedPictureModelOption | undefined =>
      connected.find((m) => m.id === modelId || m.connectionModel === modelId),
    [connected],
  );

  const selectModel = useCallback(
    async (modelId: string, onLocalPatch: (model: string) => void) => {
      onLocalPatch(modelId);
      const hit = resolveOption(modelId);
      const conns = settings?.connections;
      if (!hit || !conns?.length) return;

      const next: ModelConnection[] = conns.map((c) => {
        if (c.kind !== 'image') return c;
        if (c.id !== hit.connectionId) return { ...c, isActive: false };
        return {
          ...c,
          isActive: true,
          model: hit.connectionModel,
        };
      });
      await save({ connections: next });
    },
    [resolveOption, save, settings?.connections],
  );

  /** 当前节点模型若不在已连接列表中，回落到当前连接 / 首个连接 */
  const preferredModel = useMemo(() => {
    if (currentModel && resolveOption(currentModel)) return currentModel;
    return connected[0]?.id;
  }, [connected, currentModel, resolveOption]);

  return {
    options,
    connected,
    hasConnections: connected.length > 0,
    preferredModel,
    selectModel,
    openConnectionsSettings: () => openSettingsTo('connection'),
  };
}
