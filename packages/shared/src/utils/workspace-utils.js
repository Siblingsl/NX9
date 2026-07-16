/** 仅画布项目工作区出现在主栏；公共素材走独立库，不占用画布工作区列表 */
export function isPrivateWorkspace(ws) {
    return ws.visibility !== 'public';
}
export function computeWorkspaceAssetCount(payload) {
    const characters = payload.characters?.characters?.length ?? 0;
    const sounds = payload.soundLibrary?.sounds?.length ?? 0;
    const workspaceItems = payload.backlotWorkspace?.items?.length ?? 0;
    const customItems = payload.backlotCustom?.items?.length ?? 0;
    return characters + sounds + workspaceItems + customItems;
}
