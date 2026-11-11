'use client';
import {useEffect,useRef,useState} from 'react';
import {RPS_HANDS,RPS_ICON,RPS_LABEL,RPS_RESULT,rpsRemaining,type RpsHand} from '@/lib/rps';
import type {RpsController} from './useRpsGame';
import {useRpsAudio} from './useRpsAudio';
import './rps.css';
export function RpsWidget({game,publicOnly=false,onAdmin,broadcastId}:{game:RpsController;publicOnly?:boolean;onAdmin?:()=>void;broadcastId?:string}){
 const {state:s,player:p,now,busy,action}=game;const {sound,toggle}=useRpsAudio(s,publicOnly);
 const cardRef=useRef<HTMLElement>(null);
 useEffect(()=>{if(cardRef.current)cardRef.current.scrollTop=0;},[s?.status,s?.round]);
 const [animated,setAnimated]=useState(0),[page,setPage]=useState(0);
 useEffect(()=>{if(s?.status!=='choosing')return;const timer=setInterval(()=>setAnimated(i=>(i+1)%3),170);return()=>clearInterval(timer);},[s?.status]);
 useEffect(()=>{if(!publicOnly||s?.status!=='finished'||s.winners.length<=10)return;const timer=setInterval(()=>setPage(i=>(i+1)%Math.ceil(s.winners.length/10)),5000);return()=>clearInterval(timer);},[publicOnly,s?.status,s?.winners.length]);
 if(!s?.id||s.status==='closed'){
  if(publicOnly||!game.admin||!game.setup?.revision)return null;
  const config=game.setup.config;
  return <section className="rps-card rps-ready" aria-label="가위바위보 게임"><header className="rps-heading"><div><span className="rps-kicker">관리자 · 모집 전</span><strong>{config.title}</strong></div></header><div className="rps-prize">{config.rewardKind==='points'?`${config.points.toLocaleString()}P`:config.rewardKind==='gift'?config.gift:'선물 없음'} · 당첨 {config.winners.toLocaleString()}명</div><button className="rps-primary" disabled={busy} onClick={()=>void action('create',{setupRevision:game.setup?.revision,broadcastId,test:false})}>참가자 모집 시작</button><button className="rps-secondary" disabled={busy} onClick={()=>void action('create',{setupRevision:game.setup?.revision,broadcastId,test:true})}>연습 게임 시작</button>{game.error&&<p className="rps-error" role="alert">{game.error}</p>}{onAdmin&&<button className="rps-admin-shortcut" onClick={onAdmin}>게임 설정</button>}</section>;
 }
 const remaining=rpsRemaining(s.deadline,now);const choosing=s.status==='choosing';const revealed=s.status==='reveal'||s.status==='finished';
 const mine=p?.choice_round===s.round?p.choice:null;const eligible=p?.alive&&!p.winner;
 const prize=s.rewardKind==='points'?`${s.points.toLocaleString()}P`:s.rewardKind==='gift'?s.gift:'함께 즐기는 이벤트';
 const visibleWinners=publicOnly?s.winners.slice(page*10,page*10+10):s.winners;
 return <section ref={cardRef} className={`rps-card ${publicOnly?'rps-public':game.admin?'rps-admin-game':''}`} aria-label="가위바위보 게임">
  <header className="rps-heading"><div><span className="rps-kicker">{s.test?'연습 · 실제 지급 없음':s.status==='finished'?'🎊 당첨 발표':s.round?`${s.round}라운드 · ${s.pvp?'손님끼리 결승':'루루와 대결'}`:'🎁 참가 모집'}</span><strong>{s.title}</strong></div>
  {!publicOnly&&<div className="rps-tools"><button onClick={toggle} aria-label={sound?'게임 소리 끄기':'게임 소리 켜기'}>{sound?'🔊':'🔇'}</button>{game.admin&&<button className="rps-end-game" disabled={busy} onClick={()=>{if(window.confirm('게임을 종료할까요? 모집과 진행이 즉시 중단되고 모든 화면에서 게임이 사라집니다.'))void action('close');}}>게임 종료</button>}</div>}</header>
  <div className="rps-prize">{s.rewardKind==='none'?prize:<><b>{prize}</b> · 당첨 {s.target.toLocaleString()}명</>}{s.rewardKind==='gift'&&' · 무료 선물'}</div>
  <div className="rps-content-surface">
  {s.status==='finished'?<div className="rps-winner-box">
   {!!s.winners.length&&<div className="rps-confetti" aria-hidden="true">{Array.from({length:12},(_,i)=><i key={i} style={{left:`${5+i*8}%`,animationDelay:`${i%4*.12}s`,background:['#efb72c','#e97972','#75b497'][i%3]}}/>)}</div>}
   <strong className="rps-win-title">{s.winners.length?`🎉 ${s.winners.length}명 당첨!`:'이번 게임은 당첨자가 없어요'}</strong>
   {!publicOnly&&<p className={p?.winner?'rps-mine-notice':'rps-congrats'}>{p?.winner?`${p.nickname}님, 당첨됐어요!`:'함께해 주셔서 감사합니다!'}</p>}
   <div className={`rps-names ${s.winners.length<=3?'rps-few':''}`} role="region" aria-label="당첨자 명단" tabIndex={0}>
    {visibleWinners.map(w=><div key={w.id} className={w.id===p?.id?'rps-my-name':''}>{w.nickname}{!publicOnly&&w.id===p?.id&&<small>나</small>}</div>)}
   </div>
   {publicOnly&&s.winners.length>10?<small>{page*10+1}–{Math.min((page+1)*10,s.winners.length)} / {s.winners.length}명 · 5초마다 다음 명단</small>:!publicOnly&&s.winners.length>6&&<small>↕ 명단을 내려서 모두 확인하세요</small>}
   {!publicOnly&&p?.winner&&<small className="rps-reward-note">{s.test?'연습 게임으로 실제 지급하지 않아요.':p.reward_status==='done'?s.rewardKind==='gift'?'0원 선물 주문이 접수됐어요.':s.rewardKind==='none'?'축하합니다!':'포인트 지급이 완료됐어요.':p.reward_status==='needs_info'?p.reward_message:'당첨 보상을 자동 처리하고 있어요.'}</small>}
   {!publicOnly&&p?.winner&&p.reward_status==='needs_info'&&<div className="rps-reward-actions"><button onClick={game.verify}>카카오 다시 확인</button><button disabled={busy} onClick={()=>void action('claim')}>내정보 수정 완료 · 보상 받기</button></div>}
  </div>:s.status==='lobby'?<div className="rps-lobby"><div className="rps-count"><strong aria-label={`모집 마감까지 ${Math.floor(remaining/60)}분 ${String(remaining%60).padStart(2,'0')}초`}>{Math.floor(remaining/60)}<small>분</small>{' '}{String(remaining%60).padStart(2,'0')}<small>초</small></strong><span>{s.total}명 참가 중</span></div>
   {!publicOnly&&!game.admin?<button className="rps-primary" disabled={busy||!!p||remaining===0} onClick={()=>game.verified?void action('join'):game.verify()}>{p?'✓ 참가 완료 · 잠시 기다려 주세요':'참가하기'}</button>:<p>참가자 모집 중</p>}
  </div>:s.status==='ready'&&s.round===0&&!s.alive?<div className="rps-empty-lobby"><span aria-hidden="true">👥</span><strong>참가자가 없어 모집이 마감됐어요</strong><p>{game.admin&&!publicOnly?'아래 버튼으로 참가자를 다시 모집하세요.':'새 모집이 열리면 참가할 수 있어요.'}</p></div>:<>
   <div className="rps-scoreline"><b>생존 {s.alive}명</b><span>{s.status==='paused'?'잠시 멈춤':s.status==='ready'?s.auto?'다음 판을 준비하고 있어요':'루루가 가위·바위·보를 고르고 있어요':choosing?remaining?`${remaining}초 안에 선택`:'선택 마감 · 결과 확인 중':'결과 공개'}</span></div>
   <div className="rps-versus"><div><span className="rps-hand">{!publicOnly&&p?(mine?RPS_ICON[mine]:'❔'):s.alive<=4?'🏁':'👥'}</span><small>{!publicOnly&&p?'나':s.pvp?'결승 진출자':`시청자 ${s.alive}명`}</small></div><b>VS</b><div><span className="rps-hand">{choosing?RPS_ICON[RPS_HANDS[animated]]:revealed&&s.hostHand&&s.hostHand!=='pvp'?RPS_ICON[s.hostHand]:s.pvp?'👥':'❔'}</span><small>{s.pvp?'서로 대결':'루루'}</small></div></div>
   {choosing&&!publicOnly&&eligible&&<div className="rps-choices">{RPS_HANDS.map(hand=><button key={hand} aria-pressed={mine===hand} disabled={busy||remaining===0} onClick={()=>void action('pick',{hand})}><span>{RPS_ICON[hand]}</span>{RPS_LABEL[hand]}{mine===hand&&<small>✓ 선택</small>}</button>)}</div>}
   {!publicOnly&&!game.admin&&<p className="rps-personal" aria-live="polite">{p?.winner?'🎉 당첨 확정! 남은 경기를 지켜보세요.':revealed&&p?RPS_RESULT[p.result||'']||'함께 관전해요':!p?'관전 중 · 다음 게임에 참가해 주세요':!eligible?'탈락했지만 끝까지 함께 관전해요!':choosing?mine?'✓ 선택 완료 · 마감 전 바꿀 수 있어요':'가위·바위·보 중 하나를 눌러 주세요. 시간 내 선택하지 않으면 탈락해요.':''}</p>}
   {revealed&&<div className="rps-stats">승 {s.stats.win||0} · 무 {s.stats.draw||0} · 패 {s.stats.lose||0} · 기권 {s.stats.forfeit||0}</div>}
   {!!s.finals.length&&s.alive<=4&&<div className="rps-finalists">{s.finals.map(f=><div key={f.id}><b>{f.nickname}</b><span>{revealed&&f.hand?RPS_ICON[f.hand]:'❔'} {revealed?RPS_RESULT[f.result||'']||'':''}</span></div>)}</div>}
   {s.note&&<small className="rps-note">{s.note}</small>}
  </>}
  {!publicOnly&&game.error&&<p className="rps-error" role="alert">{game.error}</p>}
  {game.admin&&!publicOnly&&<RpsHostControls game={game}/>}
  {game.admin&&!publicOnly&&<div className="rps-host-footer">{onAdmin&&<button className="rps-admin-shortcut" onClick={onAdmin}>게임 설정</button>}</div>}
  </div>
 </section>;
}

