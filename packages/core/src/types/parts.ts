/**
 * 정규화 도메인 모델 — UI가 소비하는 유일한 메시지/파트 표현.
 *
 * 프로바이더 payload는 어댑터(transport) 계층에서 이 모델로 변환된다.
 * UI/스토어 코드는 특정 프로바이더 형식을 절대 알지 못한다.
 */

export type Role = 'user' | 'assistant' | 'system' | 'tool';

export interface BasePart {
  id: string;
}

export interface TextPart extends BasePart {
  type: 'text';
  text: string;
}

/** thinking/사고 토큰. 프로바이더가 요약본 또는 비공개(redacted)만 줄 수 있다. */
export interface ReasoningPart extends BasePart {
  type: 'reasoning';
  text: string;
  visibility: 'full' | 'summary' | 'redacted';
  /** 프로바이더가 서명을 주면 보존한다(재전송 시 필요할 수 있음). */
  signature?: string;
}

export type ToolCallState =
  | 'streaming-input'
  | 'input-ready'
  | 'executing'
  | 'complete'
  | 'error';

export interface ToolCallPart extends BasePart {
  type: 'tool_call';
  toolCallId: string;
  name: string;
  /** 완성된 파싱 입력. input-ready 이전에는 undefined. */
  input: unknown;
  /** 스트리밍 중 부분 JSON 텍스트 누적본. */
  inputTextDelta?: string;
  state: ToolCallState;
}

export interface ToolResultPart extends BasePart {
  type: 'tool_result';
  toolCallId: string;
  status: 'ok' | 'error';
  /** 문자열/구조화 데이터/파일 참조 가능. */
  output: unknown;
  isError?: boolean;
}

export type PermissionDecision = 'allow' | 'allow_always' | 'deny';

/** 실행 승인 요청(human-in-the-loop). 응답 후 decision이 채워진다. */
export interface PermissionRequestPart extends BasePart {
  type: 'permission_request';
  toolCallId: string;
  toolName: string;
  input: unknown;
  decision?: PermissionDecision;
}

/** Plan Mode 산출물. */
export interface PlanPart extends BasePart {
  type: 'plan';
  markdown: string;
  approved?: boolean;
}

export type TodoStatus = 'pending' | 'in_progress' | 'done' | 'cancelled';

export interface TodoItem {
  id: string;
  text: string;
  status: TodoStatus;
}

export interface TodoPart extends BasePart {
  type: 'todo';
  items: TodoItem[];
}

export type DiffChangeKind = 'create' | 'modify' | 'delete' | 'rename';

/** 파일 변경(diff/patch) — 코딩 에이전트 특화 1급 파트. */
export interface DiffPart extends BasePart {
  type: 'diff';
  path: string;
  /** 이름 변경 시 원래 경로. */
  oldPath?: string;
  /** unified diff */
  patch: string;
  additions: number;
  deletions: number;
  changeKind: DiffChangeKind;
}

export interface CitationPart extends BasePart {
  type: 'citation';
  title?: string;
  url?: string;
  snippet?: string;
}

export interface ErrorPart extends BasePart {
  type: 'error';
  message: string;
  code?: string;
  retryable?: boolean;
}

/** 이미지/첨부 등 입력·출력 파일 참조. */
export interface FilePart extends BasePart {
  type: 'file';
  mimeType: string;
  name?: string;
  url?: string;
  dataRef?: string;
}

/** 파트는 discriminated union — `type`으로 분기한다. */
export type Part =
  | TextPart
  | ReasoningPart
  | ToolCallPart
  | ToolResultPart
  | PermissionRequestPart
  | PlanPart
  | TodoPart
  | DiffPart
  | CitationPart
  | ErrorPart
  | FilePart;

export type PartType = Part['type'];
