export const MAX_ENV_REFERENCE_IMAGES = 6;
export function migrateEnvironmentProfile(env) {
    const urls = [...(env.referenceUrls ?? [])];
    if (env.referenceImageUrl?.trim() && !urls.includes(env.referenceImageUrl)) {
        urls.unshift(env.referenceImageUrl);
    }
    return { ...env, referenceUrls: urls.slice(0, MAX_ENV_REFERENCE_IMAGES), referenceImageUrl: urls[0] ?? null };
}
