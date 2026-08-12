/**
 * shot-edit-modal.tsx — 编辑分镜弹窗（SB-OL-11 自主文件拆出，功能全保留）。
 *
 * 纯受控组件：编辑草稿与保存逻辑仍由 useStoryboardDesk 持有，
 * 本组件只负责表单渲染与 draft 字段写入。
 */
import { Clock } from 'lucide-react';
import {
  BUILTIN_COMPOSITION_TEMPLATES,
  buildLineArtShotPrompt,
  getSceneCreative,
  mapShotLexiconToDeskEnums,
  type BacklotWorkspaceItem,
  type CharacterProfile,
  type ScriptBreakdownShot,
} from '@nx9/shared';
import { ScreenModal } from '../../../components/ui/ScreenModal';
import { AssetMentionInput } from '../../../engine/stage-deck/chrome/asset-mention/AssetMentionInput';
import { toastSuccess } from '../../../stores/toast';
import {
  CAMERA_MOVES,
  CHARACTER_MENTION_KINDS,
  GLOBAL_MENTION_KINDS,
  SCENE_MENTION_KINDS,
  SHOT_SIZES,
  characterMeta,
  namesToText,
  stripMentionToken,
  textToNames,
  type ShotEditDraft,
} from './helpers';

export interface ScenePresetOption {
  id: string;
  label: string;
  description?: string;
  source: string;
}

export interface ShotEditModalProps {
  editingShot: ScriptBreakdownShot | null;
  editDraft: ShotEditDraft | null;
  setEditDraft: (next: ShotEditDraft) => void;
  onClose: () => void;
  onSave: () => void;
  scenePresets: ScenePresetOption[];
  characterNameSet: ReadonlySet<string>;
  characters: CharacterProfile[];
  costumeOptions: Array<{ id: string; label: string }>;
  propOptions: Array<{ id: string; label: string }>;
  shotLexiconOptions: Array<{ id: string; label: string }>;
  shotLexiconById: ReadonlyMap<string, { label: string; cameraMove?: string; shotSize?: string }>;
  workspaceScenes: BacklotWorkspaceItem[];
  toggleDraftCharacter: (name: string) => void;
}

