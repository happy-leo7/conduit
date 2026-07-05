import {
  createContext,
  useContext,
  type ButtonHTMLAttributes,
  type FormHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import type { FilePart } from '@conduit/core';
import { useComposer, type Composer as ComposerState } from '../hooks/useComposer';
import { Slot } from './Slot';

const ComposerContext = createContext<ComposerState | null>(null);

export function useComposerContext(): ComposerState {
  const context = useContext(ComposerContext);
  if (!context) {
    throw new Error('conduit: Composer 바깥에서 Composer.* 컴포넌트를 사용할 수 없습니다.');
  }
  return context;
}

export interface ComposerRootProps
  extends Omit<FormHTMLAttributes<HTMLFormElement>, 'children' | 'onSubmit'> {
  asChild?: boolean;
  children?: ReactNode | ((composer: ComposerState) => ReactNode);
}

function ComposerRoot({ asChild, children, ...rest }: ComposerRootProps): ReactNode {
  const composer = useComposer();
  const content = typeof children === 'function' ? children(composer) : children;
  const props = { ...composer.getFormProps(), ...rest };
  return (
    <ComposerContext.Provider value={composer}>
      {asChild ? <Slot {...props}>{content}</Slot> : <form {...props}>{content}</form>}
    </ComposerContext.Provider>
  );
}

export interface ComposerInputProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'onKeyDown'> {
  asChild?: boolean;
  children?: ReactNode;
}

/** Enter=전송 / Shift+Enter=줄바꿈. IME 조합 중 Enter는 무시된다. */
function ComposerInput({ asChild, children, ...rest }: ComposerInputProps): ReactNode {
  const composer = useComposerContext();
  const props = { ...composer.getInputProps(), ...rest };
  if (asChild) return <Slot {...props}>{children}</Slot>;
  return <textarea {...props} />;
}

export interface ComposerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

/** 전송 버튼. Composer form의 submit으로 동작한다. */
function ComposerSubmit({ asChild, children, ...rest }: ComposerButtonProps): ReactNode {
  const composer = useComposerContext();
  const props = {
    type: 'submit' as const,
    disabled: !composer.canSubmit,
    'aria-label': rest['aria-label'] ?? '전송',
    ...rest,
  };
  if (asChild) return <Slot {...props}>{children}</Slot>;
  return <button {...props}>{children ?? '전송'}</button>;
}

/** 스트리밍 중단 버튼. 스트리밍 중이 아닐 때는 비활성. */
function ComposerStop({ asChild, children, ...rest }: ComposerButtonProps): ReactNode {
  const composer = useComposerContext();
  const props = {
    type: 'button' as const,
    onClick: () => composer.stop(),
    disabled: !composer.isBusy,
    'aria-label': rest['aria-label'] ?? '중단',
    ...rest,
  };
  if (asChild) return <Slot {...props}>{children}</Slot>;
  return <button {...props}>{children ?? '중단'}</button>;
}

export interface ComposerAttachmentsProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  children: (attachment: FilePart, remove: () => void) => ReactNode;
}

/** 첨부 목록 렌더링(래퍼 DOM 없음). */
function ComposerAttachments({ children }: ComposerAttachmentsProps): ReactNode {
  const composer = useComposerContext();
  return (
    <>
      {composer.attachments.map((attachment) => (
        <ComposerAttachmentItem key={attachment.id} attachment={attachment}>
          {children}
        </ComposerAttachmentItem>
      ))}
    </>
  );
}

function ComposerAttachmentItem({
  attachment,
  children,
}: {
  attachment: FilePart;
  children: (attachment: FilePart, remove: () => void) => ReactNode;
}): ReactNode {
  const composer = useComposerContext();
  return children(attachment, () => composer.removeAttachment(attachment.id));
}

export const Composer = Object.assign(ComposerRoot, {
  Input: ComposerInput,
  Submit: ComposerSubmit,
  Stop: ComposerStop,
  Attachments: ComposerAttachments,
});
