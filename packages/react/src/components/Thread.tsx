import type { HTMLAttributes, ReactNode } from 'react';
import { useThread, type ThreadView } from '../hooks/useThread';
import { Slot } from './Slot';

export interface ThreadProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  asChild?: boolean;
  children?: ReactNode | ((view: ThreadView) => ReactNode);
}

/**
 * 메시지 리스트 컨테이너. auto-scroll(바닥 고정/사용자 스크롤 시 해제)과
 * role="log" · aria-live="polite"를 제공한다. DOM 구조는 강제하지 않는다.
 */
export function Thread({ asChild, children, ...rest }: ThreadProps): ReactNode {
  const view = useThread();
  const content = typeof children === 'function' ? children(view) : children;
  const props = { ...view.getThreadProps(), ...rest };
  if (asChild) return <Slot {...props}>{content}</Slot>;
  return <div {...props}>{content}</div>;
}
