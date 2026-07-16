const PIPELINE_DX = 280;
const PIPELINE_Y = 200;
const BASE_X = 80;
export function layoutPipeline(blocks, links) {
    const stepMap = new Map();
    for (const b of blocks) {
        const idx = b.data?.playbookStepIndex ?? -1;
        if (idx > 0)
            stepMap.set(b.id, idx);
    }
    let nextCol = 0;
    const colMap = new Map();
    const inDegree = new Map();
    for (const b of blocks)
        inDegree.set(b.id, 0);
    for (const l of links) {
        inDegree.set(l.target, (inDegree.get(l.target) ?? 0) + 1);
    }
    const queue = [];
    for (const [id, deg] of inDegree) {
        if (deg === 0)
            queue.push(id);
    }
    while (queue.length > 0) {
        const size = queue.length;
        for (let i = 0; i < size; i++) {
            const id = queue.shift();
            const stepIdx = stepMap.get(id);
            if (stepIdx !== undefined) {
                colMap.set(id, stepIdx - 1);
            }
            else if (!colMap.has(id)) {
                colMap.set(id, nextCol);
            }
            for (const l of links) {
                if (l.source === id) {
                    const d = inDegree.get(l.target) ?? 0;
                    if (d > 0) {
                        inDegree.set(l.target, d - 1);
                        if (d - 1 === 0)
                            queue.push(l.target);
                    }
                }
            }
        }
        nextCol++;
    }
    const laid = blocks.map((b) => {
        const col = colMap.get(b.id) ?? 0;
        return {
            ...b,
            position: { x: BASE_X + col * PIPELINE_DX, y: PIPELINE_Y },
        };
    });
    return { blocks: laid, links };
}
export function autoFitBounds(blocks) {
    if (blocks.length === 0)
        return { x: 0, y: 0, zoom: 1 };
    const maxX = Math.max(...blocks.map((b) => b.position.x + 220));
    const maxY = Math.max(...blocks.map((b) => b.position.y + 160));
    const centerX = maxX / 2;
    const centerY = maxY / 2;
    const zoom = Math.min(1400 / maxX, 700 / maxY, 1);
    return { x: -centerX * zoom + 700, y: -centerY * zoom + 350, zoom };
}
