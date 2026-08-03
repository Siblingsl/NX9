/**
 * AssetReadinessPanel — 编剧台「设定就绪」面板（F-005）。
 *
 * 显示角色/场景缺口，支持一键同步入库。
 * 不出现「设定检查节点」文案，以「设定就绪」为统一入口。
 */
import { memo, useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Sparkles, AlertTriangle, BookOpen, Flag, Library } from 'lucide-react';
import type { ScreenplayPackage } from '@nx9/shared';
import {
  inspectBibleAssets,
  syncBibleAssets,
  markScriptAssetReady,
  type AssetReadinessState,
} from '../../engine/asset-readiness';
import { toastSuccess, toastError } from '../../stores/toast';
import { useAssetLibraryModalUi } from '../../stores/asset-library-modal-ui';

export const AssetReadinessPanel = memo(function AssetReadinessPanel({
  blockId,
  pkg,
  onReadinessChange,
}: {
  blockId: string;
  pkg: ScreenplayPackage;
  /** 把最新就绪态写回 script-desk.node.data.assetReadiness */
  onReadinessChange?: (state: AssetReadinessState) => void;
}) {
  const [report, setReport] = useState<AssetReadinessState | null>(null);
  const [syncing, setSyncing] = useState(false);
  const openAssetAt = useAssetLibraryModalUi((s) => s.openAt);

  useEffect(() => {
    if (pkg.status === 'confirmed') {
      setReport(inspectBibleAssets(pkg));
    } else {
      setReport(null);
    }
  }, [pkg]);

  const handleSync = useCallback(async () => {
    if (!pkg) return;
    setSyncing(true);
    try {
      const result = syncBibleAssets(pkg);
      setReport(result);
      onReadinessChange?.(result);
      toastSuccess(`已同步 ${result.syncedCharacters} 个角色、${result.syncedScenes} 个场景`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : '同步失败');
    } finally {
      setSyncing(false);
    }
  }, [onReadinessChange, pkg]);

  const handleMarkReady = useCallback((force = false) => {
    const base = report ?? inspectBibleAssets(pkg);
    const state: AssetReadinessState = {
      ...base,
      ...markScriptAssetReady(),
      requiredCharacters: base.requiredCharacters,
      requiredScenes: base.requiredScenes,
      missingCharacters: force ? base.missingCharacters : [],
      missingScenes: force ? base.missingScenes : [],
      missingCostumes: force ? base.missingCostumes : [],
      missingProps: force ? base.missingProps : [],
      ready: true,
    };
    setReport(state);
    onReadinessChange?.(state);
    toastSuccess(
      force && (base.missingCharacters.length > 0 || base.missingScenes.length > 0)
        ? '已强制标记设定就绪'
        : '已标记设定就绪',
    );
  }, [onReadinessChange, pkg, report]);

  if (!pkg || pkg.status !== 'confirmed') {
    const charN = pkg?.bible.characters.length ?? 0;
    const sceneN = pkg?.bible.scenes.length ?? 0;
    return (
      <div className="sd2-readiness-gate" role="status">
        <BookOpen size={16} aria-hidden />
        <p className="sd2-readiness-gate__title">设定就绪尚未解锁</p>
        <p className="sd2-readiness-gate__desc">
          本页检查的是设定中人物/场景是否已入库、能否交给分镜台。
          请先点顶栏「确认成稿」，再回到这里查看缺口并同步到资产库。
        </p>
        <p className="sd2-readiness-gate__meta">
          当前设定：人物 {charN} · 场景 {sceneN}
          {charN === 0 && sceneN === 0 ? '（可先点「抽取设定」）' : ''}
        </p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="sd2-ready-loading">
        <Loader2 size={14} className="sd2-spin" />
      </div>
    );
  }

  const hasMissing = report.missingCharacters.length > 0 || report.missingScenes.length > 0;

  return (
    <div className="sd2-ready-body" data-block-id={blockId}>
      <div className="sd2-ready-header">
        <span className="sd2-ready-header__label">设定就绪检查</span>
        {report.ready ? (
          <span className="sd2-ready-status sd2-ready-status--ok">
            <Check size={12} /> 已就绪
          </span>
        ) : (
          <span className="sd2-ready-status sd2-ready-status--warn">
            <AlertTriangle size={12} /> 有缺口
          </span>
        )}
      </div>

      {/* 角色 */}
      <div className="sd2-ready-section">
        <p className="sd2-ready-section__title">角色（{report.requiredCharacters.length}）</p>
        {report.requiredCharacters.length === 0 ? (
          <p className="sd2-ready-section__empty">设定中无角色</p>
        ) : (
          <div className="sd2-ready-tags">
            {report.requiredCharacters.map((name) => (
              <span
                key={name}
                className={`sd2-ready-tag ${report.missingCharacters.includes(name) ? 'sd2-ready-tag--warn' : 'sd2-ready-tag--ok'}`}
              >
                {name}
                {report.missingCharacters.includes(name) ? ' ⚠' : ' ✓'}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 场景 */}
      <div className="sd2-ready-section">
        <p className="sd2-ready-section__title">场景（{report.requiredScenes.length}）</p>
        {report.requiredScenes.length === 0 ? (
          <p className="sd2-ready-section__empty">设定中无场景</p>
        ) : (
          <div className="sd2-ready-tags">
            {report.requiredScenes.map((name) => (
              <span
                key={name}
                className={`sd2-ready-tag ${report.missingScenes.includes(name) ? 'sd2-ready-tag--warn' : 'sd2-ready-tag--ok'}`}
              >
                {name}
                {report.missingScenes.includes(name) ? ' ⚠' : ' ✓'}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 服装/道具（F-051） */}
      {report.missingCostumes && report.missingCostumes.length > 0 && (
        <div className="sd2-ready-section">
          <p className="sd2-ready-section__title">
            服装参考（点击缺口打开服装库）
          </p>
          <div className="sd2-ready-tags">
            {report.missingCostumes.map((name) => (
              <button
                type="button"
                key={name}
                onClick={() => openAssetAt({ tab: 'costume' })}
                className="sd2-ready-tag sd2-ready-tag--warn sd2-ready-tag--clickable"
                title="点击打开服装库"
              >
                {name} ⚠
              </button>
            ))}
          </div>
        </div>
      )}
      {report.missingProps && report.missingProps.length > 0 && (
        <div className="sd2-ready-section">
          <p className="sd2-ready-section__title">
            道具参考（点击缺口打开场景库）
          </p>
          <div className="sd2-ready-tags">
            {report.missingProps.map((name) => (
              <button
                type="button"
                key={name}
                onClick={() => openAssetAt({ tab: 'scene' })}
                className="sd2-ready-tag sd2-ready-tag--warn sd2-ready-tag--clickable"
                title="点击打开场景库"
              >
                {name} ⚠
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="sd2-ready-actions">
        {hasMissing && (
          <button
            type="button"
            disabled={syncing}
            onClick={handleSync}
            className="sd2-btn sd2-btn--primary"
          >
            {syncing ? <Loader2 size={12} className="sd-spin" /> : <Sparkles size={12} />}
            {syncing ? '同步中…' : '同步缺失项到库'}
          </button>
        )}
        <button
          type="button"
          onClick={() => openAssetAt({ tab: 'character' })}
          className="sd2-btn sd2-btn--ghost"
        >
          <Library size={12} />
          打开素材库
        </button>
        {!hasMissing || report.ready ? (
          <button
            type="button"
            onClick={() => handleMarkReady(false)}
            className="sd2-btn sd2-btn--ghost"
          >
            <Flag size={12} />
            标记设定就绪
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleMarkReady(true)}
            className="sd2-btn sd2-btn--ghost"
            title="有缺口时也可强制确认就绪"
          >
            <Flag size={12} />
            仍要标记就绪
          </button>
        )}
      </div>
    </div>
  );
});
