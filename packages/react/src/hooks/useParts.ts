import type { CitationPart, DiffPart, TodoItem, TodoPart } from '@conduit/core';
import { shallowEqual, useSessionSelector } from './useSessionSelector';

export interface TodosView {
  /** 세션에서 가장 최근의 todo 목록(제자리 갱신됨). */
  items: TodoItem[];
  part: TodoPart | undefined;
}

/** 세션의 최신 todo 목록. */
export function useTodos(): TodosView {
  return useSessionSelector(
    (s) => {
      let latest: TodoPart | undefined;
      for (const message of s.messages) {
        for (const part of message.parts) {
          if (part.type === 'todo') latest = part;
        }
      }
      return { items: latest?.items ?? [], part: latest };
    },
    (a, b) => a.part === b.part,
  );
}

export interface DiffEntry {
  messageId: string;
  turnId: string;
  part: DiffPart;
}

/** 세션 전체의 diff 파트 목록(메시지/턴 위치 포함) — diff-우선 리뷰 흐름용. */
export function useDiffs(): DiffEntry[] {
  return useSessionSelector(
    (s) => {
      const entries: DiffEntry[] = [];
      for (const message of s.messages) {
        for (const part of message.parts) {
          if (part.type === 'diff') {
            entries.push({ messageId: message.id, turnId: message.turnId, part });
          }
        }
      }
      return entries;
    },
    (a, b) => a.length === b.length && a.every((entry, i) => entry.part === b[i]?.part),
  );
}

/** 특정 메시지의 citation 파트 목록. */
export function useCitations(messageId: string): CitationPart[] {
  return useSessionSelector((s) => {
    const message = s.messages.find((m) => m.id === messageId);
    return (message?.parts.filter((p) => p.type === 'citation') ?? []) as CitationPart[];
  }, shallowEqual);
}
