import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function prepareWorkflowSetup(destination=null){
  const prerequisites=['project-workspaces.sql','fragile-studio.sql','notifications.sql','member-access.sql','private-chats.sql','migrations/20261021_daily_workflow.sql'];
  let sql=`-- Copy this entire file into the Quest project's Supabase SQL Editor and Run.\n-- Preserves team members, project assignments and existing content.\nrollback;\nreset role;\nbegin;\n`;
  for(const name of prerequisites){const source=await readFile(path.join(root,'supabase',name),'utf8');sql+=`\n-- ${name}\n`+source.replace(/^(?:begin;|commit;)\s*$/gm,'')+'\n';}
  sql+=`\ncommit;\nselect 'Quest daily workflow ready' as result,version from public.quest_schema_migrations where version='20261021_daily_workflow';\n`;
  if(destination){await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,sql);}
  return sql;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const destination=process.argv[2]||'/workspace/outputs/quest-daily-workflow-setup.sql';
  await prepareWorkflowSetup(destination);console.log(`Prepared ${destination}`);
}
