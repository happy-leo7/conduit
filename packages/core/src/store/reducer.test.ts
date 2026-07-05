import { describe, expect, it } from 'vitest';
import type { AgentEvent, Message, ToolCallPart } from '../types';
import {
  applyPermissionDecision,
  applyRevert,
  finalizeAbortedMessages,
  reduceEvent,
} from './reducer';
import { createInitialState, type SessionState } from './state';

function reduceAll(state: SessionState, events: AgentEvent[]): SessionState {
  return events.reduce(reduceEvent, state);
}

function baseStream(): AgentEvent[] {
  return [
    { type: 'turn_start', turnId: 't1' },
    { type: 'message_start', messageId: 'm1', role: 'assistant', meta: { model: 'mock-1' } },
  ];
}

describe('reduceEvent', () => {
  it('turn_start → 스트리밍 상태, message_start → 빈 메시지 추가', () => {
    const state = reduceAll(createInitialState(), baseStream());
    expect(state.status).toBe('streaming');
    expect(state.currentTurnId).toBe('t1');
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({
      id: 'm1',
      role: 'assistant',
      status: 'streaming',
      turnId: 't1',
      parts: [],
    });
  });

  it('text_delta는 해당 파트에만 누적된다', () => {
    const state = reduceAll(createInitialState(), [
      ...baseStream(),
      { type: 'part_start', messageId: 'm1', part: { id: 'p1', type: 'text', text: '' } },
      { type: 'text_delta', messageId: 'm1', partId: 'p1', delta: '안녕' },
      { type: 'text_delta', messageId: 'm1', partId: 'p1', delta: '하세요' },
    ]);
    expect(state.messages[0]?.parts[0]).toMatchObject({ type: 'text', text: '안녕하세요' });
    expect(state.streamingPartIds['p1']).toBe(true);
  });

  it('reasoning_delta 누적 + part_end로 스트리밍 표시 해제', () => {
    const state = reduceAll(createInitialState(), [
      ...baseStream(),
      {
        type: 'part_start',
        messageId: 'm1',
        part: { id: 'p1', type: 'reasoning', text: '', visibility: 'full' },
      },
      { type: 'reasoning_delta', messageId: 'm1', partId: 'p1', delta: '생각' },
      { type: 'part_end', messageId: 'm1', partId: 'p1' },
    ]);
    expect(state.messages[0]?.parts[0]).toMatchObject({ type: 'reasoning', text: '생각' });
    expect(state.streamingPartIds['p1']).toBeUndefined();
  });

  it('tool 입력 스트리밍 → ready → result까지의 상태 전이', () => {
    const toolPart: ToolCallPart = {
      id: 'p1',
      type: 'tool_call',
      toolCallId: 'tc1',
      name: 'edit_file',
      input: undefined,
      state: 'streaming-input',
    };
    let state = reduceAll(createInitialState(), [
      ...baseStream(),
      { type: 'part_start', messageId: 'm1', part: toolPart },
      { type: 'tool_input_delta', messageId: 'm1', partId: 'p1', delta: '{"a":' },
      { type: 'tool_input_delta', messageId: 'm1', partId: 'p1', delta: '1}' },
    ]);
    expect(state.messages[0]?.parts[0]).toMatchObject({
      inputTextDelta: '{"a":1}',
      state: 'streaming-input',
    });

    state = reduceEvent(state, {
      type: 'tool_input_ready',
      messageId: 'm1',
      partId: 'p1',
      input: { a: 1 },
    });
    expect(state.messages[0]?.parts[0]).toMatchObject({ input: { a: 1 }, state: 'input-ready' });

    state = reduceEvent(state, {
      type: 'tool_result',
      result: { id: 'p2', type: 'tool_result', toolCallId: 'tc1', status: 'ok', output: 'done' },
    });
    expect(state.messages[0]?.parts[0]).toMatchObject({ state: 'complete' });
    expect(state.messages[0]?.parts[1]).toMatchObject({ type: 'tool_result', output: 'done' });
  });

  it('tool_result가 에러면 tool_call도 error 상태가 된다', () => {
    const state = reduceAll(createInitialState(), [
      ...baseStream(),
      {
        type: 'part_start',
        messageId: 'm1',
        part: {
          id: 'p1',
          type: 'tool_call',
          toolCallId: 'tc1',
          name: 'bash',
          input: {},
          state: 'input-ready',
        },
      },
      {
        type: 'tool_result',
        result: {
          id: 'p2',
          type: 'tool_result',
          toolCallId: 'tc1',
          status: 'error',
          output: 'boom',
          isError: true,
        },
      },
    ]);
    expect(state.messages[0]?.parts[0]).toMatchObject({ state: 'error' });
  });

  it('permission_request는 대기열에 쌓이고 상태를 awaiting-permission으로 바꾼다', () => {
    const state = reduceAll(createInitialState(), [
      ...baseStream(),
      {
        type: 'part_start',
        messageId: 'm1',
        part: {
          id: 'p1',
          type: 'tool_call',
          toolCallId: 'tc1',
          name: 'edit_file',
          input: {},
          state: 'input-ready',
        },
      },
      {
        type: 'permission_request',
        request: {
          id: 'p2',
          type: 'permission_request',
          toolCallId: 'tc1',
          toolName: 'edit_file',
          input: {},
        },
      },
    ]);
    expect(state.status).toBe('awaiting-permission');
    expect(state.pendingPermissions).toEqual([
      { toolCallId: 'tc1', partId: 'p2', messageId: 'm1' },
    ]);
  });

  it('plan/diff/citation 파트는 메시지에 순서대로 추가된다', () => {
    const state = reduceAll(createInitialState(), [
      ...baseStream(),
      { type: 'plan', messageId: 'm1', part: { id: 'p1', type: 'plan', markdown: '# 계획' } },
      {
        type: 'diff',
        messageId: 'm1',
        part: {
          id: 'p2',
          type: 'diff',
          path: 'a.ts',
          patch: '--- a\n+++ b',
          additions: 1,
          deletions: 0,
          changeKind: 'modify',
        },
      },
      {
        type: 'citation',
        messageId: 'm1',
        part: { id: 'p3', type: 'citation', title: '출처', url: 'https://example.com' },
      },
    ]);
    expect(state.messages[0]?.parts.map((p) => p.type)).toEqual(['plan', 'diff', 'citation']);
  });

  it('todo_update는 기존 todo 파트를 제자리에서 교체한다', () => {
    let state = reduceAll(createInitialState(), [
      ...baseStream(),
      {
        type: 'todo_update',
        messageId: 'm1',
        part: {
          id: 'p1',
          type: 'todo',
          items: [{ id: 't1', text: '작업', status: 'in_progress' }],
        },
      },
    ]);
    state = reduceEvent(state, {
      type: 'todo_update',
      messageId: 'm1',
      part: { id: 'p9', type: 'todo', items: [{ id: 't1', text: '작업', status: 'done' }] },
    });
    expect(state.messages[0]?.parts).toHaveLength(1);
    expect(state.messages[0]?.parts[0]).toMatchObject({
      id: 'p1', // 파트 id는 유지 — 부분 구독 안정성
      items: [{ id: 't1', status: 'done' }],
    });
  });

  it('usage는 메시지 meta / 턴별 / 세션 누적에 모두 증분 합산된다', () => {
    let state = reduceAll(createInitialState(), [
      ...baseStream(),
      { type: 'usage', messageId: 'm1', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'usage', messageId: 'm1', usage: { outputTokens: 20, costUsd: 0.01 } },
    ]);
    expect(state.messages[0]?.meta?.usage).toMatchObject({ inputTokens: 10, outputTokens: 25 });
    expect(state.turnUsage['t1']).toMatchObject({ outputTokens: 25, costUsd: 0.01 });
    expect(state.sessionUsage).toMatchObject({ inputTokens: 10, outputTokens: 25 });

    // 다음 턴의 usage는 세션 누적에 계속 쌓인다
    state = reduceAll(state, [
      { type: 'message_end', messageId: 'm1', stopReason: 'end_turn' },
      { type: 'turn_end', turnId: 't1' },
      { type: 'turn_start', turnId: 't2' },
      { type: 'message_start', messageId: 'm2', role: 'assistant' },
      { type: 'usage', messageId: 'm2', usage: { outputTokens: 100 } },
    ]);
    expect(state.sessionUsage.outputTokens).toBe(125);
    expect(state.turnUsage['t2']).toMatchObject({ outputTokens: 100 });
  });

  it('message_end는 stopReason에 따라 메시지 상태를 마감한다', () => {
    const make = (stopReason: 'end_turn' | 'aborted' | 'error') =>
      reduceAll(createInitialState(), [
        ...baseStream(),
        { type: 'message_end', messageId: 'm1', stopReason },
      ]).messages[0]?.status;
    expect(make('end_turn')).toBe('complete');
    expect(make('aborted')).toBe('aborted');
    expect(make('error')).toBe('error');
  });

  it('turn_end는 idle로 되돌린다', () => {
    const state = reduceAll(createInitialState(), [
      ...baseStream(),
      { type: 'message_end', messageId: 'm1', stopReason: 'end_turn' },
      { type: 'turn_end', turnId: 't1' },
    ]);
    expect(state.status).toBe('idle');
    expect(state.currentTurnId).toBeNull();
  });

  it('error 이벤트는 부분 스트림을 보존한 채 ErrorPart를 추가한다', () => {
    const state = reduceAll(createInitialState(), [
      ...baseStream(),
      { type: 'part_start', messageId: 'm1', part: { id: 'p1', type: 'text', text: '' } },
      { type: 'text_delta', messageId: 'm1', partId: 'p1', delta: '부분 응답' },
      {
        type: 'error',
        messageId: 'm1',
        error: { id: 'p2', type: 'error', message: '연결 끊김', retryable: true },
      },
    ]);
    expect(state.status).toBe('error');
    expect(state.lastError?.message).toBe('연결 끊김');
    expect(state.messages[0]?.status).toBe('error');
    expect(state.messages[0]?.parts.map((p) => p.type)).toEqual(['text', 'error']);
    expect(state.messages[0]?.parts[0]).toMatchObject({ text: '부분 응답' });
  });

  it('checkpoint 이벤트는 기존 체크포인트에 라벨을 붙인다', () => {
    let state = createInitialState();
    state = {
      ...state,
      checkpoints: [{ turnId: 't1', messageIndex: 0, createdAt: 0 }],
    };
    state = reduceEvent(state, { type: 'checkpoint', turnId: 't1', label: '첫 요청' });
    expect(state.checkpoints[0]).toMatchObject({ turnId: 't1', label: '첫 요청' });
    expect(state.checkpoints).toHaveLength(1);
  });
});

