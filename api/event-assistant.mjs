import {readAssistantConfig} from '../server/assistant-config.mjs';
import {createEventAssistantService} from '../server/event-assistant-core.mjs';
const service=createEventAssistantService({getConfig:readAssistantConfig});
export default async function handler(req,res){
 let result;
 try{
  if(!String(req.headers['content-type']||'').startsWith('application/json')||Number(req.headers['content-length']||0)>16000)result={status:400,body:{code:'event_invalid_request',message:'Send short event details as JSON.'}};
  else result=await service({method:req.method,authorization:req.headers.authorization,body:typeof req.body==='string'?JSON.parse(req.body):req.body});
 }catch{result={status:500,body:{code:'event_unavailable',message:'Q could not respond. Keep this event here and retry.'}};}
 res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('Content-Type','application/json');res.statusCode=result.status;res.end(JSON.stringify(result.body));
}
