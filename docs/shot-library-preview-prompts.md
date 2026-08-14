# NX9 镜头库 · 预览视频生成提示词手册

> 用途：为公共镜头库 117 条内置运镜生成 **横画幅运动预览**（GIF/短视频）。
> 基础图：你提供的 **斜眼小蓝（蜜蜂版）** 机位参考图。
> 运镜正文：**原样引用** `docs/nx9-shot-seeds-neutral.json` 的 `promptZh` / `promptEn`，不改写项目真实运镜提示词。

---

## 0. 怎么用

1. 用下方约定的 **基础静帧**（建议从参考图里裁出 `01 正面中景` 或 `11 全身远景`，16:9）。
2. 图生视频时：上传同一张基础静帧。
3. 提示词 = **第 2 节锁定前缀** + **该条目的项目运镜提示词**（第 4 节，与种子文件一字不差）。
4. 成片建议 6–10 秒（以条目 `durationSec` 为准），无字幕 / 无 UI / 无水印；可再压成循环 GIF。

---

## 1. 基础图说明（已定稿）

| 项 | 内容 |
| --- | --- |
| 角色 | **斜眼小蓝（蜜蜂版）** |
| 风格 | 毛绒可爱 · 治愈系 · 圆润软萌 · 斜眼撇人 |
| 造型 | 短圆蓝色毛绒身体，半眯斜眼，小红嘴；黄黑条纹蜜蜂装 + 触角兜帽；背小白翅；斜挎棕色 `HONEY` 蜜罐 |
| 环境 | 浅灰 / 白棚影棚，柔光，干净留白；底部可有白色圆形站台 |
| 画幅 | 16:9 · MP4 / JPG |
| 用途 | 镜头库缩略预览、运镜视频预览、分镜参考 |

### 参考图里的 11 个机位（裁帧用）

你的基础参考图已包含常用机位；**做运镜视频时只选其中一张静帧当图生视频起点**，不要把整张拼图直接喂给模型。

| 编号 | 机位 | 建议用途 |
| --- | --- | --- |
| 01 | 正面（中景） | **默认主图**，覆盖绝大多数推/拉/摇/移/环绕 |
| 02 | 45度角（中景） | 侧跟、环绕起始 |
| 03 | 侧面（中景） | 侧移、过肩类辅助 |
| 04 | 背面（中景） | 跟随、背影揭示 |
| 05 | 低角度（仰拍） | 仰拍 / 升起类 |
| 06 | 高角度（俯拍） | 俯拍 / 下降类 |
| 07 | 大特写（表情） | 焦点 / 微距 / 表情冲击 |
| 08 | 半身特写（表情+配饰） | 半身推进、变焦 |
| 09 | 手部特写（配饰细节） | 蜜罐 / 细节揭示 |
| 10 | 半身近景（服装细节） | 服装纹理、近景推拉 |
| 11 | 全身远景（环境参考） | 航拍感、大全景起始、升降 |

**推荐默认：** 先用 `01 正面（中景）` 统一生成全库；个别条目效果差再换 `05/06/07/11`。

---

## 2. 图生视频锁定前缀（可加在运镜正文前）

> 这一段只负责「锁住斜眼小蓝」，**不替代**下面的项目运镜提示词。

### 中文

```
严格锁定参考图中的角色「斜眼小蓝（蜜蜂版）」：蓝色毛绒身体、半眯斜眼、黄黑条纹蜜蜂装、触角兜帽、小白翅、棕色 HONEY 蜜罐；不要换角色、不要换服装、不要换影棚浅灰背景。
只表现摄影机运动；角色尽量静止或仅有极轻微呼吸/眨眼（除非该条运镜明确要求走动）。
毛绒可爱治愈风，柔光干净，无字幕、无水印、无 UI、无额外文字。
```

### English

```
Lock the reference character "Squinty Little Blue (Bee Ver.)": blue plush body, half-closed squinting eyes, yellow-black bee suit, antenna hood, tiny white wings, brown HONEY pot. Do not change character, costume, or clean light-gray studio backdrop.
Camera motion only; keep the character nearly still except tiny breath/blink unless the shot requires walking.
Plush cute healing look, soft clean light. No subtitles, watermark, UI, or extra text.
```

---

## 3. 重要约定

- 下方每条的 **项目运镜提示词** = 种子文件字段 `promptZh` / `promptEn` 的**原文**。
- 不要把人物/场景细节改写进运镜正文；主体已由基础图注入。
- 若图生视频工具需要更短文案，可临时改用同条目的 `logicZh` / `logicEn`（运动逻辑），但仍以 `promptZh` / `promptEn` 为项目标准。

---

## 4. 全量镜头视频提示词（117）

说明：全部条目共用同一张斜眼小蓝基础静帧。每条复制时 = `第 2 节锁定前缀` + 下方 **项目运镜提示词**。

## 体系一：实拍物理规则内可实现

### 基础推拉变焦运镜

#### 1. 慢速推进 / Slow Dolly In

- ID：`shot-fcml-yj001` · 运镜族：`dolly` · 推 · 全景→特写 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：聚焦核心主体，引导观众视线，强化细节沉浸感，基础叙事运镜

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内匀速缓慢向前推进，从场景全景起始，最终定格在主体细节特写，全程无停顿。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~5s, slow steady dolly-in from a wide of the scene to a held detail close-up of the subject; continuous motion, no pause. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 2. 慢速拉出 / Slow Dolly Out

- ID：`shot-fcml-yj002` · 运镜族：`dolly` · 拉 · 全景→特写 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：展现主体所处环境，揭示整体场景，营造从细节到全局的叙事感，与慢速推进形成反向对比

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内匀速缓慢向后拉出，从主体细节特写起始，最终拉至场景全景，全程无停顿。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, slow steady dolly-out from a detail close-up of the subject to a full wide of the scene; continuous motion, no pause. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 3. 快速推进（冲击推进） / Snap Push-In

- ID：`shot-fcml-yj003` · 运镜族：`dolly` · 推 · 全景→特写 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：营造紧迫感、冲击力，突出关键主体的重要性，适配高光、悬念揭晓场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
前 2 秒保持场景全景静止，3-8 秒急速向前推进逼近主体，最后 2 秒定格在主体特写，全程 10 秒完成。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
First ~2s hold a wide of the scene; ~3–8s rapid push-in toward the subject; final ~2s hold on a subject close-up; complete within ~10s. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 4. 眩晕滑动变焦（希区柯克变焦） / Vertigo / Hitchcock Zoom

- ID：`shot-fcml-yj004` · 运镜族：`dolly` · 推 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：营造不安、紧张、悬疑的氛围感，强化主体的视觉冲击力，经典电影级运镜

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内摄像机匀速向后移动，同时镜头同步变焦放大，保持主体在画面中的大小始终不变，背景持续扩展，营造眩晕效果。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, camera tracks back while zooming in in sync so the subject stays the same size in frame as the background expands—vertigo / Hitchcock zoom. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 5. 极致微距变焦 / Macro Zoom In

- ID：`shot-fcml-yj005` · 运镜族：`dolly` · 推 · 特写 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破人眼视觉极限，展现极致微观细节，强化主体的质感与精致度，适配器物、特效细节特写

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内匀速平滑光学变焦，从主体特写起始，逐步变焦放大至主体微观纹理细节，全程机位静止，无位移。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, locked tripod; smooth optical zoom from a subject close-up into micro surface texture; no camera translation. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 6. 平滑连续推拉变焦 / Push–Pull Round Trip

- ID：`shot-fcml-yj006` · 运镜族：`dolly` · 推 · 全景→特写 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：适配单镜头内的细节 - 全局双向叙事

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内先匀速缓慢向前推进至主体特写，再匀速缓慢向后拉出至场景全景，全程连续无停顿，速度均匀无变速。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, slow dolly-in to a subject close-up, then slow dolly-out back to the starting wide; continuous, constant speed, no pause. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 7. 渐进式变速推拉 / Accel–Decel Dolly In

- ID：`shot-fcml-yj007` · 运镜族：`dolly` · 推 · 特写 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：适配情绪递进、悬念升级的叙事场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头向前推进，速度从极慢逐步加快，再逐步放缓，最终定格在主体细节特写，全程无停顿。变速顺滑无顿挫。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, dolly-in that eases from very slow to faster then eases again, ending on a detail close-up of the subject; smooth speed ramp, no hitch. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

### 角色定位构图运镜

#### 8. 过肩镜头 / Over-the-Shoulder

- ID：`shot-fcml-yj008` · 运镜族：`static` · 固定 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：模拟对话视角，增强观众的代入感，拉近与人物的距离，适配人物独白、对话场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内机位固定于近景人物左肩后方，越过肩膀框取对面座位，前景肩膀轻微虚化，中景座椅与背景全程清晰，镜头做极慢匀速推进。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, locked off behind the near character’s left shoulder, framing the opposite seat OTS; near shoulder soft, mid/background sharp; extremely slow push-in. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 9. 正反打镜头 / Shot / Reverse Shot

- ID：`shot-fcml-yj009` · 运镜族：`static` · 固定 · 中景 · 5s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：实现对话双方的视角无缝切换，对话叙事核心运镜

**项目运镜提示词 ZH**（`promptZh` 原文）

