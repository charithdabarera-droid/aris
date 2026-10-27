const $=id=>document.getElementById(id);
const SV=2;let _s=JSON.parse(localStorage.aris||'{}');if((_s.v||0)<SV){delete _s.voice;_s.rate=0.95;_s.pitch=0.9;_s.v=SV}
const S=Object.assign({name:'Jude',hon:'sir',perms:{web:true,memory:true,voice:true,loc:false},voice:'',rate:0.95,pitch:0.9,v:SV},_s);
const save=()=>localStorage.aris=JSON.stringify(S);let msgs=JSON.parse(sessionStorage.arisChat||'[]'),loc='';
const orb=$('orb'),setState=s=>{orb.className=s;$('state').textContent={speaking:'SPEAKING',listening:'LISTENING',thinking:'PROCESSING'}[s]||'STANDBY'};
function add(role,text,extra){const d=document.createElement('div');d.className='m '+role;d.textContent=text;if(extra){const s=document.createElement('small');s.innerHTML=extra;d.appendChild(s)}$('log').appendChild(d);$('log').scrollTop=1e9}
msgs.forEach(m=>add(m.role,m.content));
apiFetch('/api/status').then(r=>r.json()).then(s=>{$('status').textContent=s.demo?'OFFLINE DEMO':'ONLINE · '+s.model;if(s.demo)$('status').classList.add('demo');if(!msgs.length)add('assistant',s.demo?'Good day, sir. I am ARIS. Note: no LLM key is configured, so I am in offline demo mode.':'Good day, sir. ARIS online. How may I help?')});
// voice out
const VOICE_PRIORITY=[/Google UK English Male/i,/Microsoft Ryan.*Online/i,/Microsoft Thomas.*Online/i,/Microsoft Oliver.*Online/i,/Microsoft Alfie.*Online/i,/Microsoft Elliot.*Online/i,/Microsoft George/i,/^Daniel/i,/Arthur/i,/Oliver/i,/Malcolm/i,/Ryan/i,/Thomas/i,/Alfie/i,/Elliot/i,/Harry/i,/Jamie/i,/Noah/i];
const FEMALE=/female|woman|susan|hazel|libby|sonia|serena|kate|martha|emily|mia|maisie|amy|stephanie|bella|abbi|hollie|olivia|ava|samantha|karen|moira|tessa|fiona|victoria|zira|aria|jenny|catherine|natasha|isla/i;
let voices=[];function bestMale(){const gb=voices.filter(v=>/en[-_]GB/i.test(v.lang));for(const re of VOICE_PRIORITY){const v=voices.find(v=>re.test(v.name)&&/^en/i.test(v.lang));if(v)return v}
  return gb.find(v=>/male/i.test(v.name)&&!/female/i.test(v.name))||gb.find(v=>!FEMALE.test(v.name))||voices.find(v=>/^en/i.test(v.lang)&&/male/i.test(v.name)&&!/female/i.test(v.name))||gb[0]||null}
function loadVoices(){voices=speechSynthesis.getVoices();if(!voices.length)return;if(!S.voice||!voices.some(v=>v.name===S.voice)){const b=bestMale();if(b){S.voice=b.name;save()}}
  $('voice').innerHTML=voices.filter(v=>/^en/i.test(v.lang)).map(v=>`<option value="${v.name}" ${v.name===S.voice?'selected':''}>${v.name} (${v.lang})</option>`).join('')}
