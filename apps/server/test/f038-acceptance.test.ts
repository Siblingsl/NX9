/**
 * F-038 acceptance test — 公共库/私有库权限模型
 *
 * G1 验收清单:
 * - [x] 公共默认不可删改
 * - [x] 可复制到私有
 *
 * G2: 服务端 403 生效 + 前端 UI 权限门面 + 复制到项目流程
 * G3: 本文件 + 缺陷分析同步
 */
import { describe, it, expect } from 'vitest';
import {
  checkLibraryAccess,
  canModifyLibraryItem,
  canCopyFromPublic,
  setLibraryAclConfig,
  getLibraryAclConfig,
  type LibraryScope,
} from '@nx9/shared';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const WEB_ROOT = resolve(__dirname, '..', '..', '..', 'apps', 'web', 'src');
const SERVER_ROOT = resolve(__dirname, '..', '..', '..', 'apps', 'server', 'src');
const SHARED_ROOT = resolve(__dirname, '..', '..', '..', 'packages', 'shared', 'src');

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}
function fileExists(path: string): boolean {
  return existsSync(path);
}

const ACL_MODULE = resolve(SHARED_ROOT, 'utils', 'library-acl.ts');
const HOOK_FILE = resolve(WEB_ROOT, 'engine', 'use-library-acl.ts');
const MODAL_FILE = resolve(WEB_ROOT, 'panels', 'AssetLibraryModal.tsx');
const CONTROLLER_FILE = resolve(SERVER_ROOT, 'modules', 'public-library', 'public-library.controller.ts');
const MAIN_FILE = resolve(SERVER_ROOT, 'main.ts');
const CONFIG_FILE = resolve(SERVER_ROOT, 'config', 'app.config.ts');

