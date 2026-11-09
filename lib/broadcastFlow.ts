// lib/broadcastFlow.ts
// [2026-11-09 사장님 「방송 끝나면 자동 분석표 — 지나가던 사람도 이렇구나 알게 쉽게」] 순수 계산(서버·테스트 공용).
//   «무엇을 보여 줬나» 판정은 사장님이 직접 고른 것만: ①「소개」 누른 상품(그 상품 하나) ②골라서 순환(고른 상품들).
//   전체 순환·아무것도 안 고른 1분은 「확인 안 됨」 — 손님 사이트 행동으로 짐작하지 않는다.
//   결론 문장은 숫자에서 정해진 규칙으로만 만든다(AI·짐작 없음). 돈 계산 무접촉(표시용 합계만).
import { codeOfName, type LiveSample } from "@/lib/liveMetrics";

export type FlowIntro = { at: number; productId: string; productName: string; detailName: string; cleared: boolean };
export type FlowOrder = { at: number; productId: string; productName: string; qty: number; goods: number; paid: boolean; buyer: string };
export type FlowInput = {
  startMs: number;
  endMs: number;
  samples: LiveSample[];
  intros: FlowIntro[];           // 시각 오름차순(시작 전 마지막 1건 포함 가능)
  orders: FlowOrder[];           // 취소·테스트 뺀 주문 줄
  productNames: Record<string, string>; // 상품id → 이름(순환 고른 상품에 세부 이름 없을 때)
};

export type FlowKind = "intro" | "pick" | "unknown";
export type FlowSegment = {
  kind: FlowKind;
  keys: string[];
  label: string;
  from: number;
  to: number;
  minutes: number;
  viewerStart: number | null;
  viewerEnd: number | null;
  viewerMax: number | null;
  viewerAvg: number | null;
  chat: number;
  orders: number;     // 이 구간 주문 줄 수(전체 상품)
  ordersMine: number; // 이 구간 그 상품 주문 개수
  goodsMine: number;  // 이 구간 그 상품 결제완료 상품금액
};
export type FlowProduct = {
  key: string;
  label: string;
  code: string;
  introMinutes: number;
  pickMinutes: number;
  qty: number;          // 방송 전체 주문 개수
  paidGoods: number;    // 방송 전체 결제완료 상품금액
  buyers: number;
  qtyDuring: number;    // 소개·순환 중에 들어온 개수
  chatMentions: number;
  viewerDelta: number | null; // 소개하는 동안 시청자 변화 합
};
export type FlowBin = { from: number; viewerAvg: number | null; viewerMax: number | null; siteAvg: number | null; chat: number; orders: number; paidGoods: number };
export type FlowResult = {
  hasSamples: boolean;
  totalMinutes: number;
  introMinutes: number;
  pickMinutes: number;
  unknownMinutes: number;
  segments: FlowSegment[];
  products: FlowProduct[];
  bins: FlowBin[];
  findings: string[];   // 있었던 일(숫자)
  nextSteps: string[];  // 다음 방송에 해 볼 것(정해진 규칙)
};

const MIN = 60_000;
const norm = (s: string) => String(s || "").replace(/\s+/g, "").toLowerCase();
export const flowKey = (productId: string, detailName: string) => `${productId}|${detailName || ""}`;
const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const hm = (ms: number) => new Date(ms).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" });

function orderMatches(o: FlowOrder, key: string): boolean {
  const [p, d] = key.split("|");
  if (o.productId !== p) return false;
  return d ? norm(o.productName) === norm(d) : true;
}

