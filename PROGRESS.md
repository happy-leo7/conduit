# PROGRESS

## 2026-07-05 — 초기 구현 (전체 완료)

한 세션에서 스캐폴딩부터 문서까지 완결. 커밋은 논리 단위로 분리되어 있다 (`git log --oneline` 참고).

### 완료된 것

1. **워크스페이스** — pnpm workspaces + tsup(ESM/CJS/d.ts) + Vitest + ESLint/Prettier, TS strict + noUncheckedIndexedAccess.
2. **`@conduit/core`**
   - `types/` — Message/Part(11종 discriminated union), AgentEvent(19종), Capabilities, AgentTransport, AgentUIConfig
   - `features/resolveFeature` — 기능 판정 단일 출처 (`true`=강제 노출(미지원 시 비활성), `false`=숨김, `'auto'`=capability)
   - `store/` — 구독 가능 세션 스토어 + 순수 리듀서. 파트 단위 불변 교체, send(낙관적 user 추가)/stop(abort→aborted)/regenerate(턴 id 유지)/permission/checkpoint-revert
   - `adapters/mock` — 결정론적 키워드 시나리오(코딩/plan/citation/에러), full/basic 2개 프로필, permission 대기·allow_always 기억, delayMs 옵션(테스트 0)
   - `adapters/anthropic-messages` — SSE 파싱, thinking/redacted_thinking/tool_use 입력 스트리밍/usage 증분 변환/stop_reason 매핑, endpoint 프록시 + fetch 주입
   - `adapters/openai-chat` — Chat Completions 스트리밍 매핑(동형성 증명)
3. **`@conduit/react`**
   - `AgentSessionProvider`(transport 교체=새 세션, config=실시간), `useSessionSelector`(부분 구독)
   - 훅 15종: useAgentSession/useComposer/useMessage(Part)/useToolCall/useReasoning/useTodos/useDiffs/useCitations/useUsage/useTurnUsage/useCheckpoints/useCapabilities/useFeature/usePermissionQueue/useThread/useFocusTrap
   - 컴포넌트: Slot(asChild), Thread(auto-scroll), MessageList/Item, PartRenderer(레지스트리), Composer 컴파운드, PermissionPrompt, PlanView/TodoList/DiffView/Citations, ModelSelector/ReasoningEffortControl/ModeToggle/FastModeToggle/UsageBadge/CheckpointControls(onConfirmRevert 필수)
4. **playground** — mock 어댑터, 키 불필요. 설정 패널(프로필 전환 + 16개 feature 토글 auto/on/off), 대화·thinking·tool 스트리밍·승인·diff·todo·plan·citation·usage/cost·revert(확인 다이얼로그)·재생성·중단·에러 재시도 전부 동작.
5. **문서** — README(5분 예제, 훅/컴포넌트 표, 어댑터 가이드, 토글 표), DECISIONS(자율 결정 15건).

### 검증 상태 (2026-07-05 기준 전부 통과)

```
pnpm install && pnpm -r build   ✅ core/react ESM+CJS+d.ts, playground vite build
pnpm -r typecheck               ✅ strict 무오류
pnpm -r test                    ✅ core 46 + react 10 = 56 케이스
pnpm --filter playground dev    ✅ localhost:5173 기동·모듈 변환 확인
pnpm lint                       ✅
```

### 다음 세션에서 할 만한 것

- anthropic-messages 어댑터에 실 프록시 붙여 E2E 확인 (현재는 주입 fetch로 단위 검증)
- openai-chat 어댑터 usage 증분 처리 검토(스트리밍 중 usage가 여러 번 오는 변형 API 대응)
- Vue/Solid 바인딩 검토 (core는 이미 프레임워크 비종속)
- playground 멀티모델 비교 뷰(Provider 2개 나란히) 추가
