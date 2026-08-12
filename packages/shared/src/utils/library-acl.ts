/**
 * library-acl.ts — 公共库/私有库权限模型（F-038，工作室版）。
 *
 * - 私有库：读写删
 * - 公共库：共享包默认只读；Web 工作室启动时 `setLibraryAclConfig({ allowPublicWrite: true })`
 *   以维护跨项目词典/实体。内置条目仍由 UI 强制「导入副本」只读。
 * - 「复制到项目私有」始终允许
 */
export type LibraryScope = 'public' | 'private';

export interface LibraryAclConfig {
  allowPublicWrite: boolean;
}

const DEFAULT_ACL: LibraryAclConfig = {
  allowPublicWrite: false,
};

let aclConfig: LibraryAclConfig = { ...DEFAULT_ACL };

export function setLibraryAclConfig(config: Partial<LibraryAclConfig>): void {
  aclConfig = { ...aclConfig, ...config };
}

export function getLibraryAclConfig(): LibraryAclConfig {
  return { ...aclConfig };
}

/**
 * 检查是否允许删除/修改指定 scope 的库条目。
 */
export function canModifyLibraryItem(scope: LibraryScope): boolean {
  if (scope === 'private') return true;
  // public 需要显式开关
  return aclConfig.allowPublicWrite;
}

/**
 * 检查是否允许从公共库复制到私有库。
 */
export function canCopyFromPublic(): boolean {
  return true; // 总是允许
}

/**
 * 对于指定的操作，返回是否允许以及拒绝原因。
 */
export function checkLibraryAccess(
  scope: LibraryScope,
  action: 'read' | 'write' | 'delete',
): { allowed: boolean; reason?: string } {
  if (scope === 'private') {
    return { allowed: true };
  }
  // public scope
  if (action === 'read') {
    return { allowed: true };
  }
  if (action === 'write' || action === 'delete') {
    if (aclConfig.allowPublicWrite) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: '公共库为只读，请复制到私有库后再编辑',
    };
  }
  return { allowed: false, reason: '未知操作' };
}
