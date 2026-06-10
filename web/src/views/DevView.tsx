import { useEffect, useState } from 'react';
import { api } from '../api';
import type { DebugMoment } from '@lookback/shared';

/**
 * Dev / prototyping mode: scroll every moment and see exactly what the app
 * gathered and inferred — photo EXIF/GPS, venue candidates + confidence,
 * vision analysis (incl. venue_guess reasoning), research facts/hooks, seed.
 */
export function DevView() {
  const [items, setItems] = useState<DebugMoment[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessMsg, setReprocessMsg] = useState<string | null>(null);

  function load() {
    api
      .debugMoments()
      .then(setItems)
      .catch((e) => setErr(e instanceof Error ? e.message : 'failed'));
  }

  useEffect(load, []);

  async function reprocess() {
    if (
      !confirm(
        'Re-run analysis + research + openers for ALL uploaded photos?\n\nThis regenerates every moment and discards current conversations. Photos are kept.',
      )
    )
      return;
    setReprocessing(true);
    setReprocessMsg(null);
    try {
      const r = await api.reprocess();
      setReprocessMsg(`Reprocessing ${r.reprocessing} photo(s)… refresh in a minute to watch.`);
      setItems(null);
      setTimeout(load, 4000);
    } catch (e) {
      setReprocessMsg(`Failed: ${e instanceof Error ? e.message : 'error'}`);
    } finally {
      setReprocessing(false);
    }
  }

  return (
    <div>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="primary" onClick={reprocess} disabled={reprocessing}>
          {reprocessing ? 'Reprocessing…' : 'Re-run analysis & openers (all photos)'}
        </button>
        <button className="ghost small" onClick={load}>
          Refresh
        </button>
      </div>
      {reprocessMsg && <div className="card small muted">{reprocessMsg}</div>}
      {err && <div className="card" style={{ color: 'var(--accent)' }}>{err}</div>}
      {!items && !err ? (
        <div className="card muted">Loading everything we know…</div>
      ) : items && items.length === 0 ? (
        <div className="card muted">No moments yet.</div>
      ) : (
        items?.map((d) => <MomentCard key={d.moment.id} d={d} />)
      )}
    </div>
  );
}

