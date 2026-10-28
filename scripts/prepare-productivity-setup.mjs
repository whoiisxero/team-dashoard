import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function prepareProductivitySetup(destination=null){
 const files=['20261028_personal_workspaces.sql','20261028_personal_calendar.sql'];
 let sql=`-- Quest private workspaces and in-app reminders. Copy the ENTIRE query.\nrollback;\nreset role;\nbegin;\ndo $$ begin\n if to_regprocedure('public.can_edit_project(uuid)') is null or to_regclass('public.notification_preferences') is null then\n raise exception 'Install the daily workflow and project-editing migrations first.'; end if;\nend $$;\n`;
 for(const file of files){const source=await readFile(path.join(root,'supabase/migrations',file),'utf8');sql+='\n-- '+file+'\n'+source.replace(/^(?:begin;|commit;)\s*$/gm,'')+'\n';}
 sql+=`\ncommit;\nselect 'Quest workspace setup ready' as result;\n-- END QUEST WORKSPACE SETUP\n`;
 if(destination){await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,sql);}return sql;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 await prepareProductivitySetup(process.argv[2]||'/workspace/outputs/quest-workspace-setup.sql');console.log('Prepared the complete Quest workspace setup query.');
}
