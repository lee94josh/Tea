import { useEffect, useState } from 'react';
import { api } from '../api';
import type { DeepDive, DiscoverTopic } from '@lookback/shared';

// Module-level caches: tab away and back shows instantly (stale-while-
// revalidate); dives reopen without a network round trip.
let topicsCache: DiscoverTopic[] | null = null;
const diveCache = new Map<string, DeepDive>();

/**
 * Discover view: no photos — a learning surface built from the research the
 * app already did. Tap a topic to generate (or reopen) a search-grounded
 * deep dive: the history of the venue, the artist you saw, the dish you ate.
 */
export function DiscoverView() {
  const [topics, setTopics] = useState<DiscoverTopic[] | null>(topicsCache);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<DiscoverTopic | null>(null);
  const [dive, setDive] = useState<DeepDive | null>(null);
  const [diving, setDiving] = useState(false);

  useEffect(() => {
    // Refresh quietly in the background; the cached list stays on screen.
    api
      .discover()
      .then((t) => {
        topicsCache = t;
        setTopics(t);
      })
      .catch((e) => {
        if (!topicsCache) setErr(e instanceof Error ? e.message : 'failed');
      });
  }, []);

  async function open(t: DiscoverTopic) {
    setActive(t);
    const cached = diveCache.get(t.id);
    if (cached) {
      setDive(cached);
      return;
    }
    setDive(null);
    setDiving(true);
    try {
      const d = await api.dive(t.id);
      diveCache.set(t.id, d);
      setDive(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'dive failed');
    } finally {
      setDiving(false);
    }
  }

  if (err) return <div className="card" style={{ color: 'var(--accent)' }}>{err}</div>;

  // Reading mode for an open dive.
  if (active) {
    return (
      <div>
        <button className="ghost small" onClick={() => setActive(null)}>
          ‹ all topics
        </button>
        <div className="card">
          <div className="small muted">
            {active.kind ?? 'topic'}
            {active.venueName ? ` · from ${active.venueName}` : ''}
          </div>
          <h2 style={{ margin: '6px 0 2px' }}>{dive?.title ?? active.name}</h2>
          {diving && (
            <div className="msg assistant typing" style={{ marginTop: 12 }} aria-label="researching">
              <span />
              <span />
              <span />
            </div>
          )}
          {dive && (
            <div>
              {dive.body_paragraphs.map((p, i) => (
                <p key={i} style={{ lineHeight: 1.55 }}>{p}</p>
              ))}
              {dive.fun_facts.length > 0 && (
                <div>
                  <h4 style={{ marginBottom: 6 }}>worth knowing</h4>
                  <ul style={{ marginTop: 0, paddingLeft: 18 }}>
                    {dive.fun_facts.map((f, i) => (
                      <li key={i} style={{ marginBottom: 6 }}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
              {dive.further_questions.length > 0 && (
                <div className="small muted">
                  go deeper: {dive.further_questions.join(' · ')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // First-ever load (no cache yet): quiet skeleton, no copy.
  if (!topics) {
    return (
      <div>
        <div className="topiccard skeleton" />
        <div className="topiccard skeleton" />
        <div className="topiccard skeleton" />
      </div>
    );
  }

  if (topics.length === 0)
    return (
      <div className="card muted">
        Nothing to explore yet — topics appear once moments finish research.
      </div>
    );

  return (
    <div>
      <p className="small muted" style={{ padding: '0 4px' }}>
        things your photos opened the door to:
      </p>
      {topics.map((t) => (
        <button key={t.id} className="topiccard" onClick={() => open(t)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong>{t.name}</strong>
            <span className="pill">{t.kind ?? 'topic'}</span>
          </div>
          {t.blurb && <div className="small" style={{ marginTop: 4 }}>{t.blurb}</div>}
          <div className="small muted" style={{ marginTop: 4 }}>
            {t.venueName ?? t.momentTitle ?? ''}
            {t.hasDive ? ' · ✓ researched' : ' · tap to research'}
          </div>
        </button>
      ))}
    </div>
  );
}
