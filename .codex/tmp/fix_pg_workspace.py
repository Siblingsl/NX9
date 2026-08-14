# -*- coding: utf-8 -*-
import io

path = r'F:\code\project\NX9\apps\web\src\engine\stage-deck\chrome\attached-workspace\generation\picture\PictureWorkspace.tsx'
with io.open(path, 'r', encoding='utf-8') as f:
    text = f.read()

crlf = '\r\n' in text
text = text.replace('\r\n', '\n')

def replace_once(old, new, label):
    global text
    idx = text.find(old)
    if idx < 0:
        raise SystemExit('NOT FOUND: ' + label)
    if text.find(old, idx + len(old)) >= 0:
        raise SystemExit('MULTIPLE: ' + label)
    text = text[:idx] + new + text[idx + len(old):]

# Imports
replace_once(
    "  IMAGE_ASPECT_OPTIONS,\n",
    "  IMAGE_ASPECT_OPTIONS,\n  buildCharacterContext,\n",
    'import-character-context',
)
replace_once(
    "  const libraryCharacters = useWorkspaceDocument((s) => s.characters.characters);\n",
    "  const libraryCharacters = useWorkspaceDocument((s) => s.characters.characters);\n  const environments = useWorkspaceDocument((s) => s.environments);\n",
    'environments-selector',
)
replace_once(
    "import { uniqueLibraryLabel } from '../../../../../picture-gen-refs';",
    "import { resolvePictureSendRefs, uniqueLibraryLabel, type PictureInjectedRef } from '../../../../../picture-gen-refs';",
    'import-refs',
)
replace_once(
    "import { commitPicturePreviewUrls } from '../../../../../picture-gen-commit';",
    "import { commitPicturePreviewUrls, writePictureShotPatch } from '../../../../../picture-gen-commit';",
    'import-commit',
)

# PG-39: keep explicit linkedShotId
old = """    const prev = Array.isArray(data.linkedShotIds) ? (data.linkedShotIds as string[]) : [];
    const nextId = shotIds[0] ?? undefined;
    const prevSingle = (data.linkedShotId as string | undefined) ?? undefined;
    if (
      prev.length === shotIds.length &&
      prev.every((id, i) => id === shotIds[i]) &&
      prevSingle === nextId
    ) {
      return;
    }
    updateNodeData(blockId, {
      linkedShotIds: shotIds,
      linkedShotId: nextId,
      linkedShotLabel:
        shots.length > 1
          ? `写回第 1 / ${shots.length} 镜（#${(shots[0]?.index ?? 0) + 1}）`
          : shots[0]
            ? `写回镜头 #${(shots[0].index ?? 0) + 1}`
            : undefined,
    });"""
new = """    const prev = Array.isArray(data.linkedShotIds) ? (data.linkedShotIds as string[]) : [];
    // PG-39: spawn/用户已指定的 linkedShotId 若仍在上游集合内则保留，禁止强改成第一镜
    const explicitId = (data.linkedShotId as string | undefined)?.trim() ?? undefined;
    const nextId =
      explicitId && shotIds.includes(explicitId)
        ? explicitId
        : (shotIds[0] ?? undefined);
    const prevSingle = (data.linkedShotId as string | undefined) ?? undefined;
    const selectedShot = shots.find((s) => s.id === nextId) ?? shots[0];
    if (
      prev.length === shotIds.length &&
      prev.every((id, i) => id === shotIds[i]) &&
      prevSingle === nextId
    ) {
      return;
    }
    updateNodeData(blockId, {
      linkedShotIds: shotIds,
      linkedShotId: nextId,
      linkedShotLabel:
        shots.length > 1 && selectedShot
          ? `写回第 ${shots.indexOf(selectedShot) + 1} / ${shots.length} 镜（#${(selectedShot.index ?? 0) + 1}）`
          : selectedShot
            ? `写回镜头 #${(selectedShot.index ?? 0) + 1}`
            : undefined,
    });"""
replace_once(old, new, 'auto-bind')

# PG-37: remove content writes in pro action / multi prompts
replace_once(
    "        const first = filledMultiPrompts(seeded)[0];\n        if (first) patch.content = first;\n",
    "",
    'pro-action-content',
)
replace_once(
    "        imageCount: Math.max(1, filled.length || normalized.length),\n        content: filled[0] ?? '',\n      });",
    "        imageCount: Math.max(1, filled.length || normalized.length),\n      });",
    'multi-content',
)

# PG-40: delete syncs firstFrame
old = """      if (removed) {
        useWorkspaceDocument.getState().trashGeneratedMedia({
          url: removed,
          mediaKind: 'picture',
          label: `生成图 ${index + 1}`,
          sourceBlockId: blockId,
        });
        toastSuccess('已移入资产回收站');
      }"""
new = """      if (removed) {
        useWorkspaceDocument.getState().trashGeneratedMedia({
          url: removed,
          mediaKind: 'picture',
          label: `生成图 ${index + 1}`,
          sourceBlockId: blockId,
        });
        // PG-40: 删除的是绑定镜 firstFrame 时同步镜表，避免分镜/预览裂图
        const linkedShotId = (data.linkedShotId as string | undefined)?.trim();
        const linkedShot = linkedShotId ? shots.find((s) => s.id === linkedShotId) : undefined;
        if (linkedShot && linkedShot.firstFrameAssetId === removed) {
          writePictureShotPatch({
            blockId,
            shotId: linkedShot.id,
            patch: next[0]
              ? {
                  firstFrameAssetId: next[0],
                  keyframeStatus: 'review' as const,
                  status: 'review' as const,
                }
              : {
                  firstFrameAssetId: null,
                  keyframeStatus: 'draft' as const,
                  status: 'draft' as const,
                },
            updateNodeData: (id, patch) => updateNodeData(id, patch),
            nodes: nodes.map((n) => ({
              id: n.id,
              type: n.type,
              data: (n.data ?? {}) as Record<string, unknown>,
            })),
            edges,
          });
          appendLog('已同步绑定镜头 firstFrame');
        }
        toastSuccess('已移入资产回收站');
      }"""
replace_once(old, new, 'delete-sync')
replace_once(
    "    [appendLog, blockId, handlePatch, previewUrls],",
    "    [appendLog, blockId, data, edges, handlePatch, nodes, previewUrls, shots, updateNodeData],",
    'delete-deps',
)

# PG-45: restore prompt callback
old = """    [appendLog, blockId, data, draft, edges, nodes, previewUrls, updateNodeData],
  );

  const handleResumePending = useCallback(async () => {"""
new = """    [appendLog, blockId, data, draft, edges, nodes, previewUrls, updateNodeData],
  );

  /** PG-45: 单独恢复历史条目的用户原稿，不替换当前生成图 */
  const handleRestorePrompt = useCallback(
    (entryId: string) => {
      const entry = readPictureGenerationHistory(data).find((h) => h.id === entryId);
      if (!entry) return;
      applyText(entry.userPrompt ?? entry.prompt);
      appendLog('已恢复该轮用户提示词');
    },
    [appendLog, applyText, data],
  );

  const handleResumePending = useCallback(async () => {"""
replace_once(old, new, 'restore-prompt')

# PG-38: prediction memo before refStripItems
old = """  const refStripItems = useMemo((): PictureRefItem[] => {
    const items: PictureRefItem[] = [];
    const seen = new Set<string>();"""
