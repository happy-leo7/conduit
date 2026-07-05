import { generateId, type FilePart } from '@conduit/core';
import {
  useCallback,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useSessionStore } from '../context/AgentSessionProvider';
import { useCapabilities, useFeature } from './useCapabilities';
import { useSessionSelector } from './useSessionSelector';

export interface ComposerInputProps {
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
  'aria-label': string;
  'aria-multiline': true;
  disabled: boolean;
}

export interface ComposerFormProps {
  onSubmit: (event: FormEvent) => void;
}

export interface Composer {
  value: string;
  setValue: (value: string) => void;
  attachments: FilePart[];
  /** capabilities.attachments.mimeTypes를 벗어나는 파일은 조용히 거부하고 false를 반환. */
  addAttachment: (attachment: Omit<FilePart, 'id' | 'type'> & { id?: string }) => boolean;
  removeAttachment: (id: string) => void;
  attachmentsEnabled: boolean;
  acceptedMimeTypes: string[];
  canSubmit: boolean;
  /** 스트리밍/승인 대기 중 = 전송 잠금. */
  isBusy: boolean;
  submit: () => Promise<void>;
  stop: () => void;
  getInputProps: () => ComposerInputProps;
  getFormProps: () => ComposerFormProps;
}

/**
 * 입력창 상태 관리. Enter=전송, Shift+Enter=줄바꿈.
 * prop getter는 접근성 속성과 키 핸들러만 담는다 — 스타일 없음.
 */
export function useComposer(): Composer {
  const store = useSessionStore();
  const capabilities = useCapabilities();
  const attachmentsFeature = useFeature('attachments');
  const status = useSessionSelector((s) => s.status);

  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<FilePart[]>([]);

  const isBusy = status === 'submitting' || status === 'streaming' || status === 'awaiting-permission';
  const canSubmit = !isBusy && (value.trim().length > 0 || attachments.length > 0);

  const submit = useCallback(async () => {
    if (isBusy) return;
    const text = value;
    const files = attachments;
    if (text.trim().length === 0 && files.length === 0) return;
    setValue('');
    setAttachments([]);
    await store.send({ text, attachments: files.length > 0 ? files : undefined });
  }, [store, value, attachments, isBusy]);

  const addAttachment: Composer['addAttachment'] = useCallback(
    (attachment) => {
      if (!attachmentsFeature.enabled) return false;
      const accepted = capabilities.attachments.mimeTypes;
      if (accepted.length > 0 && !accepted.includes(attachment.mimeType)) return false;
      setAttachments((prev) => [
        ...prev,
        { ...attachment, type: 'file', id: attachment.id ?? generateId('file') },
      ]);
      return true;
    },
    [attachmentsFeature.enabled, capabilities.attachments.mimeTypes],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const getInputProps = useCallback(
    (): ComposerInputProps => ({
      value,
      onChange: (event) => setValue(event.target.value),
      onKeyDown: (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault();
          void submit();
        }
      },
      'aria-label': '메시지 입력',
      'aria-multiline': true,
      disabled: false, // 스트리밍 중에도 입력은 가능, 전송만 잠근다
    }),
    [value, submit],
  );

  const getFormProps = useCallback(
    (): ComposerFormProps => ({
      onSubmit: (event) => {
        event.preventDefault();
        void submit();
      },
    }),
    [submit],
  );

  return useMemo(
    () => ({
      value,
      setValue,
      attachments,
      addAttachment,
      removeAttachment,
      attachmentsEnabled: attachmentsFeature.enabled,
      acceptedMimeTypes: capabilities.attachments.mimeTypes,
      canSubmit,
      isBusy,
      submit,
      stop: store.stop,
      getInputProps,
      getFormProps,
    }),
    [
      value,
      attachments,
      addAttachment,
      removeAttachment,
      attachmentsFeature.enabled,
      capabilities.attachments.mimeTypes,
      canSubmit,
      isBusy,
      submit,
      store.stop,
      getInputProps,
      getFormProps,
    ],
  );
}
