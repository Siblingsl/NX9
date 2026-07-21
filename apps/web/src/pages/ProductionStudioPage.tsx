import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  Bell,
  Check,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Download,
  Film,
  HelpCircle,
  Home,
  ImagePlus,
  Info,
  LayoutGrid,
  Loader2,
  MapPin,
  Mic2,
  Play,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  User,
  Users,
  Video,
  X,
} from 'lucide-react';
import {
  buildShotTimeline,
  formatShotTimeRange,
  type CharacterProfile,
  type EnvironmentProfile,
} from '@nx9/shared';
import { useAppSurface } from '../stores/app-surface';
import { useWorkspaceCatalog } from '../stores/workspace-catalog';
import { useCredentialVault } from '../stores/credential-vault';
import ImageUploadSlot from '../blocks/shared/ImageUploadSlot';
import {
  CAMERA_MOVE_PRESETS,
  COLOR_GRADE_PRESETS,
  LIGHTING_PRESETS,
  STUDIO_STEPS,
  type StudioStepId,
} from './studio/studio-types';
import { useStudioDesk, type StudioDesk } from './studio/useStudioDesk';
import {
  formatDuration,
  groupShotsIntoScenes,
  parseShotPlace,
  projectProgressPct,
  shotTypeLabel,
} from './studio/atelier-utils';
import './studio/studio-desk.css';
import './studio/atelier-desk.css';

type AtelierSheet =
  | null
  | 'script'
  | 'storyboard'
  | 'preview'
  | 'review'
  | 'video'
  | 'voice'
  | 'export'
  | 'episodes'
  | 'assets'
  | 'characters'
  | 'scenes'
  | 'produce';

function mediaUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) return path;
  if (path.startsWith('/')) return path;
  return `/media/${path.replace(/^\/+/, '')}`;
}

/**
 * 制作台 · NX9 Atelier 木质场记桌
 * 桌面：场次/镜头卡；底栏：快捷入口；详细步骤在浮层完成
 */
