export interface SceneCardData {
  sceneName: string;
  description: string;
  era: string;
  lighting: string;
  props: string[];
  referenceUrls: string[];
  linkedShotIds?: string[];
}

export function compileScenePrompt(card: SceneCardData): string {
  const parts: string[] = [];

  if (card.sceneName.trim()) parts.push(`场景：${card.sceneName.trim()}`);

  const desc = card.description.trim();
  if (desc) parts.push(desc);

  const env: string[] = [];
  if (card.era.trim()) env.push(`时代/风格：${card.era.trim()}`);
  if (card.lighting.trim()) env.push(`光线：${card.lighting.trim()}`);
  if (env.length > 0) parts.push(env.join('；'));

  if (card.props.length > 0) {
    parts.push(`道具锚点：${card.props.filter(Boolean).join('、')}`);
  }

  if (card.referenceUrls.length > 0) {
    parts.push(`参考图 ${card.referenceUrls.length} 张已附（保持空间布局与材质一致）`);
  }

  parts.push('生成约束：空间比例稳定、建筑结构不漂移、光色逻辑连续、无水印无 UI。');
  // bilingual production anchors for downstream image nodes
  const en: string[] = ['environment concept, production location bible'];
  if (card.sceneName.trim()) en.push(`location: ${card.sceneName.trim()}`);
  if (card.era.trim()) en.push(`era/style: ${card.era.trim()}`);
  if (card.lighting.trim()) en.push(`lighting: ${card.lighting.trim()}`);
  if (card.props.length > 0) en.push(`key props: ${card.props.filter(Boolean).join(', ')}`);
  en.push('stable architecture, consistent materials, no watermark, no UI chrome');
  parts.push(en.join(', '));

  return parts.join('\n');
}
