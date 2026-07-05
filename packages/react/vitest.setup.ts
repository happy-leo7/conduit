import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// globals:false 환경에서는 RTL 자동 cleanup이 등록되지 않는다 — 직접 등록.
afterEach(() => {
  cleanup();
});

// 비동기 스트리밍 특성상 act() 밖에서 커밋되는 업데이트가 존재한다.
// 테스트는 전부 waitFor로 결과를 검증하므로 해당 경고만 걸러낸다.
const originalError = console.error;
console.error = (...args: unknown[]) => {
  const first = args[0];
  if (typeof first === 'string' && first.includes('not wrapped in act')) return;
  originalError(...args);
};
