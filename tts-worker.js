// Natural neural TTS (Kokoro-82M) running locally in the browser. Model (~90MB) is downloaded once from Hugging Face and cached.
import {KokoroTTS} from 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js';
let tts=null,loading=null,queue=Promise.resolve();
async function load(){if(tts)return tts;if(loading)return loading;
  const gpu=!!(self.navigator&&navigator.gpu&&await navigator.gpu.requestAdapter().catch(()=>null));
  loading=KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',{dtype:gpu?'fp32':'q8',device:gpu?'webgpu':'wasm',
    progress_callback:p=>{if(p.status==='progress'&&p.file&&/onnx/.test(p.file))postMessage({type:'progress',pct:Math.round(p.progress||0)})}})
    .then(t=>{tts=t;postMessage({type:'ready',device:gpu?'webgpu':'wasm'});return t}).catch(e=>{loading=null;postMessage({type:'error',error:String(e&&e.message||e)});throw e});
  return loading}
onmessage=e=>{const m=e.data;
  if(m.type==='load')load().catch(()=>{});
  if(m.type==='speak')queue=queue.then(async()=>{if(m.rid>=0&&m.rid<self.minRid)return;try{const t=await load();const t0=performance.now();const a=await t.generate(m.text,{voice:m.voice||'bm_george',speed:m.speed||1});
      postMessage({type:'audio',rid:m.rid,seq:m.seq,audio:a.audio,sr:a.sampling_rate,ms:Math.round(performance.now()-t0)},[a.audio.buffer])}catch(err){postMessage({type:'fail',rid:m.rid,seq:m.seq,error:String(err)})}});
  if(m.type==='cancel')self.minRid=m.rid};
self.minRid=0;
