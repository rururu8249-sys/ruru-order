// [2026-11-14 19:57 사장님 «손님 채팅 프로필 사진(일반 손님·테스트 닉네임 둘 다) — 본인 색(배경·글씨)에 맞춰 루루면 「루」만 크게»]
//   사진이 없을 때 동그라미: 닉네임 첫 글자 하나만 크게, 배경 = 그 사람 색, 글씨 = 같은 색을 진하게.
//   「[테스트]」 같은 앞 표시·이모지·기호는 건너뛰고 첫 «글자»(한글·영문·숫자)를 씀. 영문은 대문자.
import {CHAT_COLORS,chatBaseColorIndex} from './liveChat';

export function avatarInitial(nick:string):string{
  const s=String(nick||'').normalize('NFC').replace(/^\s*\[[^\]]*\]\s*/,'');
  for(const ch of s){ if(/[\p{L}\p{N}]/u.test(ch)) return ch.toLocaleUpperCase('en'); }
  return '?';
}
/** 그 사람 색(#RRGGBB) → 동그라미 배경·글씨 색. 색을 모르면 닉네임으로 정해진 색 */
export function avatarColors(nick:string,color?:string):{bg:string;fg:string}{
  const base=/^#[0-9a-f]{6}$/i.test(color||'')?color!:CHAT_COLORS[chatBaseColorIndex(String(nick||'').replace(/^\s*\[[^\]]*\]\s*/,''))];
  const n=parseInt(base.slice(1),16);
  const dark=(c:number)=>Math.round(c*0.32);
  const fg=`rgb(${dark((n>>16)&255)}, ${dark((n>>8)&255)}, ${dark(n&255)})`;
  return {bg:base,fg};
}
