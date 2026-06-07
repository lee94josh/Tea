/**
 * Web push enrolment. On iOS this only works AFTER the PWA is installed to the
 * home screen and notification permission is granted post-install — so call
 * this from a user gesture once installed, not on first load.
 */

import { api } from './api';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'Push not supported on this browser.' };
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'Permission denied.' };

  const reg = await navigator.serviceWorker.ready;
  const vapid = await api.vapidPublicKey();
  if (!vapid) return { ok: false, reason: 'Server has no VAPID key configured.' };

  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid),
    }));

  await api.subscribePush(sub.toJSON());
  return { ok: true };
}
