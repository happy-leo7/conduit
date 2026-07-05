import type {
  AgentEvent,
  AgentTransport,
  AgentUIConfig,
  FilePart,
  Message,
  PermissionDecision,
  ReasoningEffort,
  SendInput,
  SessionMode,
  TextPart,
} from '../types';
import { generateId } from '../utils/id';
import {
  applyPermissionDecision,
  applyRevert,
  finalizeAbortedMessages,
  finalizeDanglingStream,
  reduceEvent,
} from './reducer';
import { createInitialState, type SessionState } from './state';

export interface SendOptions {
  text: string;
  attachments?: FilePart[];
}

/** 스토어가 받는 커맨드. 편의 메서드(send/stop/…)는 전부 이 커맨드로 위임된다. */
export type SessionCommand =
  | { type: 'send'; text: string; attachments?: FilePart[] }
  | { type: 'stop' }
  | { type: 'regenerate' }
  | { type: 'respond_permission'; toolCallId: string; decision: PermissionDecision }
  | { type: 'revert'; turnId: string }
  | { type: 'retry' }
  | { type: 'set_mode'; mode: SessionMode }
  | { type: 'set_reasoning_effort'; effort: ReasoningEffort }
  | { type: 'set_fast_mode'; fastMode: boolean }
  | { type: 'set_model'; model: string };

export interface SessionStore {
  getState(): SessionState;
  subscribe(listener: () => void): () => void;
  dispatch(command: SessionCommand): Promise<void>;
  /** 전송. 스트리밍/승인 대기 중에는 무시된다(잠금). 턴이 끝나면 resolve. */
  send(options: SendOptions): Promise<void>;
  /** 스트리밍 중단. 마지막 메시지는 status='aborted'로 마감. */
  stop(): void;
  /** 마지막 assistant 턴 제거 후 직전 user 입력 재전송. */
  regenerate(): Promise<void>;
  /** 마지막 에러 턴 재시도(regenerate와 동일 경로, retryable 에러용). */
  retry(): Promise<void>;
  respondToPermission(toolCallId: string, decision: PermissionDecision): Promise<void>;
  /** 해당 턴 및 이후 히스토리 영구 삭제 + transport 사이드이펙트 되돌림. */
  revertToTurn(turnId: string): Promise<void>;
  canRevert(turnId: string): boolean;
  setMode(mode: SessionMode): void;
  setReasoningEffort(effort: ReasoningEffort): void;
  setFastMode(fastMode: boolean): void;
  setModel(model: string): void;
  readonly transport: AgentTransport;
  readonly config: AgentUIConfig;
}

export interface CreateSessionStoreOptions {
  transport: AgentTransport;
  config?: AgentUIConfig;
}

