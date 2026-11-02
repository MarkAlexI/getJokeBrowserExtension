'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
test('release metadata preserves identity, storage-only permissions and external-code restrictions', () => {
  assert.equal(manifest.version, require('../package.json').version);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.ok(!manifest.host_permissions);
  if (manifest.browser_specific_settings) assert.equal(manifest.browser_specific_settings.gecko.id, '{d9b8e5c3-3c54-4f6a-bf91-6a4b80d8e978}');
  assert.ok(manifest.commands._execute_action); assert.ok(!manifest.commands['refresh-joke-feature']);
  assert.ok(manifest.content_security_policy.extension_pages.includes("script-src 'self'"));
  assert.ok(!manifest.content_security_policy.extension_pages.includes('unsafe-inline'));
});
test('manifest resources and all relative HTML scripts, images and styles exist', () => {
  for (const resource of [manifest.action.default_popup, manifest.options_ui.page, ...Object.values(manifest.icons)]) assert.ok(fs.existsSync(path.join(root, resource)), resource);
  for (const name of ['index.html', 'options/options.html', 'privacy.html']) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      if (/^(https?:|mailto:)/.test(match[1])) continue;
      assert.ok(fs.existsSync(path.resolve(root, path.dirname(name), match[1])), name + ': ' + match[1]);
    }
    assert.match(html, /<html lang="en"/); assert.ok(!/<script[^>]*>\s*[^<\s]/.test(html));
  }
});