```
前 5 秒为过肩镜头，越过近景人物左肩框取对面座位；后 5 秒无缝切换为反向过肩镜头，从对面人物肩后框取人物面部，全程机位固定无位移，无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
First ~5s: OTS over the near character’s left shoulder to the opposite seat; next ~5s: seamless reverse OTS onto the character’s face; locked-off, no translation, no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 10. 鱼眼 / 窥视镜镜头 / Fisheye / Peephole

- ID：`shot-fcml-yj010` · 运镜族：`special` · 特殊 · 全景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：营造强烈的窥视感、悬疑感与不安感，适配上帝视角监视、对手暗中观察、悬疑叙事场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内全程通过圆形鱼眼窥视框取景，画面边缘暗角虚化，镜头缓慢推进，从室内场景全景逐步聚焦到人物面部，全程模拟门缝 / 锁孔窥视视角。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, circular fisheye/peephole framing with heavy vignette; slow push from interior wide toward the character’s face; door-crack / keyhole voyeur POV. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

### 障碍物与环境互动运镜

#### 11. 遮蔽物后揭示（擦拭式运镜） / Wipe Reveal Past Occluder

- ID：`shot-fcml-yj011` · 运镜族：`track` · 跟 · 全景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：营造窥视-揭晓的氛围感，增强场景的空间层次感，适配人物登场、悬念揭晓场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内匀速向右横向移动，起始机位在前景遮挡物后方，画面被前景遮挡物遮挡，随着镜头右移，逐步完整揭示出场景中的人物，最终定格在人物正面中景。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, steady truck right starting behind a foreground occluder; as the camera clears it, gradually reveal the character, ending on a frontal medium shot. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 12. 穿行镜头（飞越空隙） / Pass-Through Gap

- ID：`shot-fcml-yj012` · 运镜族：`track` · 跟 · 远景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：模拟观众走进场景的过程，增强空间的沉浸感与代入感，适配场景开场、空间进入叙事

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内匀速向前推进，起始机位在场景入口外，镜头穿过打开的木门空隙，持续向前推进，最终定格在场景中的人物的正面中景，全程无停顿。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, steady push from outside the entrance through an open doorway gap, continuing to a frontal medium of the character in scene; continuous, no pause. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 13. 前景遮挡转场运镜 / Foreground Wipe Transition

- ID：`shot-fcml-yj013` · 运镜族：`track` · 跟 · 全景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：通过前景遮挡实现画面的无缝切换，易用

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头匀速向右横移，前 3 秒画面为场景中的人物，4-7 秒镜头经过前景遮挡立柱，立柱完全遮挡画面，最后 3 秒镜头横移完成，露出人物的侧面全景，全程无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, truck right: first ~3s on the character; ~4–7s pass a foreground pillar that fully wipes the frame; final ~3s exit to a side wide of the character; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 14. 缝隙窥视推进运镜 / Peek-Through Push-In

- ID：`shot-fcml-yj014` · 运镜族：`dolly` · 推 · 特写 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：强化悬疑感与窥视感，营造逐步深入的叙事节奏，适配悬疑探查、秘密观察场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头从场景门的缝隙起始，匀速向前推进，穿过门缝进入室内场景，持续推进至人物面部特写，全程模拟从门缝窥视并逐步靠近的视角。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, start in a door gap, push through into the interior, continue to a facial close-up; voyeur peek that gradually approaches. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

### 焦点与镜头操控运镜

#### 15. 模糊转清晰（焦外淡入） / Rack Focus Soft→Sharp

- ID：`shot-fcml-yj015` · 运镜族：`special` · 特殊 · 全景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：模拟人眼睁眼、从模糊到清晰的视觉过程，营造开场、入梦、回忆切入的氛围感

**项目运镜提示词 ZH**（`promptZh` 原文）

```
前 3 秒画面完全失焦模糊，4-8 秒画面缓慢匀速聚焦，最后 2 秒完全清晰锁定主体、次要道具与人物全景，全程机位无任何位移。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
First ~3s fully soft; ~4–8s slow rack to sharp; final ~2s fully sharp on subject, secondary prop, and character in a wide relationship; no camera translation. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 16. 清晰转模糊（焦外淡出） / Rack Focus Sharp→Soft

- ID：`shot-fcml-yj016` · 运镜族：`special` · 特殊 · 特写 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：模拟人眼闭眼、意识模糊的视觉过程，营造结尾、入梦、意识消散的氛围感

**项目运镜提示词 ZH**（`promptZh` 原文）

