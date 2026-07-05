import type {
  AgentEvent,
  AgentTransport,
  Capabilities,
  DiffPart,
  PermissionDecision,
  PlanPart,
  SendInput,
  TodoItem,
  TodoPart,
  ToolResultPart,
} from '../../types';
import { createDeferred, sleep, type Deferred } from '../../utils/async';
import { generateId } from '../../utils/id';

/**
 * Mock 어댑터 — API 키 없이 전체 인터페이스를 결정론적으로 시연/테스트한다.
 *
 * 입력 텍스트의 키워드에 따라 시나리오가 분기된다:
 * - mode==='plan'            → plan 시나리오
 * - "diff" | "refactor" | "수정" | "fix" → 코딩 시나리오(tool + permission + diff + todo)
 * - "error" | "에러"          → 재시도 가능한 에러 시나리오
 * - "cite" | "출처"           → citation 시나리오
 * - 그 외                     → reasoning + 텍스트 시나리오
 */
export interface MockTransportOptions {
  /** 'full'(모든 capability on) | 'basic'(텍스트+tool만 — 프로바이더 차이 시연용) */
  profile?: 'full' | 'basic';
  /** 델타 간 기본 지연(ms). 테스트에서는 0. */
  delayMs?: number;
}

export interface MockTransport extends AgentTransport {
  /** revertToTurn 호출 기록 — 테스트/데모 검증용. */
  readonly revertedTurns: string[];
}

export const MOCK_FULL_CAPABILITIES: Capabilities = {
  providerId: 'mock-full',
  models: [
    { id: 'mock-fable-5', label: 'Mock Fable 5' },
    { id: 'mock-opus-4', label: 'Mock Opus 4' },
    { id: 'mock-haiku-4', label: 'Mock Haiku 4' },
  ],
  reasoning: { supported: true, visibility: 'full' },
  reasoningEffort: { supported: true, levels: ['low', 'medium', 'high', 'xhigh'] },
  planMode: true,
  fastMode: true,
  toolUse: true,
  streamingToolInput: true,
  permissions: true,
  attachments: { supported: true, mimeTypes: ['image/png', 'image/jpeg', 'text/plain'] },
  images: true,
  diffs: true,
  todos: true,
  citations: true,
  checkpoints: true,
  usage: true,
  cost: true,
  interrupt: true,
  multiModelCompare: true,
};

export const MOCK_BASIC_CAPABILITIES: Capabilities = {
  providerId: 'mock-basic',
  models: [{ id: 'mock-basic-1', label: 'Mock Basic' }],
  reasoning: { supported: false, visibility: 'hidden' },
  reasoningEffort: { supported: false, levels: [] },
  planMode: false,
  fastMode: false,
  toolUse: true,
  streamingToolInput: false,
  permissions: false,
  attachments: { supported: false, mimeTypes: [] },
  images: false,
  diffs: false,
  todos: false,
  citations: false,
  checkpoints: false,
  usage: true,
  cost: false,
  interrupt: true,
  multiModelCompare: false,
};

export function createMockTransport(options: MockTransportOptions = {}): MockTransport {
  const profile = options.profile ?? 'full';
  const delayMs = options.delayMs ?? 24;
  const capabilities = profile === 'full' ? MOCK_FULL_CAPABILITIES : MOCK_BASIC_CAPABILITIES;

  const pendingPermissions = new Map<string, Deferred<PermissionDecision>>();
  const alwaysAllowedTools = new Set<string>();
  const revertedTurns: string[] = [];

  async function* send(input: SendInput, signal: AbortSignal): AsyncIterable<AgentEvent> {
    const emitter = new MockEmitter(input, signal, delayMs, capabilities, {
      waitForPermission: (toolCallId) => {
        if (!capabilities.permissions) return Promise.resolve('allow' as const);
        const deferred = createDeferred<PermissionDecision>();
        pendingPermissions.set(toolCallId, deferred);
        return deferred.promise;
      },
      isAlwaysAllowed: (toolName) => alwaysAllowedTools.has(toolName),
      rememberAlwaysAllowed: (toolName) => alwaysAllowedTools.add(toolName),
    });
    yield* emitter.run();
  }

  const transport: MockTransport = {
    capabilities,
    send,
    revertedTurns,
  };

  if (capabilities.permissions) {
    transport.respondToPermission = (toolCallId, decision) => {
      const deferred = pendingPermissions.get(toolCallId);
      if (deferred) {
        pendingPermissions.delete(toolCallId);
        deferred.resolve(decision);
      }
    };
  }
  if (capabilities.checkpoints) {
    transport.revertToTurn = (turnId) => {
      revertedTurns.push(turnId);
    };
  }
  return transport;
}