describe('applyPermissionDecision', () => {
  function stateWithPending(): SessionState {
    const state = reduceAll(createInitialState(), [
      { type: 'turn_start', turnId: 't1' },
      { type: 'message_start', messageId: 'm1', role: 'assistant' },
      {
        type: 'part_start',
        messageId: 'm1',
        part: {
          id: 'p1',
          type: 'tool_call',
          toolCallId: 'tc1',
          name: 'edit_file',
          input: {},
          state: 'input-ready',
        },
      },
      {
        type: 'permission_request',
        request: {
          id: 'p2',
          type: 'permission_request',
          toolCallId: 'tc1',
          toolName: 'edit_file',
          input: {},
        },
      },
    ]);
    return state;
  }

  it('allow: decision 기록 + tool executing + 대기열 제거', () => {
    const state = applyPermissionDecision(stateWithPending(), 'tc1', 'allow');
    expect(state.messages[0]?.parts[1]).toMatchObject({ decision: 'allow' });
    expect(state.messages[0]?.parts[0]).toMatchObject({ state: 'executing' });
    expect(state.pendingPermissions).toHaveLength(0);
    expect(state.status).toBe('streaming');
  });

  it('deny: decision만 기록하고 tool은 executing으로 바꾸지 않는다', () => {
    const state = applyPermissionDecision(stateWithPending(), 'tc1', 'deny');
    expect(state.messages[0]?.parts[1]).toMatchObject({ decision: 'deny' });
    expect(state.messages[0]?.parts[0]).toMatchObject({ state: 'input-ready' });
  });
});

