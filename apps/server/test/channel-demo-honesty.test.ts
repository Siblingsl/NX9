import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * F-034 / F-035 / F-049 通道真机项防虚标门禁：
 * 缺陷总表完成度不得写 100%，直至 REAL-PROVIDER-VALIDATION 台账勾选。
 */
const root = resolve(__dirname, '../../..');

function summaryPct(doc: string, id: string): number | null {
  const re = new RegExp(`\\|\\s*${id}\\s*\\|[^|]*\\|[^|]*\\|\\s*(\\d+)%\\s*\\|`);
  const m = doc.match(re);
  return m ? Number(m[1]) : null;
}

function detailPct(doc: string, heading: string): number | null {
  const idx = doc.indexOf(heading);
  if (idx < 0) return null;
  const slice = doc.slice(idx, idx + 800);
  const m = slice.match(/\*\*完成度\*\*[：:]\s*(\d+)%/);
  return m ? Number(m[1]) : null;
}

describe('通道真机项防虚标（F-034 / F-035 / F-049）', () => {
  const defect = readFileSync(resolve(root, 'docs/NX9-PROJECT-DEFECT-ANALYSIS.md'), 'utf8');
  const real = readFileSync(resolve(root, 'docs/REAL-PROVIDER-VALIDATION.md'), 'utf8');

  it('REAL-PROVIDER 含有声短片与 Bridge/Seedance/队列演示台账', () => {
    expect(real).toContain('F-034 / SF-11');
    expect(real).toContain('F-035 / F-049');
    expect(real).toContain('### Bridge');
    expect(real).toContain('### Seedance');
    expect(real).toContain('### Episode-queue');
  });

  it('缺陷总表与详情完成度均 <100%（真机未勾选）', () => {
    for (const id of ['F-034', 'F-035', 'F-049'] as const) {
      const pct = summaryPct(defect, id);
      expect(pct, `${id} 总表缺失`).not.toBeNull();
      expect(pct!, `${id} 总表虚标 100%`).toBeLessThan(100);
    }
    expect(detailPct(defect, '## F-034')).toBeLessThan(100);
    expect(detailPct(defect, '## F-035')).toBeLessThan(100);
    expect(detailPct(defect, '## F-049')).toBeLessThan(100);
  });

  it('台账勾选框仍为未勾（真机未跑）', () => {
    // 用章节标题定位，避免正文提及 F-034/F-035 时 slice 为空
    const f034Start = real.indexOf('## F-034 / SF-11');
    const f035Start = real.indexOf('## F-035 / F-049');
    expect(f034Start).toBeGreaterThanOrEqual(0);
    expect(f035Start).toBeGreaterThan(f034Start);
    const f034 = real.slice(f034Start, f035Start);
    expect(f034).toMatch(/- \[ \]/);
    expect(f034).not.toMatch(/- \[x\].*可播样片/);

    const f035 = real.slice(f035Start);
    expect(f035).toMatch(/### Bridge[\s\S]*?- \[ \]/);
    expect(f035).toMatch(/### Seedance[\s\S]*?- \[ \]/);
    expect(f035).toMatch(/### Episode-queue[\s\S]*?- \[ \]/);
  });

  it('本机门禁状态注明未升完成度', () => {
    expect(real).toContain('本机门禁状态');
    expect(real).toMatch(/F-034[\s\S]*90%[\s\S]*85%[\s\S]*85%/);
  });
});