// ── 시나리오 방출기 ─────────────────────────────────────────────────────────

interface PermissionBridge {
  waitForPermission(toolCallId: string): Promise<PermissionDecision>;
  isAlwaysAllowed(toolName: string): boolean;
  rememberAlwaysAllowed(toolName: string): void;
}

class MockEmitter {
  private readonly messageId = generateId('msg');

  constructor(
    private readonly input: SendInput,
    private readonly signal: AbortSignal,
    private readonly delayMs: number,
    private readonly capabilities: Capabilities,
    private readonly permissions: PermissionBridge,
  ) {}

  async *run(): AsyncIterable<AgentEvent> {
    const { input, messageId } = this;
    yield { type: 'turn_start', turnId: generateId('turn') };
    yield {
      type: 'message_start',
      messageId,
      role: 'assistant',
      meta: { model: input.model ?? this.capabilities.models[0]?.id },
    };

    const text = input.text.toLowerCase();
    if (this.signal.aborted) return;

    if (input.mode === 'plan' && this.capabilities.planMode) {
      yield* this.planScenario();
    } else if (/error|에러/.test(text)) {
      yield* this.errorScenario();
      return; // 에러 시나리오는 자체적으로 스트림을 종료한다.
    } else if (/diff|refactor|fix|수정|구현/.test(text) && this.capabilities.toolUse) {
      yield* this.codingScenario();
    } else if (/cite|출처|검색/.test(text) && this.capabilities.citations) {
      yield* this.citationScenario();
    } else {
      yield* this.chatScenario();
    }

    if (this.signal.aborted) return;
    yield* this.finishTurn('end_turn');
  }

  // 기본: reasoning + 텍스트
  private async *chatScenario(): AsyncIterable<AgentEvent> {
    yield* this.reasoning(
      '사용자의 요청을 이해했다. 간결하고 정확한 답변을 스트리밍으로 전달하자. ' +
        `요청 모드: ${this.input.mode ?? 'execute'}, effort: ${this.input.reasoningEffort ?? 'medium'}.`,
    );
    yield* this.text(
      `안녕하세요! "${truncate(this.input.text, 40)}" 요청을 받았습니다.\n\n` +
        '저는 mock 어댑터가 생성한 응답입니다. 실제 프로바이더로 교체해도 ' +
        'UI 코드는 한 줄도 바뀌지 않습니다 — 모든 프로바이더가 동일한 정규화 ' +
        '이벤트 스트림으로 변환되기 때문입니다.',
    );
  }

