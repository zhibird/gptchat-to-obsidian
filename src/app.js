
'use strict';
const src=document.querySelector('#src'), dst=document.querySelector('#dst');
const copy=document.querySelector('#copy'), statusLine=document.querySelector('#status'), notice=document.querySelector('#notice');
const example=String.raw`数学上可以简单表示为：

\[ z_t=\mathrm{Encoder}(o_t) \]

\[ \hat z_{t+1}=\mathrm{Predictor}(z_t,a_t) \]

其中：

| 符号 | 含义 |
| --- | --- |
| \(o_t\) | 当前时刻的图像观测 |
| \(z_t\) | 当前图像对应的潜在表示 |
| \(a_t\) | 当前执行的动作 |
| \(\hat z_{t+1}\) | 模型预测的下一时刻潜在表示 |

预测损失：

\[ \mathcal L_{\mathrm{pred}} = \|\hat z_{t+1}-z_{t+1}\|^2 \]`;

function unwrapMarkdown(s){
  const lines=s.trim().split('\n');
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
function repairMath(body){
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
  return inAlignment?out:out.replace(/(?<!\\)\\\\\|([^\n|]+?)(?<!\\)\\\\\|/g,(_,inner)=>'\\|'+inner+'\\|');
}

function convert(input){
  const s=unwrapMarkdown(input.replace(/\r\n?/g,'\n'));
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
      const fixed=repairMath(original);
      if(fixed!==original) repaired++;
      out+=token+fixed+token;
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
      if(block){
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
        rows.push('| '+[lines[j],lines[j+1]].map(cell=>cell.trim().replace(/(?<!\\)\|/g,'\\|')).join(' | ')+' |');
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

// Parse pasted HTML inside an inert template. Only extracted text enters the editors.
function readRich(html){
  const template=document.createElement('template');
  template.innerHTML=html;
  const root=template.content;
  let recovered=0, missing=0, images=0, unavailable=0, links=0;
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
      const rows=Array.from(n.rows,row=>Array.from(row.cells,cell=>
        Array.from(cell.childNodes,walk).join('').trim().replace(/\s*\n+\s*/g,' ').replace(/(?<!\\)\|/g,'\\|')));
      if(!rows.length) return '';
      const width=Math.max(...rows.map(row=>row.length));
      rows.splice(1,0,Array(width).fill('---'));
      return '\n\n'+rows.map(row=>'| '+Array.from({length:width},(_,i)=>row[i]||'').join(' | ')+' |').join('\n')+'\n\n';
    }
    const body=Array.from(n.childNodes,walk).join('');
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
  return {value,recovered,missing,images,unavailable,links,table:!!root.querySelector('table')};
}
const preview=document.querySelector('#preview');
const previewButton=document.querySelector('#showPreview'), sourceButton=document.querySelector('#showSource');
const md=window.markdownit({html:false,breaks:true,linkify:true});

// Tokenize math before Markdown can interpret its underscores, escapes or emphasis.
md.inline.ruler.before('escape','note_math',(state,silent)=>{
  const start=state.pos, s=state.src;
  if(s[start]!=='$') return false;
  const display=s[start+1]==='$', width=display?2:1;
  if(!display && /\s/.test(s[start+1]||' ')) return false;
  for(let end=start+width;end<state.posMax;end++){
    if(!display && s[end]==='\n') return false;
    if(s[end]!=='$') continue;
    let p=end;
    while(p>start && s[p-1]==='\\') p--;
    if((end-p)%2) continue;
    if(display && s[end+1]!=='$') continue;
    if(end===start+width || (!display && (/\s/.test(s[end-1]) || /\d/.test(s[end+1]||'')))) return false;
    if(!silent){
      const tok=state.push('note_math','',0);
      tok.content=s.slice(start+width,end);
      tok.block=display;
    }
    state.pos=end+width;
    return true;
  }
  return false;
});
md.block.ruler.before('fence','note_math_block',(state,start,end,silent)=>{
  if(state.sCount[start]-state.blkIndent>=4) return false;
  const line=i=>state.src.slice(state.bMarks[i]+state.tShift[i],state.eMarks[i]);
  const first=line(start);
  if(!first.startsWith('$$')) return false;
  let last=start, body=first.slice(2);
  while(!/(?<!\\)\$\$\s*$/.test(body)){
    if(++last>=end || (line(last).trim() && state.sCount[last]<state.blkIndent)) return false;
    body+='\n'+line(last);
  }
  if(silent) return true;
  const tok=state.push('note_math','',0);
  tok.block=true;
  tok.content=body.replace(/\$\$\s*$/,'').trim();
  tok.map=[start,last+1];state.line=last+1;
  return true;
},{alt:['paragraph','blockquote','list']});
md.renderer.rules.note_math=(tokens,i)=>{
  const token=tokens[i], tag=token.block?'div':'span';
  return '<'+tag+' class="'+(token.block?'display-math':'inline-math')+'" data-formula="">'+
    md.utils.escapeHtml(token.content)+'</'+tag+'>';
};

let previewTimer=0, previewRevision=0;
function schedulePreview(){
  clearTimeout(previewTimer);
  const revision=++previewRevision;
  if(preview.hidden) return;
  if(!dst.value.trim()){preview.replaceChildren();return}
  previewTimer=setTimeout(async()=>{
    try{
      await MathJax.startup.promise;
      if(revision!==previewRevision) return;
      const fragment=document.createElement('template');
      fragment.innerHTML=md.render(dst.value);
      for(const link of fragment.content.querySelectorAll('a')){
        link.target='_blank';link.rel='noopener noreferrer';
      }
      for(const img of fragment.content.querySelectorAll('img')){
        img.referrerPolicy='no-referrer';
        img.addEventListener('error',()=>{
          const message=document.createElement('span');
          message.className='image-failure';
          message.textContent='图片暂时无法加载，地址可能已失效或需要登录。';
          const link=document.createElement('a');
          link.textContent='打开图片地址';link.href=img.src;link.target='_blank';link.rel='noopener noreferrer';
          message.append(' ',link);img.replaceWith(message);
        },{once:true});
      }
      for(const holder of fragment.content.querySelectorAll('[data-formula]')){
        const tex=holder.textContent;
        try{
          const math=MathJax.tex2svg(tex,{display:holder.classList.contains('display-math')});
          const error=math.querySelector('[data-mml-node="merror"]');
          if(error) throw new Error(error.getAttribute('data-mjx-error')||'请检查公式源码');
          holder.replaceChildren(math);
        }catch(error){
          holder.classList.add('math-error');
          holder.textContent='公式错误：'+error.message+'\n'+tex;
        }
      }
      preview.replaceChildren(fragment.content);
    }catch{preview.textContent='预览加载失败，请重新打开此文件。仍可切换到 Markdown 源码复制全文。'}
  },80);
}
function setPreview(show){
  preview.hidden=!show;dst.hidden=show;
  previewButton.setAttribute('aria-pressed',String(show));
  sourceButton.setAttribute('aria-pressed',String(!show));
  schedulePreview();
}
previewButton.onclick=()=>setPreview(true);
sourceButton.onclick=()=>setPreview(false);

let pasteWarning='';
function refresh(){
  const result=convert(src.value);
  dst.value=restoreGlossaries(result.value);
  schedulePreview();
  copy.disabled=!dst.value.trim();
  document.querySelector('#save').disabled=copy.disabled;
  document.querySelector('#example').disabled=!!src.value;
  copy.textContent='复制全文';
  statusLine.textContent=!src.value?'等待输入':result.count?'已转换 '+result.count+' 处公式':'文本已就绪';
  if(result.repaired) statusLine.textContent+=' · 已修复 '+result.repaired+' 处公式内的转义';
  const leftover=/\\[[(]/.test(dst.value);
  notice.textContent=[pasteWarning,result.unmatched?'检测到未配对的公式标记，已保留原文，请检查。':leftover?'右侧仍有原始公式标记，请检查是否位于代码块或行内代码中。':''].filter(Boolean).join('\n');
}
src.addEventListener('paste',e=>{
  const data=e.clipboardData;
  if(!data) return;
  const html=data.getData('text/html');
  const md=data.getData('text/markdown');
  let value=md||data.getData('text/plain'),warning='';
  if(html){
    const rich=readRich(html);
    if((!md && (rich.recovered || rich.links || rich.images || rich.unavailable || (rich.table && !/^\s*\|.*\|/m.test(value)))) || (rich.images && !rich.missing && !/!\[/.test(value))) value=rich.value;
    if(rich.missing) warning='部分公式缺少 LaTeX 源码，请核对，或使用 ChatGPT 回复下方的复制按钮重新复制。';
    if(rich.unavailable) warning+=' 有 '+rich.unavailable+' 张图片或图形没有可用的网址，请另存图片后拖入 Obsidian。';
  }
  if([...data.items].some(item=>item.kind==='file'&&item.type.startsWith('image/'))) warning+=' 剪贴板含有图片文件，请将图片保存后拖入 Obsidian。';
  if(!value && warning){pasteWarning=warning;refresh();return}
  if(!value) return;
  e.preventDefault();
  src.setRangeText(value,src.selectionStart,src.selectionEnd,'end');
  pasteWarning=warning; refresh();
});
src.oninput=()=>{pasteWarning='';refresh()};
document.querySelector('#example').onclick=()=>{src.value=example;refresh()};
document.querySelector('#save').onclick=()=>{
  const url=URL.createObjectURL(new Blob([dst.value],{type:'text/markdown;charset=utf-8'}));
  const a=document.createElement('a');
  a.href=url;a.download='公式笔记.md';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
};
copy.onclick=async()=>{
  try{await navigator.clipboard.writeText(dst.value)}
  catch{
    const restore=!preview.hidden;
    setPreview(false);
    dst.focus();dst.select();
    if(!document.execCommand('copy')){statusLine.textContent='已选中全文，请按 Ctrl+C 复制';return}
    if(restore) setPreview(true);
  }
  copy.textContent='已复制';statusLine.textContent='可以粘贴到 Obsidian';
};
