import { useState } from 'react';
import { getToken, setToken } from './api';
import { UploadView } from './views/UploadView';
import { StatusView } from './views/StatusView';
import { ConversationView } from './views/ConversationView';
import { DevView } from './views/DevView';
import { FeedView } from './views/FeedView';
import { DiscoverView } from './views/DiscoverView';
import { FunFactsView } from './views/FunFactsView';

/** Experience views: same photos + insights, different UI shapes. */
type ViewMode = 'chat' | 'feed' | 'discover' | 'facts';
type Tab = 'view' | 'upload' | 'status' | 'dev';

const VIEW_LABELS: Record<ViewMode, string> = {
  chat: '💬 Chat',
  feed: '📷 Feed',
  discover: '🔭 Discover',
  facts: '💡 Fun Facts',
};

export function App() {
  const [token, setTok] = useState(getToken());
  const [tab, setTab] = useState<Tab>('view');
  const [view, setView] = useState<ViewMode>(
    (localStorage.getItem('lookback.view') as ViewMode) || 'chat',
  );

  if (!token) return <TokenGate onSet={(t) => setTok(t)} />;

  function pickView(v: ViewMode) {
    setView(v);
    localStorage.setItem('lookback.view', v);
    setTab('view');
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="tabs">
          <select
            className={`viewselect ${tab === 'view' ? 'active' : ''}`}
            value={view}
            onChange={(e) => pickView(e.target.value as ViewMode)}
            onClick={() => setTab('view')}
          >
            {(Object.keys(VIEW_LABELS) as ViewMode[]).map((v) => (
              <option key={v} value={v}>
                {VIEW_LABELS[v]}
              </option>
            ))}
          </select>
          <button
            className={`tab ${tab === 'status' ? 'active' : ''}`}
            onClick={() => setTab('status')}
          >
            Status
          </button>
          <button className={`tab ${tab === 'dev' ? 'active' : ''}`} onClick={() => setTab('dev')}>
            Dev
          </button>
        </div>
        <button
          className={`plusbtn ${tab === 'upload' ? 'active' : ''}`}
          aria-label="Upload photos"
          onClick={() => setTab('upload')}
        >
          +
        </button>
      </div>

      {tab === 'view' && view === 'chat' && <ConversationView />}
      {tab === 'view' && view === 'feed' && <FeedView />}
      {tab === 'view' && view === 'discover' && <DiscoverView />}
      {tab === 'view' && view === 'facts' && <FunFactsView />}
      {tab === 'upload' && <UploadView onUploaded={() => setTab('status')} />}
      {tab === 'status' && <StatusView />}
      {tab === 'dev' && <DevView />}
    </div>
  );
}

function TokenGate({ onSet }: { onSet: (t: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="app">
      <div className="topbar">
        <h1>Lookback</h1>
      </div>
      <div className="card">
        <p className="muted small">Enter the app token to continue.</p>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="APP_TOKEN"
        />
        <div style={{ height: 12 }} />
        <button
          className="primary"
          onClick={() => {
            if (value.trim()) {
              setToken(value.trim());
              onSet(value.trim());
            }
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
