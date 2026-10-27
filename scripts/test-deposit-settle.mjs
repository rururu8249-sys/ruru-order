// [2026-10-27] 손님이 더 낸 입금 연결 판정 + 입금 「정리」 라우트 (주문·금액·정산 무접촉 확인)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createUiLoader} from './admin-ui-test-loader.mjs';

const lib = createUiLoader({})('lib/depositSettle.ts');
const {depositMatchDecision, isSettleableDeposit, isSettledDeposit, settledReason} = lib;

// ── 입금확인 버튼 판정 ──
assert.equal(depositMatchDecision(59000, 59000, false), 'exact');
assert.equal(depositMatchDecision(60000, 59000, false), 'over');      // 1,000원 더 냄 → 확인창 뒤 연결
assert.equal(depositMatchDecision(58000, 59000, false), 'blocked');   // 덜 냄 → 막음
assert.equal(depositMatchDecision(60000, 59000, true), 'blocked');    // 여러 주문 묶음 → 딱 맞아야
assert.equal(depositMatchDecision(62800, 62800, true), 'exact');
assert.equal(depositMatchDecision(0, 59000, false), 'blocked');
assert.equal(depositMatchDecision(1000, 0, false), 'blocked');

// ── 정리 가능/정리됨 판정 ──
assert.equal(isSettleableDeposit({match_status:'미확인'}), true);
assert.equal(isSettleableDeposit({match_status:''}), true);
assert.equal(isSettleableDeposit({match_status:'미매칭'}), true);
assert.equal(isSettleableDeposit({match_status:'미확인', match_order_group_id:'G1'}), false);
assert.equal(isSettleableDeposit({match_status:'미확인', confirmed_at:'2026-10-27'}), false);
assert.equal(isSettleableDeposit({match_status:'수동입금확인'}), false);
assert.equal(isSettleableDeposit({match_status:'처리완료', confirmed_note:'정리: 기타'}), false);
assert.equal(isSettledDeposit({match_status:'처리완료', confirmed_note:'정리: 인증(1원 등)'}), true);
assert.equal(isSettledDeposit({match_status:'처리완료', confirmed_note:'관리자 수동매칭'}), false);
assert.equal(isSettledDeposit({match_status:'처리완료', confirmed_note:'정리: 기타', match_order_group_id:'G1'}), false);
assert.equal(settledReason({confirmed_note:'정리: 중복 입금'}), '중복 입금');

// ── 화면 판정과 자동매칭이 «정리» 입금을 미매칭으로 안 보는지 (소스 규칙 확인) ──
const tableSrc = fs.readFileSync('components/admin-live/LiveOrderTable.tsx','utf8');
assert.match(tableSrc, /"매칭완료", "처리완료"/, '입금매칭 목록 판정이 처리완료를 완료로 봐야 함');
const autoSrc = fs.readFileSync('lib/admin-v2/autoPaymentMatch.ts','utf8');
assert.match(autoSrc, /if \(status === "미확인"\) return true;[\s\S]*?return false;/, '자동매칭은 미확인/미매칭/빈값만');

// ── 라우트: 가짜 DB 로 실제 POST 실행 ──
async function run(row, body, opts={}) {
  const writes=[];
  const db={from(table){
    assert.equal(table,'deposits','deposits 외 테이블 금지');
    let action='select',payload,filters=[];
    const q={select(){return q;},eq(k,v){filters.push(['eq',k,v]);return q;},is(k,v){filters.push(['is',k,v]);return q;},
      update(p){action='update';payload=p;return q;},maybeSingle(){return exec();},then(res,rej){return exec().then(res,rej);}};
    async function exec(){
      if(action==='select') return {data:row,error:null};
      writes.push({payload,filters});
      return {data:opts.raced?[]:[{id:row?.id}],error:null};
    }
    return q;
  }};
  const load=createUiLoader({'@/lib/admin-auth':{verifyAdminSessionFromRequest:async()=>opts.noAuth?null:({})},'@supabase/supabase-js':{createClient:()=>db}});
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
  const {POST}=load('app/api/admin-live/deposit-settle/route.ts');
  const res=await POST(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify(body)}));
  return {status:res.status,json:await res.json(),writes};
}

// 정리 성공 — 바뀌는 칸은 match_status·confirmed_note 둘뿐
let r=await run({id:7,match_status:'미확인',amount:1}, {depositId:7,reason:'인증(1원 등)'});
assert.equal(r.status,200); assert.equal(r.json.ok,true);
assert.deepEqual(Object.keys(r.writes[0].payload).sort(), ['confirmed_note','match_status']);
assert.equal(r.writes[0].payload.match_status,'처리완료');
assert.equal(r.writes[0].payload.confirmed_note,'정리: 인증(1원 등)');
assert.ok(r.writes[0].filters.some(([op,k])=>op==='is'&&k==='match_order_group_id'), '연결 안 된 입금에만 쓰기');

// 이유 없음 → 거절, 쓰기 0
r=await run({id:7,match_status:'미확인'}, {depositId:7,reason:'아무거나'});
assert.equal(r.status,400); assert.equal(r.writes.length,0);
// 이미 주문에 연결된 입금 → 거절
r=await run({id:8,match_status:'수동입금확인',match_order_group_id:'G1',confirmed_at:'x'}, {depositId:8,reason:'기타'});
assert.equal(r.status,409); assert.equal(r.writes.length,0);
// 그 사이 다른 곳에서 처리됨
r=await run({id:9,match_status:'미확인'}, {depositId:9,reason:'기타'}, {raced:true});
assert.equal(r.status,409);
// 로그인 안 됨
r=await run({id:9,match_status:'미확인'}, {depositId:9,reason:'기타'}, {noAuth:true});
assert.equal(r.status,401); assert.equal(r.writes.length,0);

// 되돌리기 — 정리한 입금만, 미확인으로
r=await run({id:10,match_status:'처리완료',confirmed_note:'정리: 기타'}, {depositId:10,undo:true});
assert.equal(r.status,200);
assert.deepEqual(r.writes[0].payload,{match_status:'미확인',confirmed_note:null});
// 수동매칭으로 처리완료인 입금은 되돌리기 거절
r=await run({id:11,match_status:'처리완료',confirmed_note:'관리자 수동매칭'}, {depositId:11,undo:true});
assert.equal(r.status,409); assert.equal(r.writes.length,0);

// 매칭 화면: 초과 입금은 확인창을 거쳐야 함(소스 확인)
const panel=fs.readFileSync('components/admin-live/LiveFloatingMatchPanel.tsx','utf8');
assert.match(panel, /matchDecision === "over"[\s\S]{0,200}showAdminConfirm/);
assert.match(panel, /canConfirm = matchMode && selDeps\.length > 0 && matchDecision !== "blocked"/);

console.log('deposit-settle tests passed');
