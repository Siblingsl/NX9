from pathlib import Path

def patch(path, pairs):
    p = Path(path)
    s = p.read_bytes().decode('utf-8-sig')
    norm = s.replace('\r\n', '\n')
    for old, new in pairs:
        if old not in norm:
            raise SystemExit(f'{path}: MISSING:\n{old[:240]}')
        norm = norm.replace(old, new, 1)
    out = norm.replace('\n', '\r\n')
    p.write_bytes(out.encode('utf-8-sig' if s.startswith('\ufeff') else 'utf-8'))
    print(f'patched {path}')

log = r'F:\code\project\NX9\docs\8.12\NX9-SCRIPT-DESK-DEEP-AUDIT-IMPLEMENTATION-LOG-2026-08-12.md'
patch(log, [
    ("> 状态：1.1 / 1.2 / 1.3 / 2.1 / 2.2 / 2.3 / 2.4 / 3.1 / 3.2 / 4.2 / 4.3 / 4.4 / 4.5 已闭环；3.3 与 4.1 记档不实施",
     "> 状态：1.1 / 1.2 / 1.3 / 2.1 / 2.2 / 2.3 / 2.4 / 3.1 / 3.2 / 3.3 / 4.2 / 4.3 / 4.4 / 4.5 已闭环；4.1 记档不实施"),
    ("| 3.3 | 体验 | ▫ | ⏸ 记档 | Agent 技能轨 SSE 后置，与 C-06 同类，本轮不实施 |",
     "| 3.3 | 体验 | ▫ | 已闭环 | `POST /api/agent/script-desk/chat-stream` + client `scriptDeskChatStream` + runner onChunk 分支 |"),
    ("""### 3.3 Agent 技能轨 SSE

- 状态：⏸ 记档
- 原因：分集生成/续写/重写已走 `scriptScreenplayStream`；`runScriptDeskSkill` 的 `api.scriptDeskChat` 整包返回属于技能轨体验债，文档明确「后置；与 C-06 同类，勿与 1.x 混做」。
- 触发条件：产品将技能轨纳入 C-06 SSE 专项后另行实施，本轮不做。""",
     """### 3.3 Agent 技能轨 SSE

- 状态：已闭环
- 改动文件：
  - `apps/server/src/modules/agent/agent.service.ts`：新增 `scriptSkillStream`，走 `gateway.proxyLlmStream` 流式回传，最后解析同一 JSON 契约
  - `apps/server/src/modules/agent/agent.controller.ts`：新增 `POST /api/agent/script-desk/chat-stream`，`text/event-stream` + done/error 事件
  - `apps/web/src/api/client.ts`：新增 `scriptDeskChatStream`，按 `data:` 行聚合 chunk 并回调 `onChunk`
  - `apps/web/src/engine/script-desk-runner.ts`：`runScriptDeskSkill` 增加 `onChunk` 分支，流式收敛后仍产出 `{patch, explanation}`
  - `apps/web/src/blocks/nx9/ScriptDeskBlock.tsx`：`handleAgentSend` 把 chunk 追加到 `streamPreview`，ChatStage 直接展示流式文本
- 行为变化：修复前技能轨整包等待黑盒；修复后长技能可见逐字输出，最终仍走「待应用产出」流程。
- 测试：新增 `apps/web/src/engine/__tests__/script-desk-sse.test.ts`：服务端端点/流方法、客户端解析、面板接线；web 定向 8 passed + server typecheck 通过。"""),
    ("- 总票数：15 | 已闭环：13 | ⏸ 记档：2 | 部分闭环：0",
     "- 总票数：15 | 已闭环：14 | ⏸ 记档：1 | 部分闭环：0"),
    ("1.1、1.2、1.3、2.1、2.2、2.3、2.4、3.1、3.2、4.2、4.3、4.4、4.5 已闭环；3.3、4.1 已记档不实施。",
     "1.1、1.2、1.3、2.1、2.2、2.3、2.4、3.1、3.2、3.3、4.2、4.3、4.4、4.5 已闭环；4.1 已记档不实施。"),
    ("""## ⏸ 后置项

- 3.3 Agent 技能轨 SSE：文档明确后置，与 C-06 同类，本轮不实施。
- 4.1 主文件行数债：无验收标准，本轮不新增重构，待独立工程债票。""",
     """## ⏸ 后置项

- 4.1 主文件行数债：按矩阵 A9 独立工程债票拆到 <1200 行（由主矩阵统一验收），本文不再另开。"""),
])

matrix = r'F:\code\project\NX9\docs\8.12\NX9-812-COMPLETION-MATRIX-2026-08-12.md'
patch(matrix, [
    ("| 4.4 / 4.5 | details 键盘 + 回归测例 | 测例已补 |",
     "| 3.3 | Agent 技能轨 SSE | `script-desk/chat-stream` + client `scriptDeskChatStream` + runner onChunk |\n| 4.4 / 4.5 | details 键盘 + 回归测例 | 测例已补 |"),
    ("| **Script 3.3** | `NX9-SCRIPT-DESK-DEEP-AUDIT-R3.md` | Agent 技能轨 SSE | 体验后置，与 C-06 同类 |\n", ""),
    ("| **SCRIPT-DESK R3** | P0/P1/P2 数据安全票 **已闭环**；SSE 与主文件体积债未做 |",
     "| **SCRIPT-DESK R3** | 数据安全票与技能轨 SSE **已闭环**；剩主文件体积债（A9 工程拆分） |"),
    ("3. **编剧 Agent 技能轨 SSE**（Script 3.3）  \n", ""),
    ("| `NX9-SCRIPT-DESK-DEEP-AUDIT-R3.md` | 12 | 0 | 2 |",
     "| `NX9-SCRIPT-DESK-DEEP-AUDIT-R3.md` | 13 | 0 | 1 |"),
    ("| **合计（去重前按文档计）** | **112** | **2** | **24** |",
     "| **合计（去重前按文档计）** | **113** | **2** | **23** |"),
    ("| 2026-08-12 | A3/A4/A5 智能剪辑诚实终态：SE-SPEC-02 直接替换禁用+能力位；SE-SPEC-05 未知供应商明确拒绝；SE-DEEP-12 beat-cut 元数据与 notes；相关 17+4+web/server typecheck 通过 |",
     "| 2026-08-12 | A3/A4/A5 智能剪辑诚实终态：SE-SPEC-02 直接替换禁用+能力位；SE-SPEC-05 未知供应商明确拒绝；SE-DEEP-12 beat-cut 元数据与 notes；相关 17+4+web/server typecheck 通过 |\n| 2026-08-12 | A6 Script 3.3 技能轨 SSE：新增 chat-stream 端点/客户端流式解析/runner onChunk/面板 streamPreview；web 定向 8 passed + server typecheck 通过 |"),
])
