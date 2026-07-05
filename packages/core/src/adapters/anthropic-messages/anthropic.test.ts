import { describe, expect, it } from 'vitest';
import type { AgentEvent, Message } from '../../types';
import { createAnthropicMessagesTransport } from './index';

function sse(events: { event: string; data: unknown }[]): string {
  return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');
}

function fakeFetch(body: string, capture?: { request?: unknown }): typeof fetch {
  return async (_url, init) => {
    if (capture && init?.body) capture.request = JSON.parse(init.body as string);
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
}

async function collect(iterable: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

const STREAM = sse([
  {
    event: 'message_start',
    data: {
      type: 'message_start',
      message: { id: 'msg_api', model: 'claude-fable-5', usage: { input_tokens: 12 } },
    },
  },
  {
    event: 'content_block_start',
    data: { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
  },
  {
    event: 'content_block_delta',
    data: {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'thinking_delta', thinking: '요청 분석 중' },
    },
  },
  { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
  {
    event: 'content_block_start',
    data: { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
  },
  {
    event: 'content_block_delta',
    data: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '안녕' } },
  },
  {
    event: 'content_block_delta',
    data: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '하세요' } },
  },
  { event: 'content_block_stop', data: { type: 'content_block_stop', index: 1 } },
  {
    event: 'content_block_start',
    data: {
      type: 'content_block_start',
      index: 2,
      content_block: { type: 'tool_use', id: 'toolu_1', name: 'edit_file' },
    },
  },
  {
    event: 'content_block_delta',
    data: {
      type: 'content_block_delta',
      index: 2,
      delta: { type: 'input_json_delta', partial_json: '{"path":' },
    },
  },
  {
    event: 'content_block_delta',
    data: {
      type: 'content_block_delta',
      index: 2,
      delta: { type: 'input_json_delta', partial_json: '"a.ts"}' },
    },
  },
  { event: 'content_block_stop', data: { type: 'content_block_stop', index: 2 } },
  {
    event: 'message_delta',
    data: {
      type: 'message_delta',
      delta: { stop_reason: 'tool_use' },
      usage: { output_tokens: 25 },
    },
  },
  { event: 'message_stop', data: { type: 'message_stop' } },
]);

function userMessage(text: string): Message {
  return {
    id: 'u1',
    role: 'user',
    parts: [{ id: 'p1', type: 'text', text }],
    status: 'complete',
    createdAt: 0,
    turnId: 't1',
  };
}

describe('anthropic-messages 어댑터', () => {
  it('SSE 스트림을 정규화 이벤트로 매핑한다', async () => {
    const transport = createAnthropicMessagesTransport({
      endpoint: '/api/anthropic',
      fetch: fakeFetch(STREAM),
    });
    const events = await collect(
      transport.send({ text: '안녕', history: [userMessage('안녕')] }, new AbortController().signal),
    );

    const types = events.map((e) => e.type);
    expect(types).toEqual([
      'turn_start',
      'message_start',
      'usage',
      'part_start', // thinking
      'reasoning_delta',
      'part_end',
      'part_start', // text
      'text_delta',
      'text_delta',
      'part_end',
      'part_start', // tool_use
      'tool_input_delta',
      'tool_input_delta',
      'tool_input_ready',
      'part_end',
      'usage',
      'message_end',
      'turn_end',
    ]);

    // 부분 JSON이 완성 입력으로 파싱된다
    const ready = events.find((e) => e.type === 'tool_input_ready');
    expect(ready).toMatchObject({ input: { path: 'a.ts' } });

    // usage는 증분으로 방출된다 (input 12, output 25)
    const usages = events.filter((e) => e.type === 'usage');
    expect(usages[0]).toMatchObject({ usage: { inputTokens: 12 } });
    expect(usages[1]).toMatchObject({ usage: { outputTokens: 25 } });

    // stop_reason 매핑
    expect(events.find((e) => e.type === 'message_end')).toMatchObject({ stopReason: 'tool_use' });

    // thinking 블록은 reasoning 파트가 된다
    const reasoningStart = events.find(
      (e) => e.type === 'part_start' && e.part.type === 'reasoning',
    );
    expect(reasoningStart).toBeDefined();
  });

  it('히스토리를 Anthropic 메시지 형식으로 변환하고 thinking 파라미터를 매핑한다', async () => {
    const capture: { request?: unknown } = {};
    const transport = createAnthropicMessagesTransport({
      endpoint: '/api/anthropic',
      fetch: fakeFetch(STREAM, capture),
    });
    const history: Message[] = [
      userMessage('버그 고쳐줘'),
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { id: 'p1', type: 'reasoning', text: '생각', visibility: 'full' },
          { id: 'p2', type: 'text', text: '고치겠습니다' },
          {
            id: 'p3',
            type: 'tool_call',
            toolCallId: 'toolu_0',
            name: 'edit_file',
            input: { path: 'b.ts' },
            state: 'complete',
          },
          { id: 'p4', type: 'tool_result', toolCallId: 'toolu_0', status: 'ok', output: 'ok' },
        ],
        status: 'complete',
        createdAt: 0,
        turnId: 't1',
      },
    ];
    await collect(
      transport.send(
        { text: '버그 고쳐줘', history, reasoningEffort: 'high', model: 'claude-fable-5' },
        new AbortController().signal,
      ),
    );

    const request = capture.request as {
      model: string;
      thinking: { budget_tokens: number };
      messages: { role: string; content: { type: string }[] }[];
    };
    expect(request.model).toBe('claude-fable-5');
    expect(request.thinking).toMatchObject({ budget_tokens: 8192 });
    // user → assistant(text+tool_use) → user(tool_result) 순서
    expect(request.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    const assistantBlocks = request.messages[1]!.content.map((b) => b.type);
    expect(assistantBlocks).toEqual(['text', 'tool_use']); // reasoning은 재전송하지 않음
    expect(request.messages[2]!.content[0]).toMatchObject({ type: 'tool_result' });
  });

  it('SSE error 이벤트를 ErrorPart로 매핑한다', async () => {
    const transport = createAnthropicMessagesTransport({
      endpoint: '/api/anthropic',
      fetch: fakeFetch(
        sse([
          {
            event: 'error',
            data: { type: 'error', error: { type: 'overloaded_error', message: '과부하' } },
          },
        ]),
      ),
    });
    const events = await collect(
      transport.send({ text: 'x', history: [userMessage('x')] }, new AbortController().signal),
    );
    expect(events.find((e) => e.type === 'error')).toMatchObject({
      error: { message: '과부하', code: 'overloaded_error', retryable: true },
    });
  });

  it('HTTP 실패 시 예외를 던진다(스토어가 ErrorPart로 변환)', async () => {
    const transport = createAnthropicMessagesTransport({
      endpoint: '/api/anthropic',
      fetch: async () => new Response('nope', { status: 500 }),
    });
    await expect(
      collect(transport.send({ text: 'x', history: [] }, new AbortController().signal)),
    ).rejects.toThrow(/500/);
  });
});
