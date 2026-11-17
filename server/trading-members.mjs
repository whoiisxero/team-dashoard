/* This allowlist stays server-side; it is not a public member directory. */
export function canUseTradingLab({user,profile,policy}){
 if(!user?.id||profile?.user_id!==user.id||policy?.ready!==true||policy.studio_only_project_id||policy.private_fragile_owner_id)return false;
 if(policy.is_admin===true)return true;
 if(policy.personal_only)return false;
 return new Set(['tertius','josh']).has(String(profile.display_name||'').trim().toLowerCase());
}