describe('finalizeAbortedMessages / applyRevert', () => {
  it('abort 시 스트리밍 메시지를 aborted로 마감한다', () => {
    const state = finalizeAbortedMessages(
      reduceAll(createInitialState(), [
        { type: 'turn_start', turnId: 't1' },
        { type: 'message_start', messageId: 'm1', role: 'assistant' },
      ]),
    );
    expect(state.messages[0]?.status).toBe('aborted');
    expect(state.status).toBe('idle');
  });

  it('revert는 해당 턴부터 이후 히스토리와 턴 usage를 제거한다', () => {
    const user1: Message = {
      id: 'u1',
      role: 'user',
      parts: [{ id: 'p1', type: 'text', text: '1' }],
      status: 'complete',
      createdAt: 0,
      turnId: 't1',
    };
    const user2: Message = { ...user1, id: 'u2', turnId: 't2' };
    let state: SessionState = {
      ...createInitialState(),
      messages: [user1, user2],
      checkpoints: [
        { turnId: 't1', messageIndex: 0, createdAt: 0 },
        { turnId: 't2', messageIndex: 1, createdAt: 0 },
      ],
      turnUsage: { t1: { outputTokens: 10 }, t2: { outputTokens: 20 } },
      sessionUsage: { outputTokens: 30 },
    };
    state = applyRevert(state, 't2');
    expect(state.messages.map((m) => m.id)).toEqual(['u1']);
    expect(state.checkpoints.map((c) => c.turnId)).toEqual(['t1']);
    expect(state.turnUsage).toEqual({ t1: { outputTokens: 10 } });
    // 세션 누적은 실제 지출이므로 유지된다
    expect(state.sessionUsage.outputTokens).toBe(30);
  });
});
