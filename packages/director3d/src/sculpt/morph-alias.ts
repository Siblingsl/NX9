/** morph 名归一化：小写、去掉非字母数字与点、剥掉 blendshape / arkit 前缀。 */
export function normalizeMorphName(raw: string): string {
  const stripped = raw.toLowerCase().replace(/[^a-z0-9.]+/g, '');
  return stripped.replace(/^(blendshape|arkit)+/, '');
}

const ALIASES: Record<string, string> = {
  jawwide: 'jawwidth.pos',
  jawwidthpos: 'jawwidth.pos',
  jawwidthneg: 'jawwidth.neg',
};

export function aliasMorphName(raw: string): string {
  const n = normalizeMorphName(raw);
  return ALIASES[n] ?? n;
}
