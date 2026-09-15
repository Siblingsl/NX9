/** UX：通道/鉴权类失败 → 引导去设置·连接 */
export function isProviderConnectionError(message: string | null | undefined): boolean {
  if (!message?.trim()) return false;
  return /401|403|429|502|504|insufficient|balance|quota|billing|unauthorized|forbidden|api[\s_-]?key|未配置|无密钥|credential|auth|连接失败|provider/i.test(
    message,
  );
}
