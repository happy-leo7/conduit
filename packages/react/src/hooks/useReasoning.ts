import type { ReasoningPart } from '@conduit/core';
import { shallowEqual, useSessionSelector } from './useSessionSelector';

export interface ReasoningView {
  /** 메시지 내 모든 reasoning 파트를 순서대로 이어붙인 텍스트. */
  text: string;
  visibility: ReasoningPart['visibility'] | undefined;
  isStreaming: boolean;
  parts: ReasoningPart[];
}

/** 메시지의 thinking/reasoning 뷰. */
export function useReasoning(messageId: string): ReasoningView {
  return useSessionSelector(
    (s) => {
      const message = s.messages.find((m) => m.id === messageId);
      const parts = (message?.parts.filter((p) => p.type === 'reasoning') ??
        []) as ReasoningPart[];
      return {
        text: parts.map((p) => p.text).join(''),
        visibility: parts[0]?.visibility,
        isStreaming: parts.some((p) => s.streamingPartIds[p.id] === true),
        parts,
      };
    },
    (a, b) =>
      a.text === b.text &&
      a.visibility === b.visibility &&
      a.isStreaming === b.isStreaming &&
      shallowEqual(a.parts, b.parts),
  );
}
