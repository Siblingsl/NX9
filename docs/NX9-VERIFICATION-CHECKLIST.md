# NX9 逐功能验收测试清单

> 生成日期：2026-07-27
> 对应：`docs/NX9-PROJECT-DEFECT-ANALYSIS.md` 全部 52 项 F-xxx

## 前置条件

```bash
# 1. 安装依赖
pnpm install

# 2. 数据库迁移
cd apps/server && npx prisma migrate dev --name add-deleted-at && cd ../..

# 3. 构建 shared 包
cd packages/shared && pnpm build && cd ../..

# 4. 启动
pnpm run dev
```

---

## P0 项（5 项）

### F-001 约束指向（100%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | 打开 `约束开发要求.md` | 所有 `docs/` 路径指向 `NX9-PROJECT-DEFECT-ANALYSIS.md` | □ |
| 2 | 打开 `README.md` | 有「开发与缺陷台账」链接指向本文 | □ |

### F-002 画布主入口 + 制作台对等（90%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | 打开首页 | 主 CTA 为「打开画布」带「推荐」标签 | □ |
| 2 | 首页有「制作台」次要入口 | 文案含「兼容」 | □ |
| 3 | 进入制作台 | 顶栏显示链绑定徽标「画布·N台」或有「未绑定·前往画布」按钮 | □ |
| 4 | 制作台修改镜头标题 | 返回画布查看同一镜头，标题已同步 | □ |
| 5 | 无链时点击「前往画布」 | 跳转到画布 | □ |

### F-003 镜表按链隔离（95%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | 画布放置两个 storyboard-desk | 各自独立镜表 | □ |
| 2 | 在 Desk A 拆镜 3 个 | Desk B 不出现这 3 镜 | □ |
| 3 | 连接 Desk A → director-desk | 导演台只读 Desk A 的镜头 | □ |
| 4 | 导演台 3D 截图 | 写回 Desk A 的 chainStoryboard（非全局 store） | □ |
| 5 | 旧项目（仅有全局镜表） | 首次打开 storyboard-desk 时自动迁移 | □ |
| 6 | Playbook 执行 | readiness 使用 chainShots 而非全局 shots | □ |

### F-004 clip-gen 双轨清除（90%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | clip-gen 连接上游 storyboard-desk | 只消费该 desk 的镜头 | □ |
| 2 | clip-gen 批出视频 | videoAssetId 写回上游 desk 的 chainStoryboard | □ |
| 3 | clip-gen 卡面 | 无 episode-queue 遗留 UI | □ |

### F-028 制作台与画布同源（100%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | 制作台编辑镜头 | 只写链节点 chainStoryboard（不再双写全局） | [x] |
| 2 | 查看制作台顶栏绑定信息 | 显示 "与画布同源 · 链 {name}" | [x] |
| 3 | 画布分镜台与制作台同数据 | 链 SSOT 修改后另一处刷新可见 | [x] |
| 4 | 制作台剧本面板读 script-desk | getScriptPackage 全量提取 episode bodyMd（screenplayFullText） | [x] |
| 5 | setScriptPackage 只写 scriptPlan | 不覆盖 data.package（ScreenplayPackage 键归 ScriptDeskBlock） | [x] |
| 6 | sourceText 响应 SSOT | useMemo + useEffect 空补回 | [x] |
| 7 | f028-acceptance 测试 | 36 测全绿 | [x] |

---

## P1 项（9 项）

### F-005 删除 asset-gate（75%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | 打开 block 选择面板 | asset-gate 不出现（concealed） | □ |
| 2 | ScriptDesk 右侧 Tab | 有「设定就绪」面板 | □ |
| 3 | StoryboardDesk 交接 Tab | 有资产就绪预检条 | □ |
| 4 | 旧工作流含 asset-gate | 保留加载不崩溃 | □ |

### F-006 连接点默认仅左右（100%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | 选中任意节点 | 手柄仅在左右侧（未开 showExecPorts） | ✅ 行为测 |
| 2 | BlockShell `showExecPorts` | 默认 false | ✅ |
| 3 | exec 吸附 | 未开启时 validateConnectionWithHandles 拒绝 | ✅ |

