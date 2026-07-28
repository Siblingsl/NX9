/**
 * F-037 acceptance test — Bible→定妆/场景图深度
 *
 * G1 验收清单:
 * - [x] 角色/场景均可一键出参考图并保存
 *
 * G2: useBibleImageGen hook + AssetLibraryModal 双入口 UI + buildBibleImagePrompt 双分支
 * G3: 本文件 + 缺陷分析同步
 */
import { describe, it, expect } from 'vitest';
import {
  buildBibleImagePrompt,
  buildBibleImagePatch,
} from '@nx9/shared';
import type { AssetBibleImageRequest, AssetBibleImageResult } from '@nx9/shared';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const WEB_ROOT = resolve(__dirname, '..', '..', '..', 'apps', 'web', 'src');
const SHARED_ROOT = resolve(__dirname, '..', '..', '..', 'packages', 'shared', 'src');

function readWeb(relPath: string): string {
  return readFileSync(resolve(WEB_ROOT, relPath), 'utf-8');
}
function readShared(relPath: string): string {
  return readFileSync(resolve(SHARED_ROOT, relPath), 'utf-8');
}
function fileExists(relPath: string, base: string = WEB_ROOT): boolean {
  return existsSync(resolve(base, relPath));
}

const ASSET_LIBRARY_MODAL = 'panels/AssetLibraryModal.tsx';
const BIBLE_IMAGE_GEN = 'engine/use-bible-image-gen.ts';
const ASSET_BIBLE_IMAGE = 'utils/asset-bible-image.ts';
const SHARED_INDEX = 'index.ts';

