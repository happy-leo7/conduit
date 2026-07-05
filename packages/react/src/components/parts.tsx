import type { CitationPart, DiffPart, PlanPart, TodoItem, TodoPart } from '@conduit/core';
import type { HTMLAttributes, ReactNode } from 'react';
import { useCitations, useTodos } from '../hooks/useParts';
import { Slot } from './Slot';

export interface PlanViewProps extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'part'> {
  part: PlanPart;
  asChild?: boolean;
  /** markdown 렌더러는 소비자 몫 — render prop으로 원문을 받는다. */
  children?: ReactNode | ((part: PlanPart) => ReactNode);
}

export function PlanView({ part, asChild, children, ...rest }: PlanViewProps): ReactNode {
  const content =
    typeof children === 'function' ? children(part) : (children ?? <pre>{part.markdown}</pre>);
  const props = {
    'data-part': 'plan',
    'data-approved': part.approved || undefined,
    ...rest,
  };
  if (asChild) return <Slot {...props}>{content}</Slot>;
  return <div {...props}>{content}</div>;
}

export interface TodoListProps extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'part'> {
  /** 지정하지 않으면 세션의 최신 todo 목록(useTodos)을 사용한다. */
  part?: TodoPart;
  asChild?: boolean;
  children?: ReactNode | ((items: TodoItem[]) => ReactNode);
}

export function TodoList({ part, asChild, children, ...rest }: TodoListProps): ReactNode {
  const latest = useTodos();
  const items = part?.items ?? latest.items;
  const content =
    typeof children === 'function' ? (
      children(items)
    ) : (
      children ?? (
        <ul>
          {items.map((item) => (
            <li key={item.id} data-status={item.status}>
              {item.text}
            </li>
          ))}
        </ul>
      )
    );
  const props = { 'data-part': 'todo', role: 'list' as const, ...rest };
  if (asChild) return <Slot {...props}>{content}</Slot>;
  return <div {...props}>{content}</div>;
}

export interface DiffViewProps extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'part'> {
  part: DiffPart;
  asChild?: boolean;
  children?: ReactNode | ((part: DiffPart) => ReactNode);
}

export function DiffView({ part, asChild, children, ...rest }: DiffViewProps): ReactNode {
  const content =
    typeof children === 'function' ? children(part) : (children ?? <pre>{part.patch}</pre>);
  const props = {
    'data-part': 'diff',
    'data-path': part.path,
    'data-change-kind': part.changeKind,
    'data-additions': part.additions,
    'data-deletions': part.deletions,
    ...rest,
  };
  if (asChild) return <Slot {...props}>{content}</Slot>;
  return <div {...props}>{content}</div>;
}

export interface CitationsProps extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'part'> {
  messageId: string;
  asChild?: boolean;
  children?: ReactNode | ((citations: CitationPart[]) => ReactNode);
}

export function Citations({ messageId, asChild, children, ...rest }: CitationsProps): ReactNode {
  const citations = useCitations(messageId);
  if (citations.length === 0) return null;
  const content =
    typeof children === 'function' ? (
      children(citations)
    ) : (
      children ?? (
        <ul>
          {citations.map((citation) => (
            <li key={citation.id}>
              <a href={citation.url}>{citation.title ?? citation.url}</a>
            </li>
          ))}
        </ul>
      )
    );
  const props = { 'data-part': 'citations', ...rest };
  if (asChild) return <Slot {...props}>{content}</Slot>;
  return <div {...props}>{content}</div>;
}
