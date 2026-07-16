export function playbookDefToSchema(def) {
    return {
        workflowId: def.id,
        mode: def.id === 'pb-ai-comic-3d' || def.id === 'pb-ai-comic-live' || def.id === 'pb-anime'
            ? 'core-6'
            : 'free',
        steps: def.steps.map((s) => ({
            id: s.id,
            title: s.shortLabel || s.label,
            icon: '',
            status: 'pending',
            dependencies: [],
            next: null,
            allowSkip: !!s.optional,
            required: !s.optional,
            component: s.canvasNodeKinds?.[0] ?? '',
            readinessKey: s.readinessKey,
        })),
        nodes: def.steps
            .filter((s) => s.stepIndex && s.canvasNodeKinds?.length)
            .map((s) => ({
            id: s.id,
            kind: s.canvasNodeKinds[0],
            stepId: s.id,
            col: (s.stepIndex ?? 1) - 1,
        })),
        edges: [],
        validations: {},
    };
}
export function schemaToJson(schema) {
    return JSON.stringify(schema, null, 2);
}
export function jsonToSchema(json) {
    return JSON.parse(json);
}
