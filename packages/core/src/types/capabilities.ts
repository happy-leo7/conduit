/**
 * Capabilities — 프로바이더별 기능 차이를 드러내는 유일한 통로.
 *
 * 어댑터는 이 객체를 정적으로 선언하고, UI는 `설정값 ∧ capability`가 참일 때만
 * 해당 기능을 활성화한다(판정은 resolveFeature 단일 출처).
 */

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';

export interface ModelInfo {
  id: string;
  label: string;
}

export interface Capabilities {
  providerId: string;
  models: ModelInfo[];
  reasoning: { supported: boolean; visibility: 'full' | 'summary' | 'hidden' };
  reasoningEffort: { supported: boolean; levels: ReasoningEffort[] };
  planMode: boolean;
  fastMode: boolean;
  toolUse: boolean;
  streamingToolInput: boolean;
  /** human-in-the-loop 승인 흐름 */
  permissions: boolean;
  attachments: { supported: boolean; mimeTypes: string[] };
  images: boolean;
  diffs: boolean;
  todos: boolean;
  citations: boolean;
  /** 턴 리버트 */
  checkpoints: boolean;
  usage: boolean;
  cost: boolean;
  /** 스트리밍 중 중단 */
  interrupt: boolean;
  multiModelCompare: boolean;
}
