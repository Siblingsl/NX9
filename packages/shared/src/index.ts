export type {
  ViewportState,
  FlowBlock,
  FlowLink,
  WorkspacePayload,
  WorkspacePayloadV2,
  WorkspacePayloadV3,
  WorkspaceSummary,
  WorkspaceExportEnvelope,
  UserSummary,
  UsageSummary,
  ViewMode,
  TakeRecord,
  SceneGroupRecord,
  LaneConfig,
  EpisodePlaybookProgress,
  PlaybookWorkflowStatus,
  PlaybookSession,
} from './types/workspace';
export {
  normalizeWorkspacePayload,
  migrateV2ToV3,
  isWorkspaceV3,
} from './types/workspace';
export {
  snapshotPlaybookProgress,
  projectPlaybookProgress,
  createInitialEpisodePlaybookProgress,
  syncCurrentEpisodePlaybookProgress,
  hydrateEpisodePlaybookProgress,
  switchPlaybookEpisode,
  migratePlaybookStepId,
  migratePlaybookCompletedStepIds,
  migratePlaybookSessionSteps,
} from './utils/playbook-episode-progress';

export type {
  ShotStatus,
  ShotType,
  SketchSource,
  StoryboardReviewStage,
  StoryboardReviewDecision,
  StoryboardReviewEvent,
  StoryboardVideoVersion,
  StoryboardDirectorCharacterPlacement,
  EpisodeExportRecord,
  EpisodeMeta,
  EpisodeStatus,
  StoryboardDirector3dGuide,
  StoryboardKeyframeProvenance,
  StoryboardGuideOverlay,
  StoryboardShot,
  StoryboardPayload,
  VoiceProfile,
  VoiceLine,
  VoicePayload,
  VoiceLineStatus,
  WorkspacePreferences,
} from './types/storyboard';
export type {
  StoryboardGuideKind,
  StoryboardGuideArrow,
  StoryboardGuideMark,
} from './types/storyboard-guide';
export {
  STORYBOARD_GUIDE_COLORS,
  STORYBOARD_GUIDE_LEGEND,
  STORYBOARD_GUIDE_KINDS,
  emptyStoryboardGuideOverlay,
  isStoryboardGuideOverlay,
  filterStoryboardGuideOverlay,
} from './types/storyboard-guide';
export {
  resolveStoryboardGuideOverlay,
  buildStoryboardGuideOverlayFromShot,
  buildVideoGuidePromptSuffix,
  buildKeyframeNoGuidePromptSuffix,
} from './utils/storyboard-guide';
export {
  emptyStoryboard,
  emptyVoice,
  migrateStoryboardPayload,
  resolveActiveEpisodeId,
  activeEpisodeShots,
  listEpisodeMetas,
  createEpisodeMeta,
  resolveStoryboardVideoVersions,
  appendStoryboardVideoVersion,
  adoptStoryboardVideoVersion,
  approveStoryboardVideoShot,
  rejectStoryboardVideoShot,
  resolveVideoStatusBadge,
  appendStoryboardReviewEvent,
  appendEpisodeExportRecord,
} from './types/storyboard';

