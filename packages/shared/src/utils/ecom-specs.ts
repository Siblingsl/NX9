/**
 * ecom-specs.ts — 电商交付规格包（F-033）。
 *
 * 预设尺寸列表（主图/详情图/短视频）批量导出。
 */
export interface EcomSpec {
  specId: string;
  label: string;
  width: number;
  height: number;
  maxDurationSec?: number;
  description?: string;
  category: 'image' | 'video';
}

/**
 * 电商主图规格
 */
export const ECOM_IMAGE_SPECS: EcomSpec[] = [
  { specId: 'main-1-1', label: '主图 1:1', width: 800, height: 800, category: 'image', description: '淘宝/京东主图' },
  { specId: 'main-3-4', label: '主图 3:4', width: 750, height: 1000, category: 'image', description: '拼多多/小红书主图' },
  { specId: 'detail-1-1', label: '详情图 1:1', width: 800, height: 800, category: 'image', description: '详情页展示图' },
  { specId: 'detail-16-9', label: '详情图 16:9', width: 1280, height: 720, category: 'image', description: '宽屏详情图' },
  { specId: 'carousel-1-1', label: '轮播图 1:1', width: 800, height: 800, category: 'image', description: '主图轮播' },
  { specId: 'long-1-2', label: '长图 1:2', width: 600, height: 1200, category: 'image', description: '小红书长图' },
];

/**
 * 电商短视频规格
 */
export const ECOM_VIDEO_SPECS: EcomSpec[] = [
  { specId: 'video-9-16', label: '短视频 9:16', width: 720, height: 1280, maxDurationSec: 60, category: 'video', description: '抖音/快手竖屏' },
  { specId: 'video-16-9', label: '横屏 16:9', width: 1280, height: 720, maxDurationSec: 120, category: 'video', description: 'YouTube/B站横屏' },
  { specId: 'video-1-1', label: '方形 1:1', width: 800, height: 800, maxDurationSec: 60, category: 'video', description: 'Facebook/Instagram' },
];

/**
 * 所有电商规格
 */
export const ECOM_ALL_SPECS: EcomSpec[] = [...ECOM_IMAGE_SPECS, ...ECOM_VIDEO_SPECS];

/**
 * 按 specId 查找规格。
 */
export function lookupEcomSpec(specId: string): EcomSpec | undefined {
  return ECOM_ALL_SPECS.find((s) => s.specId === specId);
}

/**
 * 构建电商导出描述。
 */
export function buildEcomPackDescription(selectedSpecs: string[]): string {
  return selectedSpecs
    .map((id) => {
      const spec = lookupEcomSpec(id);
      return spec ? `${spec.label} (${spec.width}×${spec.height})` : id;
    })
    .join(', ');
}
