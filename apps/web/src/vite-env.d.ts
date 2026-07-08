/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STAGE_DECK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