export type {
  ScriptBreakdownDialogueLine,
  ScriptBreakdownStoryAnalysis,
  ScriptBreakdownCharacterProfile,
  ScriptBreakdownAct,
  ScriptBreakdownShot,
  ScriptBreakdownEpisode,
  ScriptBreakdownPayload,
  ScriptBreakdownScene,
  ScriptBreakdownConfig,
  ScriptBreakdownPromptTemplates,
  ScriptBreakdownPromptPack,
  ScriptBreakdownExportEnvelope,
  ScriptBreakdownDiagnostic,
} from './types/script-breakdown';
export {
  emptyScriptBreakdown,
  DEFAULT_SCRIPT_BREAKDOWN_CONFIG,
  DEFAULT_SCRIPT_BREAKDOWN_PROMPTS,
  flattenScriptBreakdownShots,
  storyboardShotsFromScriptBreakdown,
  bindStoryboardShotAssets,
} from './types/script-breakdown';
export type {
  ScreenplayPackageStatus,
  ScreenplayBrief,
  ScreenplayEpisode,
  ScreenplayCharacterDraft,
  ScreenplaySceneDraft,
  ScreenplayWorldDraft,
  ScreenplayBible,
  ScreenplayDiagnostic,
  ScreenplayPackage,
  ScriptDeskSkillPromptPack,
  ScriptDeskSkillId,
  ScriptDeskAgentMessage,
  ScriptDeskAgentSession,
  ScriptDeskNodeData,
} from './types/screenplay-package';
export type {
  DirectorKeyframeBatch,
  DirectorKeyframeBatchShot,
  DirectorKeyframeBatchReceipt,
  DirectorKeyframeBatchFailure,
  DirectorKeyframeBatchStatus,
} from './types/director-keyframe-batch';
export {
  emptyScreenplayPackage,
  isScreenplayPackage,
  screenplayFullText,
  screenplayWordCount,
  resolveScreenplayStatus,
  touchScreenplayPackage,
  confirmScreenplayPackage,
  unconfirmIfEdited,
  buildScreenplayMeta,
  episodesFromIngestText,
  cleanEpisodeTitle,
  normalizeScreenplayEpisode,
  normalizeScreenplayEpisodes,
  ingestTextToPackage,
  mergeCharacterDrafts,
  dedupeCharacterDrafts,
  normalizeScreenplayBibleCharacters,
  mergeSceneDrafts,
  characterDraftFromPartial,
  sceneDraftFromPartial,
  splitCharacterDisplayName,
  bibleDraftsFromExtract,
  calibrateCharacterRolesByScreenplay,
  bibleDraftsFromBreakdown,
  sceneDraftsFromScreenplayText,
  enrichBibleScenesFromPackage,
  migrateDialogueSheetDataToPackage,
  applyPackagePatch,
  summarizePackagePatch,
  removeScreenplayEpisode,
  insertEmptyEpisodeAfter,
  lintScreenplayFormat,
  findReplaceInEpisode,
  renameCharacterInPackage,
  extractScreenplayExcerpts,
  buildNarrativeConsistencyDiagnostics,
  DEFAULT_SCRIPT_DESK_SKILL_PROMPTS,
  normalizeScriptDeskPrompts,
} from './types/screenplay-package';
export {
  SCRIPT_DESK_CHIP_TO_SKILL,
  AGENT_CAPABILITY_TO_SKILL,
  resolveScriptDeskSkillName,
  resolveAgentSkillName,
  skillBodyForInjection,
  isSkillStubContent,
  BUILTIN_SKILL_IDS,
  BUILTIN_GEN_SKILL_IDS,
  resolveSkillLane,
} from './utils/skill-runtime';
export type { AgentCapabilityId } from './utils/skill-runtime';
export {
  parseGenPromptPack,
  fillGenTemplate,
  isGenPromptPackEmpty,
} from './utils/gen-skill-pack';
export type { GenPromptPack } from './utils/gen-skill-pack';
export type {
  SmartEditNodeData,
  SmartEditProfile,
  SmartEditEngine,
  SmartSuggestion,
} from './types/smart-edit';
export {
  resolveEngine,
  engineLabel,
  profileLabel,
  buildViralClip,
  buildA1Clip,
} from './types/smart-edit';
export { buildScriptBreakdownFromText } from './utils/script-breakdown';
export {
  normalizeScriptBreakdownConfig,
  normalizeScriptBreakdownPrompts,
  suggestedShotsPerEpisodeRange,
  splitSourceIntoEpisodeChunks,
  splitLongEpisodeText,
  buildEpisodePlannerUserPrompt,
  buildEpisodeBreakdownUserPrompt,
  createScriptBreakdownPromptPack,
  parseScriptBreakdownPromptPack,
  createScriptBreakdownExportEnvelope,
  parseScriptBreakdownExportEnvelope,
  validateScriptBreakdownPayload,
  type ScriptEpisodeChunk,
} from './utils/script-breakdown-production';
export {
  DEFAULT_SHOT_DURATION_SEC,
  buildShotTimeline,
  shotTimelineMap,
  formatShotTimeRange,
  suggestStoryboardGridCols,
  type ShotTimelineInput,
  type ShotTimelineEntry,
} from './utils/shot-timeline';

export type {
  StoryboardPreviewFrameStatus,
  StoryboardPreviewViewMode,
  StoryboardPreviewGridColumns,
  StoryboardPreviewFrame,
  StoryboardPreviewDirector3dGuide,
  StoryboardPreviewPanorama720,
  StoryboardPreviewPayload,
  StoryboardPreviewPictureSettings,
  StoryboardPreviewConsistencyDimension,
  StoryboardPreviewConsistencyReport,
  StoryboardPreviewComputeInput,
  StoryboardPreviewAiExtensions,
} from './types/storyboard-preview';
export {
  emptyStoryboardPreview,
  DEFAULT_STORYBOARD_PREVIEW_PICTURE_SETTINGS,
  KEYFRAME_SCORE_THRESHOLD,
  resolveStoryboardPreviewPictureSettings,
  computeStoryboardPreviewFrameCount,
  estimateActionComplexity,
  buildStoryboardPreviewFrames,
  buildStoryboardPreviewFramesFromBreakdown,
  storyboardPreviewSummary,
  canRegenerateFrame,
  scopeStoryboardPreviewFrames,
  canConfirmStoryboardPreview,
  getEpisodeContactSheet,
} from './types/storyboard-preview';
export {
  buildStoryboardFramePrompt,
  buildDirectorCharacterPlacementPrompt,
  writeBackBreakdownPreviewImage,
  resolveConnectedPictureGenId,
  resolveConnectedStoryboardPreviewId,
  isPictureGenDelegatedToPreview,
  buildPictureGenDelegatePatch,
  resolveConnectedDirector3dId,
  resolveConnectedStoryboardPreviewForDirector3dId,
  isDirector3dDelegatedToPreview,
} from './utils/storyboard-preview-jobs';

export type { SceneSplitRecord, SceneSplitPayload } from './types/scene-split';
export type { EnvironmentProfile, EnvironmentLibraryPayload } from './types/environment';
export { migrateEnvironmentProfile } from './types/environment';

export { parseStoryboardMarkdown } from './utils/storyboard-import';
export {
  resolveAssetImportItems,
  syncAssetImportNodeFields,
  guessMediaKindFromFile,
  guessMediaKindFromUrl,
  type ImportedAssetItem,
  type ImportedAssetMediaKind,
} from './utils/asset-import';
export { splitText, type TextSplitMode } from './utils/text-split';
export {
  PIPELINE_STAGES,
  computeStageReadiness,
  resolvePipelineStageStates,
  type PipelineStageId,
  type PipelineStage,
  type StageReadiness,
  type PipelineStageState,
  PIPELINE_STAGE_FIXES,
  type PipelineStageFix,
  type ReadinessInput,
} from './utils/stage-readiness';
export {
  suggestShotGroups,
  type ShotGroupSuggestion,
  type ShotGroupingConfig,
} from './utils/shot-grouping';
export {
  groupSClassShots,
  validateSClassReferences,
  compileSClassPrompt,
  SCLASS_MAX_DURATION_SEC,
  SCLASS_MAX_REF_IMAGES,
  SCLASS_MAX_REF_VIDEOS,
  type SClassGroup,
  type SClassCompileResult,
} from './utils/sclass-compiler';

