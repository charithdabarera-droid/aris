// ARIS browser-only brain: streaming LLM (llm7.io keyless -> Pollinations fallback), keyword-gated search, localStorage memory.
const MODELS=[{name:'llm7/mistral-nemo',url:'https://api.llm7.io/v1/chat/completions',model:'default',ttfb:5000},
              {name:'pollinations/gpt-oss-20b',url:'https://text.pollinations.ai/openai',model:'openai-fast',ttfb:15000}];
const mem={get:()=>JSON.parse(localStorage.arisMem||'{"facts":[]}'),set:m=>localStorage.arisMem=JSON.stringify(m)};
function remember(text){const m=mem.get(),k=x=>x.toLowerCase().replace(/^(the )?user (prefers|likes|takes|supports|is) /,'').replace(/\W/g,'');
  if(!k(text)||m.facts.some(f=>k(f.text)===k(text)||k(f.text).includes(k(text))||k(text).includes(k(f.text))))return false;m.facts.push({text,at:new Date().toISOString()});mem.set(m);return true}
const strip=h=>String(h||'').replace(/<[^>]+>/g,'').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&#039;/g,"'");
const tfetch=(u,ms,o={})=>fetch(u,{...o,signal:AbortSignal.timeout(ms)});
async function webSearch(q){const out=[];
  const [dd,wk]=await Promise.allSettled([tfetch('https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q='+encodeURIComponent(q),3000).then(r=>r.json()),
    tfetch('https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=3&srsearch='+encodeURIComponent(q),3000).then(r=>r.json())]);
  if(dd.value){const d=dd.value;if(d.Answer)out.push({title:'Instant answer',url:'https://duckduckgo.com/?q='+encodeURIComponent(q),snippet:String(d.Answer)});if(d.AbstractText)out.push({title:d.Heading||q,url:d.AbstractURL,snippet:d.AbstractText.slice(0,400)})}
  if(wk.value)(wk.value.query?.search||[]).forEach(s=>out.push({title:s.title+' (Wikipedia)',url:'https://en.wikipedia.org/wiki/'+encodeURIComponent(s.title.replace(/ /g,'_')),snippet:strip(s.snippet)}));
  return out.slice(0,4)}
// Search only when clearly asked for a lookup/factual/current info
function needsSearch(t){t=t.toLowerCase();return /\b(search|look ?up|google|find out|wiki|who (is|was|are|were|won|invented|founded)|what (is|was|are) (a |an |the )?[a-z]|when (did|was|is)|where (is|was)|how (tall|big|old|far|many|much)|history of|define|definition|latest|news|today'?s|current(ly)?|price of|population|capital of)\b/.test(t)&&!/\b(what is your|who are you|what should i|how are you)\b/.test(t)}
function searchQuery(t){return t.replace(/^(hey |hi |ok |okay )?(aris[, ]*)?/i,'').replace(/\b(please|can you|could you|search( for)?|look (it )?up|google|for me|tell me)\b/gi,'').replace(/[?!.]+$/,'').trim().slice(0,120)||t}
function sysPrompt(p,ctx){const f=p.perms.memory?mem.get().facts.slice(-15).map(x=>x.text).join('; '):'';
  return `You are ARIS, ${p.name||'Jude'}'s calm, witty British butler AI (he lives in Dubai). Call him "${p.honorific||'sir'}". Reply in 1-3 short spoken sentences, no markdown. Never invent facts (never mention weather, news or numbers unless given below). Dubai time: ${new Date().toLocaleString('en-GB',{timeZone:'Asia/Dubai',weekday:'short',hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'})}.${p.location?' Location: '+p.location+'.':''}${f?' Known about him: '+f+'.':''}${p.perms.memory?' If he shares a new lasting fact or preference, end with [[REMEMBER: fact]].':''}${ctx?'\nYou have just searched the web for him. Answer from these results, naming the source briefly; never say you cannot browse. If they do not answer it, say so.\nRESULTS:\n'+ctx:''}`}
async function streamLLM(M,msgs,onTok){const ctl=new AbortController();let tm=setTimeout(()=>ctl.abort(),M.ttfb);
  const r=await fetch(M.url,{method:'POST',signal:ctl.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({model:M.model,messages:msgs,stream:true,max_tokens:150,temperature:0.7})});
  if(!r.ok){clearTimeout(tm);const e=new Error(M.name+' HTTP '+r.status);e.status=r.status;throw e}
  const rd=r.body.getReader(),dec=new TextDecoder();let buf='',txt='',first=true;
  for(;;){const{done,value}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});const ls=buf.split('\n');buf=ls.pop();
    for(const l of ls){if(!l.startsWith('data:')||l.includes('[DONE]'))continue;let c;try{c=JSON.parse(l.slice(5)).choices?.[0]?.delta?.content}catch{}
      if(c){if(first){first=false;clearTimeout(tm);tm=setTimeout(()=>ctl.abort(),20000)}txt+=c;onTok(c,txt)}}}
  clearTimeout(tm);if(!txt.trim())throw new Error(M.name+' empty');return txt}
// p: {messages,name,honorific,perms,location}; cb: {onTok(delta,full), onStatus(s)}
async function chatStream(p,cb={}){const log=[];let sources=[],ctx='';const last=p.messages.at(-1).content;
  if(p.perms.web&&needsSearch(last)){cb.onStatus?.('searching');const q=searchQuery(last);try{sources=await webSearch(q)}catch{};log.push('web_search: '+q);
    ctx=sources.map((x,i)=>`${i+1}. ${x.title}: ${x.snippet}`).join('\n')||'(no results found)'}
  const msgs=[{role:'system',content:sysPrompt(p,ctx)},...p.messages.slice(-12)];let txt='',used='',err;
  outer:for(const M of MODELS)for(let a=0;a<2;a++){try{txt=await streamLLM(M,msgs,(d,f)=>cb.onTok?.(d,f.replace(/\[\[[^\]]*\]?\]?/g,'')));used=M.name;break outer}
    catch(e){err=e;if(txt)break outer;if(e.status===429&&a===0){await new Promise(r=>setTimeout(r,1100));continue}break}}
  if(!used&&!txt)throw new Error('The free AI services are busy right now ('+(err?.message||'unknown')+'). Try again in a moment.');
  for(const r of txt.matchAll(/\[\[REMEMBER:\s*([^\]]+)\]\]/gi))if(p.perms.memory&&remember(r[1].trim()))log.push('remember_fact: '+r[1].trim());
  return{reply:txt.replace(/\[\[[^\]]*\]\]/g,'').trim(),tools:log,sources,model:used}}
const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}});
async function apiFetch(url,opt={}){const u=new URL(url,location.href),b=opt.body?JSON.parse(opt.body):{},M=(opt.method||'GET').toUpperCase();
  if(u.pathname.endsWith('/api/status'))return J({demo:false,model:'llm7 · fast'});
  if(u.pathname.endsWith('/api/memory')){const m=mem.get();if(M==='DELETE'){const i=u.searchParams.get('i');if(i!==null)m.facts.splice(+i,1);else m.facts=[];mem.set(m)}else if(M==='POST'&&b.text){m.facts.push({text:b.text,at:new Date().toISOString()});mem.set(m)}return J(mem.get())}
  return J({error:'not found'},404)}
if(typeof module!=='undefined')module.exports={chatStream,needsSearch,searchQuery,mem};
