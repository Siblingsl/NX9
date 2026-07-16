import { useState } from 'react';
import {
  ArrowLeft,
  Archive,
  Check,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Download,
  Film,
  ImagePlus,
  Info,
  LayoutGrid,
  Loader2,
  MapPin,
  Mic2,
  Plus,
  Sparkles,
  Trash2,
  User,
  Video,
} from 'lucide-react';
import type { CharacterProfile, EnvironmentProfile } from '@nx9/shared';
import { useAppSurface } from '../stores/app-surface';
import { useWorkspaceCatalog } from '../stores/workspace-catalog';
import ImageUploadSlot from '../blocks/shared/ImageUploadSlot';
import {
  CAMERA_MOVE_PRESETS,
  COLOR_GRADE_PRESETS,
  LIGHTING_PRESETS,
  STUDIO_STEPS,
} from './studio/studio-types';
import { useStudioDesk, type StudioDesk } from './studio/useStudioDesk';
import './studio/studio-desk.css';

function mediaUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) return path;
  if (path.startsWith('/')) return path;
  return `/media/${path.replace(/^\/+/, '')}`;
}

/**
 * 制作台 · 独立剧集生产系统（非画布附庸）
 * 三枢纽：剧集架 / 资产库 / 本集制作
 * 分镜预览 = 故事板关键帧静帧，不是成片
 */
