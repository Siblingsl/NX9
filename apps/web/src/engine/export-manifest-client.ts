/**
 * export-manifest-client — 导出清单客户端 SDK（F-015）。
 *
 * 调用服务端 /api/export/manifest/csv 和 /api/export/manifest/pdf。
 */
import type { ManifestRow } from '@nx9/shared';

export interface ManifestGenerateResult {
  url: string;
}

export async function generateManifestCsv(
  csv: string,
  prefix?: string,
): Promise<ManifestGenerateResult> {
  const res = await fetch('/api/export/manifest/csv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv, prefix }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`CSV 生成失败: ${text}`);
  }
  return res.json();
}

export async function generateManifestPdf(
  rows: ManifestRow[],
  prefix?: string,
  title?: string,
): Promise<ManifestGenerateResult> {
  const res = await fetch('/api/export/manifest/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows, prefix, title }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`PDF 生成失败: ${text}`);
  }
  return res.json();
}
