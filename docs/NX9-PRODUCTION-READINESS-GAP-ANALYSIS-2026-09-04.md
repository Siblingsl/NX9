# NX9 为什么还做不出一部漫剧 · 生产力缺口分析（2026-09-04）

> **一句话结论：代码链路是完整的，缺的不是某个功能，而是「通道可用性」和「一次真实的端到端验证」。**
> 当前唯一的硬断点是 LLM 通道欠费（401），它卡死整条链的入口（拆镜/剧本/设定）；音频生成（BGM）是唯一确认未实现的能力；而成片渲染、配音这两环**从未在这台机器上真实跑出过一次产物**。

---

## 一、先说结论：链路代码本身是齐的

逐环核实的代码级证据（2026-09-04）：

| 环节 | 实现位置 | 状态 |
|---|---|---|
| 剧本→拆镜 | `script-breakdown-runner` + `/api/gateway/llm` | ✅ 真实现，**被 LLM 欠费卡死** |
| 关键帧批出 | `director-keyframe-batch-runner` + `/api/gateway/image` | ✅ 真实现；图片池可达（11 模型） |
| 图生视频 | `video-payload.util.ts` 支持参考图/首尾帧/`generateAudio` + `/api/gateway/video` + 轮询 | ✅ 真实现；whatstoken 可达（123 模型） |
| 配音 TTS | `/api/gateway/tts` + luxtts/voicebox 适配器 + sound-gen runner | ✅ 真实现，**从未产出过真实音频** |
| 多轨时间线 | `blocks/core/clip-editor/`（移动/裁剪/分割/转场/静音/撤销） | ✅ 8.12 审计确认整层重做完成 |
| 成片合成 | Remotion 组合 `Nx9Episode.tsx`：video+subtitle+audio 三层；`/api/montage/export-timeline`、`render-remotion`、`concat-episode`（ffmpeg） | ✅ 真实现（真 `renderMedia` 有测试），**`public/media` 输出目录为空 = 从未真实渲染过** |
| 字幕 | `timeline-export.ts` 自动从镜头对白生成 subtitle clip → `SubtitleClip` 烧录 | ✅ 有 |
| 假成功防护 | `gateway-music-honesty` / `hyperframes-honesty` / 取消 CAS 等 61 个 server 测试文件 | ✅ 8.12 审计列的 SRV-01/02/03 假成功已全部收口 |

**结论：不需要再「加功能」才能做漫剧。需要的是把链路上的真实依赖补齐并真跑一次。**

---

## 二、缺什么（按挡路程度排序）

### L1 · 通道层 —— 当前唯一的硬断点 + 三个未证实

`data/settings.json` 当前激活的四个通道（2026-09-04 实测 `models/list` 探测）：

| 通道 | 端点 | 可达性 | 实际可用性 |
|---|---|---|---|
| LLM（active） | opencode.ai/zen · deepseek-v4-flash | ✅ 可达（35 模型） | ❌ **401 Insufficient balance（欠费）→ 拆镜/剧本/一致性检查全线断** |
| 图片 | 号池 chatgpt-img · gpt-image-2 | ✅ 可达（11 模型） | ⚠ **从未真实出图验证**（7-30 曾出过图，当前池状态未知） |
| 视频 | whatstoken · MiniMax-H3-free | ✅ 可达（123 模型） | ⚠ **从未验证**：该模型是否支持图生视频？返回是否带音轨？7-14 仅出过 2 个小样片 |
| TTS | 同号池 · tts-1 | ✅ 可达（11 模型） | ⚠ `storage/audio` 为空 = **配音从未真实产出** |

另有备用 LLM 通道 freellmapi（`llm-default`，已存 key 但 isActive=false），可作欠费时的切换备选。

> 关键认知：仓库自己的 `docs/REAL-PROVIDER-VALIDATION.md` 明确写着——**浏览器 e2e 全部是 mock 路由，不证明任何外部供应商可用**；真实供应商验证是 opt-in 命令，从未跑过。「单测全绿」与「能出片」之间隔着这一层。

### L2 · 音频生成层 —— BGM 已接真实协议（2026-09-04 更新），音画对齐仍后置

- ~~**BGM 生成未实现**~~ **已实现**（2026-09-04）：`/api/gateway/music` 已注册（此前 controller 未挂载、恒 404），网关接 Suno 兼容聚合协议（提交 `/generate` → 轮询 `record-info`，宽解析状态与音频 URL）；未配置通道时仍诚实拒绝。设置→BGM 配 Provider + Base URL + Key 后，声音节点 BGM 模式出现「AI 生成」入口，画布 run 同链路。行为由 `gateway-music-honesty.test.ts`（7 例，mock upstream）守护。**真实账号未验证**（记 SKIP，见 REAL-PROVIDER-VALIDATION.md）。
- **音画对齐（口型/参考音）明确后置**：VG-08/28，产品口径未定，无半接线（这是诚实的设计决定，但意味着「角色开口说话口型对不上」这类效果做不了）。
- 声音剧闭环（F-034）台账自评 60%：配音→对白→导出样片从未证实。

