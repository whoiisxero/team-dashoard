import {readFile} from 'node:fs/promises';
export async function prepareWeedDiaryUploads(){
  const migration=await readFile(new URL('../supabase/migrations/20261115_private_chat_files.sql',import.meta.url),'utf8');
  const room=await readFile(new URL('../supabase/maintenance/weed-diary-chat.sql',import.meta.url),'utf8');
  const strip=sql=>sql.replace(/^(?:rollback|reset role|begin|commit);[ \t]*$/gmi,'').replace(/^-- END WEED DIARY CHAT SETUP\s*$/m,'');
  const parts=strip(room),resultAt=parts.indexOf('select r.name as private_chat');
  if(resultAt<0)throw Error('Weed Diary room verification query missing');
  return '-- Copy this ENTIRE query into a new Supabase SQL Editor query. Run as postgres.\nrollback;\nreset role;\nbegin;\n'
    +strip(migration)+'\n'+parts.slice(0,resultAt)+'\ncommit;\n'+parts.slice(resultAt)
    +'\n-- END WEED DIARY UPLOADS SETUP\n';
}
