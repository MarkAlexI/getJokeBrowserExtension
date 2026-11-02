(function (root, factory) {
  'use strict';
  const core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  else root.GetJokeCore = core;
})(globalThis, function () {
  'use strict';
  const CATEGORIES = Object.freeze(['Programming', 'Misc', 'Pun', 'Spooky', 'Christmas', 'Dark']);
  const LANGUAGES = Object.freeze({ en: 'English', cs: 'Čeština', de: 'Deutsch', es: 'Español', fr: 'Français' });
  // Live JokeAPI category probes, 2026-11-02. Recheck when updating the catalog.
  const CATEGORY_AVAILABILITY = Object.freeze({
    en: { safe: ['Programming', 'Misc', 'Pun', 'Spooky', 'Christmas'], unsafe: [...CATEGORIES] },
    cs: { safe: ['Misc'], unsafe: ['Misc', 'Dark'] },
    de: { safe: ['Programming', 'Misc', 'Pun', 'Christmas'], unsafe: ['Programming', 'Misc', 'Pun', 'Christmas'] },
    es: { safe: ['Programming'], unsafe: ['Programming', 'Misc'] },
    fr: { safe: ['Misc'], unsafe: ['Misc', 'Dark'] },
  });
  const PREF_KEYS = Object.freeze(['joketypes', 'lang', 'categories', 'theme', 'revealPunchline']);
  const CACHE_KEY = 'getJokeLastResultV2';
  const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
  function getAvailableCategories(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const language = Object.hasOwn(LANGUAGES, source.lang) ? source.lang : 'en';
    const mode = source.joketypes === 'unsafe' ? 'unsafe' : 'safe';
    return [...CATEGORY_AVAILABILITY[language][mode]];
  }
  function normalizePreferences(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const chosen = Array.isArray(source.categories) ? source.categories : [];
    const available = getAvailableCategories(source);
    const categories = available.filter(category => chosen.includes(category));
    return {
      joketypes: source.joketypes === 'unsafe' ? 'unsafe' : 'safe',
      lang: Object.hasOwn(LANGUAGES, source.lang) ? source.lang : 'en',
      categories: categories.length ? categories : available,
      theme: ['light', 'dark'].includes(source.theme) ? source.theme : 'system',
      revealPunchline: source.revealPunchline !== false,
    };
  }
  function filterKey(raw) {
    const p = normalizePreferences(raw);
    return JSON.stringify([p.lang, p.joketypes, p.categories]);
  }
  function buildJokeUrl(raw) {
    const p = normalizePreferences(raw);
    const category = p.categories.length === CATEGORIES.length ? 'Any' : p.categories.join(',');
    const url = new URL('https://v2.jokeapi.dev/joke/' + category);
    url.searchParams.set('lang', p.lang);
    if (p.joketypes === 'safe') url.searchParams.set('blacklistFlags', 'nsfw,religious,political,racist,sexist,explicit');
    // JokeAPI treats an empty value (safe-mode=) differently from its bare flag.
    return url.href + (p.joketypes === 'safe' ? '&safe-mode' : '');
  }
  class JokeError extends Error {
    constructor(code, retryAfter = 0) { super(code); this.name = 'JokeError'; this.code = code; this.retryAfter = retryAfter; }
  }
  function validateJoke(raw, preferences) {
    const p = normalizePreferences(preferences);
    const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 6000;
    if (!raw || raw.error !== false || !CATEGORIES.includes(raw.category) || raw.lang !== p.lang ||
        !p.categories.includes(raw.category) || !Number.isSafeInteger(raw.id) || raw.id < 0 ||
        (raw.type !== 'single' && raw.type !== 'twopart') ||
        (raw.type === 'single' ? !text(raw.joke) : !text(raw.setup) || !text(raw.delivery))) throw new JokeError('invalid-response');
    const flags = raw.flags && typeof raw.flags === 'object' ? raw.flags : {};
    if (p.joketypes === 'safe' && (raw.safe === false || raw.category === 'Dark' || Object.values(flags).some(v => v === true))) throw new JokeError('invalid-response');
    return {
      error: false, id: raw.id, lang: raw.lang, category: raw.category, type: raw.type,
      ...(raw.type === 'single' ? { joke: raw.joke.trim() } : { setup: raw.setup.trim(), delivery: raw.delivery.trim() }),
      safe: raw.safe !== false, flags: Object.fromEntries(Object.entries(flags).filter(([k, v]) =>
        ['nsfw', 'religious', 'political', 'racist', 'sexist', 'explicit'].includes(k) && typeof v === 'boolean')),
    };
  }
  async function fetchJoke(fetcher, preferences, { signal, timeoutMs = 12000 } = {}) {
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    if (signal?.aborted) throw new JokeError('cancelled');
    signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetcher(buildJokeUrl(preferences), { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) {
        if (response.status === 429) {
          const retry = Number(response.headers?.get('Retry-After'));
          throw new JokeError('rate-limit', Number.isFinite(retry) && retry > 0 ? Math.min(Math.ceil(retry), 3600) : 60);
        }
        if (response.status === 400 || response.status === 404) {
          let payload;
          try { payload = await response.json(); } catch { /* Keep the HTTP error. */ }
          if (payload?.error === true && payload.code === 106) throw new JokeError('no-matches');
        }
        throw new JokeError('service');
      }
      let data;
      try { data = await response.json(); } catch (error) {
        if (controller.signal.aborted) throw error;
        throw new JokeError('invalid-response');
      }
      if (data?.error === true) throw new JokeError(data.code === 106 ? 'no-matches' : 'service');
      return validateJoke(data, preferences);
    } catch (error) {
      if (timedOut) throw new JokeError('timeout');
      if (signal?.aborted) throw new JokeError('cancelled');
      if (error instanceof JokeError) throw error;
      throw new JokeError('network');
    } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
  }
  function readCachedJoke(entry, preferences, now = Date.now()) {
    if (!entry || entry.key !== filterKey(preferences) || !Number.isFinite(entry.savedAt) || now < entry.savedAt || now - entry.savedAt > CACHE_MAX_AGE) return null;
    try { return validateJoke(entry.joke, preferences); } catch { return null; }
  }
  function jokeText(joke) { return joke.type === 'single' ? joke.joke : joke.setup + '\n\n' + joke.delivery; }
  return Object.freeze({ CATEGORIES, LANGUAGES, PREF_KEYS, CACHE_KEY, CACHE_MAX_AGE, getAvailableCategories, normalizePreferences, filterKey, buildJokeUrl, JokeError, validateJoke, fetchJoke, readCachedJoke, jokeText });
});
