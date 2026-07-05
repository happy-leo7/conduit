import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefCallback,
  type UIEvent,
} from 'react';
import { useSessionSelector } from './useSessionSelector';

const PIN_THRESHOLD_PX = 32;

export interface ThreadContainerProps {
  ref: RefCallback<HTMLElement>;
  role: 'log';
  'aria-live': 'polite';
  onScroll: (event: UIEvent<HTMLElement>) => void;
}

export interface ThreadView {
  getThreadProps: () => ThreadContainerProps;
  /** 바닥 고정 여부. 사용자가 위로 스크롤하면 해제, 바닥 근처로 오면 복원. */
  isPinned: boolean;
  scrollToBottom: () => void;
}

/**
 * 메시지 리스트 auto-scroll 로직. 새 콘텐츠가 오면 바닥에 고정하되,
 * 사용자가 위로 스크롤하면 고정을 해제한다(Conductor 동작).
 */
export function useThread(): ThreadView {
  const elementRef = useRef<HTMLElement | null>(null);
  const pinnedRef = useRef(true);
  const [isPinned, setIsPinned] = useState(true);
  const messages = useSessionSelector((s) => s.messages);

  const scrollToBottom = useCallback(() => {
    const element = elementRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, []);

  useEffect(() => {
    if (pinnedRef.current) scrollToBottom();
  }, [messages, scrollToBottom]);

  const onScroll = useCallback((event: UIEvent<HTMLElement>) => {
    const element = event.currentTarget;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    const pinned = distanceFromBottom < PIN_THRESHOLD_PX;
    if (pinnedRef.current !== pinned) {
      pinnedRef.current = pinned;
      setIsPinned(pinned);
    }
  }, []);

  const ref = useCallback<RefCallback<HTMLElement>>((element) => {
    elementRef.current = element;
  }, []);

  const getThreadProps = useCallback(
    (): ThreadContainerProps => ({
      ref,
      role: 'log',
      'aria-live': 'polite',
      onScroll,
    }),
    [ref, onScroll],
  );

  return { getThreadProps, isPinned, scrollToBottom };
}
