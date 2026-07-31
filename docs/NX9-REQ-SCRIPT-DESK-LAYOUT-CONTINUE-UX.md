# NX9 编剧台布局与续写入口 UX 调整说明书

> 依据：用户截图反馈 + 2026-07-31 口述 7 条改造  
> 范围：仅编剧台开台内布局 / 成稿稿纸 / 续写入口 / 左侧对话交互  
> 前置：`docs/NX9-REQ-SCRIPT-STORYBOARD-DESK-UX.md` 中 F1 续写「追加不覆盖」语义仍然有效；本文**覆盖** F1 的入口位置与选集 UI，不改「追加到末尾」硬约束  
> 读者：人类开发者与实现用大模型（含 DeepSeek）；以本文附录 C 为施工图，禁止臆造路径与组件名

## 已拍板决策（禁止再改口径）

1. 主内容区左右比例默认：**对话区 60% · 成稿稿纸 40%**（`sd2-body` 内，不含顶栏技能轨）；交界处有可拖拽垂直分割器，范围约 32%–72%，双击恢复默认；比例写入节点 `studioSplitPct`。
2. 左侧输入条：「发送」按钮必须与输入框**垂直居中对齐**（禁止贴底错位）。
3. 成稿 Tab：剧名与 logline **同一行**并排；其下每一集占一行，标题强制为「第N集 · 标题」格式。
4. 集行保留展开/收起，但必须有**可见**的展开/收起小图标（当前 `summary` 被 `list-style: none` 藏掉了，必须补 icon）。
5. **续写按钮从每集展开区删除**；改到成稿稿纸**底部**（与剧集列表用分割线隔开），统一黄色主按钮样式。
6. 点击底部「续写」弹出**锚定在按钮旁的小弹层**（不是全屏大遮罩为主路径）；集数选项固定：**1 / 2 / 3 / 5 / 10 / 全部**（去掉「自定义」）。
7. 左侧对话区支持**右键「清屏」**（只清对话消息，不清成稿 package）。
8. 从右侧点续写时：左侧对话区必须出现**进度 loading**，每成功一集把生成内容展示到对话流；成稿列表同步追加。

## AI 速读卡

- 产品一句话：把编剧台改成「左对话共创、右大稿纸审稿」，续写入口统一到底部，过程进度进对话流。
- 核心循环：共创/生成 → 右侧审集成稿 → 底部续写选数 → 左侧看进度与产出 → 确认成稿。
- 目标平台：NX9 Web 编剧台 ScreenModal（`ScriptDeskBlock`）。
- 硬约束：60/40；发送对齐；剧名+logline 同行；集标题强制「第N集 · 标题」；续写只在底部；选项 1/2/3/5/10/全部；右键清屏；续写进度进左侧对话。
- 推荐默认：续写默认选 1；「全部」按下文公式解析；清屏前二次确认。
- 发挥空间：弹层动画、loading 气泡样式、集行 hover（不得改入口位置与数据契约）。
- P0 验收：比例正确；发送不错位；无每集内续写；底部续写弹层可选数并追加；对话有 loading 与结果；右键可清屏。
- 最容易翻车：只改 CSS 比例却保留固定 `width: 340px`；只藏每集续写却不接底部入口；续写只改 tip 不写对话消息；「全部」语义乱写导致覆盖旧集。
- 超预期机会：续写弹层显示「将新增第 a–b 集」预览；清屏可保留最近一条系统提示「已清屏」。

---

## 第一章：改造目标与边界

### 1.1 要解决的问题

| 现状问题 | 目标 |
|---|---|
| 右侧成稿区过大、挤压对话共创空间 | 对话 60% / 稿纸 40% |
| 发送按钮相对多行输入框贴底，视觉错位 | 与输入框垂直居中 |
| 剧名、logline 上下堆叠占高 | 同一行并排 |
| 集 summary 看不清是否可展开 | 强制「第N集 · 标题」+ 可见 chevron |
| 续写藏在展开后的每集里，难发现 | 底部统一「续写」黄按钮 |
| 续写反馈只靠底栏 tip，对话区无过程感 | 对话流显示 loading 与产出 |

