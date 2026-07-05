import type {
  AgentEvent,
  Message,
  Part,
  PermissionDecision,
  StopReason,
  ToolCallPart,
} from '../types';
import { addUsage } from '../utils/usage';
import type { SessionState } from './state';

/**
 * AgentEvent → SessionState 순수 리듀서.
 *
 * 불변 업데이트하되 영향받는 메시지/파트 객체만 갈아끼운다 — 부분 구독(파트 단위
 * useSyncExternalStore 셀렉터)이 리스트 전체 재렌더 없이 동작하는 근거.
 *
 * usage 이벤트는 "증분(delta)"으로 취급한다. 누적 스냅샷을 주는 프로바이더는
 * 어댑터에서 증분으로 변환해야 한다(어댑터 계약).
 */
export function reduceEvent(state: SessionState, event: AgentEvent): SessionState {
  switch (event.type) {
    case 'turn_start':
      return {
        ...state,
        currentTurnId: event.turnId,
        status: state.pendingPermissions.length > 0 ? 'awaiting-permission' : 'streaming',
      };

    case 'message_start': {
      const message: Message = {
        id: event.messageId,
        role: event.role,
        parts: [],
        status: 'streaming',
        createdAt: Date.now(),
        turnId: state.currentTurnId ?? 'turn_unknown',
        meta: event.meta,
      };
      return { ...state, messages: [...state.messages, message], status: nextStreamStatus(state) };
    }

    case 'part_start':
      return {
        ...updateMessage(state, event.messageId, (m) => ({
          ...m,
          parts: [...m.parts, event.part],
        })),
        streamingPartIds: { ...state.streamingPartIds, [event.part.id]: true },
      };

    case 'text_delta':
      return updatePart(state, event.messageId, event.partId, (part) =>
        part.type === 'text' ? { ...part, text: part.text + event.delta } : part,
      );

    case 'reasoning_delta':
      return updatePart(state, event.messageId, event.partId, (part) =>
        part.type === 'reasoning' ? { ...part, text: part.text + event.delta } : part,
      );

    case 'tool_input_delta':
      return updatePart(state, event.messageId, event.partId, (part) =>
        part.type === 'tool_call'
          ? {
              ...part,
              inputTextDelta: (part.inputTextDelta ?? '') + event.delta,
              state: 'streaming-input',
            }
          : part,
      );

    case 'tool_input_ready':
      return updatePart(state, event.messageId, event.partId, (part) =>
        part.type === 'tool_call' ? { ...part, input: event.input, state: 'input-ready' } : part,
      );

    case 'tool_result': {
      const location = findToolCall(state, event.result.toolCallId);
      const messageId = location?.messageId ?? lastAssistantMessageId(state);
      if (!messageId) return state;
      let next = updateMessage(state, messageId, (m) => ({
        ...m,
        parts: [...m.parts, event.result],
      }));
      if (location) {
        next = updatePart(next, location.messageId, location.partId, (part) =>
          part.type === 'tool_call'
            ? { ...part, state: event.result.status === 'error' ? 'error' : 'complete' }
            : part,
        );
      }
      return next;
    }

    case 'permission_request': {
      const location = findToolCall(state, event.request.toolCallId);
      const messageId = location?.messageId ?? lastAssistantMessageId(state);
      if (!messageId) return state;
      const next = updateMessage(state, messageId, (m) => ({
        ...m,
        parts: [...m.parts, event.request],
      }));
      return {
        ...next,
        pendingPermissions: [
          ...next.pendingPermissions,
          { toolCallId: event.request.toolCallId, partId: event.request.id, messageId },
        ],
        status: 'awaiting-permission',
      };
    }

    case 'plan':
    case 'diff':
    case 'citation':
      return updateMessage(state, event.messageId, (m) => ({
        ...m,
        parts: [...m.parts, event.part],
      }));

    case 'todo_update':
      // 같은 메시지에 todo 파트가 이미 있으면 교체(제자리 갱신), 없으면 추가.
      return updateMessage(state, event.messageId, (m) => {
        const existingIndex = m.parts.findIndex((p) => p.type === 'todo');
        if (existingIndex === -1) return { ...m, parts: [...m.parts, event.part] };
        const parts = m.parts.slice();
        parts[existingIndex] = { ...event.part, id: m.parts[existingIndex]!.id };
        return { ...m, parts };
      });

    case 'usage': {
      const message = state.messages.find((m) => m.id === event.messageId);
      const next = updateMessage(state, event.messageId, (m) => ({
        ...m,
        meta: { ...m.meta, usage: addUsage(m.meta?.usage ?? {}, event.usage) },
      }));
      const turnId = message?.turnId ?? state.currentTurnId;
      return {
        ...next,
        sessionUsage: addUsage(next.sessionUsage, event.usage),
        turnUsage: turnId
          ? { ...next.turnUsage, [turnId]: addUsage(next.turnUsage[turnId] ?? {}, event.usage) }
          : next.turnUsage,
      };
    }

    case 'part_end': {
      if (!state.streamingPartIds[event.partId]) return state;
      const { [event.partId]: _removed, ...rest } = state.streamingPartIds;
      return { ...state, streamingPartIds: rest };
    }

    case 'message_end':
      return updateMessage(state, event.messageId, (m) => ({
        ...m,
        status: messageStatusFor(event.stopReason),
      }));

    case 'turn_end':
      return {
        ...state,
        status: state.pendingPermissions.length > 0 ? 'awaiting-permission' : 'idle',
        currentTurnId: null,
        streamingPartIds: {},
      };

    case 'error': {
      let next = state;
      if (event.messageId) {
        next = updateMessage(next, event.messageId, (m) => ({
          ...m,
          parts: [...m.parts, event.error],
          status: 'error',
        }));
      }
      return { ...next, status: 'error', lastError: event.error };
    }

    case 'checkpoint': {
      const index = state.checkpoints.findIndex((c) => c.turnId === event.turnId);
      if (index === -1) {
        // 스토어가 만든 체크포인트가 없으면(외부 주도 턴) 현재 끝 위치로 생성.
        return {
          ...state,
          checkpoints: [
            ...state.checkpoints,
            {
              turnId: event.turnId,
              label: event.label,
              messageIndex: state.messages.length,
              createdAt: Date.now(),
            },
          ],
        };
      }
      const checkpoints = state.checkpoints.slice();
      checkpoints[index] = { ...checkpoints[index]!, label: event.label ?? checkpoints[index]!.label };
      return { ...state, checkpoints };
    }
  }
}

