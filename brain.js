// ARIS browser-only brain: streaming LLM (llm7.io keyless -> Pollinations fallback), keyword-gated search, localStorage memory.
const MODELS=[{name:'llm7/mistral-nemo',url:'https://api.llm7.io/v1/chat/completions',model:'default',ttfb:5000},
              {name:'pollinations/gpt-oss-20b',url:'https://text.pollinations.ai/openai',model:'openai-fast',ttfb:9000}];
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

// ---- Live data: Open-Meteo weather, FX, crypto, news (all keyless, CORS) ----
const WMO={0:'clear sky',1:'mainly clear',2:'partly cloudy',3:'overcast',45:'fog',48:'freezing fog',51:'light drizzle',53:'drizzle',55:'heavy drizzle',56:'freezing drizzle',57:'freezing drizzle',61:'light rain',63:'rain',65:'heavy rain',66:'freezing rain',67:'freezing rain',71:'light snow',73:'snow',75:'heavy snow',77:'snow grains',80:'light showers',81:'showers',82:'violent showers',85:'snow showers',86:'heavy snow showers',95:'thunderstorm',96:'thunderstorm with hail',99:'thunderstorm with heavy hail'};
const isWeather=t=>/\b(weather|forecast|temperature|temp|rain(ing|y)?|raining|sunny|humid(ity)?|hot|cold|wind(y)?|storm|degrees|umbrella|sandstorm|fog)\b/i.test(t)&&!/\b(cold|hot) (drink|coffee|tea|water|food|take)\b/i.test(t);
function weatherPlace(t){const m=t.match(/\b(?:in|for|at|of)\s+([A-Z][\w'’.-]*(?:[\s-][A-Z][\w'’.-]*){0,3})/)||t.match(/\b(?:in|for|at)\s+([a-z][a-z'’.-]+(?:\s[a-z][a-z'’.-]+)?)\s*(?:this|today|tomorrow|next|now|right|on|\?|$)/i);
  let c=m&&m[1].replace(/\b(this|today|tomorrow|next|week|weekend|now|the|right|please)\b.*$/i,'').trim();if(c&&/^(the|a|my|me|here|there|town|it)$/i.test(c))c='';return c||''}
async function getWeather(t,locStr){let lat=25.2048,lon=55.2708,name='Dubai, UAE';const city=weatherPlace(t);
  if(city&&!/^dubai$/i.test(city)){const g=await (await tfetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name='+encodeURIComponent(city),4000)).json();
    if(!g.results?.length)return `(Could not find a place called "${city}".)`;const r=g.results[0];lat=r.latitude;lon=r.longitude;name=[r.name,r.admin1,r.country].filter(Boolean).join(', ')}
  else if(!city&&locStr){const m=locStr.match(/lat (-?[\d.]+), lon (-?[\d.]+)/);if(m){lat=+m[1];lon=+m[2];name='your current location'}}
  const u=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=7&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,uv_index_max`;
  const w=await (await tfetch(u,5000)).json(),c=w.current,d=w.daily;
  const days=d.time.map((x,i)=>`${i===0?'TODAY ':i===1?'TOMORROW ':''}${new Date(x+'T12:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'})}: ${WMO[d.weather_code[i]]||'code '+d.weather_code[i]}, ${Math.round(d.temperature_2m_max[i])}°/${Math.round(d.temperature_2m_min[i])}°C, rain chance ${d.precipitation_probability_max[i]??0}%, wind up to ${Math.round(d.wind_speed_10m_max[i])} km/h, UV ${Math.round(d.uv_index_max[i]??0)}`);
  return {text:`WEATHER for ${name} (Open-Meteo, local time ${c.time.replace('T',' ')}, ${w.timezone}):\nNow: ${WMO[c.weather_code]||''}, ${Math.round(c.temperature_2m)}°C (feels ${Math.round(c.apparent_temperature)}°C), humidity ${c.relative_humidity_2m}%, wind ${Math.round(c.wind_speed_10m)} km/h.\n7-day:\n${days.join('\n')}`,src:{title:'Open-Meteo',url:'https://open-meteo.com/'}}}
const isFx=t=>/\b(exchange rate|convert|conversion|usd|aed|dirhams?|dollars?|euros?|eur|gbp|pounds? sterling|inr|rupees?|lkr|currency)\b/i.test(t)&&/\b(rate|convert|how much|worth|price|to|in|vs|against)\b/i.test(t);
const isCrypto=t=>/\b(bitcoin|btc|ethereum|eth|crypto|solana|sol|dogecoin|doge|xrp)\b/i.test(t);
const isNews=t=>/\b(news|headlines?|what'?s happening|latest on|breaking)\b/i.test(t);
async function getFx(){const d=await (await tfetch('https://open.er-api.com/v6/latest/USD',4000)).json();const r=d.rates,f=k=>r[k]?.toFixed(4);
  return {text:`FX RATES (open.er-api.com, updated ${d.time_last_update_utc}): 1 USD = ${f('AED')} AED, ${f('EUR')} EUR, ${f('GBP')} GBP, ${f('INR')} INR, ${f('LKR')} LKR. 1 GBP = ${(r.AED/r.GBP).toFixed(3)} AED. 1 EUR = ${(r.AED/r.EUR).toFixed(3)} AED.`,src:{title:'ExchangeRate-API',url:'https://www.exchangerate-api.com/'}}}
async function getCrypto(){const d=await (await tfetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple,dogecoin&vs_currencies=usd,aed&include_24hr_change=true',4000)).json();
  return {text:'CRYPTO PRICES (CoinGecko, live): '+Object.entries(d).map(([k,v])=>`${k} $${v.usd} (${v.aed} AED, 24h ${v.usd_24h_change?.toFixed(1)}%)`).join('; '),src:{title:'CoinGecko',url:'https://www.coingecko.com/'}}}
async function getNews(t){const q=(t.replace(/\b(what'?s|the|latest|news|headlines?|about|on|in|today|any|tell me|give me|me|please|happening|breaking)\b/gi,' ').replace(/[^\w\s]/g,' ').trim()||'Dubai');
  const d=await (await tfetch(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q+' sourcelang:english')}&mode=artlist&format=json&maxrecords=6&sort=datedesc&timespan=3d`,6000)).json();
  const a=(d.articles||[]).slice(0,5);if(!a.length)return {text:`NEWS: no recent articles found for "${q}".`};
  return {text:`NEWS HEADLINES for "${q}" (GDELT, last 3 days):\n`+a.map(x=>`- ${x.title} (${x.domain}, ${x.seendate?.slice(0,8)})`).join('\n'),src:{title:'GDELT news',url:a[0].url}}}