export function ProductionStudioPage() {
  const goHome = useAppSurface((s) => s.goHome);
  const goCanvas = useAppSurface((s) => s.goCanvas);
  const toggleSettings = useCredentialVault((s) => s.toggleSettings);
  const activeId = useWorkspaceCatalog((s) => s.activeId);
  const items = useWorkspaceCatalog((s) => s.items);
  const selectWorkspace = useWorkspaceCatalog((s) => s.selectWorkspace);
  const project = items.find((i) => i.id === activeId);
  const desk = useStudioDesk();
  const [sheet, setSheet] = useState<AtelierSheet>(null);
  const [focusSceneKey, setFocusSceneKey] = useState<string | null>(null);

  const running = desk.queuePhase === 'running';
  const pct =
    desk.queueProgress.total > 0
      ? Math.round((desk.queueProgress.done / desk.queueProgress.total) * 100)
      : 0;
  const projectPct = projectProgressPct(desk.stepDone, STUDIO_STEPS.length);

  const scenes = useMemo(() => groupShotsIntoScenes(desk.shots), [desk.shots]);
  const polaroids = useMemo(
    () => desk.shots.filter((s) => s.firstFrameAssetId).slice(0, 2),
    [desk.shots],
  );
  const frameShot = useMemo(
    () => desk.shots.find((s) => s.firstFrameAssetId) ?? null,
    [desk.shots],
  );

  const title =
    desk.seriesTitle?.trim() ||
    project?.title ||
    desk.activeEpisode?.title ||
    '未命名项目';

  const openStep = (step: StudioStepId) => {
    desk.setHub('produce');
    desk.setStep(step);
    setSheet(step);
  };

  const openSheet = (id: AtelierSheet) => {
    if (id === 'episodes') {
      desk.setHub('episodes');
      setSheet('episodes');
      return;
    }
    if (id === 'assets' || id === 'characters' || id === 'scenes') {
      desk.setHub('assets');
      setSheet(id);
      return;
    }
    if (id === 'produce') {
      desk.setHub('produce');
      setSheet(desk.step);
      return;
    }
    if (id) openStep(id as StudioStepId);
  };

  const closeSheet = () => {
    setSheet(null);
    desk.setHub('produce');
  };

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSheet();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet]);

  const sheetTitle = (() => {
    if (sheet === 'episodes') return { t: '剧集架', s: '多集归档与切换' };
    if (sheet === 'assets' || sheet === 'characters' || sheet === 'scenes')
      return { t: '资产库', s: '角色 · 场景 · 声音' };
    if (sheet && sheet !== 'produce') {
      const def = STUDIO_STEPS.find((x) => x.id === sheet);
      return { t: def?.label ?? '制作', s: def?.hint ?? '' };
    }
    return { t: '制作', s: '' };
  })();

  return (
    <div className="atelier">
      <header className="atelier__topbar">
        <div className="atelier__brand">
          <button type="button" className="atelier__icon-btn" onClick={goHome} title="返回导航">
            <Home size={15} />
          </button>
          <span className="atelier__mark">N9</span>
          <div className="min-w-0">
            <div className="atelier__brand-name">
              NX9 Atelier
              <span className="atelier__pro">PRO</span>
            </div>
          </div>
        </div>
        <div className="atelier__top-actions">
          <button type="button" className="atelier__icon-btn" title="搜索" onClick={() => openSheet('storyboard')}>
            <Search size={15} />
          </button>
          <button
            type="button"
            className="atelier__icon-btn"
            title="帮助"
            onClick={() => openStep(STUDIO_STEPS.find((s) => !desk.stepDone[s.id])?.id ?? 'script')}
          >
            <HelpCircle size={15} />
          </button>
          <button type="button" className="atelier__icon-btn" title="设置" onClick={() => toggleSettings(true)}>
            <Settings size={15} />
          </button>
          <button type="button" className="atelier__icon-btn" title="任务" onClick={() => desk.nextAction.go()}>
            <Bell size={15} />
          </button>
          <button type="button" className="atelier__icon-btn" title="高级画布" onClick={goCanvas}>
            <LayoutGrid size={15} />
          </button>
          <span className="atelier__avatar" title={title}>
            {(title[0] ?? 'N').toUpperCase()}
          </span>
        </div>
      </header>

      {running && (
        <div className="atelier__queue">
          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--at-brand)' }} />
          <span>
            {desk.queueLabel || '批量任务'} · {desk.queueProgress.done}/{desk.queueProgress.total}
          </span>
          <div className="bar">
            <i style={{ width: `${pct}%` }} />
          </div>
          <button type="button" className="atelier__icon-btn" onClick={() => desk.cancelQueue()} title="停止">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="atelier__work">
        <aside className="atelier__project">
          <select
            className="atelier__project-select"
            value={activeId ?? ''}
            onChange={(e) => {
              const id = e.target.value;
              if (id) void selectWorkspace(id);
            }}
          >
            {items.length === 0 && <option value="">未选择项目</option>}
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                《{it.title}》
              </option>
            ))}
          </select>

          <div className="atelier__progress-label">
            <span>项目进度</span>
            <span>{projectPct}%</span>
          </div>
          <div className="atelier__progress">
            <i style={{ width: `${projectPct}%` }} />
          </div>

          <p className="atelier__scene-list-title">场次</p>
          {scenes.length === 0 && (
            <p className="text-[11px]" style={{ color: 'var(--at-faint)', margin: '0 0 8px' }}>
              导入剧本后生成场次
            </p>
          )}
          {scenes.map((sc) => (
            <button
              key={sc.key}
              type="button"
              className={`atelier__scene-item ${focusSceneKey === sc.key ? 'is-on' : ''}`}
              onClick={() => {
                setFocusSceneKey(sc.key);
                const el = document.getElementById(`atelier-lane-${sc.key}`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
              }}
            >
              <span className="truncate">
                {String(sc.index).padStart(2, '0')} {sc.title}
              </span>
              <span>{sc.shots.length} 镜</span>
            </button>
          ))}

          <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
            <button
              type="button"
              className="studio-desk__btn w-full"
              style={{ justifyContent: 'center' }}
              onClick={() => openSheet('episodes')}
            >
              <Archive size={13} /> 剧集架
            </button>
            <button
              type="button"
              className="studio-desk__btn-primary w-full"
              style={{ justifyContent: 'center' }}
              disabled={Boolean(desk.busy) || running}
              onClick={() => desk.nextAction.go()}
            >
              {desk.busy || running ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {desk.nextAction.label}
            </button>
          </div>
        </aside>

        <div className="atelier__surface nx9-scroll">
          <div className="atelier__pinboard">
            <article className="atelier__meta-card">
              <h3>
                <span className="truncate">{title}</span>
                <span className="atelier__badge">
                  {desk.activeEpisode?.status === 'completed' ? '已完成' : '制作中'}
                </span>
              </h3>
              <ul className="atelier__meta-rows">
                <li>
                  <b>本集</b>
                  {desk.activeEpisode?.title || '第 1 集'}
                </li>
                <li>
                  <b>镜头</b>
                  {desk.stats.total} · 预览 {desk.stats.withImage}/{desk.stats.total || 0}
                </li>
                <li>
                  <b>视频</b>
                  {desk.stats.withVideo}/{desk.stats.total || 0}
                </li>
                <li>
                  <b>角色</b>
                  {desk.stats.charCount} · 场景 {desk.stats.envCount}
                </li>
              </ul>
              <p className="atelier__meta-note">
                {desk.globalArtDirection?.trim() ||
                  desk.lastMessage ||
                  '在桌面整理场次与镜头；底栏导入剧本、打开资产库。'}
              </p>
            </article>

            <div className="atelier__sticky atelier__sticky--y">
              <h4>拍摄注意</h4>
              <ul>
                <li>夜景多用低机位</li>
                <li>环境光为主</li>
                <li>注意反光细节</li>
                <li>预览图=关键帧静帧</li>
              </ul>
            </div>

            <div className="atelier__polaroids">
              {polaroids.length > 0 ? (
                polaroids.map((s) => (
                  <div key={s.id} className="atelier__polaroid">
                    <img src={mediaUrl(s.firstFrameAssetId)} alt="" />
                  </div>
                ))
              ) : (
                <>
                  <div className="atelier__polaroid">
                    <div className="ph">待出图</div>
                  </div>
                  <div className="atelier__polaroid">
                    <div className="ph">待出图</div>
                  </div>
                </>
              )}
            </div>

            <div className="atelier__sticky atelier__sticky--p">
              <h4>待办事项</h4>
              <ul>
                {STUDIO_STEPS.filter((s) => !desk.stepDone[s.id])
                  .slice(0, 4)
                  .map((s) => (
                    <li key={s.id}>{s.label}</li>
                  ))}
                {Object.values(desk.stepDone).every(Boolean) && <li>本集步骤已齐</li>}
              </ul>
            </div>

            <figure className="atelier__frame">
              {frameShot?.firstFrameAssetId ? (
                <img src={mediaUrl(frameShot.firstFrameAssetId)} alt="" />
              ) : (
                <div className="ph" />
              )}
              <figcaption>{title.slice(0, 12)} / 制作台</figcaption>
            </figure>
          </div>

          {scenes.length === 0 ? (
            <div className="atelier__empty-board">
              <h3>桌面还是空的</h3>
              <p>导入本集剧本并拆镜后，场次与镜头卡片会出现在这张木桌上。</p>
              <button type="button" className="studio-desk__btn-primary" onClick={() => openSheet('script')}>
                <Plus size={14} /> 导入剧本
              </button>
            </div>
          ) : (
            scenes.map((sc) => {
              const cover =
                sc.shots.find((s) => s.firstFrameAssetId)?.firstFrameAssetId ?? null;
              return (
                <div
                  key={sc.key}
                  id={`atelier-lane-${sc.key}`}
                  className="atelier__lane"
                >
                  <button
                    type="button"
                    className={`atelier__scene-card ${focusSceneKey === sc.key ? 'is-on' : ''}`}
                    onClick={() => {
                      setFocusSceneKey(sc.key);
                      openSheet('storyboard');
                    }}
                  >
                    <div className="atelier__scene-card-head">
                      <strong>
                        {String(sc.index).padStart(2, '0')} {sc.title}
                      </strong>
                      <span>{sc.shots.length} 镜</span>
                    </div>
                    <div className="atelier__scene-thumb">
                      {cover ? (
                        <img src={mediaUrl(cover)} alt="" />
                      ) : (
                        <div className="empty">无预览</div>
                      )}
                    </div>
                    <p className="atelier__scene-mood">场景氛围：{sc.mood}</p>
                    <div className="atelier__scene-progress">
                      <span>进度 {sc.progress}%</span>
                      <div className="bar">
                        <i style={{ width: `${sc.progress}%` }} />
                      </div>
                    </div>
                  </button>

                  {sc.shots.map((shot) => {
                    const place = parseShotPlace(shot);
                    const selected = desk.selectedShotId === shot.id;
                    return (
                      <button
                        key={shot.id}
                        type="button"
                        className={`atelier__shot ${selected ? 'is-on' : ''}`}
                        onClick={() => {
                          desk.setSelectedShotId(shot.id);
                          openSheet('storyboard');
                        }}
                      >
                        <div className="atelier__shot-head">
                          <em>
                            {place.code.includes('-')
                              ? place.code
                              : `${String(sc.index).padStart(2, '0')}-${String(shot.index).padStart(2, '0')}`}
                          </em>
                          <span>
                            {place.ie} {place.tod} {place.place}
                          </span>
                        </div>
                        <div className="atelier__shot-thumb">
                          {shot.firstFrameAssetId ? (
                            <img src={mediaUrl(shot.firstFrameAssetId)} alt="" />
                          ) : (
                            <div className="empty">静帧</div>
                          )}
                          {shot.videoAssetId && <span className="atelier__shot-badge">视频</span>}
                        </div>
                        <div className="atelier__shot-meta">
                          <b>时长</b>
                          <span>{formatDuration(shot.durationSec)}</span>
                          <b>景别</b>
                          <span>{shotTypeLabel(shot.shotType)}</span>
                          <b>运镜</b>
                          <span>{shot.cameraMove || '固定'}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="atelier__dock-wrap">
        <nav className="atelier__dock" aria-label="制作台工具">
          <button
            type="button"
            className="atelier__dock-btn"
            onClick={() => {
              desk.addEmptyShot();
              openSheet('storyboard');
            }}
          >
            <Plus size={16} />
            新建镜头
          </button>
          <button
            type="button"
            className={`atelier__dock-btn ${sheet === 'script' ? 'is-on' : ''}`}
            onClick={() => openSheet('script')}
          >
            <Clapperboard size={16} />
            导入剧本
          </button>
          <button
            type="button"
            className={`atelier__dock-btn ${sheet === 'assets' ? 'is-on' : ''}`}
            onClick={() => openSheet('assets')}
          >
            <Film size={16} />
            素材库
          </button>
          <button
            type="button"
            className={`atelier__dock-btn ${sheet === 'characters' ? 'is-on' : ''}`}
            onClick={() => openSheet('characters')}
          >
            <Users size={16} />
            角色库
          </button>
          <button
            type="button"
            className={`atelier__dock-btn ${sheet === 'scenes' ? 'is-on' : ''}`}
            onClick={() => openSheet('scenes')}
          >
            <MapPin size={16} />
            场景库
          </button>
          <button
            type="button"
            className={`atelier__dock-btn ${sheet === 'storyboard' ? 'is-on' : ''}`}
            onClick={() => openSheet('storyboard')}
          >
            <LayoutGrid size={16} />
            镜头库
          </button>
          <button
            type="button"
            className={`atelier__dock-btn ${sheet === 'preview' || sheet === 'video' ? 'is-on' : ''}`}
            onClick={() => openSheet(desk.stepDone.preview ? 'video' : 'preview')}
          >
            <Play size={16} />
            预览播放
          </button>
        </nav>
      </div>

      {sheet && (
        <div className="atelier__sheet" role="dialog" aria-modal="true" aria-label={sheetTitle.t}>
          <button type="button" className="atelier__sheet-backdrop" aria-label="关闭" onClick={closeSheet} />
          <div className="atelier__sheet-panel studio-desk">
            <div className="atelier__sheet-head">
              <div className="min-w-0">
                <h2>{sheetTitle.t}</h2>
                {sheetTitle.s && <p>{sheetTitle.s}</p>}
              </div>
              <div className="flex items-center gap-2">
                {sheet !== 'episodes' && sheet !== 'assets' && sheet !== 'characters' && sheet !== 'scenes' && (
                  <div className="hidden sm:flex gap-1 flex-wrap max-w-[420px] justify-end">
                    {STUDIO_STEPS.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`studio-desk__chip ${sheet === s.id ? 'is-on' : ''}`}
                        onClick={() => openStep(s.id)}
                      >
                        {s.short}
                      </button>
                    ))}
                  </div>
                )}
                <button type="button" className="atelier__icon-btn" onClick={closeSheet} title="关闭">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="atelier__sheet-body nx9-scroll">
              {(sheet === 'episodes') && <EpisodesHub desk={desk} />}
              {(sheet === 'assets' || sheet === 'characters' || sheet === 'scenes') && (
                <AssetsHub desk={desk} initialTab={sheet === 'scenes' ? 'env' : sheet === 'characters' ? 'char' : 'char'} />
              )}
              {sheet === 'script' && <ScriptStage desk={desk} />}
              {sheet === 'storyboard' && <StoryboardStage desk={desk} />}
              {sheet === 'preview' && <PreviewStage desk={desk} />}
              {sheet === 'review' && <ReviewStage desk={desk} />}
              {sheet === 'video' && <VideoStage desk={desk} />}
              {sheet === 'voice' && <VoiceStage desk={desk} />}
              {sheet === 'export' && <ExportStage desk={desk} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════ 剧集架 ═══════════ */

function EpisodesHub({ desk }: { desk: StudioDesk }) {
  return (
    <>
      <div className="studio-desk__hero">
        <div>
          <h2>剧集架</h2>
          <p>
            每集独立制作与归档。做完的集状态为「已完成」，成片链接保留在此。点某集进入「本集制作」。
          </p>
        </div>
        <button
          type="button"
          className="studio-desk__btn-primary"
          onClick={() => desk.startNextEpisode()}
        >
          <Plus size={14} /> 新建下一集
        </button>
      </div>

      <div className="studio-desk__tip">
        <Info size={15} className="shrink-0" />
        <span>
          <strong>流程：</strong>
          拆镜可一次产出多集 → 在剧集架切换 → 各集分别出图/批审/视频/导出 →
          导出后点「完成本集」归档 → 再开下一集。
        </span>
      </div>

      <div className="studio-desk__panel">
        <label className="studio-desk__field">
          <span>剧集 / 项目总标题</span>
          <input
            value={desk.seriesTitle}
            onChange={(e) => desk.setSeriesTitle(e.target.value)}
            placeholder="例如：雾港传说"
          />
        </label>
        <label className="studio-desk__field">
          <span>全剧默认美术 / 色调（各集可覆盖）</span>
          <input
            value={desk.globalArtDirection}
            onChange={(e) => desk.setGlobalArtDirection(e.target.value)}
            placeholder="例如：青橙电影感，潮湿雾气，低饱和夜景"
          />
        </label>
      </div>

      <div className="studio-desk__ep-grid">
        {desk.episodes.map((ep) => {
          const active = ep.id === desk.activeEpisodeId;
          const done = ep.status === 'completed' || ep.status === 'archived';
          return (
            <button
              key={ep.id}
              type="button"
              className={`studio-desk__ep-card ${active ? 'is-active' : ''}`}
              onClick={() => desk.selectEpisode(ep.id)}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`studio-desk__tag ${done ? 'is-done' : active ? 'is-active' : ''}`}>
                  {done ? '已完成' : active ? '制作中' : ep.status}
                </span>
                <span className="text-[10px] opacity-50">EP{ep.index}</span>
              </div>
              <h3>{ep.title}</h3>
              {ep.logline && (
                <p className="text-[11px] m-0 mb-2" style={{ color: 'var(--sd-muted)' }}>
                  {ep.logline}
                </p>
              )}
              {ep.lastExportUrl && (
                <a
                  href={ep.lastExportUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-semibold"
                  style={{ color: 'var(--sd-brand)' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  打开成片 →
                </a>
              )}
              {ep.artDirection && (
                <p className="text-[10px] mt-2 mb-0" style={{ color: 'var(--sd-muted)' }}>
                  色调：{ep.artDirection}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ═══════════ 资产库 ═══════════ */

function AssetsHub({
  desk,
  initialTab = 'char',
}: {
  desk: StudioDesk;
  initialTab?: 'char' | 'env' | 'sound';
}) {
  const [tab, setTab] = useState<'char' | 'env' | 'sound'>(initialTab);
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);
  const [charName, setCharName] = useState('');
  const [charPrompt, setCharPrompt] = useState('');
  const [envName, setEnvName] = useState('');
  const [envDesc, setEnvDesc] = useState('');
  const [envLight, setEnvLight] = useState('');

  const addChar = () => {
    if (!charName.trim()) return;
    const c: CharacterProfile = {
      id: `char-${Date.now()}`,
      name: charName.trim(),
      consistencyPrompt: charPrompt.trim() || undefined,
      descriptionZh: charPrompt.trim() || undefined,
      bible: {
        identity: charName.trim(),
        appearance: charPrompt.trim() || undefined,
      },
      tags: ['制作台'],
    };
    desk.saveCharacter(c);
    setCharName('');
    setCharPrompt('');
  };

  const addEnv = () => {
    if (!envName.trim()) return;
    const e: EnvironmentProfile = {
      id: `env-${Date.now()}`,
      name: envName.trim(),
      descriptionZh: envDesc.trim(),
      lighting: envLight.trim() || undefined,
      consistencyPrompt: [envDesc, envLight].filter(Boolean).join('; '),
      referenceUrls: [],
    };
    desk.saveEnvironment(e);
    setEnvName('');
    setEnvDesc('');
    setEnvLight('');
  };

  return (
    <>
      <div className="studio-desk__hero">
        <div>
          <h2>资产库</h2>
          <p>
            角色、场景、声音跨集合复用。拆镜时会自动写入；也可在此手工维护，并进入专业一致性 Prompt。
          </p>
        </div>
      </div>

      <div className="studio-desk__chip-row">
        <button
          type="button"
          className={`studio-desk__chip ${tab === 'char' ? 'is-on' : ''}`}
          onClick={() => setTab('char')}
        >
          <User size={12} className="inline mr-1" />
          角色 {desk.characters.length}
        </button>
        <button
          type="button"
          className={`studio-desk__chip ${tab === 'env' ? 'is-on' : ''}`}
          onClick={() => setTab('env')}
        >
          <MapPin size={12} className="inline mr-1" />
          场景 {desk.environments.length}
        </button>
        <button
          type="button"
          className={`studio-desk__chip ${tab === 'sound' ? 'is-on' : ''}`}
          onClick={() => setTab('sound')}
        >
          <Mic2 size={12} className="inline mr-1" />
          声音 {desk.sounds.length + desk.voice.profiles.length}
        </button>
      </div>

      {tab === 'char' && (
        <div className="studio-desk__panel">
          <h3>角色</h3>
          <div className="studio-desk__editor-row">
            <label className="studio-desk__field">
              <span>姓名</span>
              <input value={charName} onChange={(e) => setCharName(e.target.value)} />
            </label>
            <label className="studio-desk__field">
              <span>一致性 / 外貌 Prompt（英或中）</span>
              <input
                value={charPrompt}
                onChange={(e) => setCharPrompt(e.target.value)}
                placeholder="e.g. 28yo woman, short black hair, sharp eyes..."
              />
            </label>
          </div>
          <button type="button" className="studio-desk__btn-primary" onClick={addChar}>
            <Plus size={14} /> 添加角色
          </button>
          <div className="studio-desk__asset-list mt-4">
            {desk.characters.map((c) => (
              <div key={c.id} className="studio-desk__asset-row !items-stretch">
                <div className="w-16 shrink-0">
                  <ImageUploadSlot
                    url={c.referenceImageUrl ?? undefined}
                    label="参考图"
                    compact
                    aspectClass="aspect-square"
                    onUploaded={(url) => desk.saveCharacter({ ...c, referenceImageUrl: url })}
                    onClear={() => desk.saveCharacter({ ...c, referenceImageUrl: null })}
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <strong className="text-sm">{c.name}</strong>
                  <input
                    className="w-full text-[11px] border border-line rounded-lg px-2 py-1"
                    value={c.consistencyPrompt || ''}
                    placeholder="一致性 Prompt"
                    onChange={(e) =>
                      desk.saveCharacter({ ...c, consistencyPrompt: e.target.value })
                    }
                  />
                  <div className="w-full">
                    <ImageUploadSlot
                      url={c.referenceAudioUrl ?? undefined}
                      label="克隆参考音"
                      compact
                      accept="audio/*"
                      aspectClass="aspect-[3/1]"
                      onUploaded={(url) => desk.saveCharacter({ ...c, referenceAudioUrl: url })}
                      onClear={() => desk.saveCharacter({ ...c, referenceAudioUrl: null })}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="studio-desk__ghost shrink-0"
                  onClick={() => desk.removeCharacter(c.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {desk.characters.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--sd-muted)' }}>
                暂无角色。AI 拆镜会自动提取，或在此添加。
              </p>
            )}
          </div>
        </div>
      )}

      {tab === 'env' && (
        <div className="studio-desk__panel">
          <h3>场景</h3>
          <label className="studio-desk__field">
            <span>场景名</span>
            <input value={envName} onChange={(e) => setEnvName(e.target.value)} />
          </label>
          <label className="studio-desk__field">
            <span>空间描述</span>
            <textarea rows={2} value={envDesc} onChange={(e) => setEnvDesc(e.target.value)} />
          </label>
          <label className="studio-desk__field">
            <span>光影</span>
            <input
              value={envLight}
              onChange={(e) => setEnvLight(e.target.value)}
              placeholder="侧逆光 / 霓虹 / 阴天散射…"
            />
          </label>
          <button type="button" className="studio-desk__btn-primary" onClick={addEnv}>
            <Plus size={14} /> 添加场景
          </button>
          <div className="studio-desk__asset-list mt-4">
            {desk.environments.map((e) => (
              <div key={e.id} className="studio-desk__asset-row !items-stretch">
                <div className="w-20 shrink-0">
                  <ImageUploadSlot
                    url={e.referenceUrls?.[0] ?? e.referenceImageUrl ?? undefined}
                    label="主参考"
                    compact
                    aspectClass="aspect-video"
                    onUploaded={(url) => {
                      const urls = [...(e.referenceUrls ?? []).filter((u) => u !== url)];
                      urls.unshift(url);
                      desk.saveEnvironment({
                        ...e,
                        referenceUrls: urls.slice(0, 6),
                        referenceImageUrl: url,
                      });
                    }}
                    onClear={() =>
                      desk.saveEnvironment({
                        ...e,
                        referenceUrls: (e.referenceUrls ?? []).slice(1),
                        referenceImageUrl: e.referenceUrls?.[1] ?? null,
                      })
                    }
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <strong className="text-sm">{e.name}</strong>
                  <p className="text-[11px] m-0 mt-0.5" style={{ color: 'var(--sd-muted)' }}>
                    {e.descriptionZh}
                    {e.lighting ? ` · ${e.lighting}` : ''}
                  </p>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {(e.referenceUrls ?? []).slice(0, 4).map((u, i) => (
                      <img
                        key={u + i}
                        src={u}
                        alt=""
                        className="w-10 h-10 rounded object-cover border border-line"
                      />
                    ))}
                    <div className="w-10">
                      <ImageUploadSlot
                        label="+"
                        compact
                        aspectClass="aspect-square"
                        onUploaded={(url) => {
                          const urls = [...(e.referenceUrls ?? [])];
                          if (!urls.includes(url)) urls.push(url);
                          desk.saveEnvironment({
                            ...e,
                            referenceUrls: urls.slice(0, 6),
                            referenceImageUrl: urls[0] ?? url,
                          });
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'sound' && (
        <div className="studio-desk__panel">
          <h3>声音</h3>
          <p className="text-xs mb-3" style={{ color: 'var(--sd-muted)' }}>
            声线档案 {desk.voice.profiles.length} · 声音资产 {desk.sounds.length} · 对白行{' '}
            {desk.voice.lines.length}
          </p>
          <div className="studio-desk__actions mb-3">
            <button
              type="button"
              className="studio-desk__btn"
              onClick={() => desk.seedVoiceLinesFromShots()}
            >
              <Mic2 size={14} /> 从本集镜头生成声音行
            </button>
            <button
              type="button"
              className="studio-desk__btn-primary"
              disabled={desk.busy === 'tts'}
              onClick={() => void desk.batchSynthesizeVoice()}
            >
              {desk.busy === 'tts' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              批量 TTS 配音
            </button>
          </div>
          <div className="studio-desk__asset-list mt-2">
            {desk.voice.lines.slice(0, 40).map((l) => (
              <div key={l.id} className="studio-desk__asset-row">
                <Mic2 size={14} className="opacity-40 shrink-0" />
                <div className="min-w-0 flex-1">
                  <strong className="text-xs">{l.speaker}</strong>
                  <p className="text-[11px] m-0" style={{ color: 'var(--sd-muted)' }}>
                    {l.text}
                  </p>
                  {l.audioAssetId && (
                    <audio controls className="w-full mt-1 h-8" src={mediaUrl(l.audioAssetId)} />
                  )}
                </div>
                <span className="studio-desk__tag shrink-0">{l.status}</span>
              </div>
            ))}
            {desk.sounds.map((s) => (
              <div key={s.id} className="studio-desk__asset-row">
                <strong className="text-xs">{s.name}</strong>
                <span className="text-[11px]" style={{ color: 'var(--sd-muted)' }}>
                  {s.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════ 本集制作各步 ═══════════ */

function ScriptStage({ desk }: { desk: StudioDesk }) {
  return (
    <>
      <div className="studio-desk__hero">
        <div>
          <h2>① 本集剧本</h2>
          <p>
            当前集：{desk.activeEpisode?.title || '—'}。粘贴本集剧本后拆镜；多集结果会出现在剧集架。
          </p>
        </div>
        <Clapperboard size={28} style={{ color: 'var(--sd-brand)', opacity: 0.35 }} />
      </div>
      <div className="studio-desk__tip">
        <Info size={15} className="shrink-0" />
        <span>
          <strong>提示：</strong>
          AI 拆镜会同步角色/场景到资产库。规则拆镜识别「1-1 日 内 地点」场景头，无需 API。
        </span>
      </div>
      <div className="studio-desk__panel">
        <label className="studio-desk__field">
          <span>项目总标题</span>
          <input value={desk.seriesTitle} onChange={(e) => desk.setSeriesTitle(e.target.value)} />
        </label>
        <label className="studio-desk__field">
          <span>本集剧本文本</span>
          <textarea
            value={desk.sourceText}
            onChange={(e) => desk.setSourceText(e.target.value)}
            placeholder={`粘贴本集剧本…\n\n1-1 日 内 咖啡店\n张三推门而入。\n张三：有人吗？`}
          />
        </label>
        <div className="studio-desk__actions">
          <button
            type="button"
            className="studio-desk__btn-primary"
            disabled={Boolean(desk.busy)}
            onClick={() => void desk.breakdownAi()}
          >
            {desk.busy === 'ai' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            AI 智能拆镜
          </button>
          <button
            type="button"
            className="studio-desk__btn"
            disabled={Boolean(desk.busy)}
            onClick={() => desk.breakdownRule()}
          >
            规则拆镜
          </button>
          <button type="button" className="studio-desk__btn" onClick={() => desk.saveScriptOnly()}>
            仅保存
          </button>
        </div>
      </div>
    </>
  );
}

function StoryboardStage({ desk }: { desk: StudioDesk }) {
  const sh = desk.selectedShot;
  return (
    <>
      <div className="studio-desk__hero">
        <div>
          <h2>② 分镜表（专业场记）</h2>
          <p>
            编辑景别、运镜、光影、色调、声音方向，并一键生成<strong>专业级</strong>
            成图/成片提示词（注入角色与场景一致性）。
          </p>
        </div>
        <div className="studio-desk__actions">
          <button type="button" className="studio-desk__btn" onClick={() => desk.addEmptyShot()}>
            <Plus size={14} /> 加镜头
          </button>
          <button
            type="button"
            className="studio-desk__btn-primary"
            onClick={() => desk.regenerateAllPrompts(true)}
            disabled={desk.stats.total === 0}
          >
            <Sparkles size={14} /> 全部专业提示词
          </button>
        </div>
      </div>

      {desk.stats.total === 0 ? (
        <div className="studio-desk__empty">
          本集尚无镜头。请先拆镜或手动添加。
          <div className="mt-3">
            <button type="button" className="studio-desk__btn-primary" onClick={() => desk.setStep('script')}>
              返回剧本
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
          <div className="studio-desk__shot-grid">
            {desk.shots.map((s) => (
              <div key={s.id} className="relative">
                <button
                  type="button"
                  className={`studio-desk__shot w-full ${desk.selectedShotId === s.id ? 'is-selected' : ''}`}
                  onClick={() => desk.setSelectedShotId(s.id)}
                >
                  <div className="studio-desk__shot-thumb">
                    {s.firstFrameAssetId ? (
                      <img src={mediaUrl(s.firstFrameAssetId)} alt="" />
                    ) : (
                      <Film size={20} className="opacity-25" />
                    )}
                    <span className="studio-desk__shot-badge">#{s.index}</span>
                    <span className="studio-desk__shot-status">
                      {s.cameraMove || s.shotType}
                    </span>
                  </div>
                  <div className="studio-desk__shot-body">
                    <strong>
                      {s.shotType} · {s.durationSec}s
                    </strong>
                    <p>{s.descriptionZh || s.promptEn || '（空）'}</p>
                  </div>
                </button>
                <div className="absolute top-1 right-1 flex flex-col gap-0.5 z-[2]">
                  <button
                    type="button"
                    className="w-7 h-7 rounded-md bg-white/90 border border-line shadow-sm flex items-center justify-center"
                    title="上移"
                    onClick={(e) => {
                      e.stopPropagation();
                      desk.moveShot(s.id, -1);
                    }}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="w-7 h-7 rounded-md bg-white/90 border border-line shadow-sm flex items-center justify-center"
                    title="下移"
                    onClick={(e) => {
                      e.stopPropagation();
                      desk.moveShot(s.id, 1);
                    }}
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="studio-desk__panel">
            <h3>镜头专业字段</h3>
            {!sh ? (
              <p className="text-xs" style={{ color: 'var(--sd-muted)' }}>
                选中左侧镜头
              </p>
            ) : (
              <div className="studio-desk__editor">
                <label className="studio-desk__field">
                  <span>中文描述 / 表演</span>
                  <textarea
                    rows={2}
                    value={sh.descriptionZh}
                    onChange={(e) => desk.patchShot(sh.id, { descriptionZh: e.target.value })}
                  />
                </label>
                <div className="studio-desk__editor-row">
                  <label className="studio-desk__field">
                    <span>景别</span>
                    <input
                      value={sh.shotType}
                      onChange={(e) =>
                        desk.patchShot(sh.id, { shotType: e.target.value as never })
                      }
                    />
                  </label>
                  <label className="studio-desk__field">
                    <span>时长秒</span>
                    <input
                      type="number"
                      value={sh.durationSec}
                      onChange={(e) =>
                        desk.patchShot(sh.id, { durationSec: Number(e.target.value) || 4 })
                      }
                    />
                  </label>
                </div>
                <label className="studio-desk__field">
                  <span>运镜</span>
                  <div className="studio-desk__chip-row">
                    {CAMERA_MOVE_PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`studio-desk__chip ${sh.cameraMove === p ? 'is-on' : ''}`}
                        onClick={() => desk.patchShot(sh.id, { cameraMove: p })}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </label>
                <label className="studio-desk__field">
                  <span>色调</span>
                  <div className="studio-desk__chip-row">
                    {COLOR_GRADE_PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`studio-desk__chip ${sh.colorGrade === p ? 'is-on' : ''}`}
                        onClick={() => desk.patchShot(sh.id, { colorGrade: p })}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </label>
                <label className="studio-desk__field">
                  <span>光影</span>
                  <div className="studio-desk__chip-row">
                    {LIGHTING_PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`studio-desk__chip ${sh.lighting === p ? 'is-on' : ''}`}
                        onClick={() => desk.patchShot(sh.id, { lighting: p })}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </label>
                <label className="studio-desk__field">
                  <span>声音方向（对白/SFX/BGM）</span>
                  <input
                    value={sh.audioDirection ?? ''}
                    onChange={(e) => desk.patchShot(sh.id, { audioDirection: e.target.value })}
                    placeholder="低声对白 + 雨声底 + 远处雷鸣"
                  />
                </label>
                <label className="studio-desk__field">
                  <span>专业成图提示词（分镜预览图）</span>
                  <textarea
                    rows={4}
                    value={sh.imagePromptPro || sh.promptEn}
                    onChange={(e) =>
                      desk.patchShot(sh.id, {
                        imagePromptPro: e.target.value,
                        promptEn: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="studio-desk__field">
                  <span>专业视频提示词</span>
                  <textarea
                    rows={3}
                    value={sh.videoPromptPro || sh.videoPromptEn || ''}
                    onChange={(e) =>
                      desk.patchShot(sh.id, {
                        videoPromptPro: e.target.value,
                        videoPromptEn: e.target.value,
                      })
                    }
                  />
                </label>
                <div className="studio-desk__actions">
                  <button
                    type="button"
                    className="studio-desk__btn-primary"
                    onClick={() => desk.regenerateShotPrompts(sh.id, true)}
                  >
                    <Sparkles size={14} /> 重生成此镜提示词
                  </button>
                  <button
                    type="button"
                    className="studio-desk__btn"
                    onClick={() => desk.deleteShot(sh.id)}
                  >
                    <Trash2 size={14} /> 删除
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {desk.stats.total > 0 && (
        <div className="studio-desk__actions mt-4">
          <button
            type="button"
            className="studio-desk__btn-primary"
            onClick={() => desk.setStep('preview')}
          >
            下一步：分镜预览图
          </button>
        </div>
      )}
    </>
  );
}

function PreviewStage({ desk }: { desk: StudioDesk }) {
  const missing = desk.stats.total - desk.stats.withImage;
  const timeline = useMemo(() => buildShotTimeline(desk.shots), [desk.shots]);
  const timeById = useMemo(
    () => new Map(timeline.map((t) => [t.shotId, t])),
    [timeline],
  );
  const totalDur = timeline.at(-1)?.endSec ?? 0;
  return (
    <>
      <div className="studio-desk__hero">
        <div>
          <h2>③ 分镜预览图</h2>
          <p>
            每镜一张<strong>关键帧静帧</strong>（非成片）。宫格按本集顺序排列，标注
            <strong>几秒到几秒</strong>。默认单镜约 3 秒。
            {totalDur > 0 ? ` 本集总长约 ${Math.round(totalDur * 10) / 10}s。` : ''}
          </p>
        </div>
        <div className="studio-desk__actions">
          <button
            type="button"
            className="studio-desk__btn-primary"
            disabled={desk.stats.total === 0 || Boolean(desk.busy)}
            onClick={() => void desk.runKeyframes(false)}
          >
            {desk.busy === 'preview' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ImagePlus size={14} />
            )}
            批量生成预览图{missing > 0 ? `（${missing}）` : ''}
          </button>
          <button
            type="button"
            className="studio-desk__btn"
            disabled={Boolean(desk.busy)}
            onClick={() => void desk.runKeyframes(true)}
          >
            强制重出
          </button>
        </div>
      </div>
      <div className="studio-desk__tip">
        <Info size={15} className="shrink-0" />
        <span>
          起止秒按本集镜头顺序累加。画布「导演台」可将全部预览图拼成一张故事板大图。出图需配置图像
          API。
        </span>
      </div>
      <div className="studio-desk__shot-grid studio-desk__shot-grid--preview">
        {desk.shots.map((s) => {
          const t = timeById.get(s.id);
          const timeLabel = t
            ? formatShotTimeRange(t.startSec, t.endSec)
            : `${s.durationSec}s`;
          return (
            <div key={s.id} className="studio-desk__shot" style={{ cursor: 'default' }}>
              <div className="studio-desk__shot-thumb">
                {s.firstFrameAssetId ? (
                  <img src={mediaUrl(s.firstFrameAssetId)} alt="" />
                ) : (
                  <span className="text-[11px] opacity-40">待预览图</span>
                )}
                <span className="studio-desk__shot-badge">#{s.index}</span>
                <span className="studio-desk__shot-time">{timeLabel}</span>
              </div>
              <div className="studio-desk__shot-body">
                <strong>
                  {s.firstFrameAssetId ? '预览图就绪' : '缺失'}
                  <em>{timeLabel}</em>
                </strong>
                <p>{s.descriptionZh || `分镜 ${s.index}`}</p>
              </div>
            </div>
          );
        })}
      </div>
      {desk.stats.withImage > 0 && (
        <div className="studio-desk__actions mt-4">
          <button type="button" className="studio-desk__btn-primary" onClick={() => desk.setStep('review')}>
            下一步：批审预览图
          </button>
        </div>
      )}
    </>
  );
}

function ReviewStage({ desk }: { desk: StudioDesk }) {
  return (
    <>
      <div className="studio-desk__hero">
        <div>
          <h2>④ 批审分镜预览图</h2>
          <p>通过后才能出镜头视频。退回的镜请回分镜表改提示词后重出预览图。</p>
        </div>
        <button
          type="button"
          className="studio-desk__btn-primary"
          disabled={desk.stats.withImage === 0}
          onClick={() => desk.runApproveAll()}
        >
          <Check size={14} /> 批准全部预览图
        </button>
      </div>
      <div className="studio-desk__shot-grid">
        {desk.shots
          .filter((s) => s.firstFrameAssetId)
          .map((s) => {
            const ok = s.keyframeStatus === 'approved' || s.status === 'approved';
            return (
              <div key={s.id} className="studio-desk__panel !p-3">
                <div className="studio-desk__shot-thumb rounded-xl overflow-hidden mb-2">
                  <img src={mediaUrl(s.firstFrameAssetId)} alt="" />
                  <span className="studio-desk__shot-badge">#{s.index}</span>
                </div>
                <div className="studio-desk__actions">
                  {!ok ? (
                    <>
                      <button
                        type="button"
                        className="studio-desk__btn-primary !py-1.5 !text-xs"
                        onClick={() => desk.approveOne(s.id)}
                      >
                        通过
                      </button>
                      <button
                        type="button"
                        className="studio-desk__btn !py-1.5 !text-xs"
                        onClick={() => desk.rejectOne(s.id)}
                      >
                        退回
                      </button>
                    </>
                  ) : (
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--sd-ok)' }}>
                      已通过
                    </span>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </>
  );
}

function VideoStage({ desk }: { desk: StudioDesk }) {
  return (
    <>
      <div className="studio-desk__hero">
        <div>
          <h2>⑤ 镜头视频</h2>
          <p>以已批审的分镜预览图为首帧参考，结合运镜与专业视频提示词生成镜头成片素材。</p>
        </div>
        <button
          type="button"
          className="studio-desk__btn-primary"
          disabled={Boolean(desk.busy)}
          onClick={() => void desk.runVideos(false)}
        >
          {desk.busy === 'video' ? <Loader2 size={14} className="animate-spin" /> : <Video size={14} />}
          批量出视频
        </button>
      </div>
      <div className="studio-desk__shot-grid">
        {desk.shots.map((s) => (
          <div key={s.id} className="studio-desk__shot" style={{ cursor: 'default' }}>
            <div className="studio-desk__shot-thumb">
              {s.videoAssetId ? (
                <video src={mediaUrl(s.videoAssetId)} className="w-full h-full object-cover" muted />
              ) : s.firstFrameAssetId ? (
                <img src={mediaUrl(s.firstFrameAssetId)} alt="" />
              ) : (
                <Video size={18} className="opacity-30" />
              )}
              <span className="studio-desk__shot-badge">#{s.index}</span>
              <span className="studio-desk__shot-status">
                {s.videoAssetId ? '有视频' : s.keyframeStatus === 'approved' ? '待出片' : '未批审'}
              </span>
            </div>
            <div className="studio-desk__shot-body">
              <strong>
                {s.cameraMove || '运镜'} · {s.durationSec}s
              </strong>
              <p>{s.descriptionZh}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function VoiceStage({ desk }: { desk: StudioDesk }) {
  const scopedLines = desk.voice.lines.filter(
    (l) => !l.shotId || desk.shots.some((s) => s.id === l.shotId),
  );
  return (
    <>
      <div className="studio-desk__hero">
        <div>
          <h2>⑥ 声音设计 · 批量 TTS</h2>
          <p>
            从镜头提取对白行后，一键批量合成。角色若上传了<strong>克隆参考音</strong>
            ，将优先走 LuxTTS；否则使用云端默认声线（alloy）。
          </p>
        </div>
        <div className="studio-desk__actions">
          <button
            type="button"
            className="studio-desk__btn"
            onClick={() => desk.seedVoiceLinesFromShots()}
          >
            <Mic2 size={14} /> 生成声音行
          </button>
          <button
            type="button"
            className="studio-desk__btn-primary"
            disabled={desk.busy === 'tts' || scopedLines.length === 0}
            onClick={() => void desk.batchSynthesizeVoice()}
          >
            {desk.busy === 'tts' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            批量 TTS 配音
          </button>
        </div>
      </div>
      <div className="studio-desk__tip">
        <Info size={15} className="shrink-0" />
        <span>
          <strong>提示：</strong>
          在资产库为角色上传参考音可提升声线一致性。合成成功后音频会写回镜头 `audioAssetId`，可在下方试听。
        </span>
      </div>
      <div className="studio-desk__panel">
        <div className="studio-desk__asset-list">
          {scopedLines.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--sd-muted)' }}>
              暂无声音行。请先在分镜表填写「声音方向」或对白，再点「生成声音行」。
            </p>
          )}
          {scopedLines.map((l) => (
            <div key={l.id} className="studio-desk__asset-row">
              <Mic2 size={14} className="opacity-40 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <strong className="text-xs">{l.speaker}</strong>
                  <span className="studio-desk__tag">{l.status}</span>
                  {l.shotId && (
                    <span className="text-[10px]" style={{ color: 'var(--sd-muted)' }}>
                      镜{' '}
                      {desk.shots.find((s) => s.id === l.shotId)?.index ?? '—'}
                    </span>
                  )}
                </div>
                <p className="text-[11px] m-0 mt-0.5" style={{ color: 'var(--sd-muted)' }}>
                  {l.text}
                </p>
                {l.audioAssetId && (
                  <audio controls className="w-full mt-2 h-8" src={mediaUrl(l.audioAssetId)} />
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="studio-desk__actions mt-3">
          <button type="button" className="studio-desk__btn" onClick={() => desk.setHub('assets')}>
            资产库（参考音 / 声线）
          </button>
          <button
            type="button"
            className="studio-desk__btn"
            disabled={desk.busy === 'tts'}
            onClick={() => void desk.batchSynthesizeVoice({ force: true })}
          >
            强制重合成全部
          </button>
          <button type="button" className="studio-desk__btn-primary" onClick={() => desk.setStep('export')}>
            下一步：导出归档
          </button>
        </div>
      </div>
    </>
  );
}

function ExportStage({ desk }: { desk: StudioDesk }) {
  return (
    <>
      <div className="studio-desk__hero">
        <div>
          <h2>⑦ 导出与归档</h2>
          <p>
            拼接本集成片。导出后可「完成本集」归档到剧集架，再「新建下一集」继续，无需回到画布。
          </p>
        </div>
        <button
          type="button"
          className="studio-desk__btn-primary"
          disabled={Boolean(desk.busy) || desk.stats.withVideo === 0}
          onClick={() => void desk.runExport()}
        >
          {desk.busy === 'export' ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Download size={14} />
          )}
          拼接导出本集
        </button>
      </div>
      <div className="studio-desk__panel">
        <h3>本集检查单</h3>
        <ul className="text-[13px] space-y-2" style={{ color: 'var(--sd-muted)' }}>
          <li>镜头 {desk.stats.total}</li>
          <li>
            分镜预览图 {desk.stats.withImage}/{desk.stats.total}
          </li>
          <li>
            视频 {desk.stats.withVideo}/{desk.stats.total}
          </li>
          <li>声音行 {desk.stats.voiceLineCount}</li>
        </ul>
        {desk.exportUrl && (
          <div className="studio-desk__tip studio-desk__tip--ok mt-4 mb-0">
            <Check size={15} />
            <span>
              导出成功。{' '}
              <a
                href={desk.exportUrl}
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline"
                style={{ color: 'var(--sd-brand)' }}
              >
                下载成片
              </a>
            </span>
          </div>
        )}
        <div className="studio-desk__actions mt-4">
          <button
            type="button"
            className="studio-desk__btn-primary"
            onClick={() => desk.markEpisodeComplete(desk.exportUrl)}
          >
            <Archive size={14} /> 完成本集并归档
          </button>
          <button type="button" className="studio-desk__btn" onClick={() => desk.startNextEpisode()}>
            <Plus size={14} /> 开始下一集
          </button>
          <button type="button" className="studio-desk__btn" onClick={() => desk.setHub('episodes')}>
            打开剧集架
          </button>
        </div>
      </div>
    </>
  );
}
