import { useMemo, useState, type ReactNode } from 'react';
import type { BacklotWorkspaceItem, CharacterProfile, SoundAssetProfile } from '@nx9/shared';
import {
  CHARACTER_BIBLE_LAYERS,
  CHARACTER_SHEET_PROMPT_TEMPLATE,
  CAC_HOOK_TYPES,
  CAC_SHOT_SIZES,
  CAC_VOICE_EMOTIONS,
  CAC_VOICE_GENDERS,
  MAX_ENV_REFERENCE_IMAGES,
  SCENE_SHEET_PROMPT_TEMPLATE,
  buildCostumeSheetGenerationPrompt,
  COSTUME_SHEET_PROMPT_TEMPLATE,
  formatAssetMention,
  getCharacterCreative,
  getCostumeCreative,
  getEmotionCreative,
  getHookCreative,
  getSceneCreative,
  getShotCreative,
  getVoiceCreative,
  type AssetLibraryKind,
} from '@nx9/shared';
import { X } from 'lucide-react';
import { DetailSection, Field, TextInput, TextArea, PromptPanel, MediaSlot, ChipList, VariantGrid } from './detail-primitives';
import { ImageLightbox } from '../../components/ui/ImageLightbox';
import { ScreenplaySupportPanel } from './ScreenplaySupportPanel';

type UploadHandler = (file: File) => void | Promise<void>;

function copyText(text: string) {
  void navigator.clipboard.writeText(text);
}

// ─── Character ───────────────────────────────────────────────

export interface CharacterDetailFieldsProps {
  character: CharacterProfile;
  onChange: (next: CharacterProfile) => void;
  onRefreshPrompts: () => void;
  onUploadImage: UploadHandler;
  onUploadAudio: UploadHandler;
  onUploadView: (view: string, file: File) => void;
  /** 可绑定的服装库条目 */
  costumeOptions?: Array<{ id: string; label: string; prompt: string }>;
  /** 一键生成角色设定板并裁切回填 */
  onGenerateMasterSheet?: () => void;
  generatingMasterSheet?: boolean;
  masterSheetProgress?: string | null;
  /** 出图参数（模型/清晰度/质量/比例） */
  genSettingsSlot?: ReactNode;
}

