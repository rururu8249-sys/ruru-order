'use client';
export type AvatarSource={url:string;title:string;author?:string;license?:string;source?:string;category:string;family?:string};
export type AvatarCatalog={version:number;images:AvatarSource[];slots:number[];notifications:number[]};
const catalogs=new Map<number,AvatarCatalog>(),requests=new Map<number,Promise<void>>();
const listeners=new Set<()=>void>();
export const subscribeAvatarCatalog=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn)}};
export const avatarCatalogSnapshot=(version=2)=>catalogs.get(version)||null;
export function loadAvatarCatalog(version=2){
 if(catalogs.has(version)||requests.has(version))return;
 requests.set(version,fetch('/chat-avatars/catalog-v'+version+'.json',{cache:'force-cache'}).then(async r=>{
  if(!r.ok)throw Error('CATALOG');const j=await r.json();
  if(!Array.isArray(j.images)||!Array.isArray(j.slots)||!j.slots.length)throw Error('CATALOG');
  catalogs.set(version,j);listeners.forEach(fn=>fn());
 }).catch(()=>{}).finally(()=>{requests.delete(version)}));
}
export function avatarSource(c:AvatarCatalog|null,index:number,notification=false):AvatarSource|null{
 if(!c||!Number.isInteger(index)||index<0)return null;
 const pool=notification?c.notifications:c.slots;
 // No wraparound and no borrowing another slot on an image failure or pool exhaustion.
 const imageIndex=pool[index];return Number.isInteger(imageIndex)?c.images[imageIndex]||null:null;
}
