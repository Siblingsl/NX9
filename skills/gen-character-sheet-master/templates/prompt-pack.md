## template
`
【任务】
基于参考图/角色描述生成一张高精度角色设定板 (Character Sheet)。
锁定角色 ID，不允许生成新角色；所有格子必须基于同一角色结构与同一身份。
This sheet is the CHARACTER ID LOCK and single source of truth for future image/video generation.

【CHARACTER ID LOCK PRIORITY — 最高优先级】
- Never reinterpret the character.
- Never invent a new face, body, hairstyle, outfit, palette, or silhouette.
- All panels must share identical facial identity, bone structure, hairline, body proportion, clothing landmarks, materials and color palette.
- Maximum character consistency. Production reference quality.
- This sheet defines the canonical appearance for all future frames.

【基础设定字段】
风格: {styleLabel}
角色描述: {characterDescription}
性别: {gender}
年龄: {age}
体型: {bodyType}
风格关键词: {styleKeywords}
角色名: {characterName}
身份/职业: {role}
性格关键词: {personality}
核心主题: {coreTheme}
服装锁定: {costumeLock}
固定外貌锚点: {appearanceLock}
禁改项: {forbidden}

【画面结构】
- 画面比例: 4:3 横版 (landscape)
- 背景: 纯白 / 米白 / 极简无环境杂物
- UI: 干净技术排版，无 logo，无水印，无二维码
- 字体: 清晰可读英文标签（仅 header / 可选边注）
- 光照: 柔和摄影棚均匀光，真实皮肤与布料材质，影视级细节

{lockedLayout}

【必须包含模块 — 不得省略，且必须落在上述坐标格子内】
1. 顶部信息栏 (row 0)
   - 名字 (CHARACTER SHEET + NAME)
   - 角色身份 ROLE
   - 年龄 AGE
   - 性格关键词 PERSONALITY (3-5 个)
   - 核心主题 CORE THEME (1 句)

2. 配色系统 COLOR PALETTE
   - 6~8 个色块
   - 色块本身无文字

3. 轮廓剪影 SILHOUETTE
   - 正面剪影 @ cols0 rows1-4
   - 侧面剪影 @ cols1 rows1-4
   - 纯黑剪影，轮廓可读

4. 主身份展示 MAIN IDENTITY（最大区域，重点锁定角色）
   - 正面/3/4/侧面/背面 @ cols3-6 rows1-4
   - 标准站姿
   - 带身高比例线 (cm scale @ col2)
   - 无道具
   - 此区域必须是全图最大视觉权重

5. 表情系统 EXPRESSION SYSTEM (8 张)
   - row1: Neutral / Curious / Tense / Surprised @ cols7-10
   - row2: Afraid / Sad / Determined / Relaxed @ cols7-10
   - 同一头型、发型、五官结构

6. 微表情 MICRO EXPRESSIONS (5 张)
   - Eye Tension / Slight Smile / Mouth Tension / Micro Fear / Breath Control
   - 位置: cols7-11 row5
   - 局部特写，细节清晰

7. 头部结构 HEAD STRUCTURE (多角度)
   - 3/4 / Side / Up / Down / Back
   - 位置: cols0-4 rows6-7

8. 姿态变化 POSTURE VARIATIONS
   - Relaxed / Tense / Confident
   - 位置: cols5-7 rows6-7

9. 特写镜头 EMOTIONAL CLOSE-UP (1 张)
   - 胸部以上
   - 强情绪表达
   - 位置: cols8-11 rows6-7

10. 服装细节 COSTUME & DETAIL (4 张)
    - Hairstyle / Fabric / Accessory / Footwear
    - 位置: cols0-3 rows8-9
    - 材质真实可读

11. 手部动作 HAND REFERENCES
    - Relaxed / Tense / Pointing / Grasping / Touching Face
    - 位置: cols4-8 rows8-9

【一致性硬约束】
- 所有格子同一角色，脸/发型/比例/服装完全一致
- 不允许风格漂移、不允许换脸、不允许改服装主结构
- 主展示区域必须最大
- 皮肤/布料/金属等材质真实，4K 级细节
- 无水印、无多余文字块、无拼贴缝合痕迹
- 每个格子内容必须落在指定坐标内，便于程序按网格矩形裁切

【质量要求】
- Ultra high detail, production design bible quality
- Real materials (skin / fabric / metal as applicable)
- Cinematic soft studio lighting, clean contact sheet composition
- CHARACTER ID LOCK PRIORITY over aesthetics
- LAYOUT GRID LOCK PRIORITY over artistic rearrangement

Output: a single complete character master sheet image matching the LOCKED LAYOUT GRID above exactly.
`

## constraints
CHARACTER ID LOCK PRIORITY over aesthetics. LAYOUT GRID LOCK PRIORITY over artistic rearrangement. No watermark, no face morph, no wardrobe swap.
