export type RpsHand='scissors'|'rock'|'paper';
export const RPS_HANDS: RpsHand[]=['scissors','rock','paper'];
export const RPS_ICON={scissors:'✌️',rock:'✊',paper:'✋'};
export const RPS_LABEL={scissors:'가위',rock:'바위',paper:'보'};
export type RpsPerson={id:string;nickname:string;hand?:RpsHand|null;result?:string|null};
export type RpsState={id?:string;broadcastId?:string;title:string;status:'lobby'|'ready'|'choosing'|'reveal'|'paused'|'finished'|'closed';revision:number;round:number;deadline:string|null;joinSeconds:number;pickSeconds:number;target:number;auto:boolean;pvp:boolean;test:boolean;rewardKind:'points'|'gift'|'none';points:number;gift:string;total:number;alive:number;winners:RpsPerson[];finals:RpsPerson[];commitment:string|null;hostHand:RpsHand|'pvp'|null;salt:string|null;stats:Record<string,number>;note:string;serverTime?:string};
export type RpsPlayer={id:string;nickname:string;alive:boolean;winner:boolean;choice:RpsHand|null;choice_round:number;result:string|null;reward_status:string;reward_message:string};
export type RpsRewardRow={id:string;nickname:string;winner_id:string|null;reward_status:string;reward_message:string};
export const RPS_REWARD_STATUS:Record<string,string>={pending:'자동 처리 중',done:'지급 완료',needs_info:'정보 확인 필요',test:'연습 · 지급 없음'};
export const RPS_RESULT:Record<string,string>={win:'승리!',draw:'무승부 · 생존',lose:'아쉽게 탈락',forfeit:'시간 초과 · 기권패'};
export function rpsRemaining(deadline:string|null,now:number){return deadline?Math.max(0,Math.ceil((Date.parse(deadline)-now)/1000)):0;}

export type RpsConfig={title:string;winners:number;rewardKind:'points'|'gift'|'none';points:number;gift:string;joinSeconds:number;pickSeconds:number;auto:boolean};
export type RpsSetup={revision:number;config:RpsConfig};
export const RPS_DEFAULT_CONFIG:RpsConfig={title:'가위·바위·보 루루를 이겨라!',winners:1,rewardKind:'points',points:1000,gift:'',joinSeconds:300,pickSeconds:5,auto:true};
