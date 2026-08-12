import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setLibraryAclConfig } from '@nx9/shared';
import AppShell from './layout/AppShell';
import './styles/tokens.css';
import './styles/desk-palette.css';
import './styles/global.css';

/** 工作室版：公共库（跨项目用户库）默认可维护；内置条目仍由 UI 只读拦截。 */
setLibraryAclConfig({ allowPublicWrite: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppShell />
  </StrictMode>,
);