**遮罩羽化全形状支持（2026-09-04 第二轮）**：菱形/心形此前不支持羽化（Inspector 禁用并注明），且心形 clip-path 用 px path + scale hack 存在比例失真。现已实现——心形改为经典曲线拟合的百分比多边形（与 rect/ellipse 同一 w/h 语义，顺带修正比例），菱形/心形羽化走 SVG feGaussianBlur 蒙版（`@nx9/shared` 纯函数 `heartPolygonPoints`/`diamondPolygonPoints`/`polygonFeatherMask`，blur 按画布长宽比分摊保证视觉一致），Remotion 成片与 @remotion/player 预览共用（`timeline-mask.test.ts` 4 例）。

**转场渲染层已接入（2026-09-04）**：时间线 wipe/shader 此前在渲染层降级为 fade；现已实现——fade 保持压黑渐隐，wipe 为延长窗口内置顶擦除（clip-path），shader 为预置滤镜（flash 闪白 / blur 模糊 / slide 滑出），由 `@nx9/shared` 的 `computeClipTransition` 纯函数驱动、Remotion 成片与 @remotion/player 预览共用（`timeline-transitions.test.ts` 4 例）。

### L3 · 端到端验证层 —— 从未真实跑通过一次「剧本→成片」

存储产物盘点（2026-09-04）：

| 目录 | 内容 | 说明 |
|---|---|---|
| `storage/images/` | 数张 7-30 的 PNG | 图片生成真跑通过 |
| `storage/videos/` | 2 个 7-14 的小 mp4（200-500KB） | 视频生成跑通过 2 次小样 |
| `storage/audio/` | **空** | TTS 配音从未产出 |
| `storage/exports/` | 只有联系表 PNG 和抽帧 JPG | **没有任何成片/导出视频** |
| `public/media/`（Remotion 渲染输出） | **空** | **Remotion 成片渲染从未真实执行过** |

也就是说：最后一环「时间线 → 成片 mp4」的代码有测试保护，但**真实渲染一次的记录为零**。ffmpeg/remotion 在这台机器上的真实依赖（Chrome headless、字体、编码器）未经过一次实战。

### L4 · 支线缺口 —— 不挡主干，但影响完成度宣称

完成度台账（`NX9-REAL-COMPLETION-LEDGER.md`）自认未闭环的项，均为主干之外的支线：
F-031 链接解析 80%、F-033 电商包 60%、F-034 声音剧 60%、F-035 线稿名实 45%、F-036 工具块衔接 65%、F-044 运行心智 70%、F-046 HyperFrames 取消 58%、F-047 export_ready 75%、F-048 并发单轨 58%、F-049 Seedance 闭环 45%、F-050 剪辑建议确认 75%。

---

## 三、最短补齐路径（建议按此顺序执行）

1. **救活 LLM 通道**（10 分钟）：给 opencode 充值，或在设置→连接里切换到已存 key 的 freellmapi 备用通道 → 重试拆镜，直到拿到真实镜表。这一步通了，链路入口就活了。
2. **花最小代价验证图片通道**（1 张图额度）：导演台批出 1 镜关键帧，确认号池真实出图、落 `storage/images`、节点状态 success。
3. **验证视频通道的三个未知**（1 条视频额度）：确认 MiniMax-H3-free 是否接受参考图（I2V）、是否需要换模型、返回是否带音轨。不合适就在设置里换 whatstoken 上的 I2V 模型。
4. **验证配音**（1 句话额度）：声音节点生成一句对白 TTS，确认 `storage/audio` 落文件、能进时间线配音轨。
5. **真渲一次成片**（0 额度，本地算力）：给时间线配齐 2-3 镜 + 字幕 + 配音/BGM（导入的），在智能剪辑台点渲染，跑通 Remotion 全链，验证 `public/media` 真出 mp4 且字幕/音轨正确。
6. **BGM 决策**：要么接一个真实 BGM provider（Suno/天工等）走完 F-014 的网关桩，要么产品上明确「配乐仅导入」，把 UI 文案对齐（当前已对齐，无假 UI）。
7. 以上每步按 `REAL-PROVIDER-VALIDATION.md` 的验收格式把结果记回该文档（SKIP 不算验收）。

完成 1-5 后，「能不能做漫剧」的答案就从「代码上能」变成「这台机器上真实做出过一部」。

---

## 四、与既有文档的关系

- `NX9-REAL-COMPLETION-LEDGER.md`：功能完成度真相源（F-xxx 维度，多数主链 G1+G2 绿）——本文不重复其结论，只补「通道 + 真实验证」维度。
- `REAL-PROVIDER-VALIDATION.md`：真供应商验证规程——本文 L1/L3 的验证动作应按其规程执行并回写。
- `NX9-FULL-PROJECT-OPEN-LOOPS-AUDIT-2026-08-12.md`：8.12 时列的 SRV-01/02/03 假成功已在当前测试套件中确认收口（`gateway-music-honesty` / `hyperframes-honesty` / 取消 CAS 全绿）。
- `NX9-UX-COMPLEXITY-ANALYSIS-2026-08-31.md`：操作复杂度维度——与本篇互补（那篇讲「难用」，这篇讲「做不出」）。
