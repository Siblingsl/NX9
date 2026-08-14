import { createContext, useContext, type ReactNode } from 'react';
import type { AssetLibraryModalController } from './use-asset-library-modal-controller';

const AssetLibraryModalContext = createContext<AssetLibraryModalController | null>(null);

export function AssetLibraryModalProvider({
  value,
  children,
}: {
  value: AssetLibraryModalController;
  children: ReactNode;
}) {
  return (
    <AssetLibraryModalContext.Provider value={value}>
      {children}
    </AssetLibraryModalContext.Provider>
  );
}

export function useAssetLibraryModal(): AssetLibraryModalController {
  const ctx = useContext(AssetLibraryModalContext);
  if (!ctx) {
    throw new Error('useAssetLibraryModal must be used within AssetLibraryModalProvider');
  }
  return ctx;
}
