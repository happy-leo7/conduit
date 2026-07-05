import type { PermissionRequestPart } from '@conduit/core';
import { type HTMLAttributes, type ReactNode } from 'react';
import { usePermissionQueue } from '../hooks/usePermissionQueue';
import { Slot } from './Slot';

export interface PermissionPromptActions {
  request: PermissionRequestPart;
  allow: () => Promise<void>;
  allowAlways: () => Promise<void>;
  deny: () => Promise<void>;
}

export interface PermissionPromptProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  request: PermissionRequestPart;
  asChild?: boolean;
  children?: ReactNode | ((actions: PermissionPromptActions) => ReactNode);
}

/**
 * 실행 승인 프롬프트(allow / allow_always / deny).
 *
 * 주의: 이 컴포넌트는 permissions 기능 토글과 무관하게 렌더된다 — 승인 요청이
 * 이미 도착했다면 응답 수단을 숨기는 것은 세션 데드락이기 때문(DECISIONS.md).
 * 포커스 이동이 필요하면 useFocusTrap 훅을 조합한다.
 */
export function PermissionPrompt({
  request,
  asChild,
  children,
  ...rest
}: PermissionPromptProps): ReactNode {
  const { respond } = usePermissionQueue();
  const actions: PermissionPromptActions = {
    request,
    allow: () => respond(request.toolCallId, 'allow'),
    allowAlways: () => respond(request.toolCallId, 'allow_always'),
    deny: () => respond(request.toolCallId, 'deny'),
  };
  const content =
    typeof children === 'function' ? (
      children(actions)
    ) : (
      children ?? (
        <>
          <button type="button" onClick={() => void actions.allow()}>
            허용
          </button>
          <button type="button" onClick={() => void actions.allowAlways()}>
            항상 허용
          </button>
          <button type="button" onClick={() => void actions.deny()}>
            거부
          </button>
        </>
      )
    );
  const props = {
    role: 'alertdialog' as const,
    'aria-label': `${request.toolName} 실행 승인 요청`,
    'data-decided': request.decision !== undefined || undefined,
    ...rest,
  };
  if (asChild) return <Slot {...props}>{content}</Slot>;
  return <div {...props}>{content}</div>;
}
