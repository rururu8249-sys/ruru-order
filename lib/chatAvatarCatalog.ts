'use client';
export type AvatarSource={url:string;title:string;author?:string;license?:string;source?:string;category:string};
type Catalog={images:AvatarSource[];slots:number[];notifications:number[]};
let catalog:Catalog|null=null,request:Promise<void>|null=null;
const listeners=new Set<()=>void>();
export const subscribeAvatarCatalog=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn)}};
export const avatarCatalogSnapshot=()=>catalog;
export function loadAvatarCatalog(){
 if(catalog||request)return;
 request=fetch('/chat-avatars/catalog-v1.json',{cache:'force-cache'}).then(async r=>{if(!r.ok)throw Error('CATALOG');const j=await r.json();if(!Array.isArray(j.images)||j.slots?.length!==5000)throw Error('CATALOG');catalog=j;listeners.forEach(fn=>fn());}).catch(()=>{}).finally(()=>{request=null});
}
export function avatarSource(c:Catalog|null,index:number,notification=false):AvatarSource|null{
 if(!c)return null;const pool=notification?c.notifications:c.slots;
 return c.images[pool[((index%pool.length)+pool.length)%pool.length]]||null;
}