export {
  emptyClipChain,
  shotsToClipChain,
  buildContinuationPrompt,
  summarizeClipResult,
} from './utils/clip-chain';
export type { ClipChainItem, ClipChainState } from './utils/clip-chain';
export { bridgePromptSuffix, defaultBridge, type BridgeShotMeta, type BridgeRef } from './utils/bridge-shot-meta';
export { compileScenePrompt, type SceneCardData } from './utils/scene-card-prompt';
export { enrichPromptWithEnvironment, buildEnvironmentContextPrompt } from './utils/environment-prompt';
export type { ConsistencyIssue, ConsistencyReport } from './utils/consistency-repair';
export { buildBridgeContinuationPrompt, type ContinuationInput } from './utils/seedance-continuation';

export { buildTimelineFromShots, buildTimelineFromShotsV2, type TranscribeCue, type ShotInput } from './utils/timeline-export';
export type { TimelineClip, TimelineTrack, TimelineTrackKind, TimelinePayload, TimelineAspect, TimelineTransition, TimelineVolumeKeyframe } from './types/timeline';
export { migrateTimelinePayload, computeTimelineDuration } from './utils/timeline-migrate';
export {
  applyTimelineOp,
  applyTimelineOps,
  findTimelineClip,
  listTimelineMediaUrls,
  calibrateTimelineWithDurations,
  nextTrackId,
  MIN_CLIP_SEC,
  type TimelineOp,
  type ClipLocation,
} from './utils/timeline-ops';
export {
  sampleClipVolume,
  upsertVolumeKeyframe,
  removeVolumeKeyframe,
  splitVolumeKeyframes,
  clampClipVolume,
} from './utils/timeline-volume';
export { FIXTURE_TIMELINE_V2, FIXTURE_SHOTS_FOR_TIMELINE } from './utils/fixtures-timeline';
export {
  parseTimelineDraft,
  countTimelineClips,
  hasEffectiveTimeline,
  type TimelineDraftRaw,
} from './utils/timeline-effective';
export {
  timelineToHyperFramesVars,
  timelineToHyperFramesHtml,
  listHyperFramesTemplates,
} from './utils/hyperframes-export';
export type { HyperFramesTemplate } from './utils/hyperframes-export';
export { timelineToFcpxml } from './utils/fcpxml-export';

export {
  timelineToRemotion,
  shotsToRemotion,
  clipAtTime,
  timelineToRemotionInputProps,
  timelineToRemotionStudioBundle,
  validateRemotionTimeline,
} from './utils/remotion-export';
export type {
  RemotionComposition,
  RemotionTrack,
  RemotionClipSequence,
} from './utils/remotion-export';

export {
  topologicalSort,
  topologicalLayers,
  gatherUpstream,
  mergeUpstreamPrompt,
  collectLinkedShotIdsFromData,
} from './engine/flow-graph';
export type { UpstreamOutputs } from './engine/flow-graph';
export {
  extractDialogueLinesFromText,
  extractDialogueLinesFromPackage,
  extractDialogueLinesFromBreakdown,
  normalizeDialogueLines,
  resolveVoiceCastLines,
} from './utils/dialogue-lines';
export type { DialogueLine, VoiceCastLineSource } from './utils/dialogue-lines';

export type {
  PromptBatchItem,
  PromptBatchJob,
  PromptDispatchMode,
  PromptComposeAction,
  PromptDispatchMeta,
  FlowBlockLike,
  FlowLinkLike,
} from './types/prompt-batch';
export {
  newPromptBatchItem,
  mergePromptBatchItems,
  promptItemsToBatch,
  resolvePromptBatch,
  collectUpstreamForPromptMerge,
} from './types/prompt-batch';

export type {
  ProviderCredential,
  CloudTarget,
  AppPreferences,
  AppSettings,
  LuxTtsNoGpuFallback,
  ModelConnection,
} from './types/settings';
export { BUILTIN_CONNECTION_PRESETS } from './types/settings';

export type { BlockCategory, BlockDefinition, SocketKind, SocketProfile } from './types/block';

export type { SkillSummary, SkillDetail, SkillMetadata, SkillValidationResult, SkillLane, ConnectionChannelStatus, ConnectionStatus } from './types/skills';

export {
  BLOCK_CATALOG,
  BLOCK_GROUPS,
  INTERNAL_BLOCKS,
  lookupBlock,
  isBlockSpawnable,
  isDockVisible,
  getSpawnableBlocks,
  getDockBlocks,
} from './catalog/block-catalog';
export {
  buildMediaPinNodeData,
  parseMediaPinPayload,
  resolveMediaPinKind,
  guessMediaPinKindFromUrl,
  guessMediaPinKindFromFile,
  isMediaPinDropFile,
  mediaPinKindToSocket,
  mediaPinKindLabel,
  isMediaPinKind,
  type MediaPinPayload,
  type MediaPinSource,
  type MediaPinKind,
  type MediaPinNodeData,
} from './utils/media-pin';

export {
  ATTACHED_WORKSPACE_REGISTRY,
  resolveAttachedWorkspace,
  shouldUseCompactNodeShell,
  shouldPreserveNativeNodeCard,
  type AttachedWorkspaceType,
  type NodeFunctionalClass,
  type AttachedWorkspaceSpec,
} from './catalog/attached-workspace';

