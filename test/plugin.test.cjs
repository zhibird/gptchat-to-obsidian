'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {JSDOM} = require('jsdom');

function loadPlugin(getActiveView = () => null) {
  const release = process.env.FORMULA_NOTES_TEST_RELEASE === '1';
  const entry = require.resolve(release ? '../dist/formula-to-note/main.js' : '../src/plugin');
  const localRequire = createRequire(entry);
  const target = {exports: {}};
  const registered = {notices: []};
  const host = {
    MarkdownView: class {},
    Plugin: class {},
    Notice: class { constructor(text) { registered.notices.push(text); } },
  };
  vm.compileFunction(fs.readFileSync(entry, 'utf8'), ['require', 'module'])(
    name => name === 'obsidian' ? host : localRequire(name), target,
  );
  const plugin = new target.exports();
  plugin.app = {workspace: {
    getActiveViewOfType(type) {
      assert.equal(type, host.MarkdownView);
      return getActiveView();
    },
    on(name, handler) { registered[name] = handler; return handler; },
  }};
  plugin.registerEvent = () => {};
  plugin.addRibbonIcon = (icon, title, click) => { registered.ribbon = {icon, title, click}; };
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
  const toOffset = pos => text.split('\n').slice(0, pos.line).reduce((n, s) => n + s.length + 1, 0) + pos.ch;
  let edits = 0;
  return {
    get edits() { return edits; },
    getValue: () => text,
    getCursor: end => toPosition(end === 'from' ? from : to),
    posToOffset: toOffset,
    offsetToPos: toPosition,
    getSelection: () => text.slice(from, to),
    somethingSelected: () => from !== to,
    listSelections: () => Array(selections).fill({}),
    replaceSelection(value) { text = text.slice(0, from) + value + text.slice(to); edits++; },
    replaceRange(value, start, end) { text = text.slice(0, toOffset(start)) + value + text.slice(toOffset(end)); edits++; },
    focus() {},
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

test('bare TeX and an equation with no backslash are recognized by editor paste', () => {
  const editor = editorAt('前 «old» 后');
  const input = 'y_t=m_{t+H}-m_t';
  assert.ok(paste(editor, {'text/plain':input}));
  assert.equal(editor.getValue(), '前 $y_t=m_{t+H}-m_t$ 后');
  const note = editorAt('«»');
  assert.ok(paste(note, {'text/markdown':'延迟 \\tau_t，标识符 a_b。','text/plain':'visual'}));
  assert.equal(note.getValue(), '延迟 $\\tau_t$，标识符 a_b。');
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
    assert.equal(paste(editor, {'text/plain':'y_t=m_{t+H}-m_t'}), false);
    assert.equal(editor.getValue(), marks.replace('«»',''));
  });
}

test('ordinary, attachment, multi-cursor, internal and already handled pastes stay native', () => {
  const editor = editorAt('«»');
  assert.equal(paste(editor, {'text/plain':'ordinary text'}), false);
  assert.equal(paste(editor, {'text/plain':'an_id, a_b, x_t=1, and a=b'}), false);
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

test('bare math paste in a table cell stays inline beside existing math', () => {
  const editor = editorAt('|a|b|\n|-|-|\n|$P(A\\|B)$|«»|\n|after|$x$|');
  assert.ok(paste(editor, {'text/plain':'\\tau_t，y_t=m_{t+H}-m_t'}));
  assert.equal(editor.getValue(), '|a|b|\n|-|-|\n|$P(A\\|B)$|$\\tau_t$，$y_t=m_{t+H}-m_t$|\n|after|$x$|');
});

test('bare conversion respects the link surrounding an existing selection or cursor', () => {
  const editor = editorAt('[docs](https://example.test/?q=«y_t=m_{t+H}-m_t») 和 \\tau_t');
  registered['convert-selection'].editorCheckCallback(false, editor);
  assert.equal(editor.edits, 0);
  const link = editorAt('[docs](https://example.test/«»)');
  assert.equal(paste(link, {'text/plain':'\\tau_t'}), false);
  assert.equal(link.edits, 0);
});

test('a partial selection cannot expose protected code by removing its delimiter or indentation', () => {
  for (const marked of ['文字 `s = «\\(x\\)`»', '代码\n\n  «  s = \\(x\\)»']) {
    const editor = editorAt(marked);
    registered['convert-selection'].editorCheckCallback(false, editor);
    assert.equal(editor.getValue(), marked.replace('«','').replace('»',''));
  }
});

function noteView(editor, mode = 'source') {
  return {
    file: {path: 'Test.md'}, editor, getMode: () => mode,
    leaf: {
      getViewState: () => ({type: 'markdown', state: {file: 'Test.md', mode}}),
      async setViewState({state}) { mode = state.mode; },
    },
  };
}

test('ribbon converts the active note in one edit and skips an unchanged note', async () => {
  const metadata = '---\nexample: "\\(meta\\)"\n---\n\n';
  const text = metadata + '延迟 \\tau_t。\n\n\\[x^2\\]\n\n|A|B|\n|-|-|\n|\\(P(A|B)\\)|y_t=m_{t+H}-m_t|\n\n    «»\\tau_t';
  const editor = editorAt(text);
  const {ribbon} = loadPlugin(() => noteView(editor));
  assert.equal(ribbon.icon, 'sigma');
  assert.match(ribbon.title, /转换公式/);
  await ribbon.click();
  assert.equal(editor.getValue(), metadata + '延迟 $\\tau_t$。\n\n$$\nx^2\n$$\n\n|A|B|\n|-|-|\n|$P(A\\vert B)$|$y_t=m_{t+H}-m_t$|\n\n    \\tau_t');
  assert.equal(editor.edits, 1);
  await ribbon.click();
  assert.equal(editor.edits, 1);
});

test('a ribbon click on a selection uses the same protections as the selection command', async () => {
  const editor = editorAt('«\\tau_t» 和 \\(y\\)');
  await loadPlugin(() => noteView(editor)).ribbon.click();
  assert.equal(editor.getValue(), '$\\tau_t$ 和 \\(y\\)');
  for (const protectedEditor of [editorAt('    «\\(code\\)»\n\n\\(outside\\)'), editorAt('«\\(x\\)» 和 \\(y\\)', 2)]) {
    await loadPlugin(() => noteView(protectedEditor)).ribbon.click();
    assert.equal(protectedEditor.edits, 0);
  }
});

test('a ribbon click from Reading view edits the same note and ignores a previous editor selection', async () => {
  const editor = editorAt('«\\(x\\)» 和 \\(y\\)');
  const view = noteView(editor, 'preview');
  await loadPlugin(() => view).ribbon.click();
  assert.equal(view.getMode(), 'source');
  assert.equal(editor.getValue(), '$x$ 和 $y$');
  assert.equal(editor.edits, 1);
});

test('ribbon leaves other tabs alone when there is no Markdown view or the active file changes', async () => {
  const inactive = loadPlugin();
  await inactive.ribbon.click();
  assert.match(inactive.notices[0], /Markdown/);
  const editor = editorAt('«»\\(x\\)');
  const view = noteView(editor, 'preview');
  view.leaf.setViewState = async () => { view.file = {path: 'Other.md'}; view.getMode = () => 'source'; };
  await loadPlugin(() => view).ribbon.click();
  assert.equal(editor.edits, 0);
});
