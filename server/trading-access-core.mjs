import {authenticateMember} from './member-session.mjs';
import {canUseTradingLab} from './trading-members.mjs';
export function createTradingAccessService({getConfig,fetchImpl=globalThis.fetch}){
 return async({method,authorization})=>{
  const headers={'Cache-Control':'no-store, max-age=0','Content-Type':'application/json'};
  if(method!=='GET')return {status:405,headers,body:{message:'Use GET to check trading access.'}};
  const auth=await authenticateMember({authorization,getConfig,fetchImpl});if(auth.response)return auth.response;
  return {status:200,headers,body:{allowed:canUseTradingLab(auth)}};
 };
}
