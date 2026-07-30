## quality
Cinematic continuous shot with depth-locked motion: body trajectory, footwork and timing follow the depth video; appearance follows character stills; environment follows the scene still. Production-ready, identity-stable, no text overlay.

## template
{quality}

{scene_desc}
{character_locks}。
{depth_lock}。后续人物出场顺序和所有动作继续严格跟随@深度视频。
{dialogue}
{extras}

保持角色全程样貌一致、五官稳定、动作自然流畅。{aspect}画幅，一镜到底，无字幕、无文字、无水印，不出现人物错位、角色互换或手脚变形。

## constraints
Constraints: depth video is motion control only (not look reference); character images lock face/costume; scene image replaces environment; do not invent choreography; no character swap; no limb distortion; no subtitles, captions, watermarks or UI chrome.

## overlay
Guide policy: if any colored marks appear on references, treat them as staging intent only — never render arrows, labels or timestamps in output frames.

## slot_rules
depth_motion=required video lock
character=required image lock (>=1)
scene=optional environment lock
