import {
  CheckpointControls,
  Composer,
  FastModeToggle,
  MessageItem,
  MessageList,
  ModeToggle,
  ModelSelector,
  PartRenderer,
  PermissionPrompt,
  ReasoningEffortControl,
  Thread,
  UsageBadge,
  useAgentSession,
  useFeature,
  usePermissionQueue,
  useTurnUsage,
} from '@conduit/react';
import type { Message } from '@conduit/core';
import type { ReactNode } from 'react';
import { MessageUsage, PART_COMPONENTS } from './PartViews';

const STATUS_LABEL: Record<string, string> = {
  idle: '대기',
  submitting: '전송 중',
  streaming: '응답 중',
  'awaiting-permission': '승인 대기',
  error: '오류',
};

function PermissionArea(): ReactNode {
  const { requests } = usePermissionQueue();
  return (
    <>
      {requests.map((request) => (
        <PermissionPrompt key={request.id} request={request} className="permission-prompt">
          {({ allow, allowAlways, deny }) => (
            <>
              <div className="permission-body">
                <strong>🔐 도구 실행 승인 요청</strong>
                <code>{request.toolName}</code>
                <pre>{JSON.stringify(request.input, null, 2)}</pre>
              </div>
              <div className="permission-actions">
                <button className="btn allow" onClick={() => void allow()}>
                  허용
                </button>
                <button className="btn" onClick={() => void allowAlways()}>
                  항상 허용
                </button>
                <button className="btn deny" onClick={() => void deny()}>
                  거부
                </button>
              </div>
            </>
          )}
        </PermissionPrompt>
      ))}
    </>
  );
}

function AssistantMeta({ message }: { message: Message }): ReactNode {
  const usageFeature = useFeature('usage');
  const turnUsage = useTurnUsage(message.turnId);
  if (!usageFeature.enabled || message.status === 'streaming') return null;
  return <MessageUsage model={message.meta?.model} turnUsage={turnUsage} />;
}

function MessageView({ message }: { message: Message }): ReactNode {
  return (
    <MessageItem message={message} className={`message ${message.role}`}>
      <div className="message-header">
        <span className="role">{message.role === 'user' ? '나' : 'Agent'}</span>
        {message.status === 'aborted' ? <span className="badge aborted">중단됨</span> : null}
        {message.role === 'user' ? (
          <CheckpointControls
            message={message}
            className="revert-btn"
            title="이 턴으로 되돌리기 (이후 히스토리 삭제)"
            onConfirmRevert={({ turnId }) =>
              window.confirm(
                `이 턴(${turnId}) 이후의 모든 메시지와 코드 변경이 영구 삭제됩니다.\n되돌리시겠습니까?`,
              )
            }
          >
            ⏪
          </CheckpointControls>
        ) : null}
      </div>
      {message.parts.map((part) => (
        <PartRenderer key={part.id} part={part} parts={PART_COMPONENTS} />
      ))}
      {message.role === 'assistant' ? <AssistantMeta message={message} /> : null}
    </MessageItem>
  );
}

function ErrorBanner(): ReactNode {
  const { status, lastError, retry } = useAgentSession();
  if (status !== 'error' || !lastError) return null;
  return (
    <div className="error-banner" role="alert">
      ⚠️ {lastError.message}
      {lastError.retryable ? (
        <button className="btn" onClick={() => void retry()}>
          재시도
        </button>
      ) : null}
    </div>
  );
}

export function ChatPane(): ReactNode {
  const { status, regenerate, messages } = useAgentSession();
  const canRegenerate =
    (status === 'idle' || status === 'error') && messages.some((m) => m.role === 'assistant');

  return (
    <section className="chat-pane">
      <header className="chat-header">
        <span className="status" data-status={status}>
          ● {STATUS_LABEL[status] ?? status}
        </span>
        <div className="controls">
          <ModelSelector className="control" />
          <ReasoningEffortControl className="control" />
          <ModeToggle className="control toggle">
            {({ mode }) => <>{mode === 'plan' ? '📋 Plan' : '⚡ Execute'}</>}
          </ModeToggle>
          <FastModeToggle className="control toggle">
            {({ fastMode }) => <>{fastMode ? '🚀 Fast on' : '🐢 Fast off'}</>}
          </FastModeToggle>
        </div>
      </header>

      <Thread className="thread">
        <MessageList>{(message) => <MessageView message={message} />}</MessageList>
        <PermissionArea />
        {messages.length === 0 ? (
          <div className="empty-hint">
            <p>mock 어댑터로 동작하는 conduit 레퍼런스 UI입니다. API 키가 필요 없습니다.</p>
            <ul>
              <li>“<b>버그 수정해줘</b>” → tool 스트리밍 + 승인 + diff + todo</li>
              <li>“<b>출처 알려줘</b>” → citation</li>
              <li>“<b>에러 내줘</b>” → 에러 + 재시도</li>
              <li>Plan 모드 켜고 전송 → plan 파트</li>
            </ul>
          </div>
        ) : null}
      </Thread>

      <ErrorBanner />

      <Composer className="composer">
        <Composer.Input className="composer-input" placeholder="메시지 입력 (Enter 전송 / Shift+Enter 줄바꿈)" rows={3} />
        <div className="composer-actions">
          <button
            className="btn"
            type="button"
            disabled={!canRegenerate}
            onClick={() => void regenerate()}
          >
            ↻ 재생성
          </button>
          <Composer.Stop className="btn stop" />
          <Composer.Submit className="btn primary" />
        </div>
      </Composer>

      <footer className="session-footer">
        <UsageBadge className="session-usage">
          {({ formattedTokens, formattedCost, showCost }) => (
            <>세션 누적: {formattedTokens} tokens{showCost ? ` · ${formattedCost}` : ''}</>
          )}
        </UsageBadge>
      </footer>
    </section>
  );
}
