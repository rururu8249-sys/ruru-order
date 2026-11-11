'use client';
import {useState} from 'react';
import {RpsWidget} from '@/components/rps/RpsWidget';
import {RpsAdmin} from '@/components/rps/RpsAdmin';
import {useRpsGame} from '@/components/rps/useRpsGame';
export default function RpsPage(){const game=useRpsGame();const [open,setOpen]=useState(false);return <main style={{minHeight:'100dvh',background:'#1e2923',padding:'24px 12px',color:'white'}}><div style={{maxWidth:440,margin:'0 auto 16px',display:'flex',justifyContent:'space-between'}}><a href="/order">← 방송으로</a>{game.admin?<button onClick={()=>setOpen(true)}>관리자 · 게임 설정</button>:!game.verified?<button onClick={game.verify}>카카오 본인 확인</button>:null}</div><RpsWidget key={game.state?.id} game={game} onAdmin={()=>setOpen(true)}/>{(!game.state?.id||game.state.status==='closed')&&<p style={{textAlign:'center'}}>곧 재미있는 게임으로 만나요!</p>}{open&&game.admin&&<RpsAdmin game={game} onClose={()=>setOpen(false)} broadcastId={game.state?.broadcastId}/>}</main>;}