new = """  const linkedShotForPreview = useMemo(() => {
    const id = (data.linkedShotId as string | undefined)?.trim();
    return (id ? shots.find((s) => s.id === id) : undefined) ?? shots[0];
  }, [data.linkedShotId, shots]);

  /** PG-38: 与执行器同源的发送参考预判（含定妆/场景注入），UI 据此展示真实模式与注入图 */
  const predictedSend = useMemo(() => {
    const charCtx = buildCharacterContext(data, linkedShotForPreview, libraryCharacters, upstreamPictures);
    const env = (environments?.environments ?? []).find(
      (e) =>
        (linkedShotForPreview?.sceneCode && e.sceneCode === linkedShotForPreview.sceneCode) ||
        (linkedShotForPreview?.sceneAssetId && e.id === linkedShotForPreview.sceneAssetId),
    ) as { referenceUrls?: string[]; referenceImageUrl?: string } | undefined;
    const envRef = env
      ? (env.referenceUrls?.[0] ?? env.referenceImageUrl)?.trim() || undefined
      : undefined;
    return resolvePictureSendRefs({
      data,
      nodeRef: (data.referenceImageUrl as string | undefined)?.trim(),
      multiRefs: Array.isArray(data.referenceImageUrls)
        ? (data.referenceImageUrls as string[])
        : [],
      styleImageUrl: (data.styleImageUrl as string | undefined)?.trim(),
      upstreamPics: upstreamPictures.filter((u) => u && !excludedRefUrls.includes(u)),
      mentionRefs: resolveLocalMediaMentionUrls(
        draft,
        previewUrls,
        upstreamPictures.filter((u) => u && !excludedRefUrls.includes(u)),
      ),
      characterRef: charCtx.referenceImageUrl,
      envRef,
    });
  }, [
    data,
    draft,
    environments,
    libraryCharacters,
    linkedShotForPreview,
    previewUrls,
    upstreamPictures,
  ]);

  const refStripItems = useMemo((): PictureRefItem[] => {
    const items: PictureRefItem[] = [];
    const seen = new Set<string>();"""
replace_once(old, new, 'prediction-memo')

old = """    upstreamPictures.forEach((url, index) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      items.push({ url, source: 'upstream', index });
    });
    return items;
  }, [allRefUrls, styleImageUrl, upstreamPictures]);"""
new = """    upstreamPictures.forEach((url, index) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      items.push({ url, source: 'upstream', index });
    });
    const excludedSet = new Set(excludedRefUrls.filter(Boolean));
    const injected = [
      ...((data.injectedRefs as PictureInjectedRef[] | undefined) ?? []),
      ...predictedSend.injected,
    ];
    injected.forEach((item, index) => {
      if (!item?.url || seen.has(item.url) || excludedSet.has(item.url)) return;
      seen.add(item.url);
      items.push({ url: item.url, source: 'injected', index, role: item.role });
    });
    return items;
  }, [allRefUrls, data.injectedRefs, excludedRefUrls, predictedSend, styleImageUrl, upstreamPictures]);"""
replace_once(old, new, 'ref-strip-injected')

# PG-38: placeholder uses predicted mode
replace_once(
    "  const mentionedUpstreamUrls = useMemo(\n",
    "  const runtimeDisplayMode = predictedSend.mode;\n\n  const mentionedUpstreamUrls = useMemo(\n",
    'runtime-mode',
)
replace_once(
    "    : pictureGenMode === 'style-ref'",
    "    : runtimeDisplayMode === 'style-ref'",
    'placeholder-style',
)
replace_once(
    "      : pictureGenMode === 'multi-ref'",
    "      : runtimeDisplayMode === 'multi-ref'",
    'placeholder-multi',
)
replace_once(
    "        : pictureGenMode === 'image-to-image'",
    "        : runtimeDisplayMode === 'image-to-image'",
    'placeholder-img2img',
)
replace_once(
    "          : pictureGenMode === 'upscale-hd'",
    "          : runtimeDisplayMode === 'upscale-hd'",
    'placeholder-upscale',
)

# PG-37: handleRun no content pollution + injected refs
old = """    const effectiveRefs = [
      ...resolvePictureReferenceUrls(data),
      ...upstreamPictures.filter((u) => u && !excluded.has(u)),
    ];"""
new = """    const effectiveRefs = [
      ...resolvePictureReferenceUrls(data),
      ...upstreamPictures.filter((u) => u && !excluded.has(u)),
      ...predictedSend.injected.map((i) => i.url).filter((u) => !excluded.has(u)),
    ];"""
replace_once(old, new, 'run-effective-refs')

