import { useMemo, useState } from 'react';
import type { CharacterProfile } from '@nx9/shared';
import {
  CHARACTER_FACE_RIG_PRESETS,
  FACE_RIG_GROUPS,
  FACE_RIG_PARAMS,
  applyFaceRigPreset,
  buildCharacterFaceRigPrompt,
  buildFaceRigPrompt,
  countFaceRigDeviations,
  emptyFaceRig,
  faceRigParamsOfGroup,
  faceRigSkipBodyIds,
  faceRigValue,
  getCharacterCreative,
  getFaceRig,
  resetFaceRigGroup,
  setFaceRigValue,
} from '@nx9/shared';
import { DetailSection, ParamSlider } from './detail-primitives';
import { FaceSculptModal } from './face-sculpt/FaceSculptModal';

const QUICK_PARAMS = FACE_RIG_PARAMS.filter((p) => p.quick);

export function CharacterFaceRigSection({
  character: c,
  onChange,
}: {
  character: CharacterProfile;
  onChange: (next: CharacterProfile) => void;
}) {
  const ext = getCharacterCreative(c);
  const rig = getFaceRig(c);
  const [expanded, setExpanded] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sculptOpen, setSculptOpen] = useState(false);

  const patchRig = (next: ReturnType<typeof getFaceRig>) =>
    onChange({ ...c, creative: { ...c.creative, ...ext, faceRig: next } });

  const deviations = countFaceRigDeviations(rig);
  const locked = Boolean(ext.consistency?.locked);
  const presetLabel = CHARACTER_FACE_RIG_PRESETS.find((p) => p.id === rig.presetId)?.label;

  const facePrompt = useMemo(() => buildCharacterFaceRigPrompt(c), [c]);
  const bodyPrompt = useMemo(
    () =>
      buildFaceRigPrompt(rig, {
        groups: ['body'],
        skipIds: faceRigSkipBodyIds(ext.bodyMetrics),
        omitPriorityNote: true,
        omitConsistencyNote: true,
      }),
    [rig, ext.bodyMetrics],
  );

  return (
    <DetailSection id="char-face" title="捏脸 · 体型">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] ${
            deviations > 0 ? 'bg-brand/10 text-brand' : 'bg-surface text-ink/45'
          }`}
        >
          已偏离 {deviations}/{FACE_RIG_PARAMS.length} 项
        </span>
        {presetLabel ? (
          <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink/45">预设 {presetLabel}</span>
        ) : null}
        {deviations > 0 ? (
          <button
            type="button"
            className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink/55 hover:border-brand/40 hover:text-brand"
            title="所有参数回到中性，Prompt 中不再出现面部结构段"
            onClick={() => patchRig({ ...emptyFaceRig(), updatedAt: Date.now() })}
          >
            全部重置
          </button>
        ) : null}
      </div>

      {locked && deviations > 0 ? (
        <p className="rounded-lg border border-warn/40 bg-warn/10 px-2 py-1.5 text-[10px] leading-relaxed text-warn">
          角色已锁定：改捏脸会让一致性 Prompt 与锁定快照漂移。请在上方「新建版本」后再改，旧镜头仍钉旧版本。
        </p>
      ) : null}

      <p className="text-[10px] leading-relaxed text-ink/40">
        参数只管结构与量，不管颜色（肤/发/瞳色仍在外观细节）。改完点上方「刷新」写入一致性 Prompt。
      </p>

      <button
        type="button"
        className="w-full rounded-lg border border-brand/30 bg-brand/5 px-2.5 py-1.5 text-xs text-brand hover:border-brand/50"
        onClick={() => setSculptOpen(true)}
      >
        打开捏模台
      </button>

      <div className="flex items-center gap-1.5">
        <select
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs"
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (id) patchRig(applyFaceRigPreset(rig, id));
          }}
        >
          <option value="">应用脸型预设…</option>
          {CHARACTER_FACE_RIG_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2 rounded-xl border border-line/70 bg-surface/35 p-2.5">
        {QUICK_PARAMS.map((p) => (
          <ParamSlider
            key={p.id}
            label={p.labelZh}
            value={faceRigValue(rig, p.id)}
            low={p.low}
            high={p.high}
            onCommit={(v) => patchRig(setFaceRigValue(rig, p.id, v))}
          />
        ))}
      </div>

      <button
        type="button"
        className="text-[10px] text-ink/50 hover:text-brand"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? '收起全部参数' : `展开全部 ${FACE_RIG_PARAMS.length} 项（脸型 / 眼 / 眉 / 鼻 / 嘴 / 皮肤 / 体型）`}
      </button>

      {expanded ? (
        <div className="space-y-3">
          {FACE_RIG_GROUPS.map((group) => {
            const params = faceRigParamsOfGroup(group.id);
            const groupDeviated = params.some((p) => faceRigValue(rig, p.id) !== 0);
            return (
              <div key={group.id} className="space-y-2 rounded-xl border border-line/70 bg-surface/35 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-medium text-ink/55">{group.labelZh}</span>
                  {groupDeviated ? (
                    <button
                      type="button"
                      className="text-[10px] text-ink/40 hover:text-brand"
                      onClick={() => patchRig(resetFaceRigGroup(rig, group.id))}
                    >
                      重置本组
                    </button>
                  ) : null}
                </div>
                {params.map((p) => (
                  <ParamSlider
                    key={p.id}
                    label={p.labelZh}
                    value={faceRigValue(rig, p.id)}
                    low={p.low}
                    high={p.high}
                    onCommit={(v) => patchRig(setFaceRigValue(rig, p.id, v))}
                  />
                ))}
              </div>
            );
          })}
        </div>
      ) : null}

      {facePrompt || bodyPrompt ? (
        <div className="space-y-1">
          <button
            type="button"
            className="text-[10px] text-ink/50 hover:text-brand"
            onClick={() => setPreviewOpen((v) => !v)}
          >
            {previewOpen ? '收起编译结果' : '查看编译进 Prompt 的文本'}
          </button>
          {previewOpen ? (
            <div className="space-y-2 rounded-xl border border-line/70 bg-surface/35 p-2.5">
              {facePrompt ? (
                <div className="space-y-0.5">
                  <span className="text-[9px] text-ink/40">## 面部结构（参数锁）</span>
                  <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-ink/65">{facePrompt}</pre>
                </div>
              ) : null}
              {bodyPrompt ? (
                <div className="space-y-0.5">
                  <span className="text-[9px] text-ink/40">## 身体数据（追加）</span>
                  <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-ink/65">{bodyPrompt}</pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <FaceSculptModal
        open={sculptOpen}
        character={c}
        onChange={onChange}
        onClose={() => setSculptOpen(false)}
      />
    </DetailSection>
  );
}