```
前 3 秒画面完全清晰锁定主体特写，4-8 秒画面缓慢匀速失焦，最后 2 秒画面完全模糊，全程机位无任何位移。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
First ~3s fully sharp on a subject close-up; ~4–8s slow rack out; final ~2s fully soft; no camera translation. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 17. 焦点转移（前景→背景） / Focus Pull FG→BG

- ID：`shot-fcml-yj017` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：不移动机位即可完成主体切换，引导观众视线在画面内转移，营造叙事层次感，适配对话、多主体互动场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
前 3 秒焦点锁定前景的主体，背景人物完全虚化；4-7 秒焦点匀速从主体转移至背景的人物；最后 3 秒焦点锁定人物，前景主体完全虚化，全程机位无任何位移。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
First ~3s focus on foreground subject (background character soft); ~4–7s focus pull to background character; final ~3s lock on character with foreground soft; no translation. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 18. 循环呼吸焦点运镜 / Breathing Focus Oscillation

- ID：`shot-fcml-yj018` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：营造柔和的呼吸感与氛围感，适配器物特写、空镜、情绪铺垫场景，避免画面呆板

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头焦点在前景的主体与背景的人物之间，做匀速循环的呼吸式切换，焦点切换节奏均匀，全程机位无任何位移。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, focus oscillates in a steady breathing rhythm between foreground subject and background character; even tempo; no camera translation. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

### 三脚架固定基础运镜

#### 19. 上摇镜头 / Tilt Up

- ID：`shot-fcml-yj019` · 运镜族：`pan_tilt` · 上摇 · 特写 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：垂直方向拓展视野，从下至上揭示场景，营造从细节到环境的递进感，适配主体登场、环境揭示

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内匀速垂直向上摇镜，从场景台面的台面物件特写起始，缓慢上摇至人物面部、头顶窗户、窗外景致，全程机位固定。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, steady tilt up from tabletop/detail close-up through the character’s face to window and exterior beyond; locked tripod position. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 20. 下摇镜头 / Tilt Down

- ID：`shot-fcml-yj020` · 运镜族：`pan_tilt` · 下摇 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：与上摇镜头形成反向对比，从上至下锁定核心主体，引导观众视线聚焦，适配主体揭晓、细节展示

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内匀速垂直向下摇镜，从窗外景致、窗户起始，缓慢下摇至人物面部、人物手部、场景台面台面物件，全程机位固定。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, steady tilt down from exterior/window through the character’s face and hands to tabletop detail; locked tripod position. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 21. 水平摇镜（左右摇镜） / Horizontal Pan

- ID：`shot-fcml-yj021` · 运镜族：`pan_tilt` · 摇 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：水平方向拓展视野，展现横向空间的完整环境，适配大场景横向展示、多主体依次揭示场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内机位固定，匀速水平向右摇镜，从室内场景左侧的前景遮挡物起始，平稳摇至中间的人物，再摇至右侧的窗户，全程无停顿。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, locked tripod, steady pan right from a left-side occluder across the character to a right-side window; continuous, no pause. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

### 滑轨横向运镜

#### 22. 左横移 / Truck Left

- ID：`shot-fcml-yj022` · 运镜族：`track` · 左移 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：拓展横向视野，展现画面内的并列元素，营造平稳的叙事节奏，适配多主体展示

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内匀速向左横向移动，从次要道具在画面右侧、主体在左侧的起始构图，平稳横移至次要道具在画面左侧、主体在右侧的最终构图，全程主体始终在画面内。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, steady truck left rearranging a two-element composition (secondary prop ↔ subject) while keeping the subject in frame throughout. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 23. 右横移 / Truck Right

- ID：`shot-fcml-yj023` · 运镜族：`track` · 横移 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：与左横移形成反向对比，适配画面元素的叙事顺序，引导观众视线横向移动

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内匀速向右横向移动，从次要道具在画面左侧、主体在右侧的起始构图，平稳横移至次要道具在画面右侧、主体在左侧的最终构图，全程主体始终在画面内。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, steady truck right as the reverse of the left truck; keep the subject in frame throughout. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 24. 渐进变速横移 / Accel–Decel Truck

- ID：`shot-fcml-yj024` · 运镜族：`track` · 横移 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：适配情绪递进、主体逐步揭晓的场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头向左横向移动，速度从极慢逐步加快，再逐步放缓，最终定格在人物正面中景，全程主体始终在画面内，变速顺滑。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, truck left with ease-in/accelerate/ease-out, ending on a frontal medium of the character; subject stays in frame; smooth ramp. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

### 环绕运镜

#### 25. 180 度环绕运镜 / 180° Orbit

- ID：`shot-fcml-yj025` · 运镜族：`orbit` · 环绕 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：全方位展现人物与所处环境，营造沉浸式的人物刻画氛围，适配人物独白、心境展现场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内以人物为圆心，匀速完成半周 180 度环绕运镜，从人物正面起始，环绕至人物背面，全程人物始终处于画面中心，焦点全程锁定人物。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, 180° orbit around the character from front to back; character stays centered; focus locked. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 26. 360 度环绕运镜 / 360° Orbit

- ID：`shot-fcml-yj026` · 运镜族：`orbit` · 环绕 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：全方位展现人物与所处的大场景，营造强烈的动态氛围感，适配人物高光登场、气场展示场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内以人物为圆心，匀速完成完整的 360 度环绕运镜，全程人物始终处于画面绝对中心，焦点全程锁定人物，画面平稳无抖动。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, full 360° orbit with the character absolutely centered; focus locked; stable, no shake. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 27. 慢速电影弧线运镜 / Slow Cinematic Arc

- ID：`shot-fcml-yj027` · 运镜族：`orbit` · 环绕 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：比直线横移更具电影感，柔和地展现人物的侧面轮廓，适配人物状态刻画、氛围感叙事

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内以人物为中心，沿宽弧线匀速向右前方移动，从人物的左侧面起始，缓慢弧线运动至人物的右侧面，全程焦点锁定人物，画面平稳顺滑。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, wide slow arc from the character’s left profile toward the right profile; focus locked; smooth cinematic path. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 28. 变速环绕运镜 / Variable-Speed Orbit

- ID：`shot-fcml-yj028` · 运镜族：`orbit` · 环绕 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：适配节奏变化、情绪升级的叙事场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内以人物为圆心完成 360 度环绕，前 3 秒慢速环绕，4-7 秒快速环绕，最后 3 秒再放缓至静止，全程人物始终处于画面中心。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, 360° orbit: slow for ~3s, faster ~4–7s, ease to a stop in the final ~3s; character stays centered. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

### 垂直升降运镜

#### 29. 台座上升 / Pedestal Up

- ID：`shot-fcml-yj029` · 运镜族：`crane` · 升 · 特写 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：垂直方向完整展现人物状态，从细节到人物面部，引导观众视线向上聚焦，适配人物情绪刻画

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内匀速垂直上升，从人物人物持物手部特写起始，垂直上升至人物面部特写，最终定格在人物的眼平高度，全程机位无水平位移。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, pedestal up from a hands/held-object close-up to a facial close-up at eye height; no horizontal travel. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 30. 台座下降 / Pedestal Down

- ID：`shot-fcml-yj030` · 运镜族：`crane` · 降 · 特写 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：与垂直上升形成反向对比，引导观众视线聚焦人物的动作细节，适配动作刻画、细节展示

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内匀速垂直下降，从人物面部特写起始，垂直下降至人物人物持物手部特写，最终定格在武器特写，全程机位无水平位移。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, pedestal down from a facial close-up to a hands/held-object close-up, ending on a weapon/prop detail; no horizontal travel. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 31. 吊臂上升（俯角揭示） / Crane Up Reveal

- ID：`shot-fcml-yj031` · 运镜族：`crane` · 升 · 全景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：从人物到环境的宏大揭示，营造从个体到全局的史诗感，适配场景开场、宏大环境展示

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内匀速垂直上升，从人物的上半身中景起始，持续吊臂上升，镜头同步缓慢向下俯仰，最终定格在场景全景的高空俯拍视角，完整展现整个场景空间与人物的位置。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, crane up from an upper-body medium while tilting down, ending on a high wide of the whole space and the character’s place in it. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 32. 吊臂下降（着陆运镜） / Crane Down Landing

- ID：`shot-fcml-yj032` · 运镜族：`crane` · 降 · 全景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：与吊臂上升形成反向对比，从宏大环境聚焦到核心人物，营造人物登场、主角降临的氛围感

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内匀速垂直下降，从场景全景的高空俯拍视角起始，持续吊臂下降，最终定格在人物的上半身中景，全程焦点逐步锁定人物。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, crane down from a high wide of the space into an upper-body medium of the character; focus gradually locks on the character. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 33. 垂直升降 + 俯仰联动运镜 / Crane with Tilt Link

- ID：`shot-fcml-yj033` · 运镜族：`crane` · 升 · 全景→特写 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：实现更丝滑的场景揭示，宏大叙事常用运镜

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头匀速垂直上升，同时同步缓慢向下俯仰，从人物的手部特写起始，上升至高空俯角，最终定格在场景全景，升降与俯仰完全同步。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, crane up linked with a slow downward tilt from a hand detail to a high wide of the space; rise and tilt fully synced. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

### 光学镜头特效运镜

#### 34. 平滑光学变焦推进 / Smooth Optical Zoom In

- ID：`shot-fcml-yj034` · 运镜族：`dolly` · 推 · 全景→特写 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：实现无位移的画面放大，避免推拉运镜带来的透视变化，适配主体特写、细节聚焦场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内机位完全静止，仅通过光学镜头匀速放大，从场景全景起始，逐步放大至主体细节特写，全程无位移。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, locked tripod; optical zoom only from scene wide to subject detail close-up; no translation. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 35. 平滑光学变焦拉出 / Smooth Optical Zoom Out

- ID：`shot-fcml-yj035` · 运镜族：`dolly` · 拉 · 全景→特写 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：实现无位移的画面缩小，展现主体所处的完整环境，适配从细节到全局的叙事场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内机位完全静止，仅通过光学镜头匀速缩小，从主体细节特写起始，逐步缩小至场景全景，全程无位移。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, locked tripod; optical zoom only from subject detail close-up out to scene wide; no translation. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 36. 骤拉变焦（冲击变焦） / Crash Zoom

- ID：`shot-fcml-yj036` · 运镜族：`dolly` · 推 · 全景→特写 · 5s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：营造强烈的视觉冲击与紧迫感，适配高光瞬间、关键信息突现场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
前 2 秒保持场景全景静止，3-5 秒急速变焦直推主体特写，最后 5 秒保持特写静止，全程机位无位移。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
First ~2s hold scene wide; ~3–5s crash zoom to subject close-up; remain in close-up for the rest; no camera translation. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 37. 渐进式光学变速变焦 / Accel Optical Zoom

- ID：`shot-fcml-yj037` · 运镜族：`dolly` · 推 · 全景→特写 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：适配情绪递进、悬念升级的场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内机位完全静止，仅通过光学镜头变焦，速度从极慢逐步加快，再逐步放缓，从人物全身全景变焦放大至眼部特写，全程无位移。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, locked tripod; optical zoom eases slow→fast→slow from a full-body wide into an eye close-up; no translation. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

### 无人机 / 航拍专属运镜

#### 38. 无人机飞越运镜 / Drone Flyover

- ID：`shot-fcml-yj038` · 运镜族：`special` · 特殊 · 远景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：展现宏大场景的纵深与广度，营造沉浸式的飞行体验，适配大场景开场、环境展示

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内无人机匀速向前飞越，从城市上空起始，向前飞越场景空间、远山，最终定格在开阔远景全景，全程画面平稳。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, drone flies steadily forward from above a city across space and terrain, ending on a wide open vista; smooth aerial. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 39. 史诗级无人机上升揭示运镜 / Epic Drone Rise Reveal

- ID：`shot-fcml-yj039` · 运镜族：`crane` · 升 · 远景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：比普通吊臂上升更具冲击力，展现超广域的宏大场景，营造史诗级的叙事氛围，适配世界观展示、大场景开场

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内无人机匀速向前飞越 + 同步上升，起始机位对准场景中的人物，随着镜头向前飞越并持续上升，逐步揭示出场景后方的建筑群与远处山脉，最终定格在宏大全景。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, drone flies forward while rising, starting on the character and revealing architecture and distant terrain behind, ending on an epic wide. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 40. 大规模无人机环绕运镜 / Wide Drone Orbit

- ID：`shot-fcml-yj040` · 运镜族：`orbit` · 环绕 · 远景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：展现超大规模场景的完整全貌，营造极致的史诗感与宏大感，适配世界观全景展示、史诗级开场

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内无人机以整个城市为圆心，匀速完成宏大的 360 度全景环绕，全程场景中的人物始终处于画面中心，焦点锁定人物。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, drone completes a vast 360° orbit around a city-scale center with the character pinned in frame center; focus locked. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 41. 垂直俯拍上帝视角运镜 / Top-Down God’s Eye

- ID：`shot-fcml-yj041` · 运镜族：`crane` · 升 · 远景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：打造全知全能的上帝视角，展现人物与环境的全局关系，营造上帝凝视、全局掌控的氛围感

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头垂直向下，以人物为中心缓慢匀速旋转，全程保持高空上帝视角，完整展现人物在场景中的位置与整个城市的布局，焦点锁定人物。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, top-down God’s-eye with a slow rotation around the character, showing their place in the layout; focus locked. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 42. FPV 无人机俯冲（瀑布俯冲）运镜 / FPV Dive

- ID：`shot-fcml-yj042` · 运镜族：`special` · 降 · 全景→特写 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：营造极致的速度感与冲击力，适配高光时刻、高潮技能降临、紧张对峙场景，是打斗高频运镜

**项目运镜提示词 ZH**（`promptZh` 原文）

```
前 2 秒保持城市高空全景静止，3-8 秒 FPV 无人机急速垂直俯冲，从高空直冲向场景中的人物，最后 2 秒定格在人物面部特写，全程 10 秒完成。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
First ~2s hold a high city wide; ~3–8s FPV vertical dive toward the character; final ~2s hold on a facial close-up; complete within ~10s. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 43. 鹰眼极端俯角运镜 / Extreme High-Angle Eagle Eye

