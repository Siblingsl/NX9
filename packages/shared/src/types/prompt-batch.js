import { resolveAssetImportItems } from '../utils/asset-import';
export function newPromptBatchItem(text = '', imageUrl) {
    return {
        id: `pi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        text,
        imageUrl,
    };
}
/** 从上游图片/文本合并为提示词行（保留已有行的 id 与文案） */
export function mergePromptBatchItems(existing, upstreamPictures, upstreamTexts) {
    const byImage = new Map(existing.filter((i) => i.imageUrl).map((i) => [i.imageUrl, i]));
    if (upstreamPictures.length > 0) {
        const rows = upstreamPictures.map((url, i) => {
            const prev = byImage.get(url) ?? existing[i];
            return {
                id: prev?.id ?? newPromptBatchItem().id,
                text: upstreamTexts[i] ?? prev?.text ?? '',
                imageUrl: url,
                rowIndex: prev?.rowIndex ?? i,
            };
        });
        for (let i = upstreamPictures.length; i < upstreamTexts.length; i++) {
            const prev = existing[i];
            rows.push({
                id: prev?.id ?? newPromptBatchItem().id,
                text: upstreamTexts[i] ?? '',
                imageUrl: prev?.imageUrl,
                rowIndex: prev?.rowIndex ?? i,
            });
        }
        return rows.length > 0 ? rows : [newPromptBatchItem()];
    }
    const texts = upstreamTexts.length > 0
        ? upstreamTexts
        : existing.map((i) => i.text).filter((t) => t.trim());
    if (texts.length === 0) {
        return existing.length > 0 ? existing : [newPromptBatchItem()];
    }
    const sorted = texts.map((text, i) => ({
        id: existing[i]?.id ?? newPromptBatchItem().id,
        text,
        imageUrl: existing[i]?.imageUrl,
        rowIndex: existing[i]?.rowIndex ?? i,
    }));
    sorted.sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0));
    return sorted;
}
export function promptItemsToBatch(items, mode = 'batch', globalPrompt = '', composeAction = 'generate') {
    const global = globalPrompt.trim();
    const pictures = items.map((i) => i.imageUrl).filter(Boolean);
    if (mode === 'single') {
        const parts = [
            global,
            ...items.map((i) => i.text.trim()).filter(Boolean),
            ...items.map((i) => i.note?.trim()).filter(Boolean),
        ].filter(Boolean);
        const prompt = parts.join('\n\n') || 'combine the reference images';
        const jobs = [
            pictures.length > 0 ? { prompt, imageUrls: pictures } : { prompt },
        ];
        return {
            jobs,
            dispatch: { mode, composeAction, globalPrompt: global || undefined },
        };
    }
    if (mode === 'broadcast') {
        const prompt = global || items.find((i) => i.text.trim())?.text.trim() || '';
        if (!prompt) {
            return { jobs: [], dispatch: { mode, globalPrompt: global || undefined } };
        }
        const jobs = pictures.length > 0
            ? pictures.map((url) => ({ prompt, imageUrl: url }))
            : [{ prompt }];
        return { jobs, dispatch: { mode, globalPrompt: global || undefined } };
    }
    // batch：每行独立；global 作为前缀
    const rows = items.filter((i) => i.text.trim() || (global && i.imageUrl));
    const jobs = [];
    for (const row of rows) {
        const line = row.text.trim();
        const prompt = [global, line, row.note?.trim()].filter(Boolean).join('\n\n');
        if (!prompt)
            continue;
        jobs.push({ prompt, imageUrl: row.imageUrl });
    }
    if (jobs.length === 0 && global) {
        jobs.push({ prompt: global });
    }
    return { jobs, dispatch: { mode, globalPrompt: global || undefined } };
}
/** @deprecated 使用 promptItemsToBatch */
export function promptItemsToBatchLegacy(items) {
    return promptItemsToBatch(items).jobs;
}
export function resolvePromptBatch(prompts, pictures, promptBatch, localContent, dispatch) {
    if (promptBatch?.length)
        return promptBatch;
    if (dispatch?.mode === 'single' && pictures.length > 0) {
        const prompt = dispatch.globalPrompt?.trim() ||
            prompts.join('\n\n') ||
            localContent?.trim() ||
            'combine the reference images';
        return [{ prompt, imageUrls: pictures }];
    }
    if (dispatch?.mode === 'broadcast') {
        const prompt = dispatch.globalPrompt?.trim() || prompts[0] || localContent?.trim() || '';
        if (!prompt)
            return [];
        return pictures.length > 0
            ? pictures.map((url) => ({ prompt, imageUrl: url }))
            : [{ prompt }];
    }
    if (prompts.length > 0) {
        return prompts.map((prompt, i) => ({
            prompt,
            imageUrl: pictures[i],
        }));
    }
    if (localContent?.trim())
        return [{ prompt: localContent.trim() }];
    return [];
}
/** 从连入提示词节点的上游收集图片与文本，用于合并多行 */
export function collectUpstreamForPromptMerge(targetId, blocks, links) {
    const byId = new Map(blocks.map((b) => [b.id, b]));
    const incoming = links.filter((l) => l.target === targetId).map((l) => l.source);
    const pictures = [];
    const texts = [];
    const items = [];
    for (const srcId of incoming) {
        const block = byId.get(srcId);
        if (!block)
            continue;
        const d = block.data ?? {};
        const kind = block.type;
        if (kind === 'asset-import' || kind === 'render-slot') {
            if (kind === 'asset-import') {
                for (const item of resolveAssetImportItems(d)) {
                    if (item.mediaKind === 'picture')
                        pictures.push(item.url);
                }
            }
            else {
                const url = d.previewUrl || d.assetUrl || d.filledUrl;
                if (url)
                    pictures.push(url);
            }
            continue;
        }
        if (kind === 'prompt') {
            const upstreamItems = d.promptItems ?? [];
            if (upstreamItems.length > 0) {
                for (const item of upstreamItems) {
                    if (item.text?.trim())
                        texts.push(item.text.trim());
                    if (item.imageUrl)
                        pictures.push(item.imageUrl);
                    items.push(item);
                }
            }
            else {
                const text = d.content || d.output;
                if (text?.trim()) {
                    texts.push(text.trim());
                }
            }
            continue;
        }
        if (kind === 'memo' || kind === 'chat-model' || kind === 'cinema-prompt' || kind === 'camera-prompt') {
            const text = d.content || d.output || d.lastReply;
            if (text?.trim()) {
                texts.push(text.trim());
            }
        }
    }
    return { pictures, texts, items };
}
