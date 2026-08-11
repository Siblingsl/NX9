## template
`
【任务】
基于角色描述生成一张高精度「角色完整设定板」（角色 ID 圣经）。
锁定角色身份，不允许生成新角色；所有格子必须是同一人物。
本图版式独立，不需要迁就后续五类分类原图的布局。

【CHARACTER ID LOCK PRIORITY — 最高优先级】
- Never reinterpret the character.
- Never invent a new face, body, hairstyle, outfit, palette, or silhouette.
- All panels must share identical facial identity, bone structure, hairline, body proportion, clothing landmarks, materials and color palette.
- Maximum character consistency. Production reference quality.
- 禁止图片漂移：人物不得在格与格之间换成另一人，五官比例不得漂移。

【LAYOUT GRID LOCK PRIORITY — 与 ID LOCK 同级】
- Every character must use the exact same layout grid and panel coordinates.
- Do not invent, omit, merge, resize, reorder, or freely rearrange panels.
- Do not copy the five category-sheet layouts onto this master sheet.

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
- 画布: 固定 1536×1152 像素，4:3 横版
- 背景: 浅灰 / 米白 / 极简无环境杂物
- UI: 干净技术排版，无 logo，无水印，无二维码
- 文字: 所有可见文字必须是简体中文；禁止英文标题、英文标签、乱码和伪文字
- 光照: 柔和摄影棚均匀光，真实皮肤与布料材质，影视级细节

{lockedLayout}

【必须包含模块】
1. 顶部信息栏：角色完整设定板 + 名 + 身份 + 年龄 + 性格×3（简体中文）
2. 色彩参考：7 色块 + 发色/瞳色/肤色/眉色/服装色/阴影色/基调色
3. 身份锁要点：8 条简体中文固定要点（本格不画人）
4. 全身三视图：正面 / 侧面 / 背面
5. 脸部六角：正面 / 侧左 / 侧右 / 斜左 / 斜右 / 后脑勺
6. 表情矩阵 3×3：通常/微笑/认真；惊讶/害羞/思考；困扰/悲伤/平静
7. 细节特征 12：左眼/右眼/眉毛/鼻子/嘴唇/耳朵/下颌/皮肤/刘海/侧发/后发/手部

【明确不包含】
- 不要改成五类分类原图的版式
- 不要自由拼贴或额外 invent 格子

【一致性硬约束】
- 固定 12×10 网格坐标；禁止漂移、换脸、乱码、英文标签
- 全图同一角色

Output: a single complete character master sheet image matching the LOCKED LAYOUT GRID above exactly.
`

## constraints
CHARACTER ID LOCK PRIORITY. LAYOUT GRID LOCK PRIORITY. 完整设定板为独立 ID 圣经版式，与五类脱钩。先完整设定板，再五类并以完整设定板为唯一角色参考。画面文字全简体中文，禁止乱码/英文标签/图片漂移。五类版式各自独立。No watermark, no face morph, no wardrobe swap, no English text, no blurry face, no identity drift.
