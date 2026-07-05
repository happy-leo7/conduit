# conduit

LLM 코딩 에이전트(Claude Code, Codex 등)와의 대화 인터페이스를 **headless UI 라이브러리**로 제공합니다.
로직·상태·이벤트 흐름만 제공하고 시각적 스타일과 마크업은 전혀 강제하지 않습니다.
레퍼런스 동작은 [Conductor](https://conductor.build)를 따릅니다.

- **`@conduit/core`** — 프레임워크 비종속 순수 TS: 정규화 도메인 모델, 세션 스토어, transport 인터페이스, 프로바이더 어댑터
- **`@conduit/react`** — React 18+ 바인딩: hooks + Context + headless compound 컴포넌트
- **`examples/playground`** — mock 어댑터로 **API 키 없이 즉시 실행**되는 레퍼런스 UI

핵심 보장: **프로바이더를 바꿔도 UI 코드는 바뀌지 않습니다.** 모든 프로바이더 스트림은 어댑터 계층에서 동일한 정규화 이벤트(`AgentEvent`)로 변환되고, 기능 차이는 `capabilities`로만 드러납니다.

## 설치 & 실행

```bash
pnpm install
pnpm -r build          # ESM + CJS + d.ts
pnpm -r typecheck      # strict
pnpm -r test           # Vitest
pnpm --filter playground dev   # 키 없이 대화·스트리밍·tool·승인·diff·revert 시연
```

## 5분 예제

```tsx
import { createMockTransport } from '@conduit/core';
import {
  AgentSessionProvider, Thread, MessageList, MessageItem,
  PartRenderer, Composer, type PartComponents,
} from '@conduit/react';

const transport = createMockTransport(); // 실제로는 createAnthropicMessagesTransport({ endpoint: '/api/llm' })

const parts: PartComponents = {
  text: ({ part }) => <p>{part.text}</p>,
  reasoning: ({ part }) => <details><summary>생각</summary>{part.text}</details>,
  // 등록하지 않은 파트 type은 조용히 무시됩니다.
};

export function Chat() {
  return (
    <AgentSessionProvider transport={transport} config={{ features: { reasoning: 'auto' } }}>
      <Thread>
        <MessageList>
          {(message) => (
            <MessageItem message={message}>
              {message.parts.map((p) => <PartRenderer key={p.id} part={p} parts={parts} />)}
            </MessageItem>
          )}
        </MessageList>
      </Thread>
      <Composer>
        <Composer.Input />
        <Composer.Submit asChild><button className="my-btn">보내기</button></Composer.Submit>
        <Composer.Stop />
      </Composer>
    </AgentSessionProvider>
  );
}
```

## 아키텍처

```
[프로바이더 SSE/payload] → (어댑터: AgentTransport) → AgentEvent 스트림
    → (세션 스토어: 리듀서) → 정규화 상태(Message/Part)
    → (React 바인딩: useSyncExternalStore 부분 구독) → 소비자 마크업
```

- UI/스토어는 프로바이더 형식을 절대 알지 못합니다. 새 프로바이더 추가 = `AgentTransport` 구현 1개.
- 스트리밍 델타는 **파트 단위로만** 불변 교체되어 리스트 전체 재렌더가 없습니다.
- 기능 활성화 판정은 `resolveFeature(설정값, capability)` **단일 출처**에서만 계산됩니다.

## 훅

| 훅 | 반환 |
| --- | --- |
| `useAgentSession()` | `messages, status, send, stop, regenerate, retry, mode/effort/fastMode/model + setter` |
| `useComposer()` | `value, attachments, canSubmit, submit, getInputProps(), getFormProps()` (Enter=전송/Shift+Enter=줄바꿈) |
| `useMessage(id)` / `useMessagePart(partId)` / `useIsPartStreaming(partId)` | 메시지/파트 단위 부분 구독 |
| `useToolCall(toolCallId)` | `name, input, inputText, state, result, permission, respond(decision)` |
| `useReasoning(messageId)` | `text, visibility, isStreaming` |
| `useTodos()` / `useDiffs()` / `useCitations(messageId)` | 각 파트 목록 |
| `useUsage()` / `useTurnUsage(turnId)` | 세션 누적 / 턴별 토큰·비용 |
| `useCheckpoints()` | `turns, canRevert(turnId), revert(turnId)` |
| `useCapabilities()` / `useFeature(name)` | capability 원본 / `{ visible, enabled, supported }` |
| `usePermissionQueue()` | 대기 중 승인 요청 + `respond` |
| `useThread()` / `useFocusTrap(ref, active)` | auto-scroll / 포커스 트랩 헬퍼 |

## 컴포넌트 (전부 unstyled, `asChild`/render-prop 지원)

`Thread`, `MessageList`/`MessageItem`, `PartRenderer`(렌더러 레지스트리), `Composer`(+`Input`/`Attachments`/`Submit`/`Stop`), `PermissionPrompt`, `PlanView`, `TodoList`, `DiffView`, `Citations`, `ModelSelector`, `ReasoningEffortControl`, `ModeToggle`, `FastModeToggle`, `UsageBadge`, `CheckpointControls`

`CheckpointControls`는 파괴적 동작(이후 히스토리 영구 삭제)이므로 `onConfirmRevert` 확인 콜백이 **필수**입니다.

## 기능 토글 (필수 vs 선택)

| 구분 | 기능 | 토글 |
| --- | --- | --- |
| **필수 (항상 on)** | text, streaming, send, stop | 토글 무시 |
| 선택 | reasoning, reasoningEffort, toolCalls, streamingToolInput, permissions, planMode, fastMode, todos, diffs, citations, usage, cost, checkpoints, modelSelector, attachments, multiModelCompare | `true \| false \| 'auto'` |

- `'auto'`(기본) → 프로바이더 capability를 따름
- `true` → 강제 노출 — 단 미지원 프로바이더에서는 **비활성 상태로 노출만**
- `false` → 숨김

## 새 프로바이더 어댑터 추가하기

`AgentTransport` 하나를 구현하면 됩니다. UI/스토어 변경은 없습니다.

```ts
import type { AgentTransport, AgentEvent, SendInput } from '@conduit/core';

export function createMyTransport(): AgentTransport {
  return {
    capabilities: { providerId: 'my-provider', /* 지원 기능 선언 */ },
    async *send(input: SendInput, signal: AbortSignal): AsyncIterable<AgentEvent> {
      // 1) input.history를 프로바이더 형식으로 변환해 요청
      // 2) 프로바이더 스트림 청크를 AgentEvent로 yield
      //    turn_start → message_start → part_start → *_delta → part_end → message_end → turn_end
    },
    // capability가 true일 때만 선택 메서드 구현:
    // respondToPermission(toolCallId, decision) {}
    // revertToTurn(turnId) {}
  };
}
```

어댑터 계약 요점:

1. `signal` abort 시 이터레이션을 즉시 끝낼 것 (throw 불필요)
2. `usage` 이벤트는 **증분**으로 방출할 것 (누적 스냅샷을 주는 프로바이더는 어댑터에서 변환 — `anthropic-messages` 어댑터 참고)
3. 프로바이더 고유 용어/형식이 이벤트 밖으로 새어나가지 않을 것

동봉 어댑터: `mock`(결정론적, full/basic 2개 프로필), `anthropic-messages`(SSE·thinking·tool 입력 스트리밍·usage), `openai-chat`(Chat Completions 스트리밍).

브라우저에서 API 키를 직접 노출하지 않도록 실 어댑터는 `endpoint` 프록시를 받습니다.

## 멀티모델 비교

세션 = `AgentSessionProvider` 1개. 같은 프롬프트를 다른 모델로 비교하려면 Provider를 나란히 두 개 렌더하면 됩니다(각자 독립 스토어).
