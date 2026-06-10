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
  // When set, the moment hasn't started: user picks one of these openers first.
  const [openerOptions, setOpenerOptions] = useState<string[] | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState('');
  // "this is bad" report form
  const [reporting, setReporting] = useState(false);
  const [reportNote, setReportNote] = useState('');
  const [reported, setReported] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const current = items[index];

  useEffect(() => {
    void loadMoments();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming, busy, openerOptions]);

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

  // Open the moment at `i`: resume its conversation if started, else offer openers.
  async function openMoment(list: MomentListItem[], i: number) {
    const item = list[i];
    if (!item) return;
    setIndex(i);
    setInput('');
    setStreaming('');
    setReporting(false);
    setReportNote('');
    setReported(false);

    if (item.conversationId) {
      setOpenerOptions(null);
      setConversationId(item.conversationId);
      try {
        const hist = await api.conversation(item.conversationId);
        const msgs: Msg[] = hist.messages.map((m) => ({ role: m.role, content: m.content }));
        setMessages(msgs);
        const replied = msgs.some((m) => m.role === 'user');
        setChips(replied ? [] : item.suggestedReplies);
      } catch {
        setMessages([{ role: 'assistant', content: item.opener }]);
        setChips(item.suggestedReplies);
      }
    } else {
      // Not started: present the three candidate openers.
      setConversationId(null);
      setMessages([]);
      setChips([]);
      setOpenerOptions(item.openers.length > 0 ? item.openers : [item.opener]);
    }
  }

  function go(delta: number) {
    if (busy) return;
    const next = index + delta;
    if (next < 0 || next >= items.length) return;
    void openMoment(items, next);
  }

  // User picked one of the three openers — record it, start the conversation.
  async function pickOpener(opener: string, idx: number) {
    if (!current || busy) return;
    setBusy(true);
    try {
      api.feedback({
        kind: 'opener_choice',
        seedId: current.seedId,
        payload: { index: idx, text: opener, options: openerOptions },
      });
      const started = await api.startSeed(current.seedId, opener);
      setConversationId(started.conversation.id);
      setItems((arr) =>
        arr.map((it, i) =>
          i === index ? { ...it, conversationId: started.conversation.id, opener } : it,
        ),
      );
      setOpenerOptions(null);
      setMessages([{ role: 'assistant', content: opener }]);
      setChips(current.suggestedReplies);
    } finally {
      setBusy(false);
    }
  }

  async function send(text: string, fromChipIndex?: number) {
    const content = text.trim();
    if (!content || busy || !current || !conversationId) return;
    setBusy(true);
    if (fromChipIndex !== undefined) {
      api.feedback({
        kind: 'chip_choice',
        seedId: current.seedId,
        conversationId,
        payload: { index: fromChipIndex, text: content, options: chips },
      });
    }
    setChips([]);
    setInput('');
    setReporting(false);
    setMessages((m) => [...m, { role: 'user', content }]);

    try {
      setStreaming('');
      const { text: full, suggestions } = await api.sendMessage(conversationId, content, (delta) =>
        setStreaming((s) => s + delta),
      );
      setStreaming('');
      setMessages((m) => [...m, { role: 'assistant', content: full }]);
      setChips(suggestions);
      setReported(false);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: `(error: ${e instanceof Error ? e.message : 'failed'})` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function submitReport() {
    if (!current) return;
    api.feedback({
      kind: 'bad',
      seedId: current.seedId,
      conversationId: conversationId ?? undefined,
      payload: {
        note: reportNote.trim(),
        shownOptions: openerOptions ?? chips,
        lastAssistant: messages.filter((m) => m.role === 'assistant').at(-1)?.content ?? null,
      },
    });
    setReporting(false);
    setReportNote('');
    setReported(true);
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
  const showFeedbackRow = (openerOptions?.length ?? 0) > 0 || chips.length > 0;

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

      {openerOptions && openerOptions.length > 0 && (
        <div>
          <div className="small muted" style={{ padding: '4px 0' }}>
            pick how this one starts:
          </div>
          <div className="openers">
            {openerOptions.map((o, i) => (
              <button key={i} className="opener-option" onClick={() => pickOpener(o, i)} disabled={busy}>
                {o}
              </button>
            ))}
          </div>
        </div>
      )}

      {chips.length > 0 && (
        <div className="chips">
          {chips.map((c, i) => (
            <button key={i} className="chip" onClick={() => send(c, i)} disabled={busy}>
              {c}
            </button>
          ))}
        </div>
      )}

      {showFeedbackRow && !reporting && !reported && (
        <div>
          <button className="ghost small badlink" onClick={() => setReporting(true)}>
            this is bad
          </button>
        </div>
      )}
      {reporting && (
        <div className="card" style={{ margin: '4px 0' }}>
          <div className="small muted" style={{ paddingBottom: 6 }}>
            what's wrong with these options? (saved for prompt tuning)
          </div>
          <textarea
            value={reportNote}
            rows={2}
            placeholder="too generic / wrong place / weird tone…"
            onChange={(e) => setReportNote(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
            <button className="primary" onClick={submitReport} disabled={!reportNote.trim()}>
              Save note
            </button>
            <button className="ghost" onClick={() => setReporting(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {reported && <div className="small muted" style={{ padding: '4px 0' }}>noted — thanks.</div>}

      {!openerOptions && (
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
      )}
    </div>
  );
}