### F-007 Playbook 就绪条件重写（100%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | 爆款参考步 | has_reference_board，不要求分镜镜头 | ✅ |
| 2 | 智能剪辑步 | has_timeline_draft | ✅ |
| 3 | 核心视频步 | has_video_assets，未批准不卡死 | ✅ |

### F-008 视频批准/审片（100%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | VideoWorkspace 有 approve/reject 按钮 | 可操作；打回必填原因 | ✅ |
| 2 | 批准后状态写回 chainStoryboard | 链数据更新且可读 | ✅ |
| 3 | reject 时输入原因 | reviewHistory 批注保存 | ✅ |

### F-009 Token 用量仪表（70%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | 打开设置→用量 | 显示 UsagePanel | □ |
| 2 | 面板展示 token 统计 | 按项目/模型聚合 | □ |

### F-010 回收站（100%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | 首页有回收站入口 | TrashPanel 可打开 | ✅ |
| 2 | 删除项目后出现在回收站 | 软删除（deletedAt 不为空） | ✅ |
| 3 | 点击恢复 | 项目恢复正常 | ✅ |
| 4 | 点击永久删除 | 项目从回收站移除 | ✅ |
| 5 | 素材库删除进资产回收站 | 确认「移入回收站」后可恢复 | ✅ |
| 6 | 画布顶栏/命令面板打开资产回收站 | AssetTrashModal 宫格可见 | ✅ |
| 7 | ≥30 天自动清理 | list/打开时 purgeExpired | ✅ |

### F-011 成片出口（100%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | ExportPackBlock 有模式选择 | FFmpeg/HF/Remotion/ZIP | ✅ |
| 2 | 文案明确「编排→智能剪辑，导出→本节点」 | 用户清晰理解入口 | ✅ |
| 3 | 无有效时间线点 HF/Remotion 导出 | `ok:false` / 禁用 / 不开 success | ✅ |
| 4 | Playbook `has_timeline_draft` | 真实 tracks[].clips≥1 就绪 | ✅ |
| 5 | ClipEditor 主 CTA | 「确认时间线并送交导出」 | ✅ |

### F-026 线稿 vs 关键帧职责边界（100%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | shot-story-cell 按钮无 "关键帧" | "试出" 替代 "关键帧" | [x] |
| 2 | batchMode type 'line-art' \| 'trial' | 不含 'keyframe' | [x] |
| 3 | 批量日志无 "批量关键帧" | 全部为 "批量试出" | [x] |
| 4 | StoryboardDesk 保留 "关键帧" 引用均指向导演台 | "整集关键帧请交导演台" 等 | [x] |
| 5 | DirectorDesk 为关键帧唯一批出入口 | "关键帧" tab + "批出" 按钮 + runDirectorDeskBatch | [x] |
| 6 | f026-acceptance 测试 | 41 测全绿 | [x] |

### F-030 爆款流程补智能剪辑（100%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | 选择爆款模板 pb-viral-short | 含智能剪辑步骤（smart-edit） | [x] |
| 2 | Playbook 就绪条件 | has_timeline_draft 可用且在 registry | [x] |
| 3 | generate 步 not-ready 不卡死 | has_viral_output OR 条件而非 all_videos_approved | [x] |
| 4 | smart-edit optional | 可跳过不阻塞 export | [x] |
| 5 | f030-acceptance 测试 | 48 测全绿 | [x] |

### F-052 核心模板去 asset-gate（70%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | tpl-core-episode 模板 | 不含 asset-gate 节点 | □ |
| 2 | 旧工作区打开 | migration 映射 asset-gate → script-desk | □ |

---

## P2 项（38 项）

### F-012 性能 Toast（100%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | 少节点 + 制作模式 | 无「节点较多」性能 Toast | ✅ |
| 2 | 创建 ≥80 节点或 ≥32 连线 | threshold Toast（降级特效） | ✅ |
| 3 | 创建 ≥500 个节点 | soft-warn Toast | ✅ |
| 4 | 创建 ≥1000 个节点 | danger-warn Toast（不硬锁） | ✅ |
| 5 | 同档再次达阈值 | 不重复 Toast；升档可再提示 | ✅ |
| 6 | 设置 → 偏好 | 可见当前性能档位 | ✅ |
| 7 | `node scripts/bench-canvas-nodes.mjs` | 写出 `docs/NX9-PERF-BENCH-RESULTS.md` | ✅ |

