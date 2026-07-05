import type { AgentEvent } from './events';
import type { Capabilities, ReasoningEffort } from './capabilities';
import type { Message } from './message';
import type { FilePart, PermissionDecision } from './parts';

export type SessionMode = 'plan' | 'execute';

export interface SendInput {
  text: string;
  attachments?: FilePart[];
  mode?: SessionMode;
  reasoningEffort?: ReasoningEffort;
  fastMode?: boolean;
  model?: string;
  /** 스토어가 항상 전체 히스토리를 전달한다(방금 추가된 user 메시지 포함). */
  history: Message[];
}

/**
 * AgentTransport — 프로바이더 어댑터가 구현하는 공통 인터페이스.
 *
 * 계약:
 * - send()는 정규화 AgentEvent의 async 이터러블을 반환한다. 프로바이더 형식이
 *   이 경계를 넘어 새어나가서는 안 된다.
 * - signal이 abort되면 이터레이션을 즉시 종료해야 한다(에러 throw 불필요).
 * - 선택 메서드는 대응하는 capability가 true일 때만 정의한다.
 */
export interface AgentTransport {
  capabilities: Capabilities;
  send(input: SendInput, signal: AbortSignal): AsyncIterable<AgentEvent>;
  /** permission 승인 응답. capabilities.permissions가 true일 때만 정의. */
  respondToPermission?(toolCallId: string, decision: PermissionDecision): void | Promise<void>;
  /** 해당 턴 직전 상태로 외부 사이드이펙트(코드 변경 등)를 되돌린다. capabilities.checkpoints가 true일 때만 정의. */
  revertToTurn?(turnId: string): void | Promise<void>;
}