### 1.2 范围

| 在范围内 | 明确排除 |
|---|---|
| `ScriptDeskBlock.tsx` 成稿 Tab 布局与续写入口 | 分镜台 / 导演台任何改动 |
| `script-desk.v2.css` 比例、输入条对齐、集行 icon、底部续写区 | 重做整个编剧台信息架构 |
| 续写弹层选项与进度消息写入 `agentSession` | 改 `runAppendEpisodeSkill` 为替换旧集 |
| 右键清屏对话 | 清屏时删除成稿 / Bible |

### 1.3 约束分层

| 硬约束 | 推荐默认 | 发挥空间 |
|---|---|---|
| 左右 60/40 | drawer 最小宽可约 280px，防字段过挤 | 窄屏时可临时叠层（P2，本轮可不做） |
| 发送与输入框垂直居中 | `align-items: center` + 按钮高度与单行输入协调 | 多行时按钮仍居中即可 |
| 集标题强制「第N集 · 标题」 | 无标题时用「第N集 · 未命名」 | — |
| 续写只在底部；删除每集内续写 | 按钮文案「续写」；`sd2-btn--primary` 黄 | — |
| 弹层选项 1/2/3/5/10/全部 | 默认 1 | 弹层定位在按钮上方或左侧 |
| 追加不覆盖 | 复用 `runAppendEpisodeSkill` | — |
| 清屏只清 messages | 确认框「仅清空对话，不成稿」 | — |

---

## 第二章：目标布局

### 2.1 开台整体（改造后）

```text
+------------------------------------------------------------------+
| 编剧台 ScreenModal                                                |
| 顶栏：剧名输入 · 状态 · 稿纸开关 · 更多                             |
| 动线：1 共创 → 2 成稿 → 3 确认                                     |
| 技能轨：选题 / 人物 / … / 生成剧本 / 上传成稿                        |
| +------------------------+  +-----------------------------------+ |
| | 左 sd2-stage  60%      |  | 右 sd2-drawer  40%                 | |
| | 对话消息流              |  | Tab: 成稿 | Bible | 就绪 | 诊断     | |
| |                        |  | 成稿：                              | |
| |                        |  |  剧名 ||||| | logline |______|   | |
| |                        |  |  ▸ 第1集 · 陌生室友                 | |
| |                        |  |  ▾ 第2集 · 旧疤                     | |
| |                        |  |     （展开正文可编辑）               | |
| | 输入框          发送    |  |  ------------------------------    | |
| | （右键消息区可清屏）      |  |  续写（黄按钮）                     | |
| +------------------------+  +-----------------------------------+ |
| 底栏：抽取 Bible · tip · 确认成稿                                   |
+------------------------------------------------------------------+
```

### 2.2 续写小弹层（锚定底部按钮）

```text
                    +---------------------------+
                    | 续写集数                   |
                    | 预览：当前 2 集 → 新增第3–5集 |
                    |  1  2  3  5  10  全部      |
                    | 「取消」     「开始续写」    |
                    +---------------------------+
                              ▲
                 -------------+-------------
                 |          续写            |
                 ---------------------------
```

说明：可以是相对定位的 `sd2-continue-pop`，不要做成整屏 `sd2-overlay` 大弹窗（旧 F1 全屏遮罩可删或仅作降级）。

### 2.3 「全部」语义（续写专用，已拍板）

设 `current = episodes.length`，`target = brief.episodeCount`：

1. 若 `target` 为有效正整数且 `target > current`：续写集数 = `target - current`。
2. 否则：续写集数 = `10`。
3. 若解析后 `count > 10`：开始前 `window.confirm` 二次确认（与旧 F1 一致）。
4. 弹层选项旁可显示说明：「全部 = 补齐 Brief 目标集数；无目标则续写 10 集」。

