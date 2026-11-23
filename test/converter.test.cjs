'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const markdownIt = require('../vendor/markdown-it.min.js');
const {convertNote, readClipboard} = require('../src/converter')(markdownIt);
const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const convert = input => convertNote(input).value;

for (const name of ['table', 'indented']) {
  test(name + ': expected Markdown and a stable second conversion', () => {
    const expected = fixture(name + '-expected.md');
    assert.equal(convert(fixture(name + '-input.md')), expected);
    assert.equal(convert(expected), expected);
  });
}

test('HTML clipboard with annotated math produces the same table as plain text', () => {
  const {window} = new JSDOM('');
  try {
    const data = {'text/html': fixture('table.html'), 'text/plain': 'visual glyphs'};
    const clip = readClipboard({getData: type => data[type] || ''}, window.document);
    assert.equal(clip.richMath, true);
    assert.equal(clip.warning, '');
    assert.equal(convert(clip.value), fixture('table-expected.md').trimEnd());
  } finally { window.close(); }
});

test('header formulas, outer-pipe-free tables and existing dollars', () => {
  const input = '名称 | $P(A|B)$\n--- | ---\n平方 | $$x^2$$\n范数 | ' + String.raw`\(\|v\|\)`;
  const output = convert(input);
  assert.equal(output, '名称 | $P(A\\vert B)$\n--- | ---\n平方 | $\\displaystyle x^2$\n范数 | $\\Vert v\\Vert$');
  assert.equal(convert(output), output);
});

test('TeX array preambles, textual pipes and escaped Markdown keep their meaning', () => {
  const array = String.raw`\begin{array}{c|c}a&b\\c&d\end{array}`;
  const input = '|a|b|\n|-|-|\n|array|\\(' + array + '\\)|\n|text|\\(\\text{a|b}\\)|\n|p|$P(A\\|B)$|';
  const output = convert(input);
  const cells = markdownIt().parse(output, {}).filter(t => t.type === 'inline').map(t => t.content);
  assert.deepEqual(cells, ['a','b','array','$' + array + '$','text','$\\text{a|b}$','p','$P(A|B)$']);
  assert.equal(convert(output), output);
});

test('already escaped table math is retained byte for byte', () => {
  const table = '|a|b|\n|-|-|\n' + String.raw`|p|$P(A\|B)$|
|norm|$\\|v\\|$|`;
  assert.equal(convert(table), table);
});

test('list continuations are prose, nested indented and quoted code are protected', () => {
  const input = '- item\n    continuation \\(a\\)\n\n      code = "\\(x\\)"\n\n>     raw \\(y\\)';
  assert.equal(convert(input), input.replace('\\(a\\)', '$a$'));
});

test('inline code, fenced code, frontmatter and ordinary currency are preserved', () => {
  const input = '---\nlabel: "\\(x\\)"\n---\nCost $10. `\\(x\\)`\n\n~~~python\ns="\\(y\\)"\n~~~\n\n\\(z\\)';
  assert.equal(convert(input), input.replace('\\(z\\)', '$z$'));
  const indentedFence = '    ```md\n    \\(x\\)\n    ```';
  assert.equal(convert(indentedFence), indentedFence);
});

test('existing Markdown wrappers, glossary reconstruction and preference cards', () => {
  assert.equal(convert('```md\n\\(x\\)\n```'), '$x$');
  const glossary = '符号\n含义\n\\(P(A|B)\\)\n概率';
  assert.match(convert(glossary), /\| \$P\(A\\vert B\)\$ \| 概率 \|/);
  const example = 'Prompt\n求 \\(x\\)。\nResponse A (Chosen)\n答案 \\(2\\)。\nResponse B (Rejected)\n答案 \\(3\\)。';
  const output = convert(example);
  assert.match(output, /> \[!question\] Prompt/);
  assert.match(output, /> \[!success\] Response A · Chosen\n> 答案 \$2\$/);
  assert.match(output, /> \[!failure\] Response B · Rejected/);
});

test('plain display math, ordinary prose pipes, unpaired markers and CRLF input', () => {
  const input = 'a | b\r\n\\[ P(A|B) \\]\r\n未闭合 \\(x';
  assert.equal(convert(input), 'a | b\n$$\nP(A|B)\n$$\n未闭合 \\(x');
  assert.equal(convertNote(input).unmatched, true);
});

test('an unclosed table formula cannot swallow the next row', () => {
  const input = '|a|b|\n|-|-|\n|one|\\(unfinished|\n|two|\\(y\\)|';
  const result = convertNote(input);
  assert.equal(result.value, input.replace('\\(y\\)', '$y$'));
  assert.equal(result.unmatched, true);
});
