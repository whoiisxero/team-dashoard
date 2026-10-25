import {createAssistantService} from '../server/assistant-core.mjs';
import {readAssistantConfig} from '../server/assistant-config.mjs';
const service=createAssistantService({getConfig:readAssistantConfig});
export default async function handler(req,res){
 let result;
 if(req.method==='POST'&&(!String(req.headers['content-type']||'').startsWith('application/json')||Number(req.headers['content-length']||0)>16000))result={status:400,headers:{'Cache-Control':'no-store','Content-Type':'application/json'},body:{code:'invalid_question',message:'Send a short JSON question.'}};
 else try{const body=typeof req.body==='string'?JSON.parse(req.body):req.body;result=await service({method:req.method,authorization:req.headers.authorization,body});}catch{result={status:500,headers:{'Cache-Control':'no-store','Content-Type':'application/json'},body:{code:'assistant_error',message:'The assistant could not respond. Please retry.'}};}
 for(const [name,value] of Object.entries(result.headers))res.setHeader(name,value);
 res.statusCode=result.status;res.end(JSON.stringify(result.body));
}
