import { describe, expect, it } from 'vitest';
import { createMockTransport } from '../adapters/mock';
import type { PermissionRequestPart, ToolCallPart } from '../types';
import { createSessionStore, type SessionStore } from './sessionStore';

function createStore(profile: 'full' | 'basic' = 'full'): SessionStore {
  return createSessionStore({ transport: createMockTransport({ profile, delayMs: 0 }) });
}

function waitFor(store: SessionStore, predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (predicate()) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error('waitFor 시간 초과'));
    }, timeoutMs);
    const unsubscribe = store.subscribe(() => {
      if (predicate()) {
        clearTimeout(timer);
        unsubscribe();
        resolve();
      }
    });
  });
}

function findPart<T extends { type: string }>(store: SessionStore, type: T['type']): T | undefined {
  for (const message of store.getState().messages) {
    for (const part of message.parts) {
      if (part.type === type) return part as unknown as T;
    }
  }
  return undefined;
}

describe('sessionStore — 기본 전송/스트리밍', () => {
  it('send()는 user 메시지를 낙관적으로 추가하고 assistant 스트림을 리듀스한다', async () => {
    const store = createStore();
    await store.send({ text: '안녕하세요' });

    const { messages, status, checkpoints } = store.getState();
    expect(status).toBe('idle');
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'user', status: 'complete' });
    expect(messages[1]).toMatchObject({ role: 'assistant', status: 'complete' });
    // reasoning + text 파트가 스트리밍으로 채워졌다
    const types = messages[1]!.parts.map((p) => p.type);
    expect(types).toContain('reasoning');
    expect(types).toContain('text');
    // 체크포인트는 user 전송 직전 경계에 생성되고 라벨이 붙는다
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]).toMatchObject({ messageIndex: 0, label: '안녕하세요' });
    // usage 누적
    expect(store.getState().sessionUsage.outputTokens).toBeGreaterThan(0);
    expect(store.getState().turnUsage[messages[0]!.turnId]).toBeDefined();
  });

  it('빈 입력은 무시된다', async () => {
    const store = createStore();
    await store.send({ text: '   ' });
    expect(store.getState().messages).toHaveLength(0);
  });

  it('스트리밍 중 send()는 잠긴다', async () => {
    const store = createStore();
    const first = store.send({ text: '첫 번째' });
    await waitFor(store, () => store.getState().status !== 'idle');
    await store.send({ text: '두 번째' }); // 무시되어야 함
    await first;
    expect(store.getState().messages.filter((m) => m.role === 'user')).toHaveLength(1);
  });
});

describe('sessionStore — stop/abort', () => {
  it('stop()은 스트림을 중단하고 마지막 메시지를 aborted로 마감한다', async () => {
    const store = createSessionStore({
      transport: createMockTransport({ profile: 'full', delayMs: 5 }),
    });
    const sending = store.send({ text: '긴 답변을 주세요' });
    await waitFor(store, () =>
      store.getState().messages.some((m) => m.role === 'assistant' && m.status === 'streaming'),
    );
    store.stop();
    await sending;

    const { messages, status } = store.getState();
    expect(status).toBe('idle');
    expect(messages.at(-1)).toMatchObject({ role: 'assistant', status: 'aborted' });
  });
});

describe('sessionStore — permission 흐름', () => {
  it('permission 요청 → allow → tool 실행/diff/todo까지 완주한다', async () => {
    const store = createStore();
    const sending = store.send({ text: 'greeting을 수정해줘' });
    await waitFor(store, () => store.getState().status === 'awaiting-permission');

    const request = findPart<PermissionRequestPart>(store, 'permission_request');
    expect(request).toMatchObject({ toolName: 'edit_file' });
    await store.respondToPermission(request!.toolCallId, 'allow');
    await sending;

    const state = store.getState();
    expect(state.status).toBe('idle');
    expect(findPart<ToolCallPart>(store, 'tool_call')).toMatchObject({ state: 'complete' });
    expect(findPart(store, 'tool_result')).toBeDefined();
    expect(findPart(store, 'diff')).toBeDefined();
    // todo는 제자리 갱신되어 하나만 존재하고 전부 done
    const todos = state.messages.flatMap((m) => m.parts.filter((p) => p.type === 'todo'));
    expect(todos).toHaveLength(1);
    expect(request && findPart<PermissionRequestPart>(store, 'permission_request')).toMatchObject({
      decision: 'allow',
    });
  });

  it('deny하면 tool_result가 에러로 남고 턴이 정상 종료된다', async () => {
    const store = createStore();
    const sending = store.send({ text: '파일을 수정해줘 fix' });
    await waitFor(store, () => store.getState().status === 'awaiting-permission');

    const request = findPart<PermissionRequestPart>(store, 'permission_request');
    await store.respondToPermission(request!.toolCallId, 'deny');
    await sending;

    expect(store.getState().status).toBe('idle');
    expect(findPart<ToolCallPart>(store, 'tool_call')).toMatchObject({ state: 'error' });
    expect(findPart(store, 'diff')).toBeUndefined();
  });

  it('allow_always 이후 같은 도구는 승인 없이 실행된다', async () => {
    const store = createStore();
    const first = store.send({ text: 'fix 1' });
    await waitFor(store, () => store.getState().status === 'awaiting-permission');
    const request = findPart<PermissionRequestPart>(store, 'permission_request');
    await store.respondToPermission(request!.toolCallId, 'allow_always');
    await first;

    await store.send({ text: 'fix 2' });
    const permissionParts = store
      .getState()
      .messages.flatMap((m) => m.parts.filter((p) => p.type === 'permission_request'));
    expect(permissionParts).toHaveLength(1); // 두 번째 턴에는 요청 없음
    expect(store.getState().status).toBe('idle');
  });
});

