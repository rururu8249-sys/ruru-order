import { computeLiveSummary, kstDateTimeLabel, type LiveSummary } from "@/lib/liveSummary";

// 텔레그램 "방송 결산" 리포트 텍스트 생성(읽기 전용).
//   계산은 lib/liveSummary.computeLiveSummary 단일 출처 사용(주문 그룹 단위 집계 + 상품/구매자 랭킹).
//   범위 = "현재(가장 최근) 방송" 시간창[방송 시작~지금], 방송 없으면 오늘. 돈/입금 로직은 읽기만, 변경 없음.

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

// [2026-08-31 사장님 지시] 방송중 「중간보고」 — 화려하지 않게, 딱 필요한 것만:
//   방송명·시작~지금 / 매출 / 미입금 / 잘나간 상품 TOP3 / 큰손 TOP3. (날짜별·고객이슈·월누적 없음)
function formatLiveBrief(s: LiveSummary): string {
  const unpaidTotal = s.unpaidBankSum + s.unpaidCardSum;
  const unpaidCnt = s.unpaidBankCount + s.unpaidCardCount;
  const L: string[] = [];
  L.push(`📊 <b>중간보고</b> · ${s.title}`);
  L.push(`🔴 ${kstDateTimeLabel(s.startedAt)} ~ 지금`);
  L.push(`━━━━━━━━━━━━`);
  L.push(`💰 매출  <b>${won(s.paidSum)}</b> · ${s.paidCount}건`);
  L.push(unpaidCnt > 0
    ? `⏳ 미입금  ${won(unpaidTotal)} · ${unpaidCnt}건 (무통장 ${s.unpaidBankCount} · 카드 ${s.unpaidCardCount})`
    : `⏳ 미입금  없음 ✅`);
  if (s.productRanking.length > 0) {
    L.push(``, `🏆 <b>잘나간 상품</b>`);
    s.productRanking.slice(0, 3).forEach((p, i) => {
      const name = p.name.length > 16 ? p.name.slice(0, 16) + "…" : p.name;
      L.push(`${i + 1}. ${name}  ${p.qty}개`);
    });
  }
  if (s.buyerRanking.length > 0) {
    L.push(``, `🧑 <b>큰손</b>`);
    s.buyerRanking.slice(0, 3).forEach((b, i) => {
      const name = b.name.length > 12 ? b.name.slice(0, 12) + "…" : b.name;
      L.push(`${i + 1}. ${name}  ${won(b.sum)}`);
    });
  }
  return L.join("\n");
}

// [2026-08-31 사장님 지시] 결산도 중간보고와 같은 심플 포맷 — "너무 복잡해" 피드백.
//   날짜별 매출 표·고객이슈 줄 제거. 매출/미입금/TOP3/큰손 + 월누적 한 줄만.
function formatReport(s: LiveSummary): string {
  // 방송중이면 심플 중간보고
  if (s.scope === "broadcast" && s.live) return formatLiveBrief(s);

  const when =
    s.scope === "broadcast"
      ? `⏹ 방송종료 · ${kstDateTimeLabel(s.startedAt)} ~ ${kstDateTimeLabel(s.endedAt)}`
      : `📅 오늘 (00:00~24:00)`;
  const unpaidTotal = s.unpaidBankSum + s.unpaidCardSum;
  const unpaidCnt = s.unpaidBankCount + s.unpaidCardCount;

  const L: string[] = [];
  L.push(`📊 <b>결산</b> · ${s.title}`);
  L.push(when);
  L.push(`━━━━━━━━━━━━`);
  L.push(`💰 매출  <b>${won(s.paidSum)}</b> · ${s.paidCount}건`);
  L.push(unpaidCnt > 0
    ? `⏳ 미입금  ${won(unpaidTotal)} · ${unpaidCnt}건 (무통장 ${s.unpaidBankCount} · 카드 ${s.unpaidCardCount})`
    : `⏳ 미입금  없음 ✅`);
  if (s.productRanking.length > 0) {
    L.push(``, `🏆 <b>잘나간 상품</b>`);
    s.productRanking.slice(0, 3).forEach((p, i) => {
      const name = p.name.length > 16 ? p.name.slice(0, 16) + "…" : p.name;
      L.push(`${i + 1}. ${name}  ${p.qty}개`);
    });
  }
  if (s.buyerRanking.length > 0) {
    L.push(``, `🧑 <b>큰손</b>`);
    s.buyerRanking.slice(0, 3).forEach((b, i) => {
      const name = b.name.length > 12 ? b.name.slice(0, 12) + "…" : b.name;
      L.push(`${i + 1}. ${name}  ${won(b.sum)}`);
    });
  }
  L.push(``, `🗓 ${s.monthLabel} 누적  ${won(s.monthSum)}`);
  return L.join("\n");
}

export async function buildTodayReport(): Promise<string> {
  const s = await computeLiveSummary("broadcast"); // 방송 있으면 방송 기준, 없으면 오늘
  return formatReport(s);
}
