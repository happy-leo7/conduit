import { createMockTransport, type AgentUIConfig, type SessionStore } from '@conduit/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AgentSessionProvider, useSessionStore } from './context/AgentSessionProvider';
import { Composer } from './components/Composer';
import { MessageItem, MessageList } from './components/MessageList';
import { PartRenderer, type PartComponents } from './components/PartRenderer';
import { PermissionPrompt } from './components/PermissionPrompt';
import {
  CheckpointControls,
  FastModeToggle,
  ModeToggle,
  ModelSelector,
  ReasoningEffortControl,
  UsageBadge,
} from './components/controls';
import { usePermissionQueue } from './hooks/usePermissionQueue';

const PART_COMPONENTS: PartComponents = {
  text: ({ part }) => <p data-testid="text">{part.text}</p>,
  reasoning: ({ part }) => <p data-testid="reasoning">{part.text}</p>,
  tool_call: ({ part }) => (
    <div data-testid="tool-call" data-state={part.state}>
      {part.name}
      <code>{part.inputTextDelta ?? ''}</code>
    </div>
  ),
  tool_result: ({ part }) => <div data-testid="tool-result" data-status={part.status} />,
  diff: ({ part }) => <pre data-testid="diff">{part.patch}</pre>,
  plan: ({ part }) => <pre data-testid="plan">{part.markdown}</pre>,
  todo: ({ part }) => <ul data-testid="todo">{part.items.map((i) => <li key={i.id}>{i.text}</li>)}</ul>,
  error: ({ part }) => <p data-testid="error">{part.message}</p>,
};

function PermissionArea(): ReactNode {
  const { requests } = usePermissionQueue();
  return (
    <>
      {requests.map((request) => (
        <PermissionPrompt key={request.id} request={request} data-testid="permission" />
      ))}
    </>
  );
}

function ChatFixture({ onConfirmRevert }: { onConfirmRevert?: () => boolean }): ReactNode {
  return (
    <>
      <MessageList>
        {(message) => (
          <MessageItem message={message} data-testid={`message-${message.role}`}>
            {message.parts.map((part) => (
              <PartRenderer key={part.id} part={part} parts={PART_COMPONENTS} />
            ))}
            {message.role === 'user' && onConfirmRevert ? (
              <CheckpointControls
                message={message}
                onConfirmRevert={onConfirmRevert}
                data-testid="revert"
              />
            ) : null}
          </MessageItem>
        )}
      </MessageList>
      <PermissionArea />
      <Composer aria-label="composer">
        <Composer.Input data-testid="input" />
        <Composer.Submit data-testid="submit" />
        <Composer.Stop data-testid="stop" />
      </Composer>
    </>
  );
}

interface SetupResult {
  store: SessionStore;
}

function setup(
  ui: ReactNode,
  options: { profile?: 'full' | 'basic'; config?: AgentUIConfig } = {},
): SetupResult {
  const captured: { store?: SessionStore } = {};
  function Capture(): null {
    captured.store = useSessionStore();
    return null;
  }
  const transport = createMockTransport({ profile: options.profile ?? 'full', delayMs: 0 });
  render(
    <AgentSessionProvider transport={transport} config={options.config}>
      <Capture />
      {ui}
    </AgentSessionProvider>,
  );
  return { store: captured.store! };
}

function type(text: string): void {
  fireEvent.change(screen.getByTestId('input'), { target: { value: text } });
}

