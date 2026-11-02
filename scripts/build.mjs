import { readFile, mkdir, readdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const targets = process.argv.includes('--chrome') ? ['chrome'] : process.argv.includes('--firefox') ? ['firefox'] : ['firefox', 'chrome'];
const sourceManifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const files = ['index.html', 'privacy.html', 'scripts/i18n.js', 'scripts/core.js', 'scripts/popup.js', 'styles/style.css', 'options/options.html', 'options/options.js', 'LICENSE'];
for (const locale of (await readdir(path.join(root, '_locales'))).sort()) files.push(`_locales/${locale}/messages.json`);
for (const name of (await readdir(path.join(root, 'images'))).sort()) if (/^icon-(16|32|48|128|192)\.png$/.test(name) || name === 'icon.svg') files.push('images/' + name);

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(entries) {
  const local = [], central = []; let offset = 0;
  for (const [name, data] of entries) {
    const filename = Buffer.from(name), crc = crc32(data), header = Buffer.alloc(30), directory = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(0x21, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x800, 8); directory.writeUInt16LE(0x21, 14);
    directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(filename.length, 28); directory.writeUInt32LE(offset, 42);
    local.push(header, filename, data); central.push(directory, filename); offset += header.length + filename.length + data.length;
  }
  const end = Buffer.alloc(22), centralBytes = Buffer.concat(central);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, end]);
}

for (const target of targets) {
  const manifest = structuredClone(sourceManifest);
  delete manifest.browser_specific_settings;
  if (target === 'firefox') manifest.browser_specific_settings = { gecko: { id: '{d9b8e5c3-3c54-4f6a-bf91-6a4b80d8e978}' }, gecko_android: { strict_min_version: '113.0' } };
  const destination = path.join(root, 'dist', target);
  await rm(destination, { recursive: true, force: true }); await mkdir(destination, { recursive: true });
  const entries = [['manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n')]];
  for (const name of files) entries.push([name, await readFile(path.join(root, name))]);
  for (const [name, bytes] of entries) { await mkdir(path.dirname(path.join(destination, name)), { recursive: true }); await writeFile(path.join(destination, name), bytes); }
  const name = `Get-Joke-${target}-${manifest.version}-${target === 'chrome' ? 'store' : 'amo'}.zip`;
  await writeFile(path.join(root, 'dist', name), zip(entries));
  console.log(name + ' · ' + entries.length + ' files');
}
