import {
  formatCost,
  formatTokens,
  type Message,
  type ModelInfo,
  type ReasoningEffort,
  type SessionMode,
  type Usage,
} from '@conduit/core';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useAgentSession } from '../hooks/useAgentSession';
import { useCapabilities, useFeature } from '../hooks/useCapabilities';
import { useCheckpoints } from '../hooks/useCheckpoints';
import { useTurnUsage, useUsage } from '../hooks/useUsage';
import { Slot } from './Slot';

/*
 * 모든 컨트롤의 공통 규칙:
 * - useFeature 판정이 visible=false면 null (숨김)
 * - visible=true·enabled=false면 비활성 상태로 노출 (미지원 프로바이더에서 강제 on)
 */

export interface ModelSelectorView {
  models: ModelInfo[];
  model: string | undefined;
  setModel: (model: string) => void;
  enabled: boolean;
}

export interface ModelSelectorProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'value' | 'onChange'> {
  children?: (view: ModelSelectorView) => ReactNode;
}

export function ModelSelector({ children, ...rest }: ModelSelectorProps): ReactNode {
  const feature = useFeature('modelSelector');
  const capabilities = useCapabilities();
  const { model, setModel } = useAgentSession();
  if (!feature.visible) return null;
  const view: ModelSelectorView = {
    models: capabilities.models,
    model,
    setModel,
    enabled: feature.enabled,
  };
  if (children) return children(view);
  return (
    <select
      aria-label="모델 선택"
      value={model ?? ''}
      onChange={(event) => setModel(event.target.value)}
      disabled={!feature.enabled}
      {...rest}
    >
      {capabilities.models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}

export interface ReasoningEffortControlView {
  levels: ReasoningEffort[];
  effort: ReasoningEffort;
  setEffort: (effort: ReasoningEffort) => void;
  enabled: boolean;
}

export interface ReasoningEffortControlProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'value' | 'onChange'> {
  children?: (view: ReasoningEffortControlView) => ReactNode;
}

export function ReasoningEffortControl({
  children,
  ...rest
}: ReasoningEffortControlProps): ReactNode {
  const feature = useFeature('reasoningEffort');
  const capabilities = useCapabilities();
  const { reasoningEffort, setReasoningEffort } = useAgentSession();
  if (!feature.visible) return null;
  const view: ReasoningEffortControlView = {
    levels: capabilities.reasoningEffort.levels,
    effort: reasoningEffort,
    setEffort: setReasoningEffort,
    enabled: feature.enabled,
  };
  if (children) return children(view);
  return (
    <select
      aria-label="reasoning effort"
      value={reasoningEffort}
      onChange={(event) => setReasoningEffort(event.target.value as ReasoningEffort)}
      disabled={!feature.enabled}
      {...rest}
    >
      {(view.levels.length > 0 ? view.levels : [reasoningEffort]).map((level) => (
        <option key={level} value={level}>
          {level}
        </option>
      ))}
    </select>
  );
}

export interface ModeToggleView {
  mode: SessionMode;
  setMode: (mode: SessionMode) => void;
  toggle: () => void;
  enabled: boolean;
}

export interface ModeToggleProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  asChild?: boolean;
  children?: ReactNode | ((view: ModeToggleView) => ReactNode);
}

/** plan/execute 전환. aria-pressed는 plan 모드 여부를 나타낸다. */
export function ModeToggle({ asChild, children, ...rest }: ModeToggleProps): ReactNode {
  const feature = useFeature('planMode');
  const { mode, setMode } = useAgentSession();
  if (!feature.visible) return null;
  const view: ModeToggleView = {
    mode,
    setMode,
    toggle: () => setMode(mode === 'plan' ? 'execute' : 'plan'),
    enabled: feature.enabled,
  };
  const content =
    typeof children === 'function' ? children(view) : (children ?? `모드: ${mode}`);
  const props = {
    type: 'button' as const,
    onClick: view.toggle,
    disabled: !feature.enabled,
    'aria-pressed': mode === 'plan',
    'aria-label': 'Plan 모드 전환',
    ...rest,
  };
  if (asChild) return <Slot {...props}>{content}</Slot>;
  return <button {...props}>{content}</button>;
}

export interface FastModeToggleView {
  fastMode: boolean;
  setFastMode: (fastMode: boolean) => void;
  toggle: () => void;
  enabled: boolean;
}

export interface FastModeToggleProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  asChild?: boolean;
  children?: ReactNode | ((view: FastModeToggleView) => ReactNode);
}

