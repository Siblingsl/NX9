import { FlowSurface, type FlowSurfaceProps } from '../FlowSurface';

/** Stage Deck Canvas 主入口 — 替代 FlowSurface UX 层 */
export function StageDeckSurface(props: Omit<FlowSurfaceProps, 'variant'>) {
  return <FlowSurface {...props} variant="stage-deck" />;
}