- ID：`shot-fcml-yj043` · 运镜族：`crane` · 升 · 远景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：比普通上帝视角更具压迫感，展现人物在宏大环境中的渺小感，适配全局叙事、上帝视角监视场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内保持高空极端俯角，镜头匀速向前飞越，从城市上空起始，向前飞越至场景中的人物，全程保持垂直向下的鹰眼视角，焦点锁定人物。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, extreme high angle, fly forward from above the city to the character while staying near-vertical eagle-eye; focus locked. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

### 风格化动态运镜

#### 44. 手持纪实风格运镜 / Handheld Documentary

- ID：`shot-fcml-yj044` · 运镜族：`special` · 手持 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：营造纪实感、临场感与紧张感，适配第一人称潜入、沉浸式闯入场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头模拟手持摄像机的自然微幅抖动，缓慢向前推进，从场景入口逐步推进至人物身前，全程贴合真人手持拍摄的呼吸感与不稳定性。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, handheld micro-sway with a slow push from the entrance to in front of the character; natural breath, no violent shake. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 45. 快速摇镜（甩镜） / Whip Pan

- ID：`shot-fcml-yj045` · 运镜族：`special` · 摇 · 特写 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：营造强烈的视觉冲击与意外感，适配悬念揭晓、惊吓瞬间、关键信息突现场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
前 3 秒镜头锁定人物面部特写，第 4 秒迅猛横向甩镜至场景另一侧的场景另一侧目标，5-10 秒保持静止锁定场景另一侧目标，甩镜过程带自然动态模糊。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
First ~3s lock a facial close-up; at ~4s whip-pan to another side of the space with natural motion blur; hold the new target ~5–10s. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 46. 荷兰角（滚转倾斜）运镜 / Dutch Angle Roll

- ID：`shot-fcml-yj046` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：打破常规水平构图，营造紧张、不安、悬疑的氛围感，适配人物情绪波动、悬念叙事场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头沿 Z 轴缓慢匀速倾斜，从水平构图起始，逐步倾斜至 30 度荷兰角构图，全程焦点锁定人物，机位无位移。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, slow roll on Z from level to ~30° Dutch angle; focus on the character; no translation. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 47. 震动冲击运镜 / Impact Shake

- ID：`shot-fcml-yj047` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：强化动作的冲击力与力量感，适配打斗、碰撞、爆炸等强动态场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内人物攻击动作击中撞击目标的瞬间，镜头配合冲击做同步的微幅震动，其余时间画面稳定，震动节奏与攻击冲击完全匹配。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, otherwise stable frame; on the impact moment, add micro camera shake synced to the hit, then stabilize again. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

### 主体追踪运镜

#### 48. 引领镜头（反向追踪） / Lead Tracking (Reverse)

- ID：`shot-fcml-yj048` · 运镜族：`track` · 跟 · 近景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：模拟面对面跟随的视角，增强观众与人物的互动感，适配人物登场、独白、对峙场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
人物 10 秒内匀速面向镜头向前行走，镜头同步匀速向后倒退，与人物的行走速度完全匹配，全程人物始终处于画面中心，距离保持不变。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, character walks toward camera; camera dollies back at matched speed; character stays centered at constant distance. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 49. 跟随镜头（正向追踪） / Follow Tracking

- ID：`shot-fcml-yj049` · 运镜族：`track` · 跟 · 近景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：模拟观众跟随人物的视角，增强场景的沉浸感，适配人物探索、场景进入叙事

**项目运镜提示词 ZH**（`promptZh` 原文）

```
人物 10 秒内匀速背向镜头向前行走，镜头同步匀速向前跟随，与人物的行走速度完全匹配，全程人物的背部始终处于画面中心，距离保持不变。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, character walks away; camera follows at matched speed; back of character stays centered at constant distance. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 50. 平行侧跟运镜 / Lateral Side Track

- ID：`shot-fcml-yj050` · 运镜族：`track` · 跟 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：精准跟随人物的横向移动，保持人物的构图稳定，适配人物行走、动作展示场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
人物 10 秒内匀速从场景空间左侧走到右侧，镜头与人物保持平行，同步匀速横向移动，全程人物始终处于画面中心，焦点锁定人物。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, character crosses laterally; camera trucks parallel, keeping the character centered; focus locked. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 51. 第一人称行走运镜 / Walking POV

- ID：`shot-fcml-yj051` · 运镜族：`special` · POV · 近景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：极致的第一人称沉浸式体验，模拟观众亲自走进场景的视觉感受，适配沉浸式叙事、第一人称探索场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头模拟真人步行前进的自然起伏运动，从场景入口匀速向前推进至人物身前，全程贴合真人步行的上下起伏节奏，无剧烈抖动。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, walking-POV bob from the entrance up to the character; natural footfall rhythm, no violent shake. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 52. 超高速运动锁定跟拍 / High-Speed Locked Track

- ID：`shot-fcml-yj052` · 运镜族：`track` · 跟 · 近景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：适配超高速打斗场景，精准捕捉动作细节，同时保持画面的冲击力与流畅度，是高速打斗核心运镜

**项目运镜提示词 ZH**（`promptZh` 原文）

```
人物 10 秒内完成一套极速攻击的连贯动作，镜头全程同步跟拍，零延迟锁定人物的手部与武器，无论动作多快，主体始终处于画面中心，焦点全程清晰。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, track a rapid continuous action phrase with zero-lag lock on hands and weapon/prop; subject stays centered; focus sharp throughout. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

### 时间与速度操控运镜

#### 53. 超延时摄影（移动延时） / Moving Hyperlapse

- ID：`shot-fcml-yj053` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：展现时间的快速流逝，营造时空压缩的视觉效果，适配环境变化、时间推移的叙事场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头匀速向前推进，画面时间超高速加速，天空光影快速变化，环境飘落物飞速飘落，形成光影拖尾效果，全程镜头运动与时间加速完全同步。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, camera pushes forward while time hyper-accelerates (sky/light and falling particles streak); motion synced to time compression. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 54. 慢动作适配运镜 / Slow-Motion Compatible Move

- ID：`shot-fcml-yj054` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：放大动作的细节与张力，营造高光时刻的仪式感，适配打斗名场面、关键动作特写

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内人物完成攻击动作，画面做超慢动作处理，镜头同步围绕人物完成 180 度环绕运镜，全程画面清晰无卡顿，运镜与慢动作完全同步。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, slow-motion action while the camera completes a 180° orbit around the character; move and slow-mo fully synced; clean frames. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 55. 定格帧延运镜 / Freeze-Frame Hold

- ID：`shot-fcml-yj055` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突出关键动作的高光瞬间，营造时间暂停的视觉冲击，适配名场面定格、关键动作强调场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
前 3 秒人物完成攻击动作，第 4 秒画面瞬间定格，镜头在定格画面内完成 3 秒环绕运镜，最后 3 秒画面恢复运动，人物完成收势动作，全程 10 秒无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
First ~3s action plays; at ~4s freeze; ~3s orbit inside the freeze; final ~3s resume motion into a recovery/finish; no cuts across ~10s. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

### 极端定向与透视运镜

#### 56. 桶滚旋转（漩涡盗梦镜头） / Barrel Roll / Inception Spiral

- ID：`shot-fcml-yj056` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：营造强烈的眩晕感、失控感、时空错乱感，适配精神视角入侵、幻境、打斗失控场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头匀速向前推进，同时沿前进方向顺时针完成 360 度桶滚旋转，全程焦点锁定场景中央的人物，画面旋转顺滑无抖动。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, push forward while barrel-rolling 360° about the travel axis; focus locked on the centered character; smooth spiral. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 57. 虫眼追踪（地面视角）运镜 / Worm’s-Eye Track

- ID：`shot-fcml-yj057` · 运镜族：`special` · 跟 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：极致放大人物的高大感与压迫感，营造对手登场、强者降临的强大气场，适配人物高光展示

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头沿地面低角度匀速向前推进，全程保持地面仰视视角，从场景入口起始，向前推进并仰视锁定场景中央的人物，最终定格在人物的全身仰视镜头。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, ground-scraping low-angle push from the entrance, looking up to lock the centered character; end on a full-body low-angle hold. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 58. 鹰眼极端俯角运镜 / Extreme High-Angle Eagle Eye

- ID：`shot-fcml-yj058` · 运镜族：`crane` · 升 · 远景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：比普通上帝视角更具压迫感，展现人物在宏大环境中的渺小感，适配全局叙事、上帝视角监视场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内保持高空极端俯角，镜头匀速向前飞越，从城市上空起始，向前飞越至场景中的人物，全程保持垂直向下的鹰眼视角，焦点锁定人物。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, extreme high-angle forward fly from above the city to the character; near-vertical eagle-eye; focus locked. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

## 体系二：AI/CG 专属・突破现实物理规则

### 空间物理规则突破类运镜

