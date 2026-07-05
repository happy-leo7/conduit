let counter = 0;

/**
 * 세션 수명 내 유일한 id 생성. 암호학적 보장이 필요 없는 UI 식별자 용도이므로
 * 단조 카운터 + 시간 기반으로 충분하다(테스트에서 예측 가능성도 확보).
 */
export function generateId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}