export {
  resolveNodeInteraction,
  resolveNodeInteractionClass,
  normalizeNodeStatus,
  resolveNodePromptText,
  resolveNodePromptField,
  truncatePromptPreview,
  resolveNodeAssetTags,
  resolveNodeThumbUrl,
  resolveNodeOutputCount,
  type NodeInteractionClass,
  type NodeInteractionProfile,
  type NodeRunStatus,
  type NodeAssetTag,
  PROMPT_BAR_KINDS,
  PROMPT_BAR_GEN_KINDS,
  isPromptBarKind,
  isPromptBarGenKind,
} from './catalog/node-interaction';

export {
  BLOCK_KIND_MIGRATIONS,
  BLOCK_KIND_MIGRATION_PATCHES,
  DEPRECATED_BLOCK_KINDS,
  DIRECTOR3D_NODE_SCHEMA_VERSION,
  DIRECTOR3D_REVERSE_MIGRATION_VERSION,
  hasPersistedDirector3dState,
  hasDirectorDeskProductionState,
  migrateBlockKind,
  migrateBlockKinds,
  stripReviewGateFromGraph,
  stripAssetGateFromGraph,
  getBlockKindMigrationTarget,
  isDeprecatedBlockKind,
  type MigratableNode,
  type MigratableLink,
} from './catalog/migrate-block-kinds';

export {
  SOCKET_REGISTRY,
  SOCKET_COLORS,
  SOCKET_LABELS,
  resolveEmits,
  resolveAccepts,
  socketsCompatible,
  validateLink,
  EXEC_PICTURE_HANDLES,
  EXEC_3D_HANDLES,
  VERTICAL_SOCKETS,
  resolveVerticalSockets,
  isExecPortsEnabled,
  resolveVisibleVerticalSockets,
  isExecHandle,
  validateConnectionWithHandles,
  normalizeDataEdgeHandlesAwayFromExec,
  isStoryboardExecLink,
  isDirector3dDeskLink,
  isStoryboardPreviewHostKind,
  isAssetSheetPictureHostKind,
} from './catalog/socket-registry';
export type { VerticalSocketSpec } from './catalog/socket-registry';

export type { WorkspaceVisibility } from './utils/workspace-utils';
export { isPrivateWorkspace, computeWorkspaceAssetCount } from './utils/workspace-utils';
export type { CharacterProfile, CharacterLibraryPayload, CharacterBible } from './types/character';
export { emptyCharacterLibrary } from './types/character';
export type { SoundAssetProfile, SoundLibraryPayload, SoundAssetKind } from './types/sound-library';
export {
  BUILTIN_PUBLIC_SOUND_ASSETS,
  SOUND_ASSET_KINDS,
  emptySoundLibrary,
  newSoundAsset,
  cloneSoundAsset,
  resolvePublicSounds,
  isBuiltinSoundAsset,
  isSoundFavorite,
  inferSoundAssetKind,
  soundAssetKindLabel,
  SOUND_ASSET_KIND_LABELS,
  resolveCharacterReferenceAudio,
} from './types/sound-library';
export type {
  StylePresetProfile,
  StyleLibraryPayload,
  StyleAestheticFamily,
} from './types/style-library';
export {
  BUILTIN_STYLE_PRESETS,
  STYLE_AESTHETIC_FAMILIES,
  emptyStyleLibrary,
  newStylePreset,
  cloneStylePreset,
  resolveStylePresets,
  findStylePresetByName,
  styleAestheticFamilyLabel,
  isBuiltinStylePreset,
} from './types/style-library';
export {
  BUILTIN_EMOTION_PRESETS,
  type EmotionPreset,
} from './data/emotion-presets';
export type {
  StructuredPrompt,
  CreativeVariantEntry,
  CharacterFaceRig,
  FaceRigGroupId,
  CharacterCreativeExtension,
  SceneCreativeExtension,
  CostumeCreativeExtension,
  PropCreativeExtension,
  ShotCreativeExtension,
  ShotMoveFamily,
  EmotionCreativeExtension,
  HookCreativeExtension,
  VoiceCreativeExtension,
} from './types/creative-asset-center';
export {
  emptyStructuredPrompt,
  touchStructuredPrompt,
  DEFAULT_SCENE_VARIANTS,
  DEFAULT_PROP_VARIANTS,
} from './types/creative-asset-center';
export {
  COMMON_PROP_KEYWORDS,
  extractCostumeEntityNames,
  extractPropEntityNames,
  type CostumeExtractCharacter,
  type PropExtractScene,
  type PropExtractCharacter,
} from './utils/wardrobe-entity-extract';
export {
  SHOT_MOVE_FAMILIES,
  shotMoveFamilyLabel,
  inferShotMoveFamilyFromGroup,
} from './data/shot-move-families';
export {
  CAC_EXPRESSION_PRESETS,
  CAC_POSE_PRESETS,
  CAC_ANGLE_PRESETS,
  CAC_HOOK_TYPES,
  CAC_SHOT_SIZES,
  CAC_VOICE_GENDERS,
  CAC_VOICE_EMOTIONS,
  defaultCharacterVariants,
  mergeVariantSlots,
  CAC_SHEET_EXPRESSION_PRESETS,
  CAC_MICRO_EXPRESSION_PRESETS,
  CAC_SHEET_POSE_PRESETS,
  CAC_SHEET_HEAD_ANGLE_PRESETS,
  CAC_COSTUME_DETAIL_PRESETS,
  CAC_HAND_REF_PRESETS,
  CAC_COSTUME_VARIANT_PRESETS,
} from './data/creative-asset-presets';
export {
  FACE_RIG_DEADZONE,
  FACE_RIG_MIN,
  FACE_RIG_MAX,
  FACE_RIG_GROUPS,
  FACE_RIG_PARAMS,
  FACE_RIG_PARAMS_BY_ID,
  CHARACTER_FACE_RIG_PRESETS,
  FACE_RIG_PRESETS_BY_ID,
  faceRigParamsOfGroup,
  type FaceRigGroupDef,
  type FaceRigDriver,
  type FaceRigParamDef,
  type FaceRigPreset,
} from './data/character-face-rig-presets';
export {
  FACE_RIG_FACE_GROUPS,
  emptyFaceRig,
  getFaceRig,
  faceRigValue,
  setFaceRigValue,
  resetFaceRigGroup,
  applyFaceRigPreset,
  listFaceRigDeviations,
  countFaceRigDeviations,
  isFaceRigNeutral,
  faceRigSkipBodyIds,
  buildFaceRigPrompt,
  describeFaceRig,
  faceRigHash,
  type FaceRigDeviation,
  type BuildFaceRigPromptOptions,
} from './utils/character-face-rig';
export {
  CHARACTER_SHEET_PROMPT_TEMPLATE,
  SCENE_SHEET_PROMPT_TEMPLATE,
  buildCharacterBiblePrompt,
  buildCharacterFaceRigPrompt,
  buildCharacterImagePrompt,
  buildCharacterVideoPrompt,
  buildCharacterSheetGenerationPrompt,
  buildCharacterNegativePrompt,
  buildSceneBiblePrompt,
  buildCostumeBiblePrompt,
  buildCostumeImagePrompt,
  buildCostumeNegativePrompt,
  buildCostumeSheetGenerationPrompt,
  COSTUME_SHEET_PROMPT_TEMPLATE,
  getCostumeCreative,
  regenerateCostumePrompts,
  buildPropBiblePrompt,
  buildPropImagePrompt,
  buildPropNegativePrompt,
  buildPropSheetGenerationPrompt,
  PROP_SHEET_PROMPT_TEMPLATE,
  getPropCreative,
  regeneratePropPrompts,
  buildSceneSheetGenerationPrompt,
  buildShotPrompt,
  buildEmotionPrompt,
  buildHookPrompt,
  buildVoicePrompt,
  getCharacterCreative,
  getSceneCreative,
  getShotCreative,
  getEmotionCreative,
  getHookCreative,
  getVoiceCreative,
  resolveAssetPromptText,
} from './utils/creative-asset-prompts';