#### 59. 无限尺度连续运镜 / Infinite Scale Continuum

- ID：`shot-fcml-yj059` · 运镜族：`special` · 特殊 · 远景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破镜头变焦与位移的物理极限，实现从微观到宏观的无限尺度连续展现，营造世界观的宏大感与无边际感

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内完成无缝连续运镜，从关键道具的微观金属纹理起始，逐步变焦拉出，依次展现人物全身、开阔远景全景、峡谷、城市、行星尺度全景，最终定格在宇宙尺度远景，全程无切镜、无断点。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, continuous scale continuum from micro metal texture of a key prop out through body, vista, canyon, city, planet, ending in cosmic wide; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 60. 宇宙级超速变焦运镜 / Cosmic Crash Zoom

- ID：`shot-fcml-yj060` · 运镜族：`special` · 特殊 · 全景→特写 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破空间位移与变焦的物理极限，实现从宏观宇宙到微观人物的瞬间跨越，营造极致的视觉冲击力与史诗感

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内完成超速变焦，从万里高空的星空全景起始，瞬间超速变焦，穿过开阔远景、远山、城市，最终定格在空中运动的人物的眼部特写，全程无切镜、无断点。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, cosmic crash zoom from a star-field wide through vista/terrain/city into an eye close-up of an airborne character; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 61. 无介质全穿行运镜 / Through-Solid Flythrough

- ID：`shot-fcml-yj061` · 运镜族：`special` · 特殊 · 远景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破实体介质的物理限制，镜头可穿过所有实体物体，营造沉浸式的空间穿梭感，适配跨场景飞行、精神视角探查叙事

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头匀速向前推进，依次无缝穿过开阔远景、山体、峡谷岩壁、城市的城墙、建筑，全程无任何遮挡、穿帮，最终定格在空中运动的人物身后，全程无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, push forward seamlessly through clouds/terrain/walls/architecture with no occlusion artifacts, ending behind an airborne character; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 62. 瞬移跟拍运镜 / Teleport Track

- ID：`shot-fcml-yj062` · 运镜族：`special` · 跟 · 近景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破空间位移速度极限，完美适配瞬移、超高速打斗场景，是高速打斗的核心高频运镜

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内，人物完成 3 次瞬间空间瞬移，每次瞬移后镜头零延迟同步锁定人物的位置，全程无切镜，主体始终处于画面中心，焦点全程清晰。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, character teleports ~3 times; camera reacquires with zero delay each jump; no cuts; subject stays centered; focus sharp. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 63. 空间折叠运镜 / Space Fold Move

- ID：`shot-fcml-yj063` · 运镜族：`special` · 特殊 · 远景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破三维空间规则，通过空间折叠实现跨场景瞬间跳转，营造超现实的时空穿梭感，适配跨地图、跨次元叙事

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头向前推进，画面空间同步折叠，从开阔远景之上的人物身前，通过空间折叠，瞬间跳转至城市的街道上空，再折叠跳转至峡谷深处，全程无切镜、无断点。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, push while space folds: from in front of the character above a vista, fold to above a city street, then into a canyon depth; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 64. 反重力自由运镜 / Anti-Gravity Free Cam

- ID：`shot-fcml-yj064` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破重力物理规则，实现无约束的镜头自由运动，适配幻境、失重空间、精神视角空间场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头无视重力规则，做任意方向的无轨迹悬浮运动，从人物身前，向上、向下、向左、向右自由漂浮移动，全程焦点锁定人物，无固定运动轨迹。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, gravity-free free-cam drift (up/down/left/right) around the character with no fixed path; focus locked. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 65. 无限环绕运镜 / Endless Orbit

- ID：`shot-fcml-yj065` · 运镜族：`special` · 环绕 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破实拍环绕的物理空间限制，实现无边界的环绕运动，适配宏大场景下的人物气场展示、世界观环绕叙事

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内以人物为圆心，实现无限半径、变速的环绕运镜，从近距离环绕逐步扩大至环绕整个开阔远景，再收缩回近距离环绕，全程人物始终处于画面中心，焦点锁定人物。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, orbit the character while radius expands to encompass a whole vista then contracts back to close orbit; subject stays centered; focus locked. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 66. 零半径轴心旋转运镜 / Zero-Radius Pivot Spin

- ID：`shot-fcml-yj066` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破实拍机位的物理限制，无需环绕空间即可实现主体轴心旋转，极致展现人物的 360 度细节，营造强大的人物气场

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内以人物的心脏为轴心，完成 360 度零半径旋转运镜，镜头完全贴合人物的身体轴心旋转，无需环绕空间，全程人物始终处于画面绝对中心，焦点锁定人物。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, 360° zero-radius spin pivoting on the character’s body axis (no orbit path needed); absolute center lock; focus locked. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 67. 跨体积缩放运镜 / Cross-Scale Volume Zoom

- ID：`shot-fcml-yj067` · 运镜族：`special` · 特殊 · 全景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破镜头体积的物理限制，实现宏观到微观的无缝缩放穿梭，适配关键道具内部、微观世界、精神视角空间场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头本身实现体积缩放，从万米开阔远景全景视角瞬间缩小至微米级，进入关键道具的道具内部纹路，全程无切镜、无断点。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, camera scale-jumps from kilometer-scale vista into micron-scale interior grain of a key prop; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 68. 无惯性极速启停运镜 / Inertia-Free Snap Start/Stop

- ID：`shot-fcml-yj068` · 运镜族：`special` · 特殊 · 全景→特写 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破运动惯性物理规则，极致放大快与静的反差，营造超强的视觉冲击力，适配打斗的高潮技能顿停、高光名场面

**项目运镜提示词 ZH**（`promptZh` 原文）

```
前 3 秒镜头以光速向前冲向攻击的人物，第 4 秒瞬间静止，定格在武器尖端的特写，5-8 秒保持静止，最后 2 秒极速向后拉出至场景全景，全程 10 秒完成，零惯性启停，无多余抖动。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
First ~3s ballistic rush toward an attacking character; at ~4s hard stop on weapon tip close-up; hold ~5–8s; final ~2s snap pull-out to scene wide; zero inertia, no mush. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 69. 多路径同步运镜 / Multi-Path Sync Move

- ID：`shot-fcml-yj069` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破单镜头的物理限制，同一时间展现主体的多个角度，适配人物全方位展示、名场面多视角同步叙事

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内同一时间，镜头沿正面、侧面、背面 3 条不同路径同步运动，同时展现人物的正面、侧面、背面 3 个角度，画面无缝融合，全程无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, simultaneously present front/side/back paths fused into one continuous multi-angle view of the character; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

### 时间维度全操控类运镜

#### 70. 完美子弹时间（时间冻结全环绕） / Bullet-Time Orbit Freeze

- ID：`shot-fcml-yj070` · 运镜族：`special` · 环绕 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：完全突破时间规则，极致展现打斗高光瞬间的所有细节，营造超强的视觉张力，是打斗名场面核心运镜

**项目运镜提示词 ZH**（`promptZh` 原文）

```
前 2 秒人物释放远程攻击特效，第 3 秒画面内所有物体完全时间冻结（远程攻击特效、飘落的环境飘落物、人物的动作全部静止），4-9 秒镜头围绕冻结的人物完成 360 度全环绕，最后 1 秒定格，全程 10 秒完成。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
First ~2s attack release; at ~3s full world freeze (effects, particles, body); ~4–9s 360° orbit around the frozen character; final ~1s hold; ~10s total. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 71. 时间倒流反向运镜 / Time-Reverse Camera

- ID：`shot-fcml-yj071` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破时间单向流逝的物理规则，实现时间倒流与镜头运动的双重联动，营造时空回溯、回忆倒放的氛围感

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内画面内容全程时间倒流：人物人物反向空中后退、开阔远景反向收缩、瀑布水流向上、落日反向升起，镜头同步配合时间倒流做反向拉出运镜，全程无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, world plays in reverse (character retreats, vista contracts, water/sun reverse) while camera reverse-pulls in sync; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 72. 快慢时间同框运镜 / Split-Tempo Same Frame

- ID：`shot-fcml-yj072` · 运镜族：`special` · 特殊 · 近景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破时间统一规则，极致放大主体动作的速度感，营造唯快不破的打斗冲击力，高频使用

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内，画面中心的人物以超光速完成攻击动作，画面背景的环境飘落物、建筑、远山保持完全静止，镜头全程同步跟拍人物的动作，焦点锁定人物。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, subject performs hyper-speed action while background elements stay frozen; camera tracks the subject; focus locked. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 73. 时间切片递进运镜 / Time-Slice Progression

- ID：`shot-fcml-yj073` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破时间线性规则，同时展现动作的完整过程，极致放大高光动作的细节与张力，适配高潮技能蓄力、名场面慢放刻画

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内人物完成完成一组攻击动作的完整动作，镜头依次穿过动作的时间切片，同时展现动作的起手、发力、击中、收招 4 个时间节点，画面无缝融合，全程无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, traverse time-slices of one full attack phrase, fusing wind-up, drive, impact, and recovery in one continuous pass; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 74. 时间循环闭环运镜 / Time-Loop Closed Circuit

