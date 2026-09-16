/**
 * AssetCandidatePromptCopy.tsx — 候选设定 Prompt 一键复制（R2 新增）。
 *
 * 背景：`engine/script-asset-candidates.ts` 里的
 * `buildCharacterCandidatePrompt` / `buildSceneCandidatePrompt` /
 * `scriptCandidateCharacterKeys` / `copyTextWithLog` 四个导出早已实现，
 * 但全仓没有任何生产调用方 —— 「有实现、没入口」。
 *
 * 接入位置：既有「设定就绪」面板（`AssetReadinessPanel`）的角色 / 场景区，
 * 复用该面板已有的 `report.requiredCharacters` / `report.requiredScenes` 名单，
 * **不新增任何持久化字段**，也不新建第二套名单来源（只读既有名单 + 既有素材库）。
 *
 * 幂等性：本组件是**只读 + 复制**，不写入工作区任何字段，因此不存在重复注入问题；
 * 同一角色重复点击只产生同一段文本（纯函数由被复用的既有构造器保证）。
 */
import { memo, useMemo } from 'react';
import { Copy } from 'lucide-react';
import type { CharacterProfile, EnvironmentProfile } from '@nx9/shared';
import { toastError } from '../../stores/toast';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import {
  buildCharacterCandidatePrompt,
  buildSceneCandidatePrompt,
  copyTextWithLog,
  scriptCandidateCharacterKeys,
} from '../../engine/script-asset-candidates';

export interface AssetCandidatePromptCopyProps {
  /** 既有「设定就绪」名单（只读消费，不新增来源） */
  requiredCharacters: string[];
  requiredScenes: string[];
}

function findCharacter(
  library: CharacterProfile[],
  name: string,
): CharacterProfile | undefined {
  const target = name.trim();
  if (!target) return undefined;
  return library.find((c) => {
    const keys = scriptCandidateCharacterKeys(c);
    return keys.includes(target) || c.name?.trim() === target;
  });
}

function findEnvironment(
  library: EnvironmentProfile[],
  name: string,
): EnvironmentProfile | undefined {
  const target = name.trim();
  if (!target) return undefined;
  return library.find(
    (env) => env.name?.trim() === target || env.sceneCode?.trim() === target,
  );
}

export const AssetCandidatePromptCopy = memo(function AssetCandidatePromptCopy({
  requiredCharacters,
  requiredScenes,
}: AssetCandidatePromptCopyProps) {
  const libraryCharacters = useWorkspaceDocument((s) => s.characters.characters);
  const environments = useWorkspaceDocument((s) => s.environments);
  const appendLog = useActivityLog((s) => s.append);

  const libraryEnvironments = useMemo(
    () => environments?.environments ?? [],
    [environments],
  );

  const characterRows = useMemo(
    () =>
      requiredCharacters.map((name) => ({
        name,
        profile: findCharacter(libraryCharacters, name),
      })),
    [requiredCharacters, libraryCharacters],
  );

  const sceneRows = useMemo(
    () =>
      requiredScenes.map((name) => ({
        name,
        profile: findEnvironment(libraryEnvironments, name),
      })),
    [requiredScenes, libraryEnvironments],
  );

  const total = characterRows.length + sceneRows.length;
  if (total === 0) return null;

  const copyCharacter = (name: string, profile: CharacterProfile | undefined) => {
    if (!profile) {
      toastError(`「${name}」尚未入库，无法生成候选设定 Prompt`);
      return;
    }
    void copyTextWithLog(buildCharacterCandidatePrompt(profile), appendLog, `已复制「${name}」角色候选设定 Prompt`);
  };

  const copyScene = (name: string, profile: EnvironmentProfile | undefined) => {
    if (!profile) {
      toastError(`「${name}」尚未入库，无法生成候选场景 Prompt`);
      return;
    }
    void copyTextWithLog(buildSceneCandidatePrompt(profile), appendLog, `已复制「${name}」场景候选设定 Prompt`);
  };

  return (
    <div className="sd2-ready-section" data-ready-section="candidate-prompts">
      <p className="sd2-ready-section__title">候选设定 Prompt（复制到外部 LLM 补全）</p>
      <p className="sd2-ready-section__empty">
        由素材库既有角色 / 场景档案拼装；不入库的条目无法生成。复制只读文本，不改写任何字段。
      </p>
      {characterRows.length > 0 && (
        <div className="sd2-ready-tags">
          {characterRows.map(({ name, profile }) => (
            <button
              type="button"
              key={`char-${name}`}
              onClick={() => copyCharacter(name, profile)}
              className={`sd2-ready-tag ${profile ? 'sd2-ready-tag--clickable' : 'sd2-ready-tag--warn'}`}
              title={
                profile
                  ? `复制角色「${name}」候选设定 Prompt`
                  : `「${name}」尚未入库，请先建档`
              }
            >
              <Copy size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />
              角色 {name}
            </button>
          ))}
        </div>
      )}
      {sceneRows.length > 0 && (
        <div className="sd2-ready-tags">
          {sceneRows.map(({ name, profile }) => (
            <button
              type="button"
              key={`scene-${name}`}
              onClick={() => copyScene(name, profile)}
              className={`sd2-ready-tag ${profile ? 'sd2-ready-tag--clickable' : 'sd2-ready-tag--warn'}`}
              title={
                profile
                  ? `复制场景「${name}」候选设定 Prompt`
                  : `「${name}」尚未入库，请先在素材库建档`
              }
            >
              <Copy size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />
              场景 {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