export function buildBroadcastFlow(input: FlowInput): FlowResult {
  const start = Math.floor(input.startMs / MIN) * MIN;
  const end = Math.max(start + MIN, input.endMs);
  const sampleAt = new Map(input.samples.map((s) => [Date.parse(s.t), s]));
  const hasSamples = input.samples.some((s) => s.v !== null || s.c > 0 || s.r !== null);
  const labelOf = (key: string, fallback?: string) => {
    const [p, d] = key.split("|");
    return d || fallback || input.productNames[p] || "상품";
  };
  const labels = new Map<string, string>();

  // 1) 1분마다 무엇을 보여 줬나
  type Minute = { at: number; kind: FlowKind; keys: string[]; s: LiveSample | undefined };
  const minutes: Minute[] = [];
  let ii = 0;
  let curIntro: FlowIntro | null = null;
  for (let m = start; m < end; m += MIN) {
    while (ii < input.intros.length && input.intros[ii].at < m + MIN) curIntro = input.intros[ii++];
    const s = sampleAt.get(m);
    if (curIntro && !curIntro.cleared && curIntro.productId) {
      const k = flowKey(curIntro.productId, curIntro.detailName);
      labels.set(k, labelOf(k, curIntro.detailName || curIntro.productName));
      minutes.push({ at: m, kind: "intro", keys: [k], s });
    } else if (s?.r && s.r.m === "pick" && s.r.ids.length) {
      const keys = s.r.ids.map((x) => flowKey(x.p, x.d));
      keys.forEach((k) => labels.set(k, labelOf(k)));
      minutes.push({ at: m, kind: "pick", keys, s });
    } else {
      minutes.push({ at: m, kind: "unknown", keys: [], s });
    }
  }

  // 2) 같은 것끼리 이어 붙여 구간으로
  const segs: Array<{ kind: FlowKind; keys: string[]; ms: Minute[] }> = [];
  for (const mi of minutes) {
    const last = segs[segs.length - 1];
    if (last && last.kind === mi.kind && last.keys.join(",") === mi.keys.join(",")) last.ms.push(mi);
    else segs.push({ kind: mi.kind, keys: mi.keys, ms: [mi] });
  }
  const segments: FlowSegment[] = segs.map((g) => {
    const from = g.ms[0].at;
    const to = g.ms[g.ms.length - 1].at + MIN;
    const vs = g.ms.map((x) => x.s?.v).filter((v): v is number => typeof v === "number");
    const inSeg = input.orders.filter((o) => o.at >= from && o.at < to);
    const mine = inSeg.filter((o) => g.keys.some((k) => orderMatches(o, k)));
    const label = g.kind === "unknown" ? "확인 안 됨" : g.keys.map((k) => labels.get(k) || labelOf(k)).join(", ");
    return {
      kind: g.kind, keys: g.keys, label, from, to, minutes: g.ms.length,
      viewerStart: vs.length ? vs[0] : null,
      viewerEnd: vs.length ? vs[vs.length - 1] : null,
      viewerMax: vs.length ? Math.max(...vs) : null,
      viewerAvg: vs.length ? Math.round(vs.reduce((a, b) => a + b, 0) / vs.length) : null,
      chat: g.ms.reduce((a, x) => a + (x.s?.c || 0), 0),
      orders: inSeg.length,
      ordersMine: mine.reduce((a, o) => a + o.qty, 0),
      goodsMine: mine.filter((o) => o.paid).reduce((a, o) => a + o.goods, 0),
    };
  });

  // 3) 상품별 — 소개·순환한 상품 + 팔린 상품
  const keys = new Set<string>(labels.keys());
  for (const o of input.orders) {
    if ([...keys].some((k) => orderMatches(o, k))) continue;
    const k = flowKey(o.productId, o.productName);
    keys.add(k);
    labels.set(k, o.productName || input.productNames[o.productId] || "상품");
  }
  const products: FlowProduct[] = [...keys].map((k) => {
    const label = labels.get(k) || labelOf(k);
    const code = codeOfName(label);
    const mine = input.orders.filter((o) => orderMatches(o, k));
    const own = segments.filter((s) => s.keys.includes(k));
    const introSegs = own.filter((s) => s.kind === "intro");
    const deltas = introSegs.filter((s) => s.viewerStart !== null && s.viewerEnd !== null).map((s) => (s.viewerEnd as number) - (s.viewerStart as number));
    return {
      key: k, label, code,
      introMinutes: introSegs.reduce((a, s) => a + s.minutes, 0),
      pickMinutes: own.filter((s) => s.kind === "pick").reduce((a, s) => a + s.minutes, 0),
      qty: mine.reduce((a, o) => a + o.qty, 0),
      paidGoods: mine.filter((o) => o.paid).reduce((a, o) => a + o.goods, 0),
      buyers: new Set(mine.map((o) => o.buyer)).size,
      qtyDuring: mine.filter((o) => own.some((s) => o.at >= s.from && o.at < s.to)).reduce((a, o) => a + o.qty, 0),
      chatMentions: code ? input.samples.reduce((a, s) => a + (s.k[code] || 0), 0) : 0,
      viewerDelta: deltas.length ? deltas.reduce((a, b) => a + b, 0) : null,
    };
  }).sort((a, b) => b.paidGoods - a.paidGoods || b.qty - a.qty || b.introMinutes - a.introMinutes);

  // 4) 10분 표
  const bins: FlowBin[] = [];
  for (let b = start; b < end; b += 10 * MIN) {
    const ms = minutes.filter((x) => x.at >= b && x.at < b + 10 * MIN);
    const vs = ms.map((x) => x.s?.v).filter((v): v is number => typeof v === "number");
    const ss = ms.map((x) => x.s?.s).filter((v): v is number => typeof v === "number");
    const os = input.orders.filter((o) => o.at >= b && o.at < b + 10 * MIN);
    bins.push({
      from: b,
      viewerAvg: vs.length ? Math.round(vs.reduce((a, c) => a + c, 0) / vs.length) : null,
      viewerMax: vs.length ? Math.max(...vs) : null,
      siteAvg: ss.length ? Math.round(ss.reduce((a, c) => a + c, 0) / ss.length) : null,
      chat: ms.reduce((a, x) => a + (x.s?.c || 0), 0),
      orders: os.length,
      paidGoods: os.filter((o) => o.paid).reduce((a, o) => a + o.goods, 0),
    });
  }

  const totalMinutes = minutes.length;
  const introMinutes = minutes.filter((m) => m.kind === "intro").length;
  const pickMinutes = minutes.filter((m) => m.kind === "pick").length;
  const unknownMinutes = totalMinutes - introMinutes - pickMinutes;

  // 5) 있었던 일(숫자 그대로)
  const findings: string[] = [];
  const nextSteps: string[] = [];
  const sold = products.filter((p) => p.qty > 0);
  const top = sold.slice(0, 3);
  if (top.length) findings.push(`가장 많이 판 상품: ${top.map((p) => `${p.label} ${p.qty}개(${won(p.paidGoods)})`).join(" · ")}`);
  const introducedZero = products.filter((p) => p.introMinutes > 0 && p.qty === 0);
  if (introducedZero.length) findings.push(`소개했는데 한 개도 안 팔린 상품: ${introducedZero.slice(0, 5).map((p) => `${p.label}(${p.introMinutes}분)`).join(" · ")}`);
  const notShownSold = sold.filter((p) => p.introMinutes === 0 && p.pickMinutes === 0);
  if (notShownSold.length) findings.push(`소개·순환 안 했는데 팔린 상품: ${notShownSold.slice(0, 5).map((p) => `${p.label} ${p.qty}개`).join(" · ")}`);
  const busiest = [...bins].sort((a, b) => b.orders - a.orders)[0];
  if (busiest && busiest.orders > 0) {
    const seg = segments.find((s) => busiest.from >= s.from && busiest.from < s.to);
    findings.push(`주문이 가장 몰린 10분: ${hm(busiest.from)}~${hm(busiest.from + 10 * MIN)} · ${busiest.orders}건${seg && seg.kind !== "unknown" ? ` (그때 보여 준 상품: ${seg.label})` : ""}`);
  }
  if (hasSamples) {
    const withV = minutes.filter((m) => typeof m.s?.v === "number");
    if (withV.length) {
      const peak = withV.reduce((a, b) => ((b.s!.v as number) > (a.s!.v as number) ? b : a));
      const seg = segments.find((s) => peak.at >= s.from && peak.at < s.to);
      const after = Math.round((peak.at - start) / MIN);
      findings.push(`시청자가 가장 많았던 때: ${hm(peak.at)} · ${peak.s!.v}명 (방송 시작 ${after}분 뒤${seg && seg.kind !== "unknown" ? ` · 그때 보여 준 상품: ${seg.label}` : ""})`);
      const drops = segments.filter((s) => s.kind !== "unknown" && s.minutes >= 3 && s.viewerStart !== null && s.viewerEnd !== null).sort((a, b) => ((a.viewerEnd! - a.viewerStart!) - (b.viewerEnd! - b.viewerStart!)));
      const worst = drops[0];
      if (worst && worst.viewerEnd! < worst.viewerStart!) findings.push(`시청자가 가장 많이 빠진 상품 구간: ${worst.label} (${hm(worst.from)}~${hm(worst.to)} · ${worst.viewerStart}명 → ${worst.viewerEnd}명)`);
      const best = drops[drops.length - 1];
      if (best && best.viewerEnd! > best.viewerStart!) findings.push(`시청자가 가장 많이 늘어난 상품 구간: ${best.label} (${hm(best.from)}~${hm(best.to)} · ${best.viewerStart}명 → ${best.viewerEnd}명)`);
      if (after > 0) nextSteps.push(`시청자는 방송 시작 ${after}분 뒤에 가장 많았어요. 다음 방송은 제일 자신 있는 상품을 그 시간대에 보여 주세요.`);
    }
    const chatTop = products.filter((p) => p.chatMentions > 0).sort((a, b) => b.chatMentions - a.chatMentions).slice(0, 3);
    if (chatTop.length) findings.push(`채팅에 가장 많이 나온 상품번호: ${chatTop.map((p) => `${p.code} ${p.chatMentions}번`).join(" · ")}`);
  }
  findings.push(`보여 준 상품이 확인된 시간: 소개 ${introMinutes}분 · 고른 상품 순환 ${pickMinutes}분 · 확인 안 됨 ${unknownMinutes}분 (전체 ${totalMinutes}분)`);

  // 6) 다음 방송에 해 볼 것(정해진 규칙만)
  if (top.length) nextSteps.unshift(`잘 팔린 ${top.map((p) => p.label).join(", ")}은(는) 다음 방송 앞쪽에 다시 보여 주세요.`);
  if (introducedZero.length) nextSteps.push(`소개했는데 안 팔린 ${introducedZero.slice(0, 3).map((p) => p.label).join(", ")}은(는) 순서를 뒤로 미루거나 빼 보세요.`);
  if (notShownSold.length) nextSteps.push(`소개 안 했는데 팔린 ${notShownSold.slice(0, 3).map((p) => p.label).join(", ")}은(는) 다음엔 「소개」를 눌러 화면에 띄워 보세요.`);
  if (totalMinutes > 0 && unknownMinutes / totalMinutes > 0.5) nextSteps.push(`방송의 ${Math.round((unknownMinutes / totalMinutes) * 100)}%가 「확인 안 됨」이에요. 상품을 보여 줄 때 「소개」를 누르거나 순환할 상품을 고르면 다음 분석이 정확해져요.`);
  if (!hasSamples) nextSteps.push("이 방송은 1분 기록(유튜브 시청자·채팅)이 없던 때라 「소개」와 주문만으로 만든 표예요. 다음 방송부터는 시청자·채팅도 같이 나와요.");

  return { hasSamples, totalMinutes, introMinutes, pickMinutes, unknownMinutes, segments, products, bins, findings, nextSteps };
}
