import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { MomentListItem } from '@lookback/shared';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

export function ConversationView() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MomentListItem[]>([]);
  const [index, setIndex] = useState(0);

  // Current conversation state (rebuilt whenever the active moment changes).
  const [messages, setMessages] = useState<Msg[]>([]);
  const [chips, setChips] = useState<string[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const current = items[index];

  useEffect(() => {
    void loadMoments();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming, busy]);

  async function loadMoments() {
    setLoading(true);
    try {
      const list = await api.listMoments();
      setItems(list);
      if (list.length > 0) await openMoment(list, 0);
    } finally {
      setLoading(false);
    }
  }

  // Open the moment at `i`: resume its conversation if started, else show the opener.
  async function openMoment(list: MomentListItem[], i: number) {
    const item = list[i];
    if (!item) return;
    setIndex(i);
    setInput('');
    setStreaming('');

    if (item.conversationId) {
      setConversationId(item.conversationId);
      try {
        const hist = await api.conversation(item.conversationId);
        const msgs: Msg[] = hist.messages.map((m) => ({ role: m.role, content: m.content }));
        setMessages(msgs);
        // Offer the original branches only if they haven't replied yet.
        const replied = msgs.some((m) => m.role === 'user');
        setChips(replied ? [] : item.suggestedReplies);
      } catch {
        setMessages([{ role: 'assistant', content: item.opener }]);
        setChips(item.suggestedReplies);
      }
    } else {
      setConversationId(null);
      setMessages([{ role: 'assistant', content: item.opener }]);
      setChips(item.suggestedReplies);
    }
  }

  function go(delta: number) {
    if (busy) return;
    const next = index + delta;
    if (next < 0 || next >= items.length) return;
    void openMoment(items, next);
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy || !current) return;
    setBusy(true);
    setChips([]);
    setInput('');
    setMessages((m) => [...m, { role: 'user', content }]);

    try {
      // Lazily start the conversation on the first user turn, and remember the
      // conversation id on the item so navigating away and back resumes it.
      let convId = conversationId;
      if (!convId) {
        const started = await api.startSeed(current.seedId);
        convId = started.conversation.id;
        setConversationId(convId);
        setItems((arr) =>
          arr.map((it, i) => (i === index ? { ...it, conversationId: convId } : it)),
        );
      }

      setStreaming('');
      const { text: full, suggestions } = await api.sendMessage(convId, content, (delta) =>
        setStreaming((s) => s + delta),
      );
      setStreaming('');
      setMessages((m) => [...m, { role: 'assistant', content: full }]);
      setChips(suggestions);
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

  if (!current) {
    return (
      <div className="card center">
        <p>Nothing to talk about yet.</p>
        <p className="small muted">
          Upload some photos and let the analysis finish — then I'll have openers ready.
        </p>
        <button onClick={loadMoments}>Refresh</button>
      </div>
    );
  }

  const title = current.title ?? current.venueName ?? 'A moment';
  const when = current.startedAt ? new Date(current.startedAt).toLocaleDateString() : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="momentnav">
        <button className="navbtn" onClick={() => go(-1)} disabled={busy || index === 0}>
          ‹
        </button>
        <div className="momentnav-label">
          <div className="momentnav-title">{title}</div>
          <div className="small muted">
            {current.venueName && current.venueName !== title ? `${current.venueName} · ` : ''}
            {when ? `${when} · ` : ''}
            {index + 1} of {items.length}
          </div>
        </div>
        <button
          className="navbtn"
          onClick={() => go(1)}
          disabled={busy || index === items.length - 1}
        >
          ›
        </button>
      </div>

      {current.photos.length > 0 && (
        <div className="photos">
          {current.photos.map((p) => (
            <img key={p.id} src={p.thumbUrl ?? p.visionUrl ?? ''} alt="" loading="lazy" />
          ))}
        </div>
      )}

      <div className="messages">
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.content}
          </div>
        ))}
        {streaming && <div className="msg assistant">{streaming}</div>}
        {busy && !streaming && (
          <div className="msg assistant typing" aria-label="typing">
            <span />
            <span />
            <span />
          </div>
        )}
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
    </div>
  );
}
