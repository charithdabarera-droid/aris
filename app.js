const $=id=>document.getElementById(id);
const SV=3;let _s=JSON.parse(localStorage.aris||'{}');if((_s.v||0)<SV){delete _s.voice;_s.rate=0.95;_s.pitch=0.9;_s.engine='ai';_s.aiVoice='bm_george';_s.v=SV}
const S=Object.assign({name:'Jude',hon:'sir',perms:{web:true,memory:true,voice:true,loc:false},voice:'',rate:0.95,pitch:0.9,engine:'ai',aiVoice:'bm_george',v:SV},_s);
const save=()=>localStorage.aris=JSON.stringify(S);let msgs=JSON.parse(sessionStorage.arisChat||'[]'),loc='';
const orb=$('orb'),setState=s=>{orb.className=s;$('state').textContent={speaking:'SPEAKING',listening:'LISTENING',thinking:'PROCESSING'}[s]||'STANDBY'};
function add(role,text,extra){const d=document.createElement('div');d.className='m '+role;d.textContent=text;if(extra){const s=document.createElement('small');s.innerHTML=extra;d.appendChild(s)}$('log').appendChild(d);$('log').scrollTop=1e9}
msgs.forEach(m=>add(m.role,m.content));
apiFetch('/api/status').then(r=>r.json()).then(s=>{$('status').textContent=s.demo?'OFFLINE DEMO':'ONLINE · '+s.model;if(s.demo)$('status').classList.add('demo');if(!msgs.length)add('assistant',s.demo?'Good day, sir. I am ARIS. Note: no LLM key is configured, so I am in offline demo mode.':'Good day, sir. ARIS online. How may I help?')});
// voice out
const VOICE_PRIORITY=[/Microsoft Ryan.*Online/i,/Google UK English Male/i,/Microsoft Thomas.*Online/i,/Microsoft Oliver.*Online/i,/Microsoft Alfie.*Online/i,/Microsoft Elliot.*Online/i,/Microsoft George/i,/^Daniel/i,/Arthur/i,/Oliver/i,/Malcolm/i,/Ryan/i,/Thomas/i,/Alfie/i,/Elliot/i,/Harry/i,/Jamie/i,/Noah/i];
const FEMALE=/female|woman|susan|hazel|libby|sonia|serena|kate|martha|emily|mia|maisie|amy|stephanie|bella|abbi|hollie|olivia|ava|samantha|karen|moira|tessa|fiona|victoria|zira|aria|jenny|catherine|natasha|isla/i;
let voices=[];function bestMale(){const gb=voices.filter(v=>/en[-_]GB/i.test(v.lang));for(const re of VOICE_PRIORITY){const v=voices.find(v=>re.test(v.name)&&/^en/i.test(v.lang));if(v)return v}
  return gb.find(v=>/male/i.test(v.name)&&!/female/i.test(v.name))||gb.find(v=>!FEMALE.test(v.name))||voices.find(v=>/^en/i.test(v.lang)&&/male/i.test(v.name)&&!/female/i.test(v.name))||gb[0]||null}
function loadVoices(){voices=speechSynthesis.getVoices();if(!voices.length)return;if(!S.voice||!voices.some(v=>v.name===S.voice)){const b=bestMale();if(b){S.voice=b.name;save()}}
  $('voice').innerHTML=voices.filter(v=>/^en/i.test(v.lang)).map(v=>`<option value="${v.name}" ${v.name===S.voice?'selected':''}>${v.name} (${v.lang})</option>`).join('')}
