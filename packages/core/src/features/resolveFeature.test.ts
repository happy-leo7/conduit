import { describe, expect, it } from 'vitest';
import { MOCK_BASIC_CAPABILITIES, MOCK_FULL_CAPABILITIES } from '../adapters/mock';
import { getFeatureSupport, resolveFeature, resolveFeatureFor } from './resolveFeature';

describe('resolveFeature', () => {
  it("'auto'는 capability를 따른다", () => {
    expect(resolveFeature('auto', true)).toEqual({ visible: true, enabled: true, supported: true });
    expect(resolveFeature('auto', false)).toEqual({
      visible: false,
      enabled: false,
      supported: false,
    });
  });

  it('미지정(undefined)은 auto와 동일하다', () => {
    expect(resolveFeature(undefined, true).enabled).toBe(true);
    expect(resolveFeature(undefined, false).visible).toBe(false);
  });

  it('true는 강제 노출하되 미지원이면 비활성으로만 노출한다', () => {
    expect(resolveFeature(true, true)).toEqual({ visible: true, enabled: true, supported: true });
    expect(resolveFeature(true, false)).toEqual({
      visible: true,
      enabled: false,
      supported: false,
    });
  });

  it('false는 지원 여부와 무관하게 숨긴다', () => {
    expect(resolveFeature(false, true)).toEqual({
      visible: false,
      enabled: false,
      supported: true,
    });
  });
});

describe('getFeatureSupport', () => {
  it('full 프로필은 전 기능을 지원한다', () => {
    expect(getFeatureSupport('reasoning', MOCK_FULL_CAPABILITIES)).toBe(true);
    expect(getFeatureSupport('permissions', MOCK_FULL_CAPABILITIES)).toBe(true);
    expect(getFeatureSupport('checkpoints', MOCK_FULL_CAPABILITIES)).toBe(true);
    expect(getFeatureSupport('cost', MOCK_FULL_CAPABILITIES)).toBe(true);
  });

  it('basic 프로필은 선택 기능 대부분을 지원하지 않는다', () => {
    expect(getFeatureSupport('reasoning', MOCK_BASIC_CAPABILITIES)).toBe(false);
    expect(getFeatureSupport('permissions', MOCK_BASIC_CAPABILITIES)).toBe(false);
    expect(getFeatureSupport('diffs', MOCK_BASIC_CAPABILITIES)).toBe(false);
    expect(getFeatureSupport('toolCalls', MOCK_BASIC_CAPABILITIES)).toBe(true);
    expect(getFeatureSupport('usage', MOCK_BASIC_CAPABILITIES)).toBe(true);
  });

  it("reasoning은 visibility가 'hidden'이면 미지원으로 판정한다", () => {
    expect(
      getFeatureSupport('reasoning', {
        ...MOCK_FULL_CAPABILITIES,
        reasoning: { supported: true, visibility: 'hidden' },
      }),
    ).toBe(false);
  });
});

describe('resolveFeatureFor', () => {
  it('config 토글과 capability를 합성한다', () => {
    expect(
      resolveFeatureFor('reasoning', { features: { reasoning: false } }, MOCK_FULL_CAPABILITIES)
        .visible,
    ).toBe(false);
    expect(
      resolveFeatureFor('diffs', { features: { diffs: true } }, MOCK_BASIC_CAPABILITIES),
    ).toEqual({ visible: true, enabled: false, supported: false });
    expect(resolveFeatureFor('todos', undefined, MOCK_FULL_CAPABILITIES).enabled).toBe(true);
  });
});
