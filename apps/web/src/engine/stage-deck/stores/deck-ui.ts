import { create } from 'zustand';
import {
  resolveNodeInteraction,
  type NodeInteractionClass,
  type NodeInteractionProfile,
} from '@nx9/shared';

interface DeckUiState {
  selectedBlockId: string | null;
  selectedBlockKind: string | null;
  interaction: NodeInteractionProfile | null;
  /** Prompt Bar visible (input + ai nodes) */
  promptBarVisible: boolean;
  /** Keep bar mounted while switching between prompt-bar nodes */
  promptBarPinned: boolean;
  promptFocusNonce: number;
  /** Per-node drag offset for attached prompt bar (world px) */
  promptBarOffsets: Record<string, { x: number; y: number }>;

  setSelection: (blockId: string | null, blockKind: string | null) => void;
  focusPromptBar: () => void;
  collapsePromptBar: () => void;
  setPromptBarOffset: (blockId: string, offset: { x: number; y: number }) => void;
  clear: () => void;
}

export const useDeckUi = create<DeckUiState>((set, get) => ({
  selectedBlockId: null,
  selectedBlockKind: null,
  interaction: null,
  promptBarVisible: false,
  promptBarPinned: false,
  promptFocusNonce: 0,
  promptBarOffsets: {},

  setSelection: (selectedBlockId, selectedBlockKind) => {
    if (!selectedBlockId || !selectedBlockKind) {
      set({
        selectedBlockId: null,
        selectedBlockKind: null,
        interaction: null,
        promptBarVisible: false,
        promptBarPinned: false,
      });
      return;
    }

    const interaction = resolveNodeInteraction(selectedBlockKind);
    const prev = get();
    const switchingPromptNode =
      prev.promptBarPinned &&
      prev.promptBarVisible &&
      interaction.opensPromptBar;

    set({
      selectedBlockId,
      selectedBlockKind,
      interaction,
      promptBarVisible: interaction.opensPromptBar,
      promptBarPinned: interaction.opensPromptBar ? true : false,
      promptFocusNonce: switchingPromptNode ? prev.promptFocusNonce : prev.promptFocusNonce + 1,
    });
  },

  focusPromptBar: () => {
    const { selectedBlockId, interaction } = get();
    if (!selectedBlockId || !interaction?.opensPromptBar) return;
    set((s) => ({
      promptBarVisible: true,
      promptBarPinned: true,
      promptFocusNonce: s.promptFocusNonce + 1,
    }));
  },

  collapsePromptBar: () =>
    set({ promptBarVisible: false, promptBarPinned: false }),

  setPromptBarOffset: (blockId, offset) =>
    set((s) => ({
      promptBarOffsets: { ...s.promptBarOffsets, [blockId]: offset },
    })),

  clear: () =>
    set({
      selectedBlockId: null,
      selectedBlockKind: null,
      interaction: null,
      promptBarVisible: false,
      promptBarPinned: false,
    }),
}));

export function interactionClassOf(kind: string | null): NodeInteractionClass | null {
  if (!kind) return null;
  return resolveNodeInteraction(kind).class;
}