export function ProductionStudioPage() {
  const goHome = useAppSurface((s) => s.goHome);
  const goCanvas = useAppSurface((s) => s.goCanvas);
  const activeId = useWorkspaceCatalog((s) => s.activeId);
  const items = useWorkspaceCatalog((s) => s.items);
  const project = items.find((i) => i.id === activeId);
  const desk = useStudioDesk();

  const running = desk.queuePhase === 'running';
  const pct =
    desk.queueProgress.total > 0
      ? Math.round((desk.queueProgress.done / desk.queueProgress.total) * 100)
      : 0;

  return (
    <div className="studio-desk">
      <header className="studio-desk__top">
        <button type="button" className="studio-desk__ghost" onClick={goHome}>
          <ArrowLeft size={14} /> 导航
        </button>
        <div className="studio-desk__brand min-w-0 flex-1">
          <span className="studio-desk__mark">N9</span>
          <div className="min-w-0">
            <div className="studio-desk__title truncate">
              制作台
              {project ? ` · ${project.title}` : desk.seriesTitle ? ` · ${desk.seriesTitle}` : ''}
              {desk.activeEpisode ? ` · ${desk.activeEpisode.title}` : ''}
            </div>
            <div className="studio-desk__sub">
              独立剧集生产 · 分镜预览图=故事板静帧 · 非节点画布附庸
            </div>
          </div>
        </div>
        <button type="button" className="studio-desk__btn-accent" onClick={goCanvas}>
          <LayoutGrid size={14} /> 高级画布
        </button>
      </header>

      {running && (
        <div className="studio-desk__queue">
          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--sd-brand)' }} />
          <span>
            {desk.queueLabel || '批量任务'} · {desk.queueProgress.done}/{desk.queueProgress.total}
          </span>
          <div className="bar">
            <i style={{ width: `${pct}%` }} />
          </div>
          <button type="button" className="studio-desk__ghost" onClick={() => desk.cancelQueue()}>
            停止
          </button>
        </div>
      )}

      <div className="studio-desk__hubs" role="tablist">
        {(
          [
            ['episodes', '剧集架', Archive],
            ['assets', '资产库', User],
            ['produce', '本集制作', Clapperboard],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={`studio-desk__hub ${desk.hub === id ? 'is-on' : ''}`}
            onClick={() => desk.setHub(id)}
          >
            <span className="inline-flex items-center gap-1.5">
              <Icon size={14} /> {label}
            </span>
          </button>
        ))}
      </div>

      {desk.hub === 'produce' && (
        <nav className="studio-desk__strip" aria-label="本集步骤">
          <div className="studio-desk__steps">
            {STUDIO_STEPS.map((s) => {
              const st = desk.stepStatuses[s.id];
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`studio-desk__step ${desk.step === s.id ? 'is-current' : ''} ${
                    st === 'done' ? 'is-done' : ''
                  } ${st === 'blocked' ? 'is-blocked' : ''}`}
                  onClick={() => desk.setStep(s.id)}
                >
                  <span className="studio-desk__step-idx">
                    {st === 'done' ? (
                      <span className="inline-flex items-center gap-1">
                        <Check size={10} /> 完成
                      </span>
                    ) : (
                      `STEP ${s.index}`
                    )}
                  </span>
                  <span className="studio-desk__step-label">{s.label}</span>
                  <span className="studio-desk__step-hint">{s.hint}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <div className="studio-desk__body">
        <main className="studio-desk__stage">
          {desk.hub === 'episodes' && <EpisodesHub desk={desk} />}
          {desk.hub === 'assets' && <AssetsHub desk={desk} />}
          {desk.hub === 'produce' && (
            <>
              {desk.step === 'script' && <ScriptStage desk={desk} />}
              {desk.step === 'storyboard' && <StoryboardStage desk={desk} />}
              {desk.step === 'preview' && <PreviewStage desk={desk} />}
              {desk.step === 'review' && <ReviewStage desk={desk} />}
              {desk.step === 'video' && <VideoStage desk={desk} />}
              {desk.step === 'voice' && <VoiceStage desk={desk} />}
              {desk.step === 'export' && <ExportStage desk={desk} />}
            </>
          )}
        </main>

        <aside className="studio-desk__callsheet">
          <h4>通告单</h4>
          <div className="studio-desk__stat-grid">
            <div className="studio-desk__stat">
              <b>{desk.stats.episodeCount}</b>
              <span>剧集</span>
            </div>
            <div className="studio-desk__stat">
              <b>{desk.stats.completedEpisodes}</b>
              <span>已完成</span>
            </div>
            <div className="studio-desk__stat">
              <b>{desk.stats.total}</b>
              <span>本集镜头</span>
            </div>
            <div className="studio-desk__stat">
              <b>
                {desk.stats.withImage}/{desk.stats.total || 0}
              </b>
              <span>预览图</span>
            </div>
            <div className="studio-desk__stat">
              <b>
                {desk.stats.withVideo}/{desk.stats.total || 0}
              </b>
              <span>视频</span>
            </div>
            <div className="studio-desk__stat">
              <b>{desk.stats.charCount}</b>
              <span>角色</span>
            </div>
          </div>

          <p className="text-[11px] mb-2" style={{ color: 'var(--sd-muted)' }}>
            当前集：
            <strong style={{ color: 'var(--sd-ink)' }}>
              {desk.activeEpisode?.title || '（未命名）'}
            </strong>
            <br />
            状态：{desk.activeEpisode?.status || 'draft'} · 场景 {desk.stats.envCount} · 声音资产{' '}
            {desk.stats.soundCount}
          </p>

          <div className="studio-desk__progress">
            <i
              style={{
                width: `${Math.round(
                  (Object.values(desk.stepDone).filter(Boolean).length / STUDIO_STEPS.length) * 100,
                )}%`,
              }}
            />
          </div>

          {desk.hub === 'produce' && (
            <div className="studio-desk__next">
              <p>
                <strong style={{ color: 'var(--sd-ink)' }}>建议下一步</strong>
                <br />
                {STUDIO_STEPS.find((s) => s.id === desk.step)?.hint}
              </p>
              <button
                type="button"
                className="studio-desk__btn-primary w-full"
                disabled={Boolean(desk.busy) || running}
                onClick={() => desk.nextAction.go()}
              >
                {desk.busy || running ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                {desk.nextAction.label}
              </button>
            </div>
          )}

          <div className="mt-3 space-y-2">
            <button
              type="button"
              className="studio-desk__btn w-full"
              onClick={() => desk.startNextEpisode()}
            >
              <Plus size={14} /> 新建下一集
            </button>
            <button type="button" className="studio-desk__btn w-full" onClick={goCanvas}>
              <LayoutGrid size={14} /> 高级画布精调
            </button>
          </div>

          {desk.lastMessage && <div className="studio-desk__log">{desk.lastMessage}</div>}

          <div className="studio-desk__tip mt-4 mb-0 text-[11px]">
            <Info size={13} className="shrink-0 mt-0.5" />
            <span>
              <strong>分镜预览图</strong>
              即故事板关键帧静帧，用于定构图与一致性；
              <strong>镜头视频</strong>才是成片素材。完成集在「剧集架」归档，不依赖画布。
            </span>
          </div>
        </aside>
      </div>
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

function AssetsHub({ desk }: { desk: StudioDesk }) {
  const [tab, setTab] = useState<'char' | 'env' | 'sound'>('char');
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
  return (
    <>
      <div className="studio-desk__hero">
        <div>
          <h2>③ 分镜预览图（故事板）</h2>
          <p>
            这里生成的是<strong>分镜预览静帧 / 故事板关键帧</strong>
            ，用来定构图、光色与角色一致性，不是最终成片视频。
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
          出图前会自动补全专业提示词（角色一致性 + 场景 + 运镜色调）。需在设置中配置图像模型
          API。
        </span>
      </div>
      <div className="studio-desk__shot-grid">
        {desk.shots.map((s) => (
          <div key={s.id} className="studio-desk__shot" style={{ cursor: 'default' }}>
            <div className="studio-desk__shot-thumb">
              {s.firstFrameAssetId ? (
                <img src={mediaUrl(s.firstFrameAssetId)} alt="" />
              ) : (
                <span className="text-[11px] opacity-40">待预览图</span>
              )}
              <span className="studio-desk__shot-badge">#{s.index}</span>
            </div>
            <div className="studio-desk__shot-body">
              <strong>{s.firstFrameAssetId ? '预览图就绪' : '缺失'}</strong>
              <p>{s.descriptionZh}</p>
            </div>
          </div>
        ))}
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
