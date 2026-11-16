import {createResearchService} from '../server/research-core.mjs';
import {readAssistantConfig} from '../server/assistant-config.mjs';
const service=createResearchService({getConfig:readAssistantConfig});
export default async function handler(req,res){
 let result;
 try{
  if(req.method==='POST'&&(!String(req.headers['content-type']||'').startsWith('application/json')||Number(req.headers['content-length']||0)>48000))throw Error('Invalid input');
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(body&&JSON.stringify(body).length>48000)throw Error('Invalid input');
  result=await service({method:req.method,authorization:req.headers.authorization,body,query:req.query||{}});
 }catch{result={status:400,headers:{'Cache-Control':'no-store, max-age=0','Content-Type':'application/json'},body:{code:'invalid_request',message:'Send a short JSON research request.'}};}
 for(const [name,value] of Object.entries(result.headers))res.setHeader(name,value);
 res.statusCode=result.status;res.end(JSON.stringify(result.body));
}