// Search only when clearly asked for a lookup/factual/current info
function needsSearch(t){t=t.toLowerCase();return /\b(search|look ?up|google|find out|wiki|who (is|was|are|were|won|invented|founded)|what (is|was|are) (a |an |the )?[a-z]|when (did|was|is)|where (is|was)|how (tall|big|old|far|many|much)|history of|define|definition|latest|news|today'?s|current(ly)?|price of|population|capital of)\b/.test(t)&&!/\b(what is your|who are you|what should i|how are you)\b/.test(t)}
function searchQuery(t){return t.replace(/^(hey |hi |ok |okay )?(aris[, ]*)?/i,'').replace(/\b(please|can you|could you|search( for)?|look (it )?up|google|for me|tell me)\b/gi,'').replace(/[?!.]+$/,'').trim().slice(0,120)||t}
function sysPrompt(p,ctx){const f=p.perms.memory?mem.get().facts.slice(-15).map(x=>x.text).join('; '):'';
  return `You are ARIS, ${p.name||'Jude'}'s calm, witty British butler AI (he lives in Dubai). Call him "${p.honorific||'sir'}". Reply in 1-3 short spoken sentences (up to 5 for a weekly forecast), no markdown, no lists. Never invent facts (never mention weather, news or numbers unless given below). Dubai time: ${new Date().toLocaleString('en-GB',{timeZone:'Asia/Dubai',weekday:'short',hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'})}.${p.location?' Location: '+p.location+'.':''}${f?' Facts he told you (state ONLY these, never add others): '+f+'.':' You know nothing personal about him yet.'}${p.perms.memory?' If he shares a new lasting fact or preference, end with [[REMEMBER: fact]].':''}${ctx?'\nYou have just searched the web for him. Answer from these results, naming the source briefly; never say you cannot browse. If they do not answer it, say so. Only use numbers that appear in the data. For a forecast, summarise the week briefly (range of highs/lows, notable rain or wind days).\nDATA:\n'+ctx:''}`}
let gate=Promise.resolve();const slot=()=>{const g=gate.then(()=>new Promise(r=>setTimeout(r,1200)));const mine=gate;gate=g;return mine};
async function streamLLM(M,msgs,onTok){if(M.url.includes('llm7'))await slot();const ctl=new AbortController();let tm=setTimeout(()=>ctl.abort(),M.ttfb);
  const r=await fetch(M.url,{method:'POST',signal:ctl.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({model:M.model,messages:msgs,stream:true,max_tokens:220,temperature:0.7})});
  if(!r.ok){clearTimeout(tm);const e=new Error(M.name+' HTTP '+r.status);e.status=r.status;throw e}
  const rd=r.body.getReader(),dec=new TextDecoder();let buf='',txt='',first=true;
  for(;;){const{done,value}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});const ls=buf.split('\n');buf=ls.pop();
    for(const l of ls){if(!l.startsWith('data:')||l.includes('[DONE]'))continue;let c;try{c=JSON.parse(l.slice(5)).choices?.[0]?.delta?.content}catch{}
      if(c){if(first){first=false;clearTimeout(tm);tm=setTimeout(()=>ctl.abort(),20000)}txt+=c;onTok(c,txt)}}}
  clearTimeout(tm);if(!txt.trim())throw new Error(M.name+' empty');return txt}