- ID：`shot-fcml-yj074` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破时间线性规则，实现无限循环的时间闭环，适配幻境、时间循环、宿命感叙事场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头运动轨迹形成完美闭环，画面内容同步实现时间循环，人物攻击动作从起手到收招，镜头结束点与起始点无缝衔接，可无限循环播放。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, camera path forms a closed loop while the action loops start→finish; end frame matches start for seamless repeat. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 75. 时间暂停步进运镜 / Paused Time Step-Through

- ID：`shot-fcml-yj075` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破时间连续流逝规则，逐帧拆解高光动作，极致展现动作的每一处细节，适配武器、技能特效的细节特写

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内人物攻击动作逐帧暂停，镜头在每帧暂停的时间内完成一次空间位移，步进式环绕人物一周，完整展现攻击动作的每一个细节，全程无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, attack is stepped frame-by-frame; between freezes the camera repositions, stepping an orbit that reveals every micro detail; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 76. 超慢动作无限延伸运镜 / Extended Ultra Slow-Mo

- ID：`shot-fcml-yj076` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破实拍高速相机的帧率极限，无限放大动作的时间维度，适配极致的动作细节刻画、高光名场面慢放

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内人物攻击动作做无限倍率超慢动作，武器刃面划过的 1 毫秒动作，在 10 秒内完整展现，镜头同步环绕武器刃面完成 360 度运镜，全程画面清晰无卡顿。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, ultra slow-mo stretches a ~1ms blade/edge event across the whole take while orbiting 360° around the edge; clean frames. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 77. 时间快进穿梭运镜 / Time-Lapse Rush Through

- ID：`shot-fcml-yj077` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破时间流逝速度限制，快速展现时间的漫长推移，适配城市变迁、四季更迭、人物一生的快速叙事

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内画面时间超高速快进，场景中的四季快速更迭，镜头在快进的时间流中匀速向前推进，从场景入口推进至人物身前，全程无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, seasons/time hyperlapse inside the space while the camera steadily pushes from the entrance to in front of the character; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 78. 双时间线平行运镜 / Dual Timeline Parallel

- ID：`shot-fcml-yj078` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破单时间线限制，同时展现两条不同时间线的内容，适配人物成长、过去与现在的对照叙事

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内画面左右分屏，左屏为人物年少时在室内场景日常练习，右屏为人物成年后在场景空间动作练习，镜头在双屏内同步匀速推进，实现过去与现在的时空对照，全程无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, split screen: left = younger character practicing indoors; right = older character training in the open space; synced push-ins; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 79. 时间涟漪运镜 / Temporal Ripple

- ID：`shot-fcml-yj079` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破时间统一规则，营造能量扩散、气场释放的视觉效果，适配技能特效高潮技能、气场全开的名场面

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内人物释放气场，画面时间以人物为中心，形成涟漪状的快慢扩散，中心时间静止，越往外时间流速越快，镜头跟随涟漪轨迹同步向外环绕运动，全程无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, temporal ripple radiates from the character (center frozen, outer rings faster) while camera orbits outward along the ripple; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

### 光学与透视极限突破类运镜

#### 80. 全画面无限景深运镜 / Infinite Depth of Field

- ID：`shot-fcml-yj080` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破光学镜头景深极限，同时展现画面内所有尺度的完整细节，适配宏大场景全景展示、多主体细节同步呈现

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头保持静止，画面内从镜头前 1 毫米的主体，到无限远的远山与星空，全程同时 100% 清晰，无任何虚化、失焦，全程机位无位移。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, locked camera; infinite DOF—everything sharp from ~1mm foreground subject to infinite terrain/sky; no soft planes; no translation. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 81. 多焦点同步清晰运镜 / Multi-Focus Sync Sharp

- ID：`shot-fcml-yj081` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破单镜头单焦点的物理规则，同一画面内同时存在多个独立清晰焦点，适配多主体同步展示、群像戏场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头保持静止，画面内的前景主体、中景人物、背景远山，全程同时 100% 清晰，无任何虚化失焦，全程机位无位移。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, locked camera; foreground subject, midground character, and background terrain all fully sharp at once; no translation. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 82. 零畸变极端广角运镜 / Zero-Distortion Ultra Wide

- ID：`shot-fcml-yj082` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破广角镜头的畸变物理规则，实现极端广角视野的同时保持画面零畸变，适配宏大场景全景展示、无畸变沉浸式叙事

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头保持 180 度极端广角视野，画面无任何畸变、拉伸，完美还原所有物体的真实比例，全程机位静止，无位移。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, locked ~180° ultra-wide with zero distortion and true proportions; no translation. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 83. 透视无缝切换运镜 / Seamless Perspective Switch

- ID：`shot-fcml-yj083` · 运镜族：`special` · 特殊 · 远景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破实拍透视固定的限制，实现多视角透视的无缝切换，适配多视角叙事、沉浸式视角转换场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头匀速向前推进，同时无缝切换透视维度，从第三人称全景，切换为第一人称视角，再切换为上帝视角，全程无切镜、无断点。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, push forward while seamlessly switching perspective: third-person wide → first-person → God’s-eye; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 84. 虫洞透视穿越运镜 / Wormhole Perspective Transit

- ID：`shot-fcml-yj084` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破三维透视规则，通过虫洞式透视实现跨场景无缝穿越，适配跨星球、跨次元的场景跳转

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头向前推进，画面形成虫洞式的透视漩涡收缩，通过漩涡无缝穿越到开阔远景之上的场景，全程无切镜、无断点，运镜与透视穿越完全同步。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, push into a wormhole-like perspective vortex that exits into a scene above an open vista; move synced to the transit; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 85. 360 度全视场运镜 / 360° Full Field

- ID：`shot-fcml-yj085` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破单镜头视野极限，实现 360 度全空间无盲区视野，适配 VR 全景、沉浸式空间展示、全知视角叙事

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头同时捕捉前后左右上下 360 度全空间的画面，无任何视野盲区，镜头可在全视场内匀速切换显示区域，完整展现人物所处的整个空间，全程无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, capture full 360° spherical field with no blind spots; camera may reframe within the sphere to show the whole space around the character; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 86. 超视距透视运镜 / Beyond-Surface Perspective

- ID：`shot-fcml-yj086` · 运镜族：`special` · 特殊 · 特写 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破实体遮挡的光学限制，实现透视效果，展现物体内部的隐藏细节，适配机械载具、武器、关键道具的内部结构展示

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头匀速向前推进，从关键道具的外部特写起始，逐步透视进入关键道具内部武器本体纹路、金属结构，最终定格在道具内部的纹路特写，全程无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, push from exterior prop close-up into interior structure/grain of the key prop, ending on interior texture; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 87. 无焦点梦幻运镜 / Defocus Dream State

- ID：`shot-fcml-yj087` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破光学镜头对焦规则，营造全画面柔化的梦幻感，适配回忆、梦境、精神视角空间、幻境场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内全程无任何焦点，画面呈现全范围的柔化梦幻效果，镜头同步缓慢向前推进，贴合梦境、精神视角空间的朦胧感，全程无任何清晰对焦区域。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, no hard focus plane—full soft dream field—while slowly pushing in; matches memory/psychic haze. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 88. 无限倍率连续变焦运镜 / Infinite Continuous Zoom

- ID：`shot-fcml-yj088` · 运镜族：`special` · 特殊 · 全景→特写 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破光学镜头变焦倍率的物理极限，实现无限制的连续变焦，适配从宏观全景到微观特写的无缝叙事

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内机位完全静止，仅通过光学镜头实现无缝连续变焦，从 0.001 倍超广角全景，逐步变焦放大至 100000 倍超长焦的人物眼部瞳孔特写，全程无画质损失、无畸变。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, locked tripod; continuous zoom from extreme ultra-wide (~0.001×) to ultra-tele eye/pupil close-up (~100000×) without quality break or distortion. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

### 运镜 + 转场一体化无缝运镜

#### 89. 元素匹配锚定运镜转场 / Match-Cut Anchor Transition

- ID：`shot-fcml-yj089` · 运镜族：`special` · 特殊 · 全景→特写 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：通过核心元素的形态、色彩匹配，实现无切镜场景跳转，是、电影中最经典的无缝转场运镜

**项目运镜提示词 ZH**（`promptZh` 原文）

```
前 3 秒镜头锁定人物手中的圆形主体特写，4-7 秒镜头跟随主体向前推进，主体的圆形轮廓、纹理无缝匹配下一场景的圆月，最后 3 秒镜头拉出至月下场景空间全景，全程无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
First ~3s lock a round subject/prop close-up in hand; ~4–7s push matching its circular contour/texture to a full moon; final ~3s pull out to a moonlit scene wide; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 90. 动作帧锁定运镜转场 / Action-Frame Lock Transition

- ID：`shot-fcml-yj090` · 运镜族：`special` · 特殊 · 近景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：实现动作不停、场景已换的丝滑效果，完美适配超高速打斗、多场景连续动作、高光名场面衔接

**项目运镜提示词 ZH**（`promptZh` 原文）

```
前 3 秒人物在室内场景内完成攻击动作，4-7 秒镜头全程跟拍攻击动作轨迹，在攻击的关键帧瞬间，镜头同步完成场景切换，从室内场景无缝跳转至场景空间，最后 3 秒镜头定格人物在场景空间中完成攻击动作，全程动作不中断。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
First ~3s attack action indoors; ~4–7s track the action path and, on the critical frame, swap location to the open space without stopping the action; final ~3s finish the phrase outdoors; continuous action. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 91. 画框嵌套穿梭运镜 / Nested Frame Transit

