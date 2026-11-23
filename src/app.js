
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

const converter = createFormulaNotes(window.markdownit);
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
      for(const box of fragment.content.querySelectorAll('blockquote')){
        const paragraph=box.firstElementChild, first=paragraph?.firstChild;
        if(first?.nodeType!==3) continue;
        const heading=first.data.match(/^\[!(question|success|failure)\]\s+([^\n]+)$/i);
        if(!heading) continue;
        box.classList.add('preference-card',heading[1].toLowerCase());
        const title=document.createElement('strong');
        title.textContent=heading[2];first.replaceWith(title);
      }
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
  const result=converter.convertNote(src.value);
  dst.value=result.value;
  schedulePreview();
  copy.disabled=!dst.value.trim();
  document.querySelector('#save').disabled=copy.disabled;
  document.querySelector('#example').disabled=!!src.value;
  copy.textContent='复制全文';
  statusLine.textContent=!src.value?'等待输入':result.count?'已转换 '+result.count+' 处公式':'文本已就绪';
  if(result.repaired) statusLine.textContent+=' · 已修复 '+result.repaired+' 处公式内的转义';
  notice.textContent=[pasteWarning,result.unmatched?'检测到未配对的公式标记，已保留原文，请检查。':''].filter(Boolean).join('\n');
}
src.addEventListener('paste',e=>{
  const data=e.clipboardData;
  if(!data) return;
  const {value,warning}=converter.readClipboard(data);
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
