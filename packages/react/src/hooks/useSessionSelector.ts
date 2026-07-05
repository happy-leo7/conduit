import type { SessionState } from '@conduit/core';
import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useSessionStore } from '../context/AgentSessionProvider';

/**
 * 세션 상태의 부분 구독. 셀렉터 결과가 (isEqual 기준으로) 같으면 이전 참조를
 * 돌려주어 재렌더를 막는다 — 파트 단위 스트리밍 업데이트가 리스트 전체를
 * 다시 그리지 않는 근거.
 */
export function useSessionSelector<T>(
  selector: (state: SessionState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const store = useSessionStore();
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;
  const cacheRef = useRef<{ state: SessionState; value: T } | null>(null);

  const getSnapshot = useCallback(() => {
    const state = store.getState();
    const cached = cacheRef.current;
    if (cached && cached.state === state) return cached.value;
    const value = selectorRef.current(state);
    if (cached && isEqualRef.current(cached.value, value)) {
      cacheRef.current = { state, value: cached.value };
      return cached.value;
    }
    cacheRef.current = { state, value };
    return value;
  }, [store]);

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

/** 얕은 배열/객체 비교 — 파생 배열 셀렉터에 사용. */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const aKeys = Object.keys(a) as (keyof typeof a)[];
  const bKeys = Object.keys(b) as (keyof typeof b)[];
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.is(a[key], (b as Record<string, unknown>)[key]));
}
