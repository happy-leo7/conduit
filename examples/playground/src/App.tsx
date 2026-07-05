import { createMockTransport, type AgentUIConfig, type FeatureToggles } from '@conduit/core';
import { AgentSessionProvider } from '@conduit/react';
import { useMemo, useState, type ReactNode } from 'react';
import { ChatPane } from './ChatPane';
import { SettingsPanel, type Profile } from './SettingsPanel';

export function App(): ReactNode {
  const [profile, setProfile] = useState<Profile>('full');
  const [features, setFeatures] = useState<FeatureToggles>({});

  // transport 교체 = 프로바이더 교체(새 세션). config는 실시간 반영.
  const transport = useMemo(() => createMockTransport({ profile }), [profile]);
  const config = useMemo<AgentUIConfig>(() => ({ features }), [features]);

  return (
    <div className="app">
      <SettingsPanel
        profile={profile}
        onProfileChange={setProfile}
        features={features}
        onFeaturesChange={setFeatures}
      />
      <AgentSessionProvider transport={transport} config={config}>
        <ChatPane />
      </AgentSessionProvider>
    </div>
  );
}
