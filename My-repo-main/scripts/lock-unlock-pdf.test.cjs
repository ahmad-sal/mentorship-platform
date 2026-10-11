const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('Lock & Unlock PDF is registered once and has a public route', () => {
  const registrySource = fs.readFileSync(path.join(root, 'public', 'tools.js'), 'utf8');
  const context = {
    window: {},
    document: { readyState: 'loading', addEventListener() {} }
  };
  vm.runInNewContext(registrySource, context);
  const matches = context.window.PUBLIC_TOOLS.filter((tool) => tool.id === 'lock-unlock-pdf');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, 'Lock & Unlock PDF');
  assert.equal(matches[0].route, '/tools/lock-unlock-pdf');
  assert.equal(matches[0].available, true);

  const serverSource = fs.readFileSync(path.join(root, 'server.cjs'), 'utf8');
  assert.match(serverSource, /app\.get\('\/tools\/lock-unlock-pdf'/);
});

test('the public page contains independent protection and unlocking panels', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'lock-unlock-pdf.html'), 'utf8');
  assert.equal((html.match(/data-panel="protect"/g) || []).length, 1);
  assert.equal((html.match(/data-panel="unlock"/g) || []).length, 1);
  assert.match(html, /Enter Password/);
  assert.match(html, /Confirm Password/);
  assert.match(html, /Enter Current PDF Password/);
  assert.match(html, /Download Protected PDF/);
  assert.match(html, /Download Unlocked PDF/);
  assert.match(html, /type="module" src="\/lock-unlock-pdf\.js"/);
  assert.match(html, /data-tools-recommendations/);
});

test('the browser editor uses QPDF WASM and verifies outputs without uploading files', () => {
  const source = fs.readFileSync(path.join(root, 'public', 'lock-unlock-pdf.js'), 'utf8');
  assert.match(source, /createQpdfRunner/);
  assert.match(source, /'--encrypt', password/);
  assert.match(source, /'256'/);
  assert.match(source, /'--decrypt', 'source\.pdf', 'unlocked\.pdf'/);
  assert.match(source, /await verifyPdf\(protectedBytes, expectedPages, password\)/);
  assert.match(source, /await verifyPdf\(unlockedBytes, expectedPages\)/);
  assert.doesNotMatch(source, /fetch\(['"`].*\/api\/|XMLHttpRequest|console\.(log|info|warn)/);
});
