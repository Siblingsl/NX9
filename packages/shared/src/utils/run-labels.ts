/**
 * run-labels.ts — 「运行」入口心智统一（F-044）。
 *
 * 字典：节点级「运行本节点」；批出「批出 N 镜」；Playbook「继续下一步」。
 * 禁止都叫「运行」。
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
    primary: '运行',
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
};

/**
 * 获取指定节点类型的主按钮文案。
 */
export function resolveRunLabel(
  kind: string,
  status?: NodeRunStatus | string,
  count?: number,
): RunLabelDict {
  const base = LABELS[kind] ?? LABELS['default'];
  if (kind === 'batch-run' && count && count > 1) {
    return {
      ...base,
      primary: `批出 ${count} 镜`,
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