- ID：`shot-fcml-yj091` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：实现现实与幻境、当前场景与嵌套场景的无缝跳转，营造破次元、入梦、回忆切入的氛围感，平面动画高频使用

**项目运镜提示词 ZH**（`promptZh` 原文）

```
前 3 秒镜头对准场景中的画框/嵌套画面，嵌套画面为另一景观，随着镜头推进，无缝穿入嵌套画面中的景观场景，全程无切镜、无断点。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
First ~3s frame a nested picture (scroll/painting) on a surface; push seamlessly into the pictured world; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 92. 光影覆盖运镜转场 / Light Wipe Transition

- ID：`shot-fcml-yj092` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：通过光影的全屏覆盖实现场景无缝跳转，适配技能特效衔接、时空跳转、明暗反差场景切换

**项目运镜提示词 ZH**（`promptZh` 原文）

```
前 3 秒人物在室内场景内释放攻击光效，4-7 秒镜头跟随光晕向前推进，光效覆盖同步铺满整个画面，再随着镜头拉出，无缝切换至阳光照耀的山水景致场景，最后 3 秒定格主体于开阔远景之上，全程无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
First ~3s attack releases a light bloom indoors; ~4–7s push with the bloom filling frame, then pull out into a sunlit landscape; final ~3s hold the subject above an open vista; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

### 强情绪与叙事适配专属运镜

#### 93. 呼吸感共情运镜 / Empathic Breathing Cam

- ID：`shot-fcml-yj093` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：让镜头贴合人物的生理节奏，极致增强观众的共情力与代入感，适配人物内心戏、情绪特写场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头配合人物的呼吸节奏，做微幅、匀速的前后推拉，吸气时镜头轻微拉出，呼气时镜头轻微推进，全程焦点锁定人物面部，机位无大幅位移。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, micro push–pull synced to breath (inhale = slight pull-out, exhale = slight push-in); focus on the face; no large translation. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 94. 心跳冲击联动运镜 / Heartbeat Impact Sync

- ID：`shot-fcml-yj094` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：放大人物的紧张、激动情绪，营造强烈的心理压迫感与氛围感，适配对峙、悬念、情绪爆发前的蓄力场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头配合人物的心跳节奏，做逐帧的微幅推进 + 轻微震动，每一次心跳对应一次镜头冲击，心跳频率逐步加快，镜头的运动幅度同步提升，全程焦点锁定人物的眼部。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, micro push + tremble pulses locked to heartbeat, rising in rate and amplitude; focus on the eyes. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 95. 压迫感渐进画幅联动运镜 / Tightening Frame Pressure

- ID：`shot-fcml-yj095` · 运镜族：`special` · 特殊 · 特写 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：极致放大窒息感、压迫感与紧张感，适配对手对峙、悬念揭晓、角色情绪崩溃前的蓄力场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头缓慢向人物推进，同时画面画幅从 16:9 逐步缩至 4:3，再缩至 1:1 正方形，同步叠加渐进式暗角，运镜、画幅、光影三者完全联动，最终定格在人物眼部特写。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, slow push toward the character while aspect ratio squeezes 16:9→4:3→1:1 with rising vignette; move/frame/light linked; end on eye close-up. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 96. 视线锚定主观运镜 / Eye-Line Subjective Lock

- ID：`shot-fcml-yj096` · 运镜族：`special` · POV · 近景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：极致的第一人称代入感，让观众完全共情人物的所见所感，适配悬疑探查、角色沉浸式叙事

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头完全锁定人物的视线方向，人物眼球转动、视线转移，镜头精准同步跟拍，匹配人物眨眼的「模糊 - 清晰」循环，1:1 复刻人物的主观视觉。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, camera is the eye-line: pans with gaze; soft↔sharp blink cycles; 1:1 subjective vision. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 97. 群像递进揭示运镜 / Group Reveal Progression

- ID：`shot-fcml-yj097` · 运镜族：`special` · 特殊 · 全景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：流畅展现群像角色，营造团战集结、群雄对峙的氛围感，适配群像戏、多角色登场场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头匀速向右横移，从场景中央的人物起始，依次定格场景两侧的 4 位其他角色，每个角色定格时镜头做极短的顿停，焦点同步锁死，最终拉至群像全景，全程无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, truck right from the centered character, micro-holding on ~4 supporting faces in turn with focus snaps, then pull to a group wide; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 98. 情绪失重运镜 / Emotional Weightlessness

- ID：`shot-fcml-yj098` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：传递人物的失控、恍惚、醉酒、濒死情绪，区别于强冲击的桶滚旋转，主打细腻的情绪传递

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头做无规律的缓慢翻滚 + 漂浮 + 微幅推拉，运动节奏无固定轨迹，画面轻微柔化，全程焦点锁定人物面部，贴合人物恍惚、眩晕、精神视角混乱的状态。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, irregular slow roll + drift + micro push–pull with slight softness; focus on the face; conveys daze/vertigo/psychic confusion (not a hard barrel-roll hit). Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

### AI/CG 独有的维度与空间逻辑突破运镜

#### 99. 2D-3D 无缝切换运镜 / 2D↔3D Seamless Switch

- ID：`shot-fcml-yj099` · 运镜族：`special` · 特殊 · 全景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破 2D 与 3D 的维度边界，实现写意到无缝切换，适配平面动画的风格转场、破次元叙事

**项目运镜提示词 ZH**（`promptZh` 原文）

```
前 3 秒为 2D 平面写意画风画面，主体于画风化开阔远景之上，4-7 秒镜头向前推进的同时，画面从 2D 平面画风无缝过渡为 3D 写实画面，最后 3 秒镜头环绕 3D 人物与开阔远景全景，全程 10 秒无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
First ~3s 2D illustrative/planar look of the subject over a vista; ~4–7s push while morphing into dimensional 3D space; final ~3s orbit the dimensional subject and vista; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 100. 画面分层纵深穿梭运镜 / Layered Depth Transit

- ID：`shot-fcml-yj100` · 运镜族：`special` · 特殊 · 远景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破实拍画面的单层物理限制，实现多层画面的独立运动与纵深穿梭，营造极强的画面层次感与沉浸感

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头匀速向前推进，画面拆分为前景开阔远景、中景人物、背景远山、远景星空 4 个独立分层，每个分层独立运动，镜头在 4 个分层之间自由穿梭推进，全程无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, push while the image splits into independent parallax layers (near vista / character / terrain / sky); camera weaves between layers; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 101. 非欧几何空间运镜 / Non-Euclidean Space Move

- ID：`shot-fcml-yj101` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破三维现实空间的物理规则，在非欧几何的无限循环空间内自由运镜，营造幻境、秘境、精神视角空间的错乱感与神秘感

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头在彭罗斯阶梯式的无限循环回廊中匀速向前推进，空间无限循环、首尾相连，镜头全程连续运动，无断点、无切镜，画面无穿帮。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, steady push through a Penrose-loop corridor that connects end-to-start; continuous motion, no cuts, no continuity breaks. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 102. 画面解构重组联动运镜 / Frame Deconstruct–Recompose

- ID：`shot-fcml-yj102` · 运镜族：`special` · 特殊 · 远景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破画面实体的物理规则，实现画面元素的解构与重组，适其他角色色变身、场景切换、技能特效形态变化的名场面

**项目运镜提示词 ZH**（`promptZh` 原文）

```
前 3 秒镜头环绕空中运动的人物，4-7 秒画面中的人物、关键道具、开阔远景、远山同步解构为粒子碎片，随着镜头向前推进，粒子碎片重新组合为城市的全景，最后 3 秒镜头定格在城市全景，全程 10 秒无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
First ~3s orbit an airborne character; ~4–7s character/prop/vista/terrain dissolve to particles and recompose as a city wide during the push; final ~3s hold the city wide; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 103. AI 实时生成式无限运镜 / Generative Infinite Cam

- ID：`shot-fcml-yj103` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：AI 独有的专属运镜，突破预设场景的限制，实现无限时长、无限延伸的连续运镜，适配沉浸式漫游、意识流叙事

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头保持匀速向前推进，前方的开阔远景、远山、峡谷、建筑随着镜头的运动实时生成、无限延伸，无边界、无预设场景限制，全程连续运动无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, steady forward roam while vista/terrain/architecture generate ahead without preset bounds; continuous, no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

### 叙事向玄幻 / 动画专属定制运镜

#### 104. 超长一镜到底无缝运镜 / Ultra-Long Oner

- ID：`shot-fcml-yj104` · 运镜族：`special` · 特殊 · 远景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破实拍长镜头的物理限制，实现多场景、多时间线、多尺度的无缝一镜到底，适配史诗级叙事、人物一生传记、世界观完整展现

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内全程无切镜，镜头从关键道具的微观纹理起始，推进至人物全身，再穿过室内场景窗户，飞越场景空间、远山与开阔远景，最终定格在高空星空全景，实现多场景、多尺度的无缝衔接。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s oner: micro prop texture → full character → through an interior window → across open space and mountains → high star-field wide; multi-space multi-scale, no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 105. 神识 / 念力视角运镜 / Psychic / Mind’s-Eye POV

