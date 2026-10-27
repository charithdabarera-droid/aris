// ARIS browser-only "backend": Pollinations LLM + Wikipedia/DuckDuckGo search + localStorage memory.
const LLM_URL='https://text.pollinations.ai/openai', LLM_MODEL='openai';
const mem={get:()=>JSON.parse(localStorage.arisMem||'{"facts":[]}'),set:m=>localStorage.arisMem=JSON.stringify(m)};
function remember(text){const m=mem.get(),k=x=>x.toLowerCase().replace(/^(the )?user (prefers|likes|takes|supports) /,'').replace(/\W/g,'');
  if(m.facts.some(f=>k(f.text)===k(text)||k(f.text).includes(k(text))||k(text).includes(k(f.text))))return false;m.facts.push({text,at:new Date().toISOString()});mem.set(m);return true}
const strip=h=>String(h||'').replace(/<[^>]+>/g,'').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&#039;/g,"'");
async function webSearch(q){const out=[];
  try{const d=await (await fetch('https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q='+encodeURIComponent(q))).json();
    if(d.AbstractText)out.push({title:d.Heading||q,url:d.AbstractURL,snippet:d.AbstractText});if(d.Answer)out.push({title:'Instant answer',url:'https://duckduckgo.com/?q='+encodeURIComponent(q),snippet:String(d.Answer)});
    (d.RelatedTopics||[]).filter(t=>t.Text).slice(0,2).forEach(t=>out.push({title:t.Text.slice(0,60),url:t.FirstURL,snippet:t.Text}));}catch(e){}
  try{const d=await (await fetch('https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=4&srsearch='+encodeURIComponent(q))).json();
    d.query.search.forEach(s=>out.push({title:s.title+' (Wikipedia)',url:'https://en.wikipedia.org/wiki/'+encodeURIComponent(s.title.replace(/ /g,'_')),snippet:strip(s.snippet)}));}catch(e){}
  return out.slice(0,6)}
async function fetchPage(u){const r=await fetch('https://r.jina.ai/'+u);return (await r.text()).slice(0,6000)}
function sysPrompt(p){const f=mem.get().facts;return `You are ARIS, a calm, witty, impeccably polite British butler-style AI assistant to ${p.name||'Jude Dabarera'} (based in Dubai). Address the user as "${p.honorific||'sir'}" naturally. Be concise (1-4 sentences unless asked), dry-humoured, warm; happy to chat casually. Never make up facts. Current time (Dubai): ${new Date().toLocaleString('en-GB',{timeZone:'Asia/Dubai'})}.
${p.location?`User's approximate location: ${p.location}.`:''}
${p.perms.memory?`Known facts about the user:\n${f.map(x=>'- '+x.text).join('\n')||'(none yet)'}`:'Memory is disabled by the user.'}
${p.perms.web?'':'Internet access is disabled by the user; say so if asked for live info.'}
Replies are spoken aloud: no markdown tables.

TOOLS (text protocol): To use a tool, reply with ONLY one line and nothing else:
${p.perms.web?'[[SEARCH: query]] — web/encyclopedia search (Wikipedia + DuckDuckGo instant answers; weak for breaking news)\n[[FETCH: https://url]] — read a web page\n':''}You will then receive the result and should answer normally.${p.perms.memory?'\nTo save a NEW durable fact about the user, append on its own line at the end of a normal reply: [[REMEMBER: fact]]':''}
Never invent tool results.`}
async function callLLM(msgs,force){for(let a=0;a<3;a++){try{const r=await fetch(LLM_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:LLM_MODEL,messages:msgs})});
  if(!r.ok)throw new Error('LLM '+r.status);const m=(await r.json()).choices?.[0]?.message||{};
  if(!(m.content||'').trim()&&(force||!/search|current|latest/i.test(m.reasoning||''))&&a<2)throw new Error('empty');return m}catch(e){if(a>=2)throw e;await new Promise(r=>setTimeout(r,1500))}}}
async function chat(p){const msgs=[{role:'system',content:sysPrompt(p)},...p.messages.slice(-20)];const log=[];let sources=[];
  for(let i=0;i<4;i++){const searched=log.length>0;const m=await callLLM(msgs,searched);let c=(m.content||'').trim();
    if(!c&&searched&&sources.length)c='Here is what I found, '+(p.honorific||'sir')+': '+sources[0].snippet;
    if(!c&&p.perms.web&&!searched&&/search|current|latest|look up/i.test(m.reasoning||''))c='[[SEARCH: '+((m.reasoning.match(/\[\[SEARCH:\s*([^\]]+)\]\]/i)||[])[1]||p.messages.at(-1).content).slice(0,150)+']]';
    const sm=c.match(/\[\[(SEARCH|FETCH):\s*([^\]]+)\]\]/i);
    if(sm&&p.perms.web){msgs.push({role:'assistant',content:c});let out;const arg=sm[2].trim();
      try{if(sm[1].toUpperCase()==='SEARCH'){const r=await webSearch(arg);log.push('web_search: '+arg);sources=r.slice(0,3);out=r.map((x,i)=>`${i+1}. ${x.title} (${x.url}): ${x.snippet}`).join('\n')||'no results'}
        else{log.push('fetch_page: '+arg);out=await fetchPage(arg)}}catch(e){out='error: '+e.message}
      msgs.push({role:'user',content:`TOOL RESULT (${sm[1]}):\n${String(out).slice(0,6000)}\n\nNow answer my previous message using this, in character, in plain prose (1-4 sentences), no tool lines. If the results don't answer it, say so honestly.`});continue}
    for(const r of c.matchAll(/\[\[REMEMBER:\s*([^\]]+)\]\]/gi))if(p.perms.memory&&remember(r[1].trim()))log.push('remember_fact: '+r[1].trim());
    c=c.replace(/\[\[[A-Z]+:[^\]]*\]\]/gi,'').trim();return{reply:c||'Done, '+(p.honorific||'sir')+'.',tools:log,sources}}
  return{reply:'I appear to have gone round in circles.',tools:log,sources}}
const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}});
async function apiFetch(url,opt={}){const u=new URL(url,location.href),b=opt.body?JSON.parse(opt.body):{},M=(opt.method||'GET').toUpperCase();
  try{if(u.pathname.endsWith('/api/status'))return J({demo:false,model:'pollinations/openai (free)'});
  if(u.pathname.endsWith('/api/memory')){const m=mem.get();if(M==='DELETE'){const i=u.searchParams.get('i');if(i!==null)m.facts.splice(+i,1);else m.facts=[];mem.set(m)}else if(M==='POST'&&b.text){m.facts.push({text:b.text,at:new Date().toISOString()});mem.set(m)}return J(mem.get())}
  if(u.pathname.endsWith('/api/chat')){b.perms=b.perms||{};return J(await chat(b))}}catch(e){return J({error:e.message},500)}return J({error:'not found'},404)}
