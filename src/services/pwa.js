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
  const userAgent = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(userAgent);
  const isChrome = /Chrome|CriOS/i.test(userAgent) && !/Edg|OPR|SamsungBrowser/i.test(userAgent);

  if (isIos) return 'Open this page in Safari, tap Share, then choose Add to Home Screen.';
  if (isAndroid && isChrome) return 'In Chrome, tap ⋮ (three dots), then choose Install app or Add to Home screen.';
  if (isAndroid) return 'Open this page in Chrome, tap ⋮ (three dots), then choose Install app or Add to Home screen.';
  if (isChrome) return 'Look for the Install icon in the address bar, or open Chrome ⋮ and choose Install LOCAL.';
  return 'Open your browser menu and look for Install app or Add to Home screen. The wording depends on your browser.';
}

export async function promptInstall() {
  if (!deferredPrompt) return;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  notify();
  prompt.prompt();
  await prompt.userChoice;
}