if('speechSynthesis'in window){loadVoices();speechSynthesis.onvoiceschanged=loadVoices}
let spQ=0;function mkUtt(t){const u=new SpeechSynthesisUtterance(t.replace(/https?:\S+/g,'').replace(/[*_#`]/g,''));u.voice=voices.find(v=>v.name===S.voice)||null;u.lang=u.voice?.lang||'en-GB';u.rate=+S.rate||0.95;u.pitch=+S.pitch||0.9;
  u.onstart=()=>setState('speaking');u.onend=u.onerror=()=>{if(--spQ<=0){spQ=0;setState('')}};return u}
function canSpeak(){return S.perms.voice&&'speechSynthesis'in window}
function speakChunk(t){if(!canSpeak()||!t.trim())return;spQ++;speechSynthesis.speak(mkUtt(t))}
function speak(t){if(!canSpeak())return setState('');speechSynthesis.cancel();spQ=0;speakChunk(t)}
// chat
async function sendMsg(text){text=text.trim();if(!text)return;$('inp').value='';add('user',text);msgs.push({role:'user',content:text});setState('thinking');
  if(canSpeak()){speechSynthesis.cancel();spQ=0}
  const d=document.createElement('div');d.className='m assistant';d.textContent='…';$('log').appendChild(d);$('log').scrollTop=1e9;let spoken=0,t0=performance.now(),ft=0;
  const flush=(full,final)=>{if(!canSpeak())return;const rest=full.slice(spoken);const m=final?[rest]:rest.match(/^[\s\S]*?[.!?…](?=\s)/);if(m&&m[0].trim()){speakChunk(m[0]);spoken+=m[0].length}};
  try{const j=await chatStream({messages:msgs.slice(-12),name:S.name,honorific:S.hon,perms:S.perms,location:S.perms.loc?loc:''},{
      onStatus:s=>{d.textContent=s==='searching'?'Searching…':'…'},
      onTok:(_,full)=>{if(!ft)ft=performance.now()-t0;d.textContent=full;$('log').scrollTop=1e9;flush(full,false)}});
    d.textContent=j.reply;flush(j.reply,true);if(!canSpeak())setState('');
    msgs.push({role:'assistant',content:j.reply});sessionStorage.arisChat=JSON.stringify(msgs.slice(-40));
    const ex=[(j.tools||[]).length?'⚙ '+j.tools.map(t=>t.split(':')[0]).join(', '):'',(j.sources||[]).filter(s=>s.url).map(s=>`<a href="${s.url}" target="_blank" rel="noopener">${new URL(s.url).hostname}</a>`).join(' '),`${(ft/1000).toFixed(1)}s · ${j.model}`].filter(Boolean).join(' · ');
    const s=document.createElement('small');s.innerHTML=ex;d.appendChild(s);if((j.tools||[]).some(t=>t.startsWith('remember')))loadMem()}
  catch(e){d.textContent='My apologies, '+S.hon+' — '+e.message;msgs.pop();setState('')}}
$('send').onclick=()=>sendMsg($('inp').value);$('inp').onkeydown=e=>{if(e.key==='Enter')sendMsg($('inp').value)};
// voice in
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;let rec,listening=false;
$('mic').onclick=()=>{if(!SR)return add('assistant','Speech recognition is not supported in this browser, sir. Chrome or Edge will oblige.');
  if(listening)return rec.stop();speechSynthesis.cancel();rec=new SR();rec.lang='en-GB';rec.interimResults=true;
  rec.onstart=()=>{listening=true;$('mic').classList.add('on');setState('listening')};
  rec.onresult=e=>{const t=[...e.results].map(r=>r[0].transcript).join('');$('inp').value=t;if(e.results[e.results.length-1].isFinal){rec.stop();sendMsg(t)}};
  rec.onend=()=>{listening=false;$('mic').classList.remove('on');if(orb.className==='listening')setState('')};rec.onerror=e=>add('assistant','Microphone error: '+e.error);rec.start()};
// settings
function getLoc(){if(!S.perms.loc)return loc='';navigator.geolocation?.getCurrentPosition(p=>loc=`lat ${p.coords.latitude.toFixed(3)}, lon ${p.coords.longitude.toFixed(3)}`,()=>{loc='';add('assistant','Location permission was declined, sir.')})}
async function loadMem(){const m=await (await apiFetch('/api/memory')).json();$('mem').innerHTML='';m.facts.forEach((f,i)=>{const li=document.createElement('li');li.textContent=f.text;const b=document.createElement('button');b.textContent='×';b.onclick=async()=>{await apiFetch('/api/memory?i='+i,{method:'DELETE'});loadMem()};li.appendChild(b);$('mem').appendChild(li)});if(!m.facts.length)$('mem').innerHTML='<li><i>Nothing stored yet.</i></li>'}
$('setBtn').onclick=()=>{$('panel').hidden=false;loadMem()};$('close').onclick=()=>$('panel').hidden=true;
$('name').value=S.name;$('hon').value=S.hon;$('name').oninput=e=>{S.name=e.target.value;save()};$('hon').oninput=e=>{S.hon=e.target.value;save()};
['web','memory','voice','loc'].forEach(k=>{const c=$('p_'+k);c.checked=S.perms[k];c.onchange=()=>{S.perms[k]=c.checked;save();if(k==='loc')getLoc()}});
$('voice').onchange=e=>{S.voice=e.target.value;save();speak('Very good, '+S.hon+'. This is my new voice.')};
$('rate').value=S.rate;$('pitch').value=S.pitch;$('rate').oninput=e=>{S.rate=+e.target.value;save()};$('pitch').oninput=e=>{S.pitch=+e.target.value;save()};
$('rate').onchange=$('pitch').onchange=()=>speak('How does this sound, '+S.hon+'?');
$('resetVoice').onclick=()=>{S.voice='';S.rate=0.95;S.pitch=0.9;save();loadVoices();$('rate').value=S.rate;$('pitch').value=S.pitch;speak('Default voice restored, '+S.hon+'.')};
$('addMem').onclick=async()=>{const t=$('newMem').value.trim();if(!t)return;await apiFetch('/api/memory',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:t})});$('newMem').value='';loadMem()};
$('clrMem').onclick=async()=>{if(confirm('Erase all memory?')){await apiFetch('/api/memory',{method:'DELETE'});loadMem()}};
getLoc();save();if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
