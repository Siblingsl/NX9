# NX9 音频降噪（audio-denoise）

> 日期：2026-09-16（会话第 25 批）
> 定位：补齐音频后期短板——短剧 TTS / 实录音常带底噪，此前仓库**没有任何降噪实现**（全仓 0 处）。

## 一、能力范围

| 项 | 说明 |
|---|---|
| 输入 | 任意媒体文件（音频为主；`-vn` 会丢弃可能存在的视频轨） |
| 滤镜 | `afftdn`（快，**默认**）或 `anlmdn`（慢，更平滑） |
| 强度 | 0–1（默认 0.6），映射到滤镜参数（见下表，**经验映射，非厂商规格**） |
| 输出 | `exports/denoise-<mode>-<stamp>.m4a`（AAC 192k），前端经 `/media/exports/<name>` 取用 |
| 失败口径 | ffmpeg 缺失 / 源不可读 / 产物未写出 → `ok:false` + 中文原因，**禁止空成功** |

## 二、滤镜与强度映射（经验值）

| 模式 | 滤镜串 | 参数来源 |
|---|---|---|
| `afftdn` | `afftdn=nr=<nr>:nf=<nf>` | `nr` = 12 + s×(97−12) → **12–97 dB**（ffmpeg 允许 0.01–97；12 起步避免几乎无效的弱降噪）；`nf` = −20 − s×60 → **−20 ~ −80 dB**（噪声底随强度下沉） |
| `anlmdn` | `anlmdn=s=<s>` | `s` = 0.5 + s×1.5 → **0.5–2.0**（0.5 起步，理由同上） |

## 三、代码位置

| 文件 | 内容 |
|---|---|
| `apps/server/src/modules/montage/audio-denoise.ts` | **纯函数层**（零依赖）：`normalizeDenoiseStrength` / `normalizeDenoiseMode` / `buildAudioDenoiseFilter` / `buildAudioDenoiseArgs` / `buildAudioDenoiseOutputName` / `describeAudioDenoiseParams` |
| `apps/server/test/audio-denoise.test.ts` | 19 例单测（边界 / 幂等 / 路径不互换 / 脏输入不抛） |
| `apps/server/test/setup.ts` | **顺带修复的既有缺陷**（见 §五） |

## 四、待接线（ZCode 恢复后）

纯函数层已就绪，剩余接线为机械工作（照 `speedPitch` 的既有模式）：

1. `montage.service.ts` 追加 `audioDenoise(body)`：`resolveMediaUrl` + `existsSync` → `checkFfmpeg()` → `spawn('ffmpeg', buildAudioDenoiseArgs(...))` → 产物存在性校验 → 返回 `{ ok:true, url:'/media/exports/<name>', ... }`
2. `montage.controller.ts` 追加 `@Post('audio-denoise')`
3. `apps/web/src/api/client.ts` 追加 `audioDenoise(...)`
4. UI 入口：`SoundGenBlock` 与剪辑台音轨（对齐既有 `speedPitch` 入口位置）
5. barrel 导出纯函数（供前端复用校验，可选）

## 五、顺带修复的既有缺陷（setup.ts）

`apps/server/test/setup.ts` 此前把 5 个数据目录**硬编码**在 `F:\code\project\NX9\...`（README 里的旧路径）。任何非 F 盘工作区都会在 `mkdir` 时 `ENOENT`，导致**整个服务端测试套件无法收集**（不是个别用例失败，是 0 个文件能收集）。

修复后改为 `path.resolve(process.cwd(), 'data')`（随仓库走，环境变量可覆盖）。

**修复后的实测**（服务端全套）：`38 failed | 50 passed (88)`——38 个失败**全部**是已知的 barrel 缺陷（`./data/emotion-presets` 经 `dist/esm/index.js` 解析），**与 setup 修复无关**；而修复前是「0 个文件能收集」。

## 六、验证

```bash
cd apps/server
npx vitest run test/audio-denoise.test.ts    # 19 passed, exit 0
```

## 七、明确不做 / 未做

- **人声分离**：需要模型（Demucs 等），本地 ffmpeg 做不到 → 明确不做（写了即造假）。
- **真实端到端**：需要运行中的服务端 + 本机 ffmpeg + 真实音频；未跑，滤镜效果未真机听测（映射为经验值）。
- UI 入口与端点接线：待 ZCode 恢复后按 §四完成。