replace_once(
    "      prePatch.content = filled[0];",
    "      prePatch.runPrompt = filled[0];",
    'run-multi-prompt',
)
replace_once(
    "        prePatch.content = composed;",
    "        prePatch.runPrompt = composed;",
    'run-pro-prompt',
)
replace_once(
    "      } else {\n        appendLog(`运行失败: ${String(e)}`);\n      }\n    } finally {\n      if (runAbortRef.current === controller) runAbortRef.current = null;\n    }",
    "      } else {\n        appendLog(`运行失败: ${String(e)}`);\n      }\n    } finally {\n      if (runAbortRef.current === controller) runAbortRef.current = null;\n      updateNodeData(blockId, { runPrompt: undefined });\n    }",
    'run-clear',
)
replace_once(
    "    appendLog,\n    meta,\n    kind,\n    imageCount,\n  ]);",
    "    appendLog,\n    meta,\n    kind,\n    imageCount,\n    predictedSend,\n  ]);",
    'run-deps',
)

# PG-41: message + compiled prompt in topSlot
old = """      {/* 一排两列：左生成结果 · 右参考图（本节点上传 + 上游传入）；单侧有内容则全宽 */}"""
new = """      {(data.message as string | undefined)?.trim() ? (
        <div className="mx-3 mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-[10px] text-amber-800">
          {String(data.message)}
        </div>
      ) : null}
      {(data.lastCompiledPrompt as string | undefined)?.trim() ? (
        <details className="mx-3 mt-2 text-[10px] text-ink/50">
          <summary className="cursor-pointer select-none">查看发送稿</summary>
          <pre className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-md bg-surface/70 border border-line/30 p-2 text-[9px] text-ink/65">
            {String(data.lastCompiledPrompt)}
          </pre>
        </details>
      ) : null}
      {/* 一排两列：左生成结果 · 右参考图（本节点上传 + 上游传入）；单侧有内容则全宽 */}"""
replace_once(old, new, 'message-compiled')

# PG-43: shot selector in topSlot
old = """      {linkedShotLabel && hasUpstream && (
        <div className="mx-3 mt-2 text-[10px] text-ink/45">{linkedShotLabel}</div>
      )}"""
new = """      {hasUpstream && shots.length > 1 ? (
        <div className="mx-3 mt-2 flex items-center gap-2 text-[10px] text-ink/45">
          <span>写回镜头</span>
          <select
            value={(data.linkedShotId as string | undefined) ?? shotIds[0] ?? ''}
            onMouseDown={stop}
            onChange={(e) => {
              const id = e.target.value;
              const s = shots.find((shot) => shot.id === id);
              updateNodeData(blockId, {
                linkedShotId: id,
                linkedShotLabel: s
                  ? `写回第 ${shots.indexOf(s) + 1} / ${shots.length} 镜（#${(s.index ?? 0) + 1}）`
                  : undefined,
              });
            }}
            className="rounded-md border border-line/40 bg-surface px-1.5 py-0.5 text-[10px] text-ink/80 focus:outline-none"
          >
            {shots.map((s, i) => (
              <option key={s.id} value={s.id}>
                第 {i + 1} / {shots.length} 镜 · #{((s.index ?? 0) + 1)}
              </option>
            ))}
          </select>
          {linkedShotLabel ? <span>{linkedShotLabel}</span> : null}
        </div>
      ) : linkedShotLabel && hasUpstream ? (
        <div className="mx-3 mt-2 text-[10px] text-ink/45">{linkedShotLabel}</div>
      ) : null}"""
replace_once(old, new, 'shot-selector')

# PG-38: advanced summary shows real mode
replace_once(
    "        ) : (\n          '标准文生图'\n        )}",
    "        ) : (\n          runtimeDisplayMode === 'style-ref'\n            ? '风格参考'\n            : runtimeDisplayMode === 'multi-ref'\n              ? '多参考'\n              : runtimeDisplayMode === 'image-to-image'\n                ? '图生图'\n                : '文生图'\n        )}",
    'advanced-mode',
)

# PG-45: gallery restore prompt
replace_once(
    "                onRestoreHistory={handleRestoreHistory}\n                failures={batchFailures}",
    "                onRestoreHistory={handleRestoreHistory}\n                onRestorePrompt={handleRestorePrompt}\n                failures={batchFailures}",
    'gallery-restore-prompt',
)

if crlf:
    text = text.replace('\n', '\r\n')
with io.open(path, 'w', encoding='utf-8', newline='') as f:
    f.write(text)
print('PictureWorkspace PG-37/38/39/40/41/43/45 applied')
