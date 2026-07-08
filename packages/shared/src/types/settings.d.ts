export interface ProviderCredential {
    id: string;
    label: string;
    protocol: 'openai-compat' | 'modelscope' | 'volcengine' | 'comfyui' | 'jimeng-cli' | 'custom';
    baseUrl?: string;
    apiKey?: string;
    enabled?: boolean;
}
export interface CloudTarget {
    id: string;
    label: string;
    driver: 'cos' | 'oss' | 'webdav';
    config: Record<string, string>;
}
export interface AppPreferences {
    snapToGrid: boolean;
    gridSize: number;
    autoSaveIntervalMs: number;
    showBlockIndex: boolean;
    reduceMotion: boolean;
}
export interface AppSettings {
    primaryApiKey?: string;
    rhApiKey?: string;
    llmApiKey?: string;
    categoryKeys?: Record<string, string>;
    exportPath?: string;
    autoBackupPath?: string;
    assetLibraryPath?: string;
    advancedProviders?: ProviderCredential[];
    cloudTargets?: CloudTarget[];
    preferences?: AppPreferences;
}
