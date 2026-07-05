import type {
  ErrorPart,
  Message,
  ReasoningEffort,
  SessionMode,
  Usage,
} from '../types';

export type SessionStatus = 'idle' | 'submitting' | 'streaming' | 'awaiting-permission' | 'error';

/**
 * 턴 경계 스냅샷. 각 user 전송 직전에 생성되며 revert의 단위가 된다.
 * messageIndex는 이 턴의 user 메시지가 위치한 인덱스 — revert 시 여기서부터 잘라낸다.
 */
export interface Checkpoint {
  turnId: string;
  label?: string;
  messageIndex: number;
  createdAt: number;
}

/** 승인 대기 중인 permission 요청의 위치 정보. */
export interface PendingPermission {
  toolCallId: string;
  partId: string;
  messageId: string;
}

export interface SessionState {
  messages: Message[];
  status: SessionStatus;
  currentTurnId: string | null;
  mode: SessionMode;
  reasoningEffort: ReasoningEffort;
  fastMode: boolean;
  model: string | undefined;
  /**
   * 세션 누적 usage. revert해도 줄어들지 않는다 — 이미 발생한 실제 지출이므로.
   * (턴별 조회는 turnUsage 사용)
   */
  sessionUsage: Usage;
  turnUsage: Record<string, Usage>;
  checkpoints: Checkpoint[];
  pendingPermissions: PendingPermission[];
  /** 현재 스트리밍 중(part_start ~ part_end 사이)인 파트 id 집합. */
  streamingPartIds: Record<string, true>;
  lastError: ErrorPart | null;
}

export interface InitialSessionOptions {
  mode?: SessionMode;
  reasoningEffort?: ReasoningEffort;
  fastMode?: boolean;
  model?: string;
}

export function createInitialState(options: InitialSessionOptions = {}): SessionState {
  return {
    messages: [],
    status: 'idle',
    currentTurnId: null,
    mode: options.mode ?? 'execute',
    reasoningEffort: options.reasoningEffort ?? 'medium',
    fastMode: options.fastMode ?? false,
    model: options.model,
    sessionUsage: {},
    turnUsage: {},
    checkpoints: [],
    pendingPermissions: [],
    streamingPartIds: {},
    lastError: null,
  };
}
