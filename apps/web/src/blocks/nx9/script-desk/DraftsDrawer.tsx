/**
 * Q-01: 编剧台草稿箱弹层（自 ScriptDeskBlock 纯搬运）。
 * 打开/删除/双击改名；autosave 与来源 block 标签；前三集预览。
 */
import type { Dispatch, SetStateAction } from 'react';
import { FolderOpen, Trash2 } from 'lucide-react';
import type { ScriptDeskFolderSnapshot } from '@nx9/shared';
import { compact } from './desk-helpers';

export interface DraftsDrawerProps {
  drafts: ScriptDeskFolderSnapshot[];
  renamingDraftId: string | null;
  setRenamingDraftId: Dispatch<SetStateAction<string | null>>;
  renamingDraftText: string;
  setRenamingDraftText: Dispatch<SetStateAction<string>>;
  renameScriptDeskDraft: (id: string, title: string) => void;
  /** busy || continueBusy || rewritingEpIndex != null（C-08 运行互锁） */
  locked: boolean;
  onOpenDraft: (id: string) => void;
  onDeleteDraft: (id: string, title: string) => Promise<void>;
  onClose: () => void;
}

export function DraftsDrawer({
  drafts,
  renamingDraftId,
  setRenamingDraftId,
  renamingDraftText,
  setRenamingDraftText,
  renameScriptDeskDraft,
  locked,
  onOpenDraft,
  onDeleteDraft,
  onClose,
}: DraftsDrawerProps) {
  return (
    <div className="sd2-overlay" onClick={onClose}>
      <div className="sd2-popup sd2-popup--drafts" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="编剧台草稿箱">
        <h3 className="sd2-popup__title">草稿箱</h3>
        <p className="sd2-popup__desc">每个剧本一个文件夹。打开会回显到编剧台；若当前有制作中内容，会先自动存入草稿。</p>
        {drafts.length === 0 ? (
          <div className="sd2-drafts-empty">暂无草稿</div>
        ) : (
          <ul className="sd2-drafts-list">
            {drafts.map((folder) => (
              <li key={folder.id} className="sd2-draft-folder">
                <div className="sd2-draft-folder__icon" aria-hidden>
                  <FolderOpen size={18} />
                </div>
                <div className="sd2-draft-folder__meta">
                  <div className="sd2-draft-folder__title">
                    {renamingDraftId === folder.id ? (
                      <input
                        className="sd2-draft-folder__rename-input"
                        value={renamingDraftText}
                        onChange={(e) => setRenamingDraftText(e.target.value)}
                        onBlur={() => {
                          if (renamingDraftText.trim() && renamingDraftText !== folder.title) {
                            renameScriptDeskDraft(folder.id, renamingDraftText);
                          }
                          setRenamingDraftId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            if (renamingDraftText.trim() && renamingDraftText !== folder.title) {
                              renameScriptDeskDraft(folder.id, renamingDraftText);
                            }
                            setRenamingDraftId(null);
                          } else if (e.key === 'Escape') {
                            setRenamingDraftId(null);
                          }
                        }}
                        autoFocus
                      />
                    ) : (
                      <span
                        className="sd2-draft-folder__title-text"
                        title="双击改名"
                        onDoubleClick={() => {
                          setRenamingDraftId(folder.id);
                          setRenamingDraftText(folder.title);
                        }}
                      >
                        {folder.title}
                      </span>
                    )}
                    {folder.kind === 'autosave' && (
                      <span className="sd2-draft-folder__tag">自动</span>
                    )}
                    {folder.sourceBlockId && (
                      <span className="sd2-draft-folder__tag" title={folder.sourceBlockId}>源：{compact(folder.sourceBlockId, 20)}</span>
                    )}
                  </div>
                  <div className="sd2-draft-folder__sub">
                    {folder.episodeCount} 集 · {folder.wordCount} 字 · {new Date(folder.savedAt).toLocaleString()}
                    {folder.package.screenplay.episodes.length > 0 && (
                      <span className="sd2-draft-folder__preview">
                        {folder.package.screenplay.episodes.slice(0, 3).map((ep) => `第${ep.index}集 ${ep.title || '未命名'}`).join(' · ')}
                        {folder.package.screenplay.episodes.length > 3 ? ` …共${folder.package.screenplay.episodes.length}集` : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="sd2-draft-folder__acts">
                  <button
                    type="button"
                    className="sd2-btn sd2-btn--primary"
                    disabled={locked}
                    onClick={() => onOpenDraft(folder.id)}
                  >
                    打开
                  </button>
                  <button
                    type="button"
                    className="sd2-btn sd2-btn--ghost"
                    disabled={locked}
                    title="删除到回收站"
                    onClick={() => void onDeleteDraft(folder.id, folder.title)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="sd2-popup__acts">
          <button type="button" className="sd2-btn sd2-btn--ghost" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
