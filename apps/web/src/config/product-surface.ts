/**
 * 产品展示面配置 — 控制哪些功能出现在 UI 中。
 *
 * 架构：
 * - home：导航页（制作台 / 高级画布）
 * - studio：制作台全页（无右侧抽屉）
 * - canvas：高级画布（后期重构 UI；无右侧抽屉）
 *
 * 明确禁止：右侧 ContextRail 抽屉及其编剧/分镜/资源库子页。
 */
export const PRODUCT_SURFACE = {
  // —— 画布（仅 canvas 表面挂载时展示 · 全屏舞台风格） ——
  canvas: true,
  canvasFirst: true,
  /** 节点工作区：底部跟随挂载（非屏幕弹窗） */
  promptBar: true,
  /** 旧左侧模块坞：由舞台底部能力岛替代 */
  moduleDock: false,
  /** 永久关闭：右侧内容抽屉 */
  inspectorRail: false,
  /** 旧工作区标签轨：由舞台项目 chips 替代 */
  workspaceRail: false,
  commandPalette: true,
  /** 旧顶栏模式胶囊：舞台不再挂载 */
  viewModeCapsule: false,
  batchRun: true,
  undoRedo: true,
  takeRail: true,
  workflowTemplates: true,
  settings: true,
  shortcuts: true,
  logPanel: true,
  assetLibraryModal: true,

  // —— 制作引导（制作台页面自有 UI，不走右侧抽屉） ——
  productionProgressWall: false,
  /** 画布内步骤条：浮动玻璃，非 IDE 顶栏 */
  playbookFlowRail: true,
  productionWall: false,
  expertWorkflowToggle: false,
  playbookWizard: true,
  /** 旧全屏故事板面板已拆除；分镜编辑走画布「分镜台」 */
  storyboard: false,

  // —— 禁止右侧抽屉相关 ——
  scriptStudio: false,
  libraryRail: false,
  /** 旧顶栏路径条关闭；制作台页面内嵌阶段 UI */
  productionPathStrip: false,

  // —— 暂缓 ——
  episodeStudio: false,
  director3d: false,
  generationHistory: false,
  usageTracking: false,
  skillsDrawer: false,
  stageDeckTour: false,
} as const;

export type ProductSurfaceKey = keyof typeof PRODUCT_SURFACE;

export function isSurfaceEnabled(key: ProductSurfaceKey): boolean {
  return PRODUCT_SURFACE[key];
}