  // 코딩: todo → tool_call(스트리밍 입력) → permission → tool_result → diff → todo 갱신 → 요약
  private async *codingScenario(): AsyncIterable<AgentEvent> {
    const { messageId } = this;
    yield* this.reasoning(
      '코드 변경 요청이다. 대상 파일을 파악하고, 변경 계획을 todo로 공유한 뒤 ' +
        'edit_file 도구로 수정하자. 변경은 diff로 보여준다.',
    );

    const todoItems: TodoItem[] = [
      { id: 'todo_1', text: '대상 파일 분석', status: 'done' },
      { id: 'todo_2', text: 'edit_file로 코드 수정', status: 'in_progress' },
      { id: 'todo_3', text: '변경 사항 요약', status: 'pending' },
    ];
    if (this.capabilities.todos) {
      yield* this.todoUpdate(todoItems);
    }

    yield* this.text('요청하신 변경을 진행하겠습니다. 먼저 `src/greeting.ts`를 수정합니다.\n');

    // tool_call — 입력 JSON을 조각내어 스트리밍
    const toolCallId = generateId('tool');
    const partId = generateId('part');
    const toolInput = {
      path: 'src/greeting.ts',
      old_text: "export const greeting = 'hello';",
      new_text: "export const greeting = 'hello, conduit!';",
    };
    yield {
      type: 'part_start',
      messageId,
      part: {
        id: partId,
        type: 'tool_call',
        toolCallId,
        name: 'edit_file',
        input: undefined,
        state: 'streaming-input',
      },
    };
    if (this.capabilities.streamingToolInput) {
      for (const chunk of chunkString(JSON.stringify(toolInput, null, 2), 18)) {
        if (this.signal.aborted) return;
        await sleep(this.delayMs, this.signal);
        yield { type: 'tool_input_delta', messageId, partId, delta: chunk };
      }
    }
    yield { type: 'tool_input_ready', messageId, partId, input: toolInput };
    yield { type: 'part_end', messageId, partId };

    // permission 흐름 (capability에 따라 생략)
    let decision: PermissionDecision = 'allow';
    if (this.capabilities.permissions && !this.permissions.isAlwaysAllowed('edit_file')) {
      yield {
        type: 'permission_request',
        request: {
          id: generateId('part'),
          type: 'permission_request',
          toolCallId,
          toolName: 'edit_file',
          input: toolInput,
        },
      };
      decision = await this.permissions.waitForPermission(toolCallId);
      if (this.signal.aborted) return;
      if (decision === 'allow_always') this.permissions.rememberAlwaysAllowed('edit_file');
    }

    if (decision === 'deny') {
      const result: ToolResultPart = {
        id: generateId('part'),
        type: 'tool_result',
        toolCallId,
        status: 'error',
        output: '사용자가 실행을 거부했습니다.',
        isError: true,
      };
      yield { type: 'tool_result', result };
      yield* this.text('\n알겠습니다. 파일 수정을 중단했습니다. 다른 방법이 필요하면 말씀해 주세요.');
      return;
    }

    await sleep(this.delayMs * 4, this.signal);
    if (this.signal.aborted) return;
    const result: ToolResultPart = {
      id: generateId('part'),
      type: 'tool_result',
      toolCallId,
      status: 'ok',
      output: { edited: 'src/greeting.ts', replacements: 1 },
    };
    yield { type: 'tool_result', result };

    if (this.capabilities.diffs) {
      const diff: DiffPart = {
        id: generateId('part'),
        type: 'diff',
        path: 'src/greeting.ts',
        patch: [
          '--- a/src/greeting.ts',
          '+++ b/src/greeting.ts',
          '@@ -1 +1 @@',
          "-export const greeting = 'hello';",
          "+export const greeting = 'hello, conduit!';",
        ].join('\n'),
        additions: 1,
        deletions: 1,
        changeKind: 'modify',
      };
      yield { type: 'diff', messageId, part: diff };
    }

    if (this.capabilities.todos) {
      yield* this.todoUpdate([
        { id: 'todo_1', text: '대상 파일 분석', status: 'done' },
        { id: 'todo_2', text: 'edit_file로 코드 수정', status: 'done' },
        { id: 'todo_3', text: '변경 사항 요약', status: 'done' },
      ]);
    }

    yield* this.text(
      '\n`src/greeting.ts`의 인사말을 갱신했습니다(+1 / -1). ' +
        'diff를 확인하시고, 마음에 들지 않으면 이 턴으로 revert 하실 수 있습니다.',
    );
  }

  private async *planScenario(): AsyncIterable<AgentEvent> {
    yield* this.reasoning(
      'Plan 모드다. 코드를 건드리지 말고 실행 계획만 세워 승인 요청하자. ' +
        '단계를 작게 나누고 검증 방법을 포함한다.',
    );
    const plan: PlanPart = {
      id: generateId('part'),
      type: 'plan',
      markdown: [
        `# 실행 계획: ${truncate(this.input.text, 40)}`,
        '',
        '1. **분석** — 관련 모듈과 의존성 파악',
        '2. **구현** — 최소 변경으로 요구사항 충족',
        '3. **검증** — 타입체크 + 단위 테스트',
        '',
        '승인하시면 execute 모드에서 실행합니다.',
      ].join('\n'),
    };
    yield { type: 'plan', messageId: this.messageId, part: plan };
    yield* this.text('계획을 세웠습니다. 검토 후 승인해 주세요.');
  }

