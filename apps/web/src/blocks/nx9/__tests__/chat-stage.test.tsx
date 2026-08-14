/**
 * Q-02/A12：编剧台对话区交互测试（搜索 / 折叠 / 定位待应用 / 错误提示）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { emptyScreenplayPackage, type ScriptDeskAgentMessage, type ScriptDeskAgentSession } from '@nx9/shared';
import { ChatStage, type ChatStageProps } from '../script-desk/ChatStage';

function baseMessage(
  id: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  extra: Partial<ScriptDeskAgentMessage> = {},
): ScriptDeskAgentMessage {
  return { id, role, content, createdAt: '2026-08-13T00:00:00.000Z', ...extra };
}

function chatProps(overrides: Partial<ChatStageProps> = {}): ChatStageProps {
  const session: ScriptDeskAgentSession = { messages: [], updatedAt: '2026-08-13T00:00:00.000Z' };
  return {
    pkg: emptyScreenplayPackage(),
    session,
    title: '测试剧',
    hasDraftMemory: false,
    skillName: 'generate',
    busy: false,
    llmModelLabel: '',
    llmOptions: [],
    llmOptionId: '',
    onSelectLlmModel: vi.fn(),
    onOpenLlmSettings: vi.fn(),
    chatInput: '',
    setChatInput: vi.fn(),
    atOpen: false,
    setAtOpen: vi.fn(),
    showGenFloat: false,
    genFloatExpanded: false,
    setGenFloatExpanded: vi.fn(),
    genEpisodeCount: 3,
    setGenEpisodeCount: vi.fn(),
    setFirstGenFloatDeferred: vi.fn(),
    setTip: vi.fn(),
    libChars: [],
    libScenes: [],
    hasLibraryItems: false,
    streamPreview: '',
    chatSearch: '',
    setChatSearch: vi.fn(),
    collapsedMsgIds: new Set<string>(),
    onToggleCollapseMessage: vi.fn(),
    onCollapseApplied: vi.fn(),
    onChatContextMenu: vi.fn(),
    onToggleSkill: vi.fn(),
    onSetEntryMode: vi.fn(),
    onOpenDrafts: vi.fn(),
    onApplyMessage: vi.fn(),
    onDiscardMessage: vi.fn(),
    onGenStart: vi.fn(),
    onAbort: vi.fn(),
    onAgentSend: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChatStage 对话区交互', () => {
  it('搜索词过滤消息，只保留命中项', () => {
    const session: ScriptDeskAgentSession = {
      messages: [
        baseMessage('m1', 'user', '关于选题'),
        baseMessage('m2', 'assistant', '关于人物'),
      ],
      updatedAt: '2026-08-13T00:00:00.000Z',
    };
    render(<ChatStage {...chatProps({ session, chatSearch: '人物' })} />);
    expect(screen.getByText('关于人物')).toBeTruthy();
    expect(screen.queryByText('关于选题')).toBeNull();
  });

  it('长消息可折叠并回调消息 id', () => {
    const onToggleCollapseMessage = vi.fn();
    const session: ScriptDeskAgentSession = {
      messages: [baseMessage('m1', 'assistant', '长'.repeat(300), { applied: true })],
      updatedAt: '2026-08-13T00:00:00.000Z',
    };
    render(<ChatStage {...chatProps({ session, onToggleCollapseMessage })} />);
    fireEvent.click(screen.getByRole('button', { name: '折叠' }));
    expect(onToggleCollapseMessage).toHaveBeenCalledWith('m1');
  });

  it('「定位待应用」滚到最新 pending 消息', () => {
    const scrollSpy = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: scrollSpy, configurable: true });
    const session: ScriptDeskAgentSession = {
      messages: [
        baseMessage('m1', 'assistant', '已应用消息', { applied: true }),
        baseMessage('m2', 'assistant', '待应用消息', { pendingPatch: { screenplay: { sourceType: 'pasted' } }, applied: false, discarded: false }),
      ],
      updatedAt: '2026-08-13T00:00:00.000Z',
    };
    render(<ChatStage {...chatProps({ session })} />);
    fireEvent.click(screen.getByRole('button', { name: '定位待应用' }));
    expect(scrollSpy).toHaveBeenCalled();
  });

  it('错误消息按结构化 code 展示动作建议', () => {
    const session: ScriptDeskAgentSession = {
      messages: [baseMessage('m1', 'assistant', '失败：429', { errorCode: 'rate_limit' })],
      updatedAt: '2026-08-13T00:00:00.000Z',
    };
    render(<ChatStage {...chatProps({ session })} />);
    expect(screen.getByText('稍后再试，或到设置换模型/通道')).toBeTruthy();
  });
});
