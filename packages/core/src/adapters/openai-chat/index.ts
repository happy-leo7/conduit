import type {
  AgentEvent,
  AgentTransport,
  Capabilities,
  Message,
  ModelInfo,
  SendInput,
  StopReason,
} from '../../types';
import { generateId } from '../../utils/id';
import { parseSseStream } from '../../utils/sse';

/**
 * OpenAI Chat Completions(SSE) 어댑터.
 *
 * anthropic-messages 어댑터와 완전히 동일한 정규화 이벤트를 방출한다 —
 * 프로바이더를 바꿔도 UI/스토어 코드가 변하지 않음을 보이는 동형성 증명.
 * anthropic 어댑터와 마찬가지로 endpoint 프록시 + 주입 가능한 fetch를 가정한다.
 */
export interface OpenAiChatTransportOptions {
  endpoint: string;
  fetch?: typeof globalThis.fetch;
  headers?: Record<string, string>;
  models?: ModelInfo[];
}

const DEFAULT_MODELS: ModelInfo[] = [
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
];

export function createOpenAiChatTransport(options: OpenAiChatTransportOptions): AgentTransport {
  const fetchImpl = options.fetch ?? globalThis.fetch;

  const capabilities: Capabilities = {
    providerId: 'openai-chat',
    models: options.models ?? DEFAULT_MODELS,
    // Chat Completions는 reasoning 토큰을 노출하지 않는다(usage 집계에만 존재).
    reasoning: { supported: false, visibility: 'hidden' },
    reasoningEffort: { supported: false, levels: [] },
    planMode: false,
    fastMode: false,
    toolUse: true,
    streamingToolInput: true,
    permissions: false,
    attachments: { supported: true, mimeTypes: ['image/png', 'image/jpeg'] },
    images: true,
    diffs: false,
    todos: false,
    citations: false,
    checkpoints: false,
    usage: true,
    cost: false,
    interrupt: true,
    multiModelCompare: true,
  };

  async function* send(input: SendInput, signal: AbortSignal): AsyncIterable<AgentEvent> {
    const body = {
      model: input.model ?? capabilities.models[0]?.id,
      stream: true,
      stream_options: { include_usage: true },
      messages: toOpenAiMessages(input.history),
    };
    const response = await fetchImpl(options.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...options.headers },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`OpenAI 프록시 응답 실패: HTTP ${response.status}`);
    }
    yield* mapSseToEvents(response.body, signal);
  }

  return { capabilities, send };
}

// ── 히스토리 → OpenAI messages 변환 ────────────────────────────────────────

function toOpenAiMessages(history: Message[]): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  for (const message of history) {
    if (message.role === 'user') {
      const text = message.parts
        .filter((p) => p.type === 'text')
        .map((p) => (p.type === 'text' ? p.text : ''))
        .join('\n');
      if (text) result.push({ role: 'user', content: text });
      continue;
    }
    if (message.role !== 'assistant') continue;
    const text = message.parts
      .filter((p) => p.type === 'text')
      .map((p) => (p.type === 'text' ? p.text : ''))
      .join('');
    const toolCalls = message.parts.flatMap((p) =>
      p.type === 'tool_call' && (p.state === 'complete' || p.state === 'input-ready')
        ? [
            {
              id: p.toolCallId,
              type: 'function',
              function: { name: p.name, arguments: JSON.stringify(p.input ?? {}) },
            },
          ]
        : [],
    );
    if (text || toolCalls.length > 0) {
      result.push({
        role: 'assistant',
        content: text || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
    }
    for (const part of message.parts) {
      if (part.type === 'tool_result') {
        result.push({
          role: 'tool',
          tool_call_id: part.toolCallId,
          content: typeof part.output === 'string' ? part.output : JSON.stringify(part.output),
        });
      }
    }
  }
  return result;
}

// ── SSE → 정규화 이벤트 매핑 ───────────────────────────────────────────────

interface OpenToolCall {
  partId: string;
  toolCallId: string;
  argumentsAccumulator: string;
}

async function* mapSseToEvents(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncIterable<AgentEvent> {
  const messageId = generateId('msg');
  let textPartId: string | null = null;
  const toolCalls = new Map<number, OpenToolCall>();
  let started = false;
  let stopReason: StopReason = 'end_turn';

  function* closeToolCalls(): Iterable<AgentEvent> {
    for (const call of toolCalls.values()) {
      yield {
        type: 'tool_input_ready',
        messageId,
        partId: call.partId,
        input: safeJsonParse(call.argumentsAccumulator),
      };
      yield { type: 'part_end', messageId, partId: call.partId };
    }
    toolCalls.clear();
  }

  for await (const sse of parseSseStream(stream, signal)) {
    if (signal.aborted) return;
    if (sse.data === '[DONE]') break;
    if (!sse.data) continue;
    const data = JSON.parse(sse.data) as {
      choices?: {
        delta?: {
          content?: string | null;
          tool_calls?: {
            index: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }[];
        };
        finish_reason?: string | null;
      }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
    };

    if (!started) {
      started = true;
      yield { type: 'turn_start', turnId: generateId('turn') };
      yield { type: 'message_start', messageId, role: 'assistant' };
    }

    const choice = data.choices?.[0];
    const delta = choice?.delta;

    if (delta?.content) {
      if (!textPartId) {
        textPartId = generateId('part');
        yield { type: 'part_start', messageId, part: { id: textPartId, type: 'text', text: '' } };
      }
      yield { type: 'text_delta', messageId, partId: textPartId, delta: delta.content };
    }

    for (const toolDelta of delta?.tool_calls ?? []) {
      let open = toolCalls.get(toolDelta.index);
      if (!open) {
        open = {
          partId: generateId('part'),
          toolCallId: toolDelta.id ?? generateId('tool'),
          argumentsAccumulator: '',
        };
        toolCalls.set(toolDelta.index, open);
        yield {
          type: 'part_start',
          messageId,
          part: {
            id: open.partId,
            type: 'tool_call',
            toolCallId: open.toolCallId,
            name: toolDelta.function?.name ?? 'unknown',
            input: undefined,
            state: 'streaming-input',
          },
        };
      }
      const args = toolDelta.function?.arguments;
      if (args) {
        open.argumentsAccumulator += args;
        yield { type: 'tool_input_delta', messageId, partId: open.partId, delta: args };
      }
    }

    if (choice?.finish_reason) {
      stopReason = mapFinishReason(choice.finish_reason);
      if (textPartId) {
        yield { type: 'part_end', messageId, partId: textPartId };
        textPartId = null;
      }
      yield* closeToolCalls();
    }

    if (data.usage) {
      yield {
        type: 'usage',
        messageId,
        usage: {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
      };
    }
  }

  if (started) {
    if (textPartId) yield { type: 'part_end', messageId, partId: textPartId };
    yield* closeToolCalls();
    yield { type: 'message_end', messageId, stopReason };
    yield { type: 'turn_end', turnId: 'openai' }; // 스토어가 실제 턴 id로 정규화
  }
}

function mapFinishReason(reason: string): StopReason {
  switch (reason) {
    case 'stop':
      return 'end_turn';
    case 'length':
      return 'max_tokens';
    case 'tool_calls':
      return 'tool_use';
    default:
      return 'end_turn';
  }
}

function safeJsonParse(text: string): unknown {
  if (text.trim() === '') return {};
  try {
    return JSON.parse(text);
  } catch {
    return { __raw: text };
  }
}
