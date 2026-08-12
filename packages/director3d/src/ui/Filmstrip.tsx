import type { Director3dCandidate } from '../schema/directorProject';

export function Filmstrip({
  candidates,
  viewedId,
  adoptedId,
  onView,
  onAdopt,
  onRetry,
  onDelete,
  onRename,
}: {
  candidates?: Director3dCandidate[];
  viewedId?: string | null;
  adoptedId?: string | null;
  onView?: (id: string) => void;
  onAdopt?: (id: string) => void;
  onRetry?: (id: string) => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string, name: string) => void;
}) {
  const frames = candidates ?? [];

  if (frames.length === 0) {
    return (
      <div className="nx9-stage-filmstrip">
        <span className="nx9-stage-filmstrip-label">帧</span>
        <span className="nx9-stage-hint">
          点击「记录帧」创建候选；查看、采用、提交是三个独立步骤
        </span>
      </div>
    );
  }

  return (
    <div className="nx9-stage-filmstrip">
      <span className="nx9-stage-filmstrip-label">帧</span>
      {frames.map((candidate, index) => {
        const ready =
          candidate.status === 'ready' ||
          candidate.status === 'committed';
        const adopted = adoptedId === candidate.id;
        const viewed = viewedId === candidate.id;
        return (
          <div
            key={candidate.id}
            className={`nx9-stage-frame${viewed ? ' is-selected' : ''}`}
            title={candidate.error ?? candidate.prompt}
          >
            <button
              type="button"
              onClick={() => onView?.(candidate.id)}
              className="nx9-stage-frame-preview"
              title="仅查看此候选"
            >
              {candidate.imageUrl || candidate.localDataUrl ? (
                <img
                  src={candidate.imageUrl ?? candidate.localDataUrl}
                  alt={`候选帧 ${index + 1}`}
                  className={`nx9-stage-frame-thumb${
                    index === frames.length - 1 ? ' is-latest' : ''
                  }`}
                />
              ) : (
                <span className="nx9-stage-hint">无预览</span>
              )}
            </button>
            <input
              value={candidate.name ?? `候选 ${index + 1}`}
              onChange={(event) =>
                onRename?.(candidate.id, event.target.value)
              }
              className="nx9-stage-frame-name"
              aria-label={`候选帧 ${index + 1} 名称`}
            />
            <span>
              {candidate.status === 'committed'
                ? '已提交'
                : candidate.status === 'uploading'
                  ? '上传中'
                  : candidate.status === 'failed'
                    ? '上传失败'
                    : adopted
                      ? '已采用'
                      : '候选'}
            </span>
            <div className="nx9-stage-frame-actions">
              {candidate.status === 'failed' && (
                <button
                  type="button"
                  className="nx9-stage-mini-btn"
                  onClick={() => onRetry?.(candidate.id)}
                >
                  重试上传
                </button>
              )}
              {ready && candidate.status !== 'committed' && (
                <button
                  type="button"
                  className={`nx9-stage-mini-btn${adopted ? ' is-on' : ''}`}
                  onClick={() => onAdopt?.(candidate.id)}
                >
                  {adopted ? '已采用' : '采用此帧'}
                </button>
              )}
              <button
                type="button"
                className="nx9-stage-mini-btn nx9-stage-danger"
                disabled={candidate.status === 'committed'}
                onClick={() => onDelete?.(candidate.id)}
              >
                删除
              </button>
            </div>
            {candidate.commitId && (
              <span
                className="nx9-stage-hint"
                title={candidate.commitId}
              >
                {candidate.committedAt
                  ? new Date(candidate.committedAt).toLocaleString()
                  : candidate.commitId}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
