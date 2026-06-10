import { useEffect, useState } from 'react';
import { api } from '../api';
import type { FeedItem } from '@lookback/shared';

/**
 * Feed view: an Instagram-style photo dump — every photo, newest first, each
 * with a previewable AI comment drawn from the moment's insights.
 */
export function FeedView() {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    api
      .feed()
      .then(setItems)
      .catch((e) => setErr(e instanceof Error ? e.message : 'failed'));
  }, []);

  function toggle(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  if (err) return <div className="card" style={{ color: 'var(--accent)' }}>{err}</div>;
  if (!items) return <div className="card muted">Loading the feed…</div>;
  if (items.length === 0)
    return <div className="card muted">No photos in the feed yet — upload some.</div>;

  return (
    <div className="feed">
      {items.map((it) => {
        const open = expanded.has(it.photoId);
        return (
          <div key={it.photoId} className="feeditem">
            <div className="feedmeta small muted">
              <strong style={{ color: 'var(--text)' }}>
                {it.venueName ?? it.title ?? 'somewhere'}
              </strong>
              {it.takenAt ? ` · ${new Date(it.takenAt).toLocaleDateString()}` : ''}
            </div>
            <img src={it.url ?? it.thumbUrl ?? ''} alt="" loading="lazy" className="feedimg" />
            {it.comment && (
              <button
                className={`feedcomment ${open ? 'open' : ''}`}
                onClick={() => toggle(it.photoId)}
              >
                <span className="feedwho">lookback</span> {it.comment}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
