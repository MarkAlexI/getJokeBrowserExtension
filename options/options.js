'use strict';
(() => {
  const api = globalThis.browser ?? globalThis.chrome, core = globalThis.GetJokeCore;
  const { t } = globalThis.GetJokeI18n;
  const el = id => document.getElementById(id);
  const fields = el('settings-fields'), error = el('settings-error'), status = el('save-status');
  const inputs = [...document.querySelectorAll('input[name="category"]')];
  let saving = false;
  function updateCategories() {
    const mode = el('safe-mode').checked ? 'safe' : 'unsafe';
    const language = el('language').value;
    const available = core.getAvailableCategories({ lang: language, joketypes: mode });
    let adjusted = false;
    for (const input of inputs) {
      input.disabled = !available.includes(input.value);
      const reason = input.disabled ? input.value === 'Dark' && mode === 'safe' ? t('unavailableSafe') : t('unavailableLanguage', core.LANGUAGES[language]) : '';
      input.closest('label').title = reason;
      if (input.disabled && input.checked) { input.checked = false; adjusted = true; }
    }
    if (!inputs.some(input => input.checked && !input.disabled)) {
      inputs.forEach(input => { input.checked = !input.disabled; });
      adjusted = true;
    }
    el('category-adjustment').textContent = adjusted ? t('categoriesAdjusted') : '';
  }
  async function load() {
    fields.disabled = true; error.hidden = true; el('retry-settings').hidden = true; status.textContent = t('loadingSettings');
    try {
      const p = core.normalizePreferences(await api.storage.sync.get(core.PREF_KEYS));
      inputs.forEach(input => { input.checked = p.categories.includes(input.value); });
      el('language').value = p.lang; el('theme').value = p.theme;
      el('safe-mode').checked = p.joketypes === 'safe'; el('hide-punchline').checked = p.revealPunchline;
      updateCategories();
      document.documentElement.dataset.theme = p.theme; fields.disabled = false; status.textContent = '';
    } catch {
      status.textContent = ''; error.textContent = t('settingsLoadFailed'); error.hidden = false; el('retry-settings').hidden = false;
    }
  }
  el('retry-settings').addEventListener('click', load);
  el('all-categories').addEventListener('click', () => { inputs.forEach(input => { input.checked = !input.disabled; }); status.textContent = t('unsavedChanges'); });
  el('settings-form').addEventListener('change', event => {
    if (event.target === el('language') || event.target === el('safe-mode')) updateCategories();
    document.documentElement.dataset.theme = el('theme').value; status.textContent = t('unsavedChanges'); error.hidden = true;
  });
  el('settings-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || fields.disabled) return;
    const available = core.getAvailableCategories({ lang: el('language').value, joketypes: el('safe-mode').checked ? 'safe' : 'unsafe' });
    const categories = inputs.filter(input => input.checked && !input.disabled && available.includes(input.value)).map(input => input.value);
    if (!categories.length) { error.textContent = t('categoryRequired'); error.hidden = false; inputs.find(input => !input.disabled)?.focus(); return; }
    const p = core.normalizePreferences({ categories, lang: el('language').value, theme: el('theme').value, joketypes: el('safe-mode').checked ? 'safe' : 'unsafe', revealPunchline: el('hide-punchline').checked });
    saving = true; fields.disabled = true; error.hidden = true; status.textContent = t('savingSettings');
    try { await api.storage.sync.set(p); status.textContent = t('settingsSaved'); }
    catch { status.textContent = t('settingsNotSaved'); error.textContent = t('settingsSaveFailed'); error.hidden = false; }
    finally { saving = false; fields.disabled = false; }
  });
  load();
})();
