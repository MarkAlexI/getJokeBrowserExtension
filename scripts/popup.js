'use strict';
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const core = globalThis.GetJokeCore;
  const { t } = globalThis.GetJokeI18n;
  const el = id => document.getElementById(id);
  const button = el('new-joke'), copyButton = el('copy-joke'), card = el('joke-card');
  let sequence = 0, controller, currentJoke = null, currentKey = '', rateLimitUntil = 0, countdown, disposed = false, copySequence = 0;
  let preferences = core.normalizePreferences();
  function notice(text) { el('notice').textContent = text; el('notice').hidden = !text; }
  function updateButton() {
    const seconds = Math.max(0, Math.ceil((rateLimitUntil - Date.now()) / 1000));
    const busy = card.getAttribute('aria-busy') === 'true';
    button.disabled = busy || seconds > 0;
    el('new-joke-label').textContent = seconds ? t('retrySeconds', String(seconds)) : busy ? t('findingSmile') : t('newJoke');
    if (!seconds && countdown) { clearInterval(countdown); countdown = undefined; }
  }
  function busy(value) {
    card.setAttribute('aria-busy', String(value));
    el('loading').hidden = !value || !!currentJoke;
    copyButton.disabled = value || !currentJoke;
    updateButton();
  }
  function clearJoke() {
    currentJoke = null; currentKey = '';
    el('joke-text').textContent = ''; el('punchline').textContent = '';
    el('punchline').hidden = true; el('reveal').hidden = true;
    el('category').textContent = t('categoryPlaceholder'); copyButton.disabled = true; el('cache-note').hidden = true;
  }
  function render(joke, cached = false) {
    currentJoke = joke; currentKey = core.filterKey(preferences);
    el('category').textContent = t('cat' + joke.category);
    el('joke-text').textContent = joke.type === 'single' ? joke.joke : joke.setup;
    el('joke-text').lang = joke.lang; el('punchline').lang = joke.lang;
    el('punchline').textContent = joke.type === 'twopart' ? joke.delivery : '';
    const hide = joke.type === 'twopart' && preferences.revealPunchline;
    el('punchline').hidden = joke.type !== 'twopart' || hide;
    el('reveal').hidden = !hide; el('reveal').setAttribute('aria-expanded', 'false');
    el('cache-note').hidden = !cached; el('copy-status').textContent = '';
    el('loading').hidden = true; el('empty-state').hidden = true;
  }
  const messages = {
    network: 'errorNetwork', timeout: 'errorTimeout', service: 'errorService',
    'invalid-response': 'errorInvalidResponse', 'no-matches': 'errorNoMatches', preferences: 'errorPreferences',
  };
  async function refreshJoke() {
    if (disposed) return;
    const request = ++sequence;
    controller?.abort(); controller = new AbortController();
    const signal = controller.signal, current = () => request === sequence && !disposed;
    copySequence++; el('copy-status').textContent = '';
    notice(''); busy(true); el('empty-state').hidden = true;
    try {
      let raw;
      try { raw = await api.storage.sync.get(core.PREF_KEYS); } catch { throw new core.JokeError('preferences'); }
      if (!current()) return;
      preferences = core.normalizePreferences(raw);
      document.documentElement.dataset.theme = preferences.theme;
      el('mode-label').textContent = t(preferences.joketypes === 'safe' ? 'safeMode' : 'unfiltered');
      el('language-label').textContent = core.LANGUAGES[preferences.lang];
      if (currentKey !== core.filterKey(preferences)) { clearJoke(); busy(true); }
      if (!currentJoke) {
        try {
          const saved = await api.storage.local.get(core.CACHE_KEY);
          if (!current()) return;
          const cached = core.readCachedJoke(saved[core.CACHE_KEY], preferences);
          if (cached) render(cached, true);
        } catch { /* Cache failure must not prevent fetching. */ }
      }
      if (!current()) return;
      if (Date.now() < rateLimitUntil) {
        notice(t('errorRateLimit'));
        if (!currentJoke) el('empty-state').hidden = false;
        return;
      }
      const joke = await core.fetchJoke(globalThis.fetch.bind(globalThis), preferences, { signal });
      if (!current()) return;
      render(joke);
      try { await api.storage.local.set({ [core.CACHE_KEY]: { joke, key: currentKey, savedAt: Date.now() } }); }
      catch { /* Showing a joke does not depend on caching it. */ }
    } catch (error) {
      if (!current() || error.code === 'cancelled') return;
      if (error.code === 'rate-limit') {
        rateLimitUntil = Date.now() + error.retryAfter * 1000;
        countdown = setInterval(updateButton, 1000);
        notice(t('errorRateLimit'));
      } else notice(t(messages[error.code] || messages.network));
      if (currentJoke) el('cache-note').hidden = false;
      else el('empty-state').hidden = false;
    } finally { if (current()) busy(false); }
  }
  button.addEventListener('click', refreshJoke);
  el('reveal').addEventListener('click', () => {
    el('punchline').hidden = false; el('reveal').setAttribute('aria-expanded', 'true'); el('reveal').hidden = true;
  });
  copyButton.addEventListener('click', async () => {
    if (!currentJoke) return;
    const request = ++copySequence, text = core.jokeText(currentJoke);
    try {
      await navigator.clipboard.writeText(text);
      if (!disposed && request === copySequence) el('copy-status').textContent = t('copied');
    } catch {
      if (!disposed && request === copySequence) el('copy-status').textContent = t('copyFailed');
    }
  });
  el('settings').addEventListener('click', async () => {
    try { await api.runtime.openOptionsPage(); } catch { notice(t('errorOpenSettings')); }
  });
  function changed(changes, area) {
    if (area === 'sync' && core.PREF_KEYS.some(key => Object.hasOwn(changes, key))) refreshJoke();
  }
  api.storage.onChanged.addListener(changed);
  window.addEventListener('pagehide', () => {
    disposed = true; sequence++; controller?.abort(); clearInterval(countdown); api.storage.onChanged.removeListener(changed);
  }, { once: true });
  refreshJoke();
})();
