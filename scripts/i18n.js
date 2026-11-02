'use strict';
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const locales = ['en', 'uk', 'pl', 'de', 'fr', 'es'];
  function t(key, substitutions) {
    const value = api.i18n.getMessage(key, substitutions);
    return value || '[' + key + ']';
  }
  function apply() {
    const language = api.i18n.getUILanguage().toLowerCase().split(/[-_]/)[0];
    document.documentElement.lang = locales.includes(language) ? language : 'en';
    for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
    for (const [attribute, selector] of [['title', 'data-i18n-title'], ['aria-label', 'data-i18n-aria-label']]) {
      for (const element of document.querySelectorAll('[' + selector + ']')) element.setAttribute(attribute, t(element.getAttribute(selector)));
    }
  }
  globalThis.GetJokeI18n = Object.freeze({ t, apply });
  apply();
})();
