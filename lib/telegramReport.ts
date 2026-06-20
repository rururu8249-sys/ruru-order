import { computeLiveSummary, kstDateTimeLabel, type LiveSummary } from "@/lib/liveSummary";

// 텔레그램 "방송 결산" 리포트 텍스트 생성(읽기 전용).
//   계산은 lib/liveSummary.computeLiveSummary 단일 출처 사용(주문 그룹 단위 집계 + 상품/구매자 랭킹).
//   범위 = "현재(가장 최근) 방송" 시간창[방송 시작~지금], 방송 없으면 오늘. 돈/입금 로직은 읽기만, 변경 없음.

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

// 오늘(KST) 날짜 라벨 "MM.DD(요일)" — 날짜별 줄에서 '오늘' 표시용. liveSummary 의 dayRows.label 과 같은 형식.
function todayKstShort(): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const wd = ["일", "월", "화", "수", "목", "금", "토"][kst.getUTCDay()];
  return `${String(kst.getUTCMonth() + 1).padStart(2, "0")}.${String(kst.getUTCDate()).padStart(2, "0")}(${wd})`;
}

// 초보자도 보자마자 이해되게: 날짜별로 쪼개 보여주고(오늘 표시) + 방송 누적/받을돈/랭킹/할일/월누적.
//   방송을 종료 안 하면 여러 날이 한 방송으로 합쳐지므로, 날짜별 줄로 '구분'해서 보여줌.
function formatReport(s: LiveSummary): string {
  // 헤더: 제목 + 방송 날짜(시작~현재/종료) 같이 표시
  const titleLine = `📊 <b>루루동이 결산</b> · ${s.title}`;
  const when =
    s.scope === "broadcast"
      ? s.live
        ? `🔴 방송중 · ${kstDateTimeLabel(s.startedAt)} ~ 지금`
        : `⏹ 방송종료 · ${kstDateTimeLabel(s.startedAt)} ~ ${kstDateTimeLabel(s.endedAt)}`
      : `📅 오늘 (00:00~24:00)`;

  const unpaidTotal = s.unpaidBankSum + s.unpaidCardSum;
  const unpaidCnt = s.unpaidBankCount + s.unpaidCardCount;
  const multiDay = s.dayRows.length >= 2; // 방송이 날을 넘겨 여러 날 합쳐진 경우
  const cumTag = multiDay ? " (방송 누적)" : "";

  const L: string[] = [];

  // 헤더
  L.push(titleLine, when, `━━━━━━━━━━━━`);

  // 1) 날짜별 매출 — 여러 날이면 날짜로 '구분'해서, 오늘은 ←오늘 표시
  if (multiDay) {
    const today = todayKstShort();
    L.push(`📆 <b>날짜별 매출</b>`);
    for (const d of s.dayRows) {
      const mark = d.label === today ? "  ← 오늘" : "";
      L.push(`• ${d.label}  ${won(d.sum)} (${d.cnt}건)${mark}`);
    }
    L.push(``);
  }

  // 2) 번 돈(누적)
  L.push(`💰 <b>번 돈${cumTag}</b>`, `${won(s.paidSum)}  ·  결제완료 ${s.paidCount}건`, ``);

  // 3) 받을 돈(아직 안 들어온 것) — 가장 챙겨야 할 항목
  if (unpaidCnt > 0) {
    L.push(`⏳ <b>받을 돈</b>  ${won(unpaidTotal)} (${unpaidCnt}건)`);
    if (s.unpaidBankCount > 0) L.push(`• 무통장 미입금 ${s.unpaidBankCount}건 · ${won(s.unpaidBankSum)}`);
    if (s.unpaidCardCount > 0) L.push(`• 카드 미결제 ${s.unpaidCardCount}건 · ${won(s.unpaidCardSum)}`);
    L.push(``);
  } else {
    L.push(`⏳ <b>받을 돈</b>  없음 ✅`, ``);
  }

  // 4) 잘나간 상품 TOP3
  if (s.productRanking.length > 0) {
    L.push(`🏆 <b>잘나간 상품${cumTag}</b>`);
    s.productRanking.slice(0, 3).forEach((p, i) => {
      const name = p.name.length > 16 ? p.name.slice(0, 16) + "…" : p.name;
      L.push(`${i + 1}. ${name}  ${p.qty}개`);
    });
    L.push(``);
  }

  // 5) 큰손 TOP3
  if (s.buyerRanking.length > 0) {
    L.push(`🧑 <b>큰손 손님${cumTag}</b>`);
    s.buyerRanking.slice(0, 3).forEach((b, i) => {
      const name = b.name.length > 12 ? b.name.slice(0, 12) + "…" : b.name;
      L.push(`${i + 1}. ${name}  ${won(b.sum)}`);
    });
    L.push(``);
  }

  // 6) 할 일(고객이슈)
  L.push(`📌 <b>처리할 고객이슈</b>  ${s.issues.length}건`);

  // 7) 월 누적
  L.push(`━━━━━━━━━━━━`, `🗓 <b>${s.monthLabel} 누적 매출</b>  ${won(s.monthSum)}`);

  return L.join("\n");
}

export async function buildTodayReport(): Promise<string> {
  const s = await computeLiveSummary("broadcast"); // 방송 있으면 방송 기준, 없으면 오늘
  return formatReport(s);
}
