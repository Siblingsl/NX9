export const FLOW_EDGE_TYPES = [
  { id: 'default', label: '贝塞尔曲线' },
  { id: 'straight', label: '直线' },
  { id: 'smoothstep', label: '平滑折线' },
  { id: 'step', label: '直角折线' },
  { id: 'simplebezier', label: '简单曲线' },
] as const;

export type FlowEdgeTypeId = (typeof FLOW_EDGE_TYPES)[number]['id'];

export function normalizeFlowEdgeType(type?: string | null): FlowEdgeTypeId {
  const found = FLOW_EDGE_TYPES.find((item) => item.id === type);
  return found?.id ?? 'default';
}
