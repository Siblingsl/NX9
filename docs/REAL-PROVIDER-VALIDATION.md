# NX9 Real Provider Validation

The browser E2E suite uses mock HTTP routes. It does not prove that an external model provider is reachable or that its credentials, quota, and failure responses work.

## Safe default

The real-provider command is opt-in and never runs as part of `pnpm test`:

```powershell
$env:NX9_REAL_PROVIDER_TEST='1'
$env:NX9_PROVIDER_HEALTHCHECK_URL='https://provider.example/v1/models'
$env:NX9_PROVIDER_AUTH='replace-with-a-short-lived-test-key'
pnpm --filter @nx9/server test:real-provider
```

Use a low-cost provider health endpoint for the live check. Do not put keys in this document, shell history, CI logs, or source control.

## Failure cases

Configure deterministic endpoints from the provider sandbox, staging gateway, or an approved fault-injection proxy:

```powershell
$env:NX9_PROVIDER_CASE_429_URL='https://fault-proxy.example/provider/429'
$env:NX9_PROVIDER_CASE_401_URL='https://fault-proxy.example/provider/401'
$env:NX9_PROVIDER_CASE_500_URL='https://fault-proxy.example/provider/500'
$env:NX9_PROVIDER_TIMEOUT_URL='https://fault-proxy.example/provider/timeout'
pnpm --filter @nx9/server test:real-provider
```

The command requires exact HTTP statuses for 429, 401, and 500. The timeout endpoint must exceed `NX9_PROVIDER_TIMEOUT_MS` (default `30000`). A real provider normally cannot be safely forced to emit these conditions, so use its documented sandbox or an authorized proxy rather than intentionally exhausting production quota.

## NX9 error contract

- `401` and `403`: authentication or permission failure.
- `429`: rate limit or quota exhaustion.
- `504`: NX9 request timeout.
- `502`: provider 5xx or other upstream HTTP failure.

The contract is covered without network access by `apps/server/test/gateway-upstream-error.test.ts`. The real smoke command is the evidence required for a specific provider/account; skipped URLs are reported explicitly and do not count as validated.

## Director desk / clip-gen live path (opt-in)

Default `pnpm test` never calls a vendor. To prove a real picture then a real video against NX9's gateway:

```powershell
$env:NX9_REAL_PROVIDER_TEST='1'
$env:NX9_PROVIDER_HEALTHCHECK_URL='https://provider.example/v1/models'
$env:NX9_REAL_PICTURE_URL='http://127.0.0.1:PORT/api/gateway/picture'
$env:NX9_REAL_VIDEO_URL='http://127.0.0.1:PORT/api/gateway/video'
pnpm --filter @nx9/server test:real-provider
```

Acceptance on a live account (not automated here):

1. 导演台批出 1 镜 → `firstFrameAssetId` 为新 URL，且 `keyframeProvenance.role === director-color-keyframe`。
2. 若像素质检为 `suspect-monochrome`：关键帧仍保留、状态为 `review`，不得 `failed`。
3. 批准后推送 `directorKeyframeBatch`，clip-gen 逐镜消费，请求 `imageUrl` 与批准关键帧一致。
4. 未配置的 URL 记 SKIP，不记为已验收。

## BGM generation (not validated; import-only in UI)

NX9 的 BGM 真生成尚未接入任何 provider。`apps/server/src/modules/gateway/gateway-music.service.ts` 对所有提交请求恒定抛出 `BGM_NOT_IMPLEMENTED`，不会创建假成功任务。

当前产品行为：

- 声音生成节点的 BGM 模式为「仅导入音频」：通过素材库绑定已上传音频并写 `audioUrl`，不提供生成按钮。
- 画布 run 仍可能触发 music 分支，但网关会明确失败（`BGM_NOT_IMPLEMENTED`），不得在 UI 宣称可生成。
- 设置面板 BGM Provider / API Key 字段为预留，不代表真实生成已可用。

接入真实 provider 后的账号侧验收步骤：

1. 在设置中配置 provider 与短时 API Key。
2. BGM 节点提交生成任务，任务经 `/api/gateway/music` 完成并返回可播放 URL。
3. 节点 `audioUrl` 与任务 URL 一致，状态为 `success`，activity log 有 provider 标识。
4. 未配置的 provider 记 SKIP；任一请求返回占位 URL 视为验收失败。

验收人：账号侧手工放行，结果追加到本文件并注明日期。

## VG-08/28 audioUrl 音画对齐（产品后置，禁止半接线）

NX9 视频网关尚无稳定的音画对齐消费通道；`flow-runner` / 工作台不发送参考音、配乐轨或口型对齐请求。当前未在任何 UI 宣称「音画对齐」。

后置原因：产品未定义「参考音 / 配乐轨 / 口型」三种口径中的哪一种；半接线会产生假 UI。

触发条件：产品定义目标口径后，重新评估 VG-08/28（锚点：`docs/8.12/NX9-VIDEO-GEN-NODE-OPEN-LOOPS-R3.md` VG-48 / `docs/8.12/NX9-DEEP-REMAINING-GAPS-2026-08-12.md` DR-08），再决定是否接 provider 与组装器。
