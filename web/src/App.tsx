import { useState } from 'react';
import { getToken, setToken } from './api';
import { UploadView } from './views/UploadView';
import { StatusView } from './views/StatusView';
import { ConversationView } from './views/ConversationView';
import { DevView } from './views/DevView';

type Tab = 'talk' | 'upload' | 'status' | 'dev';

export function App() {
  const [token, setTok] = useState(getToken());
  const [tab, setTab] = useState<Tab>('talk');

  if (!token) return <TokenGate onSet={(t) => setTok(t)} />;

  return (
    <div className="app">
      <div className="topbar">
        <div className="tabs">
          <button className={`tab ${tab === 'talk' ? 'active' : ''}`} onClick={() => setTab('talk')}>
            Talk
          </button>
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

      {tab === 'talk' && <ConversationView />}
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
