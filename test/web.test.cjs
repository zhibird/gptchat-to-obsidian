'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

async function withWebApp(run) {
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
      assert.match(doc.querySelector('#library-licenses').textContent, /Copyright \(c\) 2026 hlyang1992/);
    }
    for (const script of Array.from(doc.scripts)) {
      if (script.type === 'text/plain') continue;
      const file = script.getAttribute('src');
      vm.runInContext(file ? read(file) : script.textContent, dom.getInternalVMContext());
    }
    await window.MathJax.startup.promise;
    await run(doc, window);
  } finally { window.close(); }
}

async function pasteAndRender(window, type, input) {
  const doc = window.document;
  const event = new window.Event('paste', {bubbles: true, cancelable: true});
  Object.defineProperty(event, 'clipboardData', {value: {getData: format => format === type ? input : '', items: []}});
  const preview = doc.querySelector('#preview');
  await new Promise((resolve, reject) => {
    const observer = new window.MutationObserver(() => {
      observer.disconnect();
      clearTimeout(timeout);
      resolve();
    });
    const timeout = setTimeout(() => {
      observer.disconnect();
      reject(new Error('No preview was rendered'));
    }, 5000);
    observer.observe(preview, {childList: true});
    doc.querySelector('#src').dispatchEvent(event);
  });
  assert.equal(event.defaultPrevented, true);
  return preview;
}

test('web paste, MathJax preview and copy all retain the four table rows', () =>
  withWebApp(async (doc, window) => {
    const preview = await pasteAndRender(window, 'text/html', read('test/fixtures/table.html'));
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
  }));

test('web preview renders bare formulas and displays the same source literally inside code', () =>
  withWebApp(async (doc, window) => {
    const input = '延迟为 \\tau_t。\n\n| 公式 | 说明 |\n| --- | --- |\n| y_t=m_{t+H}-m_t | 目标 |\n\n    literal = "\\tau_t"';
    const preview = await pasteAndRender(window, 'text/plain', input);
    assert.equal(preview.querySelectorAll('mjx-container svg').length, 2);
    assert.equal(preview.querySelectorAll('.math-error').length, 0);
    assert.equal(preview.querySelector('tbody tr').cells.length, 2);
    assert.equal(preview.querySelector('pre code').textContent.trimEnd(), 'literal = "\\tau_t"');
    doc.querySelector('#showSource').click();
    assert.equal(doc.querySelector('#dst').value, '延迟为 $\\tau_t$。\n\n| 公式 | 说明 |\n| --- | --- |\n| $y_t=m_{t+H}-m_t$ | 目标 |\n\n    literal = "\\tau_t"');
  }));
