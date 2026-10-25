/* Shared membership gate for paid assistant endpoints; always use the caller JWT. */
const denied=(status,code,message)=>({response:{status,headers:{'Cache-Control':'no-store, max-age=0','Content-Type':'application/json'},body:{code,message}}});
export async function authenticateMember({authorization,getConfig,fetchImpl=globalThis.fetch}){
 const match=/^Bearer ([A-Za-z0-9._~-]{16,8192})$/.exec(authorization||'');
 if(!match)return denied(401,'sign_in_required','Sign in to Quest before using the assistant.');
 let config;try{config=await getConfig();if(!/^https:\/\/[^/]+\.supabase\.co$/.test(config.url)||!config.key)throw new Error('Invalid config');}catch{return denied(503,'workspace_unavailable','The assistant’s workspace connection needs owner setup.');}
 const headers={apikey:config.key,Authorization:'Bearer '+match[1],'Content-Type':'application/json'};
 async function getJson(path,options={}){const response=await fetchImpl(config.url+path,{...options,headers,cache:'no-store',signal:AbortSignal.timeout(6500)});if(!response.ok){const error=new Error('Unavailable');error.status=response.status;throw error;}return response.json();}
 let user,profile,policy;
 try{user=await getJson('/auth/v1/user');if(!/^[a-f0-9-]{36}$/i.test(user.id||''))throw new Error('Invalid user');}catch(error){return [400,401,403].includes(error.status)?denied(401,'sign_in_required','Refresh your sign-in, then try again.'):denied(503,'workspace_unavailable','Q could not reach your sign-in service. Please retry.');}
 try{const results=await Promise.allSettled(['my_team_profile','my_dashboard_access'].map(name=>getJson('/rest/v1/rpc/'+name,{method:'POST',body:'{}'})));if(results.some(result=>result.status!=='fulfilled'))throw new Error('Membership unavailable');profile=results[0].value;policy=results[1].value;}catch{return denied(503,'membership_unavailable','Team membership could not be checked. Refresh Quest and retry.');}
 if(profile?.user_id!==user.id||policy?.ready!==true)return denied(403,'membership_required','Your account needs active team membership to use the assistant.');
 return {user,profile,policy,config,headers};
}
