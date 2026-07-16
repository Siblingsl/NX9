export function buildEnvironmentContextPrompt(env) {
    if (!env)
        return '';
    const parts = [];
    if (env.lighting?.trim())
        parts.push(`Lighting: ${env.lighting.trim()}`);
    if (env.era?.trim())
        parts.push(`Era: ${env.era.trim()}`);
    if (env.props && env.props.length > 0)
        parts.push(`Props: ${env.props.join(', ')}`);
    if (parts.length === 0)
        return '';
    return `Environment:\n${parts.join('\n')}`;
}
export function enrichPromptWithEnvironment(base, env) {
    const context = buildEnvironmentContextPrompt(env);
    const trimmed = base.trim();
    if (!context)
        return trimmed;
    return trimmed ? `${trimmed}\n\n${context}` : context;
}