export function FastModeToggle({ asChild, children, ...rest }: FastModeToggleProps): ReactNode {
  const feature = useFeature('fastMode');
  const { fastMode, setFastMode } = useAgentSession();
  if (!feature.visible) return null;
  const view: FastModeToggleView = {
    fastMode,
    setFastMode,
    toggle: () => setFastMode(!fastMode),
    enabled: feature.enabled,
  };
  const content =
    typeof children === 'function' ? children(view) : (children ?? 'Fast');
  const props = {
    type: 'button' as const,
    onClick: view.toggle,
    disabled: !feature.enabled,
    'aria-pressed': fastMode,
    'aria-label': 'Fast 모드 전환',
    ...rest,
  };
  if (asChild) return <Slot {...props}>{content}</Slot>;
  return <button {...props}>{content}</button>;
}

export interface UsageBadgeView {
  usage: Usage | undefined;
  model: string | undefined;
  formattedTokens: string;
  formattedCost: string;
  showCost: boolean;
}

export interface UsageBadgeProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** 지정하면 해당 턴의 usage, 없으면 세션 누적. */
  turnId?: string;
  /** 턴 메타데이터(model 표기)용 메시지. */
  message?: Message;
  asChild?: boolean;
  children?: ReactNode | ((view: UsageBadgeView) => ReactNode);
}

/** model · tokens · cost 표시. 값과 포맷 헬퍼만 제공하고 표현은 소비자 몫. */
export function UsageBadge({
  turnId,
  message,
  asChild,
  children,
  ...rest
}: UsageBadgeProps): ReactNode {
  const usageFeature = useFeature('usage');
  const costFeature = useFeature('cost');
  const { session } = useUsage();
  const turn = useTurnUsage(turnId ?? '');
  if (!usageFeature.visible) return null;
  const usage = turnId ? turn : session;
  const totalTokens =
    usage?.totalTokens ?? (usage ? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0) : undefined);
  const view: UsageBadgeView = {
    usage,
    model: message?.meta?.model,
    formattedTokens: formatTokens(totalTokens),
    formattedCost: formatCost(usage?.costUsd),
    showCost: costFeature.enabled && usage?.costUsd !== undefined,
  };
  const content =
    typeof children === 'function' ? (
      children(view)
    ) : (
      children ?? (
        <>
          {view.model ? `${view.model} · ` : ''}
          {view.formattedTokens} tokens
          {view.showCost ? ` · ${view.formattedCost}` : ''}
        </>
      )
    );
  const props = { 'data-part': 'usage', ...rest };
  if (asChild) return <Slot {...props}>{content}</Slot>;
  return <span {...props}>{content}</span>;
}

export interface CheckpointControlsView {
  turnId: string;
  canRevert: boolean;
  requestRevert: () => Promise<void>;
}

export interface CheckpointControlsProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  message: Message;
  /**
   * revert는 이후 히스토리를 영구 삭제하는 파괴적 동작이다.
   * 반드시 확인 콜백을 거친다 — true를 반환해야 실제로 되돌린다.
   */
  onConfirmRevert: (context: { turnId: string; message: Message }) => boolean | Promise<boolean>;
  asChild?: boolean;
  children?: ReactNode | ((view: CheckpointControlsView) => ReactNode);
}

export function CheckpointControls({
  message,
  onConfirmRevert,
  asChild,
  children,
  ...rest
}: CheckpointControlsProps): ReactNode {
  const feature = useFeature('checkpoints');
  const { canRevert, revert } = useCheckpoints();
  if (!feature.visible) return null;
  const turnId = message.turnId;
  const allowed = feature.enabled && canRevert(turnId);
  const requestRevert = async (): Promise<void> => {
    if (!allowed) return;
    const confirmed = await onConfirmRevert({ turnId, message });
    if (confirmed) await revert(turnId);
  };
  const view: CheckpointControlsView = { turnId, canRevert: allowed, requestRevert };
  const content =
    typeof children === 'function' ? children(view) : (children ?? '이 턴으로 되돌리기');
  const props = {
    type: 'button' as const,
    onClick: () => void requestRevert(),
    disabled: !allowed,
    'aria-label': '이 턴으로 되돌리기',
    ...rest,
  };
  if (asChild) return <Slot {...props}>{content}</Slot>;
  return <button {...props}>{content}</button>;
}
