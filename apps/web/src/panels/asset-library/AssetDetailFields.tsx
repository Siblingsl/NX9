import { useMemo, useState, type ReactNode } from 'react';
import type { BacklotWorkspaceItem, CharacterProfile, SoundAssetProfile } from '@nx9/shared';
import {
  BUILTIN_EMOTION_PRESETS,
  CAC_HOOK_TYPES,
  CAC_SHOT_SIZES,
  CAC_VOICE_EMOTIONS,
  CAC_VOICE_GENDERS,
  MAX_ENV_REFERENCE_IMAGES,
  SCENE_SHEET_PROMPT_TEMPLATE,
  COSTUME_SHEET_PROMPT_TEMPLATE,
  DEFAULT_SCENE_VARIANTS,
  DEFAULT_PROP_VARIANTS,
  CAC_COSTUME_VARIANT_PRESETS,
  SHOT_MOVE_FAMILIES,
  SHOT_LEXICON_SYSTEMS,
  STYLE_AESTHETIC_FAMILIES,
  listShotLexiconCategories,
  shortenShotLexiconCategory,
  formatAssetMention,
  getCharacterCreative,
  getCostumeCreative,
  getPropCreative,
  getEmotionCreative,
  getHookCreative,
  getSceneCreative,
  getShotCreative,
  getVoiceCreative,
  CHARACTER_SHEET_CATEGORY_LAYOUTS,
  SOUND_ASSET_KIND_LABELS,
  inferSoundAssetKind,
  type AssetLibraryKind,
  type SoundAssetKind,
} from '@nx9/shared';
import { X, ZoomIn } from 'lucide-react';
import { DetailSection, DetailSectionNav, Field, TextInput, TextArea, PromptPanel, MediaSlot, ChipList, VariantGrid } from './detail-primitives';
import { ImageLightbox, type ImageLightboxItem } from '../../components/ui/ImageLightbox';
import { ScreenplaySupportPanel } from './ScreenplaySupportPanel';
import { CharacterFaceRigSection } from './CharacterFaceRigSection';
import { ImageEditModal } from '../../blocks/shared/ImageEditModal';

type UploadHandler = (file: File) => void | Promise<void>;

function copyText(text: string) {
  void navigator.clipboard.writeText(text);
}

// ─── Character ───────────────────────────────────────────────

export interface CharacterDetailFieldsProps {
  character: CharacterProfile;
  onChange: (next: CharacterProfile) => void;
  onRefreshPrompts: () => void;
  onUploadAudio: UploadHandler;
  onUploadView: (view: string, file: File) => void;
  /** 可绑定的服装库条目 */
  costumeOptions?: Array<{ id: string; label: string; prompt: string }>;
  /** 主生成·设定板（仅完整设定板） */
  onGenerateMasterSheet?: () => void | Promise<void>;
  /** 生成五类原图（需已有完整设定板） */
  onGenerateCategorySheets?: () => void | Promise<void>;
  generatingMasterSheet?: boolean;
  masterSheetProgress?: string | null;
  /** 出图参数（模型/清晰度/质量/比例） */
  genSettingsSlot?: ReactNode;
  /** 顶栏已接管主生成时，详情内降为再次生成 */
  chromeOwnsPrimaryGen?: boolean;
  /** 发布角色参考音到声音库 */
  onPublishAudioToSound?: () => void;
  /** P1：另存新版本（revision +1，刷新锁快照） */
  onBumpRevision?: () => void;
  /** 从表情格发布到情绪库 — 已弃用（情绪库降级） */
  onPublishExpressionsToEmotion?: () => void;
}

