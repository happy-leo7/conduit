# DECISIONS

스펙에 없거나 애매해 자율적으로 내린 결정과 근거. 결정 순서는 (1) Conductor 동작 → (2) 업계 headless 라이브러리 관행.

## 패키지 이름: `@conduit/*`

구현 프롬프트는 `@agent-ui/*`를 예시로 들지만, 리포의 CLAUDE.md가 `@conduit/core`·`@conduit/react`로 확정하고 있어 그것을 따랐다. 구조(`packages/core`, `packages/react`)는 동일하다.

## 턴 id의 소유자는 스토어다

체크포인트는 user 전송 "직전"에 스토어가 만드는데, 어댑터는 자기 나름의 `turn_start.turnId`를 방출한다. 두 id가 어긋나면 checkpoint/revert가 깨진다. → 스토어가 `send()` 루프에서 `turn_start`/`turn_end`/`checkpoint` 이벤트의 turnId를 자신의 턴 id로 **정규화**한다. 어댑터는 turnId 관리를 신경 쓸 필요가 없고, 리듀서는 순수하게 유지된다.

## usage 이벤트는 "증분(delta)" 계약

Anthropic `message_delta.usage.output_tokens`는 누적 스냅샷이라 그대로 합산하면 이중 계산된다. 리듀서를 단순 가산으로 유지하기 위해 **어댑터가 증분으로 변환해 방출**하는 것을 계약으로 정했다(anthropic 어댑터가 직전 보고값을 기억해 차분을 방출). mock/openai 어댑터는 원래 증분/단발 방출이라 그대로.

## 세션 누적 usage는 revert해도 줄지 않는다

revert는 대화·코드 히스토리를 되돌리지만 이미 지출된 토큰/비용은 사실이다. 턴별 usage(`turnUsage`)는 삭제된 턴과 함께 제거하되, 세션 누적(`sessionUsage`)은 실제 지출 기록으로 유지한다. (Conductor가 턴 메타데이터로 비용을 표시하는 취지에 부합)

## revert 시 transport 실패면 히스토리를 건드리지 않는다

`revertToTurn`(코드 되돌림)이 실패했는데 대화만 지우면 "코드는 그대로인데 대화만 사라진" 불일치가 생긴다. → transport 되돌림을 먼저 await하고, 성공한 경우에만 메시지를 삭제한다. Conductor의 "되돌린 이후 히스토리는 영구 삭제" 규칙은 성공 경로에서 그대로 따른다.

## PermissionPrompt는 기능 토글과 무관하게 렌더된다

`features.permissions=false` 상태에서 transport가 이미 승인 요청을 방출했다면, 응답 수단을 숨기는 것은 세션 데드락이다. → 토글은 "승인 UI를 능동적으로 배치할지"의 문제로 남기고, 컴포넌트 자체는 요청이 존재하면 항상 동작한다. (미지원 기능을 켜도 우아하게 처리하라는 원칙의 역방향 케이스)

## tool 상태 전이에서 'executing'은 승인 흐름에서만 관찰된다

정규화 이벤트에 "실행 시작" 이벤트가 따로 없으므로: `tool_input_ready` → `input-ready`, 승인 allow → `executing`(스토어가 전이), `tool_result` → `complete`/`error`. 승인이 없는 프로바이더에서는 `input-ready` → `complete`로 건너뛴다. 이벤트 어휘를 스펙 §3.2 그대로 유지하기 위한 선택.

## todo_update는 같은 메시지의 기존 todo 파트를 제자리 교체

Conductor의 태스크 목록은 "갱신되는 하나의 목록"이다. 메시지에 todo 파트가 여러 개 쌓이는 대신, 같은 메시지 내 기존 todo 파트를 교체한다(파트 id는 유지해 부분 구독 안정성 확보). 메시지가 다르면 새 파트로 추가된다.

## regenerate는 턴 id를 유지한다

마지막 assistant 메시지들만 제거하고 같은 user 메시지·같은 turnId로 재전송한다. 체크포인트 경계가 보존되어 revert 대상이 흔들리지 않는다.

## 에러 정책

- 스트림 도중 `error` 이벤트: 부분 스트림 보존 + 해당 메시지에 `ErrorPart` 추가 + 메시지 status `error`.
- transport가 throw: 스토어가 잡아 `ErrorPart(retryable: true)`로 변환(네트워크성 실패 가정).
- `retry()`는 `regenerate()`와 동일 경로(에러 턴 제거 후 재전송).

## thinking signature_delta는 무시

Anthropic thinking 블록의 signature는 "재전송 시 검증"용이고 UI 표시 대상이 아니다. 이 라이브러리는 히스토리 재전송 시 reasoning 파트를 아예 보내지 않으므로(아래) signature를 보존할 필요가 없다. `ReasoningPart.signature` 필드는 스펙대로 유지하되 anthropic 어댑터는 채우지 않는다.

## 히스토리 재전송 변환 규칙 (anthropic/openai 어댑터)

- reasoning/plan/todo/diff/citation/permission/error 파트는 재전송하지 않는다 — 프로바이더 API가 받는 형식이 아니고, 표현 계층의 산물이기 때문.
- `tool_result` 파트는 Anthropic 규약대로 다음 user 메시지의 `tool_result` 블록으로 호이스팅한다(OpenAI는 `role:"tool"` 메시지).

## reasoning effort → 프로바이더 파라미터 매핑

Conductor의 통합 레벨(low/medium/high/xhigh)을 유지하고, anthropic 어댑터가 thinking `budget_tokens`(1024/4096/8192/12288, max_tokens 16384 기본)로 변환한다.

## Provider 교체 = 세션 초기화, config 변경 = 실시간 반영

`AgentSessionProvider`의 `transport`가 바뀌면 새 스토어(새 대화)를 만든다 — 다른 프로바이더의 세션을 이어붙이는 것은 의미가 없기 때문. 반면 `config.features`는 React 컨텍스트로 전달되어 스토어 재생성 없이 즉시 반영된다(playground의 토글 패널이 이를 시연).

## Slot 병합 규칙

Radix 관행: 자식 props가 우선, 이벤트 핸들러는 둘 다 호출(자식 먼저), className은 이어붙임(라이브러리는 className을 넣지 않으므로 사실상 소비자 것만 존재), ref는 합성.

## Composer.Submit은 onClick이 아닌 form submit

asChild로 소비자 버튼을 써도 `type="submit"`만 병합한다. onClick에서 직접 send하면 form onSubmit과 이중 전송될 수 있어 제출 경로를 form 하나로 고정했다.

## IME 조합 중 Enter는 전송하지 않는다

한국어/일본어 입력에서 조합 확정 Enter가 곧바로 전송되는 것을 막기 위해 `isComposing`을 확인한다. (Conductor급 제품 관행)

## mock 어댑터 시나리오는 키워드 분기

결정론성을 유지하면서 데모가 자연스럽도록 입력 키워드로 시나리오를 고른다: plan 모드 → plan, `diff|refactor|fix|수정|구현` → 코딩(tool+permission+diff+todo), `error|에러` → 재시도 가능한 에러, `cite|출처|검색` → citation, 그 외 → reasoning+텍스트. `allow_always`는 도구 이름 단위로 기억되어 다음 턴부터 승인 생략.

## playground의 test 스크립트 부재

playground는 RTL로 이미 검증된 라이브러리 조립의 시연물이라 별도 테스트를 두지 않았다(`pnpm -r test`는 core 46 + react 10 케이스를 실행).