describe('전송 → 스트리밍 렌더', () => {
  it('Enter로 전송하면 user/assistant 메시지가 스트리밍으로 렌더된다', async () => {
    setup(<ChatFixture />);
    type('안녕하세요');
    fireEvent.keyDown(screen.getByTestId('input'), { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByTestId('message-user')).toBeTruthy();
    });
    await waitFor(
      () => {
        expect(screen.getByTestId('message-assistant').getAttribute('data-status')).toBe(
          'complete',
        );
      },
      { timeout: 3000 },
    );
    expect(screen.getByTestId('reasoning').textContent).toContain('요청을 이해했다');
    expect(screen.getAllByTestId('text').some((el) => el.textContent?.includes('mock 어댑터'))).toBe(
      true,
    );
    // 입력창은 전송 직후 비워진다
    expect((screen.getByTestId('input') as HTMLTextAreaElement).value).toBe('');
  });

  it('Shift+Enter는 전송하지 않는다', () => {
    const { store } = setup(<ChatFixture />);
    type('줄바꿈');
    fireEvent.keyDown(screen.getByTestId('input'), { key: 'Enter', shiftKey: true });
    expect(store.getState().messages).toHaveLength(0);
  });

  it('빈 입력이면 Submit 버튼이 비활성화된다', () => {
    setup(<ChatFixture />);
    expect((screen.getByTestId('submit') as HTMLButtonElement).disabled).toBe(true);
    type('내용');
    expect((screen.getByTestId('submit') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('tool 스트리밍 입력 + permission 응답', () => {
  it('승인 요청 → 허용 → tool 실행/diff 렌더까지 완주한다', async () => {
    setup(<ChatFixture />);
    type('버그를 수정해줘 fix');
    fireEvent.keyDown(screen.getByTestId('input'), { key: 'Enter' });

    // 스트리밍된 부분 JSON 입력이 렌더된다
    await waitFor(() => {
      expect(screen.getByTestId('tool-call').querySelector('code')?.textContent).toContain(
        '"path"',
      );
    });
    // 승인 프롬프트 노출
    const permission = await screen.findByTestId('permission');
    expect(permission.getAttribute('role')).toBe('alertdialog');

    fireEvent.click(screen.getByText('허용'));
    await waitFor(() => {
      expect(screen.getByTestId('tool-call').getAttribute('data-state')).toBe('complete');
      expect(screen.getByTestId('diff')).toBeTruthy();
    });
    // 응답 후 프롬프트는 대기열에서 사라진다
    expect(screen.queryByTestId('permission')).toBeNull();
  });

  it('거부하면 tool은 에러로 끝나고 diff는 없다', async () => {
    setup(<ChatFixture />);
    type('코드 수정');
    fireEvent.keyDown(screen.getByTestId('input'), { key: 'Enter' });

    await screen.findByTestId('permission');
    fireEvent.click(screen.getByText('거부'));
    await waitFor(() => {
      expect(screen.getByTestId('tool-call').getAttribute('data-state')).toBe('error');
    });
    expect(screen.queryByTestId('diff')).toBeNull();
  });
});

describe('checkpoint revert 확인 플로우', () => {
  it('onConfirmRevert가 false면 되돌리지 않고, true면 히스토리를 삭제한다', async () => {
    const confirm = vi.fn(() => false);
    const { store } = setup(<ChatFixture onConfirmRevert={() => confirm()} />);
    type('안녕');
    fireEvent.keyDown(screen.getByTestId('input'), { key: 'Enter' });
    await waitFor(() => {
      expect(store.getState().status).toBe('idle');
      expect(store.getState().messages).toHaveLength(2);
    });

    fireEvent.click(screen.getByTestId('revert'));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(store.getState().messages).toHaveLength(2); // 취소됨

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByTestId('revert'));
    await waitFor(() => expect(store.getState().messages).toHaveLength(0));
  });
});

describe('capabilities × config 게이팅', () => {
  it('basic 프로필에서는 plan/fast/effort 컨트롤이 렌더되지 않는다', () => {
    setup(
      <>
        <ModeToggle data-testid="mode" />
        <FastModeToggle data-testid="fast" />
        <ReasoningEffortControl data-testid="effort" />
        <UsageBadge data-testid="usage" />
      </>,
      { profile: 'basic' },
    );
    expect(screen.queryByTestId('mode')).toBeNull();
    expect(screen.queryByTestId('fast')).toBeNull();
    expect(screen.queryByTestId('effort')).toBeNull();
    expect(screen.queryByTestId('usage')).toBeTruthy(); // usage는 basic도 지원
  });

  it("config로 끄면(full 프로필이어도) 숨겨지고, 강제 on이면 비활성으로 노출된다", () => {
    setup(
      <>
        <ModelSelector data-testid="model" />
        <ModeToggle data-testid="mode" />
      </>,
      { config: { features: { modelSelector: false } } },
    );
    expect(screen.queryByTestId('model')).toBeNull();
    expect(screen.queryByTestId('mode')).toBeTruthy();

    // 미지원 프로바이더에서 강제 on → 비활성 노출
    setup(<ModeToggle data-testid="mode-basic" />, {
      profile: 'basic',
      config: { features: { planMode: true } },
    });
    const forced = screen.getByTestId('mode-basic') as HTMLButtonElement;
    expect(forced.disabled).toBe(true);
  });
});

describe('asChild (Slot 병합)', () => {
  it('Composer.Submit asChild는 소비자 마크업에 props를 병합한다', async () => {
    const { store } = setup(
      <Composer>
        <Composer.Input data-testid="input" />
        <Composer.Submit asChild>
          <button className="my-btn" data-testid="custom-submit">
            보내기
          </button>
        </Composer.Submit>
      </Composer>,
    );
    const button = screen.getByTestId('custom-submit') as HTMLButtonElement;
    expect(button.className).toBe('my-btn');
    expect(button.type).toBe('submit');
    expect(button.disabled).toBe(true);

    type('전송 테스트');
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(store.getState().messages.length).toBeGreaterThan(0));
  });
});

describe('세션 상태 배지', () => {
  it('스트리밍 중 Stop 버튼이 활성화되고 중단하면 aborted로 남는다', async () => {
    // 지연이 있는 transport로 스트리밍 중간을 잡는다
    const transport = createMockTransport({ profile: 'full', delayMs: 10 });
    const captured: { store?: SessionStore } = {};
    function Capture(): null {
      captured.store = useSessionStore();
      return null;
    }
    render(
      <AgentSessionProvider transport={transport}>
        <Capture />
        <ChatFixture />
      </AgentSessionProvider>,
    );
    type('긴 이야기 해줘');
    fireEvent.keyDown(screen.getByTestId('input'), { key: 'Enter' });

    const stop = screen.getByTestId('stop') as HTMLButtonElement;
    await waitFor(() => expect(stop.disabled).toBe(false));
    fireEvent.click(stop);
    await waitFor(() => {
      const last = captured.store!.getState().messages.at(-1);
      expect(last?.status).toBe('aborted');
      expect(captured.store!.getState().status).toBe('idle');
    });
  });
});
