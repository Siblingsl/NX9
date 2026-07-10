import type { TimelinePayload } from '../types/timeline';

/** 将 TimelinePayload 导出为 FCPXML（Final Cut Pro 可导入） */
export function timelineToFcpxml(timeline: TimelinePayload): string {
  const fps = timeline.fps || 30;
  const durationFrames = Math.ceil(timeline.durationSec * fps);

  let clipXml = '';
  let clipIndex = 0;

  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.type === 'audio' || clip.type === 'subtitle') continue;
      clipIndex++;
      const startFrame = Math.round(clip.startSec * fps);
      const durFrames = Math.max(1, Math.round(clip.durationSec * fps));
      clipXml += `    <clip id="clip-${clipIndex}" name="${escapeXml(clip.label)}" duration="${durFrames}/${fps}s" start="${startFrame}/${fps}s">
      <video>
        <offset>0s</offset>
        <name>${escapeXml(clip.label)}</name>
        <duration>${durFrames}/${fps}s</duration>
      </video>
    </clip>\n`;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.11">
  <resources>
    <format id="r1" name="FFVideoFormat${fps}p" frameDuration="${fps}/1" width="${timeline.width}" height="${timeline.height}"/>
  </resources>
  <library>
    <event name="${escapeXml(timeline.title)}">
      <project name="${escapeXml(timeline.title)}" duration="${durationFrames}/${fps}s">
        <sequence>
          <spine>
${clipXml}          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