// p: {messages,name,honorific,perms,location}; cb: {onTok(delta,full), onStatus(s)}
async function chatStream(p,cb={}){const log=[];let sources=[],ctx='';const last=p.messages.at(-1).content;
  if(p.perms.web){const jobs=[];
    if(isWeather(last))jobs.push(['weather',()=>getWeather(last,p.location)]);
    if(isFx(last))jobs.push(['fx',getFx]);
    if(isCrypto(last))jobs.push(['crypto',getCrypto]);
    if(isNews(last))jobs.push(['news',()=>getNews(last)]);
    if(!jobs.length&&needsSearch(last)){const q=searchQuery(last);jobs.push(['web_search: '+q,async()=>{const r=await webSearch(q);sources.push(...r.slice(0,3));return {text:r.map((x,i)=>`${i+1}. ${x.title}: ${x.snippet}`).join('\n')||'(no search results found)'}}])}
    if(jobs.length){cb.onStatus?.('searching');const res=await Promise.allSettled(jobs.map(j=>j[1]()));
      ctx=res.map((r,i)=>{log.push(jobs[i][0]);if(r.status==='rejected')return `(${jobs[i][0].split(':')[0]} service unavailable right now — tell him you couldn't fetch it; do NOT guess.)`;const v=r.value;if(typeof v==='string')return v;if(v.src)sources.push(v.src);return v.text}).join('\n\n')}}
  else if(isWeather(last)||isNews(last))ctx='(Internet access is disabled in permissions — say you cannot check live data.)';
  const msgs=[{role:'system',content:sysPrompt(p,ctx)},...p.messages.slice(-12)];let txt='',used='',err;
  outer:for(const M of MODELS)for(let a=0;a<(M.url.includes('llm7')?2:1);a++){try{txt=await streamLLM(M,msgs,(d,f)=>cb.onTok?.(d,f.replace(/\[\[[^\]]*\]?\]?/g,'')));used=M.name;break outer}
    catch(e){err=e;if(typeof process!=='undefined'&&process.env.DBG)console.log('   [fail]',M.name,a,e.message);if(txt)break outer;if(a<2&&(e.status===429||e.status>=500||e.name==='AbortError'||/empty|abort|fetch/i.test(e.message))){await new Promise(r=>setTimeout(r,e.status===429?1200*(a+1):300));continue}break}}
  if(!used&&!txt)throw new Error('The free AI services are busy right now ('+(err?.message||'unknown')+'). Try again in a moment.');
  const facts_only=1;const personal=/\b(remember|note that|my |i am|i'm|i like|i love|i prefer|i hate|i support|i live|i work|call me)\b/i.test(last);
  const direct=last.match(/^\s*(?:aris[, ]*)?(?:please )?(?:remember|note) (?:that )?(.{4,200})$/i);if(p.perms.memory&&direct){const f=direct[1].replace(/[.!]+$/,'');if(remember('He said: '+f))log.push('remember_fact: '+f)}
  for(const r of txt.matchAll(/\[\[REMEMBER:\s*([^\]]+)\]\]/gi))if(p.perms.memory&&personal&&!direct&&r[1].trim().length>8&&remember(r[1].trim()))log.push('remember_fact: '+r[1].trim());
  let rep=txt.replace(/\[\[[^\]]*\]\]/g,'').trim();
  if(!/WEATHER for/.test(ctx))rep=rep.replace(/[^.!?]*\b(weather|sunny|sunshine|sun is|skies|forecast|temperature|°C|degrees|rain|humid)\b[^.!?]*[.!?]\s*/gi,'').trim();
  if(!ctx)rep=rep.replace(/[^.!?]*\b(headlines?|stock market (?:is|rose|fell)|according to (?:the )?(?:latest )?(?:news|reports))\b[^.!?]*[.!?]\s*/gi,'').trim();if(rep.replace(/[^a-z0-9]/gi,'').length<2)rep='';
  return{reply:rep||(log.length?'Noted, '+(p.honorific||'sir')+'.':'Very good, '+(p.honorific||'sir')+'.'),tools:log,sources,model:used}}
const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}});
async function apiFetch(url,opt={}){const u=new URL(url,location.href),b=opt.body?JSON.parse(opt.body):{},M=(opt.method||'GET').toUpperCase();
  if(u.pathname.endsWith('/api/status'))return J({demo:false,model:'llm7 · fast'});
  if(u.pathname.endsWith('/api/memory')){const m=mem.get();if(M==='DELETE'){const i=u.searchParams.get('i');if(i!==null)m.facts.splice(+i,1);else m.facts=[];mem.set(m)}else if(M==='POST'&&b.text){m.facts.push({text:b.text,at:new Date().toISOString()});mem.set(m)}return J(mem.get())}
  return J({error:'not found'},404)}
if(typeof module!=='undefined')module.exports={chatStream,needsSearch,searchQuery,mem};
