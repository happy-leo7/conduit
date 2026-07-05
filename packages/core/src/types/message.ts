import type { Part, Role } from './parts';

export type MessageStatus = 'streaming' | 'complete' | 'error' | 'aborted';

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  costUsd?: number;
}

export interface MessageMeta {
  model?: string;
  usage?: Usage;
}

export interface Message {
  id: string;
  role: Role;
  /** 순서 보존. */
  parts: Part[];
  status: MessageStatus;
  createdAt: number;
  /** checkpoint/리버트 단위. */
  turnId: string;
  meta?: MessageMeta;
}

export type StopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'tool_use'
  | 'stop_sequence'
  | 'aborted'
  | 'error';
