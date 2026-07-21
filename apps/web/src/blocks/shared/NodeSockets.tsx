import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  SOCKET_COLORS,
  type SocketKind,
  type VerticalSocketSpec,
} from '@nx9/shared';

/** 左右数据口：每侧仅 1 个（主类型），避免一堆色点 */
export const SideSocketHandle = memo(function SideSocketHandle({
  kind,
  type,
  id,
  hidden,
}: {
  kind: SocketKind;
  type: 'source' | 'target';
  id?: string;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <Handle
      type={type}
      position={type === 'target' ? Position.Left : Position.Right}
      id={id ?? kind}
      className="nx9-socket nx9-socket--side"
      style={{ background: SOCKET_COLORS[kind], top: '50%' }}
      title={kind}
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
  const inKind = accepts[0];
  const outKind = emits[0];
  return (
    <>
      {inKind && (
        <div className="nx9-stage-card__ports nx9-stage-card__ports--left">
          <SideSocketHandle kind={inKind} type="target" />
        </div>
      )}
      {outKind && (
        <div className="nx9-stage-card__ports nx9-stage-card__ports--right">
          <SideSocketHandle kind={outKind} type="source" />
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
