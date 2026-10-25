import {readAssistantConfig} from '../server/assistant-config.mjs';
import {createTranscriptionService,MAX_AUDIO_BYTES} from '../server/transcription-core.mjs';
const service=createTranscriptionService({getConfig:readAssistantConfig});
export default async function handler(req,res){
 let response;
 try{
  if(Number(req.headers['content-length']||0)>MAX_AUDIO_BYTES)throw Object.assign(new Error('Too large'),{tooLarge:true});
  let audio;
  if(req.body instanceof Uint8Array)audio=req.body;
  else if(req.body===undefined){const parts=[];let size=0;for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>MAX_AUDIO_BYTES)throw Object.assign(new Error('Too large'),{tooLarge:true});parts.push(bytes);}audio=Buffer.concat(parts);}
  response=await service({method:req.method,authorization:req.headers.authorization,audio,type:req.headers['x-audio-type']||req.headers['content-type']});
 }catch(error){response={status:error.tooLarge?413:500,headers:{'Cache-Control':'no-store','Content-Type':'application/json'},body:{code:error.tooLarge?'voice_too_large':'voice_unavailable',message:error.tooLarge?'Please record a shorter question under 2 MB.':'Voice transcription could not respond. Please record again.'}};}
 for(const [name,value] of Object.entries(response.headers))res.setHeader(name,value);res.statusCode=response.status;res.end(JSON.stringify(response.body));
}
