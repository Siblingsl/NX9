import JSZip from 'jszip';
import type { Edge, Node } from '@xyflow/react';
import type { TakeRecord, WorkspacePayload, WorkspacePayloadV3 } from '@nx9/shared';
import { api } from '../../../api/client';
import { fromPayload, toPayload } from '../../flow-payload';
import { relocateNodeGroup } from '../../spawn-placement';
import { newTakeId } from './take-utils';

const ASSET_URL_RE =
  /https?:\/\/[^\s"'<>]+|\/(?:media|api\/assets)[^\s"'<>]*/gi;

const RUNTIME_KEYS = ['status', 'taskId', 'progress', 'error', 'isRunning', 'isPolling'];

function collectAssetUrls(value: unknown, out: Set<string>): void {
  if (value == null) return;
  if (typeof value === 'string') {
    const matches = value.match(ASSET_URL_RE);
    if (matches) matches.forEach((u) => out.add(u));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => collectAssetUrls(v, out));
    return;
  }
  if (typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((v) => collectAssetUrls(v, out));
  }
}

function assetFileName(url: string, index: number): string {
  try {
    const path = url.startsWith('http') ? new URL(url).pathname : url;
    const base = path.split('/').pop() ?? `asset-${index}`;
    return base.includes('.') ? base : `${base}.bin`;
  } catch {
    return `asset-${index}.bin`;
  }
}

function sanitizeNodeData(data: Record<string, unknown> | undefined): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(data ?? {}) };
  for (const key of RUNTIME_KEYS) delete next[key];
  next.status = 'idle';
  return next;
}

function replaceUrlsInValue(value: unknown, urlMap: Map<string, string>): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    let next = value;
    for (const [from, to] of urlMap) {
      if (next.includes(from)) next = next.split(from).join(to);
    }
    return next;
  }
  if (Array.isArray(value)) return value.map((v) => replaceUrlsInValue(v, urlMap));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = replaceUrlsInValue(v, urlMap);
    }
    return out;
  }
  return value;
}

export interface WorkflowZipExportInput {
  workspaceId: string;
  nodes: Node[];
  edges: Edge[];
  viewport: { x: number; y: number; zoom: number };
  nextBlockIndex: number;
  selectionOnly: boolean;
  v3Extras?: Parameters<typeof toPayload>[4];
}

export interface ImportedWorkflow {
  nodes: Node[];
  edges: Edge[];
  viewport: { x: number; y: number; zoom: number };
  nextBlockIndex: number;
  aliases: Record<string, string>;
  takes: TakeRecord[];
  viewMode?: WorkspacePayloadV3['viewMode'];
}

/** P4-04: 选区/全画布 JSON + assets 打包 ZIP */
export async function exportWorkflowZip(input: WorkflowZipExportInput): Promise<Blob> {
  const selectedIds = new Set(
    input.selectionOnly ? input.nodes.filter((n) => n.selected).map((n) => n.id) : input.nodes.map((n) => n.id),
  );
  const exportNodes = input.nodes.filter((n) => selectedIds.has(n.id));
  const exportEdges = input.edges.filter(
    (e) => selectedIds.has(e.source) && selectedIds.has(e.target),
  );

  const payload = toPayload(
    exportNodes,
    exportEdges,
    input.viewport,
    input.nextBlockIndex,
    input.v3Extras,
  ) as WorkspacePayload;

  const assetUrls = new Set<string>();
  collectAssetUrls(payload, assetUrls);

  const zip = new JSZip();
  zip.file('workspace.json', JSON.stringify(payload, null, 2));

  const assetsFolder = zip.folder('assets');
  let i = 0;
  const urlMap: Record<string, string> = {};

  for (const url of assetUrls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.blob();
      const name = assetFileName(url, i++);
      urlMap[url] = `assets/${name}`;
      assetsFolder?.file(name, blob);
    } catch {
      /* skip unreachable assets */
    }
  }

  if (Object.keys(urlMap).length > 0) {
    zip.file('asset-map.json', JSON.stringify(urlMap, null, 2));
  }

  return zip.generateAsync({ type: 'blob' });
}

