import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
export async function readAssistantConfig(){
 if(process.env.SUPABASE_URL&&process.env.SUPABASE_PUBLISHABLE_KEY)return {url:process.env.SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY};
 const source=await readFile(join(process.cwd(),'config.js'),'utf8');
 return {url:/supabaseUrl:\s*"([^"]+)"/.exec(source)?.[1],key:/supabasePublishableKey:\s*"([^"]+)"/.exec(source)?.[1]};
}
