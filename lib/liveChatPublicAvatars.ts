'use client';
const values=new Map<string,number>(),listeners=new Set<()=>void>(),pending=new Map<string,Promise<void>>();
export function avatarSnapshot(key:string,fallback:number){return values.get(key)??fallback}
export function subscribeAvatarChanges(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}}
export async function refreshPublicAvatars(bc:string):Promise<void>{
 const existing=pending.get(bc);if(existing)return existing;
 const promise=(async()=>{try{
  const response=await fetch('/api/live-chat/avatars?bc='+encodeURIComponent(bc),{cache:'no-store'});if(!response.ok)return;
  const j=await response.json();if(!j.ok||!j.profiles)return;
  let changed=false;for(const [key,id] of Object.entries(j.profiles))if(/^[\da-f-]{36}$/i.test(key)&&Number.isInteger(id)&&Number(id)>=0&&Number(id)<5000&&values.get(key)!==id){values.set(key,Number(id));changed=true;}
  if(changed)listeners.forEach(fn=>fn());
 }catch{}finally{pending.delete(bc)}})();pending.set(bc,promise);return promise;
}
