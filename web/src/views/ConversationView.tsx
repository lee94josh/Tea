import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { NextSeed, PhotoRef } from '@lookback/shared';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

export function ConversationView() {
  const [loading, setLoading] = useState(true);
  const [seed, setSeed] = useState<NextSeed | null>(null);
  const [photos, setPhotos] = useState<PhotoRef[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [chips, setChips] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadNext();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  async function loadNext() {
    setLoading(true);
    try {
      const next = await api.nextSeed();
      if (next) {
        setSeed(next);
        setPhotos(next.photos);
        setMessages([{ role: 'assistant', content: next.seed.opener }]);
        setChips(next.seed.suggestedReplies);
        setConversationId(null);
      } else {
        setSeed(null);
        setMessages([]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy || !seed) return;
    setBusy(true);
    setChips([]);
    setInput('');
    setMessages((m) => [...m, { role: 'user', content }]);

    try {
      // Lazily start the conversation on the first user turn.
      let convId = conversationId;
      if (!convId) {
        const started = await api.startSeed(seed.seed.id);
        convId = started.conversation.id;
        setConversationId(convId);
      }

      setStreaming('');
      const full = await api.sendMessage(convId, content, (delta) =>
        setStreaming((s) => s + delta),
      );
      setStreaming('');
      setMessages((m) => [...m, { role: 'assistant', content: full }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: `(error: ${e instanceof Error ? e.message : 'failed'})` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="card muted">Looking for something to talk about…</div>;

  if (!seed) {
    return (
      <div className="card center">
        <p>Nothing to talk about yet.</p>
        <p className="small muted">
          Upload some photos and let the analysis finish — then I'll have openers ready.
        </p>
        <button onClick={loadNext}>Refresh</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {photos.length > 0 && (
        <div className="photos">
          {photos.map((p) => (
            <img key={p.id} src={p.thumbUrl ?? p.visionUrl ?? ''} alt="" loading="lazy" />
          ))}
        </div>
      )}
      {seed.moment.venueName && (
        <div className="small muted" style={{ paddingBottom: 6 }}>
          {seed.moment.venueName}
          {seed.moment.startedAt
            ? ` · ${new Date(seed.moment.startedAt).toLocaleDateString()}`
            : ''}
        </div>
      )}

      <div className="messages">
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.content}
          </div>
        ))}
        {streaming && <div className="msg assistant">{streaming}</div>}
        <div ref={endRef} />
      </div>

      {chips.length > 0 && (
        <div className="chips">
          {chips.map((c, i) => (
            <button key={i} className="chip" onClick={() => send(c)} disabled={busy}>
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="composer">
        <textarea
          value={input}
          rows={1}
          placeholder="Say something…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <button className="primary" disabled={busy || !input.trim()} onClick={() => send(input)}>
          Send
        </button>
      </div>

      <div style={{ paddingBottom: 8 }}>
        <button className="ghost small" onClick={loadNext} disabled={busy}>
          Skip to next moment
        </button>
      </div>
    </div>
  );
}
