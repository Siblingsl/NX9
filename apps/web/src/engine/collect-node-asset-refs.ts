/**

 * OL-04：从画布节点收集 AssetRef / usedAssetIds，供影响分析。

 */

import type { AssetLibraryKind, AssetRef } from '@nx9/shared';

import { stripAssetPinRevision } from '@nx9/shared';



export interface ImpactNodeAssetRef {

  nodeId: string;

  nodeLabel: string;

  nodeType: string;

  kind: AssetLibraryKind | string;

  assetId?: string;

  label?: string;

}



function asRef(value: unknown): AssetRef | null {

  if (!value || typeof value !== 'object') return null;

  const r = value as Partial<AssetRef>;

  if (!r.id || !r.kind || !r.label) return null;

  return {

    id: String(r.id),

    kind: r.kind as AssetLibraryKind,

    scope: (r.scope as AssetRef['scope']) || 'private',

    label: String(r.label),

  };

}



function nodeTitle(node: { id: string; type?: string | null; data?: Record<string, unknown> }): string {

  const d = node.data ?? {};

  const title =

    (typeof d.title === 'string' && d.title.trim())

    || (typeof d.label === 'string' && d.label.trim())

    || (typeof d.name === 'string' && d.name.trim())

    || '';

  const kind = node.type || 'node';

  return title ? `${kind} · ${title}` : `${kind} · ${node.id.slice(0, 8)}`;

}



const REF_FIELDS: Array<{ key: string; kind?: AssetLibraryKind }> = [

  { key: 'characterAssetRef', kind: 'character' },

  { key: 'sceneAssetRef', kind: 'scene' },

  { key: 'shotAssetRef', kind: 'shot' },

  { key: 'emotionAssetRef', kind: 'emotion' },

  { key: 'hookAssetRef', kind: 'hook' },

  { key: 'assetRef', kind: 'hook' },

  { key: 'soundAssetRef', kind: 'sound' },

  { key: 'voiceAssetRef', kind: 'sound' },

  { key: 'costumeAssetRef', kind: 'costume' },

  { key: 'propAssetRef', kind: 'prop' },

  { key: 'styleAssetRef', kind: 'style' },

];



/**

 * 扫描画布节点上的结构化 AssetRef、usedAssetIds、characterInjected。

 */

export function collectNodeAssetUsages(

  nodes: Array<{ id: string; type?: string | null; data?: Record<string, unknown> }>,

): ImpactNodeAssetRef[] {

  const out: ImpactNodeAssetRef[] = [];

  const seen = new Set<string>();



  const push = (row: ImpactNodeAssetRef) => {

    const key = `${row.nodeId}:${row.kind}:${row.assetId ?? ''}:${row.label ?? ''}`;

    if (seen.has(key)) return;

    seen.add(key);

    out.push(row);

  };



  for (const node of nodes) {

    const d = node.data ?? {};

    const label = nodeTitle(node);

    const nodeType = node.type || 'unknown';



    for (const field of REF_FIELDS) {

      const ref = asRef(d[field.key]);

      if (!ref) continue;

      push({

        nodeId: node.id,

        nodeLabel: label,

        nodeType,

        kind: field.kind ?? ref.kind,

        assetId: ref.id,

        label: ref.label,

      });

    }



    const used = d.usedAssetIds;

    if (Array.isArray(used)) {

      for (const token of used) {

        if (typeof token !== 'string' || !token.trim()) continue;

        const id = stripAssetPinRevision(token);

        push({

          nodeId: node.id,

          nodeLabel: label,

          nodeType,

          kind: 'unknown',

          assetId: id,

        });

      }

    }



    const injected = d.characterInjected;

    if (Array.isArray(injected)) {

      for (const id of injected) {

        if (typeof id !== 'string' || !id.trim()) continue;

        push({

          nodeId: node.id,

          nodeLabel: label,

          nodeType,

          kind: 'character',

          assetId: id.trim(),

        });

      }

    }

  }



  return out;

}


