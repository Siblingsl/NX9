export function emptyStructuredPrompt() {
    return { version: 1, text: '' };
}
export function touchStructuredPrompt(text, negative) {
    return {
        version: 1,
        text,
        negative: negative?.trim() || undefined,
        updatedAt: Date.now(),
    };
}
