/**
 * Lightweight Fountain screenplay format parser.
 * Converts Fountain markdown to plain text source suitable for the script pipeline.
 */
export function parseFountain(text) {
    const lines = text.split('\n');
    const result = [];
    let inSceneHeading = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            result.push('');
            continue;
        }
        // Scene heading: starts with INT, EXT, INT./EXT, etc.
        if (/^(INT|EXT|INT\.\/EXT|I\/E)[\.\s]/i.test(trimmed)) {
            result.push(`\n【场景】${trimmed}`);
            inSceneHeading = true;
            continue;
        }
        // Character name: ALL CAPS followed by dialogue
        if (/^[A-Z\s\.']{2,}$/.test(trimmed) && trimmed.length < 40 && !trimmed.includes('.')) {
            result.push(`\n${trimmed}：`);
            inSceneHeading = false;
            continue;
        }
        // Parenthetical
        if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
            result.push(`（${trimmed.slice(1, -1)}）`);
            continue;
        }
        result.push(trimmed);
    }
    return result.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
export function parseFinalDraft(text) {
    // Final Draft .fdx is XML-based. Simple extraction of content between <Text> tags.
    const matches = text.match(/<Text[^>]*>([^<]*)<\/Text>/g);
    if (!matches)
        return text;
    return matches.map((m) => m.replace(/<\/?Text[^>]*>/g, '')).join('\n');
}
