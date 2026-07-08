import { createPortal } from 'react-dom';
import { FLOW_EDGE_TYPES, type FlowEdgeTypeId } from '../../flow-edge-types';

interface EdgeMidpointMenuProps {
  x: number;
  y: number;
  edgeId: string;
  edgeType: FlowEdgeTypeId;
  onChangeType: (type: FlowEdgeTypeId) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function EdgeMidpointMenu({
  x,
  y,
  edgeId,
  edgeType,
  onChangeType,
  onDelete,
  onClose,
}: EdgeMidpointMenuProps) {
  return createPortal(
    <>
      <button type="button" className="fixed inset-0 z-[85]" aria-label="关闭" onClick={onClose} />
      <div
        className="fixed z-[86] nx9-context-menu min-w-[140px]"
        style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
        onMouseLeave={onClose}
      >
        <div className="nx9-context-menu__header">
          <span>连接线</span>
          <span className="font-mono opacity-70">{edgeId.slice(-6)}</span>
        </div>
        {FLOW_EDGE_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`nx9-context-menu__item nx9-context-menu__item--compact ${
              edgeType === t.id ? 'bg-brand/5 text-brand' : ''
            }`}
            onClick={() => {
              onChangeType(t.id);
              onClose();
            }}
          >
            {t.label}
          </button>
        ))}
        <div className="nx9-context-menu__divider" />
        <button
          type="button"
          className="nx9-context-menu__item nx9-context-menu__item--danger"
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          切断
        </button>
      </div>
    </>,
    document.body,
  );
}
