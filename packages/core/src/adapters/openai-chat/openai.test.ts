import { describe, expect, it } from 'vitest';
import type { AgentEvent, Message } from '../../types';
import { createOpenAiChatTransport } from './index';

function dataLines(payloads: unknown[]): string {
  return payloads.map((p) => `data: ${typeof p === 'string' ? p : JSON.stringify(p)}\n\n`).join('');
}

async function collect(iterable: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

const STREAM = dataLines([
  { choices: [{ delta: { content: '안녕' }, finish_reason: null }] },
  { choices: [{ delta: { content: '하세요' }, finish_reason: null }] },
  {
    choices: [
      {
        delta: {
          tool_calls: [
            { index: 0, id: 'call_1', function: { name: 'edit_file', arguments: '{"pa' } },
          ],
        },
        finish_reason: null,
      },
    ],
  },
  {
    choices: [
      { delta: { tool_calls: [{ index: 0, function: { arguments: 'th":"a.ts"}' } }] }, finish_reason: null },
    ],
  },
  { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
  { choices: [], usage: { prompt_tokens: 9, completion_tokens: 17, total_tokens: 26 } },
  '[DONE]',
]);

describe('openai-chat 어댑터', () => {
  it('Chat Completions 스트림을 동일한 정규화 이벤트로 매핑한다', async () => {
    const transport = createOpenAiChatTransport({
      endpoint: '/api/openai',
      fetch: async () => new Response(STREAM, { status: 200 }),
    });
    const history: Message[] = [
      {
        id: 'u1',
        role: 'user',
        parts: [{ id: 'p1', type: 'text', text: '안녕' }],
        status: 'complete',
        createdAt: 0,
        turnId: 't1',
      },
    ];
    const events = await collect(
      transport.send({ text: '안녕', history }, new AbortController().signal),
    );

    const types = events.map((e) => e.type);
    expect(types).toEqual([
      'turn_start',
      'message_start',
      'part_start', // text
      'text_delta',
      'text_delta',
      'part_start', // tool_call
      'tool_input_delta',
      'tool_input_delta',
      'part_end', // text 마감
      'tool_input_ready',
      'part_end', // tool 마감
      'usage',
      'message_end',
      'turn_end',
    ]);

    expect(events.find((e) => e.type === 'tool_input_ready')).toMatchObject({
      input: { path: 'a.ts' },
    });
    expect(events.find((e) => e.type === 'usage')).toMatchObject({
      usage: { inputTokens: 9, outputTokens: 17, totalTokens: 26 },
    });
    expect(events.find((e) => e.type === 'message_end')).toMatchObject({
      stopReason: 'tool_use',
    });
  });
});
