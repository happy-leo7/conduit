import {
  Children,
  cloneElement,
  isValidElement,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';

type AnyProps = Record<string, unknown>;

function composeRefs<T>(...refs: (Ref<T> | undefined)[]): Ref<T> {
  return (node: T) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node);
      else if (ref && typeof ref === 'object') (ref as { current: T | null }).current = node;
    }
  };
}

/** 이벤트 핸들러는 둘 다 호출(자식 먼저), 나머지는 자식 props가 우선. */
function mergeProps(slotProps: AnyProps, childProps: AnyProps): AnyProps {
  const merged: AnyProps = { ...slotProps };
  for (const [key, childValue] of Object.entries(childProps)) {
    const slotValue = merged[key];
    if (/^on[A-Z]/.test(key) && typeof slotValue === 'function' && typeof childValue === 'function') {
      merged[key] = (...args: unknown[]) => {
        (childValue as (...a: unknown[]) => void)(...args);
        (slotValue as (...a: unknown[]) => void)(...args);
      };
    } else if (key === 'className' && slotValue && childValue) {
      merged[key] = `${String(slotValue)} ${String(childValue)}`;
    } else if (childValue !== undefined) {
      merged[key] = childValue;
    }
  }
  return merged;
}

export interface SlotProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

/**
 * asChild 구현체 — 자기 DOM을 만들지 않고 유일한 자식 엘리먼트에
 * props/ref를 병합한다(Radix Slot 패턴).
 */
export function Slot(props: SlotProps): ReactNode {
  const { children, ...slotProps } = props;
  const child = Children.only(children);
  if (!isValidElement(child)) {
    throw new Error('conduit: asChild는 단일 React 엘리먼트 자식이 필요합니다.');
  }
  const childProps = child.props as AnyProps;
  const childRef =
    (childProps.ref as Ref<unknown> | undefined) ??
    (child as ReactElement & { ref?: Ref<unknown> }).ref;
  const slotRef = (slotProps as AnyProps).ref as Ref<unknown> | undefined;
  const merged = mergeProps(slotProps as AnyProps, childProps);
  merged.ref = childRef || slotRef ? composeRefs(slotRef, childRef) : undefined;
  return cloneElement(child, merged);
}
