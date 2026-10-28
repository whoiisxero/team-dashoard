import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const upgradePreflight=`
-- Stop before making changes if the earlier project-permission setup is missing.
do $quest_preflight$ declare required text; begin
  foreach required in array array['projects','tasks','calendar_events','goals','project_notes','discussion_messages','brand_messages','brand_moodboard_items','team_members','member_access','project_member_access','team_notifications'] loop
    if to_regclass('public.'||required) is null then
      raise exception 'Missing prerequisite table: public.%. Use the complete workflow setup instead.',required;
    end if;
  end loop;
  foreach required in array array['is_team_member()','access_admin()','project_access_for(uuid,uuid)','shared_access_for(uuid)','can_access_project(uuid)'] loop
    if to_regprocedure('public.'||required) is null then
      raise exception 'Missing project-permission function: public.%. Use the complete workflow setup instead.',required;
    end if;
  end loop;
  foreach required in array array['tasks','calendar_events','goals','project_notes','brand_messages','brand_moodboard_items'] loop
    if not exists(select 1 from pg_policies where schemaname='public' and tablename=required and policyname='project_access_guard' and permissive='RESTRICTIVE') then
      raise exception 'Missing project-permission guard on public.%. Use the complete workflow setup instead.',required;
    end if;
  end loop;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='team_notifications' and policyname='notification_access_guard' and permissive='RESTRICTIVE') then
    raise exception 'Missing notification permission guard. Use the complete workflow setup instead.';
  end if;
end $quest_preflight$;
`;
async function prepareSetup(sources,destination,upgrade=false){
  let sql=`-- Copy this ENTIRE file into a new Quest Supabase SQL Editor query.\n-- Clear any text selection before clicking Run. The final line must say END QUEST SETUP.\n-- Preserves team members, project assignments and existing content.\nrollback;\nreset role;\nbegin;\n`;
  if(upgrade)sql+=upgradePreflight;
  for(const name of sources){const source=await readFile(path.join(root,'supabase',name),'utf8');sql+=`\n-- ${name}\n`+source.replace(/^(?:begin;|commit;)\s*$/gm,'')+'\n';}
  sql+=`\ncommit;\nselect 'Quest daily workflow ready' as result,version from public.quest_schema_migrations where version='20261021_daily_workflow';\n-- END QUEST SETUP\n`;
  if(destination){await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,sql);}
  return sql;
}
export async function prepareWorkflowSetup(destination=null){
  return prepareSetup(['project-workspaces.sql','fragile-studio.sql','notifications.sql','member-access.sql','private-chats.sql','migrations/20261021_daily_workflow.sql','migrations/20261026_project_edit_access.sql','migrations/20261028_personal_workspaces.sql'],destination);
}
export async function prepareWorkflowUpgrade(destination=null){
  return prepareSetup(['private-chats.sql','migrations/20261021_daily_workflow.sql','migrations/20261026_project_edit_access.sql','migrations/20261028_personal_workspaces.sql'],destination,true);
}
export function prepareWorkflowCopyPage(sql){
  const escaped=sql.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  return `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quest SQL setup</title>
<style>body{font:17px system-ui,sans-serif;background:#11160f;color:#eff5e7;margin:0;padding:36px 20px}main{max-width:780px;margin:auto}h1{font-size:32px}button{background:#f47b2b;color:#111;border:0;border-radius:12px;padding:16px 24px;font:700 17px system-ui;cursor:pointer}textarea{box-sizing:border-box;width:100%;height:300px;background:#0a1009;color:#d7e9d0;border:1px solid #496344;border-radius:12px;padding:16px;font:13px monospace}li{margin:12px 0}#status{min-height:48px;color:#c2edb3}a{color:#ffb175}</style>
<main><h1>Quest setup</h1><p>This page copies the complete SQL file, including every closing block.</p>
<ol><li>Click <strong>Copy complete SQL</strong> below.</li><li>Open the <a href="https://supabase.com/dashboard/project/hpliemyxlvgtodmfpgos/sql/new" target="_blank" rel="noopener noreferrer">Quest SQL Editor</a>. Click inside the query, select all its old text and paste.</li><li>Click at the end of the pasted query to clear the selection, then click <strong>Run</strong>.</li></ol>
<button id="copy" type="button">Copy complete SQL</button><p id="status" role="status" aria-live="polite"></p>
<p>Expected result: <strong>Quest daily workflow ready</strong>. Then refresh Quest.</p>
<details><summary>View the complete SQL</summary><p id="size"></p><textarea id="sql" readonly aria-label="Complete Quest setup SQL">${escaped}</textarea></details>
<script>
const field=document.querySelector('#sql'),status=document.querySelector('#status');
document.querySelector('#size').textContent=field.value.split('\\n').length+' lines. Last line: -- END QUEST SETUP';
document.querySelector('#copy').addEventListener('click',async()=>{
  let copied=false;
  try{await navigator.clipboard.writeText(field.value);copied=true;}catch{}
  if(!copied){document.querySelector('details').open=true;field.focus();field.select();try{copied=document.execCommand('copy');}catch{}}
  status.textContent=copied?'Complete SQL copied. Paste it into a new Supabase query.':'The complete SQL is selected below. Press Ctrl+C (or Copy), then paste it into Supabase.';
});
</script></main></html>`;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),upgrade=args.includes('--upgrade');
  const destination=args.find(value=>value!=='--upgrade')||`/workspace/outputs/quest-daily-workflow-${upgrade?'upgrade':'setup'}.sql`;
  const sql=await (upgrade?prepareWorkflowUpgrade:prepareWorkflowSetup)(destination);
  const copyPage=destination.replace(/\.sql$/i,'')+'-copy.html';
  await writeFile(copyPage,prepareWorkflowCopyPage(sql));
  console.log(`Prepared ${destination} and ${copyPage}`);
}