export default function ShotEditModal({
  editingShot,
  editDraft,
  setEditDraft,
  onClose,
  onSave,
  scenePresets,
  characterNameSet,
  characters,
  costumeOptions,
  propOptions,
  shotLexiconOptions,
  shotLexiconById,
  workspaceScenes,
  toggleDraftCharacter,
}: ShotEditModalProps) {
  return (
    <ScreenModal
      open={Boolean(editingShot && editDraft)}
      onClose={onClose}
      title="编辑分镜"
      subtitle={
        editingShot
          ? `${editingShot.sceneCode} · 文案 / Prompt · @人物 @场景`
          : undefined
      }
      width={860}
      variant="default"
      className="sg3-modal sg3-modal--edit"
      label="编辑分镜"
    >
      {editingShot && editDraft && (
        <div className="sg sg-studio" style={{ minHeight: 'auto', maxHeight: 'min(86vh, 760px)' }}>
          <div className="sg-studio__body">
            <div className="sg-grid-2">
              <label className="sg-field" style={{ gridColumn: 'span 1' }}>
                <span className="sg-label">标题</span>
                <input
                  className="sg-input"
                  value={editDraft.title}
                  onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })}
                />
              </label>
              <label className="sg-field">
                <span className="sg-label">
                  时长 s
                  {' '}
                  <Clock size={10} style={{ display: 'inline', verticalAlign: 'middle' }} />
                </span>
                <input
                  className="sg-input"
                  type="number"
                  value={editDraft.durationSec}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, durationSec: Number(event.target.value) || 1 })
                  }
                />
              </label>
            </div>

            <div className="sg-grid-2" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <label className="sg-field">
                <span className="sg-label">景别</span>
                <select
                  className="sg-select"
                  value={editDraft.shotSize ?? ''}
                  onChange={(e) => setEditDraft({
                    ...editDraft,
                    shotSize: (e.target.value || undefined) as ShotEditDraft['shotSize'],
                  })}
                >
                  <option value="">—</option>
                  {SHOT_SIZES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="sg-field">
                <span className="sg-label">运镜</span>
                <select
                  className="sg-select"
                  value={editDraft.cameraMove ?? ''}
                  onChange={(e) => setEditDraft({
                    ...editDraft,
                    cameraMove: (e.target.value || undefined) as ShotEditDraft['cameraMove'],
                  })}
                >
                  <option value="">—</option>
                  {CAMERA_MOVES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="sg-field">
                <span className="sg-label">机位</span>
                <input
                  className="sg-input"
                  value={editDraft.cameraAngle ?? ''}
                  onChange={(e) => setEditDraft({ ...editDraft, cameraAngle: e.target.value })}
                  placeholder="平视 / 俯 / 仰…"
                />
              </label>
              <label className="sg-field">
                <span className="sg-label">镜头焦距</span>
                <input
                  className="sg-input"
                  value={editDraft.cameraLens ?? ''}
                  onChange={(e) => setEditDraft({ ...editDraft, cameraLens: e.target.value })}
                  placeholder="广角 / 标准 / 长焦"
                />
              </label>
            </div>

            <label className="sg-field">
              <span className="sg-label">镜头库绑定（可选 · 生成时合并词典 Prompt）</span>
              <select
                className="sg-select"
                value={editDraft.shotAssetId ?? ''}
                onChange={(e) => {
                  const id = e.target.value || null;
                  const hit = id ? shotLexiconById.get(id) : undefined;
                  const mapped = mapShotLexiconToDeskEnums({
                    shotSize: hit?.shotSize,
                    cameraMove: hit?.cameraMove,
                  });
                  setEditDraft({
                    ...editDraft,
                    shotAssetId: id,
                    ...(mapped.cameraMove
                      ? { cameraMove: mapped.cameraMove as ShotEditDraft['cameraMove'] }
                      : {}),
                    ...(mapped.shotSize
                      ? { shotSize: mapped.shotSize as ShotEditDraft['shotSize'] }
                      : {}),
                  });
                }}
              >
                <option value="">— 不绑定 —</option>
                {shotLexiconOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </label>

            {/* F-017: 构图模板选择 */}
            <label className="sg-field">
              <span className="sg-label">构图模板</span>
              <select
                className="sg-select"
                value={editDraft.compositionTemplateId ?? ''}
                onChange={(e) => setEditDraft({ ...editDraft, compositionTemplateId: e.target.value || null })}
              >
                <option value="">— 无模板 —</option>
                {BUILTIN_COMPOSITION_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>

            <label className="sg-field">
              <span className="sg-label">
                场景
                {editDraft.scene
                  && !scenePresets.some((scene) => scene.label === stripMentionToken(editDraft.scene)) && (
                    <span className="is-req">未入库</span>
                  )}
              </span>
              <select
                className="sg-select"
                value={
                  scenePresets.some((scene) => scene.label === stripMentionToken(editDraft.scene))
                    ? stripMentionToken(editDraft.scene)
                    : ''
                }
                onChange={(event) => {
                  const next = event.target.value;
                  if (next) setEditDraft({ ...editDraft, scene: next });
                }}
              >
                <option value="">
                  {editDraft.scene ? `当前：${stripMentionToken(editDraft.scene)}` : '选择场景预设'}
                </option>
                {scenePresets.map((scene) => (
                  <option key={scene.id} value={scene.label}>
                    {scene.label} · {scene.source}
                  </option>
                ))}
              </select>
              <div style={{ marginTop: 6 }}>
                <AssetMentionInput
                  value={editDraft.scene}
                  onChange={(next) => setEditDraft({ ...editDraft, scene: next })}
                  kinds={SCENE_MENTION_KINDS}
                  placeholder="@场景 或输入"
                  className="sg-input"
                />
              </div>
            </label>

            <label className="sg-field">
              <span className="sg-label">
                角色
                {editDraft.characters.some((n) => !characterNameSet.has(stripMentionToken(n))) && (
                  <span className="is-req">含未入库</span>
                )}
                <span className="text-[10px] text-ink/40 font-normal ml-1">从 @ 列表选库内角色（写入正式名）</span>
              </span>
              <AssetMentionInput
                value={namesToText(editDraft.characters)}
                onChange={(next) => setEditDraft({ ...editDraft, characters: textToNames(next) })}
                kinds={CHARACTER_MENTION_KINDS}
                placeholder="@角色:名 从库选择"
                className="sg-input"
              />
            </label>

            {editDraft.characters.length > 0 && costumeOptions.length > 0 ? (
              <div className="sg-field">
                <span className="sg-label">本镜换装（Cos-06 · 优先于角色默认服装）</span>
                <div className="sg-grid-2" style={{ gap: 8 }}>
                  {editDraft.characters.map((rawName) => {
                    const name = stripMentionToken(rawName);
                    const current = (editDraft.costumeOverrides ?? []).find(
                      (o) => o.characterName.trim().toLowerCase() === name.trim().toLowerCase(),
                    );
                    return (
                      <label key={name} className="sg-field" style={{ margin: 0 }}>
                        <span className="sg-label" style={{ fontWeight: 400 }}>{name}</span>
                        <select
                          className="sg-select"
                          value={current?.costumeId ?? ''}
                          onChange={(e) => {
                            const costumeId = e.target.value;
                            const hit = costumeOptions.find((c) => c.id === costumeId);
                            const rest = (editDraft.costumeOverrides ?? []).filter(
                              (o) => o.characterName.trim().toLowerCase() !== name.trim().toLowerCase(),
                            );
                            setEditDraft({
                              ...editDraft,
                              costumeOverrides: costumeId
                                ? [...rest, { characterName: name, costumeId, costumeLabel: hit?.label }]
                                : rest,
                            });
                          }}
                        >
                          <option value="">角色默认服装</option>
                          {costumeOptions.map((c) => (
                            <option key={c.id} value={c.id}>{c.label}</option>
                          ))}
                        </select>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {propOptions.length > 0 ? (
              <div className="sg-field">
                <span className="sg-label">本镜道具（Prop-06）</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {propOptions.map((p) => {
                    const on = (editDraft.propIds ?? []).includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`sg-chip ${on ? 'is-on' : ''}`}
                        style={{
                          border: '1px solid var(--nx9-line, #333)',
                          borderRadius: 999,
                          padding: '2px 8px',
                          fontSize: 11,
                          background: on ? 'rgba(45, 212, 191, 0.12)' : 'transparent',
                          color: on ? 'var(--nx9-brand, #2dd4bf)' : 'inherit',
                        }}
                        onClick={() => {
                          const cur = editDraft.propIds ?? [];
                          setEditDraft({
                            ...editDraft,
                            propIds: on ? cur.filter((id) => id !== p.id) : [...cur, p.id],
                          });
                        }}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {(() => {
              const sceneLabel = stripMentionToken(editDraft.scene || '');
              const sceneItem = workspaceScenes.find(
                (s) => s.label.trim().toLowerCase() === sceneLabel.trim().toLowerCase(),
              );
              const rec = sceneItem ? getSceneCreative(sceneItem) : null;
              const hasRec = Boolean(
                rec
                && (
                  (rec.recommendedShots?.length ?? 0)
                  || (rec.recommendedEmotions?.length ?? 0)
                  || (rec.recommendedCharacters?.length ?? 0)
                ),
              );
              if (!hasRec || !rec) return null;
              return (
                <div className="sg-field">
                  <span className="sg-label">场景创作推荐（点选写入本镜）</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(rec.recommendedShots ?? []).map((v) => (
                      <button
                        key={`shot-${v}`}
                        type="button"
                        className="sg-chip"
                        style={{ border: '1px solid var(--nx9-line,#333)', borderRadius: 999, padding: '2px 8px', fontSize: 11 }}
                        onClick={() => setEditDraft({
                          ...editDraft,
                          shotSize: (SHOT_SIZES as readonly string[]).includes(v)
                            ? (v as ShotEditDraft['shotSize'])
                            : editDraft.shotSize,
                          purpose: editDraft.purpose?.trim()
                            ? `${editDraft.purpose} · 推荐镜头:${v}`
                            : `推荐镜头:${v}`,
                        })}
                      >
                        镜头·{v}
                      </button>
                    ))}
                    {(rec.recommendedEmotions ?? []).map((v) => (
                      <button
                        key={`emo-${v}`}
                        type="button"
                        className="sg-chip"
                        style={{ border: '1px solid var(--nx9-line,#333)', borderRadius: 999, padding: '2px 8px', fontSize: 11 }}
                        onClick={() => setEditDraft({
                          ...editDraft,
                          purpose: editDraft.purpose?.trim()
                            ? `${editDraft.purpose} · @情绪:${v}`
                            : `@情绪:${v}`,
                        })}
                      >
                        情绪·{v}
                      </button>
                    ))}
                    {(rec.recommendedCharacters ?? []).map((v) => (
                      <button
                        key={`char-${v}`}
                        type="button"
                        className="sg-chip"
                        style={{ border: '1px solid var(--nx9-line,#333)', borderRadius: 999, padding: '2px 8px', fontSize: 11 }}
                        onClick={() => {
                          if (editDraft.characters.some((n) => stripMentionToken(n) === v)) return;
                          setEditDraft({ ...editDraft, characters: [...editDraft.characters, v] });
                        }}
                      >
                        角色·{v}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="sg-grid-2">
              <label className="sg-field">
                <span className="sg-label">对白说话人</span>
                <input
                  className="sg-input"
                  value={editDraft.dialogueSpeaker}
                  onChange={(e) => setEditDraft({ ...editDraft, dialogueSpeaker: e.target.value })}
                  placeholder="角色名 / 旁白"
                />
              </label>
              <label className="sg-field">
                <span className="sg-label">对白文本</span>
                <input
                  className="sg-input"
                  value={editDraft.dialogueText}
                  onChange={(e) => setEditDraft({ ...editDraft, dialogueText: e.target.value })}
                  placeholder="首条对白"
                />
              </label>
            </div>

            <label className="sg-field">
              <span className="sg-label">镜头目的</span>
              <AssetMentionInput
                value={editDraft.purpose ?? ''}
                onChange={(next) => setEditDraft({ ...editDraft, purpose: next })}
                kinds={GLOBAL_MENTION_KINDS}
                placeholder="可 @情绪 @镜头"
                className="sg-input"
              />
            </label>

            <div className="sg-grid-2">
              <label className="sg-field">
                <span className="sg-label">画面描述 visual</span>
                <textarea
                  className="sg-textarea"
                  rows={3}
                  value={editDraft.visual ?? ''}
                  onChange={(e) => setEditDraft({ ...editDraft, visual: e.target.value })}
                  placeholder="画面：环境、人物位置、光线、情绪、构图"
                />
              </label>
              <label className="sg-field">
                <span className="sg-label">动作设计 action</span>
                <textarea
                  className="sg-textarea"
                  rows={3}
                  value={editDraft.action ?? ''}
                  onChange={(e) => setEditDraft({ ...editDraft, action: e.target.value })}
                  placeholder="开始动作 → 变化 → 结束"
                />
              </label>
            </div>

            <label className="sg-field">
              <span className="sg-label">视听语言</span>
              <textarea
                className="sg-textarea"
                rows={3}
                value={editDraft.audiovisualLanguage ?? ''}
                onChange={(e) => setEditDraft({ ...editDraft, audiovisualLanguage: e.target.value })}
                placeholder="成段镜头叙事：运镜如何服务情绪、景别功能、光色对比、声画关系…"
              />
            </label>

            <div className="sg-grid-2">
              <label className="sg-field">
                <span className="sg-label">旁白</span>
                <input
                  className="sg-input"
                  value={editDraft.narration ?? ''}
                  onChange={(e) => setEditDraft({ ...editDraft, narration: e.target.value })}
                />
              </label>
              <label className="sg-field">
                <span className="sg-label">声音 / 音效</span>
                <input
                  className="sg-input"
                  value={editDraft.sound ?? ''}
                  onChange={(e) => setEditDraft({ ...editDraft, sound: e.target.value })}
                  placeholder="环境声、音乐设计"
                />
              </label>
            </div>

            <label className="sg-field">
              <span className="sg-label">连贯备注（分号分隔）</span>
              <input
                className="sg-input"
                value={(editDraft.continuityNotes ?? []).join('；')}
                onChange={(e) => setEditDraft({
                  ...editDraft,
                  continuityNotes: e.target.value
                    .split(/[；;\n]+/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                })}
                placeholder="服装/道具/位置/朝向/光线延续"
              />
            </label>

            <div className="sg-edit-grid">
              <div className="sg-panel">
                <div className="sg-panel__head">
                  <h3 className="sg-panel__title">角色预选</h3>
                  <span className="sg-panel__meta">{characters.length}</span>
                </div>
                {characters.length === 0 ? (
                  <p className="sg-warn" style={{ margin: 0 }}>暂无角色，先在角色设定补齐</p>
                ) : (
                  <div className="sg-chip-wrap">
                    {characters.map((character) => {
                      const active = editDraft.characters.includes(character.name);
                      return (
                        <button
                          key={character.id}
                          type="button"
                          className={`sg-chip ${active ? 'is-on' : ''}`}
                          onClick={() => toggleDraftCharacter(character.name)}
                          title={characterMeta(character)}
                        >
                          {character.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="sg-panel">
                <div className="sg-panel__head">
                  <h3 className="sg-panel__title">场景预选</h3>
                  <span className="sg-panel__meta">{scenePresets.length}</span>
                </div>
                {scenePresets.length === 0 ? (
                  <p className="sg-warn" style={{ margin: 0 }}>暂无场景，先在场景设定补齐</p>
                ) : (
                  <div className="sg-chip-wrap">
                    {scenePresets.map((scene) => {
                      const active = stripMentionToken(editDraft.scene) === scene.label;
                      return (
                        <button
                          key={scene.id}
                          type="button"
                          className={`sg-chip ${active ? 'is-on' : ''}`}
                          onClick={() => setEditDraft({ ...editDraft, scene: scene.label })}
                          title={scene.description}
                        >
                          {scene.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <label className="sg-field">
              <span className="sg-label">分镜剧本 / 文案</span>
              <AssetMentionInput
                as="textarea"
                rows={3}
                value={editDraft.scriptText}
                onChange={(next) => setEditDraft({ ...editDraft, scriptText: next })}
                kinds={GLOBAL_MENTION_KINDS}
                placeholder="可 @ 角色、场景、镜头、情绪、声音"
                className="sg-textarea"
              />
            </label>
            <label className="sg-field">
              <span className="sg-label">画面图片提示词 imagePrompt</span>
              <AssetMentionInput
                as="textarea"
                rows={4}
                value={editDraft.imagePrompt}
                onChange={(next) => setEditDraft({ ...editDraft, imagePrompt: next })}
                kinds={GLOBAL_MENTION_KINDS}
                className="sg-textarea"
              />
            </label>
            <label className="sg-field">
              <span className="sg-label">画面视频提示词 videoPrompt</span>
              <AssetMentionInput
                as="textarea"
                rows={4}
                value={editDraft.videoPrompt}
                onChange={(next) => setEditDraft({ ...editDraft, videoPrompt: next })}
                kinds={GLOBAL_MENTION_KINDS}
                className="sg-textarea"
              />
            </label>
            <label className="sg-field">
              <span className="sg-label">线稿构图提示词 sketchPrompt</span>
              <AssetMentionInput
                as="textarea"
                rows={3}
                value={editDraft.sketchPrompt ?? ''}
                onChange={(next) => setEditDraft({ ...editDraft, sketchPrompt: next })}
                kinds={GLOBAL_MENTION_KINDS}
                placeholder="黑白线稿构图：站位 / 前中后景 / 轮廓 / 机位；无色彩无材质"
                className="sg-textarea"
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="sg-btn sg-btn--ghost"
                  onClick={() => {
                    const filled = buildLineArtShotPrompt(
                      [
                        editDraft.scriptText || editDraft.visual || editDraft.title,
                        editDraft.scene ? `location: ${editDraft.scene}` : '',
                        editDraft.shotSize ? `${editDraft.shotSize} shot` : '',
                        editDraft.cameraMove ? `camera: ${editDraft.cameraMove}` : '',
                        editDraft.cameraAngle ? `angle: ${editDraft.cameraAngle}` : '',
                        editDraft.characters?.length ? `characters: ${editDraft.characters.join(', ')}` : '',
                      ].filter(Boolean).join('\n'),
                      editDraft.shotSize,
                    );
                    setEditDraft({ ...editDraft, sketchPrompt: filled });
                  }}
                >
                  用镜头信息填充线稿词
                </button>
                <button
                  type="button"
                  className="sg-btn sg-btn--ghost"
                  disabled={!editDraft.sketchPrompt?.trim()}
                  onClick={() => {
                    const v = (editDraft.sketchPrompt ?? '').trim();
                    if (!v) return;
                    void navigator.clipboard.writeText(v).then(
                      () => toastSuccess('已复制线稿提示词'),
                      () => toastSuccess('已复制线稿提示词'),
                    );
                  }}
                >
                  复制线稿词
                </button>
              </div>
            </label>
            <label className="sg-field">
              <span className="sg-label">排除项 negativePrompt</span>
              <textarea
                className="sg-textarea"
                rows={2}
                value={editDraft.negativePrompt ?? ''}
                onChange={(e) => setEditDraft({ ...editDraft, negativePrompt: e.target.value })}
                placeholder="不想出现的元素"
              />
            </label>
          </div>

          <div className="sg-studio__foot">
            <p className="sg-studio__foot-hint">
              {editingShot.sceneCode}
              {' · '}
              修改写回剧本拆分结构与故事板
            </p>
            <div className="sg-studio__foot-actions">
              <button
                type="button"
                className="sg-btn sg-btn--ghost"
                onClick={onClose}
              >
                取消
              </button>
              <button type="button" className="sg-btn sg-btn--primary" onClick={onSave}>
                保存修改
              </button>
            </div>
          </div>
        </div>
      )}
    </ScreenModal>
  );
}
