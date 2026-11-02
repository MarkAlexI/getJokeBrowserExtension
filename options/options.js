'use strict';
(() => {
  const api = globalThis.browser ?? globalThis.chrome, core = globalThis.GetJokeCore;
  const el = id => document.getElementById(id);
  const fields = el('settings-fields'), error = el('settings-error'), status = el('save-status');
  const inputs = [...document.querySelectorAll('input[name="category"]')];
  let saving = false;
  async function load() {
    fields.disabled = true; error.hidden = true; el('retry-settings').hidden = true; status.textContent = 'Loading your settings…';
    try {
      const p = core.normalizePreferences(await api.storage.sync.get(core.PREF_KEYS));
      inputs.forEach(input => { input.checked = p.categories.includes(input.value); });
      el('language').value = p.lang; el('theme').value = p.theme;
      el('safe-mode').checked = p.joketypes === 'safe'; el('hide-punchline').checked = p.revealPunchline;
      document.documentElement.dataset.theme = p.theme; fields.disabled = false; status.textContent = '';
    } catch {
      status.textContent = ''; error.textContent = 'Couldn’t load your settings. Please try again.'; error.hidden = false; el('retry-settings').hidden = false;
    }
  }
  el('retry-settings').addEventListener('click', load);
  el('all-categories').addEventListener('click', () => { inputs.forEach(input => { input.checked = true; }); status.textContent = 'Unsaved changes'; });
  el('settings-form').addEventListener('change', () => { document.documentElement.dataset.theme = el('theme').value; status.textContent = 'Unsaved changes'; error.hidden = true; });
  el('settings-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || fields.disabled) return;
    const categories = inputs.filter(input => input.checked).map(input => input.value);
    if (!categories.length) { error.textContent = 'Choose at least one joke category.'; error.hidden = false; inputs[0].focus(); return; }
    const p = core.normalizePreferences({ categories, lang: el('language').value, theme: el('theme').value, joketypes: el('safe-mode').checked ? 'safe' : 'unsafe', revealPunchline: el('hide-punchline').checked });
    saving = true; fields.disabled = true; error.hidden = true; status.textContent = 'Saving…';
    try { await api.storage.sync.set(p); status.textContent = 'Settings saved'; }
    catch { status.textContent = 'Your changes haven’t been saved.'; error.textContent = 'Couldn’t save your settings. Please try again.'; error.hidden = false; }
    finally { saving = false; fields.disabled = false; }
  });
  load();
})();