describe('sessionStore — regenerate/에러 재시도', () => {
  it('regenerate()는 마지막 assistant 턴을 제거하고 재전송한다', async () => {
    const store = createStore();
    await store.send({ text: '안녕' });
    const firstAssistantId = store.getState().messages[1]!.id;

    await store.regenerate();
    const { messages } = store.getState();
    expect(messages).toHaveLength(2);
    expect(messages[1]!.id).not.toBe(firstAssistantId);
    expect(messages[1]).toMatchObject({ role: 'assistant', status: 'complete' });
    // 같은 턴 id를 유지한다(체크포인트 경계 보존)
    expect(messages[1]!.turnId).toBe(messages[0]!.turnId);
  });

  it('에러 시나리오: 부분 스트림 보존 + retryable ErrorPart + retry 동작', async () => {
    const store = createStore();
    await store.send({ text: 'error를 발생시켜줘' });

    let state = store.getState();
    expect(state.status).toBe('error');
    expect(state.lastError).toMatchObject({ retryable: true });
    const assistant = state.messages[1]!;
    expect(assistant.status).toBe('error');
    expect(assistant.parts.some((p) => p.type === 'text')).toBe(true);
    expect(assistant.parts.some((p) => p.type === 'error')).toBe(true);

    await store.retry();
    state = store.getState();
    // 재시도 역시 에러 시나리오지만, 이전 에러 메시지는 교체되었다
    expect(state.messages).toHaveLength(2);
  });
});

describe('sessionStore — checkpoint/revert', () => {
  it('revert는 해당 턴 이후 히스토리를 영구 삭제하고 transport에 되돌림을 위임한다', async () => {
    const transport = createMockTransport({ profile: 'full', delayMs: 0 });
    const store = createSessionStore({ transport });
    await store.send({ text: '첫 번째 질문' });
    await store.send({ text: '두 번째 질문' });
    expect(store.getState().messages).toHaveLength(4);

    const secondTurnId = store.getState().messages[2]!.turnId;
    expect(store.canRevert(secondTurnId)).toBe(true);
    await store.revertToTurn(secondTurnId);

    const state = store.getState();
    expect(state.messages).toHaveLength(2);
    expect(state.checkpoints).toHaveLength(1);
    expect(transport.revertedTurns).toEqual([secondTurnId]);
  });

  it('checkpoints 미지원(basic) 프로파일에서는 revert가 불가능하다', async () => {
    const store = createStore('basic');
    await store.send({ text: '안녕' });
    const turnId = store.getState().messages[0]!.turnId;
    expect(store.canRevert(turnId)).toBe(false);
    await store.revertToTurn(turnId);
    expect(store.getState().messages).toHaveLength(2); // 변화 없음
  });
});

describe('sessionStore — basic 프로필 (capability 차이)', () => {
  it('basic 프로필은 reasoning 파트를 방출하지 않는다', async () => {
    const store = createStore('basic');
    await store.send({ text: '안녕하세요' });
    const assistant = store.getState().messages[1]!;
    expect(assistant.parts.some((p) => p.type === 'reasoning')).toBe(false);
    expect(assistant.parts.some((p) => p.type === 'text')).toBe(true);
  });

  it('basic 프로필의 코딩 요청은 permission 없이 tool을 실행한다', async () => {
    const store = createStore('basic');
    await store.send({ text: 'fix the bug' });
    const state = store.getState();
    expect(state.status).toBe('idle');
    expect(findPart<ToolCallPart>(store, 'tool_call')).toMatchObject({ state: 'complete' });
    expect(findPart(store, 'permission_request')).toBeUndefined();
    expect(findPart(store, 'diff')).toBeUndefined(); // diffs 미지원
  });
});

describe('sessionStore — 세션 컨트롤', () => {
  it('mode/effort/fastMode/model 설정이 상태에 반영된다', () => {
    const store = createStore();
    store.setMode('plan');
    store.setReasoningEffort('xhigh');
    store.setFastMode(true);
    store.setModel('mock-opus-4');
    expect(store.getState()).toMatchObject({
      mode: 'plan',
      reasoningEffort: 'xhigh',
      fastMode: true,
      model: 'mock-opus-4',
    });
  });

  it('plan 모드 전송은 PlanPart를 만든다', async () => {
    const store = createStore();
    store.setMode('plan');
    await store.send({ text: '로그인 기능 만들어줘' });
    expect(findPart(store, 'plan')).toBeDefined();
  });

  it('dispatch(command)는 편의 메서드와 동일하게 동작한다', async () => {
    const store = createStore();
    await store.dispatch({ type: 'set_mode', mode: 'plan' });
    expect(store.getState().mode).toBe('plan');
    await store.dispatch({ type: 'send', text: '안녕' });
    expect(store.getState().messages).toHaveLength(2);
  });
});
