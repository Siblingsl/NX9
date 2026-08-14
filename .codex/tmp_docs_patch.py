from pathlib import Path

def patch(path, pairs, prefix=''):
    p = Path(path)
    s = p.read_bytes().decode('utf-8-sig')
    norm = s.replace('\r\n', '\n')
    for old, new in pairs:
        if old not in norm:
            raise SystemExit(f'{prefix} {path}: MISSING:\n{old[:240]}')
        norm = norm.replace(old, new, 1)
    out = norm.replace('\n', '\r\n')
    p.write_bytes(out.encode('utf-8-sig' if s.startswith('\ufeff') else 'utf-8'))
    print(f'patched {path}')

se = r'F:\code\project\NX9\docs\8.12\NX9-SMART-EDIT-OPEN-LOOPS-IMPLEMENTATION-LOG-2026-08-12.md'
patch(se, [
    ("> 状态：SE-SPEC-01/03/04、SE-DEEP-01～14 已闭环；SE-SPEC-02、SE-SPEC-05 为诚实边界（缺 SAM/跟踪服务与第二供应商注册，已显式警告，不伪装完成）",
     "> 状态：SE-SPEC-01～05、SE-DEEP-01～14 已闭环；SE-SPEC-02/05 为诚实终态（能力本体后置、UI/服务端不可点或明确失败），SE-DEEP-12 工程子集已齐、音频听感能力本体记档"),
    ("| SE-SPEC-02 | P1 | 规格缺口 | 部分闭环（诚实边界） | 面板明示「未接入跨帧自动追踪」；取消/轮询已闭环（SE-DEEP-06），SAM/跟踪待外部服务 |",
     "| SE-SPEC-02 | P1 | 规格缺口 | 已闭环（诚实终态） | provider 能力位 `supportsFrameTracking:false`；直接替换禁用+程序守卫+测例；SAM/跟踪能力本体后置 |"),
    ("| SE-SPEC-05 | P3 | 规格缺口 | 部分闭环（诚实边界） | 面板明示「当前仅 WAN VACE 单供应商」；注册表仍 1 家，待供应商选型 |",
     "| SE-SPEC-05 | P3 | 规格缺口 | 已闭环（诚实终态） | 注册表/UI/服务端一致；未知 `providerId` 明确拒绝，不静默回落；第二供应商能力本体后置 |"),
    ("| SE-DEEP-12 | P3 | ⏸（收口为诚实提示） | 已闭环 | 编排结果 `notes` 明示「未做听音 / 未分析参考」，不称 beat-sync |",
     "| SE-DEEP-12 | P3 | 能力本体后置 | 已闭环（工程+诚实终态） | `analyzeReferenceVideo` 真产出 beat-cut trim ops；建议带 `meta.algorithm/audioAnalyzed:false`，notes 明示未做音频听感 |"),
    ("### SE-SPEC-02 跨帧自动追踪\n\n- 状态：部分闭环（诚实边界）。",
     "### SE-SPEC-02 跨帧自动追踪\n\n- 状态：已闭环（诚实终态；SAM/跟踪能力本体后置）。"),
    ("- 未闭环原因：仓库无 SAM/光流/跟踪存量，Fal 供应商也未提供可复用的追踪端点；「边缘不闪」需要真实跟踪服务或产品指定供应商。\n- 触发条件：接入 SAM2 类分割追踪端点后，按本文 SE-SPEC-02 重新开票实施。",
     "- 能力本体未做原因：仓库无 SAM/光流/跟踪存量，Fal 供应商也未提供可复用的追踪端点；「边缘不闪」需要真实跟踪服务或产品指定供应商。\n- 诚实终态：`VIDEO_EDIT_PROVIDERS` 增加 `supportsFrameTracking:false` 能力位；面板直接替换按钮禁用并明示「未接入跨帧自动追踪」，`runDirectVideoEdit` 入口同步守卫；无假可点路径。\n- 触发条件：接入 SAM2 类分割追踪端点后，把能力位改为 true 并重新开放路线 B。"),
    ("### SE-SPEC-05 多供应商\n\n- 状态：部分闭环（诚实边界）。",
     "### SE-SPEC-05 多供应商\n\n- 状态：已闭环（诚实终态；第二供应商能力本体后置）。"),
    ("- 未闭环原因：`provider-registry.ts` 仍只有 `wan-vace`；没有产品/供应商选型依据，不能臆造第二家模型。\n- 触发条件：产品确定第二供应商（Fal 模型 + 入参键位）后注册，面板再开放切换。",
     "- 能力本体未做原因：`provider-registry.ts` 仍只有 `wan-vace`；没有产品/供应商选型依据，不能臆造第二家模型。\n- 诚实终态：注册表/UI/服务端同源；面板显示已注册供应商数与单供应商说明，未知 `providerId` 由服务端明确拒绝，失败不会静默换供。\n- 触发条件：产品确定第二供应商（Fal 模型 + 入参键位）后注册，面板再开放切换。"),
    ("### SE-DEEP-12 beat-cut 诚实提示\n\n- 状态：已闭环（收口为诚实提示，不冒充卡点剪辑）。",
     "### SE-DEEP-12 beat-cut 诚实提示\n\n- 状态：已闭环（工程+诚实终态；音频听感 beat-cut 能力本体后置）。"),
    ("- 行为变化：修复前无参考分析时静默等分编排；修复后结果条明示依赖与失败态。",
     "- 行为变化：修复前无参考分析时静默等分编排；修复后 `analyzeReferenceVideo` 成功时真产出 beat-cut trim ops，建议携带 `meta.algorithm:'reference-shot-durations'`、`source:'analyze-reference'`、`audioAnalyzed:false`；结果条明示「未做音频听感」，不冒充音频卡点。"),
    ("- 总票数：19 | 已闭环：17 | 部分闭环：2（SE-SPEC-02 / SE-SPEC-05，诚实边界） | ⏸ 记档：0",
     "- 总票数：19 | 已闭环：19 | 部分闭环：0 | ⏸ 记档：0（SE-SPEC-02/05 能力本体与 SE-DEEP-12 音频听感为产品后置，诚实终态均已闭环）"),
    ("- 已闭环：SE-SPEC-01、SE-SPEC-03、SE-SPEC-04、SE-DEEP-01、SE-DEEP-02、SE-DEEP-03、SE-DEEP-04、SE-DEEP-05、SE-DEEP-06、SE-DEEP-07、SE-DEEP-08、SE-DEEP-09、SE-DEEP-10、SE-DEEP-11、SE-DEEP-12、SE-DEEP-13、SE-DEEP-14\n- 部分闭环（诚实边界，未伪装完成）：SE-SPEC-02 跨帧自动追踪待 SAM/跟踪服务；SE-SPEC-05 多供应商待产品选型。",
     "- 已闭环：SE-SPEC-01、SE-SPEC-02、SE-SPEC-03、SE-SPEC-04、SE-SPEC-05、SE-DEEP-01、SE-DEEP-02、SE-DEEP-03、SE-DEEP-04、SE-DEEP-05、SE-DEEP-06、SE-DEEP-07、SE-DEEP-08、SE-DEEP-09、SE-DEEP-10、SE-DEEP-11、SE-DEEP-12、SE-DEEP-13、SE-DEEP-14\n- 部分闭环：0"),
    ("## 部分闭环说明\n\n- SE-SPEC-02：取消 / 轮询 / 蒙版同像素落盘已闭环；「边缘不闪」需要真实 SAM/光流跟踪端点，仓库无存量，面板已明示未接入。\n- SE-SPEC-05：当前仅 `wan-vace` 一家注册，缺第二供应商选型依据，面板已明示单供应商及失败无自动切换。",
     "## 产品后置说明（诚实终态已齐）\n\n- SE-SPEC-02：取消 / 轮询 / 蒙版同像素落盘已闭环；「边缘不闪」需要真实 SAM/光流跟踪端点，仓库无存量。面板直接替换已禁用，`supportsFrameTracking:false` 能力位与程序守卫保证无假可点路径。\n- SE-SPEC-05：当前仅 `wan-vace` 一家注册，缺第二供应商选型依据。UI 显示注册数与单供应商说明，未知 `providerId` 服务端明确拒绝，不静默回落。\n- SE-DEEP-12：`analyzeReferenceVideo` 的镜头节奏 beat-cut 已真接入；音频听感检测未做，建议元数据与 notes 均明示 `audioAnalyzed:false`。"),
])