/** P4-04: 从 ZIP 解析工作流并上传内嵌资源 */
export async function importWorkflowZip(file: File): Promise<ImportedWorkflow> {
  const zip = await JSZip.loadAsync(file);
  const jsonStr = await zip.file('workspace.json')?.async('string');
  if (!jsonStr) throw new Error('ZIP 缺少 workspace.json');

  let payload = JSON.parse(jsonStr) as WorkspacePayload;

  const mapStr = await zip.file('asset-map.json')?.async('string');
  if (mapStr) {
    const zipPathMap = JSON.parse(mapStr) as Record<string, string>;
    const resolved = new Map<string, string>();

    for (const [origUrl, zipPath] of Object.entries(zipPathMap)) {
      const entry = zip.file(zipPath);
      if (!entry) continue;
      const blob = await entry.async('blob');
      const name = zipPath.split('/').pop() ?? 'asset.bin';
      const uploadFile = new File([blob], name, {
        type: blob.type || 'application/octet-stream',
      });
      try {
        const uploaded = await api.uploadAsset(uploadFile);
        resolved.set(origUrl, uploaded.url);
      } catch {
        /* keep original url if upload fails */
      }
    }

    if (resolved.size > 0) {
      payload = replaceUrlsInValue(payload, resolved) as WorkspacePayload;
    }
  }

  const parsed = fromPayload(payload, { channelEdges: true });
  const v3 = parsed.v3;

  return {
    nodes: parsed.nodes,
    edges: parsed.edges,
    viewport: parsed.viewport,
    nextBlockIndex: parsed.nextBlockIndex,
    aliases: v3.aliases ?? {},
    takes: v3.takes ?? [],
    viewMode: v3.viewMode,
  };
}

function remapImportedIds(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[]; idMap: Map<string, string> } {
  const idMap = new Map<string, string>();
  const stamp = Date.now();

  const remappedNodes = nodes.map((n, idx) => {
    const newId = `blk-${stamp}-${idx}-${Math.random().toString(36).slice(2, 5)}`;
    idMap.set(n.id, newId);
    return {
      ...n,
      id: newId,
      selected: true,
      data: sanitizeNodeData(n.data as Record<string, unknown>),
    } as Node;
  });

  const remappedEdges = edges
    .map((e, idx) => {
      const source = idMap.get(e.source);
      const target = idMap.get(e.target);
      if (!source || !target) return null;
      return {
        ...e,
        id: `link-${stamp}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
        source,
        target,
      } as Edge;
    })
    .filter(Boolean) as Edge[];

  return { nodes: remappedNodes, edges: remappedEdges, idMap };
}

function remapAliases(
  aliases: Record<string, string>,
  idMap: Map<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [blockId, alias] of Object.entries(aliases)) {
    const nextId = idMap.get(blockId);
    if (nextId) out[nextId] = alias;
  }
  return out;
}

function remapTakes(takes: TakeRecord[], idMap: Map<string, string>): TakeRecord[] {
  return takes
    .map((t) => {
      const blockId = idMap.get(t.blockId);
      if (!blockId) return null;
      return { ...t, id: newTakeId(), blockId };
    })
    .filter(Boolean) as TakeRecord[];
}

/** 追加导入：重映射 ID 并平移到空白区域 */
export function mergeImportedWorkflow(
  existingNodes: Node[],
  existingEdges: Edge[],
  imported: ImportedWorkflow,
): {
  nodes: Node[];
  edges: Edge[];
  aliases: Record<string, string>;
  takes: TakeRecord[];
} {
  const { nodes: remapped, edges: remappedEdges, idMap } = remapImportedIds(
    imported.nodes,
    imported.edges,
  );
  const placed = relocateNodeGroup(remapped, existingNodes);
  const maxIndex = existingNodes.reduce(
    (m, n) => Math.max(m, (n.data?.blockIndex as number) ?? 0),
    0,
  );
  const nodes = placed.map((n, i) => ({
    ...n,
    data: { ...n.data, blockIndex: maxIndex + i + 1 },
  }));

  return {
    nodes,
    edges: remappedEdges,
    aliases: remapAliases(imported.aliases, idMap),
    takes: remapTakes(imported.takes, idMap),
  };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
