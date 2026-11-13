/** Display-only projection. Call only after server-side administrator verification.
 * Never save this projection or pass it to YouTube / PRISM / public realtime. */
export function adminTestChatRow<T extends Record<string, unknown>>(row:T):T {
 const test=Boolean(row.automation_actor_id)||row.avatar_url==='autotest';
 if(!test)return row;
 if(row.badge!=='bot')return {...row,nickname:testNickname(String(row.nickname||''))};
 const body=String(row.body||'');
 if(/^(?:🛍️|🛒|💳|💗)\s*\[테스트\]/.test(body))return row;
 if(!/^(?:c:|o:|card:|paid:|ap:|auto-paid:)/.test(String(row.bot_ref||row.botRef||'')))return row;
 return {...row,body:body.replace(/^((?:🛍️|🛒|💳|💗)\s*)/, '$1[테스트]')};
}
export function testNickname(nickname:string){return nickname.startsWith('[테스트]')?nickname:'[테스트]'+nickname;}