export {
  CHARACTER_SHEET_MASTER_PROMPT_TEMPLATE,
  CHARACTER_SHEET_PANEL_LAYOUT,
  CHARACTER_SHEET_PANEL_DEFS,
  CHARACTER_SHEET_STYLE_LABELS,
  CHARACTER_SHEET_GRID_COLS,
  CHARACTER_SHEET_GRID_ROWS,
  CHARACTER_SHEET_CANVAS_WIDTH,
  CHARACTER_SHEET_CANVAS_HEIGHT,
  CHARACTER_SHEET_CATEGORY_HEADER_RATIO,
  CHARACTER_SHEET_CATEGORY_LAYOUTS,
  CHARACTER_SHEET_PANEL_CONTENT,
  buildCharacterMasterSheetPrompt,
  buildCharacterSheetCategoryPrompt,
  getCharacterSheetCategoryLayout,
  buildCharacterSheetLockedLayoutPrompt,
  formatPanelGridSpec,
  panelRectToPixels,
  groupCharacterSheetPanels,
  describeCharacterSheetGrid,
  type CharacterSheetStyleMode,
  type CharacterSheetPanelId,
  type CharacterSheetPanelLayout,
  type CharacterSheetCategoryId,
  type CharacterSheetCategoryLayout,
  type CharacterSheetPromptInput,
} from './utils/character-sheet-master';

export {
  entitySheetCropRect,
  COSTUME_SHEET_FRONT_RECT,
  SCENE_SHEET_HERO_RECT,
  PROP_SHEET_FRONT_RECT,
  type EntitySheetCropKind,
} from './utils/entity-sheet-crop';

export {
  applyShotCostumeOverridesToCharacters,
  enrichPromptWithShotAssets,
  costumeSourcesFromWorkspace,
  propSourcesFromWorkspace,
  shotLexiconSourcesFromWorkspace,
  buildShotPropPromptSuffix,
  type ShotCostumeOverrideLike,
  type ShotAssetEnrichInput,
  type CostumePromptSource,
  type PropPromptSource,
  type ShotLexiconPromptSource,
} from './utils/shot-asset-enrich';

export {
  DESK_SHOT_SIZES,
  DESK_CAMERA_MOVES,
  mapShotSizeToDeskEnum,
  mapCameraMoveToDeskEnum,
  mapShotLexiconToDeskEnums,
  type DeskShotSize,
  type DeskCameraMove,
} from './utils/shot-lexicon-desk-map';

export {
  collectUsedAssetIds,
  formatAssetPin,
  parseAssetPin,
  stripAssetPinRevision,
  expandUsedAssetIdSet,
  characterRevisionPinsFromUsed,
} from './utils/collect-used-assets';

