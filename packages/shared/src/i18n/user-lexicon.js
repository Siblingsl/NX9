/**
 * 用户词典 — UI 文案强制替换
 * 禁止词 → 替换词映射。所有用户可见 UI 文案必须通过此词典。
 * 用法：translate(text) 自动替换，或 grep 检查禁止词。
 */
export const LEXICON = {
    Node: '步骤',
    node: '步骤',
    Workflow: '创作流程',
    workflow: '创作流程',
    Prompt: 'AI 描述',
    prompt: 'AI 描述',
    Asset: '素材',
    asset: '素材',
    Execute: '开始生成',
    execute: '开始生成',
    'Run ': '开始生成 ',
    run: '生成',
    Dependency: '',
    dependency: '',
    Provider: 'AI 模型',
    provider: 'AI 模型',
    Pipeline: '制作进度',
    pipeline: '制作进度',
};
/** 禁止出现在用户可见 UI 中的词（用于 lint/测试） */
export const BANNED_TERMS = Object.keys(LEXICON).filter((k) => LEXICON[k] !== '');
export function translate(text) {
    let result = text;
    for (const [from, to] of Object.entries(LEXICON)) {
        if (to === '') {
            result = result.replace(new RegExp(from, 'g'), '');
        }
        else {
            result = result.replace(new RegExp(from, 'g'), to);
        }
    }
    return result;
}