function MomentCard({ d }: { d: DebugMoment }) {
  const m = d.moment;
  const a = m.analysis;
  const r = m.research;
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={{ margin: 0 }}>{m.title ?? 'Untitled moment'}</h3>
        <span className={`pill pill-${m.status}`}>{m.status}</span>
      </div>
      <div className="small muted" style={{ margin: '4px 0 10px' }}>
        {m.venueName ?? 'no venue'}
        {m.startedAt ? ` · ${new Date(m.startedAt).toLocaleString()}` : ' · no timestamp'}
        {m.lat != null ? ` · ${m.lat.toFixed(5)},${m.lng?.toFixed(5)}` : ' · no GPS'}
      </div>

      {d.photos.length > 0 && (
        <div className="photos">
          {d.photos.map((p) => (
            <img key={p.id} src={p.thumbUrl ?? ''} alt="" loading="lazy" />
          ))}
        </div>
      )}

      {a && (
        <Section title="vision analysis">
          <p className="small" style={{ marginTop: 0 }}>{a.summary}</p>
          {a.venue_guess && (
            <p className="small">
              <strong>venue guess:</strong> {a.venue_guess.name ?? 'none'} (
              {(a.venue_guess.confidence * 100).toFixed(0)}%) — {a.venue_guess.reasoning}
            </p>
          )}
          <KvList label="activities" items={a.activities} />
          <KvList label="foods" items={a.foods} />
          <KvList label="text in images" items={a.text_in_images} />
          <KvList label="notable" items={a.notable} />
          <div className="small muted">
            mood: {a.mood || '—'} · people: {a.people_present}
          </div>
        </Section>
      )}

      {r?.curiosity && r.curiosity.length > 0 && (
        <Section title={`curiosity plan (${r.curiosity.length} angles)`}>
          {r.anomalies && r.anomalies.length > 0 && (
            <KvList label="⚡ anomalies" items={r.anomalies} />
          )}
          <ul className="small" style={{ margin: '4px 0', paddingLeft: 18 }}>
            {r.curiosity.map((a, i) => (
              <li key={i}>
                {a.kind === 'ask_user' ? '💬' : statusIcon(a.status)} {a.question}
                {a.finding && <span className="muted"> → {a.finding}</span>}
                {a.kind === 'ask_user' && <span className="muted"> (for the user)</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {r && (
        <Section title={`research (${r.passes} pass${r.passes === 1 ? '' : 'es'})`}>
          {r.venue && (
            <p className="small" style={{ marginTop: 0 }}>
              <strong>venue:</strong> {r.venue.name ?? 'unresolved'} (
              {(r.venue.confidence * 100).toFixed(0)}%) — {r.venue.evidence}
            </p>
          )}
          {r.facts.length > 0 && (
            <ul className="small" style={{ margin: '4px 0', paddingLeft: 18 }}>
              {r.facts.map((f, i) => (
                <li key={i}>
                  {f.fact} {f.source && <span className="muted">[{f.source}]</span>}
                </li>
              ))}
            </ul>
          )}
          <KvList label="hooks" items={r.hooks} />
          <KvList label="still open" items={r.open_questions} />
          {r.verification && (
            <>
              <KvList label="✓ confirmed in photos" items={r.verification.confirmations} />
              <KvList label="👁 newly spotted" items={r.verification.new_details} />
              <KvList label="⚠ contradicted" items={r.verification.contradictions} />
            </>
          )}
        </Section>
      )}

      {d.seed && (
        <Section title={`seed (q=${d.seed.qualityScore?.toFixed(2) ?? '—'} · ${d.seed.status})`}>
          <ol className="small" style={{ margin: '4px 0', paddingLeft: 18 }}>
            {d.seed.openers.map((o, i) => (
              <li key={i} style={o === d.seed!.opener ? { color: 'var(--accent)' } : undefined}>
                “{o}”
              </li>
            ))}
          </ol>
          <KvList label="chips" items={d.seed.suggestedReplies} />
        </Section>
      )}

      <Section title={`photos (${d.photos.length})`} open={false}>
        {d.photos.map((p, i) => (
          <div key={p.id} className="kv">
            <div className="small">
              <strong>#{i + 1}</strong> {p.width}×{p.height}
              {p.cameraMake ? ` · ${p.cameraMake} ${p.cameraModel ?? ''}` : ' · no camera EXIF'}
              {p.isScreenshot ? ' · 📱 screenshot' : ''} · {p.ingestStatus}
            </div>
            <div className="small muted">
              {p.takenAt ? new Date(p.takenAt).toLocaleString() : 'no timestamp'}
              {p.lat != null ? ` · ${p.lat.toFixed(5)},${p.lng?.toFixed(5)}` : ' · no GPS'}
            </div>
            {p.venues.length > 0 && (
              <div className="small muted">
                nearby:{' '}
                {p.venues
                  .map(
                    (v) =>
                      `${v.name ?? v.address ?? '?'}${v.category ? ` (${v.category})` : ''} ${
                        v.confidence != null ? `[${v.confidence.toFixed(2)} ${v.source}]` : ''
                      }`,
                  )
                  .join(' · ')}
              </div>
            )}
          </div>
        ))}
      </Section>

      <details className="small muted" style={{ marginTop: 8 }}>
        <summary>raw json</summary>
        <pre className="rawjson">{JSON.stringify(d, null, 2)}</pre>
      </details>
    </div>
  );
}

function Section({
  title,
  children,
  open = true,
}: {
  title: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details open={open} className="devsection">
      <summary className="small" style={{ fontWeight: 600 }}>{title}</summary>
      <div style={{ paddingTop: 4 }}>{children}</div>
    </details>
  );
}

function statusIcon(s: string): string {
  return s === 'resolved' ? '✓' : s === 'dead_end' ? '✗' : s === 'unknowable' ? '∅' : '…';
}

function KvList({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="small">
      <span className="muted">{label}:</span> {items.join(' · ')}
    </div>
  );
}