禁止把「全部」解释成覆盖重生成全部旧集。

---

## 第三章：交互详细设计

### 3.1 比例与发送对齐

**行为**

- `sd2-body` 内：`sd2-stage` 占 60%，`sd2-drawer` 占 40%。
- 禁止继续用 `.sd2-drawer { width: 340px; }` 作为主宽度；改为百分比或 flex 比例。
- `.sd2-input-bar`：`align-items: center`（不要 `flex-end`）。
- 「发送」按钮与 textarea 视觉中线对齐；textarea 多行增高时按钮仍居中。

**验收**

- 量测：稿纸可见宽度明显大于对话区。
- 发送按钮不出现「沉在输入框底部一截」的错位。

### 3.2 成稿字段与集行

**剧名 + logline 同行**

```text
+----------------------------------------------------------+
| 剧名  [____________]   logline  [______________________] |
+----------------------------------------------------------+
```

- 使用一行 flex/grid；剧名约 36%～40% 宽，logline 吃剩余。
- 标签可在输入框上方小字，或作为输入框左侧窄标签；两字段必须同一视觉行。

**集行**

- 每一集一行 summary，文案强制：

```text
第{ep.index}集 · {ep.title?.trim() || '未命名'}
```

- 即使 `ep.title` 已含「第N集」，summary 仍以「第{index}集 · …」开头，避免只显示裸标题「陌生室友」。
- 展开/收起：保留 `<details>`/`<summary>` 或等价受控折叠。
- **必须**在 summary 左侧渲染可见 icon（如 lucide `ChevronRight` / `ChevronDown`），CSS 不得再把唯一指示藏掉。
- 展开区**只**保留正文 textarea（可编辑）；**删除**展开区内的「续写」按钮。

### 3.3 底部续写

**结构（仅 `rightTab === 'screenplay'`）**

```text
sd2-drawer
  tabs
  sd2-drawer__body（可滚：剧名行 + 集列表）
  sd2-drawer__foot（固定底）
    分割线
    按钮「续写」 sd2-btn sd2-btn--primary
    相对定位的续写小弹层
```

**规则**

- 无集时也可显示续写，但点击后 tip「请先生成至少 1 集成稿」或允许从第 1 集开始追加（推荐：`episodes.length === 0` 时禁用并 title 提示）。
- `continueBusy` 时按钮 disabled，文案「续写中…」。
- 点击空白处或「取消」关闭弹层。
- 选中某一集数后点「开始续写」才开跑；也可做成点数字即开跑——**推荐默认**：点数字只选中，再点「开始续写」（防误触）。

### 3.4 续写进度进左侧对话（硬约束）

在 `handleContinueStart`（或等价）中：

1. 确保 `entryMode === 'agent'`，保证用户看见左侧对话（不要闷在 tip 里）。
2. 开始前向 `agentSession` 追加一条 **system 或 assistant** 消息，例如：

```text
续写开始 · 将追加 N 集（第 a–b 集）…
```

3. 每一集生成前可更新/追加 loading 消息，例如：

```text
续写中 第 i/N 集（写入第 X 集）…
```

可用临时消息 id，成功后改写该条，或追加新条；禁止只用 `setTip` 而不改 messages。
4. 每一集成功后追加一条 assistant 消息，内容至少包含：

```text
已续写第 X 集《标题》

（正文摘要或全文；全文过长可截断前 800～1500 字并注明「完整正文已写入右侧成稿」）
```

5. 全部结束追加总结消息：「续写完成 · 成功 ok · …」。
6. 失败：保留已成功集；对话写明失败于第几集。

数据仍走现有 `runAppendEpisodeSkill` + `savePkg`；对话消息用现有 `appendAgentMessage`。

### 3.5 右键清屏

