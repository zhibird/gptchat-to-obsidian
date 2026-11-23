'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {JSDOM} = require('jsdom');

function loadPlugin() {
  const release = process.env.FORMULA_NOTES_TEST_RELEASE === '1';
  const entry = require.resolve(release ? '../dist/formula-to-note/main.js' : '../src/plugin');
  const localRequire = createRequire(entry);
  const target = {exports: {}};
  const host = {Plugin: class {}, Notice: class {}};
  vm.compileFunction(fs.readFileSync(entry, 'utf8'), ['require', 'module'])(
    name => name === 'obsidian' ? host : localRequire(name), target,
  );
  const plugin = new target.exports();
  const registered = {};
  plugin.app = {workspace: {on(name, handler) { registered[name] = handler; return handler; }}};
  plugin.registerEvent = () => {};
  plugin.addCommand = cmd => { registered[cmd.id] = cmd; };
  plugin.onload();
  return registered;
}

// « and » delimit the selection or empty cursor position.
function editorAt(marked, selections = 1) {
  const from = marked.indexOf('«'), to = marked.indexOf('»') - 1;
  let text = marked.replace('«', '').replace('»', '');
  const toPosition = offset => {
    const lines = text.slice(0, offset).split('\n');
    return {line: lines.length - 1, ch: lines.at(-1).length};
  };
  return {
    getValue: () => text,
    getCursor: end => toPosition(end === 'from' ? from : to),
    posToOffset: pos => text.split('\n').slice(0, pos.line).reduce((n, s) => n + s.length + 1, 0) + pos.ch,
    getSelection: () => text.slice(from, to),
    somethingSelected: () => from !== to,
    listSelections: () => Array(selections).fill({}),
    replaceSelection(value) { text = text.slice(0, from) + value + text.slice(to); },
  };
}

const registered = loadPlugin();
function paste(editor, formats, {files = [], handled = false, document} = {}) {
  const event = {
    defaultPrevented: handled,
    target: {ownerDocument: document},
    clipboardData: {files, items: [], getData: format => formats[format] || ''},
    preventDefault() { this.defaultPrevented = true; },
  };
  registered['editor-paste'](event, editor);
  return event.defaultPrevented;
}

test('paste replaces only the selection and uses clipboard Markdown first', () => {
  const editor = editorAt('前 \\(unchanged\\) «old» 后');
  assert.ok(paste(editor, {'text/plain':'glyphs', 'text/markdown':'\\(x_t\\)'}));
  assert.equal(editor.getValue(), '前 \\(unchanged\\) $x_t$ 后');
});

test('annotated HTML clipboard reaches the same output as the web tool', () => {
  const {window} = new JSDOM('');
  try {
    const editor = editorAt('«»');
    const read = file => fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf8');
    assert.ok(paste(editor, {'text/html': read('table.html'), 'text/plain':'rendered'}, {document: window.document}));
    assert.equal(editor.getValue(), read('table-expected.md').trimEnd());
  } finally { window.close(); }
});

test('a paste inside an existing table cell preserves the surrounding row', () => {
  const editor = editorAt('|a|b|\n|-|-|\n|before|«»|\n|after|ok|');
  assert.ok(paste(editor, {'text/plain':'\\[\nP(A|B)\n\\]'}));
  assert.equal(editor.getValue(), '|a|b|\n|-|-|\n|before|$\\displaystyle P(A\\vert B)$|\n|after|ok|');
});

for (const marks of ['~~~js\n«»\n~~~', '示例\n\n    s = «»', '文本 `raw «» example`',
  '数学 $x+«»y$', '$$\nx = «»\n$$', '---\nkey: «»\n---']) {
  test('native paste inside ' + marks.replace(/\n/g, ' '), () => {
    const editor = editorAt(marks);
    assert.equal(paste(editor, {'text/plain':'\\(x\\)'}), false);
    assert.equal(editor.getValue(), marks.replace('«»',''));
  });
}

test('ordinary, attachment, multi-cursor, internal and already handled pastes stay native', () => {
  const editor = editorAt('«»');
  assert.equal(paste(editor, {'text/plain':'ordinary text'}), false);
  assert.equal(paste(editor, {'text/plain':'$x$'}), false);
  assert.equal(paste(editor, {'text/plain':'\\(x\\)'}, {files: [{}]}), false);
  assert.equal(paste(editorAt('«»', 2), {'text/plain':'\\(x\\)'}), false);
  assert.equal(paste(editor, {'text/plain':'\\(x\\)', 'text/html':'<!-- obsidian -->'}), false);
  paste(editor, {'text/plain':'\\(x\\)'}, {handled: true});
  assert.equal(editor.getValue(), '');
});

test('selection command updates only the selected prose and respects literal code', () => {
  const command = registered['convert-selection'].editorCheckCallback;
  const editor = editorAt('前 «\\(x\\)» 后 \\(y\\)');
  assert.ok(command(true, editor));
  assert.equal(editor.getValue(), '前 \\(x\\) 后 \\(y\\)');
  command(false, editor);
  assert.equal(editor.getValue(), '前 $x$ 后 \\(y\\)');
  const code = editorAt('    s = "«\\(x\\)»"');
  command(false, code);
  assert.equal(code.getValue(), '    s = "\\(x\\)"');
  assert.equal(command(true, editorAt('«»')), false);
});

test('selection command can convert complete body rows without their header', () => {
  const editor = editorAt('|a|b|\n|-|-|\n«|one|\\(P(A|B)\\)|\n|two|\\[x\\]|»\n|three|\\(y\\)|');
  registered['convert-selection'].editorCheckCallback(false, editor);
  assert.equal(editor.getValue(), '|a|b|\n|-|-|\n|one|$P(A\\vert B)$|\n|two|$\\displaystyle x$|\n|three|\\(y\\)|');
});

test('pasting into a cell keeps literal text pipes inside the same cell', () => {
  const editor = editorAt('|a|b|\n|-|-|\n|one|«»|');
  paste(editor, {'text/plain': 'x | y, \\(t\\)'});
  assert.equal(editor.getValue(), '|a|b|\n|-|-|\n|one|x \\| y, $t$|');
});

test('a partial selection cannot expose protected code by removing its delimiter or indentation', () => {
  for (const marked of ['文字 `s = «\\(x\\)`»', '代码\n\n  «  s = \\(x\\)»']) {
    const editor = editorAt(marked);
    registered['convert-selection'].editorCheckCallback(false, editor);
    assert.equal(editor.getValue(), marked.replace('«','').replace('»',''));
  }
});