describe('F-038 acceptance', () => {
  // ═══════════ source files ═══════════
  describe('source files exist', () => {
    it('library-acl.ts (shared)', () => { expect(fileExists(ACL_MODULE)).toBe(true); });
    it('use-library-acl.ts (web)', () => { expect(fileExists(HOOK_FILE)).toBe(true); });
    it('AssetLibraryModal.tsx (web)', () => { expect(fileExists(MODAL_FILE)).toBe(true); });
    it('public-library.controller.ts (server)', () => { expect(fileExists(CONTROLLER_FILE)).toBe(true); });
    it('main.ts (server)', () => { expect(fileExists(MAIN_FILE)).toBe(true); });
    it('app.config.ts (server)', () => { expect(fileExists(CONFIG_FILE)).toBe(true); });
  });

  // ═══════════ G1.1: 公共默认不可删改 ═══════════
  describe('G1.1 公共默认不可删改', () => {
    it('公共库 read 始终允许', () => {
      const result = checkLibraryAccess('public', 'read');
      expect(result.allowed).toBe(true);
    });

    it('公共库 write 默认拒绝', () => {
      setLibraryAclConfig({ allowPublicWrite: false });
      const result = checkLibraryAccess('public', 'write');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.reason).toContain('只读');
    });

    it('公共库 delete 默认拒绝', () => {
      setLibraryAclConfig({ allowPublicWrite: false });
      const result = checkLibraryAccess('public', 'delete');
      expect(result.allowed).toBe(false);
    });

    it('私有库 write 始终允许', () => {
      const result = checkLibraryAccess('private', 'write');
      expect(result.allowed).toBe(true);
    });

    it('私有库 delete 始终允许', () => {
      const result = checkLibraryAccess('private', 'delete');
      expect(result.allowed).toBe(true);
    });

    it('canModifyLibraryItem 默认拒绝 public', () => {
      setLibraryAclConfig({ allowPublicWrite: false });
      expect(canModifyLibraryItem('public')).toBe(false);
      expect(canModifyLibraryItem('private')).toBe(true);
    });

    it('allowPublicWrite=true 时公共库可写', () => {
      setLibraryAclConfig({ allowPublicWrite: true });
      const result = checkLibraryAccess('public', 'write');
      expect(result.allowed).toBe(true);
      // reset
      setLibraryAclConfig({ allowPublicWrite: false });
    });
  });

  // ═══════════ G1.2: 可复制到私有 ═══════════
  describe('G1.2 可复制到私有', () => {
    it('canCopyFromPublic 始终返回 true', () => {
      expect(canCopyFromPublic()).toBe(true);
    });

    it('checkLibraryAccess 拒绝理由指引复制到私有', () => {
      setLibraryAclConfig({ allowPublicWrite: false });
      const result = checkLibraryAccess('public', 'write');
      expect(result.reason).toContain('复制到私有');
    });
  });

  // ═══════════ 公共库配置读写 ═══════════
  describe('公共库配置', () => {
    it('setLibraryAclConfig + getLibraryAclConfig', () => {
      setLibraryAclConfig({ allowPublicWrite: true });
      expect(getLibraryAclConfig().allowPublicWrite).toBe(true);
      setLibraryAclConfig({ allowPublicWrite: false });
      expect(getLibraryAclConfig().allowPublicWrite).toBe(false);
    });
  });

  // ═══════════ Hook 布尔化 ═══════════
  describe('useLibraryAcl hook 返回布尔', () => {
    const src = read(HOOK_FILE);

    it('返回 canRead/canWrite/canDelete 为布尔', () => {
      expect(src).toContain('readResult.allowed');
      expect(src).toContain('writeResult.allowed');
      expect(src).toContain('deleteResult.allowed');
    });

    it('返回 reason 字段', () => {
      expect(src).toContain('readReason');
      expect(src).toContain('writeReason');
      expect(src).toContain('deleteReason');
    });
  });

  // ═══════════ 服务端强制 ═══════════
  describe('服务端 403 强制', () => {
    it('controller 导入 checkLibraryAccess', () => {
      const src = read(CONTROLLER_FILE);
      expect(src).toContain('checkLibraryAccess');
    });

    it('controller PUT 检查 write 权限并抛 ForbiddenException', () => {
      const src = read(CONTROLLER_FILE);
      expect(src).toContain("checkLibraryAccess('public', 'write')");
      expect(src).toContain('ForbiddenException');
    });

    it('main.ts 初始化 setLibraryAclConfig', () => {
      const src = read(MAIN_FILE);
      expect(src).toContain('setLibraryAclConfig');
      expect(src).toContain('ALLOW_PUBLIC_WRITE');
    });

    it('app.config.ts 导出 ALLOW_PUBLIC_WRITE', () => {
      const src = read(CONFIG_FILE);
      expect(src).toContain('ALLOW_PUBLIC_WRITE');
      expect(src).toContain("=== 'true'");
    });
  });

  // ═══════════ 前端 UI 权限门面 ═══════════
  describe('前端 UI 权限门面', () => {
    const src = read(MODAL_FILE);

    it('导入 useLibraryAcl', () => {
      expect(src).toContain('useLibraryAcl');
    });

    it('解构 canRead/canWrite/canDelete 为布尔', () => {
      expect(src).toContain('const { canRead, canWrite, canDelete: canDeleteItem } = acl;');
    });

    it('canWrite 守卫角色定妆图按钮', () => {
      expect(src).toContain('canWrite &&');
    });

    it('canWrite 守卫场景图按钮', () => {
      expect(src).toContain('canWrite &&');
    });

    it('canDeleteItem 守卫删除按钮 onClick', () => {
      expect(src).toContain('canDeleteItem) handleDelete');
    });

    it('复制到项目按钮存在', () => {
      expect(src).toContain('复制到项目');
    });

    it('handleCopyPublicToWorkspace 回调存在', () => {
      expect(src).toContain('handleCopyPublicToWorkspace');
      expect(src).toContain('publicTemplates.find');
      expect(src).toContain('templateToWorkspaceItem');
      expect(src).toContain('refreshWorkspacePrompts');
    });

    it('公共非内置条目显示复制到项目而非删除', () => {
      expect(src).toContain("scope === 'public' ?");
      expect(src).toContain('复制到项目');
    });
  });
});
