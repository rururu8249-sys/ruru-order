// [2026-10-22] 주문서 복사·입금 쪽지의 입금계좌 = ①주문 스냅샷(손님이 본 계좌) → ②설정 라우팅 «전체 공통» 계좌 → ③기존 계좌
import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const primary = {id:'primary',enabled:true,label:'기존 계좌',bankName:'하나은행',bankAccount:'111-222-333333',bankHolder:'루루'};
const secondary = {id:'secondary',enabled:true,label:'추가 계좌',bankName:'농협',bankAccount:'301-0000-1111-11',bankHolder:'루루'};
const mk = (routing) => ({contactType:'kakao_channel',contactValue:'',adminChatUrl:'',paysterUrl:'',bankName:primary.bankName,bankAccount:primary.bankAccount,bankHolder:primary.bankHolder,bankAccounts:[primary,secondary],bankRouting:{mode:'all',allAccountId:'primary',existingAccountId:'primary',firstOrderAccountId:'primary',firstOrderWindow:{enabled:false,startDate:'',endDate:''},...routing}});
let info = mk({});
const mod = createUiLoader({'@/lib/useShopInfo':{getShopInfoSnapshot:()=>info}})('components/admin-live/liveOrderCustomerCopy.ts');
const {bankLineForOrder, buildCustomerOrderCopyText, buildPaymentRequestNote, buildExtraDepositRequestNote} = mod;

// ① 스냅샷이 있으면 설정과 무관하게 그 계좌
assert.equal(bankLineForOrder({paymentBank:{bankName:'농협',bankAccount:'301-9',bankHolder:'루루'}}), '농협 301-9 (루루)');
// ② 스냅샷 없음 + 전체공통=추가계좌(농협) → 농협
info = mk({mode:'all', allAccountId:'secondary'});
assert.equal(bankLineForOrder({paymentBank:null}), '농협 301-0000-1111-11 (루루)');
assert.equal(bankLineForOrder(null), '농협 301-0000-1111-11 (루루)');
// ③ 전체공통=기존 → 하나 / 고객별 분기(split)면 기존 계좌로
info = mk({mode:'all', allAccountId:'primary'});
assert.equal(bankLineForOrder({}), '하나은행 111-222-333333 (루루)');
info = mk({mode:'split', allAccountId:'secondary'});
assert.equal(bankLineForOrder({}), '하나은행 111-222-333333 (루루)');
// 추가 계좌가 꺼져 있으면 기존 계좌
info = mk({mode:'all', allAccountId:'secondary'}); info.bankAccounts = [primary, {...secondary, enabled:false}];
assert.equal(bankLineForOrder({}), '하나은행 111-222-333333 (루루)');

// 실제 문구 3곳 모두 같은 계좌 규칙
info = mk({mode:'all', allAccountId:'secondary'});
const order = {id:'g1',groupId:'g1',rowIds:[1],orderNo:'AB12',paymentStatus:'unpaid',paymentLabel:'미입금',shippingStatus:'',createdAt:'2026-10-22T10:00:00+09:00',submittedAt:'',paidAt:null,paidAtFull:null,nickname:'행복나무',youtubeNickname:'행복나무',name:'김행복',phone:'01012345678',recipientName:null,recipientPhone:null,kakao_id:null,zipcode:null,address:'서울',detailAddress:'1동',paymentMethod:'무통장입금',broadcastId:null,broadcastName:null,orderSummary:'',productAmount:10000,shippingFee:0,totalAmount:10000,pointOriginalAmount:0,pointUsedAmount:0,finalAmount:10000,cardExtraAmount:0,cardPaymentTotalAmount:0,memo:'',deliveryMemo:'',isTestOrder:false,items:[{id:'1',name:'니트',qty:1,amount:10000}],paymentBank:null};
assert.match(buildCustomerOrderCopyText(order), /💳 입금계좌: 농협 301-0000-1111-11 \(루루\)/);
assert.match(buildPaymentRequestNote(order).message, /농협 301-0000-1111-11/);
assert.match(buildExtraDepositRequestNote('행복나무', 3000, order).message, /농협 301-0000-1111-11/);
const snapOrder = {...order, paymentBank:{bankName:'하나은행',bankAccount:'111-222-333333',bankHolder:'루루'}};
assert.match(buildCustomerOrderCopyText(snapOrder), /하나은행 111-222-333333/, '옛 주문은 손님이 본 계좌(스냅샷) 그대로');
console.log('PASS order copy bank line: snapshot → routing all-account → primary (7 cases)');
