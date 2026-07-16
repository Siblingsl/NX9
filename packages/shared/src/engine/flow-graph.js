import { promptItemsToBatch } from '../types/prompt-batch';
import { resolveAssetImportItems } from '../utils/asset-import';
/** Kahn topological sort — returns block ids in execution order. */
export function topologicalSort(blocks, links) {
    return topologicalLayers(blocks, links).flat();
}
/** 按依赖分层 — 同层节点互不依赖，可并行执行 */
export function topologicalLayers(blocks, links) {
    const ids = new Set(blocks.map((b) => b.id));
    const inDegree = new Map();
    const adj = new Map();
    for (const id of ids) {
        inDegree.set(id, 0);
        adj.set(id, []);
    }
    for (const link of links) {
        if (!ids.has(link.source) || !ids.has(link.target))
            continue;
        adj.get(link.source).push(link.target);
        inDegree.set(link.target, (inDegree.get(link.target) ?? 0) + 1);
    }
    const layers = [];
    let queue = [];
    for (const [id, deg] of inDegree) {
        if (deg === 0)
            queue.push(id);
    }
    while (queue.length > 0) {
        queue.sort();
        layers.push([...queue]);
        const nextQueue = [];
        for (const id of queue) {
            for (const next of adj.get(id) ?? []) {
                const d = (inDegree.get(next) ?? 1) - 1;
                inDegree.set(next, d);
                if (d === 0)
                    nextQueue.push(next);
            }
        }
        queue = nextQueue;
    }
    const placed = new Set(layers.flat());
    const remaining = [...ids].filter((id) => !placed.has(id));
    if (remaining.length > 0)
        layers.push(remaining.sort());
    return layers;
}
export function gatherUpstream(blockId, blocks, links) {
    const byId = new Map(blocks.map((b) => [b.id, b]));
    const incoming = links.filter((l) => l.target === blockId).map((l) => l.source);
    const out = { prompts: [], pictures: [], clips: [], sounds: [] };
    for (const srcId of incoming) {
        const block = byId.get(srcId);
        if (!block)
            continue;
        const d = block.data ?? {};
        const kind = block.type;
        if (kind === 'prompt') {
            const items = d.promptItems ?? [];
            const mode = d.promptMode ?? 'batch';
            const globalPrompt = d.globalPrompt ?? '';
            const composeAction = d.composeAction;
            const { jobs, dispatch } = promptItemsToBatch(items, mode, globalPrompt, composeAction ?? 'generate');
            if (jobs.length > 0) {
                out.promptBatch = [...(out.promptBatch ?? []), ...jobs];
                out.promptDispatch = dispatch;
                out.prompts.push(...jobs.map((b) => b.prompt));
                for (const job of jobs) {
                    if (job.imageUrl)
                        out.pictures.push(job.imageUrl);
                    if (job.imageUrls?.length)
                        out.pictures.push(...job.imageUrls);
                }
            }
            else {
                const text = globalPrompt.trim() || d.content || d.output;
                if (text?.trim())
                    out.prompts.push(text.trim());
            }
            continue;
        }
        if (kind === 'chat-model' || kind === 'memo' || kind === 'cinema-prompt' || kind === 'camera-prompt' || kind === 'link-parser' || kind === 'style-atelier' || kind === 'tag-atelier' || kind === 'angle-visual') {
            const text = d.content || d.output || d.lastReply;
            if (text?.trim())
                out.prompts.push(text.trim());
        }
        if (kind === 'dialogue-sheet' || kind === 'asset-gate' || kind === 'story-grid') {
            const payload = d.scriptBreakdown;
            if (payload?.version === 1) {
                out.scriptBreakdowns = [...(out.scriptBreakdowns ?? []), payload];
                const prompts = payload.episodes.flatMap((ep) => ep.shots.map((shot) => shot.imagePrompt));
                out.prompts.push(...prompts.filter(Boolean));
            }
            continue;
        }
        if (kind === 'storyboard-preview') {
            const preview = d.storyboardPreview;
            if (preview?.version === 1) {
                const frames = preview.confirmed
                    ? preview.frames.filter((f) => f.imageUrl && (f.status === 'success' || f.status === 'locked'))
                    : preview.frames.filter((f) => f.imageUrl);
                for (const frame of frames) {
                    out.pictures.push(frame.imageUrl);
                    if (frame.promptSummary)
                        out.prompts.push(frame.promptSummary);
                }
            }
            const breakdown = d.scriptBreakdown;
            if (breakdown?.version === 1) {
                out.scriptBreakdowns = [...(out.scriptBreakdowns ?? []), breakdown];
                const videoPrompts = breakdown.episodes.flatMap((ep) => ep.shots.map((shot) => shot.videoPrompt).filter(Boolean));
                out.prompts.push(...videoPrompts);
            }
            continue;
        }
        if (kind === 'picture-gen') {
            const urls = d.previewUrls ?? [];
            if (urls.length)
                out.pictures.push(...urls);
            else {
                const url = d.previewUrl || d.assetUrl || d.filledUrl;
                if (url)
                    out.pictures.push(url);
            }
            continue;
        }
        if (kind === 'asset-import' || kind === 'render-slot') {
            if (kind === 'asset-import') {
                for (const item of resolveAssetImportItems(d)) {
                    if (item.mediaKind === 'picture')
                        out.pictures.push(item.url);
                    else if (item.mediaKind === 'clip')
                        out.clips.push(item.url);
                    else if (item.mediaKind === 'sound')
                        out.sounds.push(item.url);
                }
            }
            else {
                const url = d.previewUrl || d.assetUrl || d.filledUrl;
                if (url)
                    out.pictures.push(url);
            }
            continue;
        }
        if (kind === 'preview-sink') {
            const pics = d.previewPictures ?? [];
            if (pics.length)
                out.pictures.push(...pics);
            else {
                const url = d.previewUrl || d.assetUrl;
                if (url)
                    out.pictures.push(url);
            }
            const text = d.outputText || d.previewPrompt;
            if (text?.trim())
                out.prompts.push(text.trim());
        }
        if (kind === 'asset-bundle') {
            const items = d.bundleItems ?? [];
            for (const item of items) {
                if (item.kind === 'picture' && item.url)
                    out.pictures.push(item.url);
                if (item.kind === 'clip' && item.url)
                    out.clips.push(item.url);
                if (item.kind === 'sound' && item.url)
                    out.sounds.push(item.url);
                if (item.kind === 'text' && item.url)
                    out.prompts.push(item.url);
            }
        }
        if (kind === 'text-chunker') {
            const chunks = d.chunks ?? [];
            if (chunks.length)
                out.prompts.push(...chunks.filter(Boolean));
        }
        if (kind === 'iterator' || kind === 'picker') {
            const items = d.iterItems ?? d.chunks ?? [];
            const idx = d.currentIndex ?? d.pickIndex ?? 0;
            const picked = items[idx];
            if (typeof picked === 'string' && picked.trim())
                out.prompts.push(picked.trim());
        }
        if (kind === 'director-desk' || kind === 'story-grid' || kind === 'motion-story') {
            const url = d.previewUrl || d.lastFrameUrl;
            if (url)
                out.pictures.push(url);
            const clip = d.videoUrl;
            if (clip)
                out.clips.push(clip);
        }
        if (kind === 'director-3d') {
            const url = d.lastCaptureUrl || d.previewUrl;
            if (url)
                out.pictures.push(url);
            const cam = d.lastCameraPrompt || d.content || d.outputPrompt;
            if (cam?.trim())
                out.prompts.push(cam.trim());
        }
        if (kind === 'mesh-viewer' || kind === 'mesh-import') {
            const url = d.previewUrl || d.lastCaptureUrl;
            if (url)
                out.pictures.push(url);
        }
        if (kind === 'panorama-sphere') {
            const url = d.panoramaUrl || d.previewUrl;
            if (url)
                out.pictures.push(url);
        }
        if (kind === 'grid-split') {
            const urls = d.splitUrls ?? d.pictures;
            if (urls?.length)
                out.pictures.push(...urls);
            else {
                const url = d.previewUrl;
                if (url)
                    out.pictures.push(url);
            }
        }
        if (kind === 'grid-compose') {
            const url = d.composedUrl || d.previewUrl;
            if (url)
                out.pictures.push(url);
        }
        if (kind === 'scale-fit' || kind === 'sketch-pad') {
            const url = d.previewUrl || d.outputUrl || d.assetUrl;
            if (url)
                out.pictures.push(url);
        }
        if (kind === 'picture-merge') {
            const url = d.composedUrl || d.previewUrl;
            if (url)
                out.pictures.push(url);
        }
        if (kind === 'frame-sampler') {
            const urls = d.frameUrls ?? d.pictures;
            if (urls?.length)
                out.pictures.push(...urls);
        }
        if (kind === 'clip-gen' || kind === 'clip-editor' || kind === 'frame-endpoints' || kind === 'clip-sink') {
            const url = d.videoUrl || d.outputUrl || d.previewUrl;
            if (url)
                out.clips.push(url);
            const frames = d.frameUrls ?? [];
            if (frames.length)
                out.pictures.push(...frames);
        }
        if (kind === 'sound-gen') {
            const url = d.audioUrl;
            if (url)
                out.sounds.push(url);
        }
        if (kind === 'batch-runner') {
            const urls = d.batchResults ?? d.pictures;
            if (urls?.length) {
                if (d.mode === 'reverse-prompt')
                    out.prompts.push(...urls.filter((x) => typeof x === 'string'));
                else
                    out.pictures.push(...urls.filter((x) => x.startsWith('/')));
            }
        }
        if (kind === 'grid-prompt-reverse') {
            const cells = d.gridCells ?? [];
            if (cells.length) {
                out.prompts.push(...cells.map((c) => c.videoPrompt || c.imagePrompt || '').filter(Boolean));
            }
            const urls = d.splitUrls ?? d.pictures;
            if (urls?.length)
                out.pictures.push(...urls);
        }
        if (kind === 'photo-speak') {
            const url = d.videoUrl || d.outputUrl;
            if (url)
                out.clips.push(url);
            const audio = d.audioUrl;
            if (audio)
                out.sounds.push(audio);
            const text = d.content || d.script;
            if (text?.trim())
                out.prompts.push(text.trim());
        }
        if (kind === 'topaz-picture') {
            const url = d.previewUrl || d.outputUrl;
            if (url)
                out.pictures.push(url);
        }
        if (kind === 'topaz-clip') {
            const url = d.videoUrl || d.outputUrl;
            if (url)
                out.clips.push(url);
        }
        if (kind === 'passthrough' || kind === 'review-gate') {
            const up = d.upstream;
            if (up) {
                out.prompts.push(...(up.prompts ?? []));
                out.pictures.push(...(up.pictures ?? []));
                out.clips.push(...(up.clips ?? []));
                out.sounds.push(...(up.sounds ?? []));
                out.scriptBreakdowns = [...(out.scriptBreakdowns ?? []), ...(up.scriptBreakdowns ?? [])];
            }
        }
    }
    return out;
}
export function mergeUpstreamPrompt(up, local) {
    const parts = [...up.prompts];
    if (local?.trim())
        parts.push(local.trim());
    return parts.join('\n\n');
}
