/**
 * 产品展示面配置 — 控制哪些功能出现在 UI 中。
 *
 * 架构：
 * - home：导航页（制作台 / 高级画布）
 * - studio：制作台全页
 * - canvas：高级画布（全屏舞台）
 *
 * 已永久拆除（不再保留开关）：旧全屏故事板、右侧 ContextRail、
 * ModuleDock、WorkspaceRail、成片工作室面板、用量/历史/技能抽屉、Tour 等。
 */
export const PRODUCT_SURFACE = {
  // —— 画布 ——
  canvas: true,
  canvasFirst: true,
  /** 节点工作区：底部跟随挂载（非屏幕弹窗） */
  promptBar: true,
  commandPalette: true,
  batchRun: true,
  undoRedo: true,
  takeRail: true,
  workflowTemplates: true,
  settings: true,
  shortcuts: true,
  logPanel: true,
  assetLibraryModal: true,

  // —— 制作引导 ——
  /** 画布内步骤条：浮动玻璃 */
  playbookFlowRail: true,
  playbookWizard: true,
} as const;

export type ProductSurfaceKey = keyof typeof PRODUCT_SURFACE;

export function isSurfaceEnabled(key: ProductSurfaceKey): boolean {
  return PRODUCT_SURFACE[key];
}
