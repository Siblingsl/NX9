import React from 'react';
import { StoryboardPreviewWorkspace } from '../../../engine/stage-deck/chrome/attached-workspace/storyboard-preview/StoryboardPreviewWorkspace';
import { ComposerModelSelect } from '../../../engine/stage-deck/chrome/attached-workspace/composer/ComposerModelSelect';

interface ComposePanelProps {
  blockId: string;
  payload: any;
  visibleShots: any[];
  deskBusy: boolean;
  sheetComposing: boolean;
  generatingShotId: string | null | undefined;
  batchMode: string | null;
  batchProgress: string | null;
  batchRunning: boolean;
  batchScopeMode: 'missing' | 'all';
  setBatchScopeMode: React.Dispatch<React.SetStateAction<'missing' | 'all'>>;
  lastBatchFailures: string[];
  compositionStats: { coverage: number; composed: number; total: number; boundCharacters: number; boundScenes: number };
  contactSheetUrl: string | null | undefined;
  composeViewTab: 'preview' | 'sheet';
  setComposeViewTab: React.Dispatch<React.SetStateAction<'preview' | 'sheet'>>;
  setStudioTab: React.Dispatch<React.SetStateAction<any>>;
  composePictureModel: string | undefined;
  composeModelOptions: Array<{ id: string; label: string }>;
  connectedPictureGenId: string | null | undefined;
  currentEpisodeShotIds: Set<string>;
  previewPayloadEarly: any;
  lineArtAbortRef: React.MutableRefObject<AbortController | null>;
  generateBatchLineArt: (scope?: 'visible' | 'all') => Promise<void>;
  retryFailedLineArt: () => Promise<void>;
  generateBatchGridLineArt: (scope?: 'visible' | 'all') => Promise<void>;
  generateStoryboardSheet: (force?: boolean) => Promise<void>;
  downloadContactSheet: () => void;
  handleComposeModelChange: (model: string) => void;
}

