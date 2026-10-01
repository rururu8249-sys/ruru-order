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
      if(event.key==="Escape") {event.preventDefault();event.stopPropagation();closeRef.current();return;}
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
