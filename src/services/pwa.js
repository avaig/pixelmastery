const listeners = new Set();
let deferredPrompt = null;

function notify() {
  listeners.forEach((listener) => listener());
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.info(`PWA service worker registration failed: ${error.message}`);
      });
    });
  }
}

export function subscribeInstall(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function hasInstallPrompt() {
  return deferredPrompt !== null && !isStandalone();
}

export function getManualInstallHint() {
  if (isStandalone()) return null;
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  return isIos ? 'To install, tap Share, then Add to Home Screen.' : null;
}

export async function promptInstall() {
  if (!deferredPrompt) return;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  notify();
  prompt.prompt();
  await prompt.userChoice;
}