'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { once } = require('node:events');
const pw = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright') : 'playwright');
const root = path.resolve(__dirname, '..');
const two = { error: false, id: 51, lang: 'en', category: 'Programming', type: 'twopart', setup: 'Why do programmers wear glasses?', delivery: 'Because they need to C#.', safe: true, flags: {} };
const single = { error: false, id: 12, lang: 'en', category: 'Programming', type: 'single', joke: '// This line doesn’t actually do anything, but the code stops working when I delete it.', safe: true, flags: {} };
const result = [];
const catalogs=Object.fromEntries(['en','uk','pl','de','fr','es'].map(locale=>[locale,require('../_locales/'+locale+'/messages.json')]));
const server = http.createServer(async (req, res) => {
  const filename = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!filename.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  try {
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(filename)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type }); res.end(await fs.readFile(filename));
  } catch { res.writeHead(404); res.end(); }
});

function init({ prefs, namespace, messages, uiLanguage }) {
  const listeners = new Set();
  const read = key => JSON.parse(localStorage.getItem(key) || '{}');
  if (!localStorage.getItem('testPrefs')) localStorage.setItem('testPrefs', JSON.stringify(prefs));
  window.__test = { failGet: false, failSet: false, copied: '', opened: 0 };
  const api = {
    i18n: {
      getUILanguage:()=>uiLanguage,
      getMessage:(key,substitutions=[])=>{
        const entry=messages[key];if(!entry)return '';
        const values=Array.isArray(substitutions)?substitutions:[substitutions];
        return entry.message.replace(/\$([\w]+)\$/g,(all,name)=>{
          const content=entry.placeholders?.[name]?.content;
          return content?String(values[Number(content.slice(1))-1]??''):all;
        });
      },
    },
    storage: {
      sync: {
        get: async () => { if (window.__test.failGet) throw new Error('read failed'); return read('testPrefs'); },
        set: async data => {
          if (window.__test.failSet) throw new Error('write failed');
          const before = read('testPrefs'), after = { ...before, ...data };
          localStorage.setItem('testPrefs', JSON.stringify(after));
          const changes = Object.fromEntries(Object.keys(data).map(key => [key, { oldValue: before[key], newValue: after[key] }]));
          for (const fn of listeners) fn(changes, 'sync');
        },
      },
      local: { get: async () => read('testLocal'), set: async data => localStorage.setItem('testLocal', JSON.stringify({ ...read('testLocal'), ...data })) },
      onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) },
    },
    runtime: { openOptionsPage: async () => { window.__test.opened++; } },
  };
  Object.defineProperty(globalThis, namespace, { value: api, configurable: true });
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.__test.copied = text; } }, configurable: true });
  window.__test.changePrefs = data => api.storage.sync.set(data);
}