export function CharacterDetailFields({
  character: c,
  onChange,
  onRefreshPrompts,
  onUploadImage,
  onUploadAudio,
  onUploadView,
  costumeOptions = [],
  onGenerateMasterSheet,
  generatingMasterSheet = false,
  masterSheetProgress = null,
  genSettingsSlot,
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
  const locked = Boolean(ext.consistency?.locked || ext.viewsLocked);
  const promptVersion = prompts.bible?.version ?? 1;

  const [headerPreviewOpen, setHeaderPreviewOpen] = useState(false);
  const characterImageGallery = useMemo(() => {
    const items: Array<{ url: string; label: string }> = [];
    const push = (url?: string | null, label?: string) => {
      const u = url?.trim();
      if (!u) return;
      if (items.some((x) => x.url === u)) return;
      items.push({ url: u, label: label || '角色图' });
    };
    push(c.referenceImageUrl, '主参考');
    push(ext.fullSheetUrl, '完整设定板');
    push(ext.frontViewUrl, '正面站姿');
    push(ext.threeQuarterViewUrl, '3/4 站姿');
    push(ext.sideViewUrl, '侧面站姿');
    push(ext.backViewUrl, '背面站姿');
    push(ext.silhouetteFrontUrl, '剪影正面');
    push(ext.silhouetteSideUrl, '剪影侧面');
    push(ext.emotionalCloseupUrl, '情绪特写');
    for (const v of ext.expressions ?? []) push(v.imageUrl, `表情·${v.label}`);
    for (const v of ext.microExpressions ?? []) push(v.imageUrl, `微表情·${v.label}`);
    for (const v of ext.angles ?? []) push(v.imageUrl, `头部·${v.label}`);
    for (const v of ext.poses ?? []) push(v.imageUrl, `姿态·${v.label}`);
    for (const v of ext.costumeDetails ?? []) push(v.imageUrl, `细节·${v.label}`);
    for (const v of ext.handRefs ?? []) push(v.imageUrl, `手部·${v.label}`);
    return items;
  }, [c.referenceImageUrl, ext]);


  return (
    <div className="max-w-2xl space-y-3">
      <ScreenplaySupportPanel kind="character" name={c.name} />
      <div className="rounded-2xl border border-line bg-white p-3">
        <div className="flex items-start gap-3">
          <div className="h-16 w-12 overflow-hidden rounded-xl border border-line bg-surface">
            {(c.referenceImageUrl || ext.fullSheetUrl || ext.frontViewUrl) ? (
              <button
                type="button"
                className="group relative h-full w-full"
                onClick={() => setHeaderPreviewOpen(true)}
                title="放大查看角色参考"
              >
                <img src={(c.referenceImageUrl || ext.fullSheetUrl || ext.frontViewUrl) ?? ''} alt="" className="h-full w-full object-cover" />
                <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/25">
                  <span className="text-[9px] text-white opacity-0 drop-shadow transition group-hover:opacity-100">放大</span>
                </span>
              </button>
            ) : (
              <div className="grid h-full place-items-center text-[9px] text-ink/30">无图</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <input
              value={c.name}
              onChange={(e) => patch({ name: e.target.value })}
              className="w-full border-b border-line pb-1 text-sm font-semibold focus:outline-none"
              placeholder="角色名 / @引用名"
            />
            <p className="mt-1 text-[10px] text-ink/45">
              角色库是设定主入口；图片生成请在画布使用「图像生成」节点。
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${anchorCount >= 4 ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>
                健康度 {anchorCount}/4
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${locked ? 'bg-brand/10 text-brand' : 'bg-surface text-ink/45'}`}>
                {locked ? '已锁定' : '未锁定'}
              </span>
              <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink/45">Prompt v{promptVersion}</span>
            </div>
          </div>
        </div>
      </div>

      <DetailSection title="核心一致性">
        <div className="grid grid-cols-2 gap-2">
          <Field label="身份/职业">
            <TextInput value={ext.identityRole ?? ext.occupation ?? ''} onChange={(v) => patchCreative({ identityRole: v, occupation: ext.occupation })} placeholder="女主 / 刑警 / 高中生" />
          </Field>
          <Field label="昵称">
            <TextInput value={ext.nickname ?? ''} onChange={(v) => patchCreative({ nickname: v })} placeholder="林先生 / 老林" />
          </Field>
        </div>
        <Field label="别名 / 剧中称呼（逗号分隔，用于防重复匹配）">
          <TextInput
            value={(ext.aliases ?? []).join('、')}
            onChange={(v) => patchCreative({ aliases: v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) })}
            placeholder="老林、林侦探、林先生、阿默"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="标签">
            <TextInput value={(c.tags ?? []).join('、')} onChange={(v) => patch({ tags: v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) })} />
          </Field>
        </div>
        <Field label="固定外貌锚点（防 Prompt 漂移）">
          <TextArea
            value={bible.appearance ?? ''}
            onChange={(v) => patchBible('appearance', v)}
            rows={3}
            placeholder="发型、脸型、瞳色、身形、标志物、服装轮廓、颜色…"
          />
        </Field>
        <Field label="性格/表演边界">
          <TextArea value={bible.personality ?? ext.personalityText ?? ''} onChange={(v) => patchBible('personality', v)} rows={2} />
        </Field>
        <Field label="一致性 Prompt（注入图像/视频生成）">
          <TextArea value={c.consistencyPrompt ?? ext.consistency?.consistencyPrompt ?? ''} onChange={(v) => patch({ consistencyPrompt: v })} rows={4} mono />
        </Field>
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
      </DetailSection>

      <DetailSection title="角色设定板 · 一键生成">
        <p className="text-[10px] leading-relaxed text-ink/50">
          使用生产级 Character Master Sheet 提示词（锁定角色 ID）。生成整板后自动裁切并回填：主身份四视图、剪影、8 表情、5 微表情、头部多角度、姿态、特写、服装细节、手部动作。
        </p>
        {genSettingsSlot ? <div className="mb-2">{genSettingsSlot}</div> : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!onGenerateMasterSheet || generatingMasterSheet}
            onClick={() => onGenerateMasterSheet?.()}
            className="rounded-lg border border-brand/30 bg-brand/5 px-3 py-1.5 text-[11px] font-medium text-brand hover:border-brand/50 disabled:opacity-45"
          >
            {generatingMasterSheet ? (masterSheetProgress || '生成并裁切中…') : '一键生成角色设定板'}
          </button>
          <button
            type="button"
            className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-ink/60 hover:border-brand/40"
            onClick={onRefreshPrompts}
          >
            刷新一致性 Prompt
          </button>
        </div>
      </DetailSection>

      <DetailSection title="参考资产 · 主身份 / 剪影 / 特写">
        <div className="grid grid-cols-4 gap-2">
          <MediaSlot label="主参考" url={c.referenceImageUrl} accept="image/*" onUpload={onUploadImage} gallery={characterImageGallery} />
          <MediaSlot label="完整设定板" url={ext.fullSheetUrl} accept="image/*" onUpload={(f) => onUploadView('full', f)} gallery={characterImageGallery} />
          <MediaSlot label="正面站姿" url={ext.frontViewUrl} accept="image/*" onUpload={(f) => onUploadView('front', f)} gallery={characterImageGallery} />
          <MediaSlot label="3/4 站姿" url={ext.threeQuarterViewUrl} accept="image/*" onUpload={(f) => onUploadView('threeQuarter', f)} gallery={characterImageGallery} />
          <MediaSlot label="侧面站姿" url={ext.sideViewUrl} accept="image/*" onUpload={(f) => onUploadView('side', f)} gallery={characterImageGallery} />
          <MediaSlot label="背面站姿" url={ext.backViewUrl} accept="image/*" onUpload={(f) => onUploadView('back', f)} gallery={characterImageGallery} />
          <MediaSlot label="剪影正面" url={ext.silhouetteFrontUrl} accept="image/*" onUpload={(f) => onUploadView('silhouetteFront', f)} gallery={characterImageGallery} />
          <MediaSlot label="剪影侧面" url={ext.silhouetteSideUrl} accept="image/*" onUpload={(f) => onUploadView('silhouetteSide', f)} gallery={characterImageGallery} />
          <MediaSlot label="情绪特写" url={ext.emotionalCloseupUrl} accept="image/*" onUpload={(f) => onUploadView('emotionalCloseup', f)} gallery={characterImageGallery} />
        </div>
        <label className="flex items-center gap-2 text-[10px] text-ink/55">
          <input
            type="checkbox"
            checked={locked}
            onChange={(e) => patchCreative({
              viewsLocked: e.target.checked,
              consistency: { ...ext.consistency, locked: e.target.checked },
            })}
          />
          锁定角色资产：被引用时禁止静默替换主参考/三视图/一致性 Prompt
        </label>
      </DetailSection>

      <DetailSection title="表情系统 (8)">
        <VariantGrid
          title="平静 / 好奇 / 紧张 / 惊讶 / 害怕 / 悲伤 / 坚定 / 放松"
          items={ext.expressions ?? []}
          columns={4}
          onChangeItem={(id, patch) => {
            const next = (ext.expressions ?? []).map((item) => item.id === id ? { ...item, ...patch } : item);
            patchCreative({ expressions: next });
          }}
          sharedGallery={characterImageGallery}
            onUploadItem={(id, file) => onUploadView(`expr:${id}`, file)}
        />
      </DetailSection>

      <DetailSection title="微表情 (5)">
        <VariantGrid
          title="眼部紧张 / 微笑 / 嘴部用力 / 微恐惧 / 呼吸控制"
          items={ext.microExpressions ?? []}
          columns={5}
          onChangeItem={(id, patch) => {
            const next = (ext.microExpressions ?? []).map((item) => item.id === id ? { ...item, ...patch } : item);
            patchCreative({ microExpressions: next });
          }}
          sharedGallery={characterImageGallery}
            onUploadItem={(id, file) => onUploadView(`micro:${id}`, file)}
        />
      </DetailSection>

      <DetailSection title="头部结构 / 姿态">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <VariantGrid
            title="头部多角度"
            items={ext.angles ?? []}
            columns={3}
            onChangeItem={(id, patch) => {
              const next = (ext.angles ?? []).map((item) => item.id === id ? { ...item, ...patch } : item);
              patchCreative({ angles: next });
            }}
            sharedGallery={characterImageGallery}
            onUploadItem={(id, file) => onUploadView(`angle:${id}`, file)}
          />
          <VariantGrid
            title="姿态变化"
            items={ext.poses ?? []}
            columns={3}
            onChangeItem={(id, patch) => {
              const next = (ext.poses ?? []).map((item) => item.id === id ? { ...item, ...patch } : item);
              patchCreative({ poses: next });
            }}
            sharedGallery={characterImageGallery}
            onUploadItem={(id, file) => onUploadView(`pose:${id}`, file)}
          />
        </div>
      </DetailSection>

      <DetailSection title="服装细节 / 手部动作">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <VariantGrid
            title="发型 / 材质 / 配饰 / 鞋"
            items={ext.costumeDetails ?? []}
            columns={4}
            onChangeItem={(id, patch) => {
              const next = (ext.costumeDetails ?? []).map((item) => item.id === id ? { ...item, ...patch } : item);
              patchCreative({ costumeDetails: next });
            }}
            sharedGallery={characterImageGallery}
            onUploadItem={(id, file) => onUploadView(`costumeDetail:${id}`, file)}
          />
          <VariantGrid
            title="放松 / 紧张 / 指向 / 抓握 / 触脸"
            items={ext.handRefs ?? []}
            columns={5}
            onChangeItem={(id, patch) => {
              const next = (ext.handRefs ?? []).map((item) => item.id === id ? { ...item, ...patch } : item);
              patchCreative({ handRefs: next });
            }}
            sharedGallery={characterImageGallery}
            onUploadItem={(id, file) => onUploadView(`hand:${id}`, file)}
          />
        </div>
      </DetailSection>

      <DetailSection title="绑定服装库">
        <Field label="当前套装">
          <select
            className="w-full rounded-lg border border-line bg-white px-2 py-1.5 text-xs"
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
            ；出图时会注入 Costume lock。
          </p>
        ) : (
          <p className="text-[10px] text-ink/40">从服装库选择套装，保持角色跨镜服装一致。</p>
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
      </DetailSection>

      <DetailSection title="AI 自动补全 / 版本">
        <PromptPanel
          label="角色一致性 Prompt"
          value={prompts.bible?.text ?? c.consistencyPrompt ?? ''}
          onChange={(v) => patchCreative({ prompts: { ...prompts, bible: { version: 1, text: v, updatedAt: Date.now() } } })}
          onRegenerate={onRefreshPrompts}
          onCopy={() => copyText(prompts.bible?.text ?? c.consistencyPrompt ?? '')}
        />
      </DetailSection>

      <p className="text-[10px] text-brand/70">
        引用 <code className="rounded bg-surface px-1">@角色:{c.name}</code>；生成时由图像/视频节点读取该资产。点击任意图片可放大浏览全部角色图。
      </p>
      <ImageLightbox
        open={headerPreviewOpen}
        items={characterImageGallery}
        index={Math.max(0, characterImageGallery.findIndex((g) => g.url === (c.referenceImageUrl || ext.fullSheetUrl || ext.frontViewUrl)))}
        onClose={() => setHeaderPreviewOpen(false)}
      />
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
  onRemoveRef,
}: {
  item: BacklotWorkspaceItem;
  onChange: (next: BacklotWorkspaceItem) => void;
  onRefreshPrompts: () => void;
  onUploadRef: UploadHandler;
  onUploadSheet: UploadHandler;
  /** 删除多参考图中的某一张（自场景节点迁入） */
  onRemoveRef?: (index: number) => void;
}) {
  const ext = getSceneCreative(item);
  const patch = (p: Partial<BacklotWorkspaceItem>) => onChange({ ...item, ...p });
  const patchExt = (p: Partial<typeof ext>) => onChange({ ...item, creative: { ...ext, ...p } });
  const promptVersion = ext.prompts?.scene?.version ?? 1;
  const locked = Boolean(ext.locked);
  const refs = ext.referenceUrls ?? [];
  const health = [
    item.label?.trim(),
    (ext.description || item.promptZh)?.trim(),
    (ext.lighting || ext.timeOfDay || ext.weather)?.trim(),
    refs[0] || ext.sheetUrl,
  ].filter(Boolean).length;

  return (
    <div className="max-w-2xl space-y-3">
      <ScreenplaySupportPanel kind="scene" name={item.label} />
      <div className="rounded-2xl border border-line bg-white p-3">
        <div className="flex items-start gap-3">
          <div className="h-14 w-20 overflow-hidden rounded-xl border border-line bg-surface">
            {(refs[0] || ext.sheetUrl) ? (
              <img src={(refs[0] || ext.sheetUrl) ?? ''} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <input
              value={item.label}
              onChange={(e) => patch({ label: e.target.value })}
              className="w-full border-b border-line pb-1 text-sm font-semibold focus:outline-none"
              placeholder="场景名 / @引用名"
            />
            <p className="mt-1 text-[10px] text-ink/45">
              场景设定主入口在素材库；保存后同步到环境圣经，供分镜 / 出图 / Playbook 使用。
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${health >= 4 ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>健康度 {health}/4</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${locked ? 'bg-brand/10 text-brand' : 'bg-surface text-ink/45'}`}>{locked ? '已锁定' : '未锁定'}</span>
              <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink/45">参考 {refs.length}/{MAX_ENV_REFERENCE_IMAGES}</span>
              <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink/45">Prompt v{promptVersion}</span>
            </div>
          </div>
        </div>
      </div>

      <DetailSection title="核心一致性">
        <div className="grid grid-cols-2 gap-2">
          <Field label="场景码（与分镜 sceneCode 对齐）">
            <TextInput value={ext.sceneCode ?? ''} onChange={(v) => patchExt({ sceneCode: v })} placeholder="S01 / INT-CAFE…" />
          </Field>
          <Field label="时代/世界观">
            <TextInput value={ext.worldView ?? ext.timeOfDay ?? ''} onChange={(v) => patchExt({ worldView: v, timeOfDay: v })} placeholder="现代都市 / 民国…" />
          </Field>
        </div>
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
        <Field label="固定道具 / 结构锚点">
          <TextInput
            value={(ext.props ?? []).join('、')}
            onChange={(v) => patchExt({ props: v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) })}
            placeholder="吧台、霓虹招牌、木质桌…"
          />
        </Field>
        <Field label="场景 Prompt（注入图像/视频生成）">
          <TextArea value={item.promptEn || ext.prompts?.scene?.text || ''} onChange={(v) => patch({ promptEn: v })} rows={4} mono />
        </Field>
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
      </DetailSection>

      <DetailSection title={`参考资产（最多 ${MAX_ENV_REFERENCE_IMAGES} 张）`}>
        <p className="text-[10px] text-ink/45">
          多参考图写入环境圣经 `referenceUrls`，出图 / 导演台可取首图做 img2img。设定总览图单独存 sheet。
        </p>
        <div className="grid grid-cols-3 gap-2">
          {refs.length < MAX_ENV_REFERENCE_IMAGES ? (
            <MediaSlot label="添加参考图" url={undefined} accept="image/*" onUpload={onUploadRef} />
          ) : null}
          <MediaSlot label="场景设定图" url={ext.sheetUrl} accept="image/*" onUpload={onUploadSheet} />
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
        <label className="flex items-center gap-2 text-[10px] text-ink/55">
          <input type="checkbox" checked={locked} onChange={(e) => patchExt({ locked: e.target.checked })} />
          锁定场景资产：被引用时禁止静默替换参考图/空间锚点/Prompt
        </label>
      </DetailSection>

      <DetailSection title="AI 自动补全 / 版本">
        <PromptPanel
          label="场景一致性 Prompt"
          value={ext.prompts?.scene?.text ?? item.promptEn ?? ''}
          negative={ext.prompts?.negative?.text ?? ext.forbiddenDrift}
          onChange={(v) => patchExt({ prompts: { ...ext.prompts, scene: { version: 1, text: v, updatedAt: Date.now() } } })}
          onChangeNegative={(v) => patchExt({
            forbiddenDrift: v,
            prompts: { ...ext.prompts, negative: { version: 1, text: v, updatedAt: Date.now() } },
          })}
          onRegenerate={onRefreshPrompts}
          onCopy={() => copyText(ext.prompts?.scene?.text ?? item.promptEn ?? '')}
        />
      </DetailSection>

      <DetailSection title="创作推荐（可选）">
        {(
          [
            ['recommendedCharacters', '推荐角色'],
            ['recommendedShots', '推荐镜头'],
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

      <p className="text-[10px] text-brand/70">
        引用 <code className="rounded bg-surface px-1">{formatAssetMention('scene', item.label)}</code>；生成时由图像/视频节点读取该资产。
      </p>
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
    <div className="space-y-1 max-w-2xl">
      <input
        value={item.label}
        onChange={(e) => patch({ label: e.target.value })}
        className="w-full font-semibold text-sm border-b border-line pb-1 focus:outline-none"
      />
      <DetailSection title="镜头信息">
        <Field label="用途">
          <TextInput value={ext.purpose ?? ''} onChange={(v) => patchExt({ purpose: v })} />
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
                className={`text-[10px] px-2 py-0.5 rounded-full border ${
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
        <Field label="推荐情绪">
          <TextInput value={ext.recommendedEmotion ?? ''} onChange={(v) => patchExt({ recommendedEmotion: v })} />
        </Field>
        <label className="flex items-center gap-2 text-[10px] text-ink/50">
          <input type="checkbox" checked={!!ext.favorite} onChange={(e) => patchExt({ favorite: e.target.checked })} />
          收藏
        </label>
      </DetailSection>
      <DetailSection title="预览素材">
        <div className="grid grid-cols-2 gap-2">
          <MediaSlot label="GIF 预览" url={ext.gifUrl} accept="image/gif,image/*" onUpload={onUploadGif} />
          <MediaSlot label="示例图" url={ext.exampleImageUrl} accept="image/*" onUpload={onUploadExample} />
        </div>
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
        引用 <code className="bg-surface px-1 rounded">{formatAssetMention('shot', item.label)}</code>
      </p>
    </div>
  );
}

// ─── Emotion ───────────────────────────────────────────────

export function EmotionDetailFields({
  item,
  onChange,
  onRefreshPrompts,
  onUploadImage,
}: {
  item: BacklotWorkspaceItem;
  onChange: (next: BacklotWorkspaceItem) => void;
  onRefreshPrompts: () => void;
  onUploadImage: UploadHandler;
}) {
  const ext = getEmotionCreative(item);
  const patch = (p: Partial<BacklotWorkspaceItem>) => onChange({ ...item, ...p });
  const patchExt = (p: Partial<typeof ext>) => onChange({ ...item, creative: { ...ext, ...p } });

  return (
    <div className="space-y-1 max-w-2xl">
      <input
        value={item.label}
        onChange={(e) => patch({ label: e.target.value })}
        className="w-full font-semibold text-sm border-b border-line pb-1 focus:outline-none"
      />
      <DetailSection title="情绪状态">
        <MediaSlot label="参考图" url={ext.imageUrl} accept="image/*" onUpload={onUploadImage} />
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
        <label className="flex items-center gap-2 text-[10px] text-ink/50">
          <input type="checkbox" checked={!!ext.favorite} onChange={(e) => patchExt({ favorite: e.target.checked })} />
          收藏
        </label>
      </DetailSection>
      <DetailSection title="Emotion Prompt">
        <PromptPanel
          label="结构化 Emotion Prompt"
          value={ext.prompts?.emotion?.text ?? ''}
          onChange={(v) =>
            patchExt({ prompts: { emotion: { version: 1, text: v, updatedAt: Date.now() } } })
          }
          onRegenerate={onRefreshPrompts}
          onCopy={() => copyText(ext.prompts?.emotion?.text ?? '')}
        />
      </DetailSection>
      <p className="text-[10px] text-brand/70">
        引用 <code className="bg-surface px-1 rounded">{formatAssetMention('emotion', item.label)}</code>
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
  onGenerateSheet,
  generatingSheet = false,
  genSettingsSlot,
}: {
  item: BacklotWorkspaceItem;
  onChange: (next: BacklotWorkspaceItem) => void;
  onRefreshPrompts: () => void;
  onUploadRef: UploadHandler;
  onUploadSheet: UploadHandler;
  /** 通过画布连接的图像生成节点批量/单件出设定板 */
  onGenerateSheet?: () => void;
  generatingSheet?: boolean;
  genSettingsSlot?: ReactNode;
}) {
  const ext = getCostumeCreative(item);
  const [costumePreviewOpen, setCostumePreviewOpen] = useState(false);
  const patch = (p: Partial<BacklotWorkspaceItem>) => onChange({ ...item, ...p });
  const patchExt = (p: Partial<typeof ext>) => onChange({ ...item, creative: { ...ext, ...p } });
  const promptVersion = ext.prompts?.costume?.version ?? ext.prompts?.image?.version ?? 1;
  const locked = Boolean(ext.locked);
  const cover = ext.sheetUrl || ext.referenceUrls?.[0] || '';
  const health = [
    item.label?.trim(),
    (ext.description || item.promptZh || item.promptEn)?.trim(),
    (ext.colorPalette || ext.materials || ext.silhouette)?.trim(),
    cover,
  ].filter(Boolean).length;

  return (
    <div className="max-w-2xl space-y-3">
      <div className="rounded-2xl border border-line bg-white p-3">
        <div className="flex items-start gap-3">
          <div className="h-14 w-20 overflow-hidden rounded-xl border border-line bg-surface">
            {cover ? (
              <button type="button" className="h-full w-full" onClick={() => setCostumePreviewOpen(true)} title="放大查看服装参考">
                <img src={cover} alt="" className="h-full w-full object-cover" />
              </button>
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <input
              value={item.label}
              onChange={(e) => patch({ label: e.target.value })}
              className="w-full border-b border-line pb-1 text-sm font-semibold focus:outline-none"
              placeholder="服装名 / @服装:名称"
            />
            <p className="mt-1 text-[10px] text-ink/45">
              服装库维护跨镜造型一致性；角色可引用套装，出图时注入服装锚点。
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${health >= 4 ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>
                健康度 {health}/4
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${locked ? 'bg-brand/10 text-brand' : 'bg-surface text-ink/45'}`}>
                {locked ? '已锁定' : '未锁定'}
              </span>
              <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink/45">Prompt v{promptVersion}</span>
            </div>
          </div>
        </div>
      </div>

      <DetailSection title="核心造型">
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
      </DetailSection>

      <DetailSection title="单品拆解">
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
      </DetailSection>

      <DetailSection title="生成 Prompt">
        <p className="text-[10px] text-ink/45 mb-1">
          刷新后会生成服装 bible + 出图 Prompt；可直接 @服装:名称 注入节点。
        </p>
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
        {genSettingsSlot ? <div className="mb-2">{genSettingsSlot}</div> : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink/70 hover:border-brand/40" onClick={onRefreshPrompts}>
            刷新专业 Prompt
          </button>
          {onGenerateSheet ? (
            <button
              type="button"
              className="rounded-lg border border-brand/30 bg-brand/5 px-2.5 py-1 text-[11px] text-brand hover:border-brand/50 disabled:opacity-45"
              disabled={generatingSheet}
              onClick={onGenerateSheet}
              title="需在画布连接「图像生成」节点；素材库会请求最近的角色设定/分镜台连接链路，或使用全局可用图像节点"
            >
              {generatingSheet ? '设定板生成中…' : '生成服装设定板'}
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink/70 hover:border-brand/40"
            onClick={() => patchExt({ locked: !locked })}
          >
            {locked ? '解锁造型' : '锁定造型'}
          </button>
          <button
            type="button"
            className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink/70 hover:border-brand/40"
            onClick={() => copyText(item.promptEn || ext.prompts?.costume?.text || '')}
          >
            复制 Prompt
          </button>
        </div>
        <p className="text-[10px] text-ink/45">
          引用 <code className="rounded bg-surface px-1">{formatAssetMention('costume', item.label)}</code>
          ；角色设定可绑定该服装以保持跨镜一致。
        </p>
      </DetailSection>

      <DetailSection title="参考资产">
        <p className="text-[10px] text-ink/45">
          设定板 Prompt 基于服装 bible + 生产级 sheet 模板；生成后写入「服装设定板」。
        </p>
        <div className="grid grid-cols-2 gap-2">
          <MediaSlot label="服装设定板" url={ext.sheetUrl} accept="image/*" onUpload={onUploadSheet} />
          <MediaSlot label="参考图" url={ext.referenceUrls?.[0]} accept="image/*" onUpload={onUploadRef} />
        </div>
        <label className="flex items-center gap-2 text-[10px] text-ink/55">
          <input
            type="checkbox"
            checked={locked}
            onChange={(e) => patchExt({ locked: e.target.checked })}
          />
          锁定服装资产：被引用时禁止静默替换造型锚点 / Prompt / 参考图
        </label>
      </DetailSection>
    </div>
  );
}


// ─── Voice ─────────────────────────────────────────────────

export function VoiceDetailFields({
  sound,
  onChange,
  onRefreshPrompts,
  onUploadAudio,
}: {
  sound: SoundAssetProfile;
  onChange: (next: SoundAssetProfile) => void;
  onRefreshPrompts: () => void;
  onUploadAudio: UploadHandler;
}) {
  const ext = getVoiceCreative(sound);
  const patch = (p: Partial<SoundAssetProfile>) => onChange({ ...sound, ...p });
  const patchExt = (p: Partial<typeof ext>) => onChange({ ...sound, creative: { ...ext, ...p } });

  return (
    <div className="space-y-1 max-w-2xl">
      <input
        value={sound.name}
        onChange={(e) => patch({ name: e.target.value })}
        className="w-full font-semibold text-sm border-b border-line pb-1 focus:outline-none"
      />
      <DetailSection title="音色信息">
        <Field label="描述">
          <TextArea value={sound.description ?? ''} onChange={(v) => patch({ description: v })} rows={2} />
        </Field>
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
              onChange={(e) => patchExt({ gender: e.target.value })}
              className="w-full text-xs rounded-lg border border-line px-2 py-1.5"
            >
              <option value="">选择</option>
              {CAC_VOICE_GENDERS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="语速">
            <TextInput value={ext.speed ?? ''} onChange={(v) => patchExt({ speed: v })} placeholder="正常 / 快 / 慢" />
          </Field>
          <Field label="情绪">
            <select
              value={ext.emotion ?? ''}
              onChange={(e) => patchExt({ emotion: e.target.value })}
              className="w-full text-xs rounded-lg border border-line px-2 py-1.5"
            >
              <option value="">选择</option>
              {CAC_VOICE_EMOTIONS.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </Field>
          <Field label="语言">
            <TextInput value={ext.language ?? ''} onChange={(v) => patchExt({ language: v })} placeholder="中文 / 英文" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-[10px] text-ink/50">
          <input type="checkbox" checked={!!ext.favorite} onChange={(e) => patchExt({ favorite: e.target.checked })} />
          收藏
        </label>
      </DetailSection>
      <DetailSection title="试听">
        <MediaSlot label="音频文件" url={sound.audioUrl} accept="audio/*" onUpload={onUploadAudio} hint="上传音频" />
        {sound.audioUrl && (
          <audio src={sound.audioUrl} controls className="w-full max-w-sm mt-2" />
        )}
      </DetailSection>
      <DetailSection title="Voice Prompt">
        <PromptPanel
          label="结构化 Voice Prompt"
          value={ext.prompts?.voice?.text ?? ''}
          onChange={(v) =>
            patchExt({ prompts: { voice: { version: 1, text: v, updatedAt: Date.now() } } })
          }
          onRegenerate={onRefreshPrompts}
          onCopy={() => copyText(ext.prompts?.voice?.text ?? '')}
        />
      </DetailSection>
      <p className="text-[10px] text-brand/70">
        引用 <code className="bg-surface px-1 rounded">@声音:{sound.name}</code>
      </p>
    </div>
  );
}

export type AssetDetailKind = AssetLibraryKind;