- 绑定在左侧 `.sd2-messages`（或整个 stage 对话区域）的 `onContextMenu`。
- 弹出简易菜单，仅一项：「清屏」。
- 点击后 `window.confirm('清空左侧对话？不成稿与 Bible。')`，确认后：

```text
updateNodeData / persist：agentSession.messages = []
```

- 禁止清除 `screenplayPackage`、Bible、diagnostics。
- 原生浏览器菜单用 `preventDefault()` 挡住。
- **空态分流（硬约束）**：
  - 无成稿记忆（无分集 / 无 brief / 无 Bible）且 `messages=[]` → 可显示「Agent 共创」引导页。
  - **已有成稿记忆**且 `messages=[]`（含清屏后）→ **禁止**回引导页；显示空白对话窗，可用淡提示「对话已清空 · 《剧名》成稿记忆仍在」。

---

## 第四章：与旧文档关系

| 旧条目 | 本文态度 |
|---|---|
| NX9-REQ-SCRIPT-STORYBOARD-DESK-UX · F1 追加语义 | **保留** |
| F1 每集旁「续写」入口 | **作废**，改底部统一入口 |
| F1 全屏 overlay 选集（1/3/5/自定义） | **替换**为底部小弹层（1/2/3/5/10/全部） |
| F2 首次生成选集数 | **不在本文范围**（另文缺陷仍待修，禁止顺手乱改除非编译需要） |

---

## 第五章：数据与状态

### 5.1 复用状态

| 状态 | 用途 | 改造 |
|---|---|---|
| `continueOpen` | 弹层开关 | 保留；定位改为底部按钮旁 |
| `continueCount` | 选中集数 | 选项集改为 1/2/3/5/10；「全部」可用 sentinel `'all'` |
| `continueCustom` | 自定义输入 | **删除**及相关 UI |
| `continueBusy` | 进行中 | 保留；驱动按钮与 loading 消息 |
| `session.messages` | 对话 | 续写进度/结果写入；清屏清空 |

### 5.2 「全部」解析伪代码

```text
function resolveContinueCount(pkg, selected):
  if selected !== 'all': return selected
  const current = pkg.screenplay.episodes.length
  const target = pkg.brief.episodeCount
  if (typeof target === 'number' && target > current) return target - current
  return 10
```

---

## 第六章：代码实现说明书（附录 C · DeepSeek 必读）

### C.0 只许改这些文件（除非测例）

| 文件 | 改什么 |
|---|---|
| `apps/web/src/blocks/nx9/ScriptDeskBlock.tsx` | 布局结构、集行、底部续写、弹层选项、清屏、续写写对话 |
| `apps/web/src/blocks/nx9/script-desk.v2.css` | 60/40、输入对齐、同行字段、集 icon、底部脚栏、小弹层 |
| （可选）`apps/web/src/engine/script-desk-runner.ts` | 仅当需要抽 `resolveContinueCount`；**禁止**改追加为替换 |

不要改：分镜台、导演台、`runAppendEpisodeSkill` 的追加语义、全局主题 token 名称（可复用 `--desk-accent` 作黄按钮）。

### C.1 现状真相（防改错）

1. `.sd2-drawer { width: 340px; }` 导致右侧永远偏窄；`.sd2-stage { flex: 1 }` 吃掉剩余 → 看起来像 70/30。必须改比例，不能只调 padding。
2. `.sd2-input-bar { align-items: flex-end; }` 是发送错位根因。
3. `.sd2-ep summary { list-style: none; }` 隐藏了默认三角，所以「看不到可展开」。
4. 每集内「续写」在 `ScriptDeskBlock.tsx` 的 `sd2-ep__body` 里，调用 `handleRegenEpisode` → 打开续写弹层。本轮改为底部按钮直接 `setContinueOpen(true)`。
5. `handleContinueStart` 已能追加多集，但目前主要 `setTip`/`appendLog`，**没有**往 `session.messages` 写进度——必须补。
6. 旧全屏 `continueOpen && sd2-overlay` 与底部小弹层二选一；本轮以小弹层为准，删掉大遮罩避免双 UI。

