import {
  createSessionStore,
  type AgentTransport,
  type AgentUIConfig,
  type SessionStore,
} from '@conduit/core';
import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';

export interface AgentSessionContextValue {
  store: SessionStore;
  config: AgentUIConfig;
}

const AgentSessionContext = createContext<AgentSessionContextValue | null>(null);

export interface AgentSessionProviderProps {
  transport: AgentTransport;
  config?: AgentUIConfig;
  /** 외부에서 만든 스토어를 주입할 때(SSR, 다중 뷰 공유 등). transport보다 우선. */
  store?: SessionStore;
  children: ReactNode;
}

/**
 * 세션 경계. transport가 바뀌면 새 세션 스토어가 생성된다(대화 초기화).
 * config.features는 스토어 재생성 없이 실시간으로 반영된다 — 기능 토글은
 * 이 컨텍스트를 통해 훅/컴포넌트에 전달되기 때문.
 *
 * 멀티모델 비교는 이 Provider를 여러 개 나란히 두는 것으로 구성한다.
 */
export function AgentSessionProvider({
  transport,
  config,
  store: injectedStore,
  children,
}: AgentSessionProviderProps): ReactNode {
  const storeRef = useRef<{ transport: AgentTransport; store: SessionStore } | null>(null);
  if (injectedStore) {
    storeRef.current = { transport: injectedStore.transport, store: injectedStore };
  } else if (!storeRef.current || storeRef.current.transport !== transport) {
    storeRef.current = {
      transport,
      store: createSessionStore({ transport, config }),
    };
  }
  const store = storeRef.current.store;

  const value = useMemo<AgentSessionContextValue>(
    () => ({ store, config: config ?? store.config }),
    [store, config],
  );

  return <AgentSessionContext.Provider value={value}>{children}</AgentSessionContext.Provider>;
}

export function useAgentSessionContext(): AgentSessionContextValue {
  const context = useContext(AgentSessionContext);
  if (!context) {
    throw new Error('conduit: AgentSessionProvider 바깥에서 세션 훅을 사용할 수 없습니다.');
  }
  return context;
}

/** 현재 세션의 스토어 인스턴스. */
export function useSessionStore(): SessionStore {
  return useAgentSessionContext().store;
}
