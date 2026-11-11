'use client';
import {useEffect,useRef,useState} from 'react';
import {RPS_HANDS,RPS_ICON,RPS_LABEL,RPS_REWARD_STATUS,type RpsHand,type RpsState,type RpsRewardRow} from '@/lib/rps';
import type {RpsController} from './useRpsGame';
import {chatIdentityHeaders} from '@/lib/useLiveChatPrivate';
import './rps.css';
type HistoryRoom={id:string;title:string;status:string;revision:number;created_at:string;is_test:boolean;reward_kind:string;points:number;gift:string};
const defaults={title:'가위·바위·보 루루를 이겨라!',winners:1,rewardKind:'points',points:1000,gift:'',joinSeconds:300,pickSeconds:5,auto:true};
const draftOf=(s:RpsState|null)=>s?.id&&s.status!=='closed'?{title:s.title,winners:s.target,rewardKind:s.rewardKind,points:s.points,gift:s.gift,joinSeconds:s.joinSeconds,pickSeconds:s.round===1?5:s.pickSeconds,auto:s.auto}:defaults;
export function RpsAdmin({game,onClose,broadcastId}:{game:RpsController;onClose:()=>void;broadcastId?:string}){
 const [tab,setTab]=useState<'run'|'settings'|'winners'>('run');const [draft,setDraft]=useState(defaults),[dirty,setDirty]=useState(false),[hand,setHand]=useState<RpsHand>('rock');
 const [seconds,setSeconds]=useState(300),[copy,setCopy]=useState('');const baseRevision=useRef(0),dialog=useRef<HTMLDivElement>(null);
 const [history,setHistory]=useState<HistoryRoom[]>([]),[historyId,setHistoryId]=useState(''),[historyWinners,setHistoryWinners]=useState<RpsRewardRow[]>([]),[historyRefresh,setHistoryRefresh]=useState(0);
 const {state:s,action,busy}=game;const active=!!s?.id&&s.status!=='closed';
 const form=dirty?draft:draftOf(s);
 useEffect(()=>{if(tab!=='winners')return;const abort=new AbortController();void fetch('/api/rps/history'+(historyId?'?room='+encodeURIComponent(historyId):''),{headers:chatIdentityHeaders(),signal:abort.signal,cache:'no-store'}).then(r=>r.json()).then(data=>{if(data.ok&&!abort.signal.aborted){setHistory(data.rooms);setHistoryWinners(data.winners);}}).catch(()=>{});return()=>abort.abort();},[tab,historyId,historyRefresh]);
 const selectedHistory=history.find(r=>r.id===historyId);const winnerRows=historyId?historyWinners:game.winners;
 const rewardKind=selectedHistory?.reward_kind||s?.rewardKind, rewardPoints=selectedHistory?.points??s?.points??0, rewardGift=selectedHistory?.gift??s?.gift??'';

 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();return()=>previous?.focus();},[]);
 const update=(key:keyof typeof defaults,value:string|number|boolean)=>{if(!dirty)baseRevision.current=s?.revision||0;setDraft({...form,[key]:value});setDirty(true);};
 const save=async()=>{const data=s?.round?{auto:form.auto,pickSeconds:form.pickSeconds,title:form.title}:{...form};if(await action('settings',{...data,_expectedRevision:dirty?baseRevision.current:s?.revision||0})){setDirty(false);setTab('run');}};
 const create=async(test=false)=>{if(await action('create',{...form,broadcastId,test})){setDirty(false);setTab('run');}};
 const download=()=>{const quote=(v:string)=>'"'+(/^[=+@\-\t\r]/.test(v)?"'"+v:v).replaceAll('"','""')+'"';const text='\ufeff번호,닉네임,선물,처리 상태\r\n'+winnerRows.map((w,i)=>[String(i+1),quote(w.nickname),quote(rewardKind==='points'?`${rewardPoints}P`:rewardGift),quote(RPS_REWARD_STATUS[w.reward_status]||w.reward_status)].join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='루루-가위바위보-당첨자.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return <div className="rps-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={dialog} className="rps-admin" role="dialog" aria-modal="true" aria-label="가위바위보 관리자" onKeyDown={e=>{if(e.key==='Escape')onClose();if(e.key==='Tab'){const nodes=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')||[]);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
  <header><div><small>관리자</small><strong>가위·바위·보</strong></div><button className="rps-close" aria-label="관리 설정 닫기" onClick={onClose}>×</button></header>
  <nav>{(['run','settings','winners'] as const).map(t=><button key={t} aria-pressed={tab===t} onClick={()=>{setDirty(false);setTab(t);void game.refresh();}}>{t==='run'?'진행':t==='settings'?'설정':`당첨자 ${game.winners.length}`}</button>)}</nav>
  <div className="rps-admin-body">
  {game.error&&<p className="rps-error" role="alert">{game.error}</p>}
  {(tab==='settings'||!active)&&tab!=='winners'?<form onSubmit={e=>{e.preventDefault();void(active?save():create());}} className="rps-form">
   <label>게임 제목<input maxLength={80} value={form.title} onChange={e=>update('title',e.target.value)}/></label>
   <div className="rps-form-two"><label>당첨 인원<input disabled={active&&!!s?.round} type="number" min={1} max={1000} required value={form.winners} onChange={e=>update('winners',Number(e.target.value))}/></label><label>가위·바위·보 선택 시간<select value={form.pickSeconds} onChange={e=>update('pickSeconds',Number(e.target.value))}>{[3,5,8,10,15,20,30].map(n=><option value={n} key={n}>{n}초</option>)}</select></label></div>
   <label>이벤트 선물<select disabled={active&&!!s?.round} value={form.rewardKind} onChange={e=>update('rewardKind',e.target.value)}><option value="points">포인트 자동 지급</option><option value="gift">물건 선물 · 0원 주문 접수</option><option value="none">선물 없이 즐기기</option></select></label>
   {form.rewardKind==='points'&&<label>한 분당 포인트<input disabled={active&&!!s?.round} type="number" min={1} max={100000} required value={form.points} onChange={e=>update('points',Number(e.target.value))}/></label>}
   {form.rewardKind==='gift'&&<label>선물 내용<input disabled={active&&!!s?.round} maxLength={40} required placeholder="예: 양말 1켤레" value={form.gift} onChange={e=>update('gift',e.target.value)}/></label>}
   {!active&&<label>참가 모집 시간<select value={form.joinSeconds} onChange={e=>update('joinSeconds',Number(e.target.value))}>{[30,60,120,180,300,600].map(n=><option key={n} value={n}>{n<60?`${n}초`:`${n/60}분`}</option>)}</select></label>}
   <label>루루의 손<select value={form.auto?'auto':'manual'} onChange={e=>update('auto',e.target.value==='auto')}><option value="auto">자동 선택 · 다음 판도 자동 진행</option><option value="manual">수동 선택 · 관리자가 매 판 시작</option></select></label>
   <small>첫 판은 8초. 시간 안에 고르지 않으면 기권패예요.</small>
   {active&&<small>모집 시간은 진행 탭에서 바로 바꿀 수 있어요.</small>}
   <button className="rps-primary" disabled={busy}>{active?'설정 저장':'참가 모집 시작'}</button>
   {!active&&<button type="button" className="rps-secondary" disabled={busy} onClick={()=>void create(true)}>연습 게임 시작 · 실제 지급 없음</button>}
  </form>:null}
  {active&&tab==='run'&&<div className="rps-run">
   <div className="rps-admin-summary"><strong>{s?.test?'연습 게임':'방송 게임'} · {s?.round||0}라운드</strong><span>참가 {s?.total}명 · 생존 {s?.alive}명 · 당첨 {s?.winners.length}명</span></div>
   {(s?.status==='lobby'||(s?.status==='ready'&&!s.round))&&<div className="rps-change-time"><label>지금부터 모집 시간(초)<input type="number" min={10} max={1800} value={seconds} onChange={e=>setSeconds(Number(e.target.value))}/></label><button disabled={busy} onClick={()=>void action('lobbyTime',{seconds})}>바로 적용</button></div>}
   {(s?.status==='lobby'||s?.status==='ready')&&<>
    {!s.auto&&!s.pvp&&<><p>루루가 낼 손을 선택하세요</p><div className="rps-choices">{RPS_HANDS.map(h=><button key={h} aria-pressed={hand===h} onClick={()=>setHand(h)}><span>{RPS_ICON[h]}</span>{RPS_LABEL[h]}</button>)}</div></>}
    <button className="rps-primary" disabled={busy||!s.alive} onClick={()=>void action(s.status==='lobby'?'start':'next',{hand})}>{s.status==='lobby'?'모집 마감하고 바로 시작':'다음 라운드 시작'}</button>
   </>}
   {s?.status==='choosing'&&<p>선택 접수 중 · 시간이 끝나면 자동 공개합니다.</p>}
   {s?.status==='reveal'&&<p>{s.auto||s.pvp?'곧 다음 라운드가 시작됩니다.':'결과 확인 후 다음 판을 준비합니다.'}</p>}
   {!!s&&['lobby','choosing','reveal','paused'].includes(s.status)&&<button className="rps-secondary" disabled={busy} onClick={()=>void action(s.status==='paused'?'resume':'pause')}>{s.status==='paused'?'이어서 진행':'잠시 멈춤'}</button>}
   {!!s&&!s.pvp&&s.alive>=2&&s.alive<=4&&['ready','reveal'].includes(s.status)&&<button className="rps-secondary" disabled={busy} onClick={()=>void action('pvp')}>남은 {s.alive}명끼리 결승전</button>}
   {s?.status==='finished'&&<button className="rps-primary" onClick={()=>setTab('winners')}>당첨자·선물 처리 확인</button>}
   <button className="rps-danger" disabled={busy} onClick={()=>{if(window.confirm('게임을 종료하고 화면에서 숨길까요? 진행 중인 판은 취소됩니다.'))void action('close');}}>게임 종료 · 화면 숨기기</button>
  </div>}
  {tab==='winners'&&<div className="rps-winner-admin"><div className="rps-table-heading"><strong>당첨자 {winnerRows.length}명</strong><button onClick={download} disabled={!winnerRows.length}>엑셀용 저장</button></div>
  <select aria-label="당첨 이력 게임" value={historyId} onChange={e=>setHistoryId(e.target.value)} style={{width:'100%',minHeight:42,marginBottom:8,color:'#222',background:'white'}}><option value="">현재 게임</option>{history.filter(r=>r.id!==s?.id).map(r=><option key={r.id} value={r.id}>{new Date(r.created_at).toLocaleString('ko-KR')} · {r.is_test?'연습':'방송'} · {r.title}</option>)}</select>
  <div className="rps-table-scroll"><table><thead><tr><th>번호</th><th>닉네임</th><th>선물</th><th>처리 상태</th></tr></thead><tbody>{winnerRows.map((w,i)=><tr key={w.id}><td>{i+1}</td><td>{w.nickname}</td><td>{rewardKind==='points'?`${rewardPoints.toLocaleString()}P`:rewardGift||'없음'}</td><td>{RPS_REWARD_STATUS[w.reward_status]||w.reward_status}{w.reward_message&&<small>{w.reward_message}</small>}</td></tr>)}</tbody></table></div>
  {!winnerRows.length&&<p>당첨자가 결정되면 여기에 표시돼요.</p>}
  {(s?.status==='finished'||selectedHistory)&&<button className="rps-secondary" disabled={busy} onClick={async()=>{await action('retry',selectedHistory?{roomId:selectedHistory.id,_expectedRevision:selectedHistory.revision}:{});setHistoryRefresh(n=>n+1);}}>정보 확인 후 미처리 보상 다시 지급</button>}
  <small>당첨 기록은 기존 이벤트 당첨자 목록에도 저장됩니다.</small></div>}
  <div className="rps-widget-link"><button onClick={async()=>{try{await navigator.clipboard.writeText(`${location.origin}/event-rps/live`);setCopy('복사했어요');}catch{setCopy(`${location.origin}/event-rps/live`);}}}>유튜브·PRISM 위젯 링크 복사</button>{copy&&<small>{copy}</small>}</div>
  </div>
 </div></div>;
}