export function CharacterDetailFields({
  character: c,
  onChange,
  onRefreshPrompts,
  onUploadAudio,
  onUploadView,
  costumeOptions = [],
  onGenerateMasterSheet,
  onGenerateCategorySheets,
  generatingMasterSheet = false,
  masterSheetProgress = null,
  genSettingsSlot,
  chromeOwnsPrimaryGen = false,
  onPublishAudioToSound,
  onBumpRevision,
}: CharacterDetailFieldsProps) {
  const ext = getCharacterCreative(c);
  const bible = c.bible ?? {};

  const patch = (patchChar: Partial<CharacterProfile>) => onChange({ ...c, ...patchChar });
  const patchCreative = (p: Partial<typeof ext>) =>
    onChange({ ...c, creative: { ...c.creative, ...ext, ...p } });
  const patchBible = (key: keyof typeof bible, value: string) =>
    onChange({ ...c, bible: { ...bible, [key]: value } });

  const prompts = ext.prompts ?? {};

  const anchorCount = [
    c.name?.trim(),
    (bible.appearance || ext.appearanceDetails?.specialMarks)?.trim(),
    c.consistencyPrompt?.trim() || ext.consistency?.consistencyPrompt?.trim(),
    c.referenceImageUrl || ext.fullSheetUrl || ext.frontViewUrl,
  ].filter(Boolean).length;
  const promptVersion = prompts.bible?.version
    ?? (c.consistencyPrompt?.trim() ? 1 : 0);

  const [moreBibleOpen, setMoreBibleOpen] = useState(false);
  const [categoryLightboxIndex, setCategoryLightboxIndex] = useState<number | null>(null);
  const [masterLightboxOpen, setMasterLightboxOpen] = useState(false);
  const [cropTarget, setCropTarget] = useState<{
    sourceUrl: string;
    rect: [number, number, number, number];
    label: string;
    apply: (url: string) => void;
  } | null>(null);
  const characterImageGallery = useMemo(() => {
    const items: Array<{ url: string; label: string }> = [];
    const push = (url?: string | null, label?: string) => {
      const u = url?.trim();
      if (!u) return;
      if (items.some((x) => x.url === u)) return;
      items.push({ url: u, label: label || '角色图' });
    };
    push(ext.fullSheetUrl, '角色完整设定板');
    push(ext.frontViewUrl, '正面站姿');
    push(ext.threeQuarterViewUrl, '3/4 站姿');
    push(ext.sideViewUrl, '侧面站姿');
    push(ext.backViewUrl, '背面站姿');
    push(ext.silhouetteFrontUrl, '剪影正面');
    push(ext.silhouetteSideUrl, '剪影侧面');
    for (const v of ext.expressions ?? []) push(v.imageUrl, `表情·${v.label}`);
    for (const v of ext.microExpressions ?? []) push(v.imageUrl, `微表情·${v.label}`);
    for (const v of ext.angles ?? []) push(v.imageUrl, `头部·${v.label}`);
    for (const v of ext.poses ?? []) push(v.imageUrl, `姿态·${v.label}`);
    for (const v of ext.costumeDetails ?? []) push(v.imageUrl, `细节·${v.label}`);
    for (const v of ext.handRefs ?? []) push(v.imageUrl, `手部·${v.label}`);
    return items;
  }, [ext]);

  const hasFullSheet = Boolean(ext.fullSheetUrl?.trim());
  const categorySource = (categoryId: string) => ext.categorySheetUrls?.[categoryId];
  const categorySheetGallery = useMemo<ImageLightboxItem[]>(() => {
    const items: ImageLightboxItem[] = [];
    for (const category of CHARACTER_SHEET_CATEGORY_LAYOUTS) {
      const url = ext.categorySheetUrls?.[category.id]?.trim();
      if (!url) continue;
      items.push({ url, label: `完整分类原图 · ${category.label}` });
    }
    return items;
  }, [ext.categorySheetUrls]);
  const masterSheetGallery = useMemo<ImageLightboxItem[]>(() => {
    const url = ext.fullSheetUrl?.trim();
    return url ? [{ url, label: '角色完整设定板' }] : [];
  }, [ext.fullSheetUrl]);
  const panelRect = (panelId: string): [number, number, number, number] | undefined => {
    for (const category of CHARACTER_SHEET_CATEGORY_LAYOUTS) {
      const panel = category.panels.find((item) => item.id === panelId);
      if (panel) return panel.rect;
    }
    return undefined;
  };
  const openCrop = (panelId: string, label: string, apply: (url: string) => void) => {
    const category = CHARACTER_SHEET_CATEGORY_LAYOUTS.find((item) => item.panels.some((panel) => panel.id === panelId));
    const sourceUrl = category ? categorySource(category.id) : undefined;
    const rect = panelRect(panelId);
    if (!sourceUrl || !rect) return;
    setCropTarget({ sourceUrl, rect, label, apply });
  };

  const categorySourceCard = (categoryId: string, label: string) => {
    const url = categorySource(categoryId);
    const galleryIndex = url
      ? categorySheetGallery.findIndex((item) => item.url === url)
      : -1;
    return (
      <div className="rounded-lg border border-brand/20 bg-brand/5 p-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium text-brand">完整分类原图 · {label}</span>
          <span className="text-[9px] text-ink/40">点击放大 · 自动裁剪来源，手动调整不覆盖原图</span>
        </div>
        {url ? (
          <button
            type="button"
            className="group relative block w-full overflow-hidden rounded-md border border-line bg-surface"
            title={`放大查看：完整分类原图 · ${label}`}
            onClick={() => setCategoryLightboxIndex(galleryIndex >= 0 ? galleryIndex : 0)}
          >
            <img
              src={url}
              alt={`${label}完整分类原图`}
              className="max-h-48 w-full object-contain"
            />
            <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/30">
              <ZoomIn size={18} className="text-white opacity-0 drop-shadow transition group-hover:opacity-100" />
            </span>
          </button>
        ) : (
          <div className="grid h-20 place-items-center rounded-md border border-dashed border-line text-[10px] text-ink/35">尚未生成分类原图</div>
        )}
      </div>
    );
  };

  const identityValue = ext.identityRole ?? ext.occupation ?? bible.identity ?? '';

  return (
    <div className="flex h-full min-h-0 w-full">
      {/* 左栏：身份 / Prompt / 声音服装 — 独立滚动 */}
      <aside className="flex min-h-0 w-[min(420px,40%)] shrink-0 flex-col border-r border-line">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto nx9-scroll p-4">
        <ScreenplaySupportPanel kind="character" name={c.name} character={c} />

        <DetailSectionNav
          sections={[
            { id: 'char-identity', label: '身份' },
            { id: 'char-face', label: '捏脸' },
            { id: 'char-voice', label: '声音服装' },
            { id: 'char-visual', label: '设定板' },
          ]}
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${anchorCount >= 4 ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>
            健康度 {anchorCount}/4
          </span>
          <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink/45">Prompt v{promptVersion}</span>
          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] text-brand" title="轻量资产版本">
            资产 v{c.revision ?? 1}
          </span>
          {onBumpRevision ? (
            <button
              type="button"
              className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink/55 hover:border-brand/40 hover:text-brand"
              onClick={onBumpRevision}
              title="另存新版本：revision+1，并刷新锁定 Prompt 快照"
            >
              新建版本
            </button>
          ) : null}
          <span className="text-[10px] text-ink/40">
            引用 <code className="rounded bg-surface px-1 text-ink/55">@角色:{c.name || '未命名'}</code>
          </span>
        </div>

        <DetailSection id="char-identity" title="身份与一致性">
          <div className="grid grid-cols-2 gap-2">
            <Field label="角色名 / @引用名">
              <TextInput value={c.name} onChange={(v) => patch({ name: v })} placeholder="角色名" />
            </Field>
            <Field label="身份 / 职业">
              <TextInput
                value={identityValue}
                onChange={(v) => onChange({
                  ...c,
                  bible: { ...bible, identity: v },
                  creative: { ...c.creative, ...ext, identityRole: v },
                })}
                placeholder="女主 / 刑警 / 高中生"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="昵称">
              <TextInput value={ext.nickname ?? ''} onChange={(v) => patchCreative({ nickname: v })} placeholder="林先生 / 老林" />
            </Field>
            <Field label="标签">
              <TextInput value={(c.tags ?? []).join('、')} onChange={(v) => patch({ tags: v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) })} placeholder="主角、反派…" />
            </Field>
          </div>
          <Field label="别名 / 剧中称呼（逗号分隔）">
            <TextInput
              value={(ext.aliases ?? []).join('、')}
              onChange={(v) => patchCreative({ aliases: v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) })}
              placeholder="老林、林侦探、林先生、阿默"
            />
          </Field>
          <Field label="固定外貌锚点">
            <TextArea
              value={bible.appearance ?? ''}
              onChange={(v) => patchBible('appearance', v)}
              rows={3}
              placeholder="发型、脸型、瞳色、身形、标志物、服装轮廓、颜色…"
            />
          </Field>
          <Field label="性格 / 表演边界">
            <TextArea value={bible.personality ?? ext.personalityText ?? ''} onChange={(v) => patchBible('personality', v)} rows={2} />
          </Field>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-ink/45">一致性 Prompt</span>
              <div className="flex items-center gap-1">
                {ext.consistency?.lockedPromptSnapshot?.trim()
                  && (c.consistencyPrompt ?? '').trim() !== ext.consistency.lockedPromptSnapshot.trim() ? (
                  <button
                    type="button"
                    className="rounded-md border border-warn/40 px-2 py-0.5 text-[10px] text-warn hover:bg-warn/10"
                    title="OL-12：将当前 Prompt 恢复为锁定时快照"
                    onClick={() =>
                      patch({
                        consistencyPrompt: ext.consistency!.lockedPromptSnapshot,
                      })
                    }
                  >
                    恢复锁定快照
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded-md border border-line px-2 py-0.5 text-[10px] text-ink/60 hover:border-brand/40"
                  onClick={onRefreshPrompts}
                >
                  刷新
                </button>
              </div>
            </div>
            <TextArea
              value={c.consistencyPrompt ?? ext.consistency?.consistencyPrompt ?? ''}
              onChange={(v) => patch({ consistencyPrompt: v })}
              rows={4}
              mono
            />
          </div>
          <Field label="Negative / 禁改项">
            <TextArea
              value={ext.consistency?.negativePrompt ?? prompts.negative?.text ?? ''}
              onChange={(v) => patchCreative({
                consistency: { ...ext.consistency, negativePrompt: v },
                prompts: { ...prompts, negative: { version: 1, text: v, updatedAt: Date.now() } },
              })}
              rows={2}
              mono
            />
          </Field>

          <button
            type="button"
            className="text-[10px] text-ink/50 hover:text-brand"
            onClick={() => setMoreBibleOpen((v) => !v)}
          >
            {moreBibleOpen ? '收起更多设定' : '更多设定（背景 / 声音 / 关系）'}
          </button>
          {moreBibleOpen ? (
            <div className="grid gap-2 rounded-xl border border-line/70 bg-surface/35 p-2.5">
              <Field label="背景故事">
                <TextArea value={bible.background ?? ''} onChange={(v) => patchBible('background', v)} rows={2} />
              </Field>
              <Field label="声音与语言风格">
                <TextArea value={bible.voice ?? ''} onChange={(v) => patchBible('voice', v)} rows={2} />
              </Field>
              <Field label="关系网络">
                <TextArea value={bible.relationships ?? ''} onChange={(v) => patchBible('relationships', v)} rows={2} />
              </Field>
            </div>
          ) : null}
        </DetailSection>
        <CharacterFaceRigSection character={c} onChange={onChange} />
        <DetailSection id="char-voice" title="声音与服装">
          <div className="space-y-3">
            <div className="space-y-2">
              <MediaSlot
                label="角色参考音（克隆源）"
                url={c.referenceAudioUrl}
                accept="audio/*"
                onUpload={onUploadAudio}
                hint="上传 ≥3s wav/mp3"
              />
              {c.referenceAudioUrl ? (
                <audio src={c.referenceAudioUrl} controls className="w-full" />
              ) : null}
              {c.referenceAudioUrl && onPublishAudioToSound ? (
                <button
                  type="button"
                  className="rounded-lg border border-line px-2.5 py-1 text-[10px] text-ink/70 hover:border-brand/40"
                  onClick={onPublishAudioToSound}
                >
                  发布到声音库
                </button>
              ) : null}
            </div>
            <div className="space-y-2">
              <Field label="绑定服装库">
                <select
                  className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs"
                  value={ext.costumeId ?? ''}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) {
                      patchCreative({ costumeId: null, costumeLabel: null, costumePrompt: null });
                      return;
                    }
                    const hit = costumeOptions.find((x) => x.id === id);
                    if (!hit) return;
                    patchCreative({
                      costumeId: hit.id,
                      costumeLabel: hit.label,
                      costumePrompt: hit.prompt || hit.label,
                    });
                  }}
                >
                  <option value="">未绑定服装</option>
                  {costumeOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
              </Field>
              {ext.costumeLabel ? (
                <p className="text-[10px] text-ink/50">
                  已绑定 <code className="rounded bg-surface px-1">@服装:{ext.costumeLabel}</code>
                </p>
              ) : (
                <p className="text-[10px] text-ink/40">从服装库选择套装，保持跨镜一致。</p>
              )}
              {ext.costumePrompt ? (
                <Field label="服装注入 Prompt">
                  <TextArea
                    value={ext.costumePrompt}
                    onChange={(v) => patchCreative({ costumePrompt: v })}
                    rows={3}
                    mono
                  />
                </Field>
              ) : null}
            </div>
          </div>
        </DetailSection>
        </div>
      </aside>

      {/* 右栏：设定板与参考格 — 独立滚动 */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto nx9-scroll p-4">
        <DetailSection id="char-visual" title="视觉 · 设定板与参考">
          <p className="text-[10px] text-ink/45">
            两步：先生成角色完整设定板 → 确认后再生成五类原图并裁切回填
            {generatingMasterSheet ? ` · ${masterSheetProgress || '生成中…'}` : ''}
            {chromeOwnsPrimaryGen ? ' · 主动作在顶栏「主生成」' : ''}
          </p>
          {!chromeOwnsPrimaryGen && genSettingsSlot ? <div className="mb-1">{genSettingsSlot}</div> : null}

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {onGenerateMasterSheet ? (
                <button
                  type="button"
                  disabled={generatingMasterSheet}
                  onClick={() => onGenerateMasterSheet()}
                  className={
                    chromeOwnsPrimaryGen
                      ? 'inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink/55 hover:border-brand/40 disabled:opacity-45'
                      : 'inline-flex items-center gap-1 rounded-lg border border-brand/30 bg-brand/5 px-2.5 py-1 text-[11px] text-brand disabled:opacity-45'
                  }
                >
                  {generatingMasterSheet && !masterSheetProgress?.includes('分类')
                    ? (masterSheetProgress || '完整设定板生成中…')
                    : chromeOwnsPrimaryGen
                      ? '再次生成·设定板'
                      : '主生成·设定板'}
                </button>
              ) : null}
              {onGenerateCategorySheets ? (
                <button
                  type="button"
                  disabled={generatingMasterSheet || !hasFullSheet}
                  title={hasFullSheet ? '基于完整设定板生成五类原图' : '请先生成角色完整设定板'}
                  onClick={() => onGenerateCategorySheets()}
                  className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink/70 hover:border-brand/40 disabled:opacity-45"
                >
                  {generatingMasterSheet && masterSheetProgress?.includes('分类')
                    ? (masterSheetProgress || '五类原图生成中…')
                    : chromeOwnsPrimaryGen
                      ? '再次生成·五类原图'
                      : '生成五类原图'}
                </button>
              ) : null}
              {!hasFullSheet && onGenerateCategorySheets ? (
                <span className="text-[10px] text-ink/40">需先生成并确认完整设定板</span>
              ) : null}
            </div>

            <div className="rounded-lg border border-brand/25 bg-brand/5 p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium text-brand">角色完整设定板</span>
                <span className="text-[9px] text-ink/40">只读 · 五类原图唯一角色参考 · 点击放大</span>
              </div>
              {ext.fullSheetUrl?.trim() ? (
                <button
                  type="button"
                  className="group relative block w-full overflow-hidden rounded-md border border-line bg-surface"
                  title="放大查看：角色完整设定板"
                  onClick={() => setMasterLightboxOpen(true)}
                >
                  <img
                    src={ext.fullSheetUrl}
                    alt="角色完整设定板"
                    className="max-h-[28rem] w-full object-contain"
                  />
                  <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/30">
                    <ZoomIn size={18} className="text-white opacity-0 drop-shadow transition group-hover:opacity-100" />
                  </span>
                </button>
              ) : (
                <div className="grid h-24 place-items-center rounded-md border border-dashed border-line text-[10px] text-ink/35">
                  尚未生成 · 点击「主生成·设定板」
                </div>
              )}
            </div>
          </div>

          {categorySourceCard('identity', '主身份 / 剪影')}
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 lg:grid-cols-6">
            {([
              ['front', '正面站姿', 'main-front', ext.frontViewUrl],
              ['threeQuarter', '3/4 站姿', 'main-three-quarter', ext.threeQuarterViewUrl],
              ['side', '侧面站姿', 'main-side', ext.sideViewUrl],
              ['back', '背面站姿', 'main-back', ext.backViewUrl],
              ['silhouetteFront', '剪影正面', 'silhouette-front', ext.silhouetteFrontUrl],
              ['silhouetteSide', '剪影侧面', 'silhouette-side', ext.silhouetteSideUrl],
            ] as const).map(([view, label, panelId, url]) => (
              <MediaSlot
                key={view}
                label={label}
                url={url}
                accept="image/*"
                onUpload={(f) => onUploadView(view, f)}
                gallery={characterImageGallery}
                compact
                onCrop={url ? () => openCrop(panelId, label, (nextUrl) => {
                  const fieldMap = {
                    front: 'frontViewUrl',
                    threeQuarter: 'threeQuarterViewUrl',
                    side: 'sideViewUrl',
                    back: 'backViewUrl',
                    silhouetteFront: 'silhouetteFrontUrl',
                    silhouetteSide: 'silhouetteSideUrl',
                  } as const;
                  patchCreative({ [fieldMap[view]]: nextUrl });
                }) : undefined}
              />
            ))}
          </div>

          {categorySourceCard('expressions', '表情系统（8）')}
          <VariantGrid
            title="平静 / 微笑 / 愤怒 / 紧张 / 惊讶 / 害怕 / 悲伤 / 坚定"
            items={ext.expressions ?? []}
            columns={4}
            onChangeItem={(id, itemPatch) => {
              const next = (ext.expressions ?? []).map((item) => item.id === id ? { ...item, ...itemPatch } : item);
              patchCreative({ expressions: next });
            }}
            sharedGallery={characterImageGallery}
            onUploadItem={(id, file) => onUploadView(`expr:${id}`, file)}
            onCropItem={(id) => {
              const item = (ext.expressions ?? []).find((entry) => entry.id === id);
              if (item?.imageUrl) openCrop(`expr-${id}`, item.label, (url) => patchCreative({
                expressions: (ext.expressions ?? []).map((entry) => entry.id === id ? { ...entry, imageUrl: url } : entry),
              }));
            }}
          />
          <p className="text-[10px] text-ink/40">
            角色表情格是身份微表情资产；跨角色氛围请用镜头库「推荐情绪」标签，勿再发布到情绪库。
          </p>

          {categorySourceCard('micro-expressions', '微表情（6）')}
          <VariantGrid
            title="眼部紧张 / 微笑 / 嘴部用力 / 微恐惧 / 呼吸控制 / 咬唇"
            items={ext.microExpressions ?? []}
            columns={5}
            onChangeItem={(id, itemPatch) => {
              const next = (ext.microExpressions ?? []).map((item) => item.id === id ? { ...item, ...itemPatch } : item);
              patchCreative({ microExpressions: next });
            }}
            sharedGallery={characterImageGallery}
            onUploadItem={(id, file) => onUploadView(`micro:${id}`, file)}
            onCropItem={(id) => {
              const item = (ext.microExpressions ?? []).find((entry) => entry.id === id);
              if (item?.imageUrl) openCrop(`micro-${id}`, item.label, (url) => patchCreative({
                microExpressions: (ext.microExpressions ?? []).map((entry) => entry.id === id ? { ...entry, imageUrl: url } : entry),
              }));
            }}
          />

          {categorySourceCard('head-and-posture', '头部结构 / 姿态')}
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
            <VariantGrid
              title="头部多角度"
              items={ext.angles ?? []}
              columns={5}
              onChangeItem={(id, itemPatch) => {
                const next = (ext.angles ?? []).map((item) => item.id === id ? { ...item, ...itemPatch } : item);
                patchCreative({ angles: next });
              }}
              sharedGallery={characterImageGallery}
              onUploadItem={(id, file) => onUploadView(`angle:${id}`, file)}
              onCropItem={(id) => {
                const item = (ext.angles ?? []).find((entry) => entry.id === id);
                if (item?.imageUrl) openCrop(id, item.label, (url) => patchCreative({
                  angles: (ext.angles ?? []).map((entry) => entry.id === id ? { ...entry, imageUrl: url } : entry),
                }));
              }}
            />
            <VariantGrid
              title="姿态变化"
              items={ext.poses ?? []}
              columns={5}
              onChangeItem={(id, itemPatch) => {
                const next = (ext.poses ?? []).map((item) => item.id === id ? { ...item, ...itemPatch } : item);
                patchCreative({ poses: next });
              }}
              sharedGallery={characterImageGallery}
              onUploadItem={(id, file) => onUploadView(`pose:${id}`, file)}
              onCropItem={(id) => {
                const item = (ext.poses ?? []).find((entry) => entry.id === id);
                if (item?.imageUrl) openCrop(`pose-${id}`, item.label, (url) => patchCreative({
                  poses: (ext.poses ?? []).map((entry) => entry.id === id ? { ...entry, imageUrl: url } : entry),
                }));
              }}
            />
          </div>

          {categorySourceCard('costume-and-hands', '服装细节 / 手部动作')}
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
            <VariantGrid
              title="发型 / 材质 / 配饰 / 鞋"
              items={ext.costumeDetails ?? []}
              columns={5}
              onChangeItem={(id, itemPatch) => {
                const next = (ext.costumeDetails ?? []).map((item) => item.id === id ? { ...item, ...itemPatch } : item);
                patchCreative({ costumeDetails: next });
              }}
              sharedGallery={characterImageGallery}
              onUploadItem={(id, file) => onUploadView(`costumeDetail:${id}`, file)}
              onCropItem={(id) => {
                const item = (ext.costumeDetails ?? []).find((entry) => entry.id === id);
                if (item?.imageUrl) openCrop(`detail-${id}`, item.label, (url) => patchCreative({
                  costumeDetails: (ext.costumeDetails ?? []).map((entry) => entry.id === id ? { ...entry, imageUrl: url } : entry),
                }));
              }}
            />
            <VariantGrid
              title="放松 / 紧张 / 指向 / 抓握 / 触脸"
              items={ext.handRefs ?? []}
              columns={5}
              onChangeItem={(id, itemPatch) => {
                const next = (ext.handRefs ?? []).map((item) => item.id === id ? { ...item, ...itemPatch } : item);
                patchCreative({ handRefs: next });
              }}
              sharedGallery={characterImageGallery}
              onUploadItem={(id, file) => onUploadView(`hand:${id}`, file)}
              onCropItem={(id) => {
                const item = (ext.handRefs ?? []).find((entry) => entry.id === id);
                if (item?.imageUrl) openCrop(`hand-${id}`, item.label, (url) => patchCreative({
                  handRefs: (ext.handRefs ?? []).map((entry) => entry.id === id ? { ...entry, imageUrl: url } : entry),
                }));
              }}
            />
          </div>
        </DetailSection>
        </div>
      </main>

      <ImageLightbox
        open={masterLightboxOpen && masterSheetGallery.length > 0}
        items={masterSheetGallery}
        index={0}
        onClose={() => setMasterLightboxOpen(false)}
      />

      <ImageLightbox
        open={categoryLightboxIndex != null && categorySheetGallery.length > 0}
        items={categorySheetGallery}
        index={categoryLightboxIndex ?? 0}
        onClose={() => setCategoryLightboxIndex(null)}
      />

      {cropTarget ? (
        <ImageEditModal
          srcUrl={cropTarget.sourceUrl}
          initialRect={cropTarget.rect}
          title={`调整裁剪 · ${cropTarget.label}`}
          onClose={() => setCropTarget(null)}
          onProduce={async ([url]) => {
            if (url) cropTarget.apply(url);
          }}
        />
      ) : null}
    </div>
  );
}

