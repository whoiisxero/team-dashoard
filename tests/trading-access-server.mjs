import assert from 'node:assert/strict';
import {canUseTradingLab} from '../server/trading-members.mjs';
import {createTradingAccessService} from '../server/trading-access-core.mjs';

const uid='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const token='current-member-test-token',url='https://quest-test.supabase.co';
const calls=[];
let user={id:uid},profile={user_id:uid,display_name:'Tertius'},policy={ready:true,is_admin:false};
const allowed=()=>canUseTradingLab({user,profile,policy});
assert(allowed());profile.display_name='  JOSH ';assert(allowed());
for(const name of ['Richard','Cas','Josh guest','Tertius copy','']){profile.display_name=name;assert(!allowed(),name);}
profile.display_name='Josh';
for(const restriction of [{ready:false},{personal_only:true},{studio_only_project_id:other},{private_fragile_owner_id:other}]){
 policy={ready:true,...restriction};assert(!allowed(),JSON.stringify(restriction));
}
policy={ready:true,is_admin:true};profile.display_name='Quan';assert(allowed());
profile.user_id=other;assert(!allowed());profile.user_id=uid;
policy={ready:true,is_admin:false};profile.display_name='Tertius';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status});
let fail=false;
const service=createTradingAccessService({getConfig:async()=>({url,key:'public-test-key'}),fetchImpl:async(address,options)=>{
 calls.push({address,options});assert(address.startsWith(url+'/'));
 assert.equal(options.headers.Authorization,'Bearer '+token);assert.equal(options.headers.apikey,'public-test-key');assert.equal(options.cache,'no-store');
 assert.equal(options.method||'GET',address.endsWith('/user')?'GET':'POST');
 if(fail)return json({message:'Sign-in expired'},401);
 if(address===url+'/auth/v1/user')return json(user);
 if(address===url+'/rest/v1/rpc/my_team_profile')return json(profile);
 if(address===url+'/rest/v1/rpc/my_dashboard_access')return json(policy);
 throw Error('Unexpected read or mutation: '+address);
}});
const invoke=()=>service({method:'GET',authorization:'Bearer '+token});
let result=await service({method:'GET'});assert.equal(result.status,401);assert.equal(calls.length,0);
result=await service({method:'POST',authorization:'Bearer '+token});assert.equal(result.status,405);assert.equal(calls.length,0);
for(const name of ['Tertius','Josh','Richard']){
 profile.display_name=name;result=await invoke();assert.equal(result.status,200);
 assert.deepEqual(result.body,{allowed:name!=='Richard'});assert.match(result.headers['Cache-Control'],/no-store/);
 assert(!JSON.stringify(result.body).includes(name));
}
profile.display_name='Josh';policy.personal_only=true;result=await invoke();assert.deepEqual(result.body,{allowed:false});delete policy.personal_only;
profile=null;result=await invoke();assert.equal(result.status,403);
profile={user_id:other,display_name:'Josh'};result=await invoke();assert.equal(result.status,403);
profile={user_id:uid,display_name:'Josh'};fail=true;result=await invoke();assert.equal(result.status,401);
assert(calls.every(call=>call.address===url+'/auth/v1/user'||call.address.startsWith(url+'/rest/v1/rpc/my_')));
console.log('PASS trading access: owner, Tertius and Josh; current membership; restricted guest exclusion; caller JWT only; no roster, project or chat reads/writes; no-store boolean response. Supabase transport fixtures used.');
