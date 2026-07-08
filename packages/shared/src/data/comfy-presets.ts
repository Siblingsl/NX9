export interface ComfyPreset {
  id: string;
  label: string;
  hint: string;
  /** Minimal workflow skeleton — user should paste full workflow from ComfyUI */
  workflowHint: string;
}

export const COMFY_PRESETS: ComfyPreset[] = [
  {
    id: 'txt2img',
    label: '文生图（需粘贴 Workflow）',
    hint: '从 ComfyUI 导出 API JSON，粘贴到下方',
    workflowHint: 'Export → API Format → 粘贴 workflow JSON',
  },
  {
    id: 'img2img',
    label: '图生图（需粘贴 Workflow）',
    hint: 'Workflow 需包含 LoadImage 与 CLIPTextEncode 节点',
    workflowHint: '确保 workflow 中有 CLIPTextEncode 的 text 字段可被替换',
  },
];
