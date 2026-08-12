/** TOOL-04: 单跑 iterator 自增；空池保持 0 */
export function advanceIteratorIndex(current: number, poolLength: number): number {
  if (poolLength <= 0) return 0;
  return (current + 1) % poolLength;
}
