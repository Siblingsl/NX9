/**
 * run-labels.ts — 「运行」入口心智统一（F-044）。
 *
 * 字典：节点级动作名；批出「批出 N 镜」；Playbook「继续下一步」。
 * 禁止卡面主 CTA 都叫「运行」。
 */
import type { NodeRunStatus } from '../catalog/node-interaction';

export interface RunLabelDict {
  /** 主按钮文案 */
  primary: string;
  /** 悬停/辅助文案 */
  hint?: string;
  /** 忙碌状态文案 */
  busy?: string;
  /** 完成状态文案 */
  done?: string;
}

const LABELS: Record<string, RunLabelDict> = {
  default: {
    primary: '运行本节点',
    hint: '执行本节点',
    busy: '运行中…',
    done: '已完成',
  },
  'picture-gen': {
    primary: '生成图像',
    hint: '文生图 / 图生图',
    busy: '生成中…',
    done: '已出图',
  },
  'clip-gen': {
    primary: '生成视频',
    hint: '文生视频 / 图生视频（单镜）',
    busy: '生成中…',
    done: '已出片',
  },
  'storyboard-desk': {
    primary: '拆镜确认',
    hint: '执行拆镜并确认镜表',
    busy: '拆镜中…',
    done: '已拆镜',
  },
  'director-desk': {
    primary: '批出关键帧',
    hint: '批量生成关键帧',
    busy: '批出中…',
    done: '已批出',
  },
  'clip-editor': {
    primary: '智能编排',
    hint: '自动编排时间线',
    busy: '编排中…',
    done: '已编排',
  },
  'export-pack': {
    primary: '导出成片',
    hint: '打包导出最终交付物',
    busy: '导出中…',
    done: '已导出',
  },
  'script-desk': {
    primary: '确认成稿',
    hint: '确认剧本成稿并抽取 Bible',
    busy: '处理中…',
    done: '已确认',
  },
  'sound-gen': {
    primary: '生成音频',
    hint: 'TTS / BGM 生成',
    busy: '生成中…',
    done: '已生成',
  },
  'batch-run': {
    primary: '批出 N 镜',
    hint: '批量生成所选镜头',
    busy: '批出中…',
    done: '批出完成',
  },
  playbook: {
    primary: '继续下一步',
    hint: '按 Playbook 推进到下一就绪步骤',
    busy: '执行中…',
    done: '全部完成',
  },
  prompt: {
    primary: '生成提示词',
    hint: '运行提示词节点',
    busy: '生成中…',
    done: '已生成',
  },
  'upscale-lite': {
    primary: '放大图像',
    hint: '提升分辨率',
    busy: '放大中…',
    done: '已放大',
  },
  'bg-remove': {
    primary: '抠图',
    hint: '移除背景',
    busy: '抠图中…',
    done: '已抠图',
  },
  'continuity-check': {
    primary: '连贯性检查',
    hint: '检查镜头间连贯性',
    busy: '检查中…',
    done: '已检查',
  },
  'inpaint-edit': {
    primary: '局部重绘',
    hint: '按蒙版重绘',
    busy: '重绘中…',
    done: '已重绘',
  },
  'local-enhance': {
    primary: '局部增强',
    hint: '增强选区画质',
    busy: '增强中…',
    done: '已增强',
  },
  'link-parser': {
    primary: '解析链接',
    hint: '抽取平台媒体',
    busy: '解析中…',
    done: '已解析',
  },
  'grid-compose': {
    primary: '合成宫格',
    hint: '拼合宫格图',
    busy: '合成中…',
    done: '已合成',
  },
  'grid-split': {
    primary: '拆分宫格',
    hint: '拆成单格',
    busy: '拆分中…',
    done: '已拆分',
  },
  'caption-asr': {
    primary: '语音转字幕',
    hint: 'ASR 字幕',
    busy: '转写中…',
    done: '已转写',
  },
  iterator: {
    primary: '执行迭代',
    hint: '按批次迭代运行',
    busy: '迭代中…',
    done: '已迭代',
  },
  'reference-board': {
    primary: '应用参考板',
    hint: '写入约束到下游',
    busy: '应用中…',
    done: '已应用',
  },
};

/**
 * 获取指定节点类型的主按钮文案。
 */
export function resolveRunLabel(
  kind: string,
  status?: NodeRunStatus | string,
  count?: number,
): RunLabelDict {
  const base = LABELS[kind] ?? LABELS.default;
  if ((kind === 'batch-run' || kind === 'prompt') && count && count > 1) {
    return {
      ...base,
      primary: kind === 'batch-run' ? `批出 ${count} 镜` : `生成 (${count})`,
    };
  }
  if (status === 'running' || status === 'generating') {
    return {
      ...base,
      primary: base.busy ?? '运行中…',
    };
  }
  if (status === 'done' || status === 'success') {
    return {
      ...base,
      primary: base.done ?? '已完成',
    };
  }
  return base;
}

/** 已登记的专属文案 kind（测试用）。 */
export function listedRunLabelKinds(): string[] {
  return Object.keys(LABELS).filter((k) => k !== 'default');
}
