/**
 * AssetReadinessPanel — 编剧台「设定就绪」面板（F-005）。
 *
 * 显示角色/场景缺口；角色入库标签上合并展示主角/配角与缺图提示。
 * 视觉门槛：主角三视图（或完整设定板）；配角定妆/主参考。
 */
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Sparkles, AlertTriangle, BookOpen, Flag, Library } from 'lucide-react';
import { normalizeScreenplayBibleCharacters, type ScreenplayPackage } from '@nx9/shared';
import {
  classifyBibleCharacterRoles,
  hasExplicitCharacterRoleLabel,
  inspectBibleAssets,
  syncBibleAssets,
  markScriptAssetReady,
  getStrictCostumePropGate,
  setStrictCostumePropGate,
  type AssetReadinessState,
  type CharacterVisualGap,
  toggleLibraryCharacterRole,
} from '../../engine/asset-readiness';
import { toastSuccess, toastError } from '../../stores/toast';
import { useAssetLibraryModalUi } from '../../stores/asset-library-modal-ui';
import { useWorkspaceDocument } from '../../stores/workspace-document';

function characterReadyLabel(
  name: string,
  role: 'main' | 'support',
  missingInLibrary: boolean,
  gap: CharacterVisualGap | undefined,
): { text: string; warn: boolean } {
  const roleLabel = role === 'main' ? '主角' : '配角';
  if (missingInLibrary) {
    return { text: `${name} · ${roleLabel} · 未入库`, warn: true };
  }
  const bits: string[] = [name, roleLabel];
  if (gap?.missingTurnaround) bits.push('缺三视图');
  if (gap?.missingReference) bits.push('缺定妆');
  if (!gap?.missingTurnaround && !gap?.missingReference) {
    bits.push('已齐');
    return { text: bits.join(' · '), warn: false };
  }
  return { text: bits.join(' · '), warn: true };
}

