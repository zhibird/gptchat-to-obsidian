'use strict';

// The bounded TeX grammar is adapted from Math Paste Bridge's src/latex.js.
// Copyright (c) 2026 hlyang1992. See THIRD-PARTY-LICENSES.txt.
const bareMath = (() => {
  const symbols = new Set((
    'alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi ' +
    'pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega ' +
    'Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega ' +
    'infty partial nabla ell hbar emptyset varnothing forall exists cdots ldots ' +
    'sin cos tan log ln exp min max det sum prod int lim'
  ).split(' '));
  const operators = new Set((
    'times cdot div pm mp le leq ge geq ne neq equiv approx sim in notin ' +
    'subset subseteq cup cap to mapsto rightarrow propto mid'
  ).split(' '));
  const argumentCounts = new Map([
    ...'frac dfrac tfrac binom'.split(' ').map(name => [name, 2]),
    ...'sqrt hat widehat bar overline underline vec tilde dot ddot'.split(' ').map(name => [name, 1]),
  ]);
  const textCommands = new Set((
    'text textrm textnormal mathrm mathbf mathit mathsf mathtt mathcal mathbb operatorname'
  ).split(' '));
  const command = /\\([a-zA-Z]+)/y;
  const number = /\d+(?:\.\d+)?/y;

  function readExpression(source, start, limit) {
    let position = start;
    let math = false;
    const next = () => position < limit ? source[position] : '\n';

    function spaces() {
      while (next() === ' ' || next() === '\t') position++;
    }

    function commandAtPosition() {
      command.lastIndex = position;
      const match = command.exec(source);
      return match && command.lastIndex <= limit ? match[1] : '';
    }

    function group(depth) {
      const close = next() === '{' ? '}' : ')';
      position++;
      if (!expression(depth + 1, close)) return false;
      spaces();
      if (next() !== close) return false;
      position++;
      return true;
    }

    function textGroup() {
      if (next() !== '{') return false;
      let depth = 1;
      for (position++; position < limit; position++) {
        const char = next();
        if (char === '\n' || char === '$' || char === '|') return false;
        if (char === '\\' && source[position + 1] !== '|') position++;
        else if (char === '\\') return false;
        else if (char === '{') depth++;
        else if (char === '}' && --depth === 0) {
          position++;
          return true;
        }
      }
      return false;
    }

    function atom(depth, scripts = true) {
      if (depth > 20) return false;
      const char = next();
      if (char === '\\') {
        const name = commandAtPosition();
        if (!name) return false;
        position += name.length + 1;
        if (textCommands.has(name)) {
          spaces();
          if (!textGroup()) return false;
          math ||= !/^text/.test(name);
        } else {
          const count = argumentCounts.get(name) ?? 0;
          if (!count && !symbols.has(name)) return false;
          for (let arg = 0; arg < count; arg++) {
            spaces();
            if (!atom(depth + 1, false)) return false;
          }
          math = true;
        }
      } else if (char === '{' || char === '(') {
        if (!group(depth)) return false;
      } else if (/[a-zA-Z]/.test(char)) {
        if (depth === 0 && /[a-zA-Z]/.test(source[position + 1] || '')) return false;
        position++;
      } else {
        number.lastIndex = position;
        if (!number.exec(source) || number.lastIndex > limit) return false;
        position = number.lastIndex;
      }

      if (!scripts) return true;
      while (next() === "'") position++;
      let subscript = false, superscript = false;
      while (true) {
        const end = position;
        spaces();
        const mark = next();
        if (mark !== '_' && mark !== '^') {
          position = end;
          break;
        }
        if (mark === '_' ? subscript : superscript) return false;
        subscript ||= mark === '_';
        superscript ||= mark === '^';
        position++;
        spaces();
        // A lone name such as x_t may be an identifier. Braced scripts and
        // numeric powers supply stronger evidence in the absence of a command.
        math ||= next() === '{' || (mark === '^' && /\d/.test(next()));
        if (!atom(depth + 1, false)) return false;
      }
      return true;
    }

    function expression(depth, close = '') {
      spaces();
      if (next() === '+' || next() === '-') position++;
      spaces();
      if (!atom(depth)) return false;
      while (position < limit) {
        const end = position;
        spaces();
        const char = next();
        const name = char === '\\' && commandAtPosition();
        if (operators.has(name)) {
          math = true;
          position += name.length + 1;
        } else if (/[+\-/=<>]/.test(char) || (close && char === ',') ||
                   (char === '*' && /[a-zA-Z\d\\({+\-]/.test(source[position + 1] || ''))) {
          position++;
        } else if (position === end && (char === '(' || (close && /[a-zA-Z\d\\{]/.test(char)))) {
          if (!atom(depth)) return false;
          continue;
        } else {
          position = end;
          break;
        }
        spaces();
        if (next() === '+' || next() === '-') position++;
        spaces();
        if (!atom(depth)) return false;
      }
      return true;
    }

    const complete = expression(0);
    const suffix = source.slice(position, position + 2);
    const boundary = !/^[a-zA-Z\d_\p{Script=Latin}\p{M}\\{}\[^/@#]|^\.[a-zA-Z\d]/u.test(suffix);
    return {end: position, recognized: complete && math && boundary};
  }

  // These spans remain literal even when a clipboard contains something that
  // resembles TeX in a link, path, or quoted code string.
  const literals = new RegExp([
    /<!--[\s\S]*?-->/.source,
    /<(?<tag>pre|code|kbd|samp)\b[^>]*>[\s\S]*?<\/\k<tag>\s*>/.source,
    /%%[\s\S]*?%%/.source,
    /^[ \t]{0,3}\[[^\]\n]+\]:[^\n]*/.source,
    /!?\[\[[^[\]\n]*\]\]/.source,
    /!?\[(?:[^[\]\\\n]|\\[^\n]|\[[^\[\]\n]*\])*\](?:\((?:[^()\\\n]|\\[^\n]|\([^()\n]*\))*\)|\[[^\]\n]*\])?/.source,
    /<\/?[a-z][\w-]*(?:[ \t][^<>\n]*)?\/?>/.source,
    /(?:\b[a-z][\w+.-]*:\/\/|\bwww\.|\b[a-z]:\\)[^\s<>"\x27\x60]+/.source,
    /\b[a-z_]\w+\((?:[^()\\\n]|\\[^\n]|\([^()\n]*\))*\)/.source,
    /"(?:[^"\\\n]|\\[^\n])*"|(?<![\p{L}\p{N}])'(?:[^'\\\n]|\\[^\n])*'(?![\p{L}\p{N}])/.source,
  ].join('|'), 'gimu');

  function literalSpans(source) {
    return Array.from(source.matchAll(literals), match => ({
      start: match.index, end: match.index + match[0].length,
    }));
  }

  function scan(source) {
    const protectedSpans = literalSpans(source);
    const candidates = /[{}\n]|\\(?=[a-zA-Z])|[a-zA-Z](?=[ \t]*[_^=<>+*/(\\-])/g;
    let spanIndex = 0;
    return (start, end) => {
      const text = source.slice(start, end);
      let output = '', written = start, count = 0, braceDepth = 0, match;
      candidates.lastIndex = 0;
      while ((match = candidates.exec(text))) {
        const at = start + match.index;
        while (protectedSpans[spanIndex]?.end <= at) spanIndex++;
        const span = protectedSpans[spanIndex];
        if (span?.start <= at) {
          candidates.lastIndex = span.end - start;
          continue;
        }
        if (match[0] === '\n') braceDepth = 0;
        else if (match[0] === '{') braceDepth++;
        else if (match[0] === '}') braceDepth = Math.max(0, braceDepth - 1);
        if (braceDepth || /[{}\n]/.test(match[0])) continue;
        const before = source[at - 1] || '';
        if (/[\p{Script=Latin}\p{M}\d_\\./:{@#^=+\-<>]/u.test(before)) continue;
        const limit = Math.min(end, span?.start ?? end);
        const expression = readExpression(source, at, limit);
        candidates.lastIndex = Math.max(candidates.lastIndex, expression.end - start);
        if (!expression.recognized) continue;
        output += source.slice(written, at) + '$' + source.slice(at, expression.end) + '$';
        written = expression.end;
        count++;
      }
      return {value: output + source.slice(written, end), count};
    };
  }

  return {literalSpans, scan};
})();

if (typeof module !== 'undefined' && module.exports) module.exports = bareMath;
