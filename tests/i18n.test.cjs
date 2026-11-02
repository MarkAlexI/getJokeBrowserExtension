'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const locales=['en','uk','pl','de','fr','es'];
const catalogs=Object.fromEntries(locales.map(locale=>[locale,require('../_locales/'+locale+'/messages.json')]));
const keys=Object.keys(catalogs.en).sort();
for(const locale of locales)test(locale+' has a complete, nonempty message catalog and matching placeholders',()=>{
  const catalog=catalogs[locale];assert.deepEqual(Object.keys(catalog).sort(),keys);
  for(const key of keys){
    assert.equal(typeof catalog[key].message,'string',locale+':'+key);assert.ok(catalog[key].message.trim());
    const placeholders=[...catalog[key].message.matchAll(/\$([a-zA-Z][\w]*)\$/g)].map(x=>x[1]).sort();
    assert.deepEqual(placeholders,[...catalogs.en[key].message.matchAll(/\$([a-zA-Z][\w]*)\$/g)].map(x=>x[1]).sort());
    for(const name of placeholders)assert.equal(catalog[key].placeholders?.[name]?.content,catalogs.en[key].placeholders[name].content);
  }
  assert.ok(catalog.extensionDescription.message.length<=132);
});
test('every localized HTML attribute and manifest message has a catalog entry',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
  assert.equal(manifest.default_locale,'en');
  for(const match of JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g))assert.ok(catalogs.en[match[1]],match[1]);
  for(const name of ['index.html','options/options.html','privacy.html']){
    const html=fs.readFileSync(path.join(root,name),'utf8');
    assert.ok(html.includes('scripts/i18n.js'));
    for(const match of html.matchAll(/data-i18n(?:-title|-aria-label)?="([^"]+)"/g))assert.ok(catalogs.en[match[1]],name+':'+match[1]);
  }
});
test('all named dynamic messages exist in every locale',()=>{
  for(const name of ['scripts/popup.js','options/options.js']){
    const script=fs.readFileSync(path.join(root,name),'utf8');
    for(const match of script.matchAll(/\bt\(['"]([^'"]+)['"]\s*[,)]/g))for(const locale of locales)assert.ok(catalogs[locale][match[1]],locale+':'+match[1]);
  }
});
