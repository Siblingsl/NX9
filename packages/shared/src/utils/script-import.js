const EPISODE_RE = /第\s*([一二三四五六七八九十\d]+)\s*集/g;
const SCENE_HEAD_RE = /^\*{0,2}(\d+-\d+)\s*(日|夜|晨|暮|黄昏|清晨)?\s*(内|外)?\s*(.+?)\*{0,2}\s*$/;
const CHAR_LINE_RE = /^人物[：:]\s*(.+)$/;
const DIALOGUE_RE = /^([^（(\s]{1,12})[：:]\s*(.+)$/;
function cnNum(s) {
    const map = {
        一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
    };
    if (/^\d+$/.test(s))
        return parseInt(s, 10);
    if (s.length === 1 && map[s])
        return map[s];
    if (s.startsWith('十'))
        return 10 + (map[s[1]] ?? 0);
    if (s.endsWith('十'))
        return (map[s[0]] ?? 0) * 10;
    return 1;
}
/** 轻量中文剧本解析 — 提取集、场景头、对白与动作 */
export function parseChineseScript(fullText) {
    const titleMatch = fullText.match(/[《「]([^》」]+)[》」]/);
    const title = titleMatch?.[1]?.trim() || '未命名剧本';
    const outlineMatch = fullText.match(/(?:\*{0,2}大纲[：:]\*{0,2}|【大纲】)([\s\S]*?)(?=(?:\*{0,2}人物小传|【人物|第[一二三四五六七八九十\d]+集|$))/i);
    const biosMatch = fullText.match(/(?:\*{0,2}人物小传[：:]\*{0,2}|【人物小传】)([\s\S]*?)(?=\*{0,2}第[一二三四五六七八九十\d]+集|$)/i);
    const outline = outlineMatch?.[1]?.trim() ?? '';
    const characterBios = biosMatch?.[1]?.trim() ?? '';
    const genre = /武侠|仙侠|科幻|悬疑|爱情|商战|宫斗/.exec(`${outline}\n${characterBios}`)?.[0] ?? '';
    const episodes = [];
    let m;
    const epRe = new RegExp(EPISODE_RE.source, 'g');
    while ((m = epRe.exec(fullText)) !== null) {
        episodes.push({ num: cnNum(m[1]), start: m.index, end: fullText.length });
    }
    for (let i = 0; i < episodes.length - 1; i++) {
        episodes[i].end = episodes[i + 1].start;
    }
    const scenes = [];
    const chunks = episodes.length > 0
        ? episodes.map((ep) => ({ ep: ep.num, text: fullText.slice(ep.start, ep.end) }))
        : [{ ep: 1, text: fullText }];
    for (const { ep, text } of chunks) {
        const lines = text.split('\n');
        let current = null;
        const buf = [];
        const flush = () => {
            if (!current)
                return;
            current.content = buf.join('\n').trim();
            if (current.content)
                scenes.push({ ...current });
            buf.length = 0;
        };
        for (const raw of lines) {
            const line = raw.trim();
            if (!line || /^第\s*[一二三四五六七八九十\d]+\s*集/.test(line))
                continue;
            const sceneMatch = line.match(SCENE_HEAD_RE);
            if (sceneMatch) {
                flush();
                current = {
                    episode: ep,
                    sceneId: sceneMatch[1],
                    timeOfDay: sceneMatch[2] ?? '日',
                    interior: sceneMatch[3] ?? '内',
                    location: sceneMatch[4].replace(/\s*人物[：:].*/, '').trim(),
                    characters: [],
                    content: '',
                };
                const charInline = line.match(/人物[：:]\s*(.+)$/);
                if (charInline) {
                    current.characters = charInline[1].split(/[、,，]/).map((c) => c.trim()).filter(Boolean);
                }
                continue;
            }
            const charLine = line.match(CHAR_LINE_RE);
            if (charLine && current) {
                current.characters = charLine[1].split(/[、,，]/).map((c) => c.trim()).filter(Boolean);
                continue;
            }
            if (current)
                buf.push(line);
        }
        flush();
    }
    return { background: { title, outline, characterBios, genre }, scenes };
}
function guessShotType(content) {
    if (/特写|close/i.test(content))
        return 'close';
    if (/全景|远景|wide/i.test(content))
        return 'wide';
    if (/大全景|extreme/i.test(content))
        return 'extreme-wide';
    return 'medium';
}
/** 将解析场景转为故事板镜头（规则合成，可再由 LLM 精修） */
export function scenesToStoryboardShots(scenes) {
    return scenes.map((sc, i) => {
        const desc = [
            `第${sc.episode}集 ${sc.sceneId}`,
            `${sc.timeOfDay} ${sc.interior} ${sc.location}`,
            sc.characters.length ? `人物：${sc.characters.join('、')}` : '',
            sc.content.slice(0, 400),
        ]
            .filter(Boolean)
            .join('\n');
        const promptEn = [
            sc.interior === '内' ? 'interior' : 'exterior',
            sc.timeOfDay === '夜' ? 'night scene' : 'daylight',
            sc.location,
            sc.characters.join(', '),
            sc.content.replace(/[△【】]/g, ' ').slice(0, 200),
        ]
            .filter(Boolean)
            .join(', ');
        return {
            id: `shot-script-${Date.now()}-${i}`,
            index: i + 1,
            durationSec: 4,
            shotType: guessShotType(sc.content),
            descriptionZh: desc,
            promptEn,
            status: 'draft',
            characterIds: [],
            linkedBlockId: null,
        };
    });
}
