import type { Message, Part } from '@conduit/core';
import { useSessionSelector } from './useSessionSelector';

/** 단일 메시지 구독 — 해당 메시지 객체가 교체될 때만 재렌더. */
export function useMessage(id: string): Message | undefined {
  return useSessionSelector((s) => s.messages.find((m) => m.id === id));
}

/** 단일 파트 구독 — 파트 단위 불변 업데이트 덕에 해당 파트 변경 시에만 재렌더. */
export function useMessagePart(partId: string): Part | undefined {
  return useSessionSelector((s) => {
    for (const message of s.messages) {
      for (const part of message.parts) {
        if (part.id === partId) return part;
      }
    }
    return undefined;
  });
}

/** 파트가 현재 스트리밍 중(part_start ~ part_end)인지. */
export function useIsPartStreaming(partId: string): boolean {
  return useSessionSelector((s) => s.streamingPartIds[partId] === true);
}