export {
  applyCroppedPanelsToCharacter,
  listCharacterSheetPanels,
} from './utils/character-sheet-crop-fill';
export {
  newCharacterProfile,
  normalizeCharacterProfile,
  patchCharacterCreative,
  patchWorkspaceCreative,
  patchVoiceCreative,
  refreshCharacterPrompts,
  refreshWorkspacePrompts,
  refreshVoicePrompts,
} from './utils/creative-asset-factory';
export type { PublicLibraryPayload } from './types/public-library';
export { emptyPublicLibrary } from './types/public-library';
export {
  ASSET_LIBRARY_TABS,
  ASSET_LIBRARY_TAB_GROUPS,
  ASSET_LIBRARY_PUBLIC_ONLY_KINDS,
  isAssetLibraryNavKind,
  isAssetLibraryPublicOnlyKind,
  assetLibraryTabGroupsForScope,
  isAssetLibraryNavKindForScope,
  ASSET_KIND_MENTION_PREFIX,
  formatAssetMention,
  parseAssetMentions,
  findLegacyBareMentions,
  characterToItem,
  workspaceItemToAsset,
  templateToAsset,
  soundToItem,
  styleToItem,
  resolveAssetRef,
  preferPrivateAssetByLabel,
  enrichPromptWithAssets,
  enrichPromptWithAssetMentions,
  type AssetLibraryKind,
  type AssetScope,
  type AssetRef,
  type AssetLibraryItem,
} from './utils/asset-library';
export {
  ASSET_TRASH_RETENTION_MS,
  isAssetTrashed,
  isAssetActive,
  softDeleteAsset,
  restoreAsset,
  filterActiveAssets,
  filterTrashedAssets,
  purgeExpiredAssets,
  purgeAssetById,
  softDeleteAssetById,
  restoreAssetById,
  daysRemainingInTrash,
  createMediaTrashItem,
  type SoftDeletable,
  type AssetTrashKind,
  type AssetTrashEntry,
  type MediaTrashKind,
  type MediaTrashItem,
} from './utils/asset-trash';
export {
  createScriptDeskFolderSnapshot,
  scriptDeskFolderTitle,
  isScriptDeskFolderEmpty,
  trashScriptDeskFolder,
  restoreScriptDeskFolderFromTrash,
  findMatchingWorkingDraft,
  upsertScriptDeskWorkingDraft,
  renameScriptDeskDraft,
  type ScriptDeskFolderSnapshot,
} from './utils/script-desk-archives';
export {
  resolveBlockCharacters,
  enrichPromptWithCharacters,
  characterPromptSuffix,
  pickReferenceImage,
  buildCharacterContext,
  parseMentionsFromPrompt,
  type CharacterPromptContext,
} from './utils/character-prompt';
export {
  buildStudioImagePrompt,
  buildStudioVideoPrompt,
  buildStudioLineArtPrompt,
  applyStudioPromptsToShot,
  type StudioPromptContext,
  type StudioPromptPackOverrides,
} from './utils/studio-prompt-builder';
export { parseChineseScript, scenesToStoryboardShots } from './utils/script-import';
export type { ParsedScriptBackground, ParsedScriptScene } from './utils/script-import';
export { parseFountain, parseFinalDraft } from './utils/fountain-import';
export { exportPlaybookSessionJson } from './utils/playbook-export';
export {
  PLAYBOOK_DEFINITIONS,
  type PlaybookId,
  type PlaybookStepAction,
  type PlaybookStepDef,
  type PlaybookDefinition,
} from './data/playbook-definitions';

export {
  evaluateStepVisualState,
  evaluateAllStepVisualStates,
  type StepVisualState,
} from './utils/playbook-step-visual';
export { MAX_ENV_REFERENCE_IMAGES } from './types/environment';

export type {
  ChainStoryboardPayload,
} from './utils/chain-storyboard';
export {
  readChainStoryboard,
  buildChainStoryboardPayload,
  buildLineArtShotPatch,
  CHAIN_STORYBOARD_HANDOFF_HASH_SCHEMA_VERSION,
  chainStoryboardHash,
  lineArtVersionHash,
  mergeStoryboardShotFromBreakdown,
  migrateLegacyLineArtShot,
  migrateChainStoryboardMediaRoles,
  quarantineDirector3dDataUrls,
  hygieneChainStoryboard,
  isDataMediaUrl,
  isPersistentMediaUrl,
  hasDirector3dGuide,
  patchChainShot,
  nextSourceRevision,
  upstreamShotContentChanged,
  activeChainEpisodeShots,
  chainHasShots,
  migrateGlobalToChainStoryboard,
} from './utils/chain-storyboard';
export {
  resolveUpstreamShotsFromGraph,
  type UpstreamShotNode,
  type UpstreamShotEdge,
  type ResolveUpstreamShotsResult,
} from './utils/resolve-upstream-shots';
export {
  extractReferenceConstraints,
  constraintsToPromptSuffix,
  resolveCompositionTemplate,
  buildConstrainedPrompt,
  type ReferenceConstraint,
  type CompositionTemplate,
  BUILTIN_COMPOSITION_TEMPLATES,
} from './utils/constraint-assembler';
export {
  BUILTIN_REFERENCE_PLAYBOOKS,
  lookupReferencePlaybook,
  createSlotsFromPlaybook,
  migrateLegacyBoardData,
  switchPlaybook,
  validateReferenceSlots,
  assembleReferencePrompt,
  buildReferencePack,
  extractReferencePack,
  syncReferenceBoardEmitFields,
  readClipGenPlaybook,
  buildClipGenPlaybookPatch,
  clearClipGenPlaybookPatch,
  clipGenPlaybookToBoard,
  buildClipGenPlaybookPack,
  type ReferenceSlotRole,
  type ReferenceSlotMediaType,
  type DepthConvertStatus,
  type ReferenceSlot,
  type ReferenceSlotTemplate,
  type ReferencePlaybookDef,
  type ReferenceBoardData,
  type ReferencePack,
  type ClipGenPlaybookState,
} from './utils/reference-playbook';
export {
  runConsistencyChecks,
  type ConsistencyCheckItem,
} from './utils/script-consistency';
export {
  resolveRunLabel,
  type RunLabelDict,
} from './utils/run-labels';
export {
  UTILITY_BLOCKS,
  applyShotReviewFromReport,
  type UtilityBlockDef,
} from './utils/block-utility-link';
export {
  ECOM_IMAGE_SPECS,
  ECOM_VIDEO_SPECS,
  ECOM_ALL_SPECS,
  lookupEcomSpec,
  buildEcomPackDescription,
  planEcomPackFiles,
  type EcomSpec,
  type EcomPackFilePlan,
  type EcomPackPlanResult,
} from './utils/ecom-specs';
export {
  validatePoseCommand,
  poseCommandSummary,
  type Director3dPoseCommand,
  type Director3dCharacterPose,
  type Director3dCameraPose,
} from './utils/director3d-pose-schema';
export {
  resolveUpstreamSources,
  mergeUpstreamData,
  type UpstreamPolicy,
  type UpstreamSource,
} from './utils/upstream-policy';
export {
  canModifyLibraryItem,
  canCopyFromPublic,
  checkLibraryAccess,
  setLibraryAclConfig,
  getLibraryAclConfig,
  type LibraryScope,
} from './utils/library-acl';
export {
  CLIP_GEN_MODE_CONFIGS,
  lookupClipGenMode,
  isClipGenModeAvailable,
  type ClipGenMode,
  type ClipGenModeConfig,
} from './utils/seedance-bridge';
export {
  CAMERA_PRESETS,
  lookupCameraPreset,
  type CameraPreset,
} from './data/camera-presets';
export {
  createHyperframesJobState,
  submitHyperframesJob,
  startPollingHyperframes,
  updateHyperframesProgress,
  completeHyperframesJob,
  failHyperframesJob,
  cancelHyperframesJob,
  canRetryHyperframes,
  hyperframesJobSummary,
  type HyperframesJobState,
  type HyperframesJobStatus,
} from './utils/hyperframes-job-state';
export {
  createEpisodeQueue,
  queueNextEpisode,
  queueMarkSuccess,
  queueMarkError,
  queueSkipEpisode,
  queueAdvance,
  queuePause,
  queueResume,
  queueCancel,
  queueSummary,
  type EpisodeQueueState,
  type QueueProgress,
} from './utils/episode-breakdown-queue';
export {
  resolveMentionsForPrompt,
  buildPromptWithReferences,
  type MentionRef,
} from './utils/mention-resolver';

