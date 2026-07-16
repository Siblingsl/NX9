/** 将 TimelinePayload 转为 HyperFrames 模板变量 JSON */
export function timelineToHyperFramesVars(timeline) {
    return {
        clips: timeline.tracks.flatMap((t) => t.clips.map((c) => ({
            id: c.id,
            label: c.label,
            startSec: c.startSec,
            durationSec: c.durationSec,
            assetUrl: c.assetUrl,
            type: c.type,
            text: c.text,
            transitionOut: c.transitionOut,
        }))),
        fps: timeline.fps,
        durationSec: timeline.durationSec,
        aspect: timeline.aspect,
        width: timeline.width,
        height: timeline.height,
        title: timeline.title,
        tracks: timeline.tracks.map((t) => ({
            id: t.id,
            kind: t.kind,
            clipCount: t.clips.length,
        })),
    };
}
/** 将 TimelinePayload 转为 HyperFrames HTML 字符串 */
export function timelineToHyperFramesHtml(timeline, templateId) {
    const vars = timelineToHyperFramesVars(timeline);
    const clipsHtml = vars.clips
        .filter((c) => c.type === 'video' || c.type === 'image')
        .map((c, i) => {
        const tag = c.type === 'video' ? 'video' : 'img';
        const srcAttr = c.type === 'video' ? `src="${c.assetUrl}"` : `src="${c.assetUrl}"`;
        return `<${tag} id="clip-${i}" class="hf-clip" data-start="${c.startSec}" data-duration="${c.durationSec}" ${srcAttr} />`;
    })
        .join('\n    ');
    const subtitlesHtml = vars.clips
        .filter((c) => c.type === 'subtitle' && c.text)
        .map((c, i) => `<div class="hf-subtitle" data-start="${c.startSec}" data-duration="${c.durationSec}">${c.text}</div>`)
        .join('\n    ');
    return [
        '<!DOCTYPE html>',
        '<html lang="zh-CN">',
        '<head>',
        '  <meta charset="UTF-8" />',
        `  <meta name="viewport" content="width=${timeline.width},height=${timeline.height}" />`,
        '  <title>NX9 HyperFrames Render</title>',
        '  <style>',
        '    * { margin: 0; padding: 0; box-sizing: border-box; }',
        `    #stage { width: ${timeline.width}px; height: ${timeline.height}px; overflow: hidden; position: relative; background: #000; }`,
        '    .hf-clip, .hf-subtitle { position: absolute; inset: 0; width: 100%; height: 100%; }',
        '    .hf-clip video, .hf-clip img { width: 100%; height: 100%; object-fit: contain; }',
        '    .hf-subtitle { display: flex; align-items: flex-end; justify-content: center; padding-bottom: 8%; color: #fff; font-size: 28px; text-align: center; background: rgba(0,0,0,0.6); height: auto; min-height: 48px; }',
        '  </style>',
        '</head>',
        '<body>',
        `  <div id="stage" data-fps="${timeline.fps}" data-duration="${timeline.durationSec}">`,
        '    <div id="video-stack">',
        `    ${clipsHtml}`,
        '    </div>',
        '    <div id="subtitle-layer">',
        `    ${subtitlesHtml}`,
        '    </div>',
        '  </div>',
        '  <script>',
        '    window.__NX9_TIMELINE__ = ' + JSON.stringify(vars) + ';',
        '  </script>',
        '</body>',
        '</html>',
    ].join('\n');
}
/** 列出可用的 HyperFrames 模板 */
export function listHyperFramesTemplates() {
    return [
        { id: 'nx9-vertical-episode', label: '竖屏成片', aspect: '9:16', description: '竖屏短剧成片模板，含转场、字幕条' },
        { id: 'nx9-shot-with-lower-third', label: '镜头+字幕条', aspect: '16:9', description: '单镜头带 lower-third 字幕条' },
    ];
}
