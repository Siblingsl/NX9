import type { BacklotWorkspaceItem, CharacterProfile, SoundAssetProfile } from '@nx9/shared';
import {
  CHARACTER_BIBLE_LAYERS,
  CHARACTER_SHEET_PROMPT_TEMPLATE,
  CAC_HOOK_TYPES,
  CAC_SHOT_SIZES,
  CAC_VOICE_EMOTIONS,
  CAC_VOICE_GENDERS,
  SCENE_SHEET_PROMPT_TEMPLATE,
  formatAssetMention,
  getCharacterCreative,
  getEmotionCreative,
  getHookCreative,
  getSceneCreative,
  getShotCreative,
  getVoiceCreative,
  type AssetLibraryKind,
} from '@nx9/shared';
import { DetailSection, Field, TextInput, TextArea, PromptPanel, MediaSlot, ChipList, VariantGrid } from './detail-primitives';

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
  onUploadView: (view: 'full' | 'front' | 'side' | 'back', file: File) => void;
}

export function CharacterDetailFields({
  character: c,
  onChange,
  onRefreshPrompts,
  onUploadImage,
  onUploadAudio,
  onUploadView,
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

  return (
    <div className="max-w-2xl space-y-3">
      <div className="rounded-2xl border border-line bg-white p-3">
        <div className="flex items-start gap-3">
          <div className="h-16 w-12 overflow-hidden rounded-xl border border-line bg-surface">
            {(c.referenceImageUrl || ext.fullSheetUrl || ext.frontViewUrl) ? (
              <img src={(c.referenceImageUrl || ext.fullSheetUrl || ext.frontViewUrl) ?? ''} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <input
              value={c.name}
              onChange={(e) => patch({ name: e.target.value })}
              className="w-full border-b border-line pb-1 text-sm font-semibold focus:outline-none"
              placeholder="角色名 / @引用名"
            />
            <p className="mt-1 text-[10px] text-ink/45">
              角色库只维护一致性资产；图片生成请连接「图像生成」节点。
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

      <DetailSection title="参考资产">
        <div className="grid grid-cols-4 gap-2">
          <MediaSlot label="主参考" url={c.referenceImageUrl} accept="image/*" onUpload={onUploadImage} />
          <MediaSlot label="设定图" url={ext.fullSheetUrl} accept="image/*" onUpload={(f) => onUploadView('full', f)} />
          <MediaSlot label="正面" url={ext.frontViewUrl} accept="image/*" onUpload={(f) => onUploadView('front', f)} />
          <MediaSlot label="侧面" url={ext.sideViewUrl} accept="image/*" onUpload={(f) => onUploadView('side', f)} />
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
        引用 <code className="rounded bg-surface px-1">@角色:{c.name}</code>；生成时由图像/视频节点读取该资产。
      </p>
    </div>
  );

  return (
    <div className="space-y-1 max-w-2xl">
      <input
        value={c.name}
        onChange={(e) => patch({ name: e.target.value })}
        className="w-full font-semibold text-sm border-b border-line pb-1 focus:outline-none"
      />

      <DetailSection title="基础信息">
        <div className="grid grid-cols-2 gap-2">
          <Field label="昵称">
            <TextInput value={ext.nickname ?? ''} onChange={(v) => patchCreative({ nickname: v })} />
          </Field>
          <Field label="年龄">
            <TextInput value={ext.age ?? ''} onChange={(v) => patchCreative({ age: v })} />
          </Field>
          <Field label="身高">
            <TextInput value={ext.height ?? ''} onChange={(v) => patchCreative({ height: v })} />
          </Field>
          <Field label="体重">
            <TextInput value={ext.weight ?? ''} onChange={(v) => patchCreative({ weight: v })} />
          </Field>
          <Field label="职业">
            <TextInput value={ext.occupation ?? ''} onChange={(v) => patchCreative({ occupation: v })} />
          </Field>
          <Field label="身份">
            <TextInput value={ext.identityRole ?? ''} onChange={(v) => patchCreative({ identityRole: v })} />
          </Field>
        </div>
        <Field label="简介">
          <TextArea value={c.descriptionZh ?? ''} onChange={(v) => patch({ descriptionZh: v })} rows={2} />
        </Field>
        <Field label="性格">
          <TextArea value={ext.personalityText ?? ''} onChange={(v) => patchCreative({ personalityText: v })} rows={2} />
        </Field>
        <Field label="背景故事">
          <TextArea value={ext.backgroundStory ?? ''} onChange={(v) => patchCreative({ backgroundStory: v })} rows={2} />
        </Field>
        <Field label="人物标签（逗号分隔）">
          <TextInput
            value={(c.tags ?? []).join(', ')}
            onChange={(v) => patch({ tags: v.split(/[,，]/).map((s) => s.trim()).filter(Boolean) })}
          />
        </Field>
        <Field label="所属世界观">
          <TextInput value={ext.worldView ?? ''} onChange={(v) => patchCreative({ worldView: v })} />
        </Field>
      </DetailSection>

      <DetailSection title="Character Bible 六层锚点">
        {CHARACTER_BIBLE_LAYERS.map((layer) => (
          <Field key={layer.key} label={layer.label}>
            <TextArea
              value={(bible[layer.key] as string | undefined) ?? ''}
              onChange={(v) => patchBible(layer.key, v)}
              placeholder={layer.placeholder}
              rows={2}
            />
          </Field>
        ))}
      </DetailSection>

      <DetailSection title="总体设定图 & 三视图">
        <div className="grid grid-cols-2 gap-2">
          <MediaSlot label="Character Sheet（总体设定图）" url={ext.fullSheetUrl} accept="image/*" onUpload={(f) => onUploadView('full', f)} />
          <MediaSlot label="参考图（主参考）" url={c.referenceImageUrl} accept="image/*" onUpload={onUploadImage} />
          <MediaSlot label="正面 Front" url={ext.frontViewUrl} accept="image/*" onUpload={(f) => onUploadView('front', f)} />
          <MediaSlot label="侧面 Side" url={ext.sideViewUrl} accept="image/*" onUpload={(f) => onUploadView('side', f)} />
          <MediaSlot label="背面 Back" url={ext.backViewUrl} accept="image/*" onUpload={(f) => onUploadView('back', f)} />
          <MediaSlot label="克隆参考音" url={c.referenceAudioUrl} accept="audio/*" onUpload={onUploadAudio} hint="上传音频" />
        </div>
        <label className="flex items-center gap-2 text-[10px] text-ink/50">
          <input
            type="checkbox"
            checked={!!ext.viewsLocked}
            onChange={(e) => patchCreative({ viewsLocked: e.target.checked })}
          />
          锁定三视图（防止误替换）
        </label>
        <p className="text-[10px] text-ink/35 font-mono leading-relaxed">{CHARACTER_SHEET_PROMPT_TEMPLATE.slice(0, 120)}…</p>
      </DetailSection>

      <DetailSection title="人物数据">
        <div className="grid grid-cols-3 gap-2">
          {(['bust', 'waist', 'hip', 'shoulderWidth', 'legLength', 'handLength', 'footLength'] as const).map((key) => (
            <Field key={key} label={key}>
              <TextInput
                value={ext.bodyMetrics?.[key] ?? ''}
                onChange={(v) =>
                  patchCreative({ bodyMetrics: { ...ext.bodyMetrics, [key]: v } })
                }
              />
            </Field>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['skinTone', '肤色'],
              ['hairColor', '发色'],
              ['eyeColor', '眼睛颜色'],
              ['specialMarks', '特殊标志'],
              ['tattoos', '纹身'],
              ['scars', '伤疤'],
              ['accessories', '饰品'],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <TextInput
                value={ext.appearanceDetails?.[key] ?? ''}
                onChange={(v) =>
                  patchCreative({ appearanceDetails: { ...ext.appearanceDetails, [key]: v } })
                }
              />
            </Field>
          ))}
        </div>
      </DetailSection>

      <DetailSection title="表情 / 动作 / 角度集">
        <VariantGrid
          title="表情集"
          items={ext.expressions ?? []}
          onChangeItem={(id, p) =>
            patchCreative({
              expressions: (ext.expressions ?? []).map((e) => (e.id === id ? { ...e, ...p } : e)),
            })
          }
        />
        <VariantGrid
          title="动作集"
          items={ext.poses ?? []}
          onChangeItem={(id, p) =>
            patchCreative({
              poses: (ext.poses ?? []).map((e) => (e.id === id ? { ...e, ...p } : e)),
            })
          }
        />
        <VariantGrid
          title="角度集"
          items={ext.angles ?? []}
          onChangeItem={(id, p) =>
            patchCreative({
              angles: (ext.angles ?? []).map((e) => (e.id === id ? { ...e, ...p } : e)),
            })
          }
        />
      </DetailSection>

      <DetailSection title="一致性">
        <Field label="Consistency Prompt">
          <TextArea
            value={c.consistencyPrompt ?? ''}
            onChange={(v) => patch({ consistencyPrompt: v })}
            rows={3}
            mono
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Seed">
            <TextInput
              value={String(ext.consistency?.seed ?? '')}
              onChange={(v) => patchCreative({ consistency: { ...ext.consistency, seed: v } })}
            />
          </Field>
          <Field label="LoRA">
            <TextInput
              value={ext.consistency?.loraId ?? ''}
              onChange={(v) => patchCreative({ consistency: { ...ext.consistency, loraId: v } })}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-[10px] text-ink/50">
          <input
            type="checkbox"
            checked={!!ext.consistency?.locked}
            onChange={(e) => patchCreative({ consistency: { ...ext.consistency, locked: e.target.checked } })}
          />
          锁定一致性参数
        </label>
      </DetailSection>

      <DetailSection title="AI Prompt">
        <PromptPanel
          label="Character Bible Prompt（总体）"
          value={prompts.bible?.text ?? ''}
          onChange={(v) =>
            patchCreative({ prompts: { ...prompts, bible: { version: 1, text: v, updatedAt: Date.now() } } })
          }
          onRegenerate={onRefreshPrompts}
          onCopy={() => copyText(prompts.bible?.text ?? '')}
        />
        <PromptPanel
          label="图片 Prompt"
          value={prompts.image?.text ?? ''}
          onChange={(v) =>
            patchCreative({ prompts: { ...prompts, image: { version: 1, text: v, updatedAt: Date.now() } } })
          }
          onCopy={() => copyText(prompts.image?.text ?? '')}
        />
        <PromptPanel
          label="视频 Prompt"
          value={prompts.video?.text ?? ''}
          onChange={(v) =>
            patchCreative({ prompts: { ...prompts, video: { version: 1, text: v, updatedAt: Date.now() } } })
          }
          onCopy={() => copyText(prompts.video?.text ?? '')}
        />
        <PromptPanel
          label="Negative Prompt"
          value={prompts.negative?.text ?? ext.consistency?.negativePrompt ?? ''}
          onChange={(v) =>
            patchCreative({
              consistency: { ...ext.consistency, negativePrompt: v },
              prompts: { ...prompts, negative: { version: 1, text: v, updatedAt: Date.now() } },
            })
          }
          onCopy={() => copyText(prompts.negative?.text ?? '')}
        />
      </DetailSection>

      <p className="text-[10px] text-brand/70 pt-2">
        在节点中使用 <code className="bg-surface px-1 rounded">@角色:{c.name}</code> 引用
      </p>
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
}: {
  item: BacklotWorkspaceItem;
  onChange: (next: BacklotWorkspaceItem) => void;
  onRefreshPrompts: () => void;
  onUploadRef: UploadHandler;
  onUploadSheet: UploadHandler;
}) {
  const ext = getSceneCreative(item);
  const patch = (p: Partial<BacklotWorkspaceItem>) => onChange({ ...item, ...p });
  const patchExt = (p: Partial<typeof ext>) => onChange({ ...item, creative: { ...ext, ...p } });
  const promptVersion = ext.prompts?.scene?.version ?? 1;
  const locked = Boolean((ext as { locked?: boolean }).locked);
  const health = [
    item.label?.trim(),
    (ext.description || item.promptZh)?.trim(),
    (ext.lighting || ext.timeOfDay || ext.weather)?.trim(),
    ext.referenceUrls?.[0] || ext.sheetUrl,
  ].filter(Boolean).length;

  return (
    <div className="max-w-2xl space-y-3">
      <div className="rounded-2xl border border-line bg-white p-3">
        <div className="flex items-start gap-3">
          <div className="h-14 w-20 overflow-hidden rounded-xl border border-line bg-surface">
            {(ext.referenceUrls?.[0] || ext.sheetUrl) ? (
              <img src={(ext.referenceUrls?.[0] || ext.sheetUrl) ?? ''} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <input
              value={item.label}
              onChange={(e) => patch({ label: e.target.value })}
              className="w-full border-b border-line pb-1 text-sm font-semibold focus:outline-none"
              placeholder="场景名 / @引用名"
            />
            <p className="mt-1 text-[10px] text-ink/45">场景库只维护空间一致性；图片生成请连接「图像生成」节点。</p>
            <div className="mt-2 flex flex-wrap gap-1">
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${health >= 4 ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>健康度 {health}/4</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${locked ? 'bg-brand/10 text-brand' : 'bg-surface text-ink/45'}`}>{locked ? '已锁定' : '未锁定'}</span>
              <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink/45">Prompt v{promptVersion}</span>
            </div>
          </div>
        </div>
      </div>

      <DetailSection title="核心一致性">
        <Field label="空间锚点（防场景漂移）">
          <TextArea value={ext.description ?? item.promptZh ?? ''} onChange={(v) => patchExt({ description: v })} rows={3} placeholder="建筑结构、空间布局、材质、固定标识物…" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="时代/世界观">
            <TextInput value={ext.worldView ?? ''} onChange={(v) => patchExt({ worldView: v })} />
          </Field>
          <Field label="时间/天气">
            <TextInput value={[ext.timeOfDay, ext.weather].filter(Boolean).join(' · ')} onChange={(v) => {
              const [timeOfDay, weather] = v.split(/[·,，]/).map((s) => s.trim());
              patchExt({ timeOfDay, weather });
            }} />
          </Field>
          <Field label="光照">
            <TextInput value={ext.lighting ?? ''} onChange={(v) => patchExt({ lighting: v })} />
          </Field>
          <Field label="色彩">
            <TextInput value={ext.colorTone ?? ''} onChange={(v) => patchExt({ colorTone: v })} />
          </Field>
        </div>
        <Field label="标签 / 固定道具">
          <TextInput value={(ext.tags ?? []).join('、')} onChange={(v) => patchExt({ tags: v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) })} />
        </Field>
        <Field label="场景 Prompt（注入图像/视频生成）">
          <TextArea value={item.promptEn || ext.prompts?.scene?.text || ''} onChange={(v) => patch({ promptEn: v })} rows={4} mono />
        </Field>
        <Field label="Negative / 禁改项">
          <TextArea
            value={ext.prompts?.negative?.text ?? (ext as { forbiddenDrift?: string }).forbiddenDrift ?? ''}
            onChange={(v) => patchExt({ prompts: { ...ext.prompts, negative: { version: 1, text: v, updatedAt: Date.now() } } })}
            rows={2}
            mono
          />
        </Field>
      </DetailSection>

      <DetailSection title="参考资产">
        <div className="grid grid-cols-3 gap-2">
          <MediaSlot label="参考图" url={ext.referenceUrls?.[0]} accept="image/*" onUpload={onUploadRef} />
          <MediaSlot label="场景设定图" url={ext.sheetUrl} accept="image/*" onUpload={onUploadSheet} />
          <MediaSlot label="补充参考" url={ext.referenceUrls?.[1]} accept="image/*" onUpload={onUploadRef} />
        </div>
        <label className="flex items-center gap-2 text-[10px] text-ink/55">
          <input type="checkbox" checked={locked} onChange={(e) => patchExt({ locked: e.target.checked } as Partial<typeof ext>)} />
          锁定场景资产：被引用时禁止静默替换参考图/空间锚点/Prompt
        </label>
      </DetailSection>

      <DetailSection title="AI 自动补全 / 版本">
        <PromptPanel
          label="场景一致性 Prompt"
          value={ext.prompts?.scene?.text ?? item.promptEn ?? ''}
          negative={ext.prompts?.negative?.text}
          onChange={(v) => patchExt({ prompts: { ...ext.prompts, scene: { version: 1, text: v, updatedAt: Date.now() } } })}
          onChangeNegative={(v) => patchExt({ prompts: { ...ext.prompts, negative: { version: 1, text: v, updatedAt: Date.now() } } })}
          onRegenerate={onRefreshPrompts}
          onCopy={() => copyText(ext.prompts?.scene?.text ?? item.promptEn ?? '')}
        />
      </DetailSection>

      <p className="text-[10px] text-brand/70">
        引用 <code className="rounded bg-surface px-1">{formatAssetMention('scene', item.label)}</code>；生成时由图像/视频节点读取该资产。
      </p>
    </div>
  );

  return (
    <div className="space-y-1 max-w-2xl">
      <input
        value={item.label}
        onChange={(e) => patch({ label: e.target.value })}
        className="w-full font-semibold text-sm border-b border-line pb-1 focus:outline-none"
      />
      <DetailSection title="场景信息">
        <Field label="描述">
          <TextArea value={ext.description ?? item.promptZh ?? ''} onChange={(v) => patchExt({ description: v })} rows={3} />
        </Field>
        <Field label="标签（逗号分隔）">
          <TextInput
            value={(ext.tags ?? []).join(', ')}
            onChange={(v) => patchExt({ tags: v.split(/[,，]/).map((s) => s.trim()).filter(Boolean) })}
          />
        </Field>
        <Field label="世界观">
          <TextInput value={ext.worldView ?? ''} onChange={(v) => patchExt({ worldView: v })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="时间">
            <TextInput value={ext.timeOfDay ?? ''} onChange={(v) => patchExt({ timeOfDay: v })} />
          </Field>
          <Field label="天气">
            <TextInput value={ext.weather ?? ''} onChange={(v) => patchExt({ weather: v })} />
          </Field>
          <Field label="光照">
            <TextInput value={ext.lighting ?? ''} onChange={(v) => patchExt({ lighting: v })} />
          </Field>
          <Field label="色调">
            <TextInput value={ext.colorTone ?? ''} onChange={(v) => patchExt({ colorTone: v })} />
          </Field>
        </div>
      </DetailSection>
      <DetailSection title="参考图 & 设定图">
        <div className="grid grid-cols-2 gap-2">
          <MediaSlot label="参考图" url={ext.referenceUrls?.[0]} accept="image/*" onUpload={onUploadRef} />
          <MediaSlot label="Scene Sheet（总体设定图）" url={ext.sheetUrl} accept="image/*" onUpload={onUploadSheet} />
        </div>
        <p className="text-[10px] text-ink/35">{SCENE_SHEET_PROMPT_TEMPLATE.slice(0, 100)}…</p>
      </DetailSection>
      <DetailSection title="创作推荐">
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
              value={(ext[key] ?? []).join(', ')}
              onChange={(v) =>
                patchExt({ [key]: v.split(/[,，]/).map((s) => s.trim()).filter(Boolean) } as Partial<typeof ext>)
              }
            />
          </Field>
        ))}
      </DetailSection>
      <DetailSection title="Prompt">
        <Field label="英文 Prompt">
          <TextArea value={item.promptEn} onChange={(v) => patch({ promptEn: v })} rows={3} mono />
        </Field>
        <PromptPanel
          label="Scene Bible Prompt"
          value={ext.prompts?.scene?.text ?? ''}
          negative={ext.prompts?.negative?.text}
          onChange={(v) =>
            patchExt({ prompts: { ...ext.prompts, scene: { version: 1, text: v, updatedAt: Date.now() } } })
          }
          onChangeNegative={(v) =>
            patchExt({ prompts: { ...ext.prompts, negative: { version: 1, text: v, updatedAt: Date.now() } } })
          }
          onRegenerate={onRefreshPrompts}
          onCopy={() => copyText(ext.prompts?.scene?.text ?? '')}
        />
      </DetailSection>
      <p className="text-[10px] text-brand/70">
        引用 <code className="bg-surface px-1 rounded">{formatAssetMention('scene', item.label)}</code>
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