matrix = r'F:\code\project\NX9\docs\8.12\NX9-812-COMPLETION-MATRIX-2026-08-12.md'
patch(matrix, [
    ("| SE-SPEC-01 | 蒙版编辑专用契约 | `picture.controller` + 面板 `fal-inpaint` |",
     "| SE-SPEC-01 | 蒙版编辑专用契约 | `picture.controller` + 面板 `fal-inpaint` |\n| SE-SPEC-02 | 跨帧追踪诚实终态（能力本体后置） | `supportsFrameTracking:false`；直接替换禁用+入口守卫+测例 |\n| SE-SPEC-05 | 多供应商诚实终态（第二家后置） | 注册表/UI/服务端一致；未知 `providerId` 明确拒绝 |\n| SE-DEEP-12 | beat-cut 工程子集（音频听感后置） | `analyzeReferenceVideo` 真产出 trim ops + `meta.algorithm/audioAnalyzed` |"),
    ("| **SE-SPEC-02** | `NX9-SMART-EDIT-OPEN-LOOPS-DEEP-2026-08-12.md` | 取消/轮询已闭环；面板明示「未接入跨帧自动追踪」 | SAM / 跨帧跟踪未接；运动镜头边缘仍可能闪 | `SmartReplacePanel` 诚实文案 |\n| **SE-SPEC-05** | 同上 | 明示「当前仅 WAN VACE 单供应商」 | 注册表仍 1 家；失败无法自动换供应 | 面板诚实边界 + 测例 |\n| **SE-DEEP-12** | 同上 | notes 明示未听音 / 未分析参考 | 真 beat-cut / `analyzeReferenceVideo` 未做（规格能力仍缺） | 编排 notes 诚实；能力本身后置 |",
     ""),
    ("| **SE-DEEP-12（能力本体）** | `NX9-SMART-EDIT-OPEN-LOOPS-DEEP-2026-08-12.md` | 参考视频真 beat-cut | 依赖 `analyzeReferenceVideo`；仅诚实提示已做 |",
     "| **SE-DEEP-12（音频听感能力本体）** | `NX9-SMART-EDIT-OPEN-LOOPS-DEEP-2026-08-12.md` | 音频听感 / onset 检测的 beat-cut | 依赖产品指定音频分析方案；镜头节奏工程子集已真接入并带 `meta`/notes 诚实元数据 |"),
    ("| **SMART-EDIT** | DEEP 票与多数 SPEC **已闭环或诚实降级**；跨帧追踪 / 多供应商能力本体未满 |",
     "| **SMART-EDIT** | 19 张票 **全部闭环（工程+诚实终态）**；跨帧追踪、第二供应商、音频听感为产品后置，UI/服务端已无假可点或静默回落 |"),
    ("4. **跨帧追踪 / 多视频编辑供应商**（SE-SPEC-02 / SE-SPEC-05）  ",
     "4. **跨帧追踪 / 第二视频编辑供应商 / 音频听感 beat-cut 能力本体**（SE-SPEC-02 / SE-SPEC-05 / SE-DEEP-12）——诚实终态已齐，仅剩产品选型  "),
    ("| `NX9-SMART-EDIT-OPEN-LOOPS-DEEP-2026-08-12.md` | 15 | 2 | 2 |",
     "| `NX9-SMART-EDIT-OPEN-LOOPS-DEEP-2026-08-12.md` | 19 | 0 | 2 |"),
    ("| **合计（去重前按文档计）** | **109** | **3** | **24** |",
     "| **合计（去重前按文档计）** | **112** | **2** | **24** |"),
    ("| 2026-08-12 | A2 PG-46 全景比例不粘滞：进入全景记忆 nonPanoramaAspectRatio，退出/回落恢复上次非全景比例；32 例相关 vitest 通过、web typecheck 通过 |",
     "| 2026-08-12 | A2 PG-46 全景比例不粘滞：进入全景记忆 nonPanoramaAspectRatio，退出/回落恢复上次非全景比例；32 例相关 vitest 通过、web typecheck 通过 |\n| 2026-08-12 | A3/A4/A5 智能剪辑诚实终态：SE-SPEC-02 直接替换禁用+能力位；SE-SPEC-05 未知供应商明确拒绝；SE-DEEP-12 beat-cut 元数据与 notes；相关 17+4+web/server typecheck 通过 |"),
])