function RpsHostControls({game}:{game:RpsController}){
 const [hand,setHand]=useState<RpsHand>('rock');
 const {state:s,busy,action}=game;
 if(!s)return null;
 return <div className="rps-host-controls">
 {s.status==='ready'&&s.round===0&&!s.alive?<button className="rps-primary" disabled={busy} onClick={()=>void action('lobbyTime',{seconds:s.joinSeconds})}>참가자 다시 모집</button>:['lobby','ready'].includes(s.status)&&<>
 {!s.auto&&!s.pvp&&<><p>루루 가위바위보 선택</p><div className="rps-choices">{RPS_HANDS.map(h=><button key={h} disabled={busy} aria-pressed={hand===h} onClick={()=>setHand(h)}><span>{RPS_ICON[h]}</span>{RPS_LABEL[h]}</button>)}</div></>}
 <button className="rps-primary" disabled={busy||!s.alive} onClick={()=>void action(s.status==='lobby'?'start':'next',{hand})}>{s.round?'다음 라운드 시작':'모집 마감하고 게임 시작'}</button>
 {!s.alive&&<small>참가자가 들어오면 시작할 수 있어요.</small>}
 </>}
 {s.status==='paused'&&<button className="rps-primary" disabled={busy} onClick={()=>void action('resume')}>게임 계속하기</button>}
 {!s.pvp&&s.alive>=2&&s.alive<=4&&['ready','reveal'].includes(s.status)&&<button className="rps-secondary" disabled={busy} onClick={()=>void action('pvp')}>남은 {s.alive}명끼리 결승전</button>}
 </div>;
}
