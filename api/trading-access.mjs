import {createTradingAccessService} from '../server/trading-access-core.mjs';
import {readAssistantConfig} from '../server/assistant-config.mjs';
const service=createTradingAccessService({getConfig:readAssistantConfig});
export default async function handler(req,res){
 let result;try{result=await service({method:req.method,authorization:req.headers.authorization});}
 catch{result={status:503,headers:{'Cache-Control':'no-store','Content-Type':'application/json'},body:{allowed:false,message:'Trading access could not be confirmed. Please retry.'}};}
 for(const [name,value] of Object.entries(result.headers))res.setHeader(name,value);
 res.statusCode=result.status;res.end(JSON.stringify(result.body));
}