async function run(browserName, executablePath) {
  const browser = await pw[browserName].launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: browserName === 'chromium' ? ['--no-sandbox'] : [], env: { ...process.env, MOZ_DISABLE_CONTENT_SANDBOX: '1' } });
  const version = await browser.version();
  const base = `http://127.0.0.1:${server.address().port}`;
  const namespace = browserName === 'firefox' ? 'browser' : 'chrome';
  async function fixture(prefs = {}, routeHandler, uiLanguage='en') {
    const context = await browser.newContext({ viewport: { width: 400, height: 650 }, colorScheme: 'light' });
    await context.addInitScript(init, { prefs, namespace, messages:catalogs[uiLanguage], uiLanguage });
    const errors = [];
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await context.route('https://v2.jokeapi.dev/**', routeHandler || (route => route.fulfill({ json: two, headers: { 'Access-Control-Allow-Origin': '*' } })));
    return { context, page, errors };
  }
  async function scenario(name, fn) {
    await fn(); result.push({ browser: browserName, version, name, pass: true }); console.log(browserName + ': ' + name);
  }
  try {
    await scenario('Safe mode disables and unchecks Dark; Select available cannot enable it',async()=>{
      const {page,context,errors}=await fixture();await page.goto(base+'/options/options.html');await page.locator('#settings-fields:not([disabled])').waitFor();
      const dark=page.locator('input[value="Dark"]');assert.equal(await dark.isDisabled(),true);assert.equal(await dark.isChecked(),false);
      for(const name of ['Pun','Spooky'])assert.equal(await page.locator('input[value="'+name+'"]').isDisabled(),false);
      await page.locator('#all-categories').click();assert.equal(await dark.isChecked(),false);
      await page.locator('#save-settings').click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Settings saved');
      const prefs=await page.evaluate(()=>JSON.parse(localStorage.getItem('testPrefs')));assert.ok(!prefs.categories.includes('Dark'));assert.deepEqual(errors,[]);await context.close();
    });
    await scenario('mode changes remove an unsafe-only selection and keep a nonempty safe fallback',async()=>{
      const {page,context,errors}=await fixture({joketypes:'unsafe',categories:['Dark']});await page.goto(base+'/options/options.html');await page.locator('#settings-fields:not([disabled])').waitFor();
      const dark=page.locator('input[value="Dark"]');assert.equal(await dark.isChecked(),true);
      await page.locator('#safe-mode').check();assert.equal(await dark.isDisabled(),true);assert.equal(await dark.isChecked(),false);
      assert.ok(await page.locator('input[name="category"]:checked:not(:disabled)').count()>0);
      await page.locator('#safe-mode').uncheck();assert.equal(await dark.isDisabled(),false);assert.equal(await dark.isChecked(),false);
      assert.deepEqual(errors,[]);await context.close();
    });
    await scenario('joke language immediately disables categories with no matching jokes',async()=>{
      const {page,context,errors}=await fixture({categories:['Pun','Spooky']});await page.goto(base+'/options/options.html');await page.locator('#settings-fields:not([disabled])').waitFor();
      for(const [lang,expected] of [['cs',['Misc']],['es',['Programming']],['fr',['Misc']],['de',['Programming','Misc','Pun','Christmas']]]){
        await page.locator('#language').selectOption(lang);
        assert.deepEqual(await page.locator('input[name="category"]:not(:disabled)').evaluateAll(inputs=>inputs.map(i=>i.value)),expected);
        assert.ok(await page.locator('input[name="category"]:checked:not(:disabled)').count()>0);
      }
      assert.deepEqual(errors,[]);await context.close();
    });
    await scenario('old impossible preferences are repaired before a real fetch call is made',async()=>{
      let requested='';
      const {page,context,errors}=await fixture({lang:'fr',joketypes:'safe',categories:['Dark','Pun','Spooky']},route=>{
        requested=route.request().url();return route.fulfill({json:{...single,lang:'fr',category:'Misc',joke:'Une blague sûre.'},headers:{'Access-Control-Allow-Origin':'*'}});
      });
      await page.goto(base+'/index.html');await page.waitForFunction(()=>document.querySelector('#joke-card').getAttribute('aria-busy')==='false');
      assert.equal(new URL(requested).pathname,'/joke/Misc');assert.ok(requested.endsWith('&safe-mode'));assert.ok(!requested.includes('safe-mode='));
      assert.equal(await page.locator('#notice').isVisible(),false);assert.equal(await page.locator('#joke-text').innerText(),'Une blague sûre.');assert.deepEqual(errors,[]);await context.close();
    });
    await scenario('all UI locales translate settings and errors without changing the joke language',async()=>{
      for(const locale of Object.keys(catalogs)){
        let requested='';
        const {page,context,errors}=await fixture({},route=>{requested=route.request().url();return route.fulfill({json:{error:true,code:106},headers:{'Access-Control-Allow-Origin':'*'}})},locale);
        await page.goto(base+'/options/options.html');await page.locator('#settings-fields:not([disabled])').waitFor();
        assert.equal(await page.locator('html').getAttribute('lang'),locale);assert.equal(await page.locator('#save-settings [data-i18n="saveSettings"]').innerText(),catalogs[locale].saveSettings.message);
        await page.setViewportSize({width:320,height:800});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),locale+' settings overflow');
        await page.locator('#save-settings').click();await page.waitForFunction(expected=>document.querySelector('#save-status').textContent===expected,catalogs[locale].settingsSaved.message);
        await page.goto(base+'/index.html');await page.locator('#notice').waitFor();
        assert.equal(await page.locator('#notice').innerText(),catalogs[locale].errorNoMatches.message);assert.equal(new URL(requested).searchParams.get('lang'),'en');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),locale+' popup overflow');
        await page.goto(base+'/privacy.html');assert.equal(await page.locator('h2').innerText(),catalogs[locale].privacyHeadline.message);
        assert.deepEqual(errors,[]);await context.close();
      }
    });
    await scenario('two-part reveal, complete copy and settings action', async () => {
      const { page, context, errors } = await fixture(); await page.goto(base + '/index.html');
      await page.locator('#reveal').waitFor({ state: 'visible' }); assert.equal(await page.locator('#punchline').isVisible(), false);
      await page.locator('#reveal').click(); assert.equal(await page.locator('#punchline').innerText(), two.delivery);
      await page.locator('#copy-joke').click(); await page.waitForFunction(() => document.querySelector('#copy-status').textContent === 'Copied!');
      assert.equal(await page.evaluate(() => window.__test.copied), two.setup + '\n\n' + two.delivery);
      await page.locator('#settings').click(); assert.equal(await page.evaluate(() => window.__test.opened), 1);
      assert.deepEqual(errors, []); await context.close();
    });
    await scenario('network error retains matching cached joke after reopening', async () => {
      const { page, context, errors } = await fixture(); await page.goto(base + '/index.html'); await page.locator('#reveal').waitFor();
      await page.waitForFunction(() => localStorage.getItem('testLocal')?.includes('getJokeLastResultV2'));
      await context.unroute('https://v2.jokeapi.dev/**'); await context.route('https://v2.jokeapi.dev/**', route => route.abort());
      await page.reload(); await page.locator('#notice').waitFor(); assert.equal(await page.locator('#joke-text').innerText(), two.setup);
      assert.equal(await page.locator('#cache-note').isVisible(), true); assert.equal(await page.locator('#new-joke').isEnabled(), true);
      assert.deepEqual(errors, []); await context.close();
    });
    await scenario('settings change clears unsafe content even during cooldown', async () => {
      let count = 0;
      const dark = { ...single, category: 'Dark', safe: false, joke: 'Unfiltered fixture' };
      const { page, context } = await fixture({ joketypes: 'unsafe' }, route => route.fulfill(count++ === 0 ? { json: dark, headers: { 'Access-Control-Allow-Origin': '*' } } : { status: 429, json: {}, headers: { 'Access-Control-Allow-Origin': '*', 'Retry-After': '2' } }));
      await page.goto(base + '/index.html'); await page.waitForFunction(() => document.querySelector('#joke-text').textContent === 'Unfiltered fixture');
      await page.locator('#new-joke').click(); await page.locator('#notice').waitFor();
      await page.evaluate(() => window.__test.changePrefs({ joketypes: 'safe' }));
      await page.waitForFunction(() => document.querySelector('#mode-label').textContent === 'Safe mode');
      assert.equal(await page.locator('#joke-text').innerText(), ''); assert.equal(count, 2); await context.close();
    });
    await scenario('late cancelled response cannot overwrite newer preferences', async () => {
      let firstRoute, count = 0;
      const { page, context, errors } = await fixture({}, route => {
        count++;
        if (count === 1) { firstRoute = route; return; }
        return route.fulfill({ json: { ...two, lang: 'de', setup: 'Neuere Antwort', delivery: 'Richtig' }, headers: { 'Access-Control-Allow-Origin': '*' } });
      });
      await page.goto(base + '/index.html');
      await page.waitForFunction(() => document.querySelector('#joke-card').getAttribute('aria-busy') === 'true');
      while (!firstRoute) await new Promise(resolve => setTimeout(resolve, 5));
      await page.evaluate(() => window.__test.changePrefs({ lang: 'de' }));
      await page.waitForFunction(() => document.querySelector('#joke-text').textContent === 'Neuere Antwort');
      await firstRoute.fulfill({ json: two, headers: { 'Access-Control-Allow-Origin': '*' } }).catch(() => {});
      await page.waitForTimeout(60); assert.equal(await page.locator('#joke-text').innerText(), 'Neuere Antwort');
      assert.deepEqual(errors, []); await context.close();
    });
    await scenario('API no-match and malformed success show recoverable errors', async () => {
      for (const payload of [{ error: true, code: 106 }, { ...single, joke: {} }]) {
        const { page, context, errors } = await fixture({}, route => route.fulfill({ json: payload, headers: { 'Access-Control-Allow-Origin': '*' } }));
        await page.goto(base + '/index.html'); await page.locator('#notice').waitFor();
        assert.equal(await page.locator('#joke-text').innerText(), ''); assert.ok(await page.locator('#new-joke').isEnabled()); assert.deepEqual(errors, []); await context.close();
      }
    });
    await scenario('old and corrupt saved settings recover; save failures remain visible', async () => {
      const { page, context, errors } = await fixture({ lang: 'xx', joketypes: 'unsafe', theme: 'broken' });
      await page.goto(base + '/options/options.html'); await page.locator('#settings-fields:not([disabled])').waitFor();
      assert.equal(await page.locator('#language').inputValue(), 'en'); assert.equal(await page.locator('#safe-mode').isChecked(), false);
      await page.evaluate(() => { window.__test.failSet = true; });
      await page.locator('#save-settings').click(); await page.locator('#settings-error').waitFor();
      assert.match(await page.locator('#save-status').innerText(), /haven’t been saved/);
      await page.evaluate(() => { window.__test.failSet = false; });
      for (const input of await page.locator('input[name="category"]').all()) await input.uncheck();
      await page.locator('#save-settings').click(); assert.match(await page.locator('#settings-error').innerText(), /at least one/);
      await page.locator('#all-categories').click(); await page.locator('#language').selectOption('fr'); await page.locator('#theme').selectOption('dark');
      await page.locator('#save-settings').click(); await page.waitForFunction(() => document.querySelector('#save-status').textContent === 'Settings saved');
      await page.reload(); await page.locator('#settings-fields:not([disabled])').waitFor(); assert.equal(await page.locator('#language').inputValue(), 'fr');
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark'); assert.deepEqual(errors, []); await context.close();
    });
    await scenario('responsive popup, settings and long jokes at 320, 360 and 400px', async () => {
      const { page, context, errors } = await fixture({}, route => route.fulfill({ json: { ...single, joke: ('A_long_unbroken_test_word_').repeat(50) }, headers: { 'Access-Control-Allow-Origin': '*' } }));
      for (const width of [320, 360, 400]) for (const file of ['index.html', 'options/options.html']) {
        await page.setViewportSize({ width, height: 740 }); await page.goto(base + '/' + file);
        if (file === 'index.html') await page.waitForFunction(() => document.querySelector('#joke-card').getAttribute('aria-busy') === 'false');
        else await page.locator('#settings-fields:not([disabled])').waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), browserName + ' ' + file + ' ' + width);
      }
      assert.deepEqual(errors, []); await context.close();
    });
    await scenario('keyboard activation and dark/system appearance', async () => {
      const { page, context, errors } = await fixture({ theme: 'system' }); await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
      await page.goto(base + '/index.html'); await page.locator('#reveal').waitFor(); await page.locator('#reveal').focus(); await page.keyboard.press('Enter');
      assert.equal(await page.locator('#punchline').isVisible(), true); assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(32, 38, 34)');
      assert.deepEqual(errors, []); await context.close();
    });
  } finally { await browser.close(); }
}
(async () => {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const selected = process.env.GET_JOKE_BROWSERS?.split(',') || ['chromium', 'firefox'];
    for (const name of selected) await run(name, process.env[name === 'chromium' ? 'GET_JOKE_CHROMIUM' : 'GET_JOKE_FIREFOX']);
    await fs.mkdir(path.join(root, 'test-results'), { recursive: true });
    await fs.writeFile(path.join(root, 'test-results/browser.json'), JSON.stringify({ scope: 'Production HTML/CSS/JS with extension storage and network fixtures; not an installed-extension test.', results: result }, null, 2));
    console.log(result.length + ' browser scenarios passed');
  } finally { server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
