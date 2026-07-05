import type { Usage } from '../types';

/** 두 Usage를 필드별 합산. undefined 필드는 다른 쪽 값을 유지한다. */
export function addUsage(a: Usage, b: Usage): Usage {
  const keys: (keyof Usage)[] = [
    'inputTokens',
    'outputTokens',
    'cacheReadTokens',
    'cacheWriteTokens',
    'reasoningTokens',
    'totalTokens',
    'costUsd',
  ];
  const result: Usage = {};
  for (const key of keys) {
    const av = a[key];
    const bv = b[key];
    if (av !== undefined || bv !== undefined) {
      result[key] = (av ?? 0) + (bv ?? 0);
    }
  }
  return result;
}

/** 1234 → "1.2k", 1234567 → "1.2M". UsageBadge용 포맷 헬퍼. */
export function formatTokens(count: number | undefined): string {
  if (count === undefined) return '–';
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

/** 0.01234 → "$0.012". 1센트 미만은 소수 셋째 자리까지. */
export function formatCost(usd: number | undefined): string {
  if (usd === undefined) return '–';
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
