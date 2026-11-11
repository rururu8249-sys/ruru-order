'use client';
import {useEffect,useRef,useState} from 'react';
import {RPS_REWARD_STATUS,RPS_DEFAULT_CONFIG,type RpsConfig,type RpsState,type RpsRewardRow} from '@/lib/rps';
import type {RpsController} from './useRpsGame';
import {chatIdentityHeaders} from '@/lib/useLiveChatPrivate';
import './rps.css';
type HistoryRoom={id:string;title:string;status:string;revision:number;created_at:string;is_test:boolean;reward_kind:string;points:number;gift:string};
const draftOf=(s:RpsState|null,config:RpsConfig)=>s?.id&&s.status!=='closed'?{title:s.title,winners:s.target,rewardKind:s.rewardKind,points:s.points,gift:s.gift,joinSeconds:s.joinSeconds,pickSeconds:s.round===1?config.pickSeconds:s.pickSeconds,auto:s.auto}:config;
type RpsAdminProps={game:RpsController;onClose:()=>void;broadcastId?:string};
// A client-side owner badge is only a navigation hint. Server verification gates
// all settings, winner details and API actions, including after account changes.
export function RpsAdmin(props:RpsAdminProps){
 const {game,onClose}=props;
 const verifyButton=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(!game.admin)verifyButton.current?.focus();},[game.admin]);
 if(game.admin)return <VerifiedRpsAdmin {...props}/>;
 return <div className="rps-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
  <div className="rps-admin" role="dialog" aria-modal="true" aria-label="게임 관리자 확인" onKeyDown={e=>{
   if(e.key==='Escape')onClose();
   if(e.key==='Tab'){const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button'));const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
  }}>
   <header><div><small>관리자</small><strong>가위·바위·보</strong></div><button className="rps-close" aria-label="관리 설정 닫기" onClick={onClose}>×</button></header>
   <div className="rps-admin-body"><p>{game.verified?'현재 확인된 계정에는 게임 관리 권한이 없어요. 관리자 카카오 계정으로 확인해 주세요.':'카카오 계정을 확인하면 게임 설정이 열려요.'}</p><button ref={verifyButton} className="rps-primary" onClick={()=>{try{sessionStorage.setItem('ruru-rps-admin-return','1');}catch{}game.verify();}}>카카오로 관리자 확인</button></div>
  </div>
 </div>;
}
function VerifiedRpsAdmin({game,onClose}:RpsAdminProps){
 const [tab,setTab]=useState<'settings'|'winners'>('settings');
 const [draft,setDraft]=useState<RpsConfig>(RPS_DEFAULT_CONFIG),[dirty,setDirty]=useState(false);
 const [copy,setCopy]=useState(''),[formError,setFormError]=useState('');
 const baseRevision=useRef(0),baseTarget=useRef('setup'),dialog=useRef<HTMLDivElement>(null);
 const [history,setHistory]=useState<HistoryRoom[]>([]),[historyId,setHistoryId]=useState(''),[historyWinners,setHistoryWinners]=useState<RpsRewardRow[]>([]),[historyRefresh,setHistoryRefresh]=useState(0);
 const {state:s,action,busy,setup}=game;
 const active=!!s?.id&&s.status!=='closed';
 const editable=!active||s?.status==='lobby'||s?.status==='ready';
 const fixedPrize=active&&!!s?.round;
 const form=dirty?draft:draftOf(s,setup?.config??RPS_DEFAULT_CONFIG);
 useEffect(()=>{if(tab!=='winners')return;const abort=new AbortController();void fetch('/api/rps/history'+(historyId?'?room='+encodeURIComponent(historyId):''),{headers:chatIdentityHeaders(),signal:abort.signal,cache:'no-store'}).then(r=>r.json()).then(data=>{if(data.ok&&!abort.signal.aborted){setHistory(data.rooms);setHistoryWinners(data.winners);}}).catch(()=>{});return()=>abort.abort();},[tab,historyId,historyRefresh]);
 const selectedHistory=history.find(r=>r.id===historyId);const winnerRows=historyId?historyWinners:game.winners;
 const rewardKind=selectedHistory?.reward_kind||s?.rewardKind, rewardPoints=selectedHistory?.points??s?.points??0, rewardGift=selectedHistory?.gift??s?.gift??'';
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();return()=>previous?.focus();},[]);
 const update=<K extends keyof RpsConfig>(key:K,value:RpsConfig[K])=>{setFormError('');if(!dirty){baseRevision.current=active?s?.revision||0:setup?.revision||0;baseTarget.current=active?s!.id!:'setup';}setDraft({...form,[key]:value});setDirty(true);};
 const save=async()=>{
  if(dirty&&baseTarget.current!==(active?s?.id:'setup')){setFormError('게임 상태가 바뀌었어요. 설정을 다시 열어 확인해 주세요.');return;}
  const expected=dirty?baseRevision.current:active?s?.revision||0:setup?.revision||0;
  const data=fixedPrize?{auto:form.auto,pickSeconds:form.pickSeconds,title:form.title}:{...form,points:form.rewardKind==='points'?form.points:1000};
  if(await action(active?'settings':'saveSetup',{...data,...(active?{_expectedRevision:expected,_roomId:s?.id}:{setupRevision:expected})})){setDirty(false);onClose();}
 };
 const download=()=>{const quote=(v:string)=>'"'+(/^[=+@\-\t\r]/.test(v)?"'"+v:v).replaceAll('"','""')+'"';const text='\ufeff번호,닉네임,선물,처리 상태\r\n'+winnerRows.map((w,i)=>[String(i+1),quote(w.nickname),quote(rewardKind==='points'?`${rewardPoints.toLocaleString()}P`:rewardGift),quote(RPS_REWARD_STATUS[w.reward_status]||w.reward_status)].join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='루루-가위바위보-당첨자.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return <div className="rps-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={dialog} className="rps-admin" role="dialog" aria-modal="true" aria-label="가위바위보 관리자" onKeyDown={e=>{if(e.key==='Escape')onClose();if(e.key==='Tab'){const nodes=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,a[href]')||[]);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
 <header><div><small>관리자</small><strong>가위·바위·보</strong></div><button className="rps-close" aria-label="관리 설정 닫기" onClick={onClose}>×</button></header>
 <nav>{(['settings','winners'] as const).map(t=><button key={t} aria-pressed={tab===t} onClick={()=>{setDirty(false);setTab(t);void game.refresh();}}>{t==='settings'?'설정':`당첨자 ${game.winners.length.toLocaleString()}`}</button>)}</nav>
 <div className="rps-admin-body">
 {formError&&<p className="rps-error" role="alert">{formError}</p>}
 {game.error&&<p className="rps-error" role="alert">{game.error}</p>}
 {tab==='settings'&&<>
 <form id="rps-settings-form" onSubmit={e=>{e.preventDefault();void save();}} className="rps-form">
 <label>게임 제목<input maxLength={80} required value={form.title} onChange={e=>update('title',e.target.value)}/></label>
 <div className="rps-form-two"><label>당첨 인원<input disabled={fixedPrize} type="number" min={1} max={1000} required value={form.winners} onChange={e=>update('winners',Number(e.target.value))}/></label><label>선택 시간<select value={form.pickSeconds} onChange={e=>update('pickSeconds',Number(e.target.value))}>{[3,5,8,10,15,20,30].map(n=><option value={n} key={n}>{n}초</option>)}</select></label></div>
 <div className={form.rewardKind==='points'?'rps-form-two':undefined}><label>이벤트 선물<select disabled={fixedPrize} value={form.rewardKind} onChange={e=>update('rewardKind',e.target.value as RpsConfig['rewardKind'])}><option value="points">포인트</option><option value="gift">물건 선물</option><option value="none">선물 없음</option></select></label>
 {form.rewardKind==='points'&&<label>포인트<input aria-label="포인트" disabled={fixedPrize} type="text" inputMode="numeric" pattern="[0-9,]+" maxLength={7} required value={form.points?form.points.toLocaleString('ko-KR'):''} onChange={e=>update('points',Number(e.target.value.replace(/\D/g,'')))}/></label>}
 </div>
 {form.rewardKind==='gift'&&<label>선물 내용<input disabled={fixedPrize} maxLength={40} required placeholder="예: 양말 1켤레" value={form.gift} onChange={e=>update('gift',e.target.value)}/><small>당첨자에게 0원 선물 주문이 자동 접수돼요.</small></label>}
 <fieldset className="rps-duration"><legend>참가자 모집 시간</legend><div><label><input aria-label="모집 시간 분" disabled={fixedPrize} type="number" min={0} max={30} required value={Math.floor(form.joinSeconds/60)} onChange={e=>update('joinSeconds',Number(e.target.value)*60+form.joinSeconds%60)}/><span>분</span></label><label><input aria-label="모집 시간 초" disabled={fixedPrize} type="number" min={0} max={59} required value={form.joinSeconds%60} onChange={e=>update('joinSeconds',Math.floor(form.joinSeconds/60)*60+Number(e.target.value))}/><span>초</span></label></div>{active&&!fixedPrize&&form.joinSeconds!==s?.joinSeconds&&<small>저장하면 바꾼 시간으로 다시 계산해요.</small>}</fieldset>
 <fieldset className="rps-mode"><legend>루루 가위바위보 고르기 방식</legend><div>{[true,false].map(auto=><button type="button" key={String(auto)} aria-pressed={form.auto===auto} onClick={()=>update('auto',auto)}>{auto?'자동':'수동'}</button>)}</div><p>{form.auto?'자동: 컴퓨터가 루루의 가위·바위·보를 무작위로 고르고, 다음 판도 자동으로 진행해요.':'수동: 관리자가 매 판 루루의 가위·바위·보를 직접 고른 뒤 시작 버튼을 눌러요.'}</p></fieldset>
 <small>첫 판 선택 시간은 8초예요. 시간 안에 선택하지 않으면 기권패 처리돼요.</small>
 {fixedPrize&&<small>게임이 시작되어 당첨 인원과 선물은 변경할 수 없어요.</small>}
 </form>
 <details className="rps-widget-link"><summary>유튜브·PRISM 송출</summary><button onClick={async()=>{try{await navigator.clipboard.writeText(`${location.origin}/event-rps/live`);setCopy('복사했어요');}catch{setCopy(`${location.origin}/event-rps/live`);}}}>관전 위젯 링크 복사</button>{copy&&<small>{copy}</small>}</details>
 </>}
  {tab==='winners'&&<div className="rps-winner-admin"><div className="rps-table-heading"><strong>당첨자 {winnerRows.length}명</strong><button onClick={download} disabled={!winnerRows.length}>엑셀용 저장</button></div>
  <select aria-label="당첨 이력 게임" value={historyId} onChange={e=>setHistoryId(e.target.value)} style={{width:'100%',minHeight:42,marginBottom:8,color:'#222',background:'white'}}><option value="">현재 게임</option>{history.filter(r=>r.id!==s?.id).map(r=><option key={r.id} value={r.id}>{new Date(r.created_at).toLocaleString('ko-KR')} · {r.is_test?'연습':'방송'} · {r.title}</option>)}</select>
  <div className="rps-table-scroll"><table><thead><tr><th>번호</th><th>닉네임</th><th>선물</th><th>처리 상태</th></tr></thead><tbody>{winnerRows.map((w,i)=><tr key={w.id}><td>{i+1}</td><td>{w.nickname}</td><td>{rewardKind==='points'?`${rewardPoints.toLocaleString()}P`:rewardGift||'없음'}</td><td>{RPS_REWARD_STATUS[w.reward_status]||w.reward_status}{w.reward_message&&<small>{w.reward_message}</small>}</td></tr>)}</tbody></table></div>
  {!winnerRows.length&&<p>당첨자가 결정되면 여기에 표시돼요.</p>}
  {(s?.status==='finished'||selectedHistory)&&<button className="rps-secondary" disabled={busy} onClick={async()=>{await action('retry',selectedHistory?{roomId:selectedHistory.id,_expectedRevision:selectedHistory.revision}:{});setHistoryRefresh(n=>n+1);}}>정보 확인 후 미처리 보상 다시 지급</button>}
  <small>당첨 기록은 기존 이벤트 당첨자 목록에도 저장됩니다.</small></div>}
 </div>
 {tab==='settings'&&<footer className="rps-admin-footer">{!editable&&<small>라운드 대기 중에 설정을 저장할 수 있어요.</small>}<button type="submit" form="rps-settings-form" className="rps-primary" disabled={busy||!editable||(!active&&!setup)||(form.rewardKind==='points'&&(!form.points||form.points>100000))||form.joinSeconds<10||form.joinSeconds>1800}>저장</button></footer>}
 </div></div>;
}
