"use client";
import {useEffect,useRef,type RefObject} from "react";

const activePanels: HTMLElement[] = [];

// Only the topmost modal owns keyboard input; nested financial confirmations
// must not be trapped inside the drawer that opened them.
export function useAdminModalFocus(panelRef:RefObject<HTMLDivElement|null>,onClose:()=>void,active=true) {
  const closeRef=useRef(onClose);
  closeRef.current=onClose;
  useEffect(()=>{
    const panel=panelRef.current;
    if(!active || !panel) return;
    const previous=document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow=document.body.style.overflow;
    activePanels.push(panel);
    document.body.style.overflow="hidden";
    panel.focus();
    const keydown=(event:KeyboardEvent)=>{
      if(activePanels.at(-1)!==panel) return;
      if(event.key==="Escape") {
        // A nested select can consume Escape in React's document listener.
        // stopPropagation alone does not skip this listener on the same target.
        if(event.defaultPrevented) return;
        // [2026-11-26] 창 안에 띄운 «안쪽 창»(고객이슈 등록·상품 고르기 등 fixed 덮개)에서 Esc 를 누르면
        //   바깥 창(주문상세)까지 통째로 닫혀 적던 내용이 날아갔다(실측 재현). 안쪽 창이 열려 있으면 바깥은 닫지 않는다.
        const innerLayer=Array.from(panel.querySelectorAll<HTMLElement>(".fixed.inset-0")).find(el=>el!==panel && el.getClientRects().length>0);
        if(innerLayer) return;
        event.preventDefault();event.stopPropagation();closeRef.current();return;
      }
      if(event.key!=="Tab") return;
      const nodes=Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')).filter(node=>node.getClientRects().length>0 && !node.closest("[hidden]"));
      const first=nodes[0],last=nodes.at(-1);
      if(!first || !last) {event.preventDefault();panel.focus();return;}
      if(event.shiftKey && (document.activeElement===first || document.activeElement===panel)) {event.preventDefault();last.focus();}
      else if(!event.shiftKey && (document.activeElement===last || document.activeElement===panel)) {event.preventDefault();first.focus();}
    };
    document.addEventListener("keydown",keydown);
    return ()=>{
      document.removeEventListener("keydown",keydown);
      const index=activePanels.lastIndexOf(panel);
      if(index>=0) activePanels.splice(index,1);
      document.body.style.overflow=activePanels.length ? "hidden" : previousOverflow;
      if(previous?.isConnected) previous.focus();
    };
  },[active,panelRef]);
}