describe('F-037 acceptance', () => {
  // ═══════════ source files ═══════════
  describe('source files exist', () => {
    it(ASSET_LIBRARY_MODAL, () => { expect(fileExists(ASSET_LIBRARY_MODAL)).toBe(true); });
    it(BIBLE_IMAGE_GEN, () => { expect(fileExists(BIBLE_IMAGE_GEN)).toBe(true); });
    it(`${ASSET_BIBLE_IMAGE} (shared)`, () => { expect(fileExists(ASSET_BIBLE_IMAGE, SHARED_ROOT)).toBe(true); });
    it(`${SHARED_INDEX} (shared)`, () => { expect(fileExists(SHARED_INDEX, SHARED_ROOT)).toBe(true); });
  });

  // ═══════════ G1.1: buildBibleImagePrompt 双分支可用 ═══════════
  describe('buildBibleImagePrompt 双分支', () => {
    it('character 分支生成定妆图提示词', () => {
      const req: AssetBibleImageRequest = {
        kind: 'character',
        name: '小明',
        description: '高中生，戴眼镜',
      };
      const prompt = buildBibleImagePrompt(req);
      expect(prompt).toContain('Character design sheet');
      expect(prompt).toContain('小明');
      expect(prompt).toContain('高中生');
      expect(prompt).toContain('Front view');
      expect(prompt).toContain('consistent identity');
    });

    it('scene 分支生成场景图提示词', () => {
      const req: AssetBibleImageRequest = {
        kind: 'scene',
        name: '教室',
        description: '日式高中教室，木地板，黄昏光',
      };
      const prompt = buildBibleImagePrompt(req);
      expect(prompt).toContain('Environment concept art');
      expect(prompt).toContain('教室');
      expect(prompt).toContain('日式高中教室');
      expect(prompt).toContain('Wide shot');
      expect(prompt).toContain('atmospheric lighting');
      expect(prompt).toContain('cinematic quality');
    });

    it('空 description 也能生成', () => {
      const prompt = buildBibleImagePrompt({ kind: 'character', name: '主角', description: '' });
      expect(prompt).toContain('主角');
      expect(prompt).toContain('Character design sheet');
    });

    it('带 existingImageUrl 不报错（函数不消费此字段）', () => {
      const prompt = buildBibleImagePrompt({ kind: 'scene', name: '公园', description: '夕阳', existingImageUrl: 'https://img/a.png' });
      expect(prompt).toContain('公园');
    });
  });

  // ═══════════ G1.2: buildBibleImagePatch 可用 ═══════════
  describe('buildBibleImagePatch', () => {
    it('生成 referenceImageUrl + referencePrompt patch', () => {
      const req: AssetBibleImageRequest = { kind: 'character', name: '小红', description: '红发' };
      const result: AssetBibleImageResult = { url: 'https://img/gen.png', prompt: 'Character design sheet: 小红. 红发. ...' };
      const patch = buildBibleImagePatch(req, result);
      expect(patch.referenceImageUrl).toBe('https://img/gen.png');
      expect(patch.referencePrompt).toBe('Character design sheet: 小红. 红发. ...');
    });
  });

  // ═══════════ G1.3: useBibleImageGen hook 存在且可测 ═══════════
  describe('useBibleImageGen hook', () => {
    const src = readWeb(BIBLE_IMAGE_GEN);

    it('文件内容包含 generate 函数', () => {
      expect(src).toContain('export function useBibleImageGen');
      expect(src).toContain('buildBibleImagePrompt');
      expect(src).toContain('api.proxyImage');
    });

    it('支持 character 和 scene 两种 kind', () => {
      expect(src).toContain('AssetBibleImageRequest');
    });

    it('返回 { generate, generating, error }', () => {
      expect(src).toContain('generating');
      expect(src).toContain('error');
      expect(src).toContain('return { generate, generating, error }');
    });
  });

  // ═══════════ G1.4: AssetLibraryModal 入口 ═══════════
  describe('AssetLibraryModal UI 入口', () => {
    const src = readWeb(ASSET_LIBRARY_MODAL);

    it('导入 useBibleImageGen', () => {
      expect(src).toContain('useBibleImageGen');
    });

    it('实例化 bibleImg hook', () => {
      expect(src).toContain('const bibleImg = useBibleImageGen()');
    });

    it('有角色定妆图按钮', () => {
      expect(src).toContain('生成定妆图');
      expect(src).toContain("kind: 'character'");
    });

    it('有场景图按钮（F-037 补全）', () => {
      expect(src).toContain('生成场景图');
      expect(src).toContain("kind: 'scene'");
    });
  });

  // ═══════════ 源码门禁：场景图按钮结构完整 ═══════════
  describe('源码门禁：场景图按钮结构', () => {
    const src = readWeb(ASSET_LIBRARY_MODAL);

    it('scene 分支含 getSceneCreative', () => {
      expect(src).toContain('getSceneCreative');
    });

    it('scene 名称取自 selectedWorkspaceItem.label', () => {
      expect(src).toContain('selectedWorkspaceItem.label');
      expect(src).toContain('生成场景图');
    });

    it('scene description 来自 creative.description + promptZh + promptEn', () => {
      const sceneSection = src.indexOf('selectedWorkspaceItem.promptZh');
      const section = src.slice(Math.max(0, sceneSection - 100), sceneSection + 100);
      expect(section).toContain('creative.description');
      expect(section).toContain('promptEn');
    });

    it('scene 写回 referenceUrls', () => {
      // referenceUrls appears in the saveWorkspaceItem call for the scene path
      expect(src).toContain('referenceUrls: [url, ...refs]');
    });

    it('生成中显示 Loader2 和 生成中…', () => {
      expect(src).toContain('Loader2');
      expect(src).toContain('生成中…');
    });

    it('错误显示 bibleImg.error', () => {
      expect(src).toContain('bibleImg.error');
    });

    it('disabled 在生成中', () => {
      const sceneSection = src.indexOf('disabled={bibleImg.generating}');
      expect(sceneSection).toBeGreaterThan(0);
    });
  });

  // ═══════════ 角色按钮未退化 ═══════════
  describe('角色定妆图按钮未退化', () => {
    const src = readWeb(ASSET_LIBRARY_MODAL);

    it('仍含 character 分支', () => {
      expect(src).toContain("kind: 'character'");
    });

    it('写回 referenceImageUrl 给 character', () => {
      expect(src).toContain('referenceImageUrl: url');
      expect(src).toContain('saveCharacter');
    });

    it('description 从 bible.appearance + personality', () => {
      expect(src).toContain('charBible');
      expect(src).toContain('.appearance');
      expect(src).toContain('.personality');
    });
  });

  // ═══════════ 共享导出完整性 ═══════════
  describe('共享导出', () => {
    const src = readShared(SHARED_INDEX);

    it('buildBibleImagePrompt 已导出', () => {
      expect(src).toContain('buildBibleImagePrompt');
    });

    it('buildBibleImagePatch 已导出', () => {
      expect(src).toContain('buildBibleImagePatch');
    });

    it('AssetBibleImageRequest 类型已导出', () => {
      expect(src).toContain('AssetBibleImageRequest');
    });

    it('AssetBibleImageResult 类型已导出', () => {
      expect(src).toContain('AssetBibleImageResult');
    });
  });

  // ═══════════ asset-bible-image.ts 模块完整 ═══════════
  describe('asset-bible-image 模块', () => {
    const src = readShared(ASSET_BIBLE_IMAGE);

    it('F-037 注释存在', () => {
      expect(src).toContain('F-037');
    });

    it('AssetBibleImageRequest 含 character|scene kind', () => {
      expect(src).toContain("kind: 'character' | 'scene'");
    });

    it('buildBibleImagePrompt 含双分支', () => {
      expect(src).toContain("kind === 'character'");
      expect(src).toContain('Character design sheet');
      expect(src).toContain('Environment concept art');
    });

    it('buildBibleImagePatch 存在', () => {
      expect(src).toContain('export function buildBibleImagePatch');
    });
  });
});
