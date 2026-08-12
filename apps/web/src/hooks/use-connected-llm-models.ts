import { useCallback, useEffect, useMemo } from 'react';
import {
  listConnectedLlmModels,
  type ConnectedLlmModelOption,
  type ModelConnection,
} from '@nx9/shared';
import { useCredentialVault } from '../stores/credential-vault';

/**
 * 文字模型下拉：展示「设置 → 连接」里 LLM 连接的默认模型，
 * 以及「自动获取」缓存的 availableModels。
 * 切换时同步激活该连接，并回写 llmModel / llmApiKey / llmBaseUrl。
 */
export function useConnectedLlmModels() {
  const settings = useCredentialVault((s) => s.settings);
  const load = useCredentialVault((s) => s.load);
  const save = useCredentialVault((s) => s.save);
  const openSettingsTo = useCredentialVault((s) => s.openSettingsTo);

  useEffect(() => {
    if (!settings) void load();
  }, [settings, load]);

  const connected = useMemo(
    () => listConnectedLlmModels(settings?.connections),
    [settings?.connections],
  );

  const options = useMemo(
    () => connected.map((m) => ({ id: m.id, label: m.label, connectionModel: m.connectionModel })),
    [connected],
  );

  const activeOption = useMemo((): ConnectedLlmModelOption | undefined => {
    const conns = settings?.connections ?? [];
    const active = conns.find((c) => c.kind === 'llm' && c.isActive);
    const model = (active?.model || settings?.llmModel || '').trim();
    if (!model) return connected[0];
    if (active) {
      const hit = connected.find((m) => m.connectionId === active.id && m.connectionModel === model);
      if (hit) return hit;
    }
    return connected.find((m) => m.connectionModel === model) ?? connected[0];
  }, [connected, settings?.connections, settings?.llmModel]);

  const selectModel = useCallback(
    async (optionId: string) => {
      const hit = connected.find((m) => m.id === optionId);
      const conns = settings?.connections;
      if (!hit || !conns?.length) return;

      const target = conns.find((c) => c.id === hit.connectionId);
      if (!target || target.kind !== 'llm') return;

      const next: ModelConnection[] = conns.map((c) => {
        if (c.kind !== 'llm') return c;
        if (c.id !== hit.connectionId) return { ...c, isActive: false };
        return {
          ...c,
          isActive: true,
          model: hit.connectionModel,
        };
      });

      await save({
        connections: next,
        llmApiKey: target.apiKey,
        llmBaseUrl: target.baseUrl,
        llmModel: hit.connectionModel,
      });
    },
    [connected, save, settings?.connections],
  );

  return {
    options,
    connected,
    hasConnections: connected.length > 0,
    activeOption,
    llmModelLabel: activeOption?.connectionModel
      ?? (settings?.llmModel ?? '').trim(),
    selectModel,
    openConnectionsSettings: () => openSettingsTo('connection'),
  };
}
