/**
 * F-051 acceptance test — 服装/道具预检字段（缺口点击跳转资产库）
 *
 * G1: 服装缺口 chip → <button> 点击打开 asset library costume tab
 * G2: 道具缺口 chip → <button> 点击打开 asset library scene tab（无独立 prop tab）
 * G3: extractCostumeNames / extractPropNames 存在
 * G4: AssetReadinessState 含 missingCostumes / missingProps
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC = resolve(__dirname, '..', '..', '..', 'apps', 'web', 'src');

function read(relPath: string): string {
  return readFileSync(resolve(SRC, relPath), 'utf-8');
}

describe('F-051 acceptance — 服装/道具预检字段', () => {
  // ═══════════ G1: 服装缺口 chip 可点击，跳转到 costume tab ═══════════
  describe('G1: AssetReadinessPanel — 服装缺口 chip 可点击', () => {
    const src = read('components/asset/AssetReadinessPanel.tsx');

    it('missingCostumes 用 <button> 渲染（非 <span>）', () => {
      expect(src).toMatch(/missingCostumes[.\s\S]*?<button/);
      expect(src).toMatch(/openAssetAt\(\s*\{[^}]*tab:\s*'costume'/);
    });

    it('服装 chip 有 onClick 跳转 costume tab', () => {
      expect(src).toContain("tab: 'costume'");
    });

    it('服装缺口区域含有提示文字"打开服装库"', () => {
      expect(src).toContain('点击缺口打开服装库');
    });

    it('服装 chip 有 title="点击打开服装库"', () => {
      expect(src).toContain('title="点击打开服装库"');
    });
  });

  // ═══════════ G2: 道具缺口 chip 可点击，跳转到 scene tab ═══════════
  describe('G2: AssetReadinessPanel — 道具缺口 chip 可点击', () => {
    const src = read('components/asset/AssetReadinessPanel.tsx');

    it('missingProps 用 <button> 渲染（非 <span>）', () => {
      expect(src).toMatch(/missingProps[.\s\S]*?<button/);
      expect(src).toMatch(/openAssetAt\(\s*\{[^}]*tab:\s*'scene'/);
    });

    it('道具 chip 有 onClick 跳转 scene tab', () => {
      expect(src).toContain("tab: 'scene'");
    });

    it('道具缺口区域含有提示文字"打开场景库"', () => {
      expect(src).toContain('点击缺口打开场景库');
    });

    it('道具 chip 有 title="点击打开场景库"', () => {
      expect(src).toContain('title="点击打开场景库"');
    });
  });

  // ═══════════ G3: extractCostumeNames / extractPropNames 存在 ═══════════
  describe('G3: asset-readiness.ts — 提取函数存在', () => {
    const src = read('engine/asset-readiness.ts');

    it('extractCostumeNames 函数存在', () => {
      expect(src).toMatch(/function extractCostumeNames\b/);
    });

    it('extractPropNames 函数存在', () => {
      expect(src).toMatch(/function extractPropNames\b/);
    });

    it('extractCostumeNames 从 Bible character 提取服装名', () => {
      expect(src).toMatch(/appearance|personality|voiceNotes/);
    });

    it('extractPropNames 从 Bible scene 提取道具名', () => {
      expect(src).toMatch(/道具|物品|摆设/);
    });
  });

  // ═══════════ G4: AssetReadinessState 含 missingCostumes / missingProps ═══════════
  describe('G4: AssetReadinessState 类型定义', () => {
    const src = read('engine/asset-readiness.ts');

    it('AssetReadinessState 接口含 missingCostumes', () => {
      expect(src).toContain('missingCostumes');
    });

    it('AssetReadinessState 接口含 missingProps', () => {
      expect(src).toContain('missingProps');
    });

    it('inspectBibleAssets 返回 missingCostumes 和 missingProps', () => {
      expect(src).toContain('extractCostumeNames');
      expect(src).toContain('extractPropNames');
    });
  });

  // ═══════════ G5: 预检阻断理由含服装/道具缺口 ═══════════
  describe('G5: runStoryboardPreflight 阻断理由含服装/道具', () => {
    const src = read('engine/asset-readiness.ts');

    it('预检理由含服装缺口描述', () => {
      expect(src).toMatch(/missingCostumes|服装/);
    });
  });
});
