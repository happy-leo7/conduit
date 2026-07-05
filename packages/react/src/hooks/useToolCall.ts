import type {
  PermissionDecision,
  PermissionRequestPart,
  ToolCallPart,
  ToolCallState,
  ToolResultPart,
} from '@conduit/core';
import { useCallback, useMemo } from 'react';
import { useSessionStore } from '../context/AgentSessionProvider';
import { shallowEqual, useSessionSelector } from './useSessionSelector';

export interface ToolCallView {
  name: string;
  input: unknown;
  /** 스트리밍 중 누적된 부분 JSON 텍스트. */
  inputText: string;
  state: ToolCallState;
  result: ToolResultPart | undefined;
  permission: PermissionRequestPart | undefined;
  respond: (decision: PermissionDecision) => Promise<void>;
}

/** toolCallId로 도구 호출·결과·승인 요청을 한 번에 구독한다. */
export function useToolCall(toolCallId: string): ToolCallView | undefined {
  const store = useSessionStore();
  const slice = useSessionSelector(
    (s) => {
      let call: ToolCallPart | undefined;
      let result: ToolResultPart | undefined;
      let permission: PermissionRequestPart | undefined;
      for (const message of s.messages) {
        for (const part of message.parts) {
          if (part.type === 'tool_call' && part.toolCallId === toolCallId) call = part;
          else if (part.type === 'tool_result' && part.toolCallId === toolCallId) result = part;
          else if (part.type === 'permission_request' && part.toolCallId === toolCallId)
            permission = part;
        }
      }
      return { call, result, permission };
    },
    shallowEqual,
  );

  const respond = useCallback(
    (decision: PermissionDecision) => store.respondToPermission(toolCallId, decision),
    [store, toolCallId],
  );

  return useMemo(() => {
    if (!slice.call) return undefined;
    return {
      name: slice.call.name,
      input: slice.call.input,
      inputText: slice.call.inputTextDelta ?? '',
      state: slice.call.state,
      result: slice.result,
      permission: slice.permission,
      respond,
    };
  }, [slice, respond]);
}
