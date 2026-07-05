import type { Usage } from '@conduit/core';
import { useSessionSelector } from './useSessionSelector';

export interface UsageView {
  /** 세션 누적(리버트와 무관한 실제 지출). */
  session: Usage;
  /** 턴별 usage. */
  byTurn: Record<string, Usage>;
}

/** 누적 토큰·비용. */
export function useUsage(): UsageView {
  const session = useSessionSelector((s) => s.sessionUsage);
  const byTurn = useSessionSelector((s) => s.turnUsage);
  return { session, byTurn };
}

/** 특정 턴의 usage. */
export function useTurnUsage(turnId: string): Usage | undefined {
  return useSessionSelector((s) => s.turnUsage[turnId]);
}
