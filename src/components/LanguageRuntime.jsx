import { useEffect } from 'react';
import { getLanguage, tr } from '@/services/i18n';

const textOriginals = new WeakMap();
const attributeOriginals = new WeakMap();
const TRANSLATABLE_ATTRIBUTES = ['placeholder', 'aria-label', 'title'];

function translateElement(element, language) {
  if (!(element instanceof HTMLElement)) return;

  if (!attributeOriginals.has(element)) {
    attributeOriginals.set(element, new Map());
  }
  const originals = attributeOriginals.get(element);

  for (const attribute of TRANSLATABLE_ATTRIBUTES) {
    if (!element.hasAttribute(attribute)) continue;
    if (!originals.has(attribute)) {
      originals.set(attribute, element.getAttribute(attribute));
    }
    const original = originals.get(attribute);
    const translated = tr(original, language);
    if (element.getAttribute(attribute) !== translated) {
      element.setAttribute(attribute, translated);
    }
  }
}

function translateTextNode(node, language) {
  if (!node || node.nodeType !== Node.TEXT_NODE) return;
  const parent = node.parentElement;
  if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) return;

  if (!textOriginals.has(node)) {
    textOriginals.set(node, node.nodeValue ?? '');
  }

  const original = textOriginals.get(node);
  const translated = tr(original, language);
  if (node.nodeValue !== translated) {
    node.nodeValue = translated;
  }
}

function scan(root, language) {
  if (!root) return;

  if (root.nodeType === Node.ELEMENT_NODE) {
    translateElement(root, language);
  }

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
  );

  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      translateTextNode(current, language);
    } else if (current.nodeType === Node.ELEMENT_NODE) {
      translateElement(current, language);
    }
    current = walker.nextNode();
  }
}

export default function LanguageRuntime() {
  useEffect(() => {
    let language = getLanguage();
    let running = false;

    const run = () => {
      if (running) return;
      running = true;
      try {
        scan(document.body, language);
      } finally {
        running = false;
      }
    };

    run();

    const observer = new MutationObserver(() => run());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRIBUTES,
    });

    const onLanguageChange = (event) => {
      language = event?.detail?.language === 'hi' || event?.detail?.language === 'en'
        ? event.detail.language
        : getLanguage();
      run();
    };
    const onStorage = (event) => {
      if (event.key !== 'local_language') return;
      language = getLanguage();
      run();
    };

    window.addEventListener('local-language-change', onLanguageChange);
    window.addEventListener('storage', onStorage);

    return () => {
      observer.disconnect();
      window.removeEventListener('local-language-change', onLanguageChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return null;
}
