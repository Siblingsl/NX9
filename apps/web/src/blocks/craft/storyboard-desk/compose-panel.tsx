import React, { useRef, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import {
  resolveStoryboardPreviewPictureSettings,
  type StoryboardPreviewPictureSettings,
} from '@nx9/shared';
import { StoryboardPreviewWorkspace } from '../../../engine/stage-deck/chrome/attached-workspace/storyboard-preview/StoryboardPreviewWorkspace';
import { StoryboardPreviewGenSettings } from '../../../engine/stage-deck/chrome/attached-workspace/storyboard-preview/StoryboardPreviewGenSettings';
import { VideoPopover } from '../../../engine/stage-deck/chrome/attached-workspace/generation/video/VideoPopover';

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
  connectedPictureGenId: string | null | undefined;
  currentEpisodeShotIds: Set<string>;
  previewPayloadEarly: any;
  lineArtAbortRef: React.MutableRefObject<AbortController | null>;
  generateBatchLineArt: (scope?: 'visible' | 'all') => Promise<void>;
  retryFailedLineArt: () => Promise<void>;
  generateBatchGridLineArt: (scope?: 'visible' | 'all') => Promise<void>;
  generateStoryboardSheet: (force?: boolean) => Promise<void>;
  downloadContactSheet: () => void;
  updatePictureSettings: (patch: Partial<StoryboardPreviewPictureSettings>) => void;
}

const COMPOSE_HINT =
  '批量出线稿以本 Tab 为准（缺图优先 / 宫格 / 故事板大图）。镜表卡片 ✨ 是单镜快捷入口，结果写入同一份线稿。整集工业级关键帧在导演台批出。';

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
  setStudioTab: _setStudioTab,
  connectedPictureGenId,
  currentEpisodeShotIds,
  previewPayloadEarly,
  lineArtAbortRef,
  generateBatchLineArt,
  retryFailedLineArt,
  generateBatchGridLineArt,
  generateStoryboardSheet,
  downloadContactSheet,
  updatePictureSettings,
}) => {
  const previewOk = (previewPayloadEarly?.frames ?? []).filter((f: any) => f.imageUrl?.trim()).length;
  const pictureSettings = resolveStoryboardPreviewPictureSettings(previewPayloadEarly);
  const infoBtnRef = useRef<HTMLButtonElement>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  const statusText = sheetComposing
    ? '正在合成故事板大图…'
    : generatingShotId !== null
      ? `单镜线稿 · ${visibleShots.find((s) => s.id === generatingShotId)?.sceneCode || `#${visibleShots.find((s) => s.id === generatingShotId)?.index ?? ''}`}`
      : batchMode === 'line-art'
        ? `批量线稿 ${batchProgress || ''}`.trim()
        : batchMode === 'grid-line-art'
          ? `宫格线稿 ${batchProgress || ''}`.trim()
          : `覆盖 ${Math.round(compositionStats.coverage * 100)}% · ${previewOk}/${compositionStats.total || visibleShots.length}`;

  const busyGen = batchRunning || sheetComposing || generatingShotId !== null;

  return (
    <div className="sg3-pane">
      <div className="sg3-compose-chrome">
        <div className="sg3-compose-chrome__row">
          <div className="sg3-compose-chrome__left">
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
                故事板大图
                {contactSheetUrl ? <em>已有</em> : null}
              </button>
            </div>

            <span className="sg3-compose-chrome__status" title="主路径：在此批量出线稿；镜表卡片 ✨ 为单镜快捷入口，结果同一份">
              {statusText}
            </span>

            {!connectedPictureGenId ? (
              <span className="sg3-compose-chrome__warn" title="请从能力口连接「图像生成」节点后再出线稿">
                未连图像
              </span>
            ) : null}

            <button
              ref={infoBtnRef}
              type="button"
              className="sg3-compose-chrome__info"
              aria-label="构图说明"
              title="构图说明"
              onClick={() => setInfoOpen((v) => !v)}
            >
              <CircleHelp size={14} strokeWidth={2} />
            </button>
            <VideoPopover open={infoOpen} onClose={() => setInfoOpen(false)} anchorRef={infoBtnRef} width={280}>
              <p className="sg3-compose-chrome__info-body">{COMPOSE_HINT}</p>
            </VideoPopover>
          </div>

          <div className="sg3-compose-chrome__right">
            <div className="sg3-compose-chrome__acts">
              {!batchRunning ? (
                <div className="sg3-compose-scope" role="group" aria-label="线稿范围">
                  <button
                    type="button"
                    className={`sg3-compose-scope__btn ${batchScopeMode === 'missing' ? 'is-on' : ''}`}
                    title="缺图优先：仅对缺图镜出线稿"
                    onClick={() => setBatchScopeMode('missing')}
                  >
                    缺图
                  </button>
                  <button
                    type="button"
                    className={`sg3-compose-scope__btn ${batchScopeMode === 'all' ? 'is-on' : ''}`}
                    title="全部覆盖：对所有镜重新出线稿"
                    onClick={() => setBatchScopeMode('all')}
                  >
                    全部
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                className="sg3-btn sg3-btn--primary"
                disabled={!payload || busyGen || visibleShots.length === 0}
                title={generatingShotId !== null ? '单镜生成中' : '批量出线稿'}
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
              ) : null}

              {!batchRunning && lastBatchFailures.length > 0 ? (
                <button
                  type="button"
                  className="sg3-btn sg3-btn--ghost"
                  title={`重试失败的 ${lastBatchFailures.length} 镜`}
                  disabled={!payload || visibleShots.length === 0 || deskBusy}
                  onClick={() => void retryFailedLineArt()}
                >
                  重试 · {lastBatchFailures.length}
                </button>
              ) : null}

              <button
                type="button"
                className="sg3-btn sg3-btn--primary"
                disabled={!payload || busyGen || visibleShots.length === 0}
                title={
                  generatingShotId !== null
                    ? '单镜生成中'
                    : '固定 2×2 四宫格出图再切回各镜；不足 4 镜白板补齐，节省出图次数'
                }
                onClick={() => void generateBatchGridLineArt('visible')}
              >
                {batchMode === 'grid-line-art'
                  ? `宫格 ${batchProgress}`
                  : `宫格 · ${Math.min(4, visibleShots.length) || 0}`}
              </button>

              <button
                type="button"
                className="sg3-btn sg3-btn--ghost"
                disabled={!payload || batchRunning || sheetComposing || visibleShots.length === 0 || deskBusy}
                title={contactSheetUrl ? '重新合成故事板大图' : '生成本集故事板大图'}
                onClick={() => {
                  setComposeViewTab('sheet');
                  void generateStoryboardSheet(true);
                }}
              >
                {sheetComposing ? '合成中…' : contactSheetUrl ? '重出故事板' : '故事板'}
              </button>

              <button
                type="button"
                className="sg3-btn sg3-btn--ghost"
                disabled={!contactSheetUrl}
                title={contactSheetUrl ? '下载已合成的宫格/故事板大图' : '尚无合成大图可导出'}
                onClick={downloadContactSheet}
              >
                导出图片
              </button>
            </div>

            <span className="sg3-compose-chrome__sep" aria-hidden />

            <div className="sg3-compose-chrome__gen" aria-label="出图参数">
              <StoryboardPreviewGenSettings
                settings={pictureSettings}
                onChange={updatePictureSettings}
                modelWidth={148}
                compact
              />
            </div>
          </div>
        </div>
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
                    disabled={sheetComposing || batchRunning}
                    onClick={() => void generateStoryboardSheet(true)}
                  >
                    {sheetComposing ? '合成中…' : '重新合成'}
                  </button>
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
          {!payload ? (
            <div className="sg3-onboard" style={{ marginTop: 20, padding: 16, background: 'rgba(0,0,0,0.15)', borderRadius: 12, fontSize: 13, lineHeight: 1.8 }}>
              <p className="sg3-onboard__hint">三步完成分镜准备：</p>
              <ol style={{ paddingLeft: 20, margin: '8px 0' }}>
                <li><b>拆镜</b>：从编剧台成稿自动生成镜表</li>
                <li><b>出线稿</b>：在构图 Tab 批量生成分镜线稿</li>
                <li><b>确认交接</b>：满足覆盖率后确认，并打开导演台</li>
              </ol>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default ComposePanel;
