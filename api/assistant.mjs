import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createAssistantService} from '../server/assistant-core.mjs';

const service=createAssistantService({getConfig:async()=>{
 if(process.env.SUPABASE_URL&&process.env.SUPABASE_PUBLISHABLE_KEY)return {url:process.env.SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY};
 const source=await readFile(join(process.cwd(),'config.js'),'utf8');
 return {url:/supabaseUrl:\s*"([^"]+)"/.exec(source)?.[1],key:/supabasePublishableKey:\s*"([^"]+)"/.exec(source)?.[1]};
}});
export default async function handler(req,res){
 let result;
 if(req.method==='POST'&&(!String(req.headers['content-type']||'').startsWith('application/json')||Number(req.headers['content-length']||0)>16000))result={status:400,headers:{'Cache-Control':'no-store','Content-Type':'application/json'},body:{code:'invalid_question',message:'Send a short JSON question.'}};
 else try{const body=typeof req.body==='string'?JSON.parse(req.body):req.body;result=await service({method:req.method,authorization:req.headers.authorization,body});}catch{result={status:500,headers:{'Cache-Control':'no-store','Content-Type':'application/json'},body:{code:'assistant_error',message:'The assistant could not respond. Please retry.'}};}
 for(const [name,value] of Object.entries(result.headers))res.setHeader(name,value);
 res.statusCode=result.status;res.end(JSON.stringify(result.body));
}
