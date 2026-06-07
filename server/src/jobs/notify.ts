/**
 * `coordinator:check-notify` + `notify:push`. Once every moment has reached a
 * terminal state (seeded|error) and at least one seed exists, send a single web
 * push: "I looked through your photos — I've got some things to talk about."
 */

import webpush from 'web-push';
import { query } from '../db';
import { enqueue, JOBS } from '../queue';
import { env } from '../env';

let vapidConfigured = false;
function ensureVapid(): boolean {
  if (!env.vapid.publicKey || !env.vapid.privateKey) return false;
  if (!vapidConfigured) {
    webpush.setVapidDetails(env.vapid.subject, env.vapid.publicKey, env.vapid.privateKey);
    vapidConfigured = true;
  }
  return true;
}

export async function runCheckNotify(): Promise<void> {
  const pending = await query<{ n: string }>(
    `select count(*)::text as n from moments where status not in ('seeded','error')`,
  );
  if (Number(pending.rows[0]?.n ?? '0') > 0) return; // not all done

  const seeds = await query<{ n: string }>(
    `select count(*)::text as n from conversation_seeds where status = 'unused'`,
  );
  if (Number(seeds.rows[0]?.n ?? '0') === 0) return;

  await enqueue(JOBS.notifyPush, {}, { singletonKey: 'notify-push' });
}

export async function runNotifyPush(): Promise<void> {
  if (!ensureVapid()) {
    console.warn('[notify] VAPID keys unset — skipping push');
    return;
  }

  const subs = await query<{ id: string; subscription: webpush.PushSubscription }>(
    'select id, subscription from push_subscriptions',
  );

  const payload = JSON.stringify({
    title: 'Lookback',
    body: "I looked through your photos — I've got some things to talk about.",
    url: '/',
  });

  for (const row of subs.rows) {
    try {
      await webpush.sendNotification(row.subscription, payload);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // 404/410 mean the subscription is dead — prune it.
      if (status === 404 || status === 410) {
        await query('delete from push_subscriptions where id = $1', [row.id]);
      } else {
        console.error('[notify] push failed', err);
      }
    }
  }
}
