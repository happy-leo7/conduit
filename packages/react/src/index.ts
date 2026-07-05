// Context
export {
  AgentSessionProvider,
  useAgentSessionContext,
  useSessionStore,
  type AgentSessionProviderProps,
  type AgentSessionContextValue,
} from './context/AgentSessionProvider';

// Hooks
export { useAgentSession, type AgentSession } from './hooks/useAgentSession';
export { useComposer, type Composer as ComposerState } from './hooks/useComposer';
export { useSessionSelector, shallowEqual } from './hooks/useSessionSelector';
export { useMessage, useMessagePart, useIsPartStreaming } from './hooks/useMessage';
export { useToolCall, type ToolCallView } from './hooks/useToolCall';
export { useReasoning, type ReasoningView } from './hooks/useReasoning';
export { useTodos, useDiffs, useCitations, type TodosView, type DiffEntry } from './hooks/useParts';
export { useUsage, useTurnUsage, type UsageView } from './hooks/useUsage';
export { useCheckpoints, type CheckpointsView } from './hooks/useCheckpoints';
export { useCapabilities, useFeature } from './hooks/useCapabilities';
export { usePermissionQueue, type PermissionQueue } from './hooks/usePermissionQueue';
export { useThread, type ThreadView, type ThreadContainerProps } from './hooks/useThread';
export { useFocusTrap } from './hooks/useFocusTrap';

// Components (모두 unstyled, asChild/render-prop 지원)
export { Slot, type SlotProps } from './components/Slot';
export { Thread, type ThreadProps } from './components/Thread';
export {
  MessageList,
  MessageItem,
  useMessageContext,
  type MessageListProps,
  type MessageItemProps,
} from './components/MessageList';
export { PartRenderer, type PartRendererProps, type PartComponents } from './components/PartRenderer';
export {
  Composer,
  useComposerContext,
  type ComposerRootProps,
  type ComposerInputProps,
  type ComposerButtonProps,
  type ComposerAttachmentsProps,
} from './components/Composer';
export {
  PermissionPrompt,
  type PermissionPromptProps,
  type PermissionPromptActions,
} from './components/PermissionPrompt';
export {
  PlanView,
  TodoList,
  DiffView,
  Citations,
  type PlanViewProps,
  type TodoListProps,
  type DiffViewProps,
  type CitationsProps,
} from './components/parts';
export {
  ModelSelector,
  ReasoningEffortControl,
  ModeToggle,
  FastModeToggle,
  UsageBadge,
  CheckpointControls,
  type ModelSelectorProps,
  type ModelSelectorView,
  type ReasoningEffortControlProps,
  type ReasoningEffortControlView,
  type ModeToggleProps,
  type ModeToggleView,
  type FastModeToggleProps,
  type FastModeToggleView,
  type UsageBadgeProps,
  type UsageBadgeView,
  type CheckpointControlsProps,
  type CheckpointControlsView,
} from './components/controls';

// 코어 재노출(편의) — 소비자가 @conduit/core를 직접 설치하지 않아도 되게.
export type {
  AgentEvent,
  AgentTransport,
  AgentUIConfig,
  Capabilities,
  FeatureName,
  FeatureToggle,
  Message,
  Part,
  PermissionDecision,
  ReasoningEffort,
  SessionMode,
  SessionState,
  SessionStatus,
  Usage,
} from '@conduit/core';
