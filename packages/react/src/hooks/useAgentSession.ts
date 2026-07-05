import type {
  ErrorPart,
  Message,
  ReasoningEffort,
  SendOptions,
  SessionMode,
  SessionStatus,
} from '@conduit/core';
import { useMemo } from 'react';
import { useSessionStore } from '../context/AgentSessionProvider';
import { useSessionSelector } from './useSessionSelector';

export interface AgentSession {
  messages: Message[];
  status: SessionStatus;
  currentTurnId: string | null;
  lastError: ErrorPart | null;
  send: (options: SendOptions) => Promise<void>;
  stop: () => void;
  regenerate: () => Promise<void>;
  retry: () => Promise<void>;
  mode: SessionMode;
  setMode: (mode: SessionMode) => void;
  reasoningEffort: ReasoningEffort;
  setReasoningEffort: (effort: ReasoningEffort) => void;
  fastMode: boolean;
  setFastMode: (fastMode: boolean) => void;
  model: string | undefined;
  setModel: (model: string) => void;
}

/** 세션의 최상위 뷰 — 메시지 목록, 상태, 전송/중단, 세션 컨트롤. */
export function useAgentSession(): AgentSession {
  const store = useSessionStore();
  const messages = useSessionSelector((s) => s.messages);
  const status = useSessionSelector((s) => s.status);
  const currentTurnId = useSessionSelector((s) => s.currentTurnId);
  const lastError = useSessionSelector((s) => s.lastError);
  const mode = useSessionSelector((s) => s.mode);
  const reasoningEffort = useSessionSelector((s) => s.reasoningEffort);
  const fastMode = useSessionSelector((s) => s.fastMode);
  const model = useSessionSelector((s) => s.model);

  return useMemo(
    () => ({
      messages,
      status,
      currentTurnId,
      lastError,
      send: store.send,
      stop: store.stop,
      regenerate: store.regenerate,
      retry: store.retry,
      mode,
      setMode: store.setMode,
      reasoningEffort,
      setReasoningEffort: store.setReasoningEffort,
      fastMode,
      setFastMode: store.setFastMode,
      model,
      setModel: store.setModel,
    }),
    [store, messages, status, currentTurnId, lastError, mode, reasoningEffort, fastMode, model],
  );
}
