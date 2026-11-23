'use strict';

// Classic scripts work from a local HTML file. The plugin bundles the same factory.
function createFormulaNotes(markdownIt) {
  const parser = markdownIt({html: false});

  function unwrapMarkdown(s){
    const lines=s.replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g,'').split('\n');
    const fence=lines[0].match(/^ {0,3}(`{3,}|~{3,})[ \t]*(markdown|md)?[ \t]*$/i);
    if(!fence || lines.length<3) return s;
    const closing=new RegExp('^ {0,3}'+fence[1][0]+'{'+fence[1].length+',}[ \\t]*$');
    if(lines.findIndex((line,i)=>i>0 && closing.test(line))!==lines.length-1) return s;
    const body=lines.slice(1,-1).join('\n');
    return fence[2] || (/\\[[(]/.test(body) && /^[ \t]*(?:#{1,6} |\|.*\||\\{1,2}\[)/m.test(body)) ? body : s;
  }

  function imageAddress(value){
    try{
      const url=new URL(value);
      return /^https?:$/.test(url.protocol) && (url.hostname==='images.openai.com' || /\.(?:png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(url.pathname));
    }catch{return false}
  }
  function embedImageLinks(s){
    return s.replace(/(?<!!)\[([^\]\n]*)\]\((https?:\/\/[^\s)]+)\)/gi,(whole,label,url)=>imageAddress(url)?'!'+whole:whole);
  }
  function escapeLabel(s){return s.replace(/[\\\[\]]/g,'\\$&').replace(/\s+/g,' ')}
  function markdownUrl(s){return s.replace(/[\s<>()]/g,c=>encodeURIComponent(c))}

  // Markdown exporters sometimes escape TeX punctuation as if it were prose.
  function repairMath(body, preserveTableEscapes=false){
    const inAlignment=/\\(?:begin|end)\s*\{/.test(body);
    const tokens=/\\(?:text\w*|operatorname|mbox|verb\*?)\s*(?=\{)|\\_|\\[\\{}]|[{}]/g;
    let out='', pos=0, depth=0, textDepth=0, nextText=false;
    for(const match of body.matchAll(tokens)){
      const token=match[0];
      out+=body.slice(pos,match.index);
      pos=match.index+token.length;
      if(token==='{'){
        depth++;
        if(nextText && !textDepth) textDepth=depth;
        nextText=false;
      }else if(token==='}'){
        if(textDepth===depth) textDepth=0;
        depth=Math.max(0,depth-1);
      }else if(token==='\\_' && !textDepth && body[pos]==='{'){
        out+='_';
        continue;
      }else if(token.startsWith('\\') && token.length>2) nextText=true;
      out+=token;
    }
    out+=body.slice(pos);
    // A doubled backslash before both bars is a line break in TeX.
    // Keep row breaks in matrices and alignment environments intact.
    return inAlignment || preserveTableEscapes ? out : out.replace(/(?<!\\)\\\\\|([^\n|]+?)(?<!\\)\\\\\|/g,(_,inner)=>'\\|'+inner+'\\|');
  }

  // Markdown tables consume one backslash before each pipe, before TeX is parsed.
  // Use equivalent TeX symbols for simple expressions. Where a pipe may be syntax
  // (an array preamble or verbatim text), escape exactly one Markdown layer.
  function tableTex(tex, markdownEscaped) {
    // Existing dollar math may already contain the Markdown escape layer. Keep
    // those bytes so a second pass cannot turn a norm into an absolute value.
    if (markdownEscaped && /\\\|/.test(tex)) return tex.replace(/(?<!\\)\|/g, '\\|');
    if (/[{}]|\\verb\b/.test(tex)) return tex.replace(/\|/g, '\\|');
    return tex.replace(/\\\||\|/g, (bar, offset) => {
      const command = bar === '|' ? '\\vert' : '\\Vert';
      return /[a-zA-Z]/.test(tex.charAt(offset + bar.length)) ? command + ' ' : command;
    });
  }

  function cellFormula(body, display, markdownEscaped) {
    const tex = tableTex(body.trim().replace(/[ \t]*\n[ \t]*/g, ' '), markdownEscaped);
    return '$' + (display ? '\\displaystyle ' : '') + tex + '$';
  }

  function convertMath(s, inTable=false){
    let out='', pos=0, count=0, repaired=0, unmatched=false;
    const tokens=/^ {0,3}(?:`{3,}|~{3,})[^\n]*|`+|\\+[()[\]]|(?<!\\)\${1,2}|^&#(?:x20|32);/gmi;
    let match;
    while((match=tokens.exec(s))){
      const start=match.index, token=match[0];
      out+=embedImageLinks(s.slice(pos,start));
      pos=tokens.lastIndex;
      if(token[0]==='&'){out+=' ';continue}
      const fence=token.match(/^ {0,3}(`{3,}|~{3,})/);
      if(fence && (start===0 || s[start-1]==='\n')){
        const mark=fence[1];
        const closing=new RegExp('^ {0,3}'+mark[0]+'{'+mark.length+',}[ \\t]*$','gm');
        closing.lastIndex=pos;
        const end=closing.exec(s);
        pos=end?closing.lastIndex:s.length;
        out+=s.slice(start,pos);
      }else if(token.startsWith('`')){
        const ends=new RegExp('(?<!`)`{'+token.length+'}(?!`)','g');
        ends.lastIndex=pos;
        if(ends.exec(s)) pos=ends.lastIndex;
        out+=s.slice(start,pos);
      }else if(token[0]==='$'){
        const block=token==='$$';
        const closing=block?/(?<!\\)\$\$/g:/(?<![\\\s])\$(?![\d$])/g;
        closing.lastIndex=pos;
        const end=closing.exec(s);
        if(!end || (!block && (/\s/.test(s[pos]||' ') || /[\n$]/.test(s.slice(pos,end.index))))){
          out+=token;continue;
        }
        const original=s.slice(pos,end.index);
        const fixed=repairMath(original,inTable);
        if(fixed!==original) repaired++;
        out+=inTable ? cellFormula(fixed,block,true) : token+fixed+token;
        pos=closing.lastIndex;
      }else{
        const block=token.endsWith('[');
        if(token.length>3 || !(block || token.endsWith('('))){out+=token;continue}
        const close=token.slice(0,-1)+(block?']':')');
        let end=s.indexOf(close,pos);
        while(end>=0){
          let p=end;
          while(p>pos && s[p-1]==='\\') p--;
          if(p===end) break;
          end=s.indexOf(close,end+2);
        }
        if(end<0 || /\n[ \t]*\n/.test(s.slice(pos,end)) && !block){
          unmatched=true;out+=token;continue;
        }
        let body=s.slice(pos,end).trim();
        if(token.length===3){
          // In double-escaped LaTeX, commands and alignment row breaks may both be doubled.
          body=body.replace(/\\{4}/g,'\\\\').replace(/\\\\(?=[a-zA-Z])/g,'\\');
        }
        pos=end+close.length;count++;
        const fixed=repairMath(body);
        if(fixed!==body) repaired++;
        body=fixed;
        if(inTable) out+=cellFormula(body,block,false);
        else if(block){
          if(out && !out.endsWith('\n')) out+='\n';
          out+='$$\n'+body+'\n$$';
          if(s[pos] && s[pos]!=='\n') out+='\n';
        }else out+='$'+body.replace(/[ \t]*\n[ \t]*/g,' ')+'$';
      }
      tokens.lastIndex=pos;
    }
    return {value:out+embedImageLinks(s.slice(pos)), count, repaired, unmatched};
  }

  // Plain-text clipboard data sometimes puts each cell of a glossary on its own line.
  function restoreGlossaries(s){
    const lines=s.split('\n'), output=[];
    let fence=null;
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      const mark=line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if(mark){
        if(!fence) fence=mark[1];
        else if(mark[1][0]===fence[0] && mark[1].length>=fence.length && !mark[2].trim()) fence=null;
      }
      if(!fence && line.trim()==='符号' && lines[i+1]?.trim()==='含义'){
        let j=i+2;
        const rows=[];
        while(/^\$[^$\n]+\$$/.test(lines[j]?.trim()||'') && lines[j+1]?.trim() && !/^[|#$]/.test(lines[j+1].trim())){
          const symbol=lines[j].trim().slice(1,-1);
          const meaning=convertMath(lines[j+1].trim(),true).value.replace(/(?<!\\)\|/g,'\\|');
          rows.push('| '+cellFormula(symbol,false,false)+' | '+meaning+' |');
          j+=2;
        }
        if(rows.length){
          output.push('','| 符号 | 含义 |','| --- | --- |',...rows,'');
          i=j-1;
          continue;
        }
      }
      output.push(line);
    }
    return output.join('\n');
  }

  // Convert a complete preference example only when both labelled responses are present.
  function preferenceCards(markdown){
    const lines=markdown.split('\n'), output=[];
    const label=line=>(line||'').trim().replace(/^#{1,6}\s+/, '').replace(/\*\*/g,'');
    const blankLinesAfter=i=>{while(i<lines.length && !lines[i].trim()) i++;return i};
    function answer(at,letter){
      const match=label(lines[at]).match(/^Response\s+([AB])\s*(?:[（(·:：—-]?\s*(Chosen|Rejected)\s*[）)]?)?$/i);
      if(!match || match[1].toUpperCase()!==letter) return null;
      let badge=match[2], start=blankLinesAfter(at+1);
      if(!badge && /^(Chosen|Rejected)$/i.test(label(lines[start]))){
        badge=label(lines[start]);
        start=blankLinesAfter(start+1);
      }
      if(!badge || start>=lines.length) return null;
      const chosen=badge.toLowerCase()==='chosen';
      return {start,title:'> [!'+(chosen?'success':'failure')+'] Response '+letter+' · '+(chosen?'Chosen':'Rejected')};
    }
    function quote(title,body){
      return [title,...body.join('\n').trim().split('\n').map(line=>line?'> '+line:'>')].join('\n');
    }
    let fence='';
    for(let i=0;i<lines.length;i++){
      const mark=lines[i].match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if(mark){
        if(!fence) fence=mark[1];
        else if(mark[1].startsWith(fence) && !mark[2].trim()) fence='';
      }
      if(fence || !/^Prompt[:：]?$/i.test(label(lines[i]))){output.push(lines[i]);continue}
      let a=null,b=null,j=i+1;
      // Limit the match to one example. Never cross a heading, code block or another prompt.
      for(;j<lines.length;j++){
        if(!a && (a=answer(j,'A'))){a.at=j;j=a.start-1;continue}
        if(a && (b=answer(j,'B'))) break;
        if(/^(?:Prompt[:：]?|Response\s+[AB].*)$/i.test(label(lines[j])) || /^(?:#{1,6}\s|`{3,}|~{3,})/.test(lines[j])) break;
      }
      if(!b || !lines.slice(i+1,a.at).join('').trim() || !lines.slice(a.start,j).join('').trim()){
        output.push(lines[i]);continue;
      }
      let end=b.start;
      while(end<lines.length && lines[end].trim() && !/^(?:监督信号\s*[:：]|#{1,6}\s|Prompt$)/i.test(label(lines[end])) && !/^#{1,6}\s/.test(lines[end])) end++;
      if(end===b.start){output.push(lines[i]);continue}
      output.push('',quote('> [!question] Prompt',lines.slice(i+1,a.at)),'',quote(a.title,lines.slice(a.start,j)),'',quote(b.title,lines.slice(b.start,end)),'');
      i=end-1;
    }
    return output.join('\n');
  }

  // Parse clipboard HTML in an inert template. Only extracted Markdown leaves it.
  function readRich(html, document){
    const template=document.createElement('template');
    template.innerHTML=html;
    const root=template.content;
    let recovered=0, missing=0, images=0, unavailable=0, links=0, cellMath=false;
    const mathSelector='.katex-display,.katex,math,mjx-container,[data-math],[data-latex],[data-tex]';
    function walk(n){
      if(n.nodeType===3) return n.data.replace(/\s+/g,' ');
      if(n.nodeType!==1) return '';
      const tag=n.localName;
      if(['style','script','button','noscript'].includes(tag)) return '';
      if(tag==='pre'){
        const code=n.querySelector('code')||n;
        const lang=code.className.match?.(/(?:^|\s)language-([\w-]+)/)?.[1]||'';
        const ticks='`'.repeat(Math.max(3,...Array.from(code.textContent.matchAll(/`+/g),m=>m[0].length+1)));
        return '\n\n'+ticks+lang+'\n'+code.textContent.replace(/\n$/,'')+'\n'+ticks+'\n\n';
      }
      if(tag==='code'){
        const ticks='`'.repeat(Math.max(1,...Array.from(n.textContent.matchAll(/`+/g),m=>m[0].length+1)));
        return ticks+n.textContent+ticks;
      }
      if(n.matches(mathSelector)){
        const tex=n.querySelector('annotation[encoding="application/x-tex" i]')?.textContent ?? n.getAttribute('data-latex') ?? n.getAttribute('data-tex') ?? n.getAttribute('data-math');
        if(!tex?.trim()){missing++;return n.innerText||n.textContent}
        recovered++;
        const block=n.matches('.katex-display,[display="block"],[display="true"]') || !!n.querySelector('math[display="block"]') || n.parentElement?.matches('.math-display,.math-block');
        return block?'\\['+tex+'\\]':'\\('+tex+'\\)';
      }
      if(tag==='img'){
        const url=n.getAttribute('src')||n.getAttribute('data-src')||'';
        const alt=escapeLabel(n.getAttribute('alt')||'图片');
        if(!/^https?:\/\//i.test(url)){
          unavailable++;
          return '\n\n[图片未能导出：'+alt+'，请另存图片后拖入 Obsidian]\n\n';
        }
        images++;
        return '!['+alt+']('+markdownUrl(url)+')';
      }
      if(tag==='svg'||tag==='canvas'){
        unavailable++;
        return '\n\n[图形未能导出，请另存图片后拖入 Obsidian]\n\n';
      }
      if(tag==='table'){
        const rows=Array.from(n.rows,row=>Array.from(row.cells,cell=>{
          const value=Array.from(cell.childNodes,walk).join('').trim().replace(/\s*\n+\s*/g,' ');
          const converted=convertMath(value,true).value;
          if(converted!==value) cellMath=true;
          return converted.replace(/(?<!\\)\|/g,'\\|');
        }));
        if(!rows.length) return '';
        const width=Math.max(...rows.map(row=>row.length));
        rows.splice(1,0,Array(width).fill('---'));
        return '\n\n'+rows.map(row=>'| '+Array.from({length:width},(_,i)=>row[i]||'').join(' | ')+' |').join('\n')+'\n\n';
      }
      const body=Array.from(n.childNodes,walk).join('');
      if(['span','strong','b'].includes(tag) && /^(Prompt|Response [AB]|Chosen|Rejected)$/i.test(body.trim())){
        return '\n'+body.trim()+'\n';
      }
      if(/^h[1-6]$/.test(tag)) return '\n\n'+'#'.repeat(Number(tag[1]))+' '+body.trim()+'\n\n';
      if(tag==='br') return '\n';
      if(tag==='li') return '\n'+(n.parentElement?.localName==='ol'?(Array.from(n.parentElement.children).indexOf(n)+Number(n.parentElement.getAttribute('start')||1))+'. ':'- ')+body.trim();
      if(tag==='strong'||tag==='b') return '**'+body+'**';
      if(tag==='em'||tag==='i') return '*'+body+'*';
      if(tag==='a' && /^https?:\/\//i.test(n.getAttribute('href')||'')){
        links++;
        return '['+(body.trim()||escapeLabel(n.getAttribute('aria-label')||n.getAttribute('href')))+']('+markdownUrl(n.getAttribute('href'))+')';
      }
      if(tag==='p'||tag==='div'||tag==='ol'||tag==='ul') return '\n\n'+body.trim()+'\n\n';
      return body;
    }
    const value=Array.from(root.childNodes,walk).join('').trim();
    return {value,recovered,missing,images,unavailable,links,cellMath,table:!!root.querySelector('table')};
  }
  function readClipboard(data, document=globalThis.document){
    const html=data.getData('text/html');
    const md=data.getData('text/markdown');
    let value=md||data.getData('text/plain'),warning='';
    let richMath=false;
    if(html){
      const rich=readRich(html,document);
      if(!md && !rich.missing && preferenceCards(rich.value)!==rich.value) value=rich.value;
      if((!md && (rich.recovered || rich.links || rich.images || rich.unavailable || (rich.table && !/^\s*\|.*\|/m.test(value)))) || (rich.images && !rich.missing && !/!\[/.test(value))) value=rich.value;
      if(value===rich.value) richMath=!!(rich.recovered || rich.cellMath);
      if(rich.missing) warning='部分公式缺少 LaTeX 源码，请核对，或使用 ChatGPT 回复下方的复制按钮重新复制。';
      if(rich.unavailable) warning+=' 有 '+rich.unavailable+' 张图片或图形没有可用的网址，请另存图片后拖入 Obsidian。';
    }
    if(Array.from(data.items || []).some(item=>item.kind==='file'&&item.type.startsWith('image/'))) warning+=' 剪贴板含有图片文件，请将图片保存后拖入 Obsidian。';
    return {value,warning,richMath};
  }

  // Reuse the renderer's CommonMark block rules. Four spaces can mean code at
  // the top level, or ordinary continuation text inside a list.
  function classifyRows(lines) {
    const kinds = Array(lines.length).fill('prose');
    const headerProbe = lines.map((line, index) => {
      const divider = lines[index + 1] || '';
      if (line.includes('|') && /^[ \t>]*\|?\s*:?-+:?\s*(?:\||$)/.test(divider)) {
        // An unescaped pipe inside a header formula can hide the table itself.
        return convertMath(line, true).value;
      }
      return line;
    });
    for (const token of parser.parse(headerProbe.join('\n'), {})) {
      if (token.type === 'code_block' || token.type === 'fence') {
        kinds.fill('verbatim', token.map[0], token.map[1]);
      } else if (token.type === 'table_open') {
        kinds.fill('table', token.map[0], token.map[1]);
      }
    }
    if (lines[0]?.trimEnd() === '---') {
      const end = lines.findIndex((line, index) => index > 0 && /^(?:---|\.\.\.)[ \t]*$/.test(line));
      if (end > 0) kinds.fill('verbatim', 0, end + 1);
    }
    return kinds;
  }

  function convertNote(input, {tableCell = false, tableRows = false, unwrap = true} = {}) {
    const normalized = input.replace(/\r\n?/g, '\n');
    if (tableCell) return convertMath(normalized, true);
    const lines = (unwrap ? unwrapMarkdown(normalized) : normalized).split('\n');
    const kinds = classifyRows(lines);
    if (tableRows) {
      for (let i = 0; i < lines.length; i++) {
        if (kinds[i] === 'prose' && lines[i].includes('|')) kinds[i] = 'table';
      }
    }
    const output = [], prose = [];
    let count = 0, repaired = 0, unmatched = false;
    function flushProse() {
      if (!prose.length) return;
      output.push(preferenceCards(restoreGlossaries(prose.join('\n'))));
      prose.length = 0;
    }
    for (let start = 0; start < lines.length;) {
      const kind = kinds[start];
      let end = start + 1;
      while (end < lines.length && kinds[end] === kind) end++;
      const chunk = lines.slice(start, end).join('\n');
      if (kind === 'verbatim') {
        flushProse();
        output.push(chunk);
      } else {
        // A delimiter missing from one cell must never consume the next table row.
        const fragments = kind === 'table' ? lines.slice(start, end) : [chunk];
        for (const fragment of fragments) {
          const result = convertMath(fragment, kind === 'table');
          prose.push(result.value);
          count += result.count;
          repaired += result.repaired;
          unmatched ||= result.unmatched;
        }
      }
      start = end;
    }
    flushProse();
    return {value: output.join('\n'), count, repaired, unmatched};
  }

  // Classify the replacement point in the surrounding note without editing it.
  // A probe inside existing inline code or math remains protected by convertMath.
  function editorContext(source, from, to) {
    let marker = 'FormulaNoteCursor';
    while (source.includes(marker)) marker += '_';
    const before = source.slice(0, from);
    // Keep the selected text during the probe. It may contain the closing
    // backtick or math delimiter that protects the beginning of the selection.
    const lines = (before + '\\(' + marker + '\\)' + source.slice(from)).split('\n');
    const line = before.split('\n').length - 1;
    const kinds = classifyRows(lines);
    const kind = kinds[line];
    if (kind === 'verbatim') return null;
    const linePrefix = before.slice(before.lastIndexOf('\n') + 1);
    if (/^[ \t]+$/.test(linePrefix) && classifyRows(source.split('\n'))[line] === 'verbatim') return null;
    let start = line, end = line + 1;
    while (start > 0 && kinds[start - 1] === kind) start--;
    while (end < lines.length && kinds[end] === kind) end++;
    const probe = convertMath(lines.slice(start, end).join('\n'), kind === 'table');
    if (!probe.value.includes('$' + marker + '$')) return null;
    if (kind !== 'table') return {};
    const after = source.slice(to);
    const startsLine = !linePrefix.trim();
    const endsLine = !after.split('\n', 1)[0].trim() || (from < to && source[to - 1] === '\n');
    if (startsLine && endsLine) return {tableRows: from !== to};
    return {tableCell: true};
  }

  return {convertNote, readClipboard, editorContext};
}

if (typeof module !== 'undefined' && module.exports) module.exports = createFormulaNotes;
