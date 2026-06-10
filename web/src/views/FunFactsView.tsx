import { useEffect, useState } from 'react';
import { api } from '../api';
import type { FunFact } from '@lookback/shared';

// Module cache: instant return when tabbing back.
let factsCache: FunFact[] | null = null;

/**
 * Fun Facts view: a feed of obscure-but-true tidbits the research loop verified,
 * each tied to a real moment. Tap one to see the photo it's attached to and the
 * source to learn more.
 */
export function FunFactsView() {
  const [facts, setFacts] = useState<FunFact[] | null>(factsCache);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [dropped, setDropped] = useState<Set<string>>(new Set());

  function flag(f: FunFact) {
    setDropped((s) => new Set(s).add(f.id));
    api.flagFact(f.momentId, f.fact, 'drop');
  }

  useEffect(() => {
    api
      .facts()
      .then((f) => {
        factsCache = f;
        setFacts(f);
      })
      .catch((e) => {
        if (!factsCache) setErr(e instanceof Error ? e.message : 'failed');
      });
  }, []);

  if (err) return <div className="card" style={{ color: 'var(--accent)' }}>{err}</div>;
  if (!facts) return <div className="card muted">Loading fun facts…</div>;
  if (facts.length === 0)
    return (
      <div className="card muted">
        No fun facts yet — they appear as moments finish research.
      </div>
    );

  return (
    <div>
      <p className="small muted" style={{ padding: '0 4px' }}>
        true things hiding in your photos:
      </p>
      {facts
        .filter((f) => !dropped.has(f.id))
        .map((f) => {
          const isOpen = open === f.id;
          return (
            <div key={f.id} className="factcard">
              <div className="factrow">
                <button className="factmain" onClick={() => setOpen(isOpen ? null : f.id)}>
                  <div className="facttext">{f.fact}</div>
                  <div className="small muted" style={{ marginTop: 6 }}>
                    {f.venueName ?? f.momentTitle ?? 'a moment'}
                    {f.takenAt ? ` · ${new Date(f.takenAt).toLocaleDateString()}` : ''}
                    {f.source ? ` · ${f.source}` : ''}
                  </div>
                </button>
                <button
                  className="verdict factflag"
                  aria-label="not interesting"
                  title="not interesting"
                  onClick={() => flag(f)}
                >
                  ✕
                </button>
              </div>
              {isOpen && (
                <div className="factdetail">
                  {f.thumbUrl && <img src={f.thumbUrl} alt="" loading="lazy" />}
                  {f.sourceUrl ? (
                    <a className="small" href={f.sourceUrl} target="_blank" rel="noreferrer">
                      learn more{f.source ? ` at ${f.source}` : ''} ↗
                    </a>
                  ) : (
                    f.source && <span className="small muted">source: {f.source}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
