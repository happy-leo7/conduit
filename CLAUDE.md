# conduit

LLM 코딩 에이전트(Claude Code, Codex 등)와의 대화 인터페이스를 **headless UI 라이브러리**로 제공한다.
로직·상태·이벤트 흐름만 제공하고 **시각적 스타일과 마크업은 전혀 강제하지 않는다**(Radix Primitives, TanStack, react-aria가 참고 모델).
여러 에이전트 백엔드를 공통 인터페이스 뒤에 두어, 소비자는 내부 구현을 몰라도 대화 기능을 사용하고, 모델/프로바이더를 바꿔도 컴포넌트 API가 그대로 유지된다.
레퍼런스 동작은 Conductor(conductor.build)를 따른다.

## 작업 원칙

### 1. 리뷰 가능한 단위로 PR을 나눈다
- 하나의 PR은 하나의 논리적 변경만 담는다. 리뷰어가 맥락 전환 없이 한 번에 읽을 수 있는 크기를 유지한다.
- 리팩터링과 기능 추가를 한 PR에 섞지 않는다. 순수 이동/이름 변경은 동작 변경과 분리한다.
- PR 설명에는 **무엇을 왜** 바꿨는지 적는다. 구현 방법(how)은 코드로 드러나야 한다.
- 큰 기능은 인터페이스 정의 → 구현 → 통합 순으로 쪼개 순차적 PR로 올린다.

### 2. 내부 구현을 몰라도 이해되도록 추상화한다
- 공개 API는 "무엇을 하는가"만 드러내고 "어떻게 하는가"는 감춘다. 특정 에이전트(Claude Code, Codex)의 세부사항이 공개 타입/시그니처로 새어나가지 않게 한다.
- 각 에이전트 백엔드는 공통 인터페이스를 구현하는 어댑터로 격리한다. 백엔드 추가가 소비자 코드를 바꾸지 않아야 한다.
- 이름은 도메인 언어(대화, 메시지, 세션 등)로 짓는다. 벤더 고유 용어는 어댑터 경계 안에만 둔다.
- 공개 심볼에는 의도와 계약(입력/출력/실패 조건)을 문서화한다. 주석은 "왜"를 설명하고, "무엇"은 이름과 시그니처로 표현한다.

### 3. 커밋 컨벤션: gitmoji + 한글
- 형식: `<gitmoji> <한글 요약>` — 예: `✨ 세션 스토어에 checkpoint revert 추가`, `♻️ 어댑터 경계로 SSE 파싱 이동`, `🐛 스트리밍 중단 시 마지막 메시지 상태 보정`.
- 요약은 명령형이 아닌 **한글로 무엇을 했는지** 간결히. 상세 맥락(왜)은 본문에 적는다.
- 자주 쓰는 이모지: ✨ 기능 · 🐛 버그 · ♻️ 리팩터 · 📝 문서 · ✅ 테스트 · 🎨 구조/포맷 · ⚡️ 성능 · 🔧 설정 · 🚚 이동/이름변경 · 🔥 제거.
- 한 커밋 = 한 논리 변경(작업 원칙 1과 동일 기준).

## 아키텍처 불변식 (모든 변경이 지켜야 하는 계약)

- **프로바이더 독립성**: UI/스토어 코드는 특정 프로바이더의 SSE/payload 형식을 절대 알지 못한다. 프로바이더 형식 → 정규화 이벤트(`AgentEvent`) 변환은 **오직 어댑터(transport) 계층에서만** 일어난다. 새 프로바이더 추가 = `AgentTransport` 하나 더 구현, UI/스토어 변경 0.
- **정규화 모델만 소비**: UI는 이벤트를 직접 다루지 않고 스토어가 리듀스한 정규화 도메인 모델(`Message`/`Part`)만 본다.
- **Capabilities 게이팅**: 기능 활성화는 `설정값(config.features) ∧ capability`가 참일 때만. 미지원 기능을 켜도 에러 대신 우아하게 비활성/숨김. 이 판정은 `resolveFeature()` **단일 출처**에서만 계산한다.
- **필수는 항상 on**: text, streaming, send, stop은 토글 무시하고 항상 켜져 있다. 그 외는 전부 선택.
- **Headless**: 모든 렌더링 컴포넌트는 `asChild`(Slot) 또는 render-prop을 지원한다. prop getter는 `id/role/aria-*`/키 핸들러만 담고 **스타일은 절대 넣지 않는다**.
- **타입 안정성**: `strict`, `noUncheckedIndexedAccess`. 모든 public API는 타입을 명시적으로 export. `any` 금지(불가피하면 `unknown` + 좁히기).

## 프로젝트 구조와 패키지 경계

- `@conduit/core` (`packages/core`) — **프레임워크 비종속** 순수 TS. types / store(구독 가능 상태 머신 + 리듀서) / transport 인터페이스 / adapters / utils.
- `@conduit/react` (`packages/react`) — React 18+ 바인딩(hooks + Context + compound components). `useSyncExternalStore`로 코어 스토어에 연결.
- `examples/playground` — mock 어댑터로 **API 키 없이 즉시 실행**되는 레퍼런스 UI. "헤드리스가 실제로 조립 가능함"의 증명물.
- 어댑터: `mock`(결정론적, 우선 구현) / `anthropic-messages` / `openai-chat`.

## 검증 (작업 완료 판정 기준)

작업이 끝났다고 말하기 전에 아래가 전부 통과해야 한다.

```
pnpm install && pnpm -r build     # ESM + CJS + d.ts 생성
pnpm -r typecheck                 # strict, 무오류
pnpm -r test                      # Vitest 전부 통과
pnpm --filter playground dev      # 키 없이 대화·스트리밍·tool·승인·diff·revert 시연
```

## 기록 파일

- `DECISIONS.md` — 스펙에 없거나 애매해 **자율적으로 내린 결정**과 근거. Conductor를 따른 지점을 명시.
- `PROGRESS.md` — 작업 로그. 다음 세션에서 무엇을 했는지 바로 파악 가능하게.
- 모호한 지점의 결정 순서: **(1) Conductor 동작 → (2) 업계 headless 라이브러리 관행**. 결정하면 `DECISIONS.md`에 남긴다.
