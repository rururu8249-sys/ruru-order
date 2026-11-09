// lib/liveAlertEffect.ts
// [2026-11-09 사장님 19:33 「알림톡 돈값 재는 거 만들어줘」 · 19:34 「주문만 보고 말하면 안 되지 않나 — 사이트 접속 기준으로 제한적 통계, 정확히 명시」]
//   방송마다: 알림 받은 사람 → (A) 그 방송 시간에 우리 사이트에 들어왔는지 (B) 그 방송에서 주문했는지.
//   순수 계산만(읽기 전용). 돈 판정은 lib/liveSummary 의 결제완료 판정을 그대로 받음 — 바꾸지 않음.
//
//   ⚠️ 이 숫자가 «못» 보여 주는 것(화면에 그대로 적음):
//     - 유튜브 앱으로 방송을 봤는지는 모름(유튜브가 알려 주지 않음).
//     - 사이트 접속은 «닉네임이 남은 접속»만 맞춤(로그인 전 접속·닉네임이 다른 경우는 못 셈 → 실제보다 적게 나올 수 있음).
//     - 알림 «때문에» 왔는지는 모름. 알림을 안 받았어도 왔을 단골일 수 있음.

export const ALERT_UNIT_COST_WON = 13; // 11/8 솔라피 청구(53,885원 ÷ 4,145명) 기준 1명당 약 13원

export type AlertedPerson = { phone: string; kakao: string; nicks: string[] };
export type EffectGroup = { phone: string; who: string; amount: number; paid: boolean; canceled: boolean; isTest: boolean };

export type AlertEffect = {
  alerted: number;
  cost: number;
  siteVisitors: number;      // 그 방송 시간에 사이트 들어온 사람(닉네임 있는 접속, 중복 제외)
  alertedVisited: number;    // 알림 받은 사람 중 사이트 들어온 사람
  buyers: number;            // 그 방송 주문한 사람(취소·테스트 제외)
  alertedBuyers: number;     // 알림 받은 사람 중 주문한 사람
  alertedPaidBuyers: number; // 그중 결제완료
  paidSum: number;           // 방송 결제완료 금액 전체
  alertedPaidSum: number;    // 알림 받은 사람의 결제완료 금액
};

export function normNick(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, "").trim().toLowerCase();
}

export function computeAlertEffect(args: {
  alerted: AlertedPerson[];
  sentCount: number;
  groups: EffectGroup[];
  visitNicks: Set<string>;
}): AlertEffect {
  const phones = new Set(args.alerted.map((a) => a.phone).filter(Boolean));
  const kakaos = new Set(args.alerted.map((a) => a.kakao).filter(Boolean).map((k) => `k:${k}`));

  let alertedVisited = 0;
  for (const a of args.alerted) {
    if (a.nicks.some((n) => n && args.visitNicks.has(normNick(n)))) alertedVisited++;
  }

  const active = args.groups.filter((g) => !g.canceled && !g.isTest);
  const buyerKey = (g: EffectGroup) => g.who || `p:${g.phone}`;
  const isAlertedGroup = (g: EffectGroup) => (g.phone && phones.has(g.phone)) || (g.who && kakaos.has(g.who));

  const buyers = new Set(active.map(buyerKey));
  const alertedBuyers = new Set(active.filter(isAlertedGroup).map(buyerKey));
  const paid = active.filter((g) => g.paid);
  const alertedPaid = paid.filter(isAlertedGroup);

  return {
    alerted: args.alerted.length,
    cost: Math.round(args.sentCount * ALERT_UNIT_COST_WON),
    siteVisitors: args.visitNicks.size,
    alertedVisited,
    buyers: buyers.size,
    alertedBuyers: alertedBuyers.size,
    alertedPaidBuyers: new Set(alertedPaid.map(buyerKey)).size,
    paidSum: paid.reduce((s, g) => s + g.amount, 0),
    alertedPaidSum: alertedPaid.reduce((s, g) => s + g.amount, 0),
  };
}

// [2026-11-09 19:53 사장님 「알림톡 쏠 때 가입돼 있던 사람인지로 나눠서라도 최대한」]
//   알림 보낸 시각 기준으로 회원을 세 무리로 나눔 → 무리마다 «사이트 들어온 비율»·«주문한 비율» 비교.
//   ①알림 받은 회원 ②알림 보낼 때 이미 회원이었지만 못 받은 사람(알림 끔·차단·제외·인원 제한)
//   ③알림 보낸 뒤 새로 가입한 사람. ①과 ②의 차이가 «알림 효과에 가장 가까운 숫자»(②는 알림을 끈 사람이 섞여 원래 덜 오는 쪽일 수 있음).
export type SegmentPerson = { phone: string; kakao: string; nicks: string[]; joinedAt: number; alerted: boolean };
export type SegmentStat = { people: number; visited: number; buyers: number; paidSum: number };
export type AlertSegments = {
  sendAt: number;
  alerted: SegmentStat;
  notAlerted: SegmentStat;
  joinedAfter: SegmentStat;
  unknownVisitors: number; // 닉네임이 회원과 안 맞는 접속(로그인 전·닉네임 다름)
};

export function computeAlertSegments(args: { people: SegmentPerson[]; sendAt: number; groups: EffectGroup[]; visitNicks: Set<string> }): AlertSegments {
  const active = args.groups.filter((g) => !g.canceled && !g.isTest);
  const blank = (): SegmentStat => ({ people: 0, visited: 0, buyers: 0, paidSum: 0 });
  const seg = { alerted: blank(), notAlerted: blank(), joinedAfter: blank() };
  const knownNicks = new Set<string>();
  for (const p of args.people) {
    const key = p.alerted ? "alerted" : p.joinedAt && p.joinedAt > args.sendAt ? "joinedAfter" : "notAlerted";
    const st = seg[key];
    st.people++;
    const nicks = p.nicks.map(normNick).filter(Boolean);
    nicks.forEach((n) => knownNicks.add(n));
    if (nicks.some((n) => args.visitNicks.has(n))) st.visited++;
    const mine = active.filter((g) => (p.phone && g.phone === p.phone) || (p.kakao && g.who === `k:${p.kakao}`));
    if (mine.length) st.buyers++;
    st.paidSum += mine.filter((g) => g.paid).reduce((s, g) => s + g.amount, 0);
  }
  let unknownVisitors = 0;
  for (const n of args.visitNicks) if (!knownNicks.has(n)) unknownVisitors++;
  return { sendAt: args.sendAt, ...seg, unknownVisitors };
}
