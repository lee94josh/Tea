import { useEffect, useState } from 'react';
import { api } from '../api';
import type { FactEntity, FunFact } from '@lookback/shared';

// Module caches: instant return when tabbing back; dives reopen instantly.
let factsCache: FunFact[] | null = null;
const diveTextCache = new Map<string, string>();

/** Render the fact text with notable names underlined and tappable. */
function FactText({ fact, onEntity }: { fact: FunFact; onEntity: (name: string) => void }) {
  const names = fact.entities.map((e) => e.name).filter(Boolean);
  if (names.length === 0) return <div className="facttext">{fact.fact}</div>;

  const re = new RegExp(
    `(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'g',
  );
  const parts = fact.fact.split(re);
  return (
    <div className="facttext">
      {parts.map((p, i) =>
        names.includes(p) ? (
          <span
            key={i}
            className="entity"
            role="button"
            onClick={(ev) => {
              ev.stopPropagation();
              onEntity(p);
            }}
          >
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </div>
  );
}

/**
 * Fun Facts view: a feed of obscure-but-true tidbits the research loop verified,
 * each tied to a real moment. Tap to see the photo + source; tap a name or
 * "dive deeper" for a fast expansion (existing research first, search only if
 * needed).
 */
export function FunFactsView() {
  const [facts, setFacts] = useState<FunFact[] | null>(factsCache);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  // Dive panel state for the open card.
  const [diveText, setDiveText] = useState<string | null>(null);
  const [diveLabel, setDiveLabel] = useState<string | null>(null);
  const [diving, setDiving] = useState(false);

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

  function flag(f: FunFact) {
    setDropped((s) => new Set(s).add(f.id));
    api.flagFact(f.momentId, f.fact, 'drop');
  }

  function toggleOpen(id: string) {
    setOpen((cur) => (cur === id ? null : id));
    setDiveText(null);
    setDiveLabel(null);
    setDiving(false);
  }

  async function dive(f: FunFact, entity?: string) {
    if (open !== f.id) setOpen(f.id);
    const cacheKey = `${f.id}|${entity ?? ''}`;
    setDiveLabel(entity ?? null);
    const cached = diveTextCache.get(cacheKey);
    if (cached) {
      setDiveText(cached);
      return;
    }
    setDiveText(null);
    setDiving(true);
    try {
      // Entities linked to a Discover topic get its (cached, instant) dive.
      const linked = f.entities.find((e: FactEntity) => e.name === entity && e.topicId);
      let text: string;
      if (linked?.topicId) {
        const d = await api.dive(linked.topicId);
        text = d.body_paragraphs.join('\n\n');
      } else {
        const d = await api.factDive(f.momentId, f.fact, entity ?? null);
        text = d.text;
      }
      diveTextCache.set(cacheKey, text);
      setDiveText(text || '(nothing more found)');
    } catch (e) {
      setDiveText(`(dive failed: ${e instanceof Error ? e.message : 'error'})`);
    } finally {
      setDiving(false);
    }
  }

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
                <button className="factmain" onClick={() => toggleOpen(f.id)}>
                  <FactText fact={f} onEntity={(name) => void dive(f, name)} />
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
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="small" onClick={() => void dive(f)} disabled={diving}>
                      dive deeper ↓
                    </button>
                    {f.sourceUrl && (
                      <a className="small" href={f.sourceUrl} target="_blank" rel="noreferrer">
                        source{f.source ? `: ${f.source}` : ''} ↗
                      </a>
                    )}
                  </div>
                  {diving && (
                    <div className="msg assistant typing" aria-label="diving">
                      <span />
                      <span />
                      <span />
                    </div>
                  )}
                  {diveText && (
                    <div className="divetext">
                      {diveLabel && <div className="small muted">about {diveLabel}:</div>}
                      {diveText.split(/\n{2,}/).map((p, i) => (
                        <p key={i} style={{ lineHeight: 1.5, margin: '8px 0' }}>{p}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