- ID：`shot-fcml-yj105` · 运镜族：`special` · POV · 远景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：完美还原设定中的精神视角 / 意念探查视角，突破空间与遮挡的物理限制，适其他角色色探查、世界观展现场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头模拟人物的精神视角视野，从人物的眉心起始，无视空间距离与实体遮挡，瞬间扫描过开阔远景、远山、城市、峡谷，最终锁定峡谷深处的目标，全程无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, psychic POV from the brow: ignore distance and occlusion, scan vista/terrain/city/canyon, lock a deep target; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 106. 灵魂 / 第一人称死亡视角运镜 / Soul / Death POV

- ID：`shot-fcml-yj106` · 运镜族：`special` · POV · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：适其他角色色牺牲、回忆杀、濒死场景，营造宿命感、悲凉感的叙事氛围

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头模拟人物灵魂离体的视角，从人物的身体内缓缓升起，向后倒退漂浮，可穿透墙体，同步回溯人物的一生回忆画面，全程无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, soul-leave rise from inside the body, drift backward through walls, overlay life-memory images; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 107. 功法特效绑定运镜 / VFX-Bound Projectile Cam

- ID：`shot-fcml-yj107` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：让镜头与特效完全同步，第一视角展现技能特效的冲击力，增强观众的沉浸感，适配高潮技能释放、特效展示场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内人物释放一道远程攻击特效，镜头全程与远程攻击特效的飞行轨迹完全绑定，同步跟随远程攻击特效向前飞行，最终远程攻击特效击中场景另一侧目标，镜头同步定格在击中瞬间，全程无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, bind camera to a projectile/VFX path from release to impact on a far target; hold on the hit; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 108. 次元壁穿梭运镜 / Dimensional Wall Transit

- ID：`shot-fcml-yj108` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破二次元与三次元的边界，营造破次元、无厘头、互动式叙事氛围，适配平面动画、创意短视频

**项目运镜提示词 ZH**（`promptZh` 原文）

```
前 3 秒为 2D 平面动画画面，人物站在平面画风场景空间中，4-7 秒镜头向前推进，突破画面次元壁，无缝穿梭至 3D 场景空间场景，最后 3 秒镜头环绕 3D 人物，全程无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
First ~3s 2D planar animation of the character in a painted space; ~4–7s push breaks the picture wall into dimensional space; final ~3s orbit the dimensional character; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 109. 回忆杀无缝切入运镜 / Seamless Flashback Cut-In

- ID：`shot-fcml-yj109` · 运镜族：`special` · 特殊 · 全景→特写 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：无需硬切即可实现现实到回忆的无缝衔接，是、影视叙事中最高频的回忆转场运镜

**项目运镜提示词 ZH**（`promptZh` 原文）

```
前 3 秒镜头匀速推进至人物的眼部瞳孔特写，4-7 秒从瞳孔内无缝切入回忆场景（人物年少时在室内场景日常练习的画面），最后 3 秒镜头拉出至回忆场景的全景，全程 10 秒无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
First ~3s push to an eye/pupil close-up; ~4–7s enter a memory scene from inside the pupil (younger practice beat); final ~3s pull out to the memory wide; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 110. 上帝全知视角运镜 / Omniscient Multi-Scene View

- ID：`shot-fcml-yj110` · 运镜族：`special` · 特殊 · 远景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破单镜头的空间限制，实现全知全能的上帝视角，同时展现多线剧情，适配宏大世界观、多线叙事场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内镜头同步展现 4 个不同场景的同步事件：开阔远景中运动的人物、城市街道的人群、峡谷深处的敌对生物、山巅的势力据点，画面无缝分镜融合，镜头同步运动，全程无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, weave four simultaneous locations (airborne character / city crowd / canyon threat / mountain stronghold) in one continuous omniscient presentation; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 111. 内心世界具象化运镜 / Inner-World Externalized

- ID：`shot-fcml-yj111` · 运镜族：`special` · 特殊 · 全景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：无需硬切即可实现从现实到人物内心世界的无缝衔接，适其他角色色心境刻画、执念回忆、幻境叙事

**项目运镜提示词 ZH**（`promptZh` 原文）

```
前 3 秒镜头匀速推进至人物的眉心，4-7 秒从人物眉心无缝切入其内心世界的具象化场景（漫天飞雪的战场），最后 3 秒镜头拉出至内心场景全景，全程无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
First ~3s push to the brow; ~4–7s enter an externalized inner world (e.g. a snow battlefield); final ~3s pull to that inner wide; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

### 国漫玄幻打斗专属・极致爽感运镜合集

#### 112. 双主体平行跟拍运镜 / Dual-Subject Parallel Track

- ID：`shot-fcml-yj112` · 运镜族：`special` · 跟 · 近景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：完美适配双主体对打场景，完整展现两人的动作博弈，避免单主体跟拍导致的另一人出框，对打戏核心运镜

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内人物与对手完成一组对冲打斗，镜头与双主体保持平行，同步匀速横向移动，全程双主体始终处于画面中心，焦点同步锁定两人的动作。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, two fighters clash on a closing line; camera trucks parallel, keeping both centered; focus locks both action paths. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 113. 连招动作锁定跟拍运镜 / Combo-Lock Tracking

- ID：`shot-fcml-yj113` · 运镜族：`special` · 跟 · 近景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：极致展现连续动作的流畅度与爽感，适配超高速连续动作、高光打斗名场面，爽感核心运镜

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内人物完成一套 3 连续动作的攻击动作，镜头全程零延迟锁定人物的武器刃面，无论动作多快，武器刃面始终处于画面绝对中心，焦点全程清晰，动作无卡顿。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, lock the weapon edge through a ~3-hit combo with zero lag; edge stays absolute center; focus sharp; no stutter. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 114. 大招第一视角绑定运镜 / Ultimate-Move POV Bind

- ID：`shot-fcml-yj114` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：第一视角沉浸式体验高潮技能的冲击力，让观众身临其境感受技能特效威力，适配高潮技能释放、名场面高光时刻

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内人物释放高潮技能远程攻击特效，镜头全程与远程攻击特效的第一视角完全绑定，同步跟随远程攻击特效飞向对手，最终击中对手的瞬间镜头定格，全程无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, first-person bind to an ultimate projectile from release to opponent impact; hold on the hit; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 115. 反打瞬移跟拍运镜 / Reverse-Angle Teleport Track

- ID：`shot-fcml-yj115` · 运镜族：`special` · 跟 · 近景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：完美适配瞬移反打、绕后偷袭的打斗场景，突破实拍机位的空间限制，完整展现瞬移反打的爽感与张力

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内对手瞬移至人物身后挥刀偷袭，镜头零延迟同步跟随对手的瞬移轨迹，瞬间切换至人物的反打视角，全程无切镜，双主体动作全程清晰。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, opponent teleports behind for a flank; camera follows the teleport path with zero delay into the reverse-angle counter; no cuts; both actions stay readable. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 116. 威压感俯冲运镜 / Pressure Dive

- ID：`shot-fcml-yj116` · 运镜族：`special` · 降 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：极致放大对手的压迫感与强大气场，适配 BOSS 登场、高空俯冲偷袭、强者降临场景

**项目运镜提示词 ZH**（`promptZh` 原文）

```
前 2 秒对手从高空俯冲而下，3-7 秒镜头同步跟随对手急速俯冲，全程低角度仰视锁定对手，放大对手的高大压迫感，最后 2 秒定格对手落地与人物对峙的瞬间。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
First ~2s opponent dives from height; ~3–7s camera dives with them in low-angle pressure; final ~2s hold the landing confrontation with the character. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

#### 117. 时间切片递进运镜（打斗版） / Time-Slice Progression (Combat)

- ID：`shot-fcml-yj117` · 运镜族：`special` · 特殊 · 中景 · 10s
- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`
- 用途：突破时间线性规则，同时展现动作的完整过程，极致放大高光动作的细节与张力，适配高潮技能蓄力、名场面慢放刻画

**项目运镜提示词 ZH**（`promptZh` 原文）

```
10 秒内人物完成完成一组攻击动作的完整动作，镜头依次穿过动作的时间切片，同时展现动作的起手、发力、击中、收招 4 个时间节点，画面无缝融合，全程无切镜。机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。
```

**项目运镜提示词 EN**（`promptEn` 原文）

```
Over ~10s, combat time-slice of a full attack phrase fusing wind-up, drive, impact, and recovery in one continuous pass; no cuts. Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.
```

---

## 5. 批量建议

1. 先用 `01 正面中景` 跑完体系一基础类（推拉 / 摇 / 移 / 环绕 / 升降）。
2. 焦点 / 微距类可改用 `07` 或 `09`。
3. 仰俯 / 航拍感可改用 `05` / `06` / `11`。
4. 体系二特效类仍锁同一角色，让运镜差异更明显。
5. 验收标准：同一角色一眼可认；不同条目的机位运动路径可区分。

— 共 117 条，与 `nx9-shot-seeds-neutral.json` 同步生成。
