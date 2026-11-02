const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../scripts/core.js');
test('Safe mode must be a bare flag, never safe-mode=', () => {
  const url = core.buildJokeUrl({joketypes:'safe'});
  assert.ok(url.endsWith('&safe-mode'));
  assert.ok(!url.includes('safe-mode='));
  assert.equal(new URL(url).searchParams.get('blacklistFlags'),'nsfw,religious,political,racist,sexist,explicit');
  assert.ok(!core.buildJokeUrl({joketypes:'unsafe'}).includes('safe-mode'));
  assert.ok(!new URL(core.buildJokeUrl({joketypes:'unsafe'})).searchParams.has('blacklistFlags'));
});
test('Safe mode must exclude Dark from defaults and requests', () => {
  const prefs = core.normalizePreferences({});
  assert.ok(!prefs.categories.includes('Dark'));
  assert.ok(!new URL(core.buildJokeUrl(prefs)).pathname.includes('Dark'));
});
test('old Dark-only Safe preferences recover to available categories', () => {
  const prefs = core.normalizePreferences({joketypes:'safe',categories:['Dark']});
  assert.ok(prefs.categories.length > 0);
  assert.ok(!prefs.categories.includes('Dark'));
});
test('English Puns and Spooky remain available with Safe mode', () => {
  const available = core.getAvailableCategories({lang:'en',joketypes:'safe'});
  assert.ok(available.includes('Pun')); assert.ok(available.includes('Spooky'));
});
test('categories respect the joke language independently of the UI locale', () => {
  assert.deepEqual(core.getAvailableCategories({lang:'cs'}), ['Misc']);
  assert.deepEqual(core.getAvailableCategories({lang:'es'}), ['Programming']);
  assert.deepEqual(core.getAvailableCategories({lang:'fr'}), ['Misc']);
  assert.ok(!core.getAvailableCategories({lang:'de'}).includes('Spooky'));
});
test('every language and mode repairs impossible old categories before fetching', () => {
  for (const lang of Object.keys(core.LANGUAGES)) for (const joketypes of ['safe','unsafe']) {
    for (const categories of [[], ['Dark'], ['Pun','Spooky'], core.CATEGORIES]) {
      const raw={lang,joketypes,categories}, p=core.normalizePreferences(raw), available=core.getAvailableCategories(raw);
      assert.ok(p.categories.length); assert.ok(p.categories.every(cat=>available.includes(cat)));
      const url=core.buildJokeUrl(raw);
      assert.equal(new URL(url).searchParams.get('lang'),lang);
      if(joketypes==='safe'){assert.ok(!p.categories.includes('Dark'));assert.ok(url.endsWith('&safe-mode'));}
    }
  }
});
test('compatible selected categories survive mode changes; unsafe categories require explicit selection', () => {
  const p=core.normalizePreferences({categories:['Programming','Pun','Dark'],joketypes:'safe'});
  assert.deepEqual(p.categories,['Programming','Pun']);
  assert.deepEqual(core.normalizePreferences({...p,joketypes:'unsafe'}).categories,['Programming','Pun']);
});
test('stored categories are never sent after they become unavailable for the language', () => {
  const url=core.buildJokeUrl({lang:'fr',joketypes:'safe',categories:['Dark','Pun','Spooky']});
  assert.equal(new URL(url).pathname,'/joke/Misc');
});
