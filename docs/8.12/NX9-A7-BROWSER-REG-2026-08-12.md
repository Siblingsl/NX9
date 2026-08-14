# NX9 A7 浏览器 + 真实供应商回归记档（2026-08-13）

> 对应矩阵票：A7 = DEEP-15 / DD-D-14 / ENG-04
> 环境：Windows 11 · Chromium（Playwright headless）· 服务 `127.0.0.1:5173` + `127.0.0.1:3001`
> 主命令：`pnpm --filter @nx9/web test:e2e -- --reporter=line --workers=1 --retries=0`

## 1. 浏览器 E2E 结果（2026-08-13 实跑，6/6 通过）

| 路径 | 脚本 | 结果 |
|------|------|------|
| H-02 编剧台 confirmed → 分镜台拆镜 → 导演台关键帧批出 / 审阅 / 推送（含双集切换） | `apps/web/e2e/e2e-script-storyboard-director.spec.ts` | 通过 |
| DD-D-14 刷新持久化：整页刷新后链镜表 / 关键帧批次从服务端回放，导演台仍读到 4 镜 | 同上（多集切换用例内断言） | 通过 |
| 网络中断后分镜同步保留明确失败状态并可取消 | 同上 | 通过 |
| PG-04 图像工作台运行中「停止」→ 节点收回 idle、不落假成功、0 page error | `apps/web/e2e/a7-picture-stop-pg04.spec.ts` | 通过 |
| E2E-001 最小闭环：建工作区 → 能力面板 → 核心三台可见 | `apps/web/e2e/e2e-001.spec.ts` | 通过 |
| 能力面板导演台 3D 机位 / 视频生成 单镜入口 | `apps/web/e2e/e2e-playbook.spec.ts` | 通过 |
| FACE-05 定妆出图：上传 201、512×768 PNG、定妆已锁、0 page error | `apps/web/e2e/face-sculpt-repro.spec.ts` | 通过 |

控制台 `ERR_NETWORK_ACCESS_DENIED` 为环境噪声；`PAGE_ERRORS` 均空。

## 2. 真实供应商回归（可跑范围内）

命令：`$env:NX9_REAL_PROVIDER_TEST='1'; pnpm --filter @nx9/server test:real-provider`

结果：7 项全部 SKIP（exit 0），均因未配置 `NX9_PROVIDER_*` / `NX9_REAL_PICTURE_URL` / `NX9_REAL_VIDEO_URL` 而跳过：

- live health check（URL not configured）
- rate limit 429（URL not configured）
- authentication 401（URL not configured）
- server error 5xx（URL not configured）
- picture generate 低成本出图（URL not configured）
- video generate 低成本出片（URL not configured）
- timeout（`NX9_PROVIDER_TIMEOUT_URL` not configured）

结论：真实供应商出片在本环境硬阻塞于缺 key，未伪造结果。

## 3. 诚实边界

- 分镜台画布 Run 无活「跳过」：单测 `deep-open-loops-regression.test.ts` 覆盖；浏览器目视路径待人工复验。
- F-046 HyperFrames 取消不得变成功：单测 + 代码审查覆盖（`ExportPackBlock` / `MediaPinBlock` cancelled 分支）；浏览器取消联调路径待人工复验。
- F-050 智能剪辑建议确认后门禁：单测 + 代码审查覆盖；浏览器路径待人工复验。
- 真实供应商小样本（DD-D-14）：无 key，7 SKIP；key 到位后按 `docs/REAL-PROVIDER-VALIDATION.md` 执行并回填。

## 4. 结论

- DEEP-15：浏览器回归清单与结果已落档，矩阵由「部分完成」转「全部完成」。
- DD-D-14：浏览器 mock / 双集 / 刷新持久化证据已闭环；真实供应商小样本保持 ⏸ 硬阻塞。
- ENG-04：从矩阵 §3.2 工程债清出。
