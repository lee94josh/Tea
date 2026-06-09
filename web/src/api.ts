/** Thin client for the Lookback server. Bearer token kept in localStorage. */

import type {
  ConversationHistory,
  MomentListItem,
  NextSeed,
  StartedConversation,
  StatusReport,
  UploadResult,
} from '@lookback/shared';

// Production default is '' = same origin (the server serves the PWA itself).
// Dev default points at the local API since vite runs on its own port.
const BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? 'http://localhost:8080' : '');
const TOKEN_KEY = 'lookback.token';

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}
export function setToken(t: string): void {
  localStorage.setItem(TOKEN_KEY, t);
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getToken()}` };
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  base: BASE,

  async upload(files: File[], onProgress?: (pct: number) => void): Promise<UploadResult> {
    const form = new FormData();
    for (const f of files) form.append('files', f, f.name);

    // XHR so we get upload progress (fetch can't report it).
    return new Promise<UploadResult>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE}/upload`);
      xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
        else reject(new Error(`${xhr.status} ${xhr.responseText}`));
      };
      xhr.onerror = () => reject(new Error('network error'));
      xhr.send(form);
    });
  },

  async status(): Promise<StatusReport> {
    return json(await fetch(`${BASE}/status`, { headers: authHeaders() }));
  },

  async nextSeed(): Promise<NextSeed | null> {
    return json(await fetch(`${BASE}/seeds/next`, { headers: authHeaders() }));
  },

  async listMoments(): Promise<MomentListItem[]> {
    return json(await fetch(`${BASE}/moments`, { headers: authHeaders() }));
  },

  async startSeed(seedId: string): Promise<StartedConversation> {
    return json(
      await fetch(`${BASE}/seeds/${seedId}/start`, {
        method: 'POST',
        headers: authHeaders(),
      }),
    );
  },

  async conversation(id: string): Promise<ConversationHistory> {
    return json(await fetch(`${BASE}/conversations/${id}`, { headers: authHeaders() }));
  },

  /**
   * Send a message and stream the assistant reply over SSE.
   * Resolves with the full assistant text + fresh suggested replies.
   */
  async sendMessage(
    conversationId: string,
    content: string,
    onDelta: (text: string) => void,
  ): Promise<{ text: string; suggestions: string[] }> {
    const res = await fetch(`${BASE}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok || !res.body) throw new Error(`${res.status} ${await res.text()}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    let suggestions: string[] = [];

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Parse complete SSE events (separated by a blank line).
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const lines = chunk.split('\n');
        const event = lines.find((l) => l.startsWith('event: '))?.slice(7) ?? 'message';
        const dataLine = lines.find((l) => l.startsWith('data: '))?.slice(6) ?? '{}';
        const data = JSON.parse(dataLine);
        if (event === 'delta') {
          full += data.text;
          onDelta(data.text);
        } else if (event === 'suggestions') {
          suggestions = Array.isArray(data.replies) ? data.replies : [];
        } else if (event === 'done') {
          full = data.content ?? full;
        } else if (event === 'error') {
          throw new Error(data.message ?? 'stream error');
        }
      }
    }
    return { text: full, suggestions };
  },

  async vapidPublicKey(): Promise<string> {
    const r = await json<{ publicKey: string }>(
      await fetch(`${BASE}/push/vapid-public-key`, { headers: authHeaders() }),
    );
    return r.publicKey;
  },

  async subscribePush(subscription: PushSubscriptionJSON): Promise<void> {
    await fetch(`${BASE}/push/subscribe`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription }),
    });
  },
};
