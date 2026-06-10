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

  useEffect(() => {
    api
      .debugMoments()
      .then(setItems)
      .catch((e) => setErr(e instanceof Error ? e.message : 'failed'));
  }, []);

  if (err) return <div className="card" style={{ color: 'var(--accent)' }}>{err}</div>;
  if (!items) return <div className="card muted">Loading everything we know…</div>;
  if (items.length === 0) return <div className="card muted">No moments yet.</div>;

  return (
    <div>
      {items.map((d) => (
        <MomentCard key={d.moment.id} d={d} />
      ))}
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

      <Section title={`photos (${d.photos.length})`}>
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
        </Section>
      )}

      {d.seed && (
        <Section title={`seed (q=${d.seed.qualityScore?.toFixed(2) ?? '—'} · ${d.seed.status})`}>
          <p className="small" style={{ marginTop: 0 }}>“{d.seed.opener}”</p>
          <KvList label="chips" items={d.seed.suggestedReplies} />
        </Section>
      )}

      <details className="small muted" style={{ marginTop: 8 }}>
        <summary>raw json</summary>
        <pre className="rawjson">{JSON.stringify(d, null, 2)}</pre>
      </details>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="devsection">
      <summary className="small" style={{ fontWeight: 600 }}>{title}</summary>
      <div style={{ paddingTop: 4 }}>{children}</div>
    </details>
  );
}

function KvList({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="small">
      <span className="muted">{label}:</span> {items.join(' · ')}
    </div>
  );
}