export {
  evaluatePlaybookStep,
  resolveNextStep,
  readinessRegistry,
  type PlaybookReadinessContext,
  has_source_text,
  has_product_media,
  has_storyboard_shots,
  story_grid_confirmed,
  has_line_art_thumbnails,
  all_shots_approved,
  all_keyframes_approved,
  all_videos_approved,
  has_video_takes,
  has_video_assets,
  canvas_node_done,
  review_gate_passed,
  has_character_refs,
  has_voice_lines,
  has_generate_assets,
  has_scene_split,
  has_environment_bibles,
  has_character_bibles,
  has_camera_blocks,
  has_keyframes,
  has_reference_board,
  has_viral_output,
  has_timeline_draft,
  consistency_resolved,
  export_ready,
} from './utils/playbook-readiness';
export { WORKFLOW_TEMPLATES, type WorkflowTemplate } from './data/workflow-templates';
export {
  PROMPT_TEMPLATES,
  PROMPT_TEMPLATE_CATEGORIES,
  lookupPromptTemplate,
  type PromptTemplate,
  type PromptTemplateCategory,
} from './data/prompt-templates';
export {
  BACKLOT_TEMPLATE_TABS,
  BUILTIN_BACKLOT_TEMPLATES,
  emptyBacklotCustom,
  emptyBacklotWorkspace,
  newBacklotWorkspaceItem,
  listBacklotTemplates,
  listBacklotGroupOptions,
  DEFAULT_BACKLOT_GROUPS,
  archetypeToCharacter,
  backlotTemplatePrompt,
  customFromBuiltin,
  characterToCustomTemplate,
  workspaceItemToCustomTemplate,
  templateToWorkspaceItem,
  type BacklotTemplateKind,
  type BacklotTemplate,
  type BacklotCustomTemplate,
  type BacklotCustomPayload,
  type BacklotWorkspaceKind,
  type BacklotWorkspaceItem,
  type BacklotWorkspacePayload,
  type BacklotHookPhase,
  type BacklotApplyTarget,
  type BacklotCharacterArchetype,
} from './data/backlot-templates';
export {
  SHOT_LIBRARY_SEEDS,
  SHOT_LIBRARY_SEED_COUNT,
  type ShotLibrarySeed,
} from './data/shot-library-seeds';
export {
  SHOT_LEXICON_SYSTEMS,
  shotLexiconSystemLabel,
  listShotLexiconCategories,
  shortenShotLexiconCategory,
  type ShotLexiconSystem,
} from './data/shot-lexicon-taxonomy';
export type { GridCellPrompt, GridReversePromptsResult } from './types/grid-prompts';
export { gridCellsToStoryboardShots } from './utils/grid-prompt-export';
export { ANIME_TAG_PRESETS, ANGLE_PRESETS, type TagPreset } from './data/anime-tag-presets';
export { FAL_MODELS, type FalModelDef } from './data/fal-models';
export { COMFY_PRESETS, type ComfyPreset } from './data/comfy-presets';
export { CINEMA_PROMPT_PRESETS, CAMERA_PROMPT_PRESETS, type PromptPreset } from './data/prompt-presets';
export { PORTRAIT_PRESETS, buildPortraitPrompt, type PortraitPreset } from './data/portrait-presets';
export { POSE_PRESETS, buildPosePrompt, type PosePreset } from './data/pose-presets';
export {
  LIGHT_RIG_PRESETS,
  buildLightRigPrompt,
  type LightRigPreset,
} from './data/light-rig-presets';
export {
  BLOCKING_CAMERA_PRESETS,
  BLOCKING_LAYOUTS,
  type BlockingCameraPreset,
  type BlockingLayout,
} from './data/blocking-presets';
export {
  CHARACTER_EXPRESSION_PRESETS,
  CHARACTER_SHEET_POSE_PRESETS,
  type CharacterExpressionPreset,
  type CharacterSheetPosePreset,
} from './data/character-sheet-presets';
export {
  buildCharacterSheetPrompt,
  buildCharacterConsistencyPrompt,
  buildCharacterSheetMeta,
  characterSheetFromNodeData,
  syncCharacterSheetNodeOutput,
  applyCharacterSheetPatch,
  pickCharacterSheetReference,
  CHARACTER_BIBLE_LAYERS,
  type CharacterSheetInput,
  type CharacterSheetProfile,
  type CharacterSheetVariant,
  type CharacterBibleLayer,
} from './utils/character-sheet-prompt';
export {
  PICTURE_GEN_MODELS,
  DEFAULT_PICTURE_GEN_MODEL_ID,
  PICTURE_GEN_SIZES,
  CLIP_GEN_MODELS,
  CLIP_GEN_ASPECTS,
  lookupPictureModel,
  matchPictureModel,
  resolvePictureModelForRequest,
  listConnectedPictureModels,
  listConnectedLlmModels,
  type PictureGenModelDef,
  type ConnectedPictureModelOption,
  type ConnectedLlmModelOption,
} from './data/gen-models';
export {
  PERF,
  resolvePerfTier,
  resolvePerfToast,
  perfTierLabel,
} from './constants/perf-thresholds';
export type {
  PerfTier,
  PerfToastReason,
  PerfToastDecision,
} from './constants/perf-thresholds';
export {
  LINE_ART_SUFFIX,
  LINE_ART_GRID_ROWS,
  LINE_ART_GRID_COLS,
  LINE_ART_GRID_PAGE_SIZE,
  buildLineArtGridPrompt,
  buildLineArtPanelGridPrompt,
  buildLineArtShotPrompt,
  pickLineArtGridLayout,
} from './utils/line-art-prompt';
export type { LineArtGridPanel } from './utils/line-art-prompt';
export {
  assessKeyframeColorFromRgb,
  describeKeyframeColorCheck,
  emptyKeyframeColorCheck,
  normalizeKeyframeColorCheck,
  type KeyframeColorCheck,
  type KeyframeColorVerdict,
} from './utils/keyframe-color-check';
export {
  IMAGE_QUALITY_OPTIONS,
  IMAGE_ASPECT_OPTIONS,
  resolveImageRequestSize,
} from './utils/image-gen-params';
export {
  VIDEO_DURATION_OPTIONS,
  VIDEO_RESOLUTION_OPTIONS,
  VIDEO_ORIENTATION_OPTIONS,
  VIDEO_SIZE_PRESETS,
  orientationFromAspect,
  resolveVideoGenParams,
} from './utils/video-gen-params';
export {
  AUDIO_FORMAT_OPTIONS,
  SPEECH_RATE_OPTIONS,
  SPEECH_RATE_MIN,
  SPEECH_RATE_MAX,
} from './utils/audio-gen-params';
export {
  DEFAULT_CANVAS_APPEARANCE,
  CANVAS_THEMES,
  type CanvasThemeMode,
  type CanvasGridStyle,
  type CanvasSocketStyle,
  type CanvasEdgePathType,
  type CanvasAppearance,
} from './utils/canvas-theme';
export type {
  StorySkeleton,
  AdaptationStrategy,
  StoryboardTableRow,
  ScriptPlanPayload,
} from './types/script-plan';

