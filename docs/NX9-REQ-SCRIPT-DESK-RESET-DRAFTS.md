# 编剧台 · 重置 + 草稿箱

## 功能拆分

| ID | 能力 | 说明 |
|---|---|---|
| R1 | 重置按钮 | 顶栏「稿纸」旁提供「重置」；清空当前剧集 / Bible / 对话，初始化为空台 |
| R2 | 全局确认弹窗 | 使用项目级 `ConfirmHost`；确认文案说明不可就地撤销 |
| R3 | 存草稿勾选 | 弹窗底部勾选「存入草稿箱」；勾选→草稿箱，不勾选→私有资源回收站 |
| D1 | 草稿箱入口 | 「稿纸」旁「草稿」按钮（带数量徽标） |
| D2 | 草稿弹窗 | 文件夹列表：剧名 / 集数 / 字数 / 时间；打开 / 删除 |
| D3 | 打开草稿 | 回显到当前编剧台；若台内已有制作内容，先自动存入草稿并 **3 秒**文字提示 |
| D4 | 删除草稿 | 移入私有项目资源回收站（可恢复到草稿箱） |
| T1 | 回收站展示 | `AssetTrashPanel` 增加「剧本」类型；恢复→草稿箱；彻底删除不可恢复 |

## 数据

- `workspace.scriptDeskDrafts[]`：活跃草稿文件夹
- `workspace.scriptDeskTrash[]`：软删快照（30 天清理策略与资产回收站一致）
- 快照含完整 `package` + `agentSession` + `entryMode`

## 主要改动文件

- `packages/shared/src/utils/script-desk-archives.ts`
- `packages/shared/src/types/workspace.ts`（含 normalize 持久化）
- `apps/web/src/stores/workspace-document.ts`
- `apps/web/src/stores/confirm-dialog.ts` + `ConfirmHost.tsx`
- `apps/web/src/blocks/nx9/ScriptDeskBlock.tsx`
- `apps/web/src/panels/AssetTrashPanel.tsx`
