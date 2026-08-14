# -*- coding: utf-8 -*-
import io


def replace_one(path, old, new, label):
    with io.open(path, 'r', encoding='utf-8') as f:
        text = f.read()
    crlf = '\r\n' in text
    text = text.replace('\r\n', '\n')
    idx = text.find(old)
    if idx < 0:
        raise SystemExit('NOT FOUND: ' + label)
    if text.find(old, idx + len(old)) >= 0:
        raise SystemExit('MULTIPLE: ' + label)
    text = text[:idx] + new + text[idx + len(old):]
    if crlf:
        text = text.replace('\n', '\r\n')
    with io.open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(text)
    print('applied ' + label)


preview = r'F:\code\project\NX9\apps\web\src\engine\storyboard-preview-runner.ts'
replace_one(
    preview,
    "  const { modelId, size } = resolvePictureGenSettings(pictureNodeData, previewSettings);\n  const urls = await runPictureGenJob({",
    "  const { modelId, size } = resolvePictureGenSettings(pictureNodeData, previewSettings);\n  // PG-44: 分镜预览域直调 runPictureGenJob，不冒充 picture-gen 节点 result；\n  // 产物只写 preview frame / lineArtUrl，不写链镜 firstFrame，也不写节点 usedAssetIds。\n  const urls = await runPictureGenJob({",
    'pg44-preview-comment',
)

director = r'F:\code\project\NX9\apps\web\src\engine\director-desk-runner.ts'
replace_one(
    director,
    "  try {\n    const urls = await runPictureGenJob({",
    "  try {\n    // PG-44: 导演域直调 runPictureGenJob，账本以 keyframeProvenance 为准\n    // （usedRefs/model/promptHash/batchId）；不写 picture-gen 节点 usedAssetIds，\n    // 避免把导演批关键帧误当节点 result，两套账本边界明确。\n    const urls = await runPictureGenJob({",
    'pg44-director-comment',
)
