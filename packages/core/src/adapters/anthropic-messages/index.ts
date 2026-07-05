import type {
  AgentEvent,
  AgentTransport,
  Capabilities,
  Message,
  ModelInfo,
  ReasoningEffort,
  SendInput,
  StopReason,
} from '../../types';
import { generateId } from '../../utils/id';
import { parseSseStream } from '../../utils/sse';

/**
 * Anthropic Messages API(SSE) 어댑터.
 *
 * 브라우저에서 API 키를 직접 노출하지 않도록 실제 호출은 endpoint 프록시로
 * 추상화한다 — 이 어댑터는 프록시가 Messages API와 동일한 SSE를 중계한다고
 * 가정한다. fetch도 주입 가능해 테스트에서 네트워크 없이 검증한다.
 */
export interface AnthropicMessagesTransportOptions {
  /** Messages API를 중계하는 프록시 URL (예: '/api/anthropic/v1/messages'). */
  endpoint: string;
  fetch?: typeof globalThis.fetch;
  headers?: Record<string, string>;
  models?: ModelInfo[];
  maxTokens?: number;
}

const DEFAULT_MODELS: ModelInfo[] = [
  { id: 'claude-fable-5', label: 'Claude Fable 5' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
];

/** 통합 effort 레벨 → Anthropic thinking budget_tokens 변환. */
const EFFORT_BUDGET: Record<ReasoningEffort, number> = {
  low: 1024,
  medium: 4096,
  high: 8192,
  xhigh: 12288,
};

export function createAnthropicMessagesTransport(
  options: AnthropicMessagesTransportOptions,
): AgentTransport {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const maxTokens = options.maxTokens ?? 16384;

  const capabilities: Capabilities = {
    providerId: 'anthropic-messages',
    models: options.models ?? DEFAULT_MODELS,
    reasoning: { supported: true, visibility: 'full' },
    reasoningEffort: { supported: true, levels: ['low', 'medium', 'high', 'xhigh'] },
    planMode: false,
    fastMode: false,
    toolUse: true,
    streamingToolInput: true,
    permissions: false,
    attachments: { supported: true, mimeTypes: ['image/png', 'image/jpeg', 'image/webp'] },
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
    const body: Record<string, unknown> = {
      model: input.model ?? capabilities.models[0]?.id,
      max_tokens: maxTokens,
      stream: true,
      messages: toAnthropicMessages(input.history),
    };
    if (input.reasoningEffort) {
      body.thinking = { type: 'enabled', budget_tokens: EFFORT_BUDGET[input.reasoningEffort] };
    }

    const response = await fetchImpl(options.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...options.headers },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`Anthropic 프록시 응답 실패: HTTP ${response.status}`);
    }

    yield* mapSseToEvents(response.body, signal);
  }

  return { capabilities, send };
}

// ── 히스토리 → Anthropic messages 변환 ─────────────────────────────────────

type AnthropicContentBlock = Record<string, unknown>;
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: AnthropicContentBlock[];
}

function toAnthropicMessages(history: Message[]): AnthropicMessage[] {
  const result: AnthropicMessage[] = [];
  for (const message of history) {
    if (message.role === 'system') continue;
    const blocks: AnthropicContentBlock[] = [];
    const toolResults: AnthropicContentBlock[] = [];
    for (const part of message.parts) {
      switch (part.type) {
        case 'text':
          if (part.text.length > 0) blocks.push({ type: 'text', text: part.text });
          break;
        case 'tool_call':
          if (part.state === 'complete' || part.state === 'input-ready') {
            blocks.push({ type: 'tool_use', id: part.toolCallId, name: part.name, input: part.input ?? {} });
          }
          break;
        case 'tool_result':
          toolResults.push({
            type: 'tool_result',
            tool_use_id: part.toolCallId,
            content: typeof part.output === 'string' ? part.output : JSON.stringify(part.output),
            is_error: part.status === 'error',
          });
          break;
        case 'file':
          if (part.url && part.mimeType.startsWith('image/')) {
            blocks.push({ type: 'image', source: { type: 'url', url: part.url } });
          }
          break;
        default:
          // reasoning/plan/todo/diff/citation/permission/error는 재전송 대상이 아니다.
          break;
      }
    }
    if (blocks.length > 0) {
      result.push({ role: message.role === 'assistant' ? 'assistant' : 'user', content: blocks });
    }
    // Anthropic 규약: tool_result는 다음 user 메시지의 블록이어야 한다.
    if (toolResults.length > 0) {
      result.push({ role: 'user', content: toolResults });
    }
  }
  return result;
}

// ── SSE → 정규화 이벤트 매핑 ───────────────────────────────────────────────

interface OpenBlock {
  partId: string;
  kind: 'text' | 'reasoning' | 'tool_call';
  jsonAccumulator: string;
}

