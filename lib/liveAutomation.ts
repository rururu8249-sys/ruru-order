/** Pure rules shared by server jobs, the admin UI and verification. */
export const AUTOMATION_OWNER = '990000000077';
export const AUTOMATION_PHONE = '0200000077';
export const AUTOMATION_HEADER = 'x-live-automation';
export const DWELL_MINUTES = [5, 10, 30, 60, 120] as const;
export type AutomationFeature = 'orders' | 'chat' | 'viewers';
export type AutomationMode = 'live' | 'paused' | 'replay' | 'ended' | 'unknown';
export type AutomationState = {
  ready: boolean; broadcastId: string | null; revision: number;
  orders: boolean; chat: boolean; viewers: boolean; activeViewers: number;
  nextOrderAt: string | null; manualAction: string | null;
  last: { at: string; ok: boolean; message: string; driver?: string } | null;
};
export const AUTOMATION_OFF: AutomationState = {ready:false,broadcastId:null,revision:0,orders:false,chat:false,viewers:false,activeViewers:0,nextOrderAt:null,manualAction:null,last:null};
const unit = (rand:()=>number) => Math.min(1-Number.EPSILON,Math.max(0,rand()));
export const dwellMinutes = (rand=Math.random): number => DWELL_MINUTES[Math.floor(unit(rand)*5)];
export const orderWindow = (last:number,now:number,rand=Math.random):number => Math.max(last,now)+300_000+Math.floor(unit(rand)*270_001);
export const questionWindow = (due:number,rand=Math.random):number => due-30_000-Math.floor(unit(rand)*60_001);
export const canSubmitQuestion = (asked:number,now:number):boolean => now-asked>=30_000 && now-asked<=120_000;
export function orderTarget(dwell:number,slots:number,rand=Math.random):number {
  const capacity=Math.min(3,Math.max(0,Math.floor(slots)),dwell>=30?3:dwell>=10?2:1);
  return capacity ? 1+Math.floor(unit(rand)*capacity) : 0;
}
export const nicknameKey = (nickname:string):string => nickname.normalize('NFC').trim().replace(/\s+/g,' ').toLowerCase();
export type AutomationLine = {productId:string;productName:string;color:string;size:string;unitPrice:number;qty:number};
export type AvailableLine = Omit<AutomationLine,'qty'> & {available?:number};
export function validatePlannedLines(planned:AutomationLine[],current:AvailableLine[]):boolean {
  return planned.length>0 && planned.every(p=>Number.isInteger(p.qty) && p.qty>0 && current.some(c=>
    c.productId===p.productId && c.productName===p.productName && c.color===p.color && c.size===p.size &&
    c.unitPrice===p.unitPrice && (c.available===undefined || c.available>=p.qty)));
}
