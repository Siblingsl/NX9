import { useCallback, useState } from 'react';
import type { CharacterProfile } from '@nx9/shared';
import { Mic, Plus, Trash2, Upload, User, X } from 'lucide-react';
import { api } from '../api/client';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { useActivityLog } from '../stores/activity-log';

function newCharacter(): CharacterProfile {
  return {
    id: `char-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: '新角色',
    descriptionZh: '',
    consistencyPrompt: '',
    referenceImageUrl: null,
    referenceAudioUrl: null,
    tags: [],
  };
}

export function CharacterLibraryPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const characters = useWorkspaceDocument((s) => s.characters.characters);
  const upsert = useWorkspaceDocument((s) => s.upsertCharacter);
  const remove = useWorkspaceDocument((s) => s.removeCharacter);
  const appendLog = useActivityLog((s) => s.append);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = characters.find((c) => c.id === selectedId) ?? characters[0];

  const handleUploadImage = useCallback(
    async (file: File, charId: string) => {
      try {
        const res = await api.uploadAsset(file);
        const c = characters.find((x) => x.id === charId);
        if (!c) return;
        upsert({ ...c, referenceImageUrl: res.url });
        appendLog(`已上传角色参考图 · ${c.name}`);
      } catch (e) {
        appendLog(`上传失败: ${String(e)}`);
      }
    },
    [characters, upsert, appendLog],
  );

  const handleUploadAudio = useCallback(
    async (file: File, charId: string) => {
      try {
        const res = await api.uploadAsset(file);
        const c = characters.find((x) => x.id === charId);
        if (!c) return;
        upsert({ ...c, referenceAudioUrl: res.url });
        appendLog(`已上传克隆参考音 · ${c.name}`);
      } catch (e) {
        appendLog(`参考音上传失败: ${String(e)}`);
      }
    },
    [characters, upsert, appendLog],
  );

  if (!open) return null;

  return (
    <aside className="w-[320px] shrink-0 border-l border-line bg-white flex flex-col h-full absolute right-0 top-0 z-20 shadow-panel">
      <div className="h-12 shrink-0 border-b border-line flex items-center px-3 gap-2">
        <User size={18} className="text-brand" />
        <span className="font-semibold text-sm flex-1">角色库</span>
        <button
          type="button"
          onClick={() => {
            const c = newCharacter();
            upsert(c);
            setSelectedId(c.id);
          }}
          className="p-1 rounded-lg hover:bg-surface text-brand"
          title="新建角色"
        >
          <Plus size={16} />
        </button>
        <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-surface text-ink/50">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        <ul className="w-[110px] border-r border-line overflow-y-auto nx9-scroll p-1">
          {characters.length === 0 ? (
            <li className="text-[10px] text-ink/40 p-2 text-center">暂无角色</li>
          ) : (
            characters.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left text-xs px-2 py-1.5 rounded-lg truncate ${
                    selected?.id === c.id ? 'bg-brand/10 text-brand' : 'hover:bg-surface'
                  }`}
                >
                  {c.name}
                  {c.referenceAudioUrl ? ' 🎙' : ''}
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="flex-1 p-3 overflow-y-auto nx9-scroll text-xs space-y-2">
          {selected ? (
            <>
              <input
                value={selected.name}
                onChange={(e) => upsert({ ...selected, name: e.target.value })}
                className="w-full font-semibold text-sm border-b border-line pb-1 focus:outline-none"
              />
              <textarea
                value={selected.descriptionZh ?? ''}
                onChange={(e) => upsert({ ...selected, descriptionZh: e.target.value })}
                placeholder="中文人设…"
                className="w-full min-h-[56px] rounded-xl border border-line px-2 py-1"
              />
              <textarea
                value={selected.consistencyPrompt ?? ''}
                onChange={(e) => upsert({ ...selected, consistencyPrompt: e.target.value })}
                placeholder="一致性英文 prompt（发型、服装、气质）"
                className="w-full min-h-[72px] rounded-xl border border-line px-2 py-1 font-mono text-[10px]"
              />
              {selected.referenceImageUrl ? (
                <img
                  src={selected.referenceImageUrl}
                  alt=""
                  className="w-full rounded-xl border border-line max-h-28 object-cover"
                />
              ) : (
                <div className="rounded-xl border border-dashed border-line py-6 text-center text-ink/40">
                  无参考图
                </div>
              )}
              <label className="flex items-center justify-center gap-1 rounded-lg border border-line py-2 cursor-pointer hover:border-brand/40">
                <Upload size={14} />
                上传参考图
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUploadImage(f, selected.id);
                  }}
                />
              </label>

              <div className="rounded-xl border border-line p-2 space-y-2">
                <div className="flex items-center gap-1 text-ink/70 font-medium">
                  <Mic size={14} />
                  LuxTTS 克隆参考音
                </div>
                {selected.referenceAudioUrl ? (
                  <audio src={selected.referenceAudioUrl} controls className="w-full h-8" />
                ) : (
                  <p className="text-[10px] text-ink/40">≥3 秒 wav/mp3，用于本地音色克隆</p>
                )}
                <label className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-line py-2 cursor-pointer hover:border-brand/40">
                  <Upload size={14} />
                  上传参考音
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUploadAudio(f, selected.id);
                    }}
                  />
                </label>
                {selected.referenceAudioUrl && (
                  <button
                    type="button"
                    onClick={() => upsert({ ...selected, referenceAudioUrl: null })}
                    className="text-[10px] text-red-600"
                  >
                    清除参考音
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  remove(selected.id);
                  setSelectedId(null);
                }}
                className="w-full flex items-center justify-center gap-1 text-red-600 py-1"
              >
                <Trash2 size={14} />
                删除角色
              </button>
            </>
          ) : (
            <p className="text-ink/50 text-center py-8">点击 + 创建角色，用于分镜一致性与 LuxTTS 配音克隆</p>
          )}
        </div>
      </div>
    </aside>
  );
}
