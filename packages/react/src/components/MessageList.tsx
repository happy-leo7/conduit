import type { Message } from '@conduit/core';
import {
  Fragment,
  createContext,
  useContext,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { useSessionSelector } from '../hooks/useSessionSelector';
import { Slot } from './Slot';

export interface MessageListProps {
  /** 역할별 렌더링은 소비자에게 위임된다 — 메시지마다 호출되는 render prop. */
  children: (message: Message, index: number) => ReactNode;
}

/** 래퍼 DOM 없이 메시지를 순서대로 렌더한다(key 자동 부여). */
export function MessageList({ children }: MessageListProps): ReactNode {
  const messages = useSessionSelector((s) => s.messages);
  return (
    <>
      {messages.map((message, index) => (
        <Fragment key={message.id}>{children(message, index)}</Fragment>
      ))}
    </>
  );
}

const MessageContext = createContext<Message | null>(null);

/** MessageItem 하위에서 현재 메시지에 접근한다. */
export function useMessageContext(): Message {
  const message = useContext(MessageContext);
  if (!message) {
    throw new Error('conduit: MessageItem 바깥에서 useMessageContext를 사용할 수 없습니다.');
  }
  return message;
}

export interface MessageItemProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  message: Message;
  asChild?: boolean;
  children?: ReactNode | ((message: Message) => ReactNode);
}

/**
 * 단일 메시지 경계. data-role/data-status 훅과 MessageContext를 제공한다.
 * 스트리밍 중인 assistant 메시지에는 aria-busy가 붙는다.
 */
export function MessageItem({ message, asChild, children, ...rest }: MessageItemProps): ReactNode {
  const content = typeof children === 'function' ? children(message) : children;
  const props = {
    'data-role': message.role,
    'data-status': message.status,
    'aria-busy': message.status === 'streaming' || undefined,
    ...rest,
  };
  return (
    <MessageContext.Provider value={message}>
      {asChild ? <Slot {...props}>{content}</Slot> : <div {...props}>{content}</div>}
    </MessageContext.Provider>
  );
}