async function* mapSseToEvents(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncIterable<AgentEvent> {
  const messageId = generateId('msg');
  const openBlocks = new Map<number, OpenBlock>();
  let stopReason: StopReason = 'end_turn';
  // Anthropic의 message_delta usage는 누적 스냅샷 — 정규화 계약(증분)으로 변환한다.
  let reportedOutputTokens = 0;

  for await (const sse of parseSseStream(stream, signal)) {
    if (signal.aborted) return;
    if (!sse.data) continue;
    const data = JSON.parse(sse.data) as Record<string, unknown>;
    const type = (data.type as string) ?? sse.event;

    switch (type) {
      case 'message_start': {
        const message = data.message as
          | { model?: string; usage?: { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } }
          | undefined;
        yield { type: 'turn_start', turnId: generateId('turn') };
        yield {
          type: 'message_start',
          messageId,
          role: 'assistant',
          meta: { model: message?.model },
        };
        if (message?.usage) {
          yield {
            type: 'usage',
            messageId,
            usage: {
              inputTokens: message.usage.input_tokens,
              cacheReadTokens: message.usage.cache_read_input_tokens,
              cacheWriteTokens: message.usage.cache_creation_input_tokens,
            },
          };
        }
        break;
      }

      case 'content_block_start': {
        const index = data.index as number;
        const block = data.content_block as { type: string; id?: string; name?: string };
        const partId = generateId('part');
        if (block.type === 'text') {
          openBlocks.set(index, { partId, kind: 'text', jsonAccumulator: '' });
          yield { type: 'part_start', messageId, part: { id: partId, type: 'text', text: '' } };
        } else if (block.type === 'thinking' || block.type === 'redacted_thinking') {
          openBlocks.set(index, { partId, kind: 'reasoning', jsonAccumulator: '' });
          yield {
            type: 'part_start',
            messageId,
            part: {
              id: partId,
              type: 'reasoning',
              text: '',
              visibility: block.type === 'redacted_thinking' ? 'redacted' : 'full',
            },
          };
        } else if (block.type === 'tool_use') {
          openBlocks.set(index, { partId, kind: 'tool_call', jsonAccumulator: '' });
          yield {
            type: 'part_start',
            messageId,
            part: {
              id: partId,
              type: 'tool_call',
              toolCallId: block.id ?? generateId('tool'),
              name: block.name ?? 'unknown',
              input: undefined,
              state: 'streaming-input',
            },
          };
        }
        break;
      }

      case 'content_block_delta': {
        const index = data.index as number;
        const open = openBlocks.get(index);
        if (!open) break;
        const delta = data.delta as {
          type: string;
          text?: string;
          thinking?: string;
          partial_json?: string;
        };
        if (delta.type === 'text_delta' && delta.text) {
          yield { type: 'text_delta', messageId, partId: open.partId, delta: delta.text };
        } else if (delta.type === 'thinking_delta' && delta.thinking) {
          yield { type: 'reasoning_delta', messageId, partId: open.partId, delta: delta.thinking };
        } else if (delta.type === 'input_json_delta' && delta.partial_json !== undefined) {
          open.jsonAccumulator += delta.partial_json;
          yield {
            type: 'tool_input_delta',
            messageId,
            partId: open.partId,
            delta: delta.partial_json,
          };
        }
        // signature_delta는 UI 표시 대상이 아니므로 무시한다(DECISIONS.md 참고).
        break;
      }

      case 'content_block_stop': {
        const index = data.index as number;
        const open = openBlocks.get(index);
        if (!open) break;
        if (open.kind === 'tool_call') {
          yield {
            type: 'tool_input_ready',
            messageId,
            partId: open.partId,
            input: safeJsonParse(open.jsonAccumulator),
          };
        }
        yield { type: 'part_end', messageId, partId: open.partId };
        openBlocks.delete(index);
        break;
      }

      case 'message_delta': {
        const delta = data.delta as { stop_reason?: string } | undefined;
        const usage = data.usage as { output_tokens?: number } | undefined;
        if (delta?.stop_reason) stopReason = mapStopReason(delta.stop_reason);
        if (usage?.output_tokens !== undefined) {
          const increment = usage.output_tokens - reportedOutputTokens;
          reportedOutputTokens = usage.output_tokens;
          if (increment > 0) {
            yield { type: 'usage', messageId, usage: { outputTokens: increment } };
          }
        }
        break;
      }

      case 'message_stop': {
        yield { type: 'message_end', messageId, stopReason };
        yield { type: 'turn_end', turnId: 'anthropic' }; // 스토어가 실제 턴 id로 정규화
        break;
      }

      case 'error': {
        const error = data.error as { type?: string; message?: string } | undefined;
        yield {
          type: 'error',
          messageId,
          error: {
            id: generateId('part'),
            type: 'error',
            message: error?.message ?? '알 수 없는 프로바이더 오류',
            code: error?.type,
            retryable: error?.type === 'overloaded_error' || error?.type === 'api_error',
          },
        };
        break;
      }

      case 'ping':
      default:
        break;
    }
  }
}

function mapStopReason(reason: string): StopReason {
  switch (reason) {
    case 'end_turn':
    case 'max_tokens':
    case 'tool_use':
    case 'stop_sequence':
      return reason;
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