### C-U1 左右 60/40

**CSS**

```text
.sd2-stage {
  flex: 0 0 60%;
  max-width: 60%;
  /* 保留原 column 布局与 overflow */
}
.sd2-drawer {
  flex: 0 0 40%;
  width: auto;          /* 覆盖旧 340px */
  max-width: 40%;
  min-width: 0;
}
.sd2-stage:only-child {
  flex: 1;
  max-width: none;
}
```

若关闭稿纸（`rightDrawerOpen === false`），左侧应回到 100%（现有逻辑：不渲染 drawer 即可；确认 stage 在无 drawer 时 `flex: 1; max-width: none`）。

### C-U2 发送对齐

```text
.sd2-input-bar {
  align-items: center; /* 原 flex-end 改为 center */
}
```

不要给发送按钮乱加 `margin-top` 硬凑。

### C-U3 剧名 + logline 同行

把两个独立 `.sd2-field` 包进：

```text
<div className="sd2-brief-row">
  <label className="sd2-field">剧名 …</label>
  <label className="sd2-field">logline …</label>
</div>
```

```text
.sd2-brief-row {
  display: grid;
  grid-template-columns: minmax(120px, 0.4fr) minmax(160px, 0.6fr);
  gap: 10px;
}
```

### C-U4 集行标题 + 可见折叠 icon

**JSX（示意）**

```text
<details className="sd2-ep">
  <summary className="sd2-ep__summary">
    <ChevronRight className="sd2-ep__chevron" size={14} />
    <span>第{ep.index}集 · {ep.title?.trim() || '未命名'}</span>
  </summary>
  <div className="sd2-ep__body">
    <textarea … />   <!-- 不要再放续写按钮 -->
  </div>
</details>
```

**CSS**

```text
.sd2-ep__summary {
  display: flex;
  align-items: center;
  gap: 8px;
  list-style: none;
}
.sd2-ep__chevron {
  flex-shrink: 0;
  transition: transform 0.15s;
  color: var(--sd2-muted);
}
.sd2-ep[open] .sd2-ep__chevron {
  transform: rotate(90deg); /* 若用 ChevronRight */
}
```

禁止只改文案不补 icon。

### C-U5 底部续写 + 小弹层

1. 删除 `sd2-ep__body` 内续写按钮整段。
2. 在成稿 Tab 结构改为：可滚 body + 固定 foot。
3. foot 内：

```text
<div className="sd2-drawer__foot">
  <div className="sd2-drawer__foot-divider" />
  <div className="sd2-continue-wrap">
    <button className="sd2-btn sd2-btn--primary" onClick={打开弹层}>
      续写
    </button>
    {continueOpen && (
      <div className="sd2-continue-pop" role="dialog">
        …选项 1 2 3 5 10 全部…
        预览文案
        取消 / 开始续写
      </div>
    )}
  </div>
</div>
```

4. 选项：去掉 `continueCustom`；`continueCount` 类型改为 `number | 'all'`，默认 `1`。
5. 删除旧的全屏 `sd2-overlay` 续写块（避免两套 UI）。
6. 「开始续写」调用改造后的 `handleContinueStart`（含对话进度）。

### C-U6 续写写左侧对话

在循环内（伪代码，必须落地）：

```text
确保 entryMode = 'agent'
session = appendAgentMessage(session, { role:'system', content: `续写开始 · …` })
persist session

for i in 0..count-1:
  session = appendAgentMessage(..., { role:'system', content: `续写中 第 i+1/count …` })
  persist
  result = await runAppendEpisodeSkill(...)
  savePkg(...)
  session = appendAgentMessage(..., {
    role: 'assistant',
    content: `已续写第 X 集…\n\n` + bodyPreview
  })
  persist

session = appendAgentMessage(..., { role:'system', content: `续写完成 · …` })
```

