/**
 * export-manifest.ts — 导出清单 PDF/CSV + 导出历史可恢复（F-015）。
 *
 * 导出成功时写 exportHistory[]（挂 export-pack 节点 data 与/或链 desk）。
 * CSV：镜头表 + 素材 URL；PDF：简易版原生 PDF 生成。
 */
import type { StoryboardShot, EpisodeExportRecord } from '../types/storyboard';

/** 将字符串转换为 PDF-safe ASCII（非 ASCII 用 `?` 代替，保证 PDF 兼容） */
function pdfSafe(s: string, maxLen = 60): string {
  const filtered = [...s].map((ch) => (ch.charCodeAt(0) < 128 ? ch : '?')).join('');
  return filtered.length > maxLen ? filtered.slice(0, maxLen - 3) + '...' : filtered;
}

export interface ManifestRow {
  index: number;
  shotId: string;
  description: string;
  durationSec: number;
  imageUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  characterNames?: string[];
  sceneName?: string | null;
}

/**
 * 从 shots 构建 CSV 行。
 */
export function shotsToManifestRows(shots: StoryboardShot[]): ManifestRow[] {
  return shots.map((shot) => ({
    index: shot.index,
    shotId: shot.id,
    description: shot.descriptionZh || shot.promptEn || '',
    durationSec: shot.durationSec || 5,
    imageUrl: shot.firstFrameAssetId,
    videoUrl: shot.videoAssetId,
    audioUrl: shot.audioAssetId,
    characterNames: shot.characterNames,
    sceneName: shot.sceneName,
  }));
}

/**
 * 生成 CSV 内容。
 */
export function manifestToCsv(rows: ManifestRow[]): string {
  const header = '镜头序号,镜头ID,描述,时长(秒),关键帧URL,视频URL,音频URL,角色,场景';
  const lines = rows.map(
    (r) =>
      [
        r.index,
        r.shotId,
        `"${(r.description || '').replace(/"/g, '""')}"`,
        r.durationSec,
        r.imageUrl ?? '',
        r.videoUrl ?? '',
        r.audioUrl ?? '',
        (r.characterNames ?? []).join(';'),
        r.sceneName ?? '',
      ].join(','),
  );
  return [header, ...lines].join('\n');
}

/**
 * 生成简易 HTML 表格（用于浏览器预览）。
 */
export function manifestToHtml(rows: ManifestRow[], title?: string): string {
  const rowsHtml = rows
    .map(
      (r) => `<tr>
      <td>${r.index}</td>
      <td>${r.shotId}</td>
      <td>${r.description || ''}</td>
      <td>${r.durationSec}s</td>
      <td>${r.imageUrl ? `<img src="${r.imageUrl}" style="max-width:80px">` : ''}</td>
      <td>${r.videoUrl ? `<a href="${r.videoUrl}">视频</a>` : ''}</td>
    </tr>`,
    )
    .join('\n');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title ?? '导出清单'}</title>
