import type { FeatureName, FeatureToggle, FeatureToggles } from '@conduit/core';
import type { ReactNode } from 'react';

export const ALL_FEATURES: FeatureName[] = [
  'reasoning',
  'reasoningEffort',
  'toolCalls',
  'streamingToolInput',
  'permissions',
  'planMode',
  'fastMode',
  'todos',
  'diffs',
  'citations',
  'usage',
  'cost',
  'checkpoints',
  'modelSelector',
  'attachments',
  'multiModelCompare',
];

export type Profile = 'full' | 'basic';

export interface SettingsPanelProps {
  profile: Profile;
  onProfileChange: (profile: Profile) => void;
  features: FeatureToggles;
  onFeaturesChange: (features: FeatureToggles) => void;
}

/**
 * 각 feature 토글(auto/on/off)을 켜고 끄며 인터페이스 일관성을 눈으로
 * 확인하는 패널. 'on'은 미지원 프로바이더에서 "비활성 노출"이 되는 것도
 * 그대로 관찰된다.
 */
export function SettingsPanel({
  profile,
  onProfileChange,
  features,
  onFeaturesChange,
}: SettingsPanelProps): ReactNode {
  function setToggle(name: FeatureName, value: string): void {
    const next: FeatureToggles = { ...features };
    if (value === 'auto') delete next[name];
    else next[name] = (value === 'on') as FeatureToggle;
    onFeaturesChange(next);
  }

  return (
    <aside className="settings">
      <h2>conduit playground</h2>

      <section>
        <h3>프로바이더 프로필</h3>
        <label>
          <input
            type="radio"
            name="profile"
            checked={profile === 'full'}
            onChange={() => onProfileChange('full')}
          />
          mock-full — 전 기능 지원
        </label>
        <label>
          <input
            type="radio"
            name="profile"
            checked={profile === 'basic'}
            onChange={() => onProfileChange('basic')}
          />
          mock-basic — 텍스트+tool만
        </label>
        <p className="hint">프로필 전환 = 프로바이더 교체. UI 코드는 동일하다.</p>
      </section>

      <section>
        <h3>기능 토글 (config.features)</h3>
        <p className="hint">
          필수 기능(text·streaming·send·stop)은 항상 켜져 있어 목록에 없다.
        </p>
        <ul className="feature-list">
          {ALL_FEATURES.map((name) => {
            const value = features[name] === undefined ? 'auto' : features[name] ? 'on' : 'off';
            return (
              <li key={name}>
                <span>{name}</span>
                <select value={value} onChange={(e) => setToggle(name, e.target.value)}>
                  <option value="auto">auto</option>
                  <option value="on">on</option>
                  <option value="off">off</option>
                </select>
              </li>
            );
          })}
        </ul>
      </section>
    </aside>
  );
}
