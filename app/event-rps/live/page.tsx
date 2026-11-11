'use client';
import {RpsWidget} from '@/components/rps/RpsWidget';
import {useRpsGame} from '@/components/rps/useRpsGame';
export default function RpsOverlay(){const game=useRpsGame(true);return <main style={{padding:16,width:'100%',background:'transparent'}}><style>{'html,body{background:transparent!important;margin:0;overflow:hidden}'}</style><RpsWidget key={game.state?.id} game={game} publicOnly/></main>;}