if('speechSynthesis'in window){loadVoices();speechSynthesis.onvoiceschanged=loadVoices}
let spQ=0;function mkUtt(t){const u=new SpeechSynthesisUtterance(t.replace(/https?:\S+/g,'').replace(/[*_#`]/g,''));u.voice=voices.find(v=>v.name===S.voice)||null;u.lang=u.voice?.lang||'en-GB';u.rate=+S.rate||0.95;u.pitch=+S.pitch||0.9;
  u.onstart=()=>setState('speaking');u.onend=u.onerror=()=>{if(--spQ<=0){spQ=0;if(!V.playing)setState('')}};return u}
function canSpeak(){return S.perms.voice&&('speechSynthesis'in window||V.ok)}
function browserSay(t){if(!('speechSynthesis'in window)||!t.trim())return;spQ++;speechSynthesis.speak(mkUtt(t))}
// ---- Natural AI voice (Kokoro in a worker) with browser-voice fallback ----
const AI_VOICES={bm_george:'George — British male, deep & calm',bm_lewis:'Lewis — British male, warm',bm_daniel:'Daniel — British male, crisp',bm_fable:'Fable — British male, storyteller',am_onyx:'Onyx — American male, deep',am_michael:'Michael — American male',am_adam:'Adam — American male'};
const V={w:null,ok:false,state:'off',rid:0,items:[],playing:false,ctx:null,src:null,fallback:false,
  init(){if(this.w||S.engine!=='ai')return;try{this.w=new Worker('tts-worker.js',{type:'module'});this.state='loading';uiVoice();
    this.w.onmessage=e=>{const m=e.data;if(m.type==='progress'){this.state='loading '+m.pct+'%';uiVoice()}
      if(m.type==='ready'){this.device=m.device;this.state='warming up ('+m.device+')…';uiVoice();this.warm=performance.now();this.w.postMessage({type:'speak',rid:-1,seq:0,text:'Good day, sir, at your service.',voice:S.aiVoice})}
      if(m.rid===-1){if(m.type==='audio'){this.rtf=m.ms/1000/(m.audio.length/m.sr);this.ok=this.rtf<1.1;this.state=(this.ok?'ready':'too slow on this device — using browser voice')+` (${this.device}, ${this.rtf.toFixed(2)}× real-time)`}else this.state='failed';uiVoice();return}if(m.type==='error'){this.state='failed: '+m.error.slice(0,80);uiVoice()}
      if(m.type==='audio'||m.type==='fail'){const it=this.items.find(i=>i.rid===m.rid&&i.seq===m.seq);if(it){it.done=true;it.audio=m.audio;it.sr=m.sr;it.ms=m.ms;if(m.type==='fail')it.failed=true;this.pump()}}};
    this.w.postMessage({type:'load'})}catch(e){this.state='unsupported';uiVoice()}},
  unlock(){try{this.ctx=this.ctx||new (window.AudioContext||window.webkitAudioContext)();if(this.ctx.state==='suspended')this.ctx.resume()}catch{}},
  begin(){this.stop();this.rid++;this.fallback=!(S.engine==='ai'&&this.ok);this.seq=0;this.t0=performance.now()},
  push(text){text=text.replace(/https?:\S+/g,'').replace(/[*_#`\[\]]/g,'').trim();if(!text||!S.perms.voice)return;
    if(this.fallback)return browserSay(text);const it={rid:this.rid,seq:this.seq++,text,t:performance.now()};this.items.push(it);
    this.w.postMessage({type:'speak',rid:it.rid,seq:it.seq,text,voice:S.aiVoice,speed:Math.max(.8,Math.min(1.2,+S.rate+0.05))});
    if(it.seq===0)setTimeout(()=>{if(it.rid===this.rid&&!it.done&&!this.playing)this.toBrowser('slow')},3000);this.pump()},
  toBrowser(why){console.warn('AI voice fallback:',why);this.fallback=true;const rest=this.items.filter(i=>i.rid===this.rid&&!i.played);this.items=[];this.w?.postMessage({type:'cancel',rid:this.rid+1});rest.forEach(i=>browserSay(i.text))},
  pump(){if(this.playing||this.fallback)return;const it=this.items[0];if(!it||!it.done)return;this.items.shift();it.played=true;
    if(it.failed||!it.audio){return this.toBrowser('synth failed')}
    this.unlock();const c=this.ctx,b=c.createBuffer(1,it.audio.length,it.sr);b.copyToChannel(it.audio,0);const s=c.createBufferSource();s.buffer=b;s.connect(c.destination);
    this.playing=true;this.src=s;setState('speaking');s.onended=()=>{this.playing=false;this.src=null;if(!this.items.length&&!spQ)setState('');this.pump()};s.start()},
  stop(){this.items=[];try{this.src&&this.src.stop()}catch{}this.playing=false;this.src=null;if(this.w)this.w.postMessage({type:'cancel',rid:this.rid+1});if('speechSynthesis'in window)speechSynthesis.cancel();spQ=0}};
function speak(t){if(!S.perms.voice)return setState('');V.begin();(t.match(/[^.!?…]+[.!?…]*/g)||[t]).forEach(x=>V.push(x))}
function uiVoice(){const e=$('aiStatus');if(e)e.textContent='AI voice: '+(S.engine==='ai'?V.state:'off (using browser voice)')}
// chat
async function sendMsg(text){text=text.trim();if(!text)return;$('inp').value='';add('user',text);msgs.push({role:'user',content:text});setState('thinking');
  V.unlock();V.begin();
  const d=document.createElement('div');d.className='m assistant';d.textContent='…';$('log').appendChild(d);$('log').scrollTop=1e9;let spoken=0,t0=performance.now(),ft=0;
  const flush=(full,final)=>{if(!S.perms.voice)return;for(;;){const rest=full.slice(spoken);const m=final?[rest]:rest.match(/^[\s\S]*?[.!?…](?=\s)/);if(!m||!m[0].trim()){if(final)spoken=full.length;return}V.push(m[0]);spoken+=m[0].length;if(final)return}};
  try{const j=await chatStream({messages:msgs.slice(-12),name:S.name,honorific:S.hon,perms:S.perms,location:S.perms.loc?loc:''},{
      onStatus:s=>{d.textContent=s==='searching'?'Searching…':'…'},
      onTok:(_,full)=>{if(!ft)ft=performance.now()-t0;d.textContent=full;$('log').scrollTop=1e9;flush(full,false)}});
    d.textContent=j.reply;flush(j.reply,true);if(!S.perms.voice||(!V.playing&&!V.items.length&&!spQ))setState('');
    msgs.push({role:'assistant',content:j.reply});sessionStorage.arisChat=JSON.stringify(msgs.slice(-40));
    const ex=[(j.tools||[]).length?'⚙ '+j.tools.map(t=>t.split(':')[0]).join(', '):'',(j.sources||[]).filter(s=>s.url).map(s=>`<a href="${s.url}" target="_blank" rel="noopener">${new URL(s.url).hostname}</a>`).join(' '),`${(ft/1000).toFixed(1)}s · ${j.model}`].filter(Boolean).join(' · ');
    const s=document.createElement('small');s.innerHTML=ex;d.appendChild(s);if((j.tools||[]).some(t=>t.startsWith('remember')))loadMem()}
  catch(e){d.textContent='My apologies, '+S.hon+' — '+e.message;msgs.pop();setState('')}}
$('send').onclick=()=>sendMsg($('inp').value);$('inp').onkeydown=e=>{if(e.key==='Enter')sendMsg($('inp').value)};
// voice in
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;let rec,listening=false;
$('mic').onclick=()=>{if(!SR)return add('assistant','Speech recognition is not supported in this browser, sir. Chrome or Edge will oblige.');
  if(listening)return rec.stop();V.unlock();V.stop();rec=new SR();rec.lang='en-GB';rec.interimResults=true;
  rec.onstart=()=>{listening=true;$('mic').classList.add('on');setState('listening')};
  rec.onresult=e=>{const t=[...e.results].map(r=>r[0].transcript).join('');$('inp').value=t;if(e.results[e.results.length-1].isFinal){rec.stop();sendMsg(t)}};
  rec.onend=()=>{listening=false;$('mic').classList.remove('on');if(orb.className==='listening')setState('')};rec.onerror=e=>add('assistant','Microphone error: '+e.error);rec.start()};
// settings
function getLoc(){if(!S.perms.loc)return loc='';navigator.geolocation?.getCurrentPosition(p=>loc=`lat ${p.coords.latitude.toFixed(3)}, lon ${p.coords.longitude.toFixed(3)}`,()=>{loc='';add('assistant','Location permission was declined, sir.')})}
async function loadMem(){const m=await (await apiFetch('/api/memory')).json();$('mem').innerHTML='';m.facts.forEach((f,i)=>{const li=document.createElement('li');li.textContent=f.text;const b=document.createElement('button');b.textContent='×';b.onclick=async()=>{await apiFetch('/api/memory?i='+i,{method:'DELETE'});loadMem()};li.appendChild(b);$('mem').appendChild(li)});if(!m.facts.length)$('mem').innerHTML='<li><i>Nothing stored yet.</i></li>'}
$('setBtn').onclick=()=>{$('panel').hidden=false;loadMem()};$('close').onclick=()=>$('panel').hidden=true;
$('name').value=S.name;$('hon').value=S.hon;$('name').oninput=e=>{S.name=e.target.value;save()};$('hon').oninput=e=>{S.hon=e.target.value;save()};
['web','memory','voice','loc'].forEach(k=>{const c=$('p_'+k);c.checked=S.perms[k];c.onchange=()=>{S.perms[k]=c.checked;save();if(k==='loc')getLoc()}});
$('voice').onchange=e=>{S.voice=e.target.value;save();const o=S.engine;S.engine='browser';speak('Very good, '+S.hon+'. This is my browser voice.');S.engine=o};
$('engine').value=S.engine;$('engine').onchange=e=>{S.engine=e.target.value;save();V.init();uiVoice()};
$('aiVoice').innerHTML=Object.entries(AI_VOICES).map(([k,v])=>`<option value="${k}" ${k===S.aiVoice?'selected':''}>${v}</option>`).join('');
$('aiVoice').onchange=e=>{S.aiVoice=e.target.value;save();V.unlock();speak('Good day, '+S.hon+'. How does this voice suit you?')};
$('testVoice').onclick=()=>{V.unlock();speak('Good evening, '+S.hon+'. ARIS at your service. Shall I check the forecast?')};
$('rate').value=S.rate;$('pitch').value=S.pitch;$('rate').oninput=e=>{S.rate=+e.target.value;save()};$('pitch').oninput=e=>{S.pitch=+e.target.value;save()};
$('rate').onchange=$('pitch').onchange=()=>speak('How does this sound, '+S.hon+'?');
$('resetVoice').onclick=()=>{S.engine='ai';S.aiVoice='bm_george';$('engine').value='ai';$('aiVoice').value='bm_george';V.init();S.voice='';S.rate=0.95;S.pitch=0.9;save();loadVoices();$('rate').value=S.rate;$('pitch').value=S.pitch;speak('Default voice restored, '+S.hon+'.')};
$('addMem').onclick=async()=>{const t=$('newMem').value.trim();if(!t)return;await apiFetch('/api/memory',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:t})});$('newMem').value='';loadMem()};
$('clrMem').onclick=async()=>{if(confirm('Erase all memory?')){await apiFetch('/api/memory',{method:'DELETE'});loadMem()}};
getLoc();save();setTimeout(()=>V.init(),800);uiVoice();if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').then(()=>{if(!crossOriginIsolated&&!sessionStorage.coiReload&&navigator.serviceWorker.controller==null){sessionStorage.coiReload=1;location.reload()}});
navigator.serviceWorker?.addEventListener('controllerchange',()=>{if(!crossOriginIsolated&&!sessionStorage.coiReload){sessionStorage.coiReload=1;location.reload()}});
