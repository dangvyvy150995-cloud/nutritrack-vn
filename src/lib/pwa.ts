/**
 * PWA helpers: install prompt, standalone detection, and device notifications.
 * Kept framework-free so main.tsx can start listening before React mounts
 * (Chrome fires `beforeinstallprompt` early).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function initInstallCapture() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // show our own button instead of the mini-infobar
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => { installed = true; deferred = null; emit(); });
}

export function subscribeInstall(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
export const canPromptInstall = () => deferred != null;

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const ev = deferred;
  deferred = null;
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  emit();
  return outcome === 'accepted';
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return installed
    || window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// ---------- notifications ----------

export type NotifSupport = 'granted' | 'denied' | 'default' | 'unsupported';

export function notificationSupport(): NotifSupport {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotifSupport> {
  if (notificationSupport() === 'unsupported') return 'unsupported';
  try { return await Notification.requestPermission(); } catch { return notificationSupport(); }
}

/** Show a notification through the service worker when possible (required on Android & iOS). */
export async function showDeviceNotification(title: string, body: string, opts: { tag?: string; url?: string } = {}): Promise<boolean> {
  if (notificationSupport() !== 'granted') return false;
  const options: NotificationOptions = { body, tag: opts.tag, icon: '/pwa-192x192.png', badge: '/pwa-192x192.png', data: { url: opts.url ?? '/' } };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) { await reg.showNotification(title, options); return true; }
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

// ---------- service worker updates ----------

let updateFn: ((reload?: boolean) => Promise<void>) | null = null;
let needRefresh = false;
export const updateAvailable = () => needRefresh;
export function setUpdateHandler(fn: (reload?: boolean) => Promise<void>) { updateFn = fn; }
export function markUpdateAvailable() { needRefresh = true; emit(); }
export async function applyUpdate() { needRefresh = false; emit(); if (updateFn) await updateFn(true); else location.reload(); }
