import { useEffect, useState } from 'react';
import { api } from '../api';
import type { StatusReport } from '@lookback/shared';
import { enablePush, isStandalone } from '../push';

export function StatusView() {
  const [status, setStatus] = useState<StatusReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const s = await api.status();
        if (active) setStatus(s);
      } catch (e) {
        if (active) setErr(e instanceof Error ? e.message : 'failed');
      }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  if (err) return <div className="card" style={{ color: 'var(--accent)' }}>{err}</div>;
  if (!status) return <div className="card muted">Loading status…</div>;

  const m = status.metadata;
  return (
    <div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Metadata health</h3>
        <div className="stat-grid">
          <Stat n={m.totalPhotos} l="photos" />
          <Stat n={m.screenshots} l="screenshots" />
          <Stat n={`${m.gpsPct}%`} l={`with GPS (${m.withGps})`} pct={m.gpsPct} />
          <Stat n={`${m.timestampPct}%`} l={`with timestamp (${m.withTimestamp})`} pct={m.timestampPct} />
        </div>
        {m.withNeither > 0 && (
          <p className="small muted">{m.withNeither} photo(s) have neither GPS nor a timestamp.</p>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Pipeline</h3>
        <div className="small muted" style={{ display: 'grid', gap: 4 }}>
          {Object.entries(status.byIngestStatus).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
        <hr style={{ borderColor: 'var(--border)', margin: '12px 0' }} />
        <div className="stat-grid">
          <Stat n={status.moments.analyzed} l={`moments analyzed / ${status.moments.total}`} />
          <Stat n={status.seeds.ready} l={`conversations ready / ${status.seeds.total}`} />
        </div>
        {status.pipelineComplete && (
          <p className="small" style={{ color: 'var(--accent-2)' }}>
            Analysis complete — head to Talk.
          </p>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Notifications</h3>
        {!isStandalone() ? (
          <p className="small muted">
            Add Lookback to your home screen first, then enable notifications here.
          </p>
        ) : (
          <button
            onClick={async () => {
              const r = await enablePush();
              setPushMsg(r.ok ? 'Notifications enabled.' : r.reason ?? 'Failed.');
            }}
          >
            Enable notifications
          </button>
        )}
        {pushMsg && <p className="small muted">{pushMsg}</p>}
      </div>
    </div>
  );
}

function Stat({ n, l, pct }: { n: number | string; l: string; pct?: number }) {
  return (
    <div className="stat">
      <div className="n">{n}</div>
      <div className="l">{l}</div>
      {pct !== undefined && (
        <div className="bar">
          <div style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
