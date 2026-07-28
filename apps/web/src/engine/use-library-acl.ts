/**
 * use-library-acl — 资产库权限模型 Hook（F-038）。
 */
import { useMemo } from 'react';
import { checkLibraryAccess, type LibraryScope } from '@nx9/shared';

export function useLibraryAcl(scope: LibraryScope) {
  return useMemo(() => {
    const readResult = checkLibraryAccess(scope, 'read');
    const writeResult = checkLibraryAccess(scope, 'write');
    const deleteResult = checkLibraryAccess(scope, 'delete');
    return {
      canRead: readResult.allowed,
      canWrite: writeResult.allowed,
      canDelete: deleteResult.allowed,
      readReason: readResult.reason,
      writeReason: writeResult.reason,
      deleteReason: deleteResult.reason,
    };
  }, [scope]);
}
