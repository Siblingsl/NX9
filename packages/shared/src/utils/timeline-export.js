export function buildTimelineFromShots(shots, title = 'NX9 Timeline') {
    const sorted = [...shots].sort((a, b) => a.index - b.index);
    let offset = 0;
    const videoClips = [];
    const audioClips = [];
    const voiceClips = [];
    const subtitleClips = [];
    const overlayClips = [];
    const warnings = [];
    for (const shot of sorted) {
        const dur = shot.durationSec || 4;
        if (shot.videoAssetId) {
            videoClips.push({
                id: `v-${shot.id}`,
                shotId: shot.id,
                label: `#${shot.index} ${shot.descriptionZh || ''}`.trim(),
                startSec: offset,
                durationSec: dur,
                assetUrl: shot.videoAssetId,
                type: 'video',
            });
        }
        else if (shot.firstFrameAssetId) {
            videoClips.push({
                id: `v-${shot.id}`,
                shotId: shot.id,
                label: `#${shot.index} (still)`,
                startSec: offset,
                durationSec: dur,
                assetUrl: shot.firstFrameAssetId,
                type: 'image',
            });
        }
        else {
            warnings.push(`镜 #${shot.index} 无视频素材`);
        }
        if (shot.audioAssetId) {
            audioClips.push({
                id: `a-${shot.id}`,
                shotId: shot.id,
                label: `配音 #${shot.index}`,
                startSec: offset,
                durationSec: dur,
                assetUrl: shot.audioAssetId,
                type: 'audio',
            });
        }
        if (shot.voiceLineText) {
            voiceClips.push({
                id: `vl-${shot.id}`,
                shotId: shot.id,
                label: `语音 #${shot.index}`,
                startSec: offset,
                durationSec: dur,
                assetUrl: '',
                type: 'audio',
                text: shot.voiceLineText,
            });
        }
        const subtitleText = shot.subtitleText || shot.descriptionZh || '';
        if (subtitleText) {
            subtitleClips.push({
                id: `s-${shot.id}`,
                shotId: shot.id,
                label: `字幕 #${shot.index}`,
                startSec: offset,
                durationSec: dur,
                assetUrl: '',
                type: 'subtitle',
                text: subtitleText,
            });
        }
        if (shot.overlayAssetId) {
            overlayClips.push({
                id: `o-${shot.id}`,
                shotId: shot.id,
                label: `Overlay #${shot.index}`,
                startSec: offset,
                durationSec: dur,
                assetUrl: shot.overlayAssetId,
                type: 'overlay',
            });
        }
        offset += dur;
    }
    const tracks = [];
    if (videoClips.length)
        tracks.push({ id: 'video-1', kind: 'video', clips: videoClips });
    if (overlayClips.length)
        tracks.push({ id: 'video-2', kind: 'video', clips: overlayClips });
    if (audioClips.length)
        tracks.push({ id: 'audio-1', kind: 'audio', clips: audioClips });
    if (voiceClips.length)
        tracks.push({ id: 'audio-2', kind: 'audio', clips: voiceClips });
    if (subtitleClips.length)
        tracks.push({ id: 'subtitle-1', kind: 'video', clips: subtitleClips });
    return {
        version: 2,
        title,
        fps: 30,
        durationSec: offset,
        aspect: '9:16',
        width: 1080,
        height: 1920,
        tracks,
    };
}
export function buildTimelineFromShotsV2(shots, title, opts) {
    const warnings = [];
    const { aspect = '9:16', approvedOnly, defaultTransition, transcribeCues, subtitleEnabled = true, } = opts ?? {};
    let filtered = [...shots].sort((a, b) => a.index - b.index);
    if (approvedOnly) {
        filtered = filtered.filter((s) => s.status === 'approved');
    }
    const result = buildTimelineFromShots(filtered, title);
    // 追加 transcribe cues 到字幕轨
    if (transcribeCues && transcribeCues.length > 0 && subtitleEnabled) {
        const existing = result.tracks.find((t) => t.id === 'subtitle-1');
        const cueClips = transcribeCues.map((cue, i) => ({
            id: `tc-${i}`,
            label: `字幕 ${i + 1}`,
            startSec: cue.startSec,
            durationSec: cue.endSec - cue.startSec,
            assetUrl: '',
            type: 'subtitle',
            text: cue.text,
        }));
        if (existing) {
            existing.clips.push(...cueClips);
        }
        else {
            result.tracks.push({ id: 'subtitle-1', kind: 'video', clips: cueClips });
        }
    }
    // 默认转场
    if (defaultTransition) {
        for (const track of result.tracks) {
            for (let i = 0; i < track.clips.length - 1; i++) {
                track.clips[i].transitionOut = defaultTransition;
            }
        }
    }
    else if (result.renderPreset === 'hyperframes-vertical') {
        for (const track of result.tracks) {
            for (let i = 0; i < track.clips.length - 1; i++) {
                track.clips[i].transitionOut = { kind: 'fade', durationSec: 0.3 };
            }
        }
    }
    return {
        ...result,
        aspect,
        width: aspect === '9:16' ? 1080 : aspect === '1:1' ? 1080 : 1920,
        height: aspect === '9:16' ? 1920 : aspect === '1:1' ? 1080 : 1080,
        warnings,
    };
}
