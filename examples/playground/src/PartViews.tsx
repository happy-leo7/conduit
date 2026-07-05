import { formatCost, formatTokens, type Part } from '@conduit/core';
import {
  DiffView,
  PlanView,
  TodoList,
  useIsPartStreaming,
  useToolCall,
  type PartComponents,
} from '@conduit/react';
import type { ReactNode } from 'react';

function TextView({ part }: { part: Extract<Part, { type: 'text' }> }): ReactNode {
  return <p className="part-text">{part.text}</p>;
}

function ReasoningView({ part }: { part: Extract<Part, { type: 'reasoning' }> }): ReactNode {
  const isStreaming = useIsPartStreaming(part.id);
  if (part.visibility === 'redacted') {
    return <p className="part-reasoning redacted">[비공개 reasoning]</p>;
  }
  return (
    <details className="part-reasoning" open={isStreaming}>
      <summary>
        {isStreaming ? '생각 중…' : '생각 과정'}
        {part.visibility === 'summary' ? ' (요약)' : ''}
      </summary>
      <p>{part.text}</p>
    </details>
  );
}

const TOOL_STATE_LABEL: Record<string, string> = {
  'streaming-input': '입력 스트리밍 중',
  'input-ready': '입력 준비됨',
  executing: '실행 중',
  complete: '완료',
  error: '실패',
};

function ToolCallView({ part }: { part: Extract<Part, { type: 'tool_call' }> }): ReactNode {
  const view = useToolCall(part.toolCallId);
  const inputText =
    part.inputTextDelta ?? (part.input !== undefined ? JSON.stringify(part.input, null, 2) : '');
  return (
    <div className="part-tool" data-state={part.state}>
      <div className="tool-header">
        <code>{part.name}</code>
        <span className="badge">{TOOL_STATE_LABEL[part.state] ?? part.state}</span>
      </div>
      {inputText ? <pre className="tool-input">{inputText}</pre> : null}
      {view?.result ? (
        <pre className="tool-output" data-status={view.result.status}>
          {typeof view.result.output === 'string'
            ? view.result.output
            : JSON.stringify(view.result.output, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function DiffPartView({ part }: { part: Extract<Part, { type: 'diff' }> }): ReactNode {
  return (
    <DiffView part={part} className="part-diff">
      <div className="diff-header">
        <code>{part.path}</code>
        <span className="added">+{part.additions}</span>
        <span className="removed">-{part.deletions}</span>
      </div>
      <pre>
        {part.patch.split('\n').map((line, i) => (
          <span
            key={i}
            className={
              line.startsWith('+') && !line.startsWith('+++')
                ? 'line added'
                : line.startsWith('-') && !line.startsWith('---')
                  ? 'line removed'
                  : 'line'
            }
          >
            {line}
            {'\n'}
          </span>
        ))}
      </pre>
    </DiffView>
  );
}

function PermissionDecisionView({
  part,
}: {
  part: Extract<Part, { type: 'permission_request' }>;
}): ReactNode {
  // 대기 중 프롬프트는 ChatPane의 PermissionArea가 담당하고,
  // 여기서는 응답이 끝난 요청의 기록만 표시한다.
  if (!part.decision) return null;
  const label =
    part.decision === 'allow' ? '허용됨' : part.decision === 'allow_always' ? '항상 허용됨' : '거부됨';
  return (
    <p className="part-permission-decision" data-decision={part.decision}>
      🔐 <code>{part.toolName}</code> 실행 요청 — {label}
    </p>
  );
}

export const PART_COMPONENTS: PartComponents = {
  text: TextView,
  reasoning: ReasoningView,
  tool_call: ToolCallView,
  tool_result: () => null, // ToolCallView가 결과까지 함께 표시
  permission_request: PermissionDecisionView,
  plan: ({ part }) => (
    <PlanView part={part} className="part-plan">
      <pre>{part.markdown}</pre>
    </PlanView>
  ),
  todo: ({ part }) => (
    <TodoList part={part} className="part-todo">
      {(items) => (
        <ul>
          {items.map((item) => (
            <li key={item.id} data-status={item.status}>
              <span className="todo-mark">
                {item.status === 'done' ? '✓' : item.status === 'in_progress' ? '›' : '○'}
              </span>
              {item.text}
            </li>
          ))}
        </ul>
      )}
    </TodoList>
  ),
  diff: DiffPartView,
  citation: ({ part }) => (
    <p className="part-citation">
      📎 <a href={part.url} target="_blank" rel="noreferrer">{part.title ?? part.url}</a>
      {part.snippet ? <span className="snippet"> — {part.snippet}</span> : null}
    </p>
  ),
  error: ({ part }) => (
    <p className="part-error">
      ⚠️ {part.message}
      {part.code ? <code> ({part.code})</code> : null}
    </p>
  ),
  file: ({ part }) => (
    <p className="part-file">
      🗂 {part.name ?? part.dataRef ?? part.url} <code>{part.mimeType}</code>
    </p>
  ),
};

export function MessageUsage({
  model,
  turnUsage,
}: {
  model?: string;
  turnUsage?: { totalTokens?: number; inputTokens?: number; outputTokens?: number; costUsd?: number };
}): ReactNode {
  if (!turnUsage) return null;
  const total =
    turnUsage.totalTokens ?? (turnUsage.inputTokens ?? 0) + (turnUsage.outputTokens ?? 0);
  return (
    <span className="usage-meta">
      {model ? `${model} · ` : ''}
      {formatTokens(total)} tokens
      {turnUsage.costUsd !== undefined ? ` · ${formatCost(turnUsage.costUsd)}` : ''}
    </span>
  );
}