### F-013 工作流模板（92%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | 查看全部预配模板 `build()` | 无 asset-gate/audio-mix/review-gate；无 deprecated kind | ✅ |
| 2 | 模板产物 | 零 `migratedFrom`（TEST-RC-002） | ✅ |
| 3 | 模板名称/描述无「迁移」味 | 命名清晰、无旧能力链文案 | ❌ 仍有风格工坊/LibTV/moyin/字幕烧录/深度通道等 |
| 4 | 模板 `status: ga\|beta\|deprecated` + 启动器过滤 | deprecated 不进启动器 | ❌ 未实现 |
| 5 | `node()` 无 migrate 垫片 | 直接写活跃 kind，不经 `migrateBlockKind` | ❌ 仍挂垫片 |
| 6 | 启动器逐模板应用→画布可渲染 | 有记档 | ❌ 仅 build() 单测 |

### F-014 BGM 真接入（60%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | SoundGenBlock 选择 BGM 模式 | 调用 `/api/gateway/music` | □ |
| 2 | BGM 生成成功后返回音频 URL | 资产可播放 | □ |

### F-015 导出清单（85%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | ExportPackBlock 点击「生成 CSV 清单」 | 下载 CSV 文件 | □ |
| 2 | 点击「生成 PDF 清单」 | 打开 PDF | □ |
| 3 | 导出历史有「重新下载」按钮 | 可恢复历史导出 | □ |

### F-016 批量拆镜队列（60%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | StoryboardDesk 交接 Tab 显示 EpisodeQueueBar | 队列状态可见 | □ |

### F-017 构图模板（60%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | StoryboardDesk 镜头编辑 | 有「构图模板」下拉 | □ |
| 2 | 选择模板后保存 | compositionTemplateId 持久化 | □ |

### F-018 导演台机位预设（60%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | DirectorDesk 显示内置预设按钮 | 6 个预设 | □ |
| 2 | 点击预设 | 摄像机位置/角度/FOV 应用 | □ |
| 3 | 保存用户预设 | 可恢复 | □ |

### F-019 3D 摆位协议（60%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | DirectorDesk 有 AgentPoseInput | JSON 输入框 | □ |
| 2 | 输入合法 3D 摆位 JSON | 相机参数应用 | □ |
| 3 | 输入非法 JSON | 错误提示 | □ |

### F-020 Remotion 渲染（60%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | ClipEditorBlock 选择 Remotion 引擎 | 导出按钮可用 | □ |
| 2 | 调用 render-remotion API | 返回 taskId | □ |
| 3 | 轮询 remotion-tasks | 进度更新 | □ |

> ⚠️ 需安装 `@remotion/renderer` 包后真渲才可用

### F-021 README（80%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | README 模块计数 | ≥20 | □ |
| 2 | 有指向本文的链接 | 可点击 | □ |

### F-022 Desk 拆模块（60%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | desk-utils.ts 存在 | 导出工具函数 | □ |
| 2 | shot-story-cell.tsx 存在 | 镜头卡片组件 | □ |
| 3 | status-badge.tsx 存在 | 状态徽章 | □ |

### F-023 一致性检查（100%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | ScriptDesk 诊断 Tab | 有「运行手动一致性检查」按钮 | [x] |
| 2 | 点击后显示检查结果 | 列出矛盾/缺失/命名/时间线等 9 类问题 | [x] |
| 3 | 诊断项点击定位 | 跳转到 Bible Tab 并高亮对应角色/场景 | [x] |
| 4 | 一键修复缺失字段 | 自动填充 voiceNotes/appearance/location 占位 | [x] |

### F-024 @提及统一（100%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | useUnifiedMentions Hook 存在 | 可注入生成块 | [x] |
| 2 | mention-resolver 可解析 @引用 | 正确替换 | [x] |
| 3 | 5+入口行为一致 | flow-runner(pic+clip) + ClipGen + SoundGen + StoryboardDesk | [x] |
| 4 | 契约测覆盖 | resolveMentionsForPrompt / buildPromptWithReferences / MentionRef | [x] |

