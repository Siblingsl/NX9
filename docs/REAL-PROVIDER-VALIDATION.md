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

## BGM generation (Suno 兼容协议已接入；真实账号未验证)

2026-09-04 起网关已接 Suno 兼容聚合协议（`gateway-music.service.ts`）：提交 POST `{baseUrl}/generate` → 本地任务号；轮询 GET `{baseUrl}/generate/record-info?taskId=` → 宽解析状态与音频 URL。未配置通道（无 Base URL / Key）或未知 provider 时仍明确拒绝（`BGM_NOT_IMPLEMENTED`），禁止占位成功；行为由 `gateway-music-honesty.test.ts`（7 例，含 mock upstream）守护。

当前产品行为：

- 设置→BGM：Provider（suno）+ Base URL + API Key 三项配齐后，声音生成节点 BGM 模式出现「AI 生成」入口；未配置时保持仅导入提示。
- 画布 run 的 music 分支（`runSoundGenBgm`）同样走该网关；未配置时明确失败。
- 服务端 `/api/gateway/music` 已注册进 GatewayModule（此前 controller 未挂载、恒 404，属死文件，已修复）。

真实账号侧验收步骤（未执行前记 SKIP）：

1. 在设置中配置 provider 与短时 API Key。
2. BGM 节点提交生成任务，任务经 `/api/gateway/music` 完成并返回可播放 URL。
3. 节点 `audioUrl` 与任务 URL 一致，状态为 `success`，activity log 有 provider 标识。
4. 未配置的 provider 记 SKIP；任一请求返回占位 URL 视为验收失败。

验收人：账号侧手工放行，结果追加到本文件并注明日期。

## 本机 `.env` 与台账边界

`MAGIC_HOUR_API_KEY` 等仅覆盖图像（Magic Hour）时，**不得**据此把 F-034 / F-035 / F-049 / SF-11 标 100%。有声短片需 TTS+多轨导出；Bridge/Seedance 需对应视频通道。图像冒烟成功可记 SKIP/部分，不计入上述闭环勾选。

**本机门禁状态（2026-09-11）**：进程环境未检出 TTS / 视频 / `NX9_REAL_PROVIDER_*` 真机开关 → F-034 / F-035 / F-049 勾选保持 `- [ ]`；缺陷总表维持 90% / 85% / 85%。配置有效密钥后按下列章节跑冒烟并勾选，再升完成度。

## F-034 / SF-11 · 有声短片真机样片（通道层，未勾选前禁止 100%）

Opt-in；默认 `pnpm test` 不跑真实 TTS/导出。

```powershell
$env:NX9_REAL_PROVIDER_TEST='1'
# 配置有效 LLM + TTS（及导出所需）密钥后再手工走模板
```

手工清单（全部勾选后才可将缺陷台账 F-034 标 100%）：

- [ ] 加载 `tpl-ai-short-film` 或 `tpl-voice-drama`，主链含 `sound-gen`，无假 `audio-mix`
- [ ] 对白 TTS 成功：节点 `audioUrl` / `voice.lines` 有真实可播 URL
- [ ] 智能剪辑挂上 VO 轨，起止与镜 `startSec/durationSec` 对齐（非全 0）
- [ ] 导出 `remotion-episode`（或等价多轨）得到可播样片，含对白轨
- [ ] 结果记入本节并注明日期；SKIP 不计入已验收

## F-035 / F-049 · Bridge / Seedance / 线稿 / episode-queue 真机演示

三条路径须分别勾选；mock 绿 ≠ 真机闭环。禁止将 F-035 / F-049 标 100% 直至下表完成：

### Bridge

- [ ] `videoMode: bridge`，上游有源视频；尾帧提取成功
- [ ] 续写 prompt 含上一镜内容；生成第二镜可播
- [ ] 无源视频时明确失败（非静默降级）

### Seedance（`model=seedance`，非 `videoMode`）

- [ ] 参考图/视频数量受 S-Class 上限约束；超限被拒
- [ ] 编译 prompt 含参考约束；任务成功回写 URL
- [ ] UI 无 `videoMode=seedance` 空开关

### Episode-queue

- [ ] 多集拆镜队列可暂停/继续/跳过/取消
- [ ] 单集失败可恢复；成功记入 `results`

### 线稿配方

- [ ] `tpl-line-art-storyboard` 批出为线稿职责（非导演关键帧假标签）

验收人：账号侧手工放行；日期与 SKIP 记入本节。

## VG-08/28 audioUrl 音画对齐（产品后置，禁止半接线）

NX9 视频网关尚无稳定的音画对齐消费通道；`flow-runner` / 工作台不发送参考音、配乐轨或口型对齐请求。当前未在任何 UI 宣称「音画对齐」。

后置原因：产品未定义「参考音 / 配乐轨 / 口型」三种口径中的哪一种；半接线会产生假 UI。

触发条件：产品定义目标口径后，重新评估 VG-08/28（锚点：`docs/8.12/NX9-VIDEO-GEN-NODE-OPEN-LOOPS-R3.md` VG-48 / `docs/8.12/NX9-DEEP-REMAINING-GAPS-2026-08-12.md` DR-08），再决定是否接 provider 与组装器。
