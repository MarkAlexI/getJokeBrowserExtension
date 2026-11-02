'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const c = require('../scripts/core.js');
const single = { error: false, id: 12, lang: 'en', category: 'Programming', type: 'single', joke: '// This line does nothing, but the code stops working when I delete it.', safe: true, flags: {} };
const two = { error: false, id: 51, lang: 'en', category: 'Programming', type: 'twopart', setup: 'Why do programmers wear glasses?', delivery: 'Because they need to C#.', safe: true, flags: {} };
const response = (data, status = 200, retry) => ({ ok: status === 200, status, headers: { get: () => retry }, json: async () => data });

test('upgrades preserve legacy language and unfiltered mode', () => {
  const p = c.normalizePreferences({ lang: 'de', joketypes: 'unsafe' });
  assert.equal(p.lang, 'de'); assert.equal(p.joketypes, 'unsafe'); assert.deepEqual(p.categories, c.getAvailableCategories({lang:'de',joketypes:'unsafe'}));
});
test('corrupt settings recover to safe English defaults', () => {
  for (const raw of [null, { lang: 'xx', joketypes: 'bad', categories: ['<img>'], theme: 'bad' }, { lang: '__proto__' }]) {
    const p = c.normalizePreferences(raw); assert.equal(p.lang, 'en'); assert.equal(p.joketypes, 'safe'); assert.equal(p.theme, 'system');
  }
});
test('category filters are validated, deduplicated and canonically ordered', () => {
  const p = c.normalizePreferences({ categories: ['Pun', 'bad', 'Programming', 'Pun'] });
  assert.deepEqual(p.categories, ['Programming', 'Pun']);
  assert.equal(c.filterKey(p), c.filterKey({ categories: ['Pun', 'Programming'] }));
});
test('requests only allow the fixed endpoint and declared settings', () => {
  const url = new URL(c.buildJokeUrl({ lang: 'de', categories: ['Pun', 'Programming'] }));
  assert.equal(url.origin, 'https://v2.jokeapi.dev'); assert.equal(url.pathname, '/joke/Programming,Pun');
  assert.equal(url.searchParams.get('lang'), 'de'); assert.ok(url.searchParams.has('safe-mode'));
  assert.ok(!new URL(c.buildJokeUrl({ joketypes: 'unsafe' })).searchParams.has('safe-mode'));
});
test('single and two-part jokes render as complete copyable text', async () => {
  assert.equal(c.jokeText(await c.fetchJoke(async () => response(single))), single.joke);
  assert.equal(c.jokeText(await c.fetchJoke(async () => response(two))), two.setup + '\n\n' + two.delivery);
});
test('requests omit cookies and referrer information', async () => {
  await c.fetchJoke(async (url, options) => { assert.equal(options.credentials, 'omit'); assert.equal(options.referrerPolicy, 'no-referrer'); return response(single); });
});
for (const status of [400, 404, 200]) test('API no-matches is handled at HTTP ' + status, async () => {
  await assert.rejects(c.fetchJoke(async () => response({ error: true, code: 106 }, status)), { code: 'no-matches' });
});
for (const status of [403, 500, 503]) test('HTTP ' + status + ' is a service failure', async () => {
  await assert.rejects(c.fetchJoke(async () => response({}, status)), { code: 'service' });
});
test('rate-limit retry respects Retry-After and bounds bad values', async () => {
  for (const [input, expected] of [['3', 3], [null, 60], ['garbage', 60], ['100000', 3600], ['-1', 60]]) {
    await assert.rejects(c.fetchJoke(async () => response({}, 429, input)), e => e.code === 'rate-limit' && e.retryAfter === expected);
  }
});
test('invalid JSON is a recoverable response failure', async () => {
  await assert.rejects(c.fetchJoke(async () => ({ ok: true, json: async () => { throw new SyntaxError(); } })), { code: 'invalid-response' });
});
test('network failure is classified', async () => { await assert.rejects(c.fetchJoke(async () => { throw new TypeError(); }), { code: 'network' }); });
test('wrong-language, wrong-category, empty and malformed jokes are rejected', () => {
  for (const change of [{ lang: 'de' }, { category: 'unknown' }, { joke: '' }, { joke: {} }, { id: -1 }, { type: 'twopart' }, { error: true }]) {
    assert.throws(() => c.validateJoke({ ...single, ...change }), { code: 'invalid-response' });
  }
  assert.throws(() => c.validateJoke(single, { categories: ['Pun'] }), { code: 'invalid-response' });
});
test('safe mode blocks flagged, unsafe and dark responses locally', () => {
  for (const change of [{ safe: false }, { category: 'Dark' }, { flags: { explicit: true } }]) {
    assert.throws(() => c.validateJoke({ ...single, ...change }), { code: 'invalid-response' });
    assert.ok(c.validateJoke({ ...single, ...change }, { joketypes: 'unsafe' }));
  }
});
test('cache never crosses language, safety, category or time boundaries', () => {
  const savedAt = 100000000, entry = { key: c.filterKey({}), joke: single, savedAt };
  assert.equal(c.readCachedJoke(entry, {}, savedAt + 1).joke, single.joke);
  for (const p of [{ lang: 'de' }, { joketypes: 'unsafe' }, { categories: ['Pun'] }]) assert.equal(c.readCachedJoke(entry, p, savedAt + 1), null);
  assert.equal(c.readCachedJoke(entry, {}, savedAt - 1), null);
  assert.equal(c.readCachedJoke(entry, {}, savedAt + c.CACHE_MAX_AGE + 1), null);
  assert.equal(c.readCachedJoke({ ...entry, joke: { ...single, flags: { nsfw: true } } }, {}, savedAt + 1), null);
});
const hanging = (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
test('timeouts end stalled requests', async () => { await assert.rejects(c.fetchJoke(hanging, {}, { timeoutMs: 15 }), { code: 'timeout' }); });
test('a newer request can cancel an older one without reporting a network failure', async () => {
  const controller = new AbortController(), promise = c.fetchJoke(hanging, {}, { signal: controller.signal });
  controller.abort(); await assert.rejects(promise, { code: 'cancelled' });
});
