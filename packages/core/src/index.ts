// 도메인 모델 · 이벤트 · capabilities · config
export * from './types';

// 기능 판정 (단일 출처)
export {
  resolveFeature,
  resolveFeatureFor,
  getFeatureSupport,
  type ResolvedFeature,
} from './features/resolveFeature';

// 세션 스토어
export {
  createSessionStore,
  type SessionStore,
  type SessionCommand,
  type SendOptions,
  type CreateSessionStoreOptions,
} from './store/sessionStore';
export {
  createInitialState,
  type SessionState,
  type SessionStatus,
  type Checkpoint,
  type PendingPermission,
} from './store/state';
export {
  reduceEvent,
  applyPermissionDecision,
  applyRevert,
  finalizeAbortedMessages,
  finalizeDanglingStream,
} from './store/reducer';

// 어댑터
export {
  createMockTransport,
  MOCK_FULL_CAPABILITIES,
  MOCK_BASIC_CAPABILITIES,
  type MockTransport,
  type MockTransportOptions,
} from './adapters/mock';
export {
  createAnthropicMessagesTransport,
  type AnthropicMessagesTransportOptions,
} from './adapters/anthropic-messages';
export {
  createOpenAiChatTransport,
  type OpenAiChatTransportOptions,
} from './adapters/openai-chat';

// 유틸
export { generateId } from './utils/id';
export { sleep, createDeferred, type Deferred } from './utils/async';
export { addUsage, formatTokens, formatCost } from './utils/usage';
export { parseSseStream, type SseMessage } from './utils/sse';