export function createSessionStore(options: CreateSessionStoreOptions): SessionStore {
  const { transport } = options;
  const config = options.config ?? {};

  let state = createInitialState({
    mode: config.defaults?.mode,
    reasoningEffort: config.defaults?.reasoningEffort,
    fastMode: config.defaults?.fastMode,
    model: config.defaults?.model ?? transport.capabilities.models[0]?.id,
  });

  const listeners = new Set<() => void>();
  let abortController: AbortController | null = null;

  function setState(next: SessionState): void {
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  }

  function dispatchEvent(event: AgentEvent): void {
    setState(reduceEvent(state, event));
  }

  function isBusy(): boolean {
    return (
      state.status === 'submitting' ||
      state.status === 'streaming' ||
      state.status === 'awaiting-permission'
    );
  }

  async function runTurn(turnId: string, text: string, attachments?: FilePart[]): Promise<void> {
    abortController = new AbortController();
    const signal = abortController.signal;
    const input: SendInput = {
      text,
      attachments,
      mode: state.mode,
      reasoningEffort: state.reasoningEffort,
      fastMode: state.fastMode,
      model: state.model,
      history: state.messages,
    };
    try {
      for await (const raw of transport.send(input, signal)) {
        if (signal.aborted) break;
        // 턴 id의 소유자는 스토어다. 어댑터가 자체 id를 방출해도 스토어의
        // 체크포인트/턴 경계와 일치하도록 여기서 정규화한다.
        const event: AgentEvent =
          raw.type === 'turn_start' || raw.type === 'turn_end' || raw.type === 'checkpoint'
            ? { ...raw, turnId }
            : raw;
        dispatchEvent(event);
      }
      if (signal.aborted) {
        setState(finalizeAbortedMessages(state));
      } else {
        setState(finalizeDanglingStream(state));
      }
    } catch (error) {
      if (signal.aborted) {
        setState(finalizeAbortedMessages(state));
      } else {
        const streamingMessage = state.messages.find((m) => m.status === 'streaming');
        dispatchEvent({
          type: 'error',
          messageId: streamingMessage?.id,
          error: {
            id: generateId('part'),
            type: 'error',
            message: error instanceof Error ? error.message : String(error),
            retryable: true,
          },
        });
      }
    } finally {
      abortController = null;
    }
  }

  async function send({ text, attachments }: SendOptions): Promise<void> {
    if (isBusy()) return;
    const trimmed = text.trim();
    if (trimmed.length === 0 && (!attachments || attachments.length === 0)) return;

    const turnId = generateId('turn');
    const textPart: TextPart = { id: generateId('part'), type: 'text', text };
    const userMessage: Message = {
      id: generateId('msg'),
      role: 'user',
      parts: [textPart, ...(attachments ?? [])],
      status: 'complete',
      createdAt: Date.now(),
      turnId,
    };
    setState({
      ...state,
      messages: [...state.messages, userMessage],
      checkpoints: [
        ...state.checkpoints,
        { turnId, messageIndex: state.messages.length, createdAt: Date.now() },
      ],
      currentTurnId: turnId,
      status: 'submitting',
      lastError: null,
    });
    await runTurn(turnId, text, attachments);
  }

  function stop(): void {
    abortController?.abort();
  }

  async function regenerate(): Promise<void> {
    if (isBusy()) return;
    let userIndex = -1;
    for (let i = state.messages.length - 1; i >= 0; i -= 1) {
      if (state.messages[i]!.role === 'user') {
        userIndex = i;
        break;
      }
    }
    if (userIndex === -1) return;
    const userMessage = state.messages[userIndex]!;
    const textPart = userMessage.parts.find((p): p is TextPart => p.type === 'text');
    const attachments = userMessage.parts.filter((p): p is FilePart => p.type === 'file');
    setState({
      ...state,
      messages: state.messages.slice(0, userIndex + 1),
      currentTurnId: userMessage.turnId,
      status: 'submitting',
      lastError: null,
      pendingPermissions: [],
      streamingPartIds: {},
    });
    await runTurn(userMessage.turnId, textPart?.text ?? '', attachments);
  }

  async function respondToPermission(
    toolCallId: string,
    decision: PermissionDecision,
  ): Promise<void> {
    const pending = state.pendingPermissions.some((p) => p.toolCallId === toolCallId);
    if (!pending) return;
    setState(applyPermissionDecision(state, toolCallId, decision));
    await transport.respondToPermission?.(toolCallId, decision);
  }

  function canRevert(turnId: string): boolean {
    return (
      transport.capabilities.checkpoints &&
      !isBusy() &&
      state.checkpoints.some((c) => c.turnId === turnId)
    );
  }

  async function revertToTurn(turnId: string): Promise<void> {
    if (!canRevert(turnId)) return;
    // transport 되돌림이 실패하면 히스토리를 건드리지 않는다 —
    // "코드는 그대로인데 대화만 사라진" 불일치 상태를 만들지 않기 위해.
    await transport.revertToTurn?.(turnId);
    setState(applyRevert(state, turnId));
  }

  function dispatch(command: SessionCommand): Promise<void> {
    switch (command.type) {
      case 'send':
        return send({ text: command.text, attachments: command.attachments });
      case 'stop':
        stop();
        return Promise.resolve();
      case 'regenerate':
        return regenerate();
      case 'retry':
        return regenerate();
      case 'respond_permission':
        return respondToPermission(command.toolCallId, command.decision);
      case 'revert':
        return revertToTurn(command.turnId);
      case 'set_mode':
        setState({ ...state, mode: command.mode });
        return Promise.resolve();
      case 'set_reasoning_effort':
        setState({ ...state, reasoningEffort: command.effort });
        return Promise.resolve();
      case 'set_fast_mode':
        setState({ ...state, fastMode: command.fastMode });
        return Promise.resolve();
      case 'set_model':
        setState({ ...state, model: command.model });
        return Promise.resolve();
    }
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch,
    send,
    stop,
    regenerate,
    retry: regenerate,
    respondToPermission,
    revertToTurn,
    canRevert,
    setMode: (mode) => setState({ ...state, mode }),
    setReasoningEffort: (effort) => setState({ ...state, reasoningEffort: effort }),
    setFastMode: (fastMode) => setState({ ...state, fastMode }),
    setModel: (model) => setState({ ...state, model }),
    transport,
    config,
  };
}
