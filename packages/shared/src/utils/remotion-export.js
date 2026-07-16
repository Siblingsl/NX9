import { buildTimelineFromShots } from './timeline-export';
function mapClipType(type) {
    if (type === 'subtitle' || type === 'overlay')
        return 'image';
    return type;
}
export function timelineToRemotion(timeline, opts) {
    const fps = timeline.fps || 30;
    const durationInFrames = Math.max(1, Math.ceil(timeline.durationSec * fps));
    const tracks = timeline.tracks.map((track) => ({
        id: track.id,
        kind: track.kind,
        clips: track.clips.map((clip) => ({
            id: clip.id,
            from: Math.round(clip.startSec * fps),
            durationInFrames: Math.max(1, Math.round(clip.durationSec * fps)),
            src: clip.assetUrl,
            type: mapClipType(clip.type),
            label: clip.label,
        })),
    }));
    return {
        id: 'Nx9Timeline',
        width: opts?.width ?? 1920,
        height: opts?.height ?? 1080,
        fps,
        durationInFrames,
        props: {
            title: timeline.title,
            tracks,
        },
    };
}
/** @deprecated 使用 timelineToRemotionInputProps() 代替，走官方 inputProps 格式 */
export function shotsToRemotion(shots, title) {
    const timeline = buildTimelineFromShots(shots, title);
    return timelineToRemotion(timeline);
}
/** 将 TimelinePayload 转为 @remotion/player inputProps 格式 */
export function timelineToRemotionInputProps(timeline) {
    return { timeline };
}
/** 生成 Remotion Studio 工程包描述（composition 源码 + inputProps.json + README） */
export function timelineToRemotionStudioBundle(timeline) {
    const ts = Date.now();
    const inputPropsJson = JSON.stringify({ timeline }, null, 2);
    const readme = [
        '# NX9 Remotion Studio Bundle',
        '',
        '## 使用方法',
        '',
        '1. 确保已安装 `remotion` 和 `@remotion/player`',
        '2. 将 `inputProps.json` 放入 compositions 目录',
        '3. 在 `Nx9Episode.tsx` 中读取 `inputProps.timeline`',
        '4. 运行 `npx remotion studio` 预览',
        '',
        '## 文件结构',
        '',
        '- `inputProps.json` — 时间线数据（version=' + timeline.version + '）',
        '- `Nx9Episode.tsx` — 主 Composition 源码',
        '- `clips/VideoClip.tsx` — 视频/图片片段',
        '- `clips/SubtitleClip.tsx` — 字幕片段',
        '- `clips/ImageClip.tsx` — 静帧片段',
        '',
        `生成时间: ${new Date().toISOString()}`,
        `时长: ${timeline.durationSec}s`,
        `FPS: ${timeline.fps}`,
        `画面: ${timeline.width}×${timeline.height}`,
        `轨道数: ${timeline.tracks.length}`,
        '',
        '#',
    ].join('\n');
    const nx9EpisodeSource = [
        'import React from "react";',
        'import { AbsoluteFill, Sequence, Audio } from "remotion";',
        'import { VideoClip } from "./clips/VideoClip";',
        'import { SubtitleClip } from "./clips/SubtitleClip";',
        '',
        'export const Nx9Episode: React.FC<{ timeline: any }> = ({ timeline }) => {',
        '  const fps = timeline.fps || 30;',
        '  const videoTrack = timeline.tracks.find((t: any) => t.id === "video-1");',
        '  const subtitleTrack = timeline.tracks.find((t: any) => t.id === "subtitle-1");',
        '  return (',
        '    <AbsoluteFill style={{ backgroundColor: "#000" }}>',
        '      {videoTrack?.clips.map((clip: any) => (',
        '        <Sequence key={clip.id} from={Math.round(clip.startSec * fps)} durationInFrames={Math.max(1, Math.round(clip.durationSec * fps))}>',
        '          <VideoClip clip={clip} />',
        '        </Sequence>',
        '      ))}',
        '      {subtitleTrack?.clips.map((clip: any) => (',
        '        <Sequence key={clip.id} from={Math.round(clip.startSec * fps)} durationInFrames={Math.max(1, Math.round(clip.durationSec * fps))}>',
        '          <SubtitleClip clip={clip} />',
        '        </Sequence>',
        '      ))}',
        '    </AbsoluteFill>',
        '  );',
        '};',
    ].join('\n');
    const videoClipSource = [
        'import React from "react";',
        'import { AbsoluteFill, OffthreadVideo, Img } from "remotion";',
        '',
        'export const VideoClip: React.FC<{ clip: any }> = ({ clip }) => {',
        '  if (clip.type === "image") {',
        '    return <AbsoluteFill><Img src={clip.assetUrl} style={{ width: "100%", height: "100%", objectFit: "contain" }} /></AbsoluteFill>;',
        '  }',
        '  return (',
        '    <AbsoluteFill>',
        '      <OffthreadVideo src={clip.assetUrl} style={{ width: "100%", height: "100%", objectFit: "contain" }} />',
        '    </AbsoluteFill>',
        '  );',
        '};',
    ].join('\n');
    const subtitleClipSource = [
        'import React from "react";',
        'import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";',
        '',
        'export const SubtitleClip: React.FC<{ clip: any }> = ({ clip }) => {',
        '  if (!clip.text) return null;',
        '  const frame = useCurrentFrame();',
        '  const { fps } = useVideoConfig();',
        '  const fadeIn = Math.min(10, Math.round(0.3 * fps));',
        '  const opacity = interpolate(frame, [0, fadeIn], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });',
        '  return (',
        '    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: "8%" }}>',
        '      <div style={{ opacity, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 28, padding: "8px 24px", borderRadius: 8, textAlign: "center", maxWidth: "90%" }}>',
        '        {clip.text}',
        '      </div>',
        '    </AbsoluteFill>',
        '  );',
        '};',
    ].join('\n');
    const imageClipSource = [
        'import React from "react";',
        'import { AbsoluteFill, Img } from "remotion";',
        '',
        'export const ImageClip: React.FC<{ clip: any }> = ({ clip }) => (',
        '  <AbsoluteFill><Img src={clip.assetUrl} style={{ width: "100%", height: "100%", objectFit: "contain" }} /></AbsoluteFill>',
        ');',
    ].join('\n');
    return {
        zipFilename: `nx9-remotion-studio-${ts}.zip`,
        files: [
            { name: 'inputProps.json', content: inputPropsJson },
            { name: 'README.md', content: readme },
            { name: 'Nx9Episode.tsx', content: nx9EpisodeSource },
            { name: 'clips/VideoClip.tsx', content: videoClipSource },
            { name: 'clips/SubtitleClip.tsx', content: subtitleClipSource },
            { name: 'clips/ImageClip.tsx', content: imageClipSource },
        ],
    };
}
/** 校验时间线，返回警告列表 */
export function validateRemotionTimeline(timeline) {
    const warnings = [];
    if (!timeline || timeline.version < 2) {
        warnings.push('时间线版本过旧，建议升级到 v2');
    }
    if (timeline.durationSec <= 0) {
        warnings.push('时间线时长为 0，请先添加素材');
    }
    if (timeline.tracks.length === 0) {
        warnings.push('无轨道数据');
    }
    const videoTrack = timeline.tracks.find((t) => t.kind === 'video');
    if (!videoTrack || videoTrack.clips.length === 0) {
        warnings.push('无视频轨道，成片将为空');
    }
    for (const track of timeline.tracks) {
        for (const clip of track.clips) {
            if ((clip.type === 'video' || clip.type === 'image') && !clip.assetUrl) {
                warnings.push(`片段 "${clip.label}" 无素材地址`);
            }
        }
    }
    return { ok: warnings.length === 0, warnings };
}
/** Active clip at playback time (seconds). */
export function clipAtTime(timeline, timeSec) {
    const out = {};
    for (const track of timeline.tracks) {
        for (const clip of track.clips) {
            const end = clip.startSec + clip.durationSec;
            if (timeSec >= clip.startSec && timeSec < end) {
                if (clip.type === 'video')
                    out.video = clip.assetUrl;
                if (clip.type === 'audio')
                    out.audio = clip.assetUrl;
                if (clip.type === 'image')
                    out.image = clip.assetUrl;
                out.label = clip.label;
            }
        }
    }
    return out;
}