  private async *citationScenario(): AsyncIterable<AgentEvent> {
    yield* this.text('관련 자료를 찾았습니다. 아래 출처를 참고하세요.\n');
    yield {
      type: 'citation',
      messageId: this.messageId,
      part: {
        id: generateId('part'),
        type: 'citation',
        title: 'Headless UI 패턴',
        url: 'https://www.example.com/headless-ui',
        snippet: '로직과 마크업을 분리하면 하나의 코어로 어떤 디자인이든 조립할 수 있다.',
      },
    };
    yield {
      type: 'citation',
      messageId: this.messageId,
      part: {
        id: generateId('part'),
        type: 'citation',
        title: 'Conductor 대화 인터페이스',
        url: 'https://conductor.build',
        snippet: '체크포인트, plan 모드, diff 중심 리뷰 흐름의 레퍼런스.',
      },
    };
    yield* this.text('\n두 출처 모두 이 라이브러리의 설계에 반영되어 있습니다.');
  }

  private async *errorScenario(): AsyncIterable<AgentEvent> {
    yield* this.text('요청을 처리하는 중입니다');
    await sleep(this.delayMs * 2, this.signal);
    if (this.signal.aborted) return;
    yield {
      type: 'error',
      messageId: this.messageId,
      error: {
        id: generateId('part'),
        type: 'error',
        message: '모의 프로바이더 오류: 업스트림 연결이 끊어졌습니다.',
        code: 'mock_upstream_disconnected',
        retryable: true,
      },
    };
  }

  // ── 공통 방출 헬퍼 ──────────────────────────────────────────────────────

  private async *reasoning(text: string): AsyncIterable<AgentEvent> {
    if (!this.capabilities.reasoning.supported) return;
    const { messageId } = this;
    const partId = generateId('part');
    const visibility = this.capabilities.reasoning.visibility === 'summary' ? 'summary' : 'full';
    yield {
      type: 'part_start',
      messageId,
      part: { id: partId, type: 'reasoning', text: '', visibility },
    };
    for (const chunk of chunkString(text, 8)) {
      if (this.signal.aborted) return;
      await sleep(this.delayMs, this.signal);
      yield { type: 'reasoning_delta', messageId, partId, delta: chunk };
    }
    yield { type: 'part_end', messageId, partId };
  }

  private async *text(text: string): AsyncIterable<AgentEvent> {
    const { messageId } = this;
    const partId = generateId('part');
    yield { type: 'part_start', messageId, part: { id: partId, type: 'text', text: '' } };
    for (const chunk of chunkString(text, 6)) {
      if (this.signal.aborted) return;
      await sleep(this.delayMs, this.signal);
      yield { type: 'text_delta', messageId, partId, delta: chunk };
    }
    yield { type: 'part_end', messageId, partId };
  }

  private async *todoUpdate(items: TodoItem[]): AsyncIterable<AgentEvent> {
    const part: TodoPart = { id: generateId('part'), type: 'todo', items };
    yield { type: 'todo_update', messageId: this.messageId, part };
  }

  private async *finishTurn(stopReason: 'end_turn'): AsyncIterable<AgentEvent> {
    const { messageId } = this;
    if (this.capabilities.usage) {
      const outputTokens = 120 + this.input.text.length;
      yield {
        type: 'usage',
        messageId,
        usage: {
          inputTokens: 40 + this.input.text.length,
          outputTokens,
          reasoningTokens: this.capabilities.reasoning.supported ? 64 : undefined,
          totalTokens: 160 + this.input.text.length * 2,
          costUsd: this.capabilities.cost ? Number((outputTokens * 0.00002).toFixed(5)) : undefined,
        },
      };
    }
    yield {
      type: 'checkpoint',
      turnId: 'mock', // 스토어가 실제 턴 id로 정규화한다.
      label: truncate(this.input.text, 30),
    };
    yield { type: 'message_end', messageId, stopReason };
    yield { type: 'turn_end', turnId: 'mock' };
  }
}

function chunkString(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`;
}
