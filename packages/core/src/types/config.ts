import type { ReasoningEffort } from './capabilities';
import type { SessionMode } from './transport';

/**
 * 'auto'(기본값) = 프로바이더 capability를 따른다.
 * true = 강제 on — 단, 미지원 프로바이더에서는 "비활성 상태로 노출"된다.
 * false = 강제 off(숨김).
 */
export type FeatureToggle = boolean | 'auto';

/**
 * 선택 기능 이름. 필수 기능(text, streaming, send, stop)은 토글 대상이 아니며
 * 항상 켜져 있다.
 */
export type FeatureName =
  | 'reasoning'
  | 'reasoningEffort'
  | 'toolCalls'
  | 'streamingToolInput'
  | 'permissions'
  | 'planMode'
  | 'fastMode'
  | 'todos'
  | 'diffs'
  | 'citations'
  | 'usage'
  | 'cost'
  | 'checkpoints'
  | 'modelSelector'
  | 'attachments'
  | 'multiModelCompare';

export type FeatureToggles = Partial<Record<FeatureName, FeatureToggle>>;

export interface AgentUIConfig {
  features?: FeatureToggles;
  defaults?: {
    mode?: SessionMode;
    reasoningEffort?: ReasoningEffort;
    fastMode?: boolean;
    model?: string;
  };
}
