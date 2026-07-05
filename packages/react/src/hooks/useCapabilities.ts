import {
  resolveFeatureFor,
  type Capabilities,
  type FeatureName,
  type ResolvedFeature,
} from '@conduit/core';
import { useAgentSessionContext } from '../context/AgentSessionProvider';

/** 현재 transport의 capability 선언. */
export function useCapabilities(): Capabilities {
  return useAgentSessionContext().store.transport.capabilities;
}

/**
 * 기능 노출/활성 판정 — config.features × capabilities.
 * 계산은 core의 resolveFeature 단일 출처에 위임한다.
 */
export function useFeature(name: FeatureName): ResolvedFeature {
  const { store, config } = useAgentSessionContext();
  return resolveFeatureFor(name, config, store.transport.capabilities);
}
