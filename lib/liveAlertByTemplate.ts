// lib/liveAlertByTemplate.ts
// [2026-11-09 사장님 「1번 알림톡이 사이트 접속이 더 많은 것 같다 — 통계 확인 가능해?」]
//   알림톡 «종류(템플릿)»별로: 보낸 뒤 30분 안에 받은 사람이 사이트에 새로 들어왔는지(닉네임 기준).
//   순수 함수만(서버·테스트 공용). 읽기 전용 집계 — 돈·주문 무관.
import { normNick } from "@/lib/liveAlertEffect";

export const ALERT_VISIT_WINDOW_MS = 30 * 60_000;

export type AlertSend = { key: string; templateId: string; templateName: string; title: string; sentAt: number; people: number; visited: number; siteBefore: number; siteAfter: number };
export type TemplateSummary = { templateId: string; templateName: string; sends: number; people: number; visited: number; rate: number; firstAt: number; lastAt: number };

/** 받은 사람(전화) → 닉네임들, 그 창(보낸 뒤 30분)에 «새로 시작한» 접속 닉네임 → 몇 명 들어왔나 */
export function countVisitedRecipients(recipientNicks: string[][], visitNicks: Iterable<string>): number {
  const seen = new Set<string>();
  for (const v of visitNicks) { const n = normNick(v); if (n) seen.add(n); }
  let hit = 0;
  for (const nicks of recipientNicks) if (nicks.some((n) => seen.has(normNick(n)))) hit++;
  return hit;
}

export function summarizeByTemplate(sends: AlertSend[]): TemplateSummary[] {
  const map = new Map<string, TemplateSummary>();
  for (const s of sends) {
    if (s.people <= 0) continue;
    const cur = map.get(s.templateId) || { templateId: s.templateId, templateName: s.templateName, sends: 0, people: 0, visited: 0, rate: 0, firstAt: s.sentAt, lastAt: s.sentAt };
    cur.sends++; cur.people += s.people; cur.visited += s.visited;
    cur.firstAt = Math.min(cur.firstAt, s.sentAt); cur.lastAt = Math.max(cur.lastAt, s.sentAt);
    map.set(s.templateId, cur);
  }
  return [...map.values()].map((t) => ({ ...t, rate: t.people ? Math.round((t.visited / t.people) * 1000) / 10 : 0 })).sort((a, b) => b.lastAt - a.lastAt);
}
