"use client";
import {useCallback,useEffect,useRef,useState} from "react";
export type SettingsDraftState = {dirty:boolean;saving:boolean;save:()=>Promise<boolean>;discard:()=>void};
export type SettingsDraftProps = {onDraftStateChange?:(state:SettingsDraftState)=>void};
export function useSettingsDraft<T>({value,loading,saving,save,onDraftStateChange,onDiscard}:{value:T;loading:boolean;saving:boolean;save:()=>Promise<boolean>;onDraftStateChange?:SettingsDraftProps["onDraftStateChange"];onDiscard?:(value:T)=>void}) {
  const [saved,setSaved]=useState<string|null>(null);
  const signature=JSON.stringify(value);
  const latest=useRef({save,onDraftStateChange,onDiscard});
  latest.current={save,onDraftStateChange,onDiscard};
  const savedRef=useRef(saved); savedRef.current=saved;
  const dirty=!loading && saved!==null && saved!==signature;
  useEffect(()=>{if (!loading) setSaved(signature);},[loading]); // Initial load only; later edits are never a baseline.
  const markSaved=useCallback((confirmedValue?:T)=>setSaved(confirmedValue === undefined ? signature : JSON.stringify(confirmedValue)),[signature]);
  useEffect(()=>{
    latest.current.onDraftStateChange?.({dirty,saving,save:()=>latest.current.save(),discard:()=>{if(savedRef.current!==null) latest.current.onDiscard?.(JSON.parse(savedRef.current));}});
  },[dirty,saving]);
  useEffect(()=>()=>{latest.current.onDraftStateChange?.({dirty:false,saving:false,save:async()=>false,discard:()=>{}});},[]);
  return markSaved;
}
