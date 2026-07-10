import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import {
  ANGLE_PRESETS,
  CHARACTER_EXPRESSION_PRESETS,
  CHARACTER_SHEET_POSE_PRESETS,
  CHARACTER_BIBLE_LAYERS,
  applyCharacterSheetPatch,
  characterSheetFromNodeData,
  syncCharacterSheetNodeOutput,
  buildCharacterConsistencyPrompt,
  type CharacterSheetInput,
  type CharacterProfile,
} from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import ImageUploadSlot from '../shared/ImageUploadSlot';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { useActivityLog } from '../../stores/activity-log';
import { toastSuccess } from '../../stores/toast';
import { api } from '../../api/client';
import { EntityCard } from '../../components/EntityCard';
import { AssetLinkField, assetRefFromData, patchWithAssetRef } from '../shared/AssetLinkField';

type SheetTab = 'sheet' | 'profile' | 'turnaround' | 'variant' | 'bible';

const TAB_LABELS: { id: SheetTab; label: string }[] = [
  { id: 'sheet', label: '设定图' },
  { id: 'profile', label: '档案' },
  { id: 'turnaround', label: '三视图' },
  { id: 'variant', label: '变体' },
  { id: 'bible', label: '六层锚点' },
];

function ChipRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value?: string;
  onChange: (id: string) => void;
}) {
  return (
    <div>
      <p className="text-[10px] text-ink/40 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`px-2 py-0.5 rounded-full border text-[10px] ${
              value === o.id
                ? 'border-brand bg-brand/10 text-brand'
                : 'border-line hover:border-brand/30 text-ink/60'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface ParsedSheetProfile {
  characterName?: string;
  age?: string;
  height?: string;
  weight?: string;
  occupation?: string;
  personality?: string;
  background?: string;
  distinctiveFeatures?: string;
  palette?: string;
  forbiddenTraits?: string;
}

function CharacterSheetBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upsertCharacter = useWorkspaceDocument((s) => s.upsertCharacter);
  const tab = ((props.data?.sheetTab as SheetTab) ?? 'sheet') as SheetTab;
  const upstream = props.data?.upstream as { pictures?: string[]; prompts?: string[] } | undefined;
  const characterId = props.data?.characterId as string | undefined;
  const syncedAt = props.data?.backlotSyncedAt as string | undefined;
  const characterAssetRef = assetRefFromData(props.data as Record<string, unknown>);
  const [parsing, setParsing] = useState(false);
  const retryCountRef = useRef(0);

  const sheet = useMemo(() => characterSheetFromNodeData(props.data), [props.data]);

  const variant = sheet.activeVariant ?? {};
  const refPreview =
    sheet.fullSheetUrl || sheet.frontUrl || upstream?.pictures?.[0];

  const commit = useCallback(
    (patch: Partial<CharacterSheetInput> & { profile?: Partial<CharacterSheetInput['profile']> }) => {
      const next = applyCharacterSheetPatch(sheet, patch);
      updateNodeData(props.id, syncCharacterSheetNodeOutput(next));
    },
    [sheet, props.id, updateNodeData],
  );

  const uploadFullSheet = useCallback(
    (url: string) => {
      commit({ fullSheetUrl: url });
      appendLog('完整设定图已上传');
    },
    [commit, appendLog],
  );

  const fillFromUpstream = useCallback(() => {
    const pics = upstream?.pictures ?? [];
    if (pics.length === 0) {
      appendLog('角色设定：无上游图片');
      return;
    }
    if (pics.length === 1) {
      commit({ fullSheetUrl: pics[0] });
      appendLog('已从上游填入完整设定图');
      return;
    }
    commit({
      frontUrl: pics[0],
      sideUrl: pics[1],
      backUrl: pics[2],
    });
    appendLog(`三视图已从上游填充 · ${Math.min(pics.length, 3)} 张`);
  }, [upstream?.pictures, commit, appendLog]);

  const parseSheetProfile = useCallback(async () => {
    const imageUrl = sheet.fullSheetUrl?.trim();
    if (!imageUrl) {
      appendLog('请先上传完整设定图');
      return;
    }
    retryCountRef.current = 0;

    const attempt = async (): Promise<void> => {
      setParsing(true);
      updateNodeData(props.id, { status: 'running' });
      try {
        const res = await api.proxyLlm({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                '你是角色设定分析师。从角色设定图提取结构化信息，只输出 JSON，不要 markdown：{"characterName":"","age":"","height":"","weight":"","occupation":"","personality":"","background":"","distinctiveFeatures":"","palette":"","forbiddenTraits":""}',
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: '解析这张角色设定图，填写各字段。distinctiveFeatures 写外貌识别特征。' },
                { type: 'image_url', image_url: { url: imageUrl } },
              ],
            },
          ],
        });
        const raw = (res as { content?: string }).content ?? '';
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch?.[0] ?? raw) as ParsedSheetProfile;
        commit({
          characterName: parsed.characterName ?? sheet.characterName,
          palette: parsed.palette ?? sheet.palette,
          forbiddenTraits: parsed.forbiddenTraits ?? sheet.forbiddenTraits,
          profile: {
            age: parsed.age,
            height: parsed.height,
            weight: parsed.weight,
            occupation: parsed.occupation,
            personality: parsed.personality,
            background: parsed.background,
            distinctiveFeatures: parsed.distinctiveFeatures,
          },
        });
        updateNodeData(props.id, { status: 'success', sheetTab: 'profile' });
        retryCountRef.current = 0;
        appendLog('已从设定图识别档案');
        toastSuccess('档案已自动填充，请核对后保存');
      } catch (e) {
        if (retryCountRef.current < 1) {
          retryCountRef.current++;
          appendLog(`设定图识别失败，3 秒后自动重试…`);
          updateNodeData(props.id, { status: 'error', error: String(e), meta: { retryAt: Date.now() + 3000 } });
          await new Promise((r) => setTimeout(r, 3000));
          return attempt();
        }
        updateNodeData(props.id, { status: 'error', error: String(e) });
        appendLog(`设定图识别失败（已重试）: ${String(e)}`);
      } finally {
        setParsing(false);
      }
    };

    await attempt();
  }, [sheet, props.id, commit, updateNodeData, appendLog]);

  const saveToBacklot = useCallback(() => {
    const name = sheet.characterName?.trim();
    if (!name) {
      appendLog('角色设定：请先填写角色名');
      return;
    }
    const id = characterId ?? `char-${props.id}`;
    const ref =
      sheet.fullSheetUrl?.trim() ||
      sheet.frontUrl?.trim() ||
      upstream?.pictures?.[0] ||
      null;
    const profile: CharacterProfile = {
      id,
      name,
      descriptionZh: [sheet.profile?.background, sheet.profile?.personality]
        .filter(Boolean)
        .join(' · '),
      consistencyPrompt: buildCharacterConsistencyPrompt(sheet),
      referenceImageUrl: ref,
      referenceAudioUrl: null,
      tags: ['character-sheet'],
      bible: {
        identity: sheet.bible?.identity?.trim() || undefined,
        appearance: sheet.bible?.appearance?.trim() || undefined,
        personality: sheet.bible?.personality?.trim() || undefined,
        background: sheet.bible?.background?.trim() || undefined,
        voice: sheet.bible?.voice?.trim() || undefined,
        relationships: sheet.bible?.relationships?.trim() || undefined,
      },
    };
    upsertCharacter(profile);
    updateNodeData(props.id, {
      characterId: id,
      backlotSyncedAt: new Date().toISOString(),
    });
    appendLog(`已保存到角色库 · ${name}`);
    toastSuccess(`「${name}」已写入角色库`);
  }, [sheet, characterId, props.id, upstream?.pictures, upsertCharacter, updateNodeData, appendLog]);

  const angleOptions = useMemo(
    () =>
      ANGLE_PRESETS.filter((a) =>
        ['three-quarter', 'side', 'low', 'high', 'front'].includes(a.id),
      ).map((a) => ({ id: a.id, label: a.label })),
    [],
  );

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs max-w-[320px]">
        <div className="flex gap-2 items-start">
          {refPreview ? (
            <img
              src={refPreview}
              alt=""
              className="w-12 h-16 object-cover rounded-lg border border-line shrink-0"
            />
          ) : (
            <div className="w-12 h-16 rounded-lg border border-dashed border-line bg-surface shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate">{sheet.characterName || '未命名角色'}</p>
            <p className="text-[10px] text-ink/50 line-clamp-2">
              {sheet.profile?.distinctiveFeatures || '上传设定图或填写识别特征'}
            </p>
            {(variant.expressionId || variant.poseId || variant.angleId) && (
              <p className="text-[10px] text-brand/70 mt-0.5 truncate">
                {[
                  CHARACTER_EXPRESSION_PRESETS.find((e) => e.id === variant.expressionId)?.label,
                  CHARACTER_SHEET_POSE_PRESETS.find((p) => p.id === variant.poseId)?.label,
                  ANGLE_PRESETS.find((a) => a.id === variant.angleId)?.label,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>
        </div>

        <AssetLinkField
          kind="character"
          assetRef={characterAssetRef}
          onChange={(ref) => {
            updateNodeData(props.id, {
              ...patchWithAssetRef(ref),
              characterId: ref?.id,
            });
          }}
        />

        <div className="flex flex-wrap gap-1">
          {TAB_LABELS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => updateNodeData(props.id, { sheetTab: t.id })}
              className={`px-2 py-0.5 rounded-full text-[10px] border ${
                tab === t.id
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-line text-ink/50 hover:border-brand/30'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'sheet' && (
          <div className="space-y-2">
            <p className="text-[10px] text-ink/45">
              上传完整角色设定图（含三视图、表情、动作等），作为一致性主参考。
            </p>
            <ImageUploadSlot
              url={sheet.fullSheetUrl}
              label="点击上传设定图"
              aspectClass="aspect-[4/5] max-h-44"
              onUploaded={uploadFullSheet}
              onClear={() => commit({ fullSheetUrl: '' })}
            />
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => void parseSheetProfile()}
                disabled={!sheet.fullSheetUrl || parsing}
                className="flex-1 rounded-lg bg-brand/10 text-brand border border-brand/20 py-1.5 text-[10px] disabled:opacity-40"
              >
                {parsing ? '识别中…' : '识别并填充档案'}
              </button>
              <button
                type="button"
                onClick={fillFromUpstream}
                disabled={!(upstream?.pictures?.length ?? 0)}
                className="flex-1 rounded-lg border border-line py-1.5 text-[10px] hover:border-brand/40 disabled:opacity-40"
              >
                用上游图
              </button>
            </div>
          </div>
        )}

        {tab === 'profile' && (
          <div className="space-y-2 max-h-52 overflow-y-auto nx9-scroll">
            <input
              value={sheet.characterName ?? ''}
              onChange={(e) => commit({ characterName: e.target.value })}
              placeholder="角色名（@提及）"
              className="w-full rounded-xl border border-line px-2 py-1.5 font-medium"
            />
            <textarea
              value={sheet.profile?.distinctiveFeatures ?? ''}
              onChange={(e) => commit({ profile: { distinctiveFeatures: e.target.value } })}
              placeholder="★ 识别特征：黑发、深棕眼、右耳银流苏耳环…"
              className="w-full min-h-[52px] rounded-xl border border-brand/30 bg-brand/[0.03] px-2 py-1.5 resize-y"
            />
            <input
              value={sheet.profile?.occupation ?? ''}
              onChange={(e) => commit({ profile: { occupation: e.target.value } })}
              placeholder="职业 / 身份"
              className="w-full rounded-lg border border-line px-2 py-1"
            />
            <div className="grid grid-cols-3 gap-1">
              <input
                value={sheet.profile?.age ?? ''}
                onChange={(e) => commit({ profile: { age: e.target.value } })}
                placeholder="年龄"
                className="rounded-lg border border-line px-2 py-1 text-[10px]"
              />
              <input
                value={sheet.profile?.height ?? ''}
                onChange={(e) => commit({ profile: { height: e.target.value } })}
                placeholder="身高"
                className="rounded-lg border border-line px-2 py-1 text-[10px]"
              />
              <input
                value={sheet.profile?.weight ?? ''}
                onChange={(e) => commit({ profile: { weight: e.target.value } })}
                placeholder="体重"
                className="rounded-lg border border-line px-2 py-1 text-[10px]"
              />
            </div>
            <input
              value={sheet.profile?.personality ?? ''}
              onChange={(e) => commit({ profile: { personality: e.target.value } })}
              placeholder="性格关键词"
              className="w-full rounded-lg border border-line px-2 py-1"
            />
            <textarea
              value={sheet.profile?.background ?? ''}
              onChange={(e) => commit({ profile: { background: e.target.value } })}
              placeholder="背景（可选）"
              className="w-full min-h-[40px] rounded-lg border border-line px-2 py-1 resize-y text-[10px]"
            />
            <input
              value={sheet.palette ?? ''}
              onChange={(e) => commit({ palette: e.target.value })}
              placeholder="色板 hex，逗号分隔"
              className="w-full rounded-lg border border-line px-2 py-1 font-mono text-[10px]"
            />
            <input
              value={sheet.forbiddenTraits ?? ''}
              onChange={(e) => commit({ forbiddenTraits: e.target.value })}
              placeholder="禁止项：短发、眼镜…"
              className="w-full rounded-lg border border-line px-2 py-1"
            />
          </div>
        )}

        {tab === 'turnaround' && (
          <div className="space-y-2">
            <p className="text-[10px] text-ink/45">点击各视图上传；也可单独补全三视图。</p>
            <div className="grid grid-cols-3 gap-1">
              <ImageUploadSlot
                url={sheet.frontUrl}
                label="正面"
                compact
                onUploaded={(url) => commit({ frontUrl: url })}
                onClear={() => commit({ frontUrl: '' })}
              />
              <ImageUploadSlot
                url={sheet.sideUrl}
                label="侧面"
                compact
                onUploaded={(url) => commit({ sideUrl: url })}
                onClear={() => commit({ sideUrl: '' })}
              />
              <ImageUploadSlot
                url={sheet.backUrl}
                label="背面"
                compact
                onUploaded={(url) => commit({ backUrl: url })}
                onClear={() => commit({ backUrl: '' })}
              />
            </div>
            <button
              type="button"
              onClick={fillFromUpstream}
              disabled={!(upstream?.pictures?.length ?? 0)}
              className="w-full rounded-lg border border-line py-1.5 text-[10px] hover:border-brand/40 disabled:opacity-40"
            >
              从上游填充{upstream?.pictures?.length ? ` (${upstream.pictures.length} 张)` : ''}
            </button>
            <details className="text-[10px] text-ink/40">
              <summary className="cursor-pointer hover:text-ink/60">粘贴图片链接（可选）</summary>
              <div className="mt-1 space-y-1 pt-1">
                {(
                  [
                    { key: 'frontUrl' as const, label: '正面', val: sheet.frontUrl },
                    { key: 'sideUrl' as const, label: '侧面', val: sheet.sideUrl },
                    { key: 'backUrl' as const, label: '背面', val: sheet.backUrl },
                  ] as const
                ).map(({ key, label, val }) => (
                  <input
                    key={key}
                    value={val ?? ''}
                    onChange={(e) => commit({ [key]: e.target.value })}
                    placeholder={`${label} URL`}
                    className="w-full rounded border border-line px-1 py-0.5 font-mono text-[9px]"
                  />
                ))}
              </div>
            </details>
          </div>
        )}

        {tab === 'variant' && (
          <div className="space-y-2 max-h-48 overflow-y-auto nx9-scroll">
            <ChipRow
              label="表情"
              options={CHARACTER_EXPRESSION_PRESETS}
              value={variant.expressionId}
              onChange={(id) => commit({ activeVariant: { expressionId: id } })}
            />
            <ChipRow
              label="动作"
              options={CHARACTER_SHEET_POSE_PRESETS}
              value={variant.poseId}
              onChange={(id) => commit({ activeVariant: { poseId: id } })}
            />
            <ChipRow
              label="机位"
              options={angleOptions}
              value={variant.angleId}
              onChange={(id) => commit({ activeVariant: { angleId: id } })}
            />
            <p className="text-[10px] text-ink/40 pt-1 border-t border-line">
              参考图优先用完整设定图，其次三视图正面。
            </p>
          </div>
        )}

        {tab === 'bible' && (
          <EntityCard
            title="六层角色锚点"
            subtitle="逐层填写，保存后作为一致性强约束"
            layers={CHARACTER_BIBLE_LAYERS.map((layer) => ({
              label: layer.label,
              content: (
                <textarea
                  value={(sheet.bible?.[layer.key] as string) ?? ''}
                  onChange={(e) => commit({ bible: { ...sheet.bible, [layer.key]: e.target.value } })}
                  placeholder={layer.placeholder}
                  rows={3}
                  className="w-full rounded-lg border border-line px-2 py-1 resize-y text-[11px]"
                />
              ),
            }))}
            actions={
              <button
                type="button"
                onClick={saveToBacklot}
                className="w-full rounded-xl bg-brand text-white py-2 text-[11px] font-medium"
              >
                AI 生成描述
              </button>
            }
          />
        )}

        <button
          type="button"
          onClick={saveToBacklot}
          className="w-full rounded-xl bg-brand text-white py-2 text-[11px] font-medium"
        >
          保存到角色库
        </button>
        {syncedAt && (
          <p className="text-[9px] text-ink/40 text-center">
            已同步 · {new Date(syncedAt).toLocaleString()}
          </p>
        )}
      </div>
    </BlockShell>
  );
}

export default memo(CharacterSheetBlock);
