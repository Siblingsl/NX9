/**
 * 产品展示面配置 — 控制哪些功能出现在 UI 中。
 * 被关闭的功能代码仍保留在仓库内，将对应开关改为 true 即可重新启用。
 *
 * 当前模式：Workflow Core — 画布 + 节点 + 必要连带能力。
 */
export const PRODUCT_SURFACE = {
  // —— 核心：画布与节点 ——
  canvas: true,
  canvasFirst: true,
  promptBar: true,
  moduleDock: true,
  inspectorRail: false,
  workspaceRail: true,
  commandPalette: true,
  viewModeCapsule: true,
  batchRun: true,
  undoRedo: true,
  takeRail: true,
  workflowTemplates: true,
  settings: true,
  shortcuts: true,
  logPanel: true,
  assetLibraryModal: true,

  // —— 暂缓展示（代码保留） ——
  storyboard: false,
  playbookWizard: false,
  playbookFlowRail: false,
  scriptStudio: false,
  libraryRail: false,
  episodeStudio: false,
  director3d: false,
  productionWall: false,
  productionProgressWall: false,
  generationHistory: false,
  usageTracking: false,
  skillsDrawer: false,
  stageDeckTour: false,
} as const;

export type ProductSurfaceKey = keyof typeof PRODUCT_SURFACE;

export function isSurfaceEnabled(key: ProductSurfaceKey): boolean {
  return PRODUCT_SURFACE[key];
}
