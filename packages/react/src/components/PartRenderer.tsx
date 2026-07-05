import type { Part, PartType } from '@conduit/core';
import { createElement, type ComponentType, type ReactNode } from 'react';

/** 파트 type → 소비자 렌더러 매핑(레지스트리 패턴). */
export type PartComponents = {
  [K in PartType]?: ComponentType<{ part: Extract<Part, { type: K }> }>;
};

export interface PartRendererProps {
  part: Part;
  parts: PartComponents;
  /** 미등록 type의 처리. 지정하지 않으면 조용히 무시(null). */
  fallback?: ComponentType<{ part: Part }>;
}

/**
 * 파트 type에 따라 등록된 렌더러로 분기한다. 알 수 없는/미등록 type은
 * 크래시 없이 무시된다 — 프로바이더가 새 파트를 방출해도 UI는 안전하다.
 */
export function PartRenderer({ part, parts, fallback }: PartRendererProps): ReactNode {
  const Component = parts[part.type] as ComponentType<{ part: Part }> | undefined;
  if (Component) return createElement(Component, { part });
  if (fallback) return createElement(fallback, { part });
  return null;
}