// ─── Scene ───────────────────────────────────────────────────

export function SceneDetailFields({
  item,
  onChange,
  onRefreshPrompts,
  onUploadRef,
  onUploadSheet,
  onUploadCover,
  onRemoveRef,
  propOptions,
  onOpenProp,
  onGenerateSheet,
  generatingSheet = false,
  generateSheetError,
  genSettingsSlot,
  onSuggestCreateProps,
  onCropCoverFromSheet,
  croppingCover = false,
  onUploadVariant,
  onBumpRevision,
  chromeOwnsPrimaryGen = false,
}: {
  item: BacklotWorkspaceItem;
  onChange: (next: BacklotWorkspaceItem) => void;
  onRefreshPrompts: () => void;
  onUploadRef: UploadHandler;
  onUploadSheet: UploadHandler;
  onUploadCover?: UploadHandler;
  /** 删除多参考图中的某一张（自场景节点迁入） */
  onRemoveRef?: (index: number) => void;
  /** 可挂接的道具库条目 */
  propOptions?: Array<{ id: string; label: string; prompt: string }>;
  /** 跨库跳转到道具详情（UX-12/13） */
  onOpenProp?: (propId: string) => void;
  /** 主生成·场景空间设定板 */
  onGenerateSheet?: () => void | Promise<void>;
  generatingSheet?: boolean;
  generateSheetError?: string | null;
  genSettingsSlot?: ReactNode;
  /** 文本道具 → 建议建档 */
  onSuggestCreateProps?: (names: string[]) => void;
  onCropCoverFromSheet?: () => void;
  croppingCover?: boolean;
  onUploadVariant?: (variantId: string, file: File) => void;
  /** OL-02 */
  onBumpRevision?: () => void;
  /** 顶栏已接管主生成 */
  chromeOwnsPrimaryGen?: boolean;
}) {
  const ext = getSceneCreative(item);
  const patch = (p: Partial<BacklotWorkspaceItem>) => onChange({ ...item, ...p });
  const patchExt = (p: Partial<typeof ext>) => onChange({ ...item, creative: { ...ext, ...p } });
  const promptVersion = ext.prompts?.scene?.version ?? 1;
  const locked = Boolean(ext.locked);
  const sceneVariants = ext.variants ?? DEFAULT_SCENE_VARIANTS;
  const refs = ext.referenceUrls ?? [];
  const [masterOpen, setMasterOpen] = useState(false);
  const [legacyPropsOpen, setLegacyPropsOpen] = useState(
    () => (ext.props?.length ?? 0) > 0 && (ext.propIds?.length ?? 0) === 0,
  );
  const [recsOpen, setRecsOpen] = useState(false);
  const masterUrl = ext.sheetUrl || ext.coverUrl || refs[0] || '';
  const health = [
    item.label?.trim(),
    (ext.description || item.promptZh)?.trim(),
    (ext.lighting || ext.timeOfDay || ext.weather)?.trim(),
    (ext.coverUrl || ext.sheetUrl || refs[0] || masterUrl)?.trim(),
  ].filter(Boolean).length;
  const masterGallery: ImageLightboxItem[] = masterUrl
    ? [{ url: masterUrl, label: '场景空间设定板' }]
    : [];
  const legacyPropNames = (ext.props ?? []).map((s) => s.trim()).filter(Boolean);
  const existingPropLabels = new Set((propOptions ?? []).map((p) => p.label.trim().toLowerCase()));
  const suggestablePropNames = legacyPropNames.filter((n) => !existingPropLabels.has(n.toLowerCase()));

  return (
    <div className="flex h-full min-h-0 w-full">
      <aside className="flex min-h-0 w-[min(420px,40%)] shrink-0 flex-col border-r border-line">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto nx9-scroll p-4">
          <ScreenplaySupportPanel kind="scene" name={item.label} sceneItem={item} />

          <DetailSectionNav
            sections={[
              { id: 'scene-space', label: '空间' },
              { id: 'scene-props', label: '道具' },
              { id: 'scene-prompt', label: 'Prompt' },
            ]}
          />

          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[10px] ${health >= 4 ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>
              健康度 {health}/4
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] ${locked ? 'bg-brand/10 text-brand' : 'bg-surface text-ink/45'}`}>
              {locked ? '已锁定' : '未锁定'}
            </span>
            <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink/45">参考 {refs.length}/{MAX_ENV_REFERENCE_IMAGES}</span>
            <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink/45">Prompt v{promptVersion}</span>
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] text-brand" title="轻量资产版本">
              资产 v{item.revision ?? 1}
            </span>
            {onBumpRevision ? (
              <button
                type="button"
                className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink/55 hover:border-brand/40 hover:text-brand"
                onClick={onBumpRevision}
                title="另存新版本：revision+1，并刷新锁定 Prompt 快照"
              >
                新建版本
              </button>
            ) : null}
            <span className="text-[10px] text-ink/40">
              引用 <code className="rounded bg-surface px-1 text-ink/55">{formatAssetMention('scene', item.label)}</code>
            </span>
          </div>

          <DetailSection id="scene-space" title="空间与一致性">
            <div className="grid grid-cols-2 gap-2">
              <Field label="场景名 / @引用名">
                <TextInput value={item.label} onChange={(v) => patch({ label: v })} placeholder="场景名" />
              </Field>
              <Field label="场景码（与分镜 sceneCode 对齐）">
                <TextInput value={ext.sceneCode ?? ''} onChange={(v) => patchExt({ sceneCode: v })} placeholder="S01 / INT-CAFE…" />
              </Field>
            </div>
            <Field label="时代/世界观">
              <TextInput value={ext.worldView ?? ext.timeOfDay ?? ''} onChange={(v) => patchExt({ worldView: v, timeOfDay: v })} placeholder="现代都市 / 民国…" />
            </Field>
            <Field label="空间锚点（防场景漂移）">
              <TextArea value={ext.description ?? item.promptZh ?? ''} onChange={(v) => patchExt({ description: v })} rows={3} placeholder="建筑结构、空间布局、材质、固定标识物…" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="时间/天气">
                <TextInput
                  value={[ext.timeOfDay, ext.weather].filter(Boolean).join(' · ')}
                  onChange={(v) => {
                    const [timeOfDay, weather] = v.split(/[·,，]/).map((s) => s.trim());
                    patchExt({ timeOfDay, weather });
                  }}
                />
              </Field>
              <Field label="光照">
                <TextInput value={ext.lighting ?? ''} onChange={(v) => patchExt({ lighting: v })} />
              </Field>
              <Field label="色彩">
                <TextInput value={ext.colorTone ?? ''} onChange={(v) => patchExt({ colorTone: v })} />
              </Field>
              <Field label="标签">
                <TextInput value={(ext.tags ?? []).join('、')} onChange={(v) => patchExt({ tags: v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) })} />
              </Field>
            </div>
          </DetailSection>

          <DetailSection id="scene-props" title="固定道具（实体）">
            {propOptions && propOptions.length > 0 ? (
              <Field label="道具库引用（propIds）">
                <div className="flex flex-wrap gap-1">
                  {propOptions.map((p) => {
                    const on = (ext.propIds ?? []).includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          const cur = ext.propIds ?? [];
                          patchExt({
                            propIds: on ? cur.filter((id) => id !== p.id) : [...cur, p.id],
                          });
                        }}
                        className={`rounded-full px-2 py-0.5 text-[10px] border ${
                          on ? 'border-brand/40 bg-brand/10 text-brand' : 'border-line text-ink/55 hover:border-brand/30'
                        }`}
                        title={p.prompt || p.label}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                {(ext.propIds ?? []).length > 0 && onOpenProp ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(ext.propIds ?? []).map((id) => {
                      const hit = propOptions.find((p) => p.id === id);
                      return (
                        <button
                          key={id}
                          type="button"
                          className="text-[10px] text-brand hover:underline"
                          onClick={() => onOpenProp(id)}
                        >
                          打开「{hit?.label ?? id}」
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </Field>
            ) : (
              <p className="text-[10px] text-ink/40">道具库为空时，可先到「道具」Tab 建档再回场景挂接。</p>
            )}
            <button
              type="button"
              className="text-[10px] text-ink/50 hover:text-brand"
              onClick={() => setLegacyPropsOpen((v) => !v)}
            >
              {legacyPropsOpen ? '收起兼容旧数据' : '兼容旧数据（文本道具）'}
            </button>
            {legacyPropsOpen ? (
              <div className="space-y-2">
                <Field label="固定道具 / 结构锚点（文本）">
                  <TextInput
                    value={(ext.props ?? []).join('、')}
                    onChange={(v) => patchExt({ props: v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) })}
                    placeholder="吧台、霓虹招牌、木质桌…"
                  />
                </Field>
                {suggestablePropNames.length > 0 && onSuggestCreateProps ? (
                  <div className="rounded-lg border border-brand/25 bg-brand/5 p-2">
                    <p className="mb-1 text-[10px] text-ink/55">
                      检测到未建档文本道具 {suggestablePropNames.length} 个，可一键建档并挂接 propIds。
                    </p>
                    <div className="mb-2 flex flex-wrap gap-1">
                      {suggestablePropNames.map((name) => (
                        <span key={name} className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink/70">
                          {name}
                        </span>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="rounded-lg bg-brand px-2.5 py-1 text-[11px] text-white"
                      onClick={() => onSuggestCreateProps(suggestablePropNames)}
                    >
                      一键建档并挂接
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </DetailSection>

          <DetailSection id="scene-prompt" title="Prompt">
            <Field label="场景 Prompt（注入图像/视频生成）">
              <TextArea value={item.promptEn || ext.prompts?.scene?.text || ''} onChange={(v) => patch({ promptEn: v })} rows={4} mono />
            </Field>
            {ext.lockedPromptSnapshot?.trim()
              && (item.promptEn || ext.prompts?.scene?.text || '').trim() !== ext.lockedPromptSnapshot.trim() ? (
              <button
                type="button"
                className="rounded-lg border border-warn/40 px-2.5 py-1 text-[11px] text-warn hover:bg-warn/10"
                onClick={() => patch({ promptEn: ext.lockedPromptSnapshot })}
              >
                恢复锁定快照
              </button>
            ) : null}
            <Field label="Negative / 禁改项（防场景漂移）">
              <TextArea
                value={ext.prompts?.negative?.text ?? ext.forbiddenDrift ?? ''}
                onChange={(v) => patchExt({
                  forbiddenDrift: v,
                  prompts: { ...ext.prompts, negative: { version: 1, text: v, updatedAt: Date.now() } },
                })}
                rows={2}
                mono
                placeholder="Never change scene anchors: …"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink/70 hover:border-brand/40" onClick={onRefreshPrompts}>
                刷新专业 Prompt
              </button>
              <button
                type="button"
                className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink/70 hover:border-brand/40"
                onClick={() => copyText(ext.prompts?.scene?.text ?? item.promptEn ?? '')}
              >
                复制 Prompt
              </button>
            </div>
          </DetailSection>

          <button
            type="button"
            className="text-[10px] text-ink/50 hover:text-brand"
            onClick={() => setRecsOpen((v) => !v)}
          >
            {recsOpen ? '收起创作推荐' : '创作推荐（分镜台编辑本场景时点选写入）'}
          </button>
          {recsOpen ? (
            <DetailSection title="创作推荐">
              <p className="text-[10px] text-ink/45">
                下游已接通：分镜台编辑本场景镜头时展示芯片，点选写入景别/目的/角色。音乐与音效暂作文案备忘。
              </p>
              {(
                [
                  ['recommendedCharacters', '推荐角色'],
                  ['recommendedShots', '推荐镜头（可用景别码如 CU/MS）'],
                  ['recommendedMusic', '推荐音乐'],
                  ['recommendedSfx', '推荐音效'],
                  ['recommendedActions', '推荐动作'],
                  ['recommendedEmotions', '推荐情绪'],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <TextInput
                    value={(ext[key] ?? []).join('、')}
                    onChange={(v) =>
                      patchExt({ [key]: v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) } as Partial<typeof ext>)
                    }
                  />
                </Field>
              ))}
            </DetailSection>
          ) : null}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto nx9-scroll p-4">
          <div className="rounded-xl border border-brand/25 bg-brand/5 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-brand">场景空间设定板</p>
                <p className="text-[10px] text-ink/45">固定版式主参考 · 点击放大 · 简体中文标签</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!chromeOwnsPrimaryGen && genSettingsSlot ? <div>{genSettingsSlot}</div> : null}
                {onGenerateSheet ? (
                  <button
                    type="button"
                    disabled={generatingSheet}
                    onClick={() => void onGenerateSheet()}
                    className={
                      chromeOwnsPrimaryGen
                        ? 'rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink/55 hover:border-brand/40 disabled:opacity-50'
                        : 'rounded-lg bg-brand px-2.5 py-1 text-[11px] text-white disabled:opacity-50'
                    }
                  >
                    {generatingSheet
                      ? '生成中…'
                      : chromeOwnsPrimaryGen
                        ? '再次生成·设定板'
                        : '主生成·场景设定板'}
                  </button>
                ) : null}
              </div>
            </div>
            {masterUrl ? (
              <button
                type="button"
                className="group relative block w-full overflow-hidden rounded-lg border border-line bg-black/20"
                onClick={() => setMasterOpen(true)}
                title="放大查看场景设定板"
              >
                <img src={masterUrl} alt="" className="max-h-[28rem] w-full object-contain" />
                <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/25">
                  <ZoomIn size={18} className="text-white opacity-0 drop-shadow transition group-hover:opacity-100" />
                </span>
              </button>
            ) : (
              <div className="grid min-h-[10rem] place-items-center rounded-lg border border-dashed border-line text-[11px] text-ink/40">
                尚未上传或生成场景设定板
              </div>
            )}
            {generateSheetError ? <p className="mt-1 text-[10px] text-red-500">{generateSheetError}</p> : null}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <MediaSlot label="上传/替换设定板" url={ext.sheetUrl} accept="image/*" onUpload={onUploadSheet} />
              <MediaSlot
                label="卡片封面（裁切）"
                url={ext.coverUrl}
                accept="image/*"
                onUpload={onUploadCover ?? onUploadSheet}
                hint="优先展示主景裁切"
              />
            </div>
            {ext.sheetUrl && onCropCoverFromSheet ? (
              <button
                type="button"
                className="mt-2 rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink/70 hover:border-brand/40 disabled:opacity-45"
                disabled={croppingCover}
                onClick={onCropCoverFromSheet}
              >
                {croppingCover ? '裁切封面中…' : '从设定板裁切封面'}
              </button>
            ) : null}
            <div className="mt-3">
              <VariantGrid
                title="场景变体（昼夜/天气，最多 4 · 同一空间锚点）"
                items={sceneVariants}
                columns={4}
                onChangeItem={(id, itemPatch) => {
                  const base = ext.variants?.length ? ext.variants : DEFAULT_SCENE_VARIANTS;
                  const next = base.map((v) => (v.id === id ? { ...v, ...itemPatch } : v));
                  patchExt({ variants: next });
                }}
                onUploadItem={onUploadVariant}
              />
            </div>
          </div>

          <DetailSection title={`多参考图（最多 ${MAX_ENV_REFERENCE_IMAGES} 张）`}>
            <p className="text-[10px] text-ink/45">
              首图可作为 img2img；设定总览图优先写入上方设定板。
            </p>
            <div className="grid grid-cols-3 gap-2">
              {refs.length < MAX_ENV_REFERENCE_IMAGES ? (
                <MediaSlot label="添加参考图" url={undefined} accept="image/*" onUpload={onUploadRef} />
              ) : null}
            </div>
            {refs.length > 0 ? (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {refs.map((url, idx) => (
                  <div key={`${url}-${idx}`} className="group relative overflow-hidden rounded-xl border border-line bg-surface">
                    <img src={url} alt="" className="aspect-square w-full object-cover" />
                    <span className="absolute bottom-1 left-1 rounded bg-ink/55 px-1.5 py-0.5 text-[9px] text-white">
                      参考 {idx + 1}
                    </span>
                    {onRemoveRef ? (
                      <button
                        type="button"
                        title="移除参考图"
                        onClick={() => onRemoveRef(idx)}
                        className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-ink/60 text-white opacity-0 transition group-hover:opacity-100"
                      >
                        <X size={10} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            <p className="text-[10px] text-ink/35">{SCENE_SHEET_PROMPT_TEMPLATE.slice(0, 100)}…</p>
          </DetailSection>
        </div>
      </div>

      {masterOpen && masterGallery.length > 0 ? (
        <ImageLightbox open={masterOpen} items={masterGallery} onClose={() => setMasterOpen(false)} />
      ) : null}
    </div>
  );
}

// ─── Shot ────────────────────────────────────────────────────

export function ShotDetailFields({
  item,
  onChange,
  onRefreshPrompts,
  onUploadGif,
  onUploadExample,
}: {
  item: BacklotWorkspaceItem;
  onChange: (next: BacklotWorkspaceItem) => void;
  onRefreshPrompts: () => void;
  onUploadGif: UploadHandler;
  onUploadExample: UploadHandler;
}) {
  const ext = getShotCreative(item);
  const patch = (p: Partial<BacklotWorkspaceItem>) => onChange({ ...item, ...p });
  const patchExt = (p: Partial<typeof ext>) => onChange({ ...item, creative: { ...ext, ...p } });

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.95fr)]">
      <div className="min-h-0 space-y-1 overflow-y-auto nx9-scroll p-4 max-w-2xl lg:max-w-none">
        <input
          value={item.label}
          onChange={(e) => patch({ label: e.target.value })}
          className="w-full border-b border-line pb-1 text-sm font-semibold focus:outline-none"
        />
        <p className="text-[10px] text-ink/40">
          镜头 = 机位运镜；风格 = 画面美学。预览只说明运动，不绑定具体角色造型。
        </p>
        <DetailSection title="镜头信息">
          <Field label="用途">
            <TextInput
              value={ext.purpose ?? ''}
              onChange={(v) => patchExt({ purpose: v })}
              placeholder="如：强调表情与反应"
            />
          </Field>
          <Field label="体系">
            <div className="flex flex-wrap gap-1">
              {SHOT_LEXICON_SYSTEMS.map((sys) => (
                <button
                  key={sys.id}
                  type="button"
                  title={sys.fullName}
                  onClick={() =>
                    patchExt({
                      lexiconSystemId: sys.id,
                      lexiconSystem: sys.fullName,
                      lexiconCategory:
                        ext.lexiconSystemId === sys.id
                          ? ext.lexiconCategory
                          : undefined,
                    })
                  }
                  className={`rounded-full border px-2 py-0.5 text-[10px] ${
                    ext.lexiconSystemId === sys.id
                      ? 'border-brand/40 bg-brand/10 text-brand'
                      : 'border-line text-ink/55'
                  }`}
                >
                  {sys.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="分类">
            <div className="flex flex-wrap gap-1">
              {listShotLexiconCategories(ext.lexiconSystemId ?? 'all').map((cat) => (
                <button
                  key={cat}
                  type="button"
                  title={cat}
                  onClick={() => patchExt({ lexiconCategory: cat })}
                  className={`rounded-full border px-2 py-0.5 text-[10px] ${
                    ext.lexiconCategory === cat
                      ? 'border-brand/40 bg-brand/10 text-brand'
                      : 'border-line text-ink/55'
                  }`}
                >
                  {shortenShotLexiconCategory(cat)}
                </button>
              ))}
            </div>
            <TextInput
              className="mt-1.5"
              value={ext.lexiconCategory ?? ''}
              onChange={(v) => patchExt({ lexiconCategory: v || undefined })}
              placeholder="自定义分类名"
            />
          </Field>
          <Field label="运镜族">
            <div className="flex flex-wrap gap-1">
              {SHOT_MOVE_FAMILIES.map((fam) => (
                <button
                  key={fam.id}
                  type="button"
                  onClick={() => patchExt({ moveFamily: fam.id })}
                  className={`rounded-full border px-2 py-0.5 text-[10px] ${
                    ext.moveFamily === fam.id
                      ? 'border-brand/40 bg-brand/10 text-brand'
                      : 'border-line text-ink/55'
                  }`}
                >
                  {fam.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="运镜描述">
            <TextArea value={item.promptEn} onChange={(v) => patch({ promptEn: v })} rows={3} mono />
          </Field>
          <Field label="景别">
            <div className="flex flex-wrap gap-1">
              {CAC_SHOT_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => patchExt({ shotSize: size })}
                  className={`rounded-full border px-2 py-0.5 text-[10px] ${
                    ext.shotSize === size ? 'bg-brand/10 border-brand/40 text-brand' : 'border-line text-ink/55'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="推荐时长（秒）">
              <TextInput
                value={ext.durationSec != null ? String(ext.durationSec) : ''}
                onChange={(v) => patchExt({ durationSec: Number(v) || undefined })}
              />
            </Field>
            <Field label="运镜方式">
              <TextInput value={ext.cameraMove ?? ''} onChange={(v) => patchExt({ cameraMove: v })} />
            </Field>
          </div>
          <Field label="推荐剧情">
            <TextArea value={ext.recommendedPlot ?? ''} onChange={(v) => patchExt({ recommendedPlot: v })} rows={2} />
          </Field>
          <Field label="推荐情绪（表演氛围标签 · 非角色表情格）">
            <p className="mb-1 text-[10px] text-ink/40">
              点选内置预设，或在下方自定义；会写入本镜头条目，供分镜参考。
            </p>
            <div className="mb-1.5 flex flex-wrap gap-1">
              {BUILTIN_EMOTION_PRESETS.map((p) => {
                const tags = ext.emotionTags ?? (
                  ext.recommendedEmotion
                    ? ext.recommendedEmotion.split(/[,，、]/).map((s) => s.trim()).filter(Boolean)
                    : []
                );
                const on = tags.includes(p.label);
                return (
                  <button
                    key={p.id}
                    type="button"
                    title={p.promptEn}
                    onClick={() => {
                      const cur = ext.emotionTags ?? (
                        ext.recommendedEmotion
                          ? ext.recommendedEmotion.split(/[,，、]/).map((s) => s.trim()).filter(Boolean)
                          : []
                      );
                      const next = on ? cur.filter((t) => t !== p.label) : [...cur, p.label];
                      patchExt({
                        emotionTags: next,
                        recommendedEmotion: next.join('、'),
                      });
                    }}
                    className={`rounded-full border px-2 py-0.5 text-[10px] ${
                      on ? 'border-brand/40 bg-brand/10 text-brand' : 'border-line text-ink/55'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <TextInput
              value={(ext.emotionTags ?? (
                ext.recommendedEmotion
                  ? ext.recommendedEmotion.split(/[,，、]/).map((s) => s.trim()).filter(Boolean)
                  : []
              )).join('、')}
              onChange={(v) => {
                const next = v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
                patchExt({ emotionTags: next, recommendedEmotion: next.join('、') });
              }}
              placeholder="自定义标签，顿号分隔"
            />
          </Field>
          <label className="flex items-center gap-2 text-[10px] text-ink/50">
            <input type="checkbox" checked={!!ext.favorite} onChange={(e) => patchExt({ favorite: e.target.checked })} />
            收藏
          </label>
          <label className="flex items-center gap-2 text-[10px] text-ink/50">
            <input
              type="checkbox"
              checked={!!ext.locked}
              onChange={(e) => {
                const locked = e.target.checked;
                const prompt =
                  item.promptEn?.trim()
                  || ext.prompts?.shot?.text?.trim()
                  || '';
                patchExt({
                  locked,
                  lockedPromptSnapshot: locked ? prompt : ext.lockedPromptSnapshot,
                  lockedAt: locked ? new Date().toISOString() : ext.lockedAt,
                });
              }}
            />
            锁定运镜（防 Prompt 漂移）
          </label>
        </DetailSection>
        <DetailSection title="Shot Prompt">
          <PromptPanel
            label="结构化 Shot Prompt"
            value={ext.prompts?.shot?.text ?? ''}
            onChange={(v) =>
              patchExt({ prompts: { shot: { version: 1, text: v, updatedAt: Date.now() } } })
            }
            onRegenerate={onRefreshPrompts}
            onCopy={() => copyText(ext.prompts?.shot?.text ?? '')}
          />
        </DetailSection>
        <p className="text-[10px] text-brand/70">
          引用 <code className="rounded bg-surface px-1">{formatAssetMention('shot', item.label)}</code>
        </p>
      </div>

      <div className="min-h-0 space-y-3 overflow-y-auto border-t border-line nx9-scroll p-4 lg:border-l lg:border-t-0">
        <DetailSection title="运动预览">
          <div className="overflow-hidden rounded-xl border border-line bg-black/15">
            <div className="relative aspect-[16/10] w-full">
              {ext.gifUrl || ext.exampleImageUrl ? (
                <img
                  src={(ext.gifUrl || ext.exampleImageUrl) ?? ''}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="grid h-full w-full place-items-center text-[11px] text-ink/35">
                  上传动图或静帧后在此预览
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <MediaSlot label="GIF 预览（优先）" url={ext.gifUrl} accept="image/gif,image/*" onUpload={onUploadGif} />
            <MediaSlot label="示例静帧" url={ext.exampleImageUrl} accept="image/*" onUpload={onUploadExample} />
          </div>
        </DetailSection>
      </div>
    </div>
  );
}

// ─── Emotion ───────────────────────────────────────────────

export function EmotionDetailFields({
  item,
  onChange,
  onRefreshPrompts,
  onUploadImage,
  readOnly = false,
}: {
  item: BacklotWorkspaceItem;
  onChange: (next: BacklotWorkspaceItem) => void;
  onRefreshPrompts: () => void;
  onUploadImage: UploadHandler;
  /** UX-P08：情绪库已降级，深链仅只读 */
  readOnly?: boolean;
}) {
  const ext = getEmotionCreative(item);
  const patch = (p: Partial<BacklotWorkspaceItem>) => {
    if (readOnly) return;
    onChange({ ...item, ...p });
  };
  const patchExt = (p: Partial<typeof ext>) => {
    if (readOnly) return;
    onChange({ ...item, creative: { ...ext, ...p } });
  };

  return (
    <div className={`max-w-2xl space-y-1 ${readOnly ? 'pointer-events-none opacity-90' : ''}`}>
      {readOnly ? (
        <p className="pointer-events-auto rounded-lg border border-amber-200/70 bg-amber-50/50 px-2.5 py-1.5 text-[10px] text-ink/60">
          遗留情绪条目 · 只读。新氛围请用镜头「推荐情绪」；微表情请用角色表情格。
        </p>
      ) : null}
      <input
        value={item.label}
        readOnly={readOnly}
        onChange={(e) => patch({ label: e.target.value })}
        className="w-full border-b border-line pb-1 text-sm font-semibold focus:outline-none"
      />
      <DetailSection title="情绪状态">
        <MediaSlot
          label="参考图"
          url={ext.imageUrl}
          accept="image/*"
          onUpload={readOnly ? async () => undefined : onUploadImage}
        />
        <Field label="人物描述">
          <TextArea value={ext.characterDescription ?? ''} onChange={(v) => patchExt({ characterDescription: v })} rows={2} />
        </Field>
        <Field label="声音描述">
          <TextArea value={ext.voiceDescription ?? ''} onChange={(v) => patchExt({ voiceDescription: v })} rows={2} />
        </Field>
        <Field label="动作描述">
          <TextArea value={ext.actionDescription ?? ''} onChange={(v) => patchExt({ actionDescription: v })} rows={2} />
        </Field>
        <Field label="镜头推荐">
          <TextInput value={ext.shotRecommendation ?? ''} onChange={(v) => patchExt({ shotRecommendation: v })} />
        </Field>
        <Field label="英文 Prompt">
          <TextArea value={item.promptEn} onChange={(v) => patch({ promptEn: v })} rows={3} mono />
        </Field>
        {!readOnly ? (
          <>
            <label className="flex items-center gap-2 text-[10px] text-ink/50">
              <input type="checkbox" checked={!!ext.favorite} onChange={(e) => patchExt({ favorite: e.target.checked })} />
              收藏
            </label>
            <label className="flex items-center gap-2 text-[10px] text-ink/50">
              <input
                type="checkbox"
                checked={!!ext.locked}
                onChange={(e) => {
                  const locked = e.target.checked;
                  const prompt =
                    item.promptEn?.trim()
                    || ext.prompts?.emotion?.text?.trim()
                    || '';
                  patchExt({
                    locked,
                    lockedPromptSnapshot: locked ? prompt : ext.lockedPromptSnapshot,
                    lockedAt: locked ? new Date().toISOString() : ext.lockedAt,
                  });
                }}
              />
              锁定情绪（防 Prompt 漂移）
            </label>
          </>
        ) : null}
      </DetailSection>
      <DetailSection title="Emotion Prompt">
        <PromptPanel
          label="结构化 Emotion Prompt"
          value={ext.prompts?.emotion?.text ?? ''}
          onChange={
            readOnly
              ? () => undefined
              : (v) =>
                  patchExt({ prompts: { emotion: { version: 1, text: v, updatedAt: Date.now() } } })
          }
          onRegenerate={readOnly ? undefined : onRefreshPrompts}
          onCopy={() => copyText(ext.prompts?.emotion?.text ?? '')}
        />
      </DetailSection>
      <p className="pointer-events-auto text-[10px] text-brand/70">
        引用 <code className="rounded bg-surface px-1">{formatAssetMention('emotion', item.label)}</code>
      </p>
    </div>
  );
}

// ─── Hook ────────────────────────────────────────────────────

export function HookDetailFields({
  item,
  onChange,
  onRefreshPrompts,
}: {
  item: BacklotWorkspaceItem;
  onChange: (next: BacklotWorkspaceItem) => void;
  onRefreshPrompts: () => void;
}) {
  const ext = getHookCreative(item);
  const patch = (p: Partial<BacklotWorkspaceItem>) => onChange({ ...item, ...p });
  const patchExt = (p: Partial<typeof ext>) => onChange({ ...item, creative: { ...ext, ...p } });

  return (
    <div className="space-y-1 max-w-2xl">
      <input
        value={item.label}
        onChange={(e) => patch({ label: e.target.value })}
        className="w-full font-semibold text-sm border-b border-line pb-1 focus:outline-none"
      />
      <DetailSection title="钩子信息">
        <Field label="标题">
          <TextInput value={ext.title ?? ''} onChange={(v) => patchExt({ title: v })} />
        </Field>
        <Field label="用途">
          <TextInput value={ext.purpose ?? ''} onChange={(v) => patchExt({ purpose: v })} />
        </Field>
        <Field label="前三秒脚本">
          <TextArea value={ext.firstThreeSecondsScript ?? ''} onChange={(v) => patchExt({ firstThreeSecondsScript: v })} rows={3} />
        </Field>
        <Field label="适用类型">
          <ChipList
            items={[...CAC_HOOK_TYPES]}
            selected={ext.applicableTypes ?? []}
            onToggle={(t) => {
              const cur = ext.applicableTypes ?? [];
              patchExt({
                applicableTypes: cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t],
              });
            }}
          />
        </Field>
        <Field label="示例">
          <TextArea value={ext.example ?? ''} onChange={(v) => patchExt({ example: v })} rows={2} />
        </Field>
        <Field label="阶段">
          <select
            value={item.hookPhase ?? 'opening'}
            onChange={(e) => patch({ hookPhase: e.target.value as 'opening' | 'ending' })}
            className="text-xs rounded-lg border border-line px-2 py-1"
          >
            <option value="opening">开场钩子</option>
            <option value="ending">结尾钩子</option>
          </select>
        </Field>
        <Field label="英文 Prompt">
          <TextArea value={item.promptEn} onChange={(v) => patch({ promptEn: v })} rows={3} mono />
        </Field>
        <label className="flex items-center gap-2 text-[10px] text-ink/50">
          <input
            type="checkbox"
            checked={!!ext.locked}
            onChange={(e) => {
              const locked = e.target.checked;
              const prompt =
                item.promptEn?.trim()
                || ext.firstThreeSecondsScript?.trim()
                || ext.prompts?.hook?.text?.trim()
                || '';
              patchExt({
                locked,
                lockedPromptSnapshot: locked ? prompt : ext.lockedPromptSnapshot,
                lockedAt: locked ? new Date().toISOString() : ext.lockedAt,
              });
            }}
          />
          锁定钩子（防 Prompt 漂移）
        </label>
      </DetailSection>
      <DetailSection title="Hook Prompt">
        <PromptPanel
          label="结构化 Hook Prompt"
          value={ext.prompts?.hook?.text ?? ''}
          onChange={(v) =>
            patchExt({ prompts: { hook: { version: 1, text: v, updatedAt: Date.now() } } })
          }
          onRegenerate={onRefreshPrompts}
          onCopy={() => copyText(ext.prompts?.hook?.text ?? '')}
        />
      </DetailSection>
      <p className="text-[10px] text-brand/70">
        引用 <code className="bg-surface px-1 rounded">{formatAssetMention('hook', item.label)}</code>
      </p>
    </div>
  );
}


// ─── Costume ───────────────────────────────────────────────

export function CostumeDetailFields({
  item,
  onChange,
  onRefreshPrompts,
  onUploadRef,
  onUploadSheet,
  onUploadFrontFlat,
  onUploadVariant,
  onCropFrontFromSheet,
  croppingFront = false,
  onGenerateSheet,
  generatingSheet = false,
  genSettingsSlot,
  generateSheetLockedReason,
  boundCharacterNames = [],
  onOpenCharacter,
  onBumpRevision,
  chromeOwnsPrimaryGen = false,
}: {
  item: BacklotWorkspaceItem;
  onChange: (next: BacklotWorkspaceItem) => void;
  onRefreshPrompts: () => void;
  onUploadRef: UploadHandler;
  onUploadSheet: UploadHandler;
  onUploadFrontFlat?: UploadHandler;
  onUploadVariant?: (variantId: string, file: File) => void;
  /** 从完整设定板裁切正面全身衣封面 */
  onCropFrontFromSheet?: () => void;
  croppingFront?: boolean;
  /** 通过画布连接的图像生成节点批量/单件出设定板 */
  onGenerateSheet?: () => void;
  generatingSheet?: boolean;
  genSettingsSlot?: ReactNode;
  /** 未连接图像生成时的锁定说明；有值时仍展示生成按钮但禁用 */
  generateSheetLockedReason?: string;
  /** Cos-05：被哪些角色绑定 */
  boundCharacterNames?: string[];
  onOpenCharacter?: (name: string) => void;
  onBumpRevision?: () => void;
  chromeOwnsPrimaryGen?: boolean;
}) {
  const ext = getCostumeCreative(item);
  const [masterOpen, setMasterOpen] = useState(false);
  const [partsOpen, setPartsOpen] = useState(false);
  const patch = (p: Partial<BacklotWorkspaceItem>) => onChange({ ...item, ...p });
  const patchExt = (p: Partial<typeof ext>) => onChange({ ...item, creative: { ...ext, ...p } });
  const promptVersion = ext.prompts?.costume?.version ?? ext.prompts?.image?.version ?? 1;
  const locked = Boolean(ext.locked);
  const cover = ext.frontFlatUrl || ext.sheetUrl || ext.referenceUrls?.[0] || '';
  const health = [
    item.label?.trim(),
    (ext.description || item.promptZh || item.promptEn)?.trim(),
    (ext.colorPalette || ext.materials || ext.silhouette)?.trim(),
    cover,
  ].filter(Boolean).length;
  const masterGallery: ImageLightboxItem[] = [
    ...(ext.sheetUrl ? [{ url: ext.sheetUrl, label: '服装完整设定板' }] : []),
    ...(ext.frontFlatUrl ? [{ url: ext.frontFlatUrl, label: '正面全身衣封面' }] : []),
    ...((ext.referenceUrls ?? []).map((url, i) => ({ url, label: `参考 ${i + 1}` }))),
  ];
  const variantItems = ext.variants?.length ? ext.variants : CAC_COSTUME_VARIANT_PRESETS;

  return (
    <div className="flex h-full min-h-0 w-full">
      <aside className="flex min-h-0 w-[min(420px,40%)] shrink-0 flex-col border-r border-line">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto nx9-scroll p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[10px] ${health >= 4 ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>
              健康度 {health}/4
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] ${locked ? 'bg-brand/10 text-brand' : 'bg-surface text-ink/45'}`}>
              {locked ? '已锁定' : '未锁定'}
            </span>
            <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink/45">Prompt v{promptVersion}</span>
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] text-brand">资产 v{item.revision ?? 1}</span>
            {onBumpRevision ? (
              <button
                type="button"
                className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink/55 hover:border-brand/40 hover:text-brand"
                onClick={onBumpRevision}
              >
                新建版本
              </button>
            ) : null}
            <span className="text-[10px] text-ink/40">
              引用 <code className="rounded bg-surface px-1 text-ink/55">{formatAssetMention('costume', item.label)}</code>
            </span>
          </div>

          <DetailSectionNav
            sections={[
              { id: 'costume-core', label: '造型' },
              { id: 'costume-prompt', label: 'Prompt' },
              { id: 'costume-usage', label: '关系' },
              { id: 'costume-collab', label: '协作' },
            ]}
          />

          <DetailSection id="costume-core" title="核心造型">
            <Field label="服装名 / @引用名">
              <TextInput value={item.label} onChange={(v) => patch({ label: v })} placeholder="服装名" />
            </Field>
            <Field label="套装描述（防服装漂移）">
              <TextArea
                value={ext.description ?? item.promptZh ?? ''}
                onChange={(v) => patchExt({ description: v })}
                rows={3}
                placeholder="整体造型、穿着场合、标志性外观…"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="类别">
                <TextInput value={ext.category ?? ''} onChange={(v) => patchExt({ category: v })} placeholder="日常 / 正装 / 古装 / 战甲…" />
              </Field>
              <Field label="时代 / 风格">
                <TextInput value={ext.eraStyle ?? ''} onChange={(v) => patchExt({ eraStyle: v })} placeholder="现代都市 / 民国 / 仙侠…" />
              </Field>
              <Field label="配色">
                <TextInput value={ext.colorPalette ?? ''} onChange={(v) => patchExt({ colorPalette: v })} placeholder="主色 + 辅色" />
              </Field>
              <Field label="面料质感">
                <TextInput value={ext.materials ?? ''} onChange={(v) => patchExt({ materials: v })} placeholder="棉麻 / 丝绸 / 皮革 / 金属甲片…" />
              </Field>
              <Field label="廓形剪裁">
                <TextInput value={ext.silhouette ?? ''} onChange={(v) => patchExt({ silhouette: v })} placeholder="修身 / 宽松 / A 字…" />
              </Field>
              <Field label="标签">
                <TextInput
                  value={(ext.tags ?? []).join('、')}
                  onChange={(v) => patchExt({ tags: v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) })}
                  placeholder="侦探、夜戏、战斗…"
                />
              </Field>
            </div>
            <button
              type="button"
              className="text-[10px] text-ink/50 hover:text-brand"
              onClick={() => setPartsOpen((v) => !v)}
            >
              {partsOpen ? '收起单品拆解' : '单品拆解'}
            </button>
            {partsOpen ? (
              <div className="space-y-2 rounded-xl border border-line/70 bg-surface/35 p-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="上衣"><TextInput value={ext.top ?? ''} onChange={(v) => patchExt({ top: v })} /></Field>
                  <Field label="下装"><TextInput value={ext.bottom ?? ''} onChange={(v) => patchExt({ bottom: v })} /></Field>
                  <Field label="外套"><TextInput value={ext.outerwear ?? ''} onChange={(v) => patchExt({ outerwear: v })} /></Field>
                  <Field label="鞋履"><TextInput value={ext.footwear ?? ''} onChange={(v) => patchExt({ footwear: v })} /></Field>
                </div>
                <Field label="配饰 / 标志物">
                  <TextArea value={ext.accessories ?? ''} onChange={(v) => patchExt({ accessories: v })} rows={2} placeholder="怀表、耳坠、腰牌、徽章…" />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="适用角色">
                    <TextInput
                      value={(ext.recommendedCharacters ?? []).join('、')}
                      onChange={(v) => patchExt({ recommendedCharacters: v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) })}
                      placeholder="林夏、老陈…"
                    />
                  </Field>
                  <Field label="适用场景">
                    <TextInput
                      value={(ext.recommendedScenes ?? []).join('、')}
                      onChange={(v) => patchExt({ recommendedScenes: v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) })}
                      placeholder="咖啡店、雨夜街道…"
                    />
                  </Field>
                </div>
              </div>
            ) : null}
          </DetailSection>

          <DetailSection id="costume-prompt" title="Prompt">
            <Field label="服装 Prompt（英文优先，注入出图）">
              <TextArea
                value={item.promptEn || ext.prompts?.image?.text || ext.prompts?.costume?.text || ''}
                onChange={(v) => patch({ promptEn: v })}
                rows={4}
                mono
                placeholder="tailored trench coat, muted palette, locked wardrobe landmarks..."
              />
            </Field>
            {ext.prompts?.costume?.text ? (
              <Field label="服装 Bible（结构化）">
                <TextArea value={ext.prompts.costume.text} onChange={(v) => patchExt({ prompts: { ...ext.prompts, costume: { version: 1, text: v, updatedAt: Date.now() } } })} rows={4} mono />
              </Field>
            ) : null}
            <Field label="Negative / 禁改项">
              <TextArea
                value={ext.prompts?.negative?.text ?? ''}
                onChange={(v) => patchExt({ prompts: { ...ext.prompts, negative: { version: 1, text: v, updatedAt: Date.now() } } })}
                rows={2}
                mono
                placeholder="wrong outfit, inconsistent wardrobe, extra accessories..."
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              {ext.lockedPromptSnapshot?.trim()
                && (item.promptEn || ext.prompts?.costume?.text || '').trim() !== ext.lockedPromptSnapshot.trim() ? (
                <button
                  type="button"
                  className="rounded-lg border border-warn/40 px-2.5 py-1 text-[11px] text-warn hover:bg-warn/10"
                  onClick={() => patch({ promptEn: ext.lockedPromptSnapshot })}
                >
                  恢复锁定快照
                </button>
              ) : null}
              <button type="button" className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink/70 hover:border-brand/40" onClick={onRefreshPrompts}>
                刷新专业 Prompt
              </button>
              <button
                type="button"
                className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink/70 hover:border-brand/40"
                onClick={() => copyText(item.promptEn || ext.prompts?.costume?.text || '')}
              >
                复制 Prompt
              </button>
            </div>
          </DetailSection>

          <DetailSection id="costume-usage" title="被哪些角色使用">
            {boundCharacterNames.length === 0 ? (
              <p className="text-[10px] text-ink/40">尚无角色绑定此服装</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {boundCharacterNames.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="rounded-full border border-line px-2 py-0.5 text-[10px] text-brand hover:border-brand/40"
                    onClick={() => onOpenCharacter?.(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </DetailSection>

          <DetailSection id="costume-collab" title="协作说明">
            <p className="text-[10px] leading-relaxed text-ink/50">
              服装以素材库为权威（SSOT），不回写编剧 Bible；角色/场景才推送 Bible。
            </p>
          </DetailSection>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto nx9-scroll p-4">
          <div className="rounded-xl border border-brand/25 bg-brand/5 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-brand">服装完整设定板</p>
                <p className="text-[10px] text-ink/45">主媒体 · 点击放大 · 生成后写入此位</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!chromeOwnsPrimaryGen && genSettingsSlot ? <div>{genSettingsSlot}</div> : null}
                {onGenerateSheet || generateSheetLockedReason ? (
                  <button
                    type="button"
                    className={
                      chromeOwnsPrimaryGen
                        ? 'rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink/55 hover:border-brand/40 disabled:opacity-45'
                        : 'rounded-lg bg-brand px-2.5 py-1 text-[11px] text-white disabled:opacity-45'
                    }
                    disabled={!onGenerateSheet || generatingSheet}
                    onClick={onGenerateSheet}
                    title={generateSheetLockedReason || '主生成·服装设定板'}
                  >
                    {generatingSheet
                      ? '设定板生成中…'
                      : onGenerateSheet
                        ? (chromeOwnsPrimaryGen ? '再次生成·设定板' : '主生成·服装设定板')
                        : '当前项目不可生成'}
                  </button>
                ) : null}
              </div>
            </div>
            {cover ? (
              <button
                type="button"
                className="group relative block w-full overflow-hidden rounded-lg border border-line bg-black/20"
                onClick={() => setMasterOpen(true)}
                title="放大查看服装设定板"
              >
                <img src={cover} alt="" className="max-h-[28rem] w-full object-contain" />
                <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/25">
                  <ZoomIn size={18} className="text-white opacity-0 drop-shadow transition group-hover:opacity-100" />
                </span>
              </button>
            ) : (
              <div className="grid min-h-[10rem] place-items-center rounded-lg border border-dashed border-line text-[11px] text-ink/40">
                尚未生成或上传服装设定板
              </div>
            )}
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <MediaSlot label="上传/替换设定板" url={ext.sheetUrl} accept="image/*" onUpload={onUploadSheet} />
              <MediaSlot
                label="正面全身衣封面"
                url={ext.frontFlatUrl}
                accept="image/*"
                onUpload={onUploadFrontFlat ?? onUploadSheet}
                hint="卡片封面优先用此图"
              />
              <MediaSlot label="补充参考图" url={ext.referenceUrls?.[0]} accept="image/*" onUpload={onUploadRef} />
            </div>
            {ext.sheetUrl && onCropFrontFromSheet ? (
              <button
                type="button"
                className="mt-2 rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink/70 hover:border-brand/40 disabled:opacity-45"
                disabled={croppingFront}
                onClick={onCropFrontFromSheet}
              >
                {croppingFront ? '裁切封面中…' : '从设定板裁切封面'}
              </button>
            ) : null}
            <div className="mt-3">
              <VariantGrid
                title="状态变体（破损/湿衣等，最多 4）"
                items={variantItems}
                columns={4}
                onChangeItem={(id, itemPatch) => {
                  const base = ext.variants?.length ? ext.variants : CAC_COSTUME_VARIANT_PRESETS;
                  const next = base.map((v) => (v.id === id ? { ...v, ...itemPatch } : v));
                  patchExt({ variants: next });
                }}
                onUploadItem={onUploadVariant}
              />
            </div>
            <p className="mt-2 text-[10px] text-ink/35">{COSTUME_SHEET_PROMPT_TEMPLATE.slice(0, 120)}…</p>
          </div>
        </div>
      </div>

      {masterOpen && masterGallery.length > 0 ? (
        <ImageLightbox open={masterOpen} items={masterGallery} onClose={() => setMasterOpen(false)} />
      ) : null}
    </div>
  );
}

// ─── Prop ──────────────────────────────────────────────────

export function PropDetailFields({
  item,
  onChange,
  onRefreshPrompts,
  onUploadRef,
  onUploadSheet,
  onUploadCover,
  onUploadVariant,
  boundSceneItems = [],
  onOpenScene,
  sceneOptions = [],
  onToggleLinkedScene,
  onGenerateSheet,
  generatingSheet = false,
  genSettingsSlot,
  onCropCoverFromSheet,
  croppingCover = false,
  onBumpRevision,
  chromeOwnsPrimaryGen = false,
}: {
  item: BacklotWorkspaceItem;
  onChange: (next: BacklotWorkspaceItem) => void;
  onRefreshPrompts: () => void;
  onUploadRef: UploadHandler;
  onUploadSheet: UploadHandler;
  onUploadCover?: UploadHandler;
  onUploadVariant?: (variantId: string, file: File) => void;
  /** 反查：哪些场景挂了此道具 */
  boundSceneItems?: Array<{ id: string; label: string }>;
  onOpenScene?: (sceneId: string) => void;
  /** 可勾选关联的场景库 */
  sceneOptions?: Array<{ id: string; label: string }>;
  onToggleLinkedScene?: (sceneId: string, linked: boolean) => void;
  onGenerateSheet?: () => void | Promise<void>;
  generatingSheet?: boolean;
  genSettingsSlot?: ReactNode;
  onCropCoverFromSheet?: () => void;
  croppingCover?: boolean;
  onBumpRevision?: () => void;
  chromeOwnsPrimaryGen?: boolean;
}) {
  const ext = getPropCreative(item);
  const propVariants = ext.variants ?? DEFAULT_PROP_VARIANTS;
  const [masterOpen, setMasterOpen] = useState(false);
  const patch = (p: Partial<BacklotWorkspaceItem>) => onChange({ ...item, ...p });
  const patchExt = (p: Partial<typeof ext>) => onChange({ ...item, creative: { ...ext, ...p } });
  const promptVersion = ext.prompts?.prop?.version ?? ext.prompts?.image?.version ?? 1;
  const locked = Boolean(ext.locked);
  const cover = ext.coverUrl || ext.sheetUrl || ext.referenceUrls?.[0] || '';
  const health = [
    item.label?.trim(),
    (ext.description || item.promptZh || item.promptEn)?.trim(),
    (ext.landmarks || ext.materials)?.trim(),
    cover,
  ].filter(Boolean).length;
  const masterGallery: ImageLightboxItem[] = [
    ...(ext.sheetUrl ? [{ url: ext.sheetUrl, label: '道具设定板' }] : []),
    ...(ext.coverUrl ? [{ url: ext.coverUrl, label: '正面封面' }] : []),
    ...(!ext.sheetUrl && !ext.coverUrl && cover ? [{ url: cover, label: '道具主参考' }] : []),
  ];
  const linkedIds = new Set([
    ...(ext.linkedSceneIds ?? []),
    ...boundSceneItems.map((s) => s.id),
  ]);

  return (
    <div className="flex h-full min-h-0 w-full">
      <aside className="flex min-h-0 w-[min(420px,40%)] shrink-0 flex-col border-r border-line">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto nx9-scroll p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[10px] ${health >= 4 ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>
              健康度 {health}/4
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] ${locked ? 'bg-brand/10 text-brand' : 'bg-surface text-ink/45'}`}>
              {locked ? '已锁定' : '未锁定'}
            </span>
            <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink/45">Prompt v{promptVersion}</span>
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] text-brand">资产 v{item.revision ?? 1}</span>
            {onBumpRevision ? (
              <button
                type="button"
                className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink/55 hover:border-brand/40 hover:text-brand"
                onClick={onBumpRevision}
              >
                新建版本
              </button>
            ) : null}
            <span className="text-[10px] text-ink/40">
              引用 <code className="rounded bg-surface px-1 text-ink/55">{formatAssetMention('prop', item.label)}</code>
            </span>
          </div>

          <DetailSectionNav
            sections={[
              { id: 'prop-archive', label: '档案' },
              { id: 'prop-scenes', label: '场景' },
              { id: 'prop-prompt', label: 'Prompt' },
              { id: 'prop-collab', label: '协作' },
            ]}
          />

          <DetailSection id="prop-archive" title="档案">
            <Field label="道具名 / @引用名">
              <TextInput value={item.label} onChange={(v) => patch({ label: v })} placeholder="道具名" />
            </Field>
            <Field label="外观 / 用途（防道具漂移）">
              <TextArea
                value={ext.description ?? item.promptZh ?? ''}
                onChange={(v) => patchExt({ description: v })}
                rows={3}
                placeholder="外形、材质、在戏中的功能…"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="类别">
                <TextInput value={ext.category ?? ''} onChange={(v) => patchExt({ category: v })} placeholder="手持 / 陈设 / 载具 / 信物…" />
              </Field>
              <Field label="材质">
                <TextInput value={ext.materials ?? ''} onChange={(v) => patchExt({ materials: v })} placeholder="金属、木、玻璃…" />
              </Field>
            </div>
            <Field label="标志细节（连续性锚点）">
              <TextArea
                value={ext.landmarks ?? ''}
                onChange={(v) => patchExt({ landmarks: v })}
                rows={2}
                placeholder="刮痕位置、铭文、独特光泽…"
              />
              {!ext.landmarks?.trim() ? (
                <p className="mt-1 text-[10px] text-warn">建议填写标志细节，便于跨镜连续性检查。</p>
              ) : null}
            </Field>
            <Field label="关联场景名（文本兼容）">
              <TextInput
                value={(ext.linkedScenes ?? []).join('、')}
                onChange={(v) => patchExt({ linkedScenes: v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) })}
                placeholder="咖啡馆、雨夜街道…"
              />
            </Field>
            {sceneOptions.length > 0 && onToggleLinkedScene ? (
              <Field label="关联场景库（linkedSceneIds）">
                <div className="flex flex-wrap gap-1">
                  {sceneOptions.map((sc) => {
                    const on = linkedIds.has(sc.id);
                    return (
                      <button
                        key={sc.id}
                        type="button"
                        onClick={() => onToggleLinkedScene(sc.id, !on)}
                        className={`rounded-full px-2 py-0.5 text-[10px] border ${
                          on ? 'border-brand/40 bg-brand/10 text-brand' : 'border-line text-ink/55 hover:border-brand/30'
                        }`}
                      >
                        {sc.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
            ) : null}
            <Field label="标签">
              <TextInput
                value={(ext.tags ?? []).join('、')}
                onChange={(v) => patchExt({ tags: v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) })}
                placeholder="信物、开场、关键…"
              />
            </Field>
          </DetailSection>

          <DetailSection id="prop-scenes" title="被哪些场景挂接">
            {boundSceneItems.length === 0 ? (
              <p className="text-[10px] text-ink/40">尚无场景通过 propIds 挂接此道具</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {boundSceneItems.map((sc) => (
                  <button
                    key={sc.id}
                    type="button"
                    className="rounded-full border border-line px-2 py-0.5 text-[10px] text-brand hover:border-brand/40"
                    onClick={() => onOpenScene?.(sc.id)}
                  >
                    {sc.label || sc.id}
                  </button>
                ))}
              </div>
            )}
          </DetailSection>

          <DetailSection id="prop-prompt" title="Prompt">
            <Field label="道具 Prompt（英文优先，注入出图）">
              <TextArea
                value={item.promptEn || ext.prompts?.image?.text || ext.prompts?.prop?.text || ''}
                onChange={(v) => patch({ promptEn: v })}
                rows={4}
                mono
                placeholder="antique brass pocket watch, scratched lid, locked landmark details..."
              />
            </Field>
            {ext.lockedPromptSnapshot?.trim()
              && (item.promptEn || ext.prompts?.prop?.text || '').trim() !== ext.lockedPromptSnapshot.trim() ? (
              <button
                type="button"
                className="mb-2 rounded-lg border border-warn/40 px-2.5 py-1 text-[11px] text-warn hover:bg-warn/10"
                onClick={() => patch({ promptEn: ext.lockedPromptSnapshot })}
              >
                恢复锁定快照
              </button>
            ) : null}
            {ext.prompts?.prop?.text ? (
              <Field label="道具 Bible（结构化）">
                <TextArea
                  value={ext.prompts.prop.text}
                  onChange={(v) =>
                    patchExt({
                      prompts: {
                        ...ext.prompts,
                        prop: { version: 1, text: v, updatedAt: Date.now() },
                      },
                    })
                  }
                  rows={4}
                  mono
                />
              </Field>
            ) : null}
            <Field label="Negative / 禁改项">
              <TextArea
                value={ext.prompts?.negative?.text ?? ''}
                onChange={(v) =>
                  patchExt({
                    prompts: {
                      ...ext.prompts,
                      negative: { version: 1, text: v, updatedAt: Date.now() },
                    },
                  })
                }
                rows={2}
                mono
                placeholder="wrong prop, inconsistent materials..."
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink/70 hover:border-brand/40"
                onClick={onRefreshPrompts}
              >
                刷新专业 Prompt
              </button>
              <button
                type="button"
                className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink/70 hover:border-brand/40"
                onClick={() => copyText(item.promptEn || ext.prompts?.prop?.text || '')}
              >
                复制 Prompt
              </button>
            </div>
          </DetailSection>

          <DetailSection id="prop-collab" title="协作说明">
            <p className="text-[10px] leading-relaxed text-ink/50">
              道具以素材库为权威（SSOT），不回写编剧 Bible；场景挂接在库内维护。
            </p>
          </DetailSection>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto nx9-scroll p-4">
          <div className="rounded-xl border border-brand/25 bg-brand/5 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-brand">道具主参考 / 三视图板</p>
                <p className="text-[10px] text-ink/45">主媒体 · 点击放大 · 可选生成轻量三视图</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!chromeOwnsPrimaryGen && genSettingsSlot ? <div>{genSettingsSlot}</div> : null}
                {onGenerateSheet ? (
                  <button
                    type="button"
                    disabled={generatingSheet}
                    onClick={() => void onGenerateSheet()}
                    className={
                      chromeOwnsPrimaryGen
                        ? 'rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink/55 hover:border-brand/40 disabled:opacity-50'
                        : 'rounded-lg bg-brand px-2.5 py-1 text-[11px] text-white disabled:opacity-50'
                    }
                  >
                    {generatingSheet
                      ? '生成中…'
                      : chromeOwnsPrimaryGen
                        ? '再次生成·三视图'
                        : '主生成·三视图板'}
                  </button>
                ) : null}
              </div>
            </div>
            {cover ? (
              <button
                type="button"
                className="group relative block w-full overflow-hidden rounded-lg border border-line bg-black/20"
                onClick={() => setMasterOpen(true)}
                title="放大查看道具参考"
              >
                <img src={cover} alt="" className="max-h-[28rem] w-full object-contain" />
                <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/25">
                  <ZoomIn size={18} className="text-white opacity-0 drop-shadow transition group-hover:opacity-100" />
                </span>
              </button>
            ) : (
              <div className="grid min-h-[10rem] place-items-center rounded-lg border border-dashed border-line text-[11px] text-ink/40">
                尚未上传主参考图
              </div>
            )}
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <MediaSlot label="主参考/设定板" url={ext.sheetUrl} accept="image/*" onUpload={onUploadSheet} />
              <MediaSlot
                label="正面封面"
                url={ext.coverUrl}
                accept="image/*"
                onUpload={onUploadCover ?? onUploadSheet}
                hint="卡片优先"
              />
              <MediaSlot label="补充参考" url={ext.referenceUrls?.[0]} accept="image/*" onUpload={onUploadRef} />
            </div>
            {ext.sheetUrl && onCropCoverFromSheet ? (
              <button
                type="button"
                className="mt-2 rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink/70 hover:border-brand/40 disabled:opacity-45"
                disabled={croppingCover}
                onClick={onCropCoverFromSheet}
              >
                {croppingCover ? '裁切封面中…' : '从设定板裁切封面'}
              </button>
            ) : null}
            <div className="mt-3">
              <VariantGrid
                title="状态变体（拔出/损坏等，最多 4 · 同一道具锚点）"
                items={propVariants}
                columns={4}
                onChangeItem={(id, itemPatch) => {
                  const base = ext.variants?.length ? ext.variants : DEFAULT_PROP_VARIANTS;
                  const next = base.map((v) => (v.id === id ? { ...v, ...itemPatch } : v));
                  patchExt({ variants: next });
                }}
                onUploadItem={onUploadVariant}
              />
            </div>
          </div>
        </div>
      </div>

      {masterOpen && masterGallery.length > 0 ? (
        <ImageLightbox open={masterOpen} items={masterGallery} onClose={() => setMasterOpen(false)} />
      ) : null}
    </div>
  );
}

// ─── Voice / Sound ───────────────────────────────────────────

export function VoiceDetailFields({
  sound,
  onChange,
  onRefreshPrompts,
  onUploadAudio,
  onSetAsCharacterReference,
  characterOptions = [],
  readOnly = false,
}: {
  sound: SoundAssetProfile;
  onChange: (next: SoundAssetProfile) => void;
  onRefreshPrompts: () => void;
  onUploadAudio?: UploadHandler;
  /** Snd-02：从声音库设为某角色参考音 */
  onSetAsCharacterReference?: (characterId: string) => void;
  characterOptions?: Array<{ id: string; name: string }>;
  readOnly?: boolean;
}) {
  const ext = getVoiceCreative(sound);
  const locked = readOnly || Boolean(sound.builtinKey) || sound.id.startsWith('builtin-sound-');
  const kind = inferSoundAssetKind(sound);
  const [bindCharacterId, setBindCharacterId] = useState(characterOptions[0]?.id ?? '');
  const patch = (p: Partial<SoundAssetProfile>) => {
    if (locked) return;
    onChange({ ...sound, ...p });
  };
  const patchExt = (p: Partial<typeof ext>) => {
    if (locked) return;
    onChange({ ...sound, creative: { ...ext, ...p } });
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.95fr)]">
      <div className="min-h-0 space-y-1 overflow-y-auto nx9-scroll p-4 max-w-2xl lg:max-w-none">
        <input
          value={sound.name}
          disabled={locked}
          onChange={(e) => patch({ name: e.target.value })}
          className="w-full border-b border-line pb-1 text-sm font-semibold focus:outline-none disabled:opacity-60"
        />
        <p className="text-[10px] text-ink/40">
          声音 = 可复用音频资产（配音 / 音效 / BGM）。角色参考音 = 克隆源；声线档案 = 引擎侧配置。
        </p>
        <DetailSection title="声音档案">
          <Field label="用途一行">
            <TextArea
              value={sound.description ?? ''}
              onChange={(v) => patch({ description: v })}
              rows={2}
              placeholder="如：治愈旁白 / 雨夜环境底声"
            />
          </Field>
          <Field label="子类型">
            <div className="flex flex-wrap gap-1">
              {(Object.keys(SOUND_ASSET_KIND_LABELS) as SoundAssetKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  disabled={locked}
                  onClick={() => patch({ soundKind: k })}
                  className={`rounded-full border px-2 py-0.5 text-[10px] disabled:opacity-50 ${
                    kind === k
                      ? 'border-brand/40 bg-brand/10 text-brand'
                      : 'border-line text-ink/55'
                  }`}
                >
                  {SOUND_ASSET_KIND_LABELS[k]}
                </button>
              ))}
            </div>
          </Field>
          {kind === 'voice' ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="音色">
                <TextInput value={ext.voiceTone ?? ''} onChange={(v) => patchExt({ voiceTone: v })} />
              </Field>
              <Field label="年龄">
                <TextInput value={ext.age ?? ''} onChange={(v) => patchExt({ age: v })} />
              </Field>
              <Field label="性别">
                <select
                  value={ext.gender ?? ''}
                  disabled={locked}
                  onChange={(e) => patchExt({ gender: e.target.value })}
                  className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs disabled:opacity-50"
                >
                  <option value="">选择</option>
                  {CAC_VOICE_GENDERS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </Field>
              <Field label="语速">
                <TextInput
                  value={ext.speed ?? ''}
                  onChange={(v) => patchExt({ speed: v })}
                  placeholder="正常 / 快 / 慢"
                />
              </Field>
              <Field label="情绪">
                <select
                  value={ext.emotion ?? ''}
                  disabled={locked}
                  onChange={(e) => patchExt({ emotion: e.target.value })}
                  className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs disabled:opacity-50"
                >
                  <option value="">选择</option>
                  {CAC_VOICE_EMOTIONS.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </Field>
              <Field label="语言">
                <TextInput
                  value={ext.language ?? ''}
                  onChange={(v) => patchExt({ language: v })}
                  placeholder="中文 / 英文"
                />
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Field label="音色 / 质感描述">
                <TextInput value={ext.voiceTone ?? ''} onChange={(v) => patchExt({ voiceTone: v })} />
              </Field>
              <Field label="节奏">
                <TextInput
                  value={ext.speed ?? ''}
                  onChange={(v) => patchExt({ speed: v })}
                  placeholder="缓慢 / 稳定 / 快速"
                />
              </Field>
              <Field label="情绪氛围">
                <TextInput value={ext.emotion ?? ''} onChange={(v) => patchExt({ emotion: v })} />
              </Field>
              <Field label="语言标注">
                <TextInput
                  value={ext.language ?? ''}
                  onChange={(v) => patchExt({ language: v })}
                  placeholder="无对白 / 环境声"
                />
              </Field>
            </div>
          )}
        </DetailSection>
        <DetailSection title="Voice Prompt">
          <PromptPanel
            label="结构化 Voice Prompt"
            value={ext.prompts?.voice?.text ?? ''}
            onChange={(v) => {
              if (locked) return;
              patchExt({ prompts: { voice: { version: 1, text: v, updatedAt: Date.now() } } });
            }}
            onRegenerate={locked ? undefined : onRefreshPrompts}
            onCopy={() => copyText(ext.prompts?.voice?.text ?? '')}
          />
        </DetailSection>
        <p className="text-[10px] text-brand/70">
          引用 <code className="rounded bg-surface px-1">{formatAssetMention('sound', sound.name)}</code>
        </p>
      </div>

      <aside className="flex min-h-0 min-w-0 flex-col border-t border-line lg:border-l lg:border-t-0">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto nx9-scroll p-4">
          <div className="rounded-xl border border-brand/25 bg-brand/5 p-3">
            <p className="mb-1 text-xs font-semibold text-brand">试听音频</p>
            <p className="mb-2 text-[10px] text-ink/45">
              有文件时可用于配音克隆 / 节点引用；无文件时条目仍可作为 Prompt 词典使用
            </p>
            {sound.audioUrl ? (
              <audio src={sound.audioUrl} controls className="mb-2 w-full" />
            ) : (
              <div className="mb-2 grid min-h-[6rem] place-items-center rounded-lg border border-dashed border-line text-[11px] text-ink/40">
                尚未上传音频
              </div>
            )}
            <MediaSlot
              label="音频文件"
              url={sound.audioUrl}
              accept="audio/*"
              onUpload={(file) => {
                if (locked || !onUploadAudio) return;
                void onUploadAudio(file);
              }}
              hint={locked ? '内置/只读' : '上传音频'}
            />
            {onSetAsCharacterReference && sound.audioUrl && !locked ? (
              <div className="mt-2 space-y-1.5">
                <p className="text-[10px] text-ink/45">
                  角色参考音 = TTS 克隆源；本库条目仍可被 @声音 复用。声线档案（VoiceCast）是引擎侧音色配置。
                </p>
                <select
                  className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px]"
                  value={bindCharacterId}
                  onChange={(e) => setBindCharacterId(e.target.value)}
                >
                  <option value="">选择角色…</option>
                  {characterOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!bindCharacterId}
                  className="w-full rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink/70 hover:border-brand/40 disabled:opacity-40"
                  onClick={() => {
                    if (!bindCharacterId) return;
                    onSetAsCharacterReference(bindCharacterId);
                  }}
                >
                  设为该角色参考音
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}

// ─── Style（Sty-01～03）──────────────────────────────────────

export function StyleDetailFields({
  style,
  onChange,
  onUploadReference,
  readOnly = false,
}: {
  style: import('@nx9/shared').StylePresetProfile;
  onChange: (next: import('@nx9/shared').StylePresetProfile) => void;
  onUploadReference?: UploadHandler;
  readOnly?: boolean;
}) {
  const patch = (p: Partial<typeof style>) => onChange({ ...style, ...p });
  const locked = readOnly || Boolean(style.builtinKey);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.95fr)]">
      <div className="min-h-0 space-y-1 overflow-y-auto nx9-scroll p-4 max-w-2xl lg:max-w-none">
        <input
          value={style.name}
          disabled={locked}
          onChange={(e) => patch({ name: e.target.value })}
          className="w-full border-b border-line pb-1 text-sm font-semibold focus:outline-none disabled:opacity-60"
        />
        <p className="text-[10px] text-ink/40">
          风格 = 画面美学（色调、材质、时代感）；镜头 = 机位运镜。仅公共库维护；分镜帧可点选写入 stylePreset。
        </p>
        <DetailSection title="风格档案">
          <Field label="用途一行">
            <TextInput
              value={style.description ?? ''}
              onChange={(v) => {
                if (locked) return;
                patch({ description: v || undefined });
              }}
              placeholder="如：写实光影与景深"
            />
          </Field>
          <Field label="美学族">
            <div className="flex flex-wrap gap-1">
              {STYLE_AESTHETIC_FAMILIES.map((fam) => (
                <button
                  key={fam.id}
                  type="button"
                  title={fam.hint}
                  disabled={locked}
                  onClick={() => {
                    if (locked) return;
                    patch({ family: fam.id });
                  }}
                  className={`rounded-full border px-2 py-0.5 text-[10px] disabled:opacity-50 ${
                    style.family === fam.id
                      ? 'border-brand/40 bg-brand/10 text-brand'
                      : 'border-line text-ink/55'
                  }`}
                >
                  {fam.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="英文美学 Prompt">
            <TextArea
              value={style.promptEn}
              onChange={(v) => {
                if (locked) return;
                patch({ promptEn: v });
              }}
              rows={4}
              mono
              placeholder="cinematic lighting, film grain…"
            />
          </Field>
          <Field label="中文备注（可选）">
            <TextInput
              value={style.promptZh ?? ''}
              onChange={(v) => {
                if (locked) return;
                patch({ promptZh: v });
              }}
              placeholder="一句话说明用途"
            />
          </Field>
        </DetailSection>
        <p className="text-[10px] text-brand/70">
          引用 <code className="rounded bg-surface px-1">{formatAssetMention('style', style.name)}</code>
        </p>
      </div>

      <aside className="flex min-h-0 min-w-0 flex-col border-t border-line lg:border-l lg:border-t-0">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto nx9-scroll p-4">
          <div className="rounded-xl border border-brand/25 bg-brand/5 p-3">
            <p className="mb-1 text-xs font-semibold text-brand">美学参考图</p>
            <p className="mb-2 text-[10px] text-ink/45">可选；有图时卡片封面优先用它，无图时内置走色板占位</p>
            {style.referenceImageUrl ? (
              <div className="mb-2 overflow-hidden rounded-lg border border-line bg-black/15">
                <img
                  src={style.referenceImageUrl}
                  alt=""
                  className="max-h-[22rem] w-full object-contain"
                />
              </div>
            ) : (
              <div className="mb-2 grid min-h-[10rem] place-items-center rounded-lg border border-dashed border-line text-[11px] text-ink/40">
                尚未上传参考图
              </div>
            )}
            <MediaSlot
              label="参考图（可选）"
              url={style.referenceImageUrl}
              accept="image/*"
              onUpload={(file) => {
                if (locked || !onUploadReference) return;
                void onUploadReference(file);
              }}
              hint={locked ? '内置/只读' : undefined}
            />
          </div>
        </div>
      </aside>
    </div>
  );
}

export type AssetDetailKind = AssetLibraryKind;

