import type { Checkpoint } from '@conduit/core';
import { useCallback, useMemo } from 'react';
import { useSessionStore } from '../context/AgentSessionProvider';
import { useSessionSelector } from './useSessionSelector';

export interface CheckpointsView {
  turns: Checkpoint[];
  canRevert: (turnId: string) => boolean;
  /**
   * 해당 턴 및 이후 히스토리를 영구 삭제한다(파괴적 — UI는 반드시 확인 단계를
   * 거칠 것. CheckpointControls는 onConfirmRevert를 강제한다).
   */
  revert: (turnId: string) => Promise<void>;
}

export function useCheckpoints(): CheckpointsView {
  const store = useSessionStore();
  const turns = useSessionSelector((s) => s.checkpoints);
  // canRevert는 status에도 의존하므로 상태 구독으로 재평가를 보장한다.
  const status = useSessionSelector((s) => s.status);

  const canRevert = useCallback(
    (turnId: string) => store.canRevert(turnId),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- status 변경 시 재평가
    [store, status, turns],
  );
  const revert = useCallback((turnId: string) => store.revertToTurn(turnId), [store]);

  return useMemo(() => ({ turns, canRevert, revert }), [turns, canRevert, revert]);
}
