'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('web paste, MathJax preview and copy all retain the four table rows', async () => {
  const release = process.env.FORMULA_NOTES_TEST_RELEASE === '1';
  const dom = new JSDOM(read(release ? 'dist/gptchat-to-obsidian.html' : 'index.html'), {
    url: 'https://example.org/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const {window} = dom;
  try {
    const doc = window.document;
    if (release) {
      assert.equal(doc.querySelectorAll('script[src], link[rel="stylesheet"]').length, 0);
      assert.match(doc.querySelector('#library-licenses').textContent, /MIT License[\s\S]+zhibird/);
    }
    for (const script of Array.from(doc.scripts)) {
      if (script.type === 'text/plain') continue;
      const file = script.getAttribute('src');
      vm.runInContext(file ? read(file) : script.textContent, dom.getInternalVMContext());
    }
    await window.MathJax.startup.promise;
    const source = doc.querySelector('#src');
    const event = new window.Event('paste', {bubbles: true, cancelable: true});
    const input = read('test/fixtures/table.html');
    Object.defineProperty(event, 'clipboardData', {value: {getData: type => type === 'text/html' ? input : '', items: []}});
    const preview = doc.querySelector('#preview');
    const rendered = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('No table preview was rendered')), 5000);
      const observer = new window.MutationObserver(() => {
        if (preview.querySelector('tbody')) {
          observer.disconnect();
          clearTimeout(timeout);
          resolve();
        }
      });
      observer.observe(preview, {childList: true});
    });
    source.dispatchEvent(event);
    await rendered;
    assert.equal(event.defaultPrevented, true);
    const rows = Array.from(preview.querySelectorAll('tbody tr'));
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.map(row => row.cells.length), [2, 2, 2, 2]);
    assert.deepEqual(rows.map(row => row.cells[0].textContent), ['条件概率', '范数', '块公式', '对照']);
    for (const row of rows) assert.ok(row.cells[1].querySelector('mjx-container svg'));
    assert.equal(preview.querySelectorAll('.math-error').length, 0);
    const expected = read('test/fixtures/table-expected.md').trimEnd();
    doc.querySelector('#showSource').click();
    assert.equal(doc.querySelector('#dst').value, expected);
    let copied;
    Object.defineProperty(window.navigator, 'clipboard', {value: {writeText: async text => { copied = text; }}});
    await doc.querySelector('#copy').onclick();
    assert.equal(copied, expected);
    let savedBlob, filename;
    window.URL.createObjectURL = blob => { savedBlob = blob; return 'blob:test-note'; };
    window.URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = function () { filename = this.download; };
    doc.querySelector('#save').click();
    assert.equal(filename, '公式笔记.md');
    assert.equal(await savedBlob.text(), expected);
  } finally { window.close(); }
});
