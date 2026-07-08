import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { POSE_PRESETS, buildPosePrompt } from '@nx9/shared';

function PoseCraftPanel(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const poseId = (props.data?.poseId as string) ?? 'stand-neutral';
  const subject = (props.data?.subject as string) ?? '';
  const extra = (props.data?.extra as string) ?? '';
  const upstream = props.data?.upstream as { prompts?: string[]; pictures?: string[] } | undefined;

  const sync = useCallback(
    (patch: { poseId?: string; subject?: string; extra?: string }) => {
      const nextPose = patch.poseId ?? poseId;
      const nextSubject = patch.subject ?? subject;
      const nextExtra = patch.extra ?? extra;
      const content = buildPosePrompt(
        nextPose,
        nextSubject || upstream?.prompts?.[0],
        nextExtra,
      );
      updateNodeData(props.id, {
        poseId: nextPose,
        subject: nextSubject,
        extra: nextExtra,
        content,
        output: content,
      });
    },
    [poseId, subject, extra, upstream?.prompts, props.id, updateNodeData],
  );

  return (
    <div className="space-y-2 text-xs">
      <select
        value={poseId}
        onChange={(e) => sync({ poseId: e.target.value })}
        className="w-full rounded-lg border border-line px-2 py-1 bg-white"
      >
        {POSE_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <input
        value={subject}
        onChange={(e) => sync({ subject: e.target.value })}
        placeholder="主体（可留空用上游）"
        className="w-full rounded-xl border border-line px-2 py-1.5"
      />
      {upstream?.pictures?.[0] && (
        <img
          src={upstream.pictures[0]}
          alt=""
          className="w-full rounded-lg border border-line max-h-20 object-cover"
        />
      )}
      <textarea
        value={extra}
        onChange={(e) => sync({ extra: e.target.value })}
        placeholder="姿势补充…"
        className="w-full min-h-[40px] rounded-xl border border-line px-2 py-1.5 resize-y"
      />
    </div>
  );
}

export default memo(PoseCraftPanel);
