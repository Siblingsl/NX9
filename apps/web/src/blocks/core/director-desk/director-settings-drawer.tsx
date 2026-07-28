import { isDevPromptEnabled } from '../../../stores/dev-prompt-overrides';
import { DirectorDeskDevFields } from './director-desk-dev-fields';

interface DirectorSettingsDrawerProps {
  showSettings: boolean;
  skipExisting: boolean;
  skipApproved: boolean;
  forceCharacterRef: boolean;
  forceSceneRef: boolean;
  styleLock: boolean;
  prefer3dRef: boolean;
  concurrency: number;
  maxRetries: number;
  stylePrompt: string;
  styleSeed: number | null;
  syncStyleToPicture: boolean;
  autoOpenReview: boolean;
  globalArtDirection: unknown;
  blockId: string;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  syncStyleNow: () => void;
  setShowSettings: (v: boolean) => void;
}

export function DirectorSettingsDrawer({
  showSettings,
  skipExisting,
  skipApproved,
  forceCharacterRef,
  forceSceneRef,
  styleLock,
  prefer3dRef,
  concurrency,
  maxRetries,
  stylePrompt,
  styleSeed,
  syncStyleToPicture,
  autoOpenReview,
  globalArtDirection,
  blockId,
  updateNodeData,
  syncStyleNow,
  setShowSettings,
}: DirectorSettingsDrawerProps) {
  return (
    <div className={`dd2-settings-drawer ${showSettings ? 'is-open' : ''}`}>
      <div className="dd2-settings-drawer__head">
        <span>批出设置</span>
        <button type="button" onClick={() => setShowSettings(false)}>完成</button>
      </div>
      <div className="dd2-settings-drawer__body">
        <div className="dd2-settings-group">
          <span className="dd2-settings-group__label">跳过策略</span>
          <div className="dd2-settings-row">
            <label className="dd2-settings-check">
              <input type="checkbox" checked={skipExisting} onChange={(e) => updateNodeData(blockId, { skipExisting: e.target.checked })} />
              跳过已有
            </label>
            <label className="dd2-settings-check">
              <input type="checkbox" checked={skipApproved} onChange={(e) => updateNodeData(blockId, { skipApproved: e.target.checked })} />
              跳过通过
            </label>
          </div>
        </div>

        <div className="dd2-settings-group">
          <span className="dd2-settings-group__label">参考锁</span>
          <div className="dd2-settings-row">
            <label className="dd2-settings-check">
              <input type="checkbox" checked={forceCharacterRef} onChange={(e) => updateNodeData(blockId, { forceCharacterRef: e.target.checked })} />
              角色参考
            </label>
            <label className="dd2-settings-check">
              <input type="checkbox" checked={forceSceneRef} onChange={(e) => updateNodeData(blockId, { forceSceneRef: e.target.checked })} />
              场景参考
            </label>
            <label className="dd2-settings-check">
              <input type="checkbox" checked={styleLock} onChange={(e) => updateNodeData(blockId, { styleLock: e.target.checked })} />
              风格锁
            </label>
            <label className="dd2-settings-check">
              <input type="checkbox" checked={prefer3dRef} onChange={(e) => updateNodeData(blockId, { prefer3dRef: e.target.checked })} />
              优先 3D
            </label>
          </div>
        </div>

        <div className="dd2-settings-group">
          <span className="dd2-settings-group__label">并发 / 重试</span>
          <div className="dd2-settings-row">
            <span className="dd2-settings-hint">并发</span>
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" className={`dd2-settings-chip ${concurrency === n ? 'is-on' : ''}`} onClick={() => updateNodeData(blockId, { concurrency: n })}>{n}</button>
            ))}
            <span className="dd2-settings-hint">重试</span>
            {[0, 1, 2].map((n) => (
              <button key={n} type="button" className={`dd2-settings-chip ${maxRetries === n ? 'is-on' : ''}`} onClick={() => updateNodeData(blockId, { maxRetries: n })}>{n}</button>
            ))}
          </div>
        </div>

        <div className="dd2-settings-group">
          <span className="dd2-settings-group__label">风格</span>
          <input
            type="text"
            className="dd2-settings-input"
            value={stylePrompt}
            placeholder="统一风格补充（如 film still, teal-orange）"
            onChange={(e) => updateNodeData(blockId, { stylePrompt: e.target.value })}
          />
          <div className="dd2-settings-row">
            <span className="dd2-settings-hint">Seed</span>
            <input
              type="number"
              className="dd2-settings-input dd2-settings-input--seed"
              value={styleSeed ?? ''}
              placeholder="空=默认"
              onChange={(e) => {
                const v = e.target.value;
                updateNodeData(blockId, { styleSeed: v === '' ? null : Number(v) });
              }}
            />
            <button type="button" className="dd2-settings-sync-btn" onClick={syncStyleNow}>
              立即写回
            </button>
          </div>
          {globalArtDirection && (
            <span className="dd2-settings-hint">已读全局美术方向</span>
          )}
          <div className="dd2-settings-row" style={{ marginTop: 4 }}>
            <label className="dd2-settings-check">
              <input type="checkbox" checked={syncStyleToPicture} onChange={(e) => updateNodeData(blockId, { syncStyleToPicture: e.target.checked })} />
              风格写回出图节点
            </label>
            <label className="dd2-settings-check">
              <input type="checkbox" checked={autoOpenReview} onChange={(e) => updateNodeData(blockId, { autoOpenReview: e.target.checked })} />
              批完进审阅
            </label>
          </div>
        </div>

        {isDevPromptEnabled() && (
          <details className="dd2-settings-dev">
            <summary>开发 · 导演台短模板字段</summary>
            <DirectorDeskDevFields blockId={blockId} />
          </details>
        )}
      </div>
    </div>
  );
}
