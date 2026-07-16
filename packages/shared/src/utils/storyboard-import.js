const SHOT_TYPE_MAP = {
    特写: 'close',
    close: 'close',
    'close-up': 'close',
    近景: 'close',
    中景: 'medium',
    medium: 'medium',
    全景: 'wide',
    wide: 'wide',
    远景: 'extreme-wide',
    'extreme-wide': 'extreme-wide',
    大远景: 'extreme-wide',
};
function parseShotType(raw) {
    const key = raw.trim().toLowerCase();
    for (const [k, v] of Object.entries(SHOT_TYPE_MAP)) {
        if (key.includes(k.toLowerCase()))
            return v;
    }
    return 'custom';
}
function parseDuration(raw) {
    const m = raw.match(/(\d+(?:\.\d+)?)/);
    if (!m)
        return 4;
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 ? Math.min(30, n) : 4;
}
function newShotId() {
    return `shot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
/** Parse storyboard-breaker Markdown table into shots. */
export function parseStoryboardMarkdown(markdown) {
    const lines = markdown.split('\n').map((l) => l.trim());
    const tableLines = lines.filter((l) => l.startsWith('|') && !/^[\|\s\-:]+$/.test(l));
    if (tableLines.length < 2)
        return [];
    const headerCells = tableLines[0]
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean);
    const colIndex = (names) => {
        for (const n of names) {
            const i = headerCells.findIndex((h) => h.includes(n));
            if (i >= 0)
                return i;
        }
        return -1;
    };
    const idxNum = colIndex(['镜号', '#', '序号']);
    const idxType = colIndex(['景别', '镜头']);
    const idxDesc = colIndex(['画面描述', '描述', '内容']);
    const idxPrompt = colIndex(['英文提示词', '提示词', 'prompt']);
    const idxDur = colIndex(['时长', 'duration']);
    const idxNotes = colIndex(['备注', 'notes']);
    const shots = [];
    for (let r = 1; r < tableLines.length; r++) {
        const cells = tableLines[r]
            .split('|')
            .slice(1)
            .map((c) => c.trim());
        if (cells.length > 0 && cells[cells.length - 1] === '')
            cells.pop();
        if (cells.length === 0)
            continue;
        const get = (idx, fallback = '') => (idx >= 0 && idx < cells.length ? cells[idx] : fallback);
        const indexRaw = get(idxNum >= 0 ? idxNum : 0, String(r));
        const index = parseInt(indexRaw.replace(/\D/g, ''), 10) || r;
        shots.push({
            id: newShotId(),
            index,
            durationSec: parseDuration(get(idxDur)),
            shotType: parseShotType(get(idxType)),
            descriptionZh: get(idxDesc >= 0 ? idxDesc : 2),
            promptEn: get(idxPrompt >= 0 ? idxPrompt : 3),
            status: 'draft',
            characterIds: [],
            linkedBlockId: null,
            notes: idxNotes >= 0 ? get(idxNotes) : undefined,
        });
    }
    return shots.sort((a, b) => a.index - b.index);
}