const ComposePanel: React.FC<ComposePanelProps> = ({
  blockId,
  payload,
  visibleShots,
  deskBusy,
  sheetComposing,
  generatingShotId,
  batchMode,
  batchProgress,
  batchRunning,
  batchScopeMode,
  setBatchScopeMode,
  lastBatchFailures,
  compositionStats,
  contactSheetUrl,
  composeViewTab,
  setComposeViewTab,
  setStudioTab,
  composePictureModel,
  composeModelOptions,
  connectedPictureGenId,
  currentEpisodeShotIds,
  previewPayloadEarly,
  lineArtAbortRef,
  generateBatchLineArt,
  retryFailedLineArt,
  generateBatchGridLineArt,
  generateStoryboardSheet,
  downloadContactSheet,
  handleComposeModelChange,
}) => {
  const previewOk = (previewPayloadEarly?.frames ?? []).filter((f: any) => f.imageUrl?.trim()).length;

  return (
    <div className="sg3-pane">
      <div className="sg3-toolbar">
        <div className="sg3-toolbar__meta">
          <span title="主路径：推荐在此批量出线稿；卡片线稿为快捷入口">
            主路径
          </span>
          {' · '}
          {sheetComposing
            ? '正在合成故事板大图…'
            : generatingShotId !== null
              ? `单镜线稿进行中 · ${visibleShots.find((s) => s.id === generatingShotId)?.sceneCode || `#${visibleShots.find((s) => s.id === generatingShotId)?.index ?? ''}`}`
              : batchMode === 'line-art'
                ? `批量线稿 ${batchProgress || ''}`.trim()
                : batchMode === 'grid-line-art'
                  ? `宫格线稿 ${batchProgress || ''}`.trim()
                  : `构图覆盖 ${Math.round(compositionStats.coverage * 100)}%`}
        </div>
        <div className="sg3-toolbar__acts">
          <button
            type="button"
            className="sg3-btn sg3-btn--primary"
            disabled={!payload || batchRunning || sheetComposing || generatingShotId !== null || visibleShots.length === 0}
            title={generatingShotId !== null ? '单镜生成中' : undefined}
            onClick={() => void generateBatchLineArt('visible')}
          >
            {batchMode === 'line-art' ? `线稿 ${batchProgress}` : `批量线稿 · ${visibleShots.length}`}
          </button>
          {batchRunning ? (
            <button
              type="button"
              className="sg3-btn sg3-btn--danger"
              onClick={() => lineArtAbortRef.current?.abort()}
            >
              停止
            </button>
          ) : (
            <>
              <button
                type="button"
                className={`sg3-btn sg3-btn--ghost ${batchScopeMode === 'missing' ? 'is-on' : ''}`}
                title="缺图优先：仅对缺图镜出线稿"
                onClick={() => setBatchScopeMode('missing')}
              >
                缺图优先
              </button>
              <button
                type="button"
                className={`sg3-btn sg3-btn--ghost ${batchScopeMode === 'all' ? 'is-on' : ''}`}
                title="全部覆盖：对所有镜重新出线稿"
                onClick={() => setBatchScopeMode('all')}
              >
                全部覆盖
              </button>
              {lastBatchFailures.length > 0 && (
                <button
                  type="button"
                  className="sg3-btn sg3-btn--ghost"
                  title={`重试失败的 ${lastBatchFailures.length} 镜`}
                  disabled={!payload || visibleShots.length === 0 || deskBusy}
                  onClick={() => void retryFailedLineArt()}
                >
                  重试失败 · {lastBatchFailures.length}
                </button>
              )}
            </>
          )}
          <button
            type="button"
            className="sg3-btn sg3-btn--ghost"
            disabled={!payload || batchRunning || sheetComposing || generatingShotId !== null || visibleShots.length === 0}
            title={generatingShotId !== null ? '单镜生成中' : '多镜提示词合成一张宫格再切回各镜，节省出图次数'}
            onClick={() => void generateBatchGridLineArt('visible')}
          >
            {batchMode === 'grid-line-art'
              ? `宫格 ${batchProgress}`
              : `宫格线稿 · ${Math.min(9, visibleShots.length) || 0}`}
          </button>
          <button
            type="button"
            className="sg3-btn sg3-btn--ghost"
            disabled={!payload || batchRunning || sheetComposing || visibleShots.length === 0 || deskBusy}
            onClick={() => {
              setComposeViewTab('sheet');
              void generateStoryboardSheet(true);
            }}
          >
            {sheetComposing ? '合成中…' : contactSheetUrl ? '重出故事板' : '生成故事板大图'}
          </button>
          <span className="sg3-toolbar__spacer" style={{ flex: 1, minWidth: 16 }} />
          <ComposerModelSelect
            value={composePictureModel ?? ''}
            options={
              composeModelOptions.length > 0
                ? composeModelOptions
                : [{ id: composePictureModel ?? '', label: '未配置图片连接 · 点此去设置' }]
            }
            onChange={handleComposeModelChange}
            width={220}
            tone="desk"
          />
        </div>
      </div>
      {!connectedPictureGenId ? (
        <p className="sg3-hint" style={{ color: 'var(--desk-warn)', fontWeight: 600 }}>
          未连接「图像生成」节点 · 请从能力口连线后再出线稿
        </p>
      ) : (
        <p className="sg3-hint">
         线稿确认构图为主路径；「故事板大图」将本集线稿拼成专业分镜总览板（含镜号/运镜注/对白）。整集工业级关键帧在导演台批出。
        </p>
      )}

      <div className="sg3-compose-tabs" role="tablist" aria-label="构图视图">
        <button
          type="button"
          role="tab"
          aria-selected={composeViewTab === 'preview'}
          className={`sg3-compose-tabs__btn ${composeViewTab === 'preview' ? 'is-on' : ''}`}
          onClick={() => setComposeViewTab('preview')}
        >
           线稿预览
          {previewOk > 0 ? <em>{previewOk}</em> : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={composeViewTab === 'sheet'}
          className={`sg3-compose-tabs__btn ${composeViewTab === 'sheet' ? 'is-on' : ''}`}
          onClick={() => setComposeViewTab('sheet')}
        >
          本集故事板大图
          {contactSheetUrl ? <em>已有</em> : null}
        </button>
      </div>

      {composeViewTab === 'preview' ? (
        <div className="sg3-compose-embed" role="tabpanel">
          <StoryboardPreviewWorkspace
            blockId={blockId}
            kind="storyboard-desk"
            embedded
            episodeShotIds={currentEpisodeShotIds}
          />
        </div>
      ) : (
        <div className="sg3-compose-sheet" role="tabpanel">
          {contactSheetUrl ? (
            <div className="sg3-sheet sg3-sheet--tab">
              <div className="sg3-sheet__head">
                <span className="sg3-sheet__title">本集故事板大图</span>
                <div className="sg3-sheet__acts">
                  <button
                    type="button"
                    className="sg3-btn sg3-btn--ghost"
                    disabled={sheetComposing}
                    onClick={downloadContactSheet}
                  >
                    下载 PNG
                  </button>
                  <button
                    type="button"
                    className="sg3-btn sg3-btn--ghost"
                    disabled={sheetComposing || batchRunning}
                    onClick={() => void generateStoryboardSheet(true)}
                  >
                    {sheetComposing ? '合成中…' : '重新合成'}
                  </button>
          {!payload && (
            <div className="sg3-onboard" style={{ marginTop: 20, padding: 16, background: 'rgba(0,0,0,0.15)', borderRadius: 12, fontSize: 13, lineHeight: 1.8 }}>
              <p className="sg3-onboard__hint">三步完成分镜准备：</p>
              <ol style={{ paddingLeft: 20, margin: '8px 0' }}>
                <li><b>拆镜</b>：从编剧台成稿自动生成镜表</li>
                <li><b>出线稿</b>：在构图 Tab 批量生成分镜线稿</li>
                <li><b>确认交接</b>：满足覆盖率后确认，并打开导演台</li>
              </ol>
            </div>
          )}
        </div>
              </div>
              <a
                className="sg3-sheet__preview"
                href={contactSheetUrl}
                target="_blank"
                rel="noreferrer"
                title="新窗口打开全图"
              >
                <img src={contactSheetUrl} alt="分镜故事板大图" />
              </a>
            </div>
          ) : (
            <div className="sg3-sheet-empty">
              <p className="sg3-sheet-empty__title">尚未生成故事板大图</p>
              <p className="sg3-sheet-empty__desc">
                将本集线稿 / 分镜图拼成一张总览板，便于审阅镜序与构图。
              </p>
              <button
                type="button"
                className="sg3-btn sg3-btn--primary"
                disabled={!payload || batchRunning || sheetComposing || visibleShots.length === 0}
                onClick={() => void generateStoryboardSheet(true)}
              >
                {sheetComposing ? '合成中…' : '生成故事板大图'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ComposePanel;