/** permission 응답을 상태에 반영한다(스토어 액션에서 호출). */
export function applyPermissionDecision(
  state: SessionState,
  toolCallId: string,
  decision: PermissionDecision,
): SessionState {
  const pending = state.pendingPermissions.find((p) => p.toolCallId === toolCallId);
  if (!pending) return state;
  let next = updatePart(state, pending.messageId, pending.partId, (part) =>
    part.type === 'permission_request' ? { ...part, decision } : part,
  );
  if (decision !== 'deny') {
    const location = findToolCall(next, toolCallId);
    if (location) {
      next = updatePart(next, location.messageId, location.partId, (part) =>
        part.type === 'tool_call' ? { ...part, state: 'executing' } : part,
      );
    }
  }
  const pendingPermissions = next.pendingPermissions.filter((p) => p.toolCallId !== toolCallId);
  return {
    ...next,
    pendingPermissions,
    status: pendingPermissions.length > 0 ? 'awaiting-permission' : 'streaming',
  };
}

/** 스트리밍 중이던 메시지를 aborted로 마감한다(stop() 처리). */
export function finalizeAbortedMessages(state: SessionState): SessionState {
  return {
    ...state,
    messages: state.messages.map((m) =>
      m.status === 'streaming' ? { ...m, status: 'aborted' as const } : m,
    ),
    status: 'idle',
    currentTurnId: null,
    pendingPermissions: [],
    streamingPartIds: {},
  };
}

/** 스트림이 turn_end 없이 끝났을 때의 안전망 — 열린 메시지를 complete로 마감. */
export function finalizeDanglingStream(state: SessionState): SessionState {
  if (state.status === 'idle' || state.status === 'error') return state;
  return {
    ...state,
    messages: state.messages.map((m) =>
      m.status === 'streaming' ? { ...m, status: 'complete' as const } : m,
    ),
    status: 'idle',
    currentTurnId: null,
    streamingPartIds: {},
  };
}

/** revert: 해당 턴의 user 메시지부터 이후 전부 제거. 이후 히스토리는 영구 삭제로 취급(Conductor). */
export function applyRevert(state: SessionState, turnId: string): SessionState {
  const checkpoint = state.checkpoints.find((c) => c.turnId === turnId);
  if (!checkpoint) return state;
  const removedTurnIds = new Set(
    state.messages.slice(checkpoint.messageIndex).map((m) => m.turnId),
  );
  const turnUsage = { ...state.turnUsage };
  for (const id of removedTurnIds) delete turnUsage[id];
  return {
    ...state,
    messages: state.messages.slice(0, checkpoint.messageIndex),
    checkpoints: state.checkpoints.filter((c) => c.messageIndex < checkpoint.messageIndex),
    turnUsage,
    pendingPermissions: [],
    streamingPartIds: {},
    status: 'idle',
    currentTurnId: null,
    lastError: null,
  };
}

// ── 내부 헬퍼 ──────────────────────────────────────────────────────────────

function nextStreamStatus(state: SessionState): SessionState['status'] {
  return state.pendingPermissions.length > 0 ? 'awaiting-permission' : 'streaming';
}

function messageStatusFor(stopReason: StopReason): Message['status'] {
  if (stopReason === 'aborted') return 'aborted';
  if (stopReason === 'error') return 'error';
  return 'complete';
}

function updateMessage(
  state: SessionState,
  messageId: string,
  update: (message: Message) => Message,
): SessionState {
  const index = state.messages.findIndex((m) => m.id === messageId);
  if (index === -1) return state;
  const messages = state.messages.slice();
  messages[index] = update(state.messages[index]!);
  return { ...state, messages };
}

function updatePart(
  state: SessionState,
  messageId: string,
  partId: string,
  update: (part: Part) => Part,
): SessionState {
  return updateMessage(state, messageId, (m) => {
    const index = m.parts.findIndex((p) => p.id === partId);
    if (index === -1) return m;
    const parts = m.parts.slice();
    parts[index] = update(m.parts[index]!);
    return { ...m, parts };
  });
}

function findToolCall(
  state: SessionState,
  toolCallId: string,
): { messageId: string; partId: string; part: ToolCallPart } | null {
  for (let i = state.messages.length - 1; i >= 0; i -= 1) {
    const message = state.messages[i]!;
    for (const part of message.parts) {
      if (part.type === 'tool_call' && part.toolCallId === toolCallId) {
        return { messageId: message.id, partId: part.id, part };
      }
    }
  }
  return null;
}

function lastAssistantMessageId(state: SessionState): string | null {
  for (let i = state.messages.length - 1; i >= 0; i -= 1) {
    if (state.messages[i]!.role === 'assistant') return state.messages[i]!.id;
  }
  return null;
}
