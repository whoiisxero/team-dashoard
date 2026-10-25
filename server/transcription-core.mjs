import {authenticateMember} from './member-session.mjs';
import {providerFailure} from './assistant-core.mjs';
export const MAX_AUDIO_BYTES=2*1024*1024;
const TYPES={'audio/webm':'webm','audio/mp4':'m4a','audio/ogg':'ogg','audio/wav':'wav','audio/mpeg':'mp3'};
const result=(status,body,headers={})=>({status,body,headers:{'Cache-Control':'no-store, max-age=0','Content-Type':'application/json',...headers}});
export function createTranscriptionService({getConfig,env=process.env,fetchImpl=globalThis.fetch,now=()=>Date.now()}){
 const requests=new Map();
 return async({method,authorization,audio,type})=>{
  const started=now();
  if(method!=='POST')return result(405,{code:'method_not_allowed',message:'Use POST.'},{Allow:'POST'});
  const member=await authenticateMember({authorization,getConfig,fetchImpl});if(member.response)return member.response;
  const key=String(env.OPENAI_API_KEY||'').trim();if(!key)return result(503,{code:'assistant_not_configured',message:'Voice transcription needs the dashboard owner to connect the AI API key.'});
  const format=String(type||'').split(';')[0].trim().toLowerCase();
  if(!TYPES[format])return result(415,{code:'voice_unsupported_audio',message:'This audio format is not supported. Please record again in a current browser.'});
  if(!(audio instanceof Uint8Array)||!audio.byteLength)return result(400,{code:'voice_empty',message:'That recording was empty. Please record again.'});
  if(audio.byteLength>MAX_AUDIO_BYTES)return result(413,{code:'voice_too_large',message:'Please keep the recording under one minute and 2 MB.'});
  const clock=now(),recent=(requests.get(member.user.id)||[]).filter(time=>clock-time<60000);if(recent.length>=8)return result(429,{code:'voice_slow_down',message:'Give Q a moment before recording another question.'},{'Retry-After':'30'});
  requests.set(member.user.id,[...recent,clock]);if(requests.size>1000)for(const [id,times] of requests)if(clock-times.at(-1)>60000)requests.delete(id);
  const form=new FormData();form.append('file',new File([audio],`quest-voice.${TYPES[format]}`,{type:format}));form.append('model',String(env.OPENAI_TRANSCRIPTION_MODEL||'gpt-4o-mini-transcribe').trim()||'gpt-4o-mini-transcribe');form.append('response_format','json');
  try{
   const response=await fetchImpl('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+key},body:form,cache:'no-store',signal:AbortSignal.timeout(Math.max(1000,Math.min(18000,24000-(now()-started))))});
   let payload;try{payload=await response.json();}catch{return result(502,{code:'voice_unavailable',message:'The transcription service could not reply. Please record again.'});}
   if(!response.ok){if(response.status===400&&payload.error?.param!=='model'&&payload.error?.code!=='model_not_found')return result(400,{code:'voice_invalid_audio',message:'That recording could not be read. Please record again.'});return providerFailure(response.status,payload.error,member.policy.is_admin,response.headers?.get('x-request-id'),'voice');}
   if(typeof payload.text!=='string'||!payload.text.trim())return result(422,{code:'voice_no_speech',message:'No speech was detected. Please record again.'});
   return result(200,{text:payload.text.trim().slice(0,2000),truncated:payload.text.trim().length>2000});
  }catch(error){return result(error.name==='TimeoutError'||error.name==='AbortError'?504:502,{code:'voice_unavailable',message:'Voice transcription could not finish. Your typed question is unchanged; please record again.'});}
 };
}