export const AssetReadinessPanel = memo(function AssetReadinessPanel({
  blockId,
  pkg,
  onReadinessChange,
  onPackageChange,
}: {
  blockId: string;
  pkg: ScreenplayPackage;
  /** 把最新就绪态写回 script-desk.node.data.assetReadiness */
  onReadinessChange?: (state: AssetReadinessState) => void;
  /** 清洗同人重复角色后写回 Bible */
  onPackageChange?: (next: ScreenplayPackage) => void;
  /** @deprecated 出图不依赖画布连线；保留参数以免调用方报错 */
  connectedPictureGenId?: string | null;
}) {
  const [report, setReport] = useState<AssetReadinessState | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [strictCostumeProp, setStrictCostumeProp] = useState(() => getStrictCostumePropGate());
  const openAssetAt = useAssetLibraryModalUi((s) => s.openAt);
  const resumeFocus = useAssetLibraryModalUi((s) => s.resumeFocus);
  const clearResumeFocus = useAssetLibraryModalUi((s) => s.clearResumeFocus);
  const libraryOpen = useAssetLibraryModalUi((s) => s.open);

  // 从素材库「返回设定就绪」后高亮对应缺口区
  useEffect(() => {
    if (libraryOpen || !resumeFocus) return;
    const section = resumeFocus.section ?? 'characters';
    const el = document.querySelector(`[data-ready-section="${section}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (resumeFocus.gapKey) {
      const tag = document.querySelector(
        `[data-ready-section="${section}"] [data-ready-gap="${CSS.escape(resumeFocus.gapKey)}"]`,
      ) as HTMLElement | null;
      tag?.classList.add('sd2-ready-tag--resume');
      tag?.focus?.();
      window.setTimeout(() => tag?.classList.remove('sd2-ready-tag--resume'), 2400);
    }
    clearResumeFocus();
  }, [libraryOpen, resumeFocus, clearResumeFocus]);

  // 监听素材库 tags 的变化，以便角色主/配角切换后即时刷新就绪 UI
  const libraryCharacters = useWorkspaceDocument((s) => s.characters.characters);
  const roles = useMemo(
    () => classifyBibleCharacterRoles(pkg),
    [pkg, libraryCharacters],
  );
  const unlabeledRoleNames = useMemo(
    () =>
      pkg.bible.characters
        .filter((c) => c.name.trim() && !hasExplicitCharacterRoleLabel(c.identity))
        .map((c) => c.name.trim()),
    [pkg],
  );
  const gapByName = useMemo(() => {
    const map = new Map<string, CharacterVisualGap>();
    for (const gap of report?.characterVisualGaps ?? []) {
      map.set(gap.name, gap);
    }
    return map;
  }, [report?.characterVisualGaps]);

  useEffect(() => {
    if (pkg.status !== 'confirmed') {
      setReport(null);
      return;
    }
    // 历史脏数据：同人拆成「李稳」+「李稳 (化名陈默)」时先合并再检
    const normalized = normalizeScreenplayBibleCharacters(pkg);
    if (normalized !== pkg) {
      onPackageChange?.(normalized);
      return;
    }
    setReport(inspectBibleAssets(pkg));
  }, [onPackageChange, pkg, strictCostumeProp]);

  const handleToggleStrictCostumeProp = useCallback(() => {
    const next = !getStrictCostumePropGate();
    setStrictCostumePropGate(next);
    setStrictCostumeProp(next);
    if (pkg.status === 'confirmed') {
      const nextReport = inspectBibleAssets(pkg);
      setReport(nextReport);
      onReadinessChange?.(nextReport);
    }
  }, [onReadinessChange, pkg]);

  const handleToggleRole = useCallback((name: string) => {
    if (!pkg) return;
    const { ok, nextRole } = toggleLibraryCharacterRole(name);
    if (!ok) {
      toastError('该角色未在素材库中，无法切换主/配角');
      return;
    }
    const normalized = normalizeScreenplayBibleCharacters(pkg);
    const next = inspectBibleAssets(normalized);
    setReport(next);
    onReadinessChange?.(next);
    toastSuccess(`已将「${name}」切换为${nextRole === 'main' ? '主角' : '配角'}`);
  }, [onReadinessChange, pkg]);

  const handleSync = useCallback(async () => {
    if (!pkg) return;
    setSyncing(true);
    try {
      const normalized = normalizeScreenplayBibleCharacters(pkg);
      if (normalized !== pkg) onPackageChange?.(normalized);
      const result = syncBibleAssets(normalized);
      setReport(result);
      onReadinessChange?.(result);
      const created = result.syncedCharacters ?? 0;
      const filled = result.filledCharacters ?? 0;
      const scenes = result.syncedScenes ?? 0;
      const visualLeft =
        (result.missingCharacterRefs?.length ?? 0) +
        (result.missingCharacterTurnarounds?.length ?? 0);
      if (created + filled + scenes === 0) {
        toastSuccess(
          visualLeft > 0
            ? `角色/场景已在库中，文本无需补全。剩余 ${visualLeft} 处缺图，请打开素材库生成定妆或三视图`
            : '角色/场景已在库中，文本无需补全',
        );
      } else if (filled > 0) {
        toastSuccess(
          `已同步新建 ${created} 个角色、补全 ${filled} 个角色、${scenes} 个场景` +
            (visualLeft > 0 ? `；仍有 ${visualLeft} 处缺图需在素材库完成` : ''),
        );
      } else {
        toastSuccess(
          `已同步 ${created} 个角色、${scenes} 个场景` +
            (visualLeft > 0 ? `；仍有 ${visualLeft} 处缺图需在素材库完成` : ''),
        );
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : '同步失败');
    } finally {
      setSyncing(false);
    }
  }, [onPackageChange, onReadinessChange, pkg]);

  const handleMarkReady = useCallback((force = false) => {
    const base = report ?? inspectBibleAssets(pkg);
    const softCostumes = base.warnings?.costumes ?? base.missingCostumes ?? [];
    const softProps = base.warnings?.props ?? base.missingProps ?? [];
    const state: AssetReadinessState = {
      ...base,
      ...markScriptAssetReady(),
      requiredCharacters: base.requiredCharacters,
      requiredScenes: base.requiredScenes,
      missingCharacters: force ? base.missingCharacters : [],
      missingScenes: force ? base.missingScenes : [],
      // 服/道始终保留为警告层（除非强制清空）
      missingCostumes: force ? [] : softCostumes,
      missingProps: force ? [] : softProps,
      warnings: force ? { costumes: [], props: [] } : { costumes: softCostumes, props: softProps },
      missingCharacterRefs: force ? base.missingCharacterRefs : [],
      missingCharacterTurnarounds: force ? base.missingCharacterTurnarounds : [],
      characterVisualGaps: force ? base.characterVisualGaps : [],
      ready: true,
    };
    setReport(state);
    onReadinessChange?.(state);
    const hasVisualGap =
      (base.missingCharacterRefs?.length ?? 0) > 0 ||
      (base.missingCharacterTurnarounds?.length ?? 0) > 0;
    const softLeft = (state.warnings?.costumes.length ?? 0) + (state.warnings?.props.length ?? 0);
    toastSuccess(
      force && (base.missingCharacters.length > 0 || base.missingScenes.length > 0 || hasVisualGap)
        ? '已强制标记设定就绪'
        : softLeft > 0
          ? `已标记设定就绪（仍有 ${softLeft} 项服装/道具警告）`
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
          本页检查人物/场景是否入库，以及主角三视图、配角定妆是否齐备。
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

  const hasMissing =
    report.missingCharacters.length > 0 || report.missingScenes.length > 0;
  const hasVisualGap =
    (report.missingCharacterRefs?.length ?? 0) > 0 ||
    (report.missingCharacterTurnarounds?.length ?? 0) > 0;
  const warnCostumes = report.warnings?.costumes ?? report.missingCostumes ?? [];
  const warnProps = report.warnings?.props ?? report.missingProps ?? [];
  const hasSoftWarnings = warnCostumes.length > 0 || warnProps.length > 0;
  const strict = report.strictCostumeProp ?? strictCostumeProp;
  /** 硬缺口：阻断「真正就绪」；默认服/道仅为警告，strict 时服/道也硬拦 */
  const hasHardGap = hasMissing || hasVisualGap || (strict && hasSoftWarnings);
  const hasAnyGap = hasHardGap;
  /** 有角色文本可补全时也允许同步（不仅限「未入库」） */
  const canSync = hasMissing || report.requiredCharacters.length > 0;

  const statusKind = !report.ready && hasHardGap
    ? 'blocked'
    : report.ready && hasSoftWarnings && !strict
      ? 'ready-warn'
      : report.ready
        ? 'ready'
        : 'blocked';

  return (
    <div className="sd2-ready-body" data-block-id={blockId}>
      <div className="sd2-ready-header">
        <span className="sd2-ready-header__label">设定就绪检查</span>
        {statusKind === 'ready' ? (
          <span className="sd2-ready-status sd2-ready-status--ok">
            <Check size={12} /> 已就绪
          </span>
        ) : statusKind === 'ready-warn' ? (
          <span className="sd2-ready-status sd2-ready-status--warn" title="角色/场景已齐；服装或道具仍有建议补齐项">
            <AlertTriangle size={12} /> 就绪 · 有警告
          </span>
        ) : (
          <span className="sd2-ready-status sd2-ready-status--warn">
            <AlertTriangle size={12} /> 有缺口
          </span>
        )}
      </div>

      <label className="sd2-ready-section__empty" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={strict}
          onChange={handleToggleStrictCostumeProp}
        />
        <span title="OL-09：开启后服装/道具缺口也阻止「已就绪」">
          服装/道具缺口硬拦（可选）
        </span>
      </label>

      {/* 角色入库（含主角/配角与缺图提示） */}
      <div className="sd2-ready-section" data-ready-section="characters">
        <p className="sd2-ready-section__title">角色入库（{report.requiredCharacters.length}）</p>
        {report.requiredCharacters.length === 0 ? (
          <p className="sd2-ready-section__empty">设定中无角色</p>
        ) : (
          <div className="sd2-ready-tags">
            {report.requiredCharacters.map((name) => {
              const role = roles.get(name) ?? 'support';
              const missingInLibrary = report.missingCharacters.includes(name);
              const gap = gapByName.get(name);
              const label = characterReadyLabel(name, role, missingInLibrary, gap);
              return (
                <button
                  type="button"
                  key={name}
                  data-ready-gap={name}
                  onClick={(e) => {
                    // 缺失角色：必须先进素材库建档/补信息
                    if (missingInLibrary) {
                      openAssetAt({
                        tab: 'character',
                        itemId: name,
                        returnHint: '设定就绪',
                        resumeGapKey: name,
                        resumeSection: 'characters',
                      });
                      return;
                    }
                    // Ctrl/⌘/Shift 点击仍可打开详情
                    if (e.metaKey || e.ctrlKey || e.shiftKey) {
                      openAssetAt({
                        tab: 'character',
                        itemId: name,
                        returnHint: '设定就绪',
                        resumeGapKey: name,
                        resumeSection: 'characters',
                      });
                      return;
                    }
                    handleToggleRole(name);
                  }}
                  className={`sd2-ready-tag sd2-ready-tag--clickable ${label.warn ? 'sd2-ready-tag--warn' : 'sd2-ready-tag--ok'}`}
                  title="点击切换主/配角；Ctrl/⌘/Shift 打开素材库"
                >
                  {label.text}
                  {label.warn ? ' ⚠' : ' ✓'}
                </button>
              );
            })}
          </div>
        )}
        {unlabeledRoleNames.length > 0 && (
          <p className="sd2-ready-section__empty" role="status">
            {unlabeledRoleNames.length} 人未标明主角/配角，已按配角处理（只要定妆、不拦三视图）。
            请重新「抽取设定」或在素材库身份中写明「主角/女主/男主」或「配角」。
          </p>
        )}
      </div>

      {/* 场景 */}
      <div className="sd2-ready-section" data-ready-section="scenes">
        <p className="sd2-ready-section__title">场景（{report.requiredScenes.length}）</p>
        {report.requiredScenes.length === 0 ? (
          <p className="sd2-ready-section__empty">设定中无场景</p>
        ) : (
          <div className="sd2-ready-tags">
            {report.requiredScenes.map((name) => (
              <span
                key={name}
                data-ready-gap={name}
                className={`sd2-ready-tag ${report.missingScenes.includes(name) ? 'sd2-ready-tag--warn' : 'sd2-ready-tag--ok'}`}
              >
                {name}
                {report.missingScenes.includes(name) ? ' ⚠' : ' ✓'}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 服装/道具：警告层（不阻断 ready） */}
      {warnCostumes.length > 0 && (
        <div className="sd2-ready-section" data-ready-section="costumes">
          <p className="sd2-ready-section__title">
            警告 · 服装建议补齐（不阻断就绪）
          </p>
          <div className="sd2-ready-tags">
            {warnCostumes.map((name) => (
              <button
                type="button"
                key={name}
                data-ready-gap={name}
                onClick={() =>
                  openAssetAt({
                    tab: 'costume',
                    query: name,
                    suggestCreateLabel: name,
                    returnHint: '设定就绪',
                    resumeGapKey: name,
                    resumeSection: 'costumes',
                  })
                }
                className="sd2-ready-tag sd2-ready-tag--warn sd2-ready-tag--clickable"
                title="点击打开服装库"
              >
                {name} ⚠
              </button>
            ))}
          </div>
        </div>
      )}
      {warnProps.length > 0 && (
        <div className="sd2-ready-section" data-ready-section="props">
          <p className="sd2-ready-section__title">
            警告 · 道具建议补齐（不阻断就绪）
          </p>
          <div className="sd2-ready-tags">
            {warnProps.map((name) => (
              <button
                type="button"
                key={name}
                data-ready-gap={name}
                onClick={() =>
                  openAssetAt({
                    tab: 'prop',
                    query: name,
                    suggestCreateLabel: name,
                    returnHint: '设定就绪',
                    resumeGapKey: name,
                    resumeSection: 'props',
                  })
                }
                className="sd2-ready-tag sd2-ready-tag--warn sd2-ready-tag--clickable"
                title="点击打开道具库"
              >
                {name} ⚠
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="sd2-ready-actions">
        {canSync && (
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
        {!hasAnyGap || report.ready ? (
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
