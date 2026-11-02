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
    let refreshingForUpdate = false;
    let registration = null;

    const checkForUpdates = () => {
      if (registration && navigator.onLine) {
        registration.update().catch((error) => {
          console.info(`PWA update check skipped: ${error.message}`);
        });
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshingForUpdate) return;
      refreshingForUpdate = true;
      window.location.reload();
    });

    const registerServiceWorker = async () => {
      try {
        registration = await navigator.serviceWorker.register('/sw.js', {
          updateViaCache: 'none',
        });
        checkForUpdates();

        // Check again whenever a user returns to LOCAL, including an installed PWA.
        window.addEventListener('focus', checkForUpdates);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdates();
        });

        // Keep an already-open app up to date without requiring the customer to do anything.
        window.setInterval(checkForUpdates, 60 * 1000);
      } catch (error) {
        console.info(`PWA service worker registration failed: ${error.message}`);
      }
    };

    if (document.readyState === 'complete') {
      registerServiceWorker();
    } else {
      window.addEventListener('load', registerServiceWorker, { once: true });
    }
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

  if (isIos) return 'To add LOCAL on your iPhone: 1. Tap the Share icon (the square with the upward arrow) at the bottom of this screen. 2. In the Share menu, choose Add to Home Screen. You may need to scroll the menu to find it. 3. Tap Add at the top. LOCAL will then appear on your Home Screen. If Add to Home Screen is not available here, choose Open in Safari from the browser menu, then repeat these steps in the Safari app.';
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