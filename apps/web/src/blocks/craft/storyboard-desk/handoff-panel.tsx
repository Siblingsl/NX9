import React from 'react';

interface HandoffPanelProps {
  visibleShots: any[];
  compositionStats: { coverage: number; boundCharacters: number; boundScenes: number; composed: number; total: number };
  confirmHardThreshold: boolean;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  blockId: string;
  contactSheetUrl: string | null | undefined;
  currentEpisodeConfirmed: boolean;
  downloadContactSheet: () => void;
  sheetComposing: boolean;
  deskBusy: boolean;
  payload: any;
  setStudioTab: React.Dispatch<React.SetStateAction<any>>;
  setComposeViewTab: React.Dispatch<React.SetStateAction<any>>;
  confirmCurrentEpisode: () => Promise<void>;
  openDirectorDesk: () => void;
  exportReviewPackage: () => Promise<void>;
  generateStoryboardSheet: (force?: boolean) => Promise<void>;
}

const HandoffPanel: React.FC<HandoffPanelProps> = ({
  visibleShots,
  compositionStats,
  confirmHardThreshold,
  updateNodeData,
  blockId,
  contactSheetUrl,
  currentEpisodeConfirmed,
  downloadContactSheet,
  sheetComposing,
  deskBusy,
  payload,
  setStudioTab,
  setComposeViewTab,
  confirmCurrentEpisode,
  openDirectorDesk,
  exportReviewPackage,
  generateStoryboardSheet,
}) => {
  return (
    <div className="sg3-pane sg3-pane--center">
      <div className="sg3-hero">
        <p className="sg3-hero__eyebrow">步骤 4 · 交接</p>
        <h3 className="sg3-hero__title">本集就绪检查</h3>
        <p className="sg3-hero__desc">确认后导演台可按本集批出关键帧。</p>
      </div>
      <ul className="sg3-checklist">
        <li>
          <span>镜数 ≥ 1</span>
          <em className={visibleShots.length > 0 ? 'is-ok' : 'is-warn'}>
            {visibleShots.length > 0 ? '通过' : '阻断'}
          </em>
        </li>
        <li>
          <span>构图覆盖（软）≥ 60% · {Math.round(compositionStats.coverage * 100)}%</span>
          <em className={compositionStats.coverage >= 0.6 ? 'is-ok' : 'is-warn'}>
            {compositionStats.coverage >= 0.6 ? '通过' : '警告'}
          </em>
        </li>
        <li>
          <span>硬阈值确认门禁</span>
          <button
            type="button"
            className="sg3-btn sg3-btn--ghost"
            style={{ fontSize: 11, padding: '1px 6px' }}
            onClick={() => {
              const next = !confirmHardThreshold;
              updateNodeData(blockId, { confirmHardThreshold: next });
            }}
          >
            {confirmHardThreshold ? '(开) 低于60%禁止确认' : '(关) 允许强制确认'}
          </button>
        </li>
        <li>
          <span>
            角色/场绑定 · 角 {compositionStats.boundCharacters}/{compositionStats.total}
            {' · '}
            场 {compositionStats.boundScenes}/{compositionStats.total}
          </span>
          <em>提示</em>
        </li>
        <li>
          <span>故事板大图（合并预览）</span>
          <em className={contactSheetUrl ? 'is-ok' : 'is-warn'}>
            {contactSheetUrl ? '已生成' : '未生成'}
          </em>
        </li>
        <li>
          <span>本集确认状态</span>
          <em className={currentEpisodeConfirmed ? 'is-ok' : 'is-warn'}>
            {currentEpisodeConfirmed ? '已确认' : '未确认'}
          </em>
        </li>
      </ul>
      {contactSheetUrl ? (
        <div className="sg3-sheet sg3-sheet--handoff">
          <a
            className="sg3-sheet__preview"
            href={contactSheetUrl}
            target="_blank"
            rel="noreferrer"
          >
            <img src={contactSheetUrl} alt="分镜故事板大图" />
          </a>
          <div className="sg3-sheet__acts">
            <button type="button" className="sg3-btn sg3-btn--ghost" onClick={downloadContactSheet}>
              下载故事板
            </button>
            <button
              type="button"
              className="sg3-btn sg3-btn--ghost"
              disabled={sheetComposing}
              onClick={() => {
                setStudioTab('compose');
                setComposeViewTab('sheet');
                void generateStoryboardSheet(true);
              }}
            >
              重新合成
            </button>
          </div>
        </div>
      ) : (
        <div className="sg3-hero__actions" style={{ marginBottom: 12 }}>
          <button
            type="button"
            className="sg3-btn sg3-btn--ghost"
            disabled={sheetComposing || visibleShots.length === 0}
            onClick={() => {
              setStudioTab('compose');
              setComposeViewTab('sheet');
              void generateStoryboardSheet(true);
            }}
          >
            {sheetComposing ? '合成中…' : '去构图生成故事板大图'}
          </button>
        </div>
      )}
      <div className="sg3-hero__actions">
        <button
          type="button"
          className="sg3-btn sg3-btn--primary"
          disabled={currentEpisodeConfirmed || visibleShots.length === 0 || deskBusy}
          onClick={confirmCurrentEpisode}
        >
          {currentEpisodeConfirmed ? '本集已确认' : '确认本集'}
        </button>
        <button
          type="button"
          className="sg3-btn sg3-btn--ghost"
          disabled={!currentEpisodeConfirmed || deskBusy}
          onClick={openDirectorDesk}
        >
          打开导演台
        </button>
        <button
          type="button"
          className="sg3-btn sg3-btn--ghost"
          disabled={!payload || visibleShots.length === 0}
          onClick={() => void exportReviewPackage()}
        >
          导出审片包
        </button>
      </div>
    </div>
  );
};

export default HandoffPanel;
