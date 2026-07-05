import type {
  CitationPart,
  DiffPart,
  ErrorPart,
  Part,
  PermissionRequestPart,
  PlanPart,
  Role,
  TodoPart,
  ToolResultPart,
} from './parts';
import type { MessageMeta, StopReason, Usage } from './message';

/**
 * 정규화 스트리밍 이벤트 — 어댑터(transport)가 방출하고 스토어가 리듀스한다.
 *
 * 이것이 프로바이더 독립성의 계약이다: 어떤 프로바이더든 이 이벤트 스트림으로
 * 변환되며, UI는 이벤트를 직접 다루지 않고 리듀스된 상태만 본다.
 */
export type AgentEvent =
  | { type: 'turn_start'; turnId: string }
  | { type: 'message_start'; messageId: string; role: Role; meta?: MessageMeta }
  /** 빈 파트 생성. 이후 *_delta 이벤트가 내용을 채운다. */
  | { type: 'part_start'; messageId: string; part: Part }
  | { type: 'text_delta'; messageId: string; partId: string; delta: string }
  | { type: 'reasoning_delta'; messageId: string; partId: string; delta: string }
  | { type: 'tool_input_delta'; messageId: string; partId: string; delta: string }
  | { type: 'tool_input_ready'; messageId: string; partId: string; input: unknown }
  | { type: 'tool_result'; result: ToolResultPart }
  | { type: 'permission_request'; request: PermissionRequestPart }
  | { type: 'plan'; messageId: string; part: PlanPart }
  | { type: 'todo_update'; messageId: string; part: TodoPart }
  | { type: 'diff'; messageId: string; part: DiffPart }
  | { type: 'citation'; messageId: string; part: CitationPart }
  | { type: 'usage'; messageId: string; usage: Usage }
  | { type: 'part_end'; messageId: string; partId: string }
  | { type: 'message_end'; messageId: string; stopReason: StopReason }
  | { type: 'turn_end'; turnId: string }
  | { type: 'error'; error: ErrorPart; messageId?: string }
  | { type: 'checkpoint'; turnId: string; label?: string };

export type AgentEventType = AgentEvent['type'];
