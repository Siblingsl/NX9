import { useCallback, useEffect, useMemo } from 'react';
import {
  listConnectedVideoModels,
  listVideoGenModelOptions,
  resolveActiveVideoConnectionModel,
  type AppSettings,
  type ConnectedVideoModelOption,
  type ModelConnection,
} from '@nx9/shared';
import { useCredentialVault } from '../stores/credential-vault';

/**
 * 视频生成模型下拉：仅「设置 → 连接」里视频连接的默认模型与 availableModels。
 * 选中时同步激活该连接，并回写 videoApiKey / videoBaseUrl。
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

  const resolveConnected = useCallback(
    (modelId: string): ConnectedVideoModelOption | undefined =>
      connected.find((m) => m.id === modelId || m.connectionModel === modelId),
    [connected],
  );

  const isKnownModel = useCallback(
    (modelId: string) => Boolean(resolveConnected(modelId)),
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
    connected,
    hasConnections: connected.length > 0,
    preferredModel,
    isKnownModel,
    selectModel,
    openConnectionsSettings: () => openSettingsTo('connection'),
  };
}
