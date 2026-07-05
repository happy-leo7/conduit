import type { AgentUIConfig, Capabilities, FeatureName, FeatureToggle } from '../types';

/**
 * 기능 판정 결과.
 * - visible: UI에 노출할지 (숨김 vs 렌더)
 * - enabled: 실제 동작 가능 여부 (visible이어도 미지원이면 disabled로 노출)
 * - supported: 프로바이더 capability 원본 값
 */
export interface ResolvedFeature {
  visible: boolean;
  enabled: boolean;
  supported: boolean;
}

/**
 * 기능 활성화 판정의 단일 출처(single source of truth).
 *
 * - true   → 강제 노출. 단 미지원이면 enabled=false (비활성 상태로 노출만)
 * - false  → 숨김
 * - 'auto' → capability를 따름 (기본값)
 */
export function resolveFeature(
  toggle: FeatureToggle | undefined,
  supported: boolean,
): ResolvedFeature {
  const t = toggle ?? 'auto';
  if (t === false) return { visible: false, enabled: false, supported };
  if (t === true) return { visible: true, enabled: supported, supported };
  return { visible: supported, enabled: supported, supported };
}

/** FeatureName → capability 매핑. capability 해석이 흩어지지 않도록 여기에만 둔다. */
export function getFeatureSupport(name: FeatureName, caps: Capabilities): boolean {
  switch (name) {
    case 'reasoning':
      return caps.reasoning.supported && caps.reasoning.visibility !== 'hidden';
    case 'reasoningEffort':
      return caps.reasoningEffort.supported;
    case 'toolCalls':
      return caps.toolUse;
    case 'streamingToolInput':
      return caps.streamingToolInput;
    case 'permissions':
      return caps.permissions;
    case 'planMode':
      return caps.planMode;
    case 'fastMode':
      return caps.fastMode;
    case 'todos':
      return caps.todos;
    case 'diffs':
      return caps.diffs;
    case 'citations':
      return caps.citations;
    case 'usage':
      return caps.usage;
    case 'cost':
      return caps.cost;
    case 'checkpoints':
      return caps.checkpoints;
    case 'modelSelector':
      return caps.models.length > 0;
    case 'attachments':
      return caps.attachments.supported;
    case 'multiModelCompare':
      return caps.multiModelCompare;
  }
}

/** config × capabilities를 합성한 최종 판정. UI 훅(useFeature)은 이것만 호출한다. */
export function resolveFeatureFor(
  name: FeatureName,
  config: AgentUIConfig | undefined,
  caps: Capabilities,
): ResolvedFeature {
  return resolveFeature(config?.features?.[name], getFeatureSupport(name, caps));
}
