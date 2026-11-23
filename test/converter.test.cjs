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

test('bare TeX and a complete scripted equation share the delimited math path', () => {
  const input = String.raw`字段 a_b，延迟为 \tau_t，目标为 y_t=m_{t+H}-m_t。
\frac{1}{2}+\sqrt{x^2}
已标记的 $\alpha$、\(v_t\) 和裸公式 **\beta_t**。`;
  const expected = String.raw`字段 a_b，延迟为 $\tau_t$，目标为 $y_t=m_{t+H}-m_t$。
$\frac{1}{2}+\sqrt{x^2}$
已标记的 $\alpha$、$v_t$ 和裸公式 **$\beta_t$**。`;
  const result = convertNote(input);
  assert.equal(result.value, expected);
  assert.equal(result.count, 5);
  assert.equal(convert(expected), expected);
  assert.equal(convertNote(expected).count, 0);
});

test('bare math leaves identifiers, literal contexts and incomplete expressions intact', () => {
  const input = [
    String.raw`---
name: \tau_t
target: y_t=m_{t+H}-m_t
---`,
    '普通说明 (test)、a_b、foo_bar、x_t=1、a=b，售价 $10。',
    String.raw`C:\tau_t\logs，./\tau_t、\tau_t.md 和 https://example.test/?q=y_t=m_{t+H}-m_t`,
    String.raw`[\tau_t](notes/y_t=m_{t+H}-m_t) 与 [[Notebook|y_t=m_{t+H}-m_t]]`,
    String.raw`[ref]: notes/y_t=m_{t+H}-m_t`,
    '`\\tau_t` 和代码字符串 "\\tau_t"、lookup(y_t=m_{t+H}-m_t)',
    String.raw`~~~latex
\tau_t
y_t=m_{t+H}-m_t
~~~`,
    String.raw`    \tau_t
    y_t=m_{t+H}-m_t`,
    String.raw`>     \tau_t`,
    String.raw`<pre>
y_t=m_{t+H}-m_t
</pre>`,
    String.raw`\unsupported{ \tau_t } 与 \text{literal text}`,
    String.raw`不完整的关系式 y_t=m_{t+H}-`,
    String.raw`不完整的定界符 \(\tau_t`,
    String.raw`未配对的 $\tau_t`,
  ].join('\n\n');
  assert.equal(convert(input), input);
  assert.equal(convert(String.raw`路径 [例](https://x.test/?ref=\tau_t)，此处 \tau_t 是延迟。`),
    String.raw`路径 [例](https://x.test/?ref=\tau_t)，此处 $\tau_t$ 是延迟。`);
  assert.equal(convert('~~~\n\\tau_t\n~~~'), '~~~\n\\tau_t\n~~~');
  assert.equal(convert('~~~md\ny_t=m_{t+H}-m_t\n~~~'), '~~~md\ny_t=m_{t+H}-m_t\n~~~');
  assert.equal(convert('~~~md\n# 笔记\n\\(x\\)\n\n\\tau_t\n~~~'), '# 笔记\n$x$\n\n$\\tau_t$');
  assert.equal(convert('~~~md\n现有公式 $x_t$\n~~~'), '现有公式 $x_t$');
});

test('table cells keep their boundaries when bare and marked formulas coexist', () => {
  const input = String.raw`公式 | \tau_t
--- | ---
y_t=m_{t+H}-m_t | 模型
\(P(A|B)\) | 条件概率
\[\|v\|^2\] | 范数
$P(A\|B)$ | 已转义`;
  const expected = String.raw`公式 | $\tau_t$
--- | ---
$y_t=m_{t+H}-m_t$ | 模型
$P(A\vert B)$ | 条件概率
$\displaystyle \Vert v\Vert^2$ | 范数
$P(A\|B)$ | 已转义`;
  assert.equal(convert(input), expected);
  const tokens = markdownIt().parse(expected, {});
  assert.equal(tokens.filter(token => token.type === 'th_open').length, 2);
  assert.equal(tokens.filter(token => token.type === 'td_open').length, 8);
  assert.equal(convert(expected), expected);
});

test('rich clipboard keeps code markers when the plain version flattens them', () => {
  const {window} = new JSDOM('');
  try {
    const html = String.raw`<p>延迟为 \tau_t，示例 <code>\tau_t</code>。</p>
<table><tr><th>公式</th><th>含义</th></tr>
<tr><td>y_t=m_{t+H}-m_t</td><td>目标</td></tr>
<tr><td><span data-tex="P(A|B)">visual</span></td><td>条件概率</td></tr></table>`;
    const plain = String.raw`延迟为 \tau_t，示例 \tau_t。`;
    for (const text of ['', plain]) {
      const data = {getData: type => ({'text/html':html, 'text/plain':text}[type] || '')};
      const clip = readClipboard(data, window.document);
      const output = convert(clip.value);
      assert.match(output, /延迟为 \$\\tau_t\$，示例 `\\tau_t`。/);
      assert.ok(output.includes('| $y_t=m_{t+H}-m_t$ | 目标 |'));
      assert.ok(output.includes('| $P(A\\vert B)$ | 条件概率 |'));
    }
    const codeOnly = {'text/plain': 'y_t=m_{t+H}-m_t', 'text/html': '<pre><code>y_t=m_{t+H}-m_t</code></pre>'};
    const literal = readClipboard({getData: type => codeOnly[type] || ''}, window.document);
    assert.equal(convert(literal.value), '```\ny_t=m_{t+H}-m_t\n```');
  } finally { window.close(); }
});