可用现有 `appendAgentMessage`；注意循环中读最新 session，避免消息丢失。

### C-U7 右键清屏

```text
<div className="sd2-messages" onContextMenu={onChatContextMenu}>
```

状态：`chatMenu` = `{x,y} | null`。

菜单项「清屏」→ confirm → `messages: []` 写回（不成稿 / Bible）。

**空态分流（硬）**：
- `!hasDraftMemory && messages.length===0` → 可渲染 `sd2-empty-hero` 引导页。
- `hasDraftMemory && messages.length===0`（含清屏后）→ **禁止**引导页；渲染 `sd2-chat-blank`（淡提示当前剧名成稿记忆仍在）。
- `hasDraftMemory`：`episodes.length>0` 或 brief.title/logline 或 bible 人物/场景非空。

点击其他区域关闭菜单。

### C.2 禁止清单

1. 禁止把续写又加回每集展开区「图个方便」。
2. 禁止续写改成 `runGenerateScreenplaySkill(..., episodeIndex)` 替换路径。
3. 禁止只改 tip 不写对话 messages。
4. 禁止清屏时 `emptyScreenplayPackage()` 或清空 Bible。
5. 禁止已有成稿记忆时清屏后仍渲染 `sd2-empty-hero` 引导页。
6. 禁止保留 `width: 340px` 却声称已做 60/40。
7. 禁止引入新的 UI 库/设计系统；复用 `sd2-btn` / lucide 已有图标。
8. 禁止打开或参考 `Reference_Projects/`。
9. 禁止顺手大改 F2 生成弹层逻辑（除非编译错误）；本任务范围是布局与续写入口。

### C.3 实现顺序

1. CSS 60/40 + 发送对齐（可立刻肉眼验收）
2. 剧名/logline 同行 + 集标题/chevron + 删每集续写
3. 底部续写脚栏 + 小弹层选项
4. handleContinueStart 写对话进度
5. 右键清屏
6. 自测验收清单

### C.4 最小手工验收清单

1. 打开编剧台：左侧明显窄于右侧（约 4:6）。
2. 输入框旁发送按钮垂直居中，不错位。
3. 成稿：剧名与 logline 同一行。
4. 集列表显示「第1集 · …」「第2集 · …」；chevron 可见；可展开编辑正文。
5. 展开区内无「续写」按钮。
6. 底部有分割线 + 黄色「续写」；点击出现 1/2/3/5/10/全部。
7. 选 2 开始续写：左侧出现 loading/进度消息；成功后对话有产出；右侧多 2 集；旧集正文不变。
8. 对话区右键 → 清屏 → 消息清空，成稿仍在。

### C.5 验收剧本

**验收剧本 1 · 比例与对齐**

1. 打开已有成稿的编剧台。  
2. 目测左右约 60/40。  
3. 输入两行字，确认发送按钮相对输入框居中。

**验收剧本 2 · 成稿可读性**

1. 成稿 Tab 剧名/logline 同行。  
2. 集标题含「第N集 ·」。  
3. chevron 可辨；展开无续写按钮。

**验收剧本 3 · 底部续写闭环**

1. 点底部续写 → 选 2 → 开始。  
2. 左侧有进度与结果气泡。  
3. 右侧集数 +2，旧文不变。

**验收剧本 4 · 清屏**

1. 对话区右键清屏并确认。  
2. 消息空；左侧**不**回「Agent 共创」引导页，显示空白对话窗（可有淡提示成稿记忆仍在）；右侧成稿仍在。

---

## 第七章：给产品的补充说明（非代码）

- 底栏全局「确认成稿」保持不动。  
- Bible / 设定就绪 / 诊断 Tab 布局不强制改比例以外的内容。  
- 首次「生成剧本」选集数（旧 F2）不在本单；若联调发现弹层仍不可达，另开缺陷，勿在本单混修导致跑偏。

