const $=id=>document.getElementById(id);
const S=Object.assign({name:'Jude',hon:'sir',perms:{web:true,memory:true,voice:true,loc:false},voice:''},JSON.parse(localStorage.aris||'{}'));
const save=()=>localStorage.aris=JSON.stringify(S);let msgs=JSON.parse(sessionStorage.arisChat||'[]'),loc='';
const orb=$('orb'),setState=s=>{orb.className=s;$('state').textContent={speaking:'SPEAKING',listening:'LISTENING',thinking:'PROCESSING'}[s]||'STANDBY'};
function add(role,text,extra){const d=document.createElement('div');d.className='m '+role;d.textContent=text;if(extra){const s=document.createElement('small');s.innerHTML=extra;d.appendChild(s)}$('log').appendChild(d);$('log').scrollTop=1e9}
msgs.forEach(m=>add(m.role,m.content));
apiFetch('/api/status').then(r=>r.json()).then(s=>{$('status').textContent=s.demo?'OFFLINE DEMO':'ONLINE · '+s.model;if(s.demo)$('status').classList.add('demo');if(!msgs.length)add('assistant',s.demo?'Good day, sir. I am ARIS. Note: no LLM key is configured, so I am in offline demo mode.':'Good day, sir. ARIS online. How may I help?')});
// voice out
let voices=[];function loadVoices(){voices=speechSynthesis.getVoices();const pick=voices.find(v=>/en-GB/i.test(v.lang)&&/male|daniel|george|arthur|ryan|oliver/i.test(v.name))||voices.find(v=>/en-GB/i.test(v.lang));if(!S.voice&&pick)S.voice=pick.name;$('voice').innerHTML=voices.filter(v=>/^en/i.test(v.lang)).map(v=>`<option ${v.name===S.voice?'selected':''}>${v.name}</option>`).join('')}
if('speechSynthesis'in window){loadVoices();speechSynthesis.onvoiceschanged=loadVoices}
function speak(t){if(!S.perms.voice||!('speechSynthesis'in window))return setState('');speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t.replace(/https?:\S+/g,''));u.voice=voices.find(v=>v.name===S.voice)||null;u.lang='en-GB';u.rate=1;u.pitch=.9;u.onstart=()=>setState('speaking');u.onend=u.onerror=()=>setState('');speechSynthesis.speak(u)}
// chat
async function sendMsg(text){text=text.trim();if(!text)return;$('inp').value='';add('user',text);msgs.push({role:'user',content:text});setState('thinking');
  try{const r=await apiFetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:msgs,name:S.name,honorific:S.hon,perms:S.perms,location:S.perms.loc?loc:''})});const j=await r.json();if(j.error)throw new Error(j.error);
    msgs.push({role:'assistant',content:j.reply});sessionStorage.arisChat=JSON.stringify(msgs.slice(-40));
    const ex=[(j.tools||[]).length?'⚙ '+j.tools.map(t=>t.split(':')[0]).join(', '):'',(j.sources||[]).map(s=>`<a href="${s.url}" target="_blank" rel="noopener">${new URL(s.url).hostname}</a>`).join(' ')].filter(Boolean).join(' · ');
    add('assistant',j.reply,ex);speak(j.reply);if((j.tools||[]).some(t=>t.startsWith('remember')))loadMem()}
  catch(e){add('assistant','My apologies, sir — an error: '+e.message);setState('')}}
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
$('voice').onchange=e=>{S.voice=e.target.value;save();speak('Voice selected, '+S.hon+'.')};
$('addMem').onclick=async()=>{const t=$('newMem').value.trim();if(!t)return;await apiFetch('/api/memory',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:t})});$('newMem').value='';loadMem()};
$('clrMem').onclick=async()=>{if(confirm('Erase all memory?')){await apiFetch('/api/memory',{method:'DELETE'});loadMem()}};
getLoc();save();if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
