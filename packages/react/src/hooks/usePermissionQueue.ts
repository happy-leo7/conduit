import type { PermissionDecision, PermissionRequestPart } from '@conduit/core';
import { useCallback, useMemo } from 'react';
import { useSessionStore } from '../context/AgentSessionProvider';
import { shallowEqual, useSessionSelector } from './useSessionSelector';

export interface PermissionQueue {
  /** 응답 대기 중인 승인 요청(도착 순서). */
  requests: PermissionRequestPart[];
  respond: (toolCallId: string, decision: PermissionDecision) => Promise<void>;
}

/** human-in-the-loop 승인 대기열. */
export function usePermissionQueue(): PermissionQueue {
  const store = useSessionStore();
  const requests = useSessionSelector((s) => {
    const parts: PermissionRequestPart[] = [];
    for (const pending of s.pendingPermissions) {
      const message = s.messages.find((m) => m.id === pending.messageId);
      const part = message?.parts.find((p) => p.id === pending.partId);
      if (part && part.type === 'permission_request') parts.push(part);
    }
    return parts;
  }, shallowEqual);

  const respond = useCallback(
    (toolCallId: string, decision: PermissionDecision) =>
      store.respondToPermission(toolCallId, decision),
    [store],
  );

  return useMemo(() => ({ requests, respond }), [requests, respond]);
}