### F-025 交接引导（100%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | StoryboardDesk 交接 Tab | 有指引面板（流程清单+预览+确认按钮） | [x] |
| 2 | 流程说明显示 | sg3-checklist 预检条（镜数/构图/角色/场景/合并预览/确认状态） | [x] |
| 3 | ScriptDesk "送到分镜台" CTA | confirmed 后可见主按钮；点击 focus/spawn storyboard-desk | [x] |
| 4 | connectToSource 自动建边 | FlowSurface 消费 spawnData.connectToSource → edge script→storyboard | [x] |
| 5 | handoff payload 写入 | spawn data 含 handoff { from, to, fromId, at } | [x] |
| 6 | f025-acceptance 测试 | 30 测全绿（源码存在/按钮/CB/flow-cmds/FlowSurface/playbook/core-pipeline/handoff tab/helpers/studio-parity） | [x] |

### F-027 多上游解析规则（100%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | gatherUpstream 支持 policy 参数 | merge/primary 策略可选 | [x] |
| 2 | UpstreamPolicySelect UI | 下拉可切换全部合并/仅主要来源 | [x] |
| 3 | BlockShell 渲染选择器 | 所有节点底部显示 | [x] |
| 4 | 全 consumer 传 upstreamPolicy | ClipGen/SoundGen/use-upstream-prompt/use-upstream-media/flow-runner | [x] |
| 5 | resolveUpstreamSources contract | merge 全返回/primary 单返回/不存在回落/空数组 | [x] |
| 6 | mergeUpstreamData contract | 数组合并/标量取首/跳过 undefined | [x] |
| 7 | flow-runner clip-gen 多镜路径传 policy | 已补齐（曾缺失 gatherUpstream policy 参数） | [x] |
| 8 | flow-graph primarySourceId fallback 修正 | `?? blockId` → `\|\| undefined` | [x] |
| 9 | f027-acceptance 测试 | 36 测全绿 | [x] |

### F-029 timelineDraft 清理（100%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | workspace-document.timelineDraft | 已物理删除（不再存在于 store） | [x] |
| 2 | ClipEditorBlock 使用节点 data.timelineDraft | 非全局，仅节点级读写 | [x] |
| 3 | 全局无 setTimelineDraft 调用者 | 零调用者（setter 已删除） | [x] |
| 4 | PlaybookReadinessContext 无 timelineDraft | 类型字段已清除 | [x] |
| 5 | getSnapshotForSave 不含 timelineDraft | 不序列化到磁盘 | [x] |
| 6 | f029-acceptance 测试 | 29 测全绿 | [x] |

### F-031 链接解析失败（60%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | LinkParserBlock 输入无效链接 | 显示错误码 | □ |
| 2 | 有重试按钮 | 可重试解析 | □ |

### F-032 参考板约束（60%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | constraint-assembler 存在 | extractReferenceConstraints | □ |
| 2 | BUILTIN_COMPOSITION_TEMPLATES 已定义 | 9 种模板 | □ |

### F-033 电商规格包（60%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | ecom-specs.ts 定义 | 主图/短视频规格 | □ |

### F-034 声音剧闭环（65%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | tpl-voice-drama 模板 | 可创建 | □ |
| 2 | ClipEditorBlock 渲染 Tab | 有「注入对白音轨」按钮 | □ |
| 3 | 点击按钮后 | 对白行注入时间线 VO 轨 | □ |

### F-035 配方名实相符（60%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | 模板名称不含外文味 | 中文命名 | □ |

### F-036 子块与主链衔接（60%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | 4 种 utility block 在 registry | continuity-check/caption-asr/inpaint-edit/grid-compose | □ |
| 2 | flow-runner 可执行 | 支持这些 kind | □ |

### F-037 Bible→定妆/场景图（100%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | buildBibleImagePrompt 可用 | 构造生图提示词（character+scene 双分支） | [x] |
| 2 | 角色「生成定妆图」按钮 | 写回 referenceImageUrl | [x] |
| 3 | 场景「生成场景图」按钮 | 写回 creative.referenceUrls | [x] |
| 4 | 生成中态+错误提示 | Loading/disabled/error | [x] |
| 5 | f037-acceptance 测试 | 34 测全绿 | [x] |

