import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  SOCKET_COLORS,
  type SocketKind,
  type VerticalSocketSpec,
} from '@nx9/shared';

/** 左右数据口：主类型可见；其余 kind 仅作 RF 锚点（管线边可能指定 picture/clip 等） */
export const SideSocketHandle = memo(function SideSocketHandle({
  kind,
  type,
  id,
  hidden,
  ghost,
}: {
  kind: SocketKind;
  type: 'source' | 'target';
  id?: string;
  hidden?: boolean;
  /** 不可见、不可点：仅让 React Flow 能解析已有边的 handle id */
  ghost?: boolean;
}) {
  if (hidden) return null;
  return (
    <Handle
      type={type}
      position={type === 'target' ? Position.Left : Position.Right}
      id={id ?? kind}
      className={`nx9-socket nx9-socket--side${ghost ? ' nx9-socket--anchor' : ''}`}
      style={{
        background: ghost ? 'transparent' : SOCKET_COLORS[kind],
        top: '50%',
        ...(ghost
          ? { opacity: 0, pointerEvents: 'none' as const, border: 'none', boxShadow: 'none' }
          : null),
      }}
      title={ghost ? undefined : kind}
      aria-hidden={ghost || undefined}
    />
  );
});

/** 上下能力口（顶/底各按 registry 配置，通常 0–1 个） */
export const VerticalSocketHandle = memo(function VerticalSocketHandle({
  spec,
  hidden,
}: {
  spec: VerticalSocketSpec;
  hidden?: boolean;
}) {
  if (hidden) return null;
  const position = spec.position === 'top' ? Position.Top : Position.Bottom;
  const offset = `${spec.offsetPct ?? 50}%`;
  const commonStyle = {
    background: SOCKET_COLORS[spec.kind],
    left: offset,
  };
  const className = 'nx9-socket nx9-socket--exec';

  if (spec.type === 'both') {
    return (
      <>
        <Handle
          type="target"
          position={position}
          id={spec.id}
          className={`${className} nx9-socket--both-target`}
          style={commonStyle}
          title={spec.label ?? spec.kind}
        />
        <Handle
          type="source"
          position={position}
          id={`${spec.id}-out`}
          className={`${className} nx9-socket--both-source`}
          style={commonStyle}
          title={spec.label ?? spec.kind}
        />
      </>
    );
  }

  return (
    <Handle
      type={spec.type}
      position={position}
      id={spec.id}
      className={className}
      style={commonStyle}
      title={spec.label ?? spec.kind}
    />
  );
});

export function SideSocketRails({
  accepts,
  emits,
  hidden,
}: {
  accepts: SocketKind[];
  emits: SocketKind[];
  hidden?: boolean;
}) {
  if (hidden) return null;
  // 每侧只露主类型一口：兼容性仍由 validateLink(节点类型) 判定
  // 次要 kind 挂不可见锚点，避免管线边 targetHandle=picture|clip 触发 RF #008
  const inKind = accepts[0];
  const outKind = emits[0];
  const anchorTargets = accepts.slice(1);
  const anchorSources = emits.slice(1);
  return (
    <>
      {(inKind || anchorTargets.length > 0) && (
        <div className="nx9-stage-card__ports nx9-stage-card__ports--left">
          {inKind && <SideSocketHandle kind={inKind} type="target" />}
          {anchorTargets.map((kind) => (
            <SideSocketHandle key={`in-${kind}`} kind={kind} type="target" ghost />
          ))}
        </div>
      )}
      {(outKind || anchorSources.length > 0) && (
        <div className="nx9-stage-card__ports nx9-stage-card__ports--right">
          {outKind && <SideSocketHandle kind={outKind} type="source" />}
          {anchorSources.map((kind) => (
            <SideSocketHandle key={`out-${kind}`} kind={kind} type="source" ghost />
          ))}
        </div>
      )}
    </>
  );
}

export function VerticalSocketRails({
  top,
  bottom,
  hidden,
}: {
  top: VerticalSocketSpec[];
  bottom: VerticalSocketSpec[];
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <>
      {top.length > 0 && (
        <div className="nx9-stage-card__ports nx9-stage-card__ports--top">
          {top.map((spec) => (
            <VerticalSocketHandle key={spec.id} spec={spec} />
          ))}
        </div>
      )}
      {bottom.length > 0 && (
        <div className="nx9-stage-card__ports nx9-stage-card__ports--bottom">
          {bottom.map((spec) => (
            <VerticalSocketHandle key={spec.id} spec={spec} />
          ))}
        </div>
      )}
    </>
  );
}