export type {
  AssetRecord,
  AssetKind,
  AssetLibraryPayload,
  MediaBlob,
  GeneratedMedia,
} from './types/asset';
export type { ProjectStatus, ProjectMeta } from './types/project';
export type { WorkflowSchemaV1 } from './schema/workflow-schema';
export { playbookDefToSchema, schemaToJson, jsonToSchema } from './schema/convert-def-to-schema';
export {
  PROVIDER_REGISTRY,
  resolveDefaultModel,
  DEFAULT_PICTURE_MODEL,
  DEFAULT_VIDEO_MODEL,
  DEFAULT_TTS_MODEL,
  type ProviderDef,
  VIDEO_EDIT_PROVIDERS,
  DEFAULT_VIDEO_EDIT_PROVIDER,
  resolveVideoEditProvider,
  type VideoEditProviderDef,
} from './data/provider-registry';

export {
  canExecuteNode,
  NODE_CONTRACTS,
  type NodeContract,
  type CanExecuteResult,
} from './engine/node-dependency';

export {
  layoutPipeline,
  autoFitBounds,
} from './engine/layout-pipeline';

export {
  translate,
  LEXICON,
  BANNED_TERMS,
} from './i18n/user-lexicon';

// F-015: 导出清单
export {
  shotsToManifestRows,
  manifestToCsv,
  manifestToHtml,
  manifestToPdf,
  recoverExportFromHistory,
  type ManifestRow,
} from './utils/export-manifest';

// F-034: 声音剧编排
export {
  mapVoiceLinesToShots,
  buildVoiceDramaTimeline,
} from './utils/voice-drama-orchestrator';

// F-037: 资产库 Bible→定妆/场景图
export {
  buildBibleImagePrompt,
  buildBibleImagePatch,
  type AssetBibleImageRequest,
  type AssetBibleImageResult,
} from './utils/asset-bible-image';