### F-038 库权限模型（100%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | useLibraryAcl Hook 可用 | 返回 canRead/canWrite/canDelete 布尔值 | [x] |
| 2 | AssetLibraryModal 引用 ACL | 权限门面（canWrite/canDelete 守卫） | [x] |
| 3 | 服务端 403 强制 | PUT /api/public-library → ForbiddenException | [x] |
| 4 | 复制到项目按钮 | 公共非内置条目可复制到当前项目 | [x] |
| 5 | f038-acceptance 测试 | 30 测全绿 | [x] |

### F-039 dist 防污染（95%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | .gitignore 含 dist/ | 已存在 | □ |

### F-040 GenericBlock 兜底（95%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | 注册表中加载任意未知 kind | 显示错误卡 | □ |
| 2 | 废弃 kind（如 asset-gate） | 显示废弃卡 | □ |

### F-041 画布引导（85%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | 首次进入空画布 | 显示 EmptyCanvasGuide | □ |
| 2 | 引导提供三 CTA | Playbook/模板/命令面板 | □ |
| 3 | 关闭后不再显示 | localStorage 标记 | □ |

### F-042 深色主题（100%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | 切换深色模式 | 所有浮层/面板/弹窗背景适配 | [x] |
| 2 | 检查任意 portal 组件 | 无 bg-white 硬编码 | [x] |
| 3 | 全量 CSS 扫描 | background: #fff 已清零（12 文件 50+ 处迁移） | [x] |
| 4 | f042-acceptance 测试 | 51 测全绿 | [x] |

### F-043 摘要卡统一（100%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | 画布上选中任意 utility 节点 | 卡片使用 CanvasNodeShell 摘要卡；点"展开"显示工作区 | [x] |
| 2 | 检查 8 个 utility 块文件 | 均不直接 import BlockShell | [x] |
| 3 | f043-acceptance 测试 | 42 测全绿 | [x] |

### F-044 运行按钮统一（60%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | resolveRunLabel 字典存在 | 10+ 类型标签 | □ |

### F-045 WebGL 生命周期（100%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | 关闭 DirectorDesk | 3D shell dispose 被调用（Path A + B） | [x] |
| 2 | 浏览器 Tab 切后台 | 导演台 canvas 隐藏 + 降分辨率至 0.1 | [x] |
| 3 | f045-acceptance 测试 | 17 测全绿 | [x] |

### F-046 Hyperframes 导出（65%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | ExportPackBlock 选择 HF 模式 | 可发起渲染 | □ |
| 2 | 轮询进度 | 显示百分比 | □ |

### F-047 export_ready 对齐（98%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | Playbook readiness | export_ready 基于真实成功态 | □ |

### F-048 并发/重试配置（65%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | VideoWorkspace 设置 | 有并发数/重试次数配置 | □ |

### F-049 Bridge/Seedance 闭环（60%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | ClipGenBlock 选择 Seedance 模式 | 可运行 | □ |
| 2 | Bridge 续拍 | 基于上游镜头 | □ |

### F-050 智能剪辑确认（65%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | ClipEditorBlock 时间线编排后 | 有「确认时间线」按钮 | □ |
| 2 | 确认后 | confirmedAt 写入 | □ |

### F-051 服装道具预检（100%）

| # | 步骤 | 预期 | 结果 |
|---|------|------|------|
| 1 | AssetReadinessPanel | 显示服装+道具缺口 | [x] |
| 2 | 点击服装缺口 chip | 打开资产库服装 Tab | [x] |
| 3 | 点击道具缺口 chip | 打开资产库场景 Tab | [x] |
| 4 | f051-acceptance 测试 | 16 测全绿 | [x] |

---

## 核心冒烟测试

```bash
# 完整流程验证
1. 创建新项目
2. 默认进入画布
3. spawn script-desk → 粘贴剧本 → 确认成稿
4. spawn storyboard-desk → 拆镜 → 编辑镜头
5. spawn director-desk → 3D 预览 → 批出关键帧
6. spawn clip-gen → 生成视频
7. spawn clip-editor → 智能编排 → 确认时间线
8. spawn export-pack → 导出成片
9. 打开制作台 → 确认数据与画布一致
10. 删除项目 → 回收站 → 恢复 → 永久删除
```

---

## 统计

| 优先级 | 总数 | 已覆盖 |
|:------:|:----:|:------:|
| P0 | 5 | 5 |
| P1 | 9 | 9 |
| P2 | 38 | 38 |
| **全部** | **52** | **52** |

每项测试通过后请标记 `□ → ☑`