<style>body{font-family:sans-serif;font-size:12px}table{border-collapse:collapse;width:100%}
td,th{border:1px solid #ddd;padding:4px}th{background:#f5f5f5}</style>
</head><body>
<h2>${title ?? '导出清单'}</h2>
<table><thead><tr>
  <th>#</th><th>ID</th><th>描述</th><th>时长</th><th>关键帧</th><th>视频</th>
</tr></thead><tbody>${rowsHtml}</tbody></table>
<p>共 ${rows.length} 个镜头</p>
</body></html>`;
}

/**
 * 生成原生 PDF 二进制（无外部依赖，使用标准 PDF 原语 + Helvetica）。
 *
 * 输出为 Node.js Buffer，可直接写入 .pdf 文件，
 * 所有主流 PDF 阅读器和浏览器均可打开。
 */
export function manifestToPdf(rows: ManifestRow[], title?: string): Uint8Array {
  const displayTitle = title ?? 'Export Manifest';
  const generatedAt = new Date().toISOString();
  const lines: string[] = [];

  // ── 构建 PDF 文本内容 ──
  lines.push(`BT /F1 14 Tf 50 750 Td (${pdfSafe(displayTitle)}) Tj ET`);
  lines.push(`BT /F1 8 Tf 50 735 Td (Generated: ${generatedAt}) Tj ET`);
  lines.push(`BT /F1 8 Tf 50 720 Td (Total shots: ${rows.length}) Tj ET`);

  // 表头
  lines.push(`BT /F1 8 Tf 50 695 Td (Index) Tj ET`);
  lines.push(`BT /F1 8 Tf 100 695 Td (Shot ID) Tj ET`);
  lines.push(`BT /F1 8 Tf 200 695 Td (Description) Tj ET`);
  lines.push(`BT /F1 8 Tf 400 695 Td (Dur) Tj ET`);
  lines.push(`BT /F1 8 Tf 440 695 Td (Scene) Tj ET`);

  // 分隔线
  lines.push(`2 w 50 690 m 560 690 l S`);

  // 行数据（每行 16pt 间距，最多 35 行/页）
  const maxRowsPerPage = 35;
  for (let i = 0; i < Math.min(rows.length, maxRowsPerPage); i++) {
    const r = rows[i];
    const y = 675 - i * 16;
    lines.push(`BT /F1 7 Tf 50 ${y} Td (${r.index}) Tj ET`);
    lines.push(`BT /F1 7 Tf 100 ${y} Td (${pdfSafe(r.shotId, 18)}) Tj ET`);
    lines.push(`BT /F1 7 Tf 200 ${y} Td (${pdfSafe(r.description, 35)}) Tj ET`);
    lines.push(`BT /F1 7 Tf 400 ${y} Td (${r.durationSec}s) Tj ET`);
    lines.push(`BT /F1 7 Tf 440 ${y} Td (${pdfSafe(r.sceneName ?? '-', 18)}) Tj ET`);
  }

  if (rows.length > maxRowsPerPage) {
    lines.push(`BT /F1 8 Tf 50 685 Td (... and ${rows.length - maxRowsPerPage} more shots) Tj ET`);
  }

  const contentStream = lines.join('\n');

  // ── 构建 PDF 对象 ──
  const objects: Array<{ offset: number; data: string }> = [];

  function addObj(data: string): number {
    const offset = objects.reduce((sum, o) => sum + o.data.length, 0);
    objects.push({ offset, data: `${data}\n` });
    return objects.length; // 1-based object number
  }

  // Object 1: Catalog
  addObj(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`);

  // Object 2: Pages
  addObj(`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj`);

  // Object 3: Page
  addObj(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj`);

  // Object 4: Content stream
  const streamBytes = new TextEncoder().encode(contentStream);
  addObj(`4 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${contentStream}\nendstream\nendobj`);

  // Object 5: Font (Helvetica)
  addObj(`5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`);

  // ── 组装 xref + trailer ──
  const headerBytes = new TextEncoder().encode('%PDF-1.4\n');
  const bodyStr = objects.map((o) => o.data).join('');
  const bodyBytes = new TextEncoder().encode(bodyStr);
  const xrefOffset = bodyBytes.length;
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${objects.map((o) => `${String(o.offset).padStart(10, '0')} 00000 n `).join('\n')}\n`;
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const xrefBytes = new TextEncoder().encode(xref);
  const trailerBytes = new TextEncoder().encode(trailer);

  const totalLen = headerBytes.length + bodyBytes.length + xrefBytes.length + trailerBytes.length;
  const result = new Uint8Array(totalLen);
  let pos = 0;
  result.set(headerBytes, pos); pos += headerBytes.length;
  result.set(bodyBytes, pos); pos += bodyBytes.length;
  result.set(xrefBytes, pos); pos += xrefBytes.length;
  result.set(trailerBytes, pos);
  return result;
}

/**
 * 导出历史记录恢复：从 exportHistory 重建导出任务。
 */
export function recoverExportFromHistory(
  history: EpisodeExportRecord[],
  shotMap: Map<string, StoryboardShot>,
): { rows: ManifestRow[]; lastExport?: EpisodeExportRecord } | null {
  if (history.length === 0) return null;
  const last = history[0];
  const rows: ManifestRow[] = [];
  // 尝试用最新一次导出的信息重建
  for (const record of history.slice(0, 3)) {
    // 查找匹配的镜头
    if (record.episodeId) {
      for (const [id, shot] of shotMap) {
        if (shot.episodeId === record.episodeId) {
          rows.push({
            index: shot.index,
            shotId: shot.id,
            description: shot.descriptionZh || '',
            durationSec: shot.durationSec || 5,
            imageUrl: shot.firstFrameAssetId,
            videoUrl: shot.videoAssetId,
          });
        }
      }
      if (rows.length > 0) break;
    }
  }
  return { rows, lastExport: last };
}
