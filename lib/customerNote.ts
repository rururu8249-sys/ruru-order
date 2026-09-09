// lib/customerNote.ts
// [2026-08-30] 쪽지 발송의 "판단 규칙"만 따로 뺀 것 (DB 를 쓰지 않는다 → 자동 검사 가능).
//
// 막으려는 사고
//   · 사장님이 「쪽지 보내기」를 두 번 누르면 손님 팝업이 두 번 떴다.
//     담긴현황 알림엔 2분 방어가 있는데 쪽지엔 없었다.
//   · 여러 명에게 보낼 때 같은 사람이 목록에 두 번 들어 있으면 두 번 갔다.

import { phoneDigits } from "./customerPhoneChange";

export type NoteTarget = { phone?: unknown; sessionKey?: unknown };
export type CleanTarget = { phone: string; sessionKey: string };

export const cleanNotePhone = (v: unknown) => {
  const d = phoneDigits(v);
  return d.length >= 9 && d.length <= 11 ? d : "";
};
export const cleanNoteSessionKey = (v: unknown) => {
  const t = String(v ?? "").trim();
  return t.length >= 6 && t.length <= 80 ? t : "";
};
export const cleanNoteText = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/** 보관 시간 — 1~72시간. 값이 이상하면 12시간. */
// [2026-09-09 사장님 지적] 「포인트 넣어드렸어요」 쪽지가 12시간 뒤 사라져 손님이 영영 못 봤다.
//   실측: AdminLiveLoyaltyReport 가 hours 를 안 보내 noteHours(undefined) → 12시간.
//   포인트는 이미 «줬는데» 알림만 사라지니, 손님은 받은 줄도 모른다(2026-09-06 발송분 154명).
//   → 돈이 오간 쪽지는 «손님이 볼 때까지» 남아야 한다. 만료 칸이 NOT NULL 이라 지울 수는 없으므로
//     아주 먼 날짜를 넣어 사실상 무제한으로 만든다. (DB 구조 변경 없음 — 기존 데이터 보호)
export const NOTE_UNLIMITED_YEARS = 10;

/** 이 쪽지가 언제까지 손님 화면에 뜨는가. unlimited 면 10년 뒤(사실상 무제한). */
export function noteExpiresAt(nowMs: number, hours: number, unlimited: boolean): string {
  if (unlimited) return new Date(nowMs + NOTE_UNLIMITED_YEARS * 365 * 24 * 60 * 60 * 1000).toISOString();
  return new Date(nowMs + hours * 60 * 60 * 1000).toISOString();
}

/** 무제한으로 보낸 쪽지인가 (만료가 1년 이상 남았으면 무제한으로 본다) */
export function isUnlimitedNote(expiresAt: unknown): boolean {
  const t = new Date(String(expiresAt ?? "")).getTime();
  if (!Number.isFinite(t)) return false;
  return t - Date.now() > 365 * 24 * 60 * 60 * 1000;
}

export function noteHours(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n <= 0) return 12;
  return Math.min(72, Math.max(1, n));
}

/**
 * 받는 사람 목록 정리.
 * - 전화번호도 세션키도 없는 줄은 버린다(보낼 곳이 없다).
 * - 같은 사람이 두 번 들어 있으면 한 번만 남긴다(전화번호 → 세션키 순으로 같은 사람 판정).
 */
export function normalizeTargets(list: unknown): CleanTarget[] {
  const arr = Array.isArray(list) ? list : [];
  const out: CleanTarget[] = [];
  const seen = new Set<string>();
  for (const raw of arr) {
    const t = (raw ?? {}) as NoteTarget;
    const phone = cleanNotePhone(t.phone);
    const sessionKey = cleanNoteSessionKey(t.sessionKey);
    if (!phone && !sessionKey) continue;
    const id = phone ? `p:${phone}` : `s:${sessionKey}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ phone, sessionKey });
  }
  return out;
}

/** 전화번호가 없으면 세션키로, 세션키도 없으면 `phone:번호` 로 — 기존 저장 방식 그대로. */
export function targetSessionKeyOf(t: CleanTarget): string {
  return t.sessionKey || `phone:${t.phone}`;
}

/**
 * 같은 쪽지를 두 번 넣지 못하게 하는 열쇠값.
 * 「누구에게 + 무슨 내용 + 몇 분 구간」 이 같으면 같은 열쇠가 나온다.
 * 기본 10분 — 방송 중 실수로 연타해도 한 번만 간다. 10분 뒤 같은 내용을 또 보내는 건 의도한 재발송으로 본다.
 */
export function buildNoteSourceKey(
  t: CleanTarget,
  message: string,
  nowMs: number,
  windowMinutes = 10,
): string {
  const who = t.phone ? `p${t.phone}` : `s${t.sessionKey}`;
  const bucket = Math.floor(nowMs / (windowMinutes * 60 * 1000));
  // 내용은 그대로 넣지 않고 짧은 지문으로 — 열쇠값이 길어지면 인덱스가 무거워진다.
  return `note:${who}:${bucket}:${fingerprint(message)}`;
}

/** 문자열 지문(32비트) — 보안용이 아니라 "같은 글인지"만 본다. */
export function fingerprint(s: string): string {
  let h = 2166136261;
  const t = String(s ?? "").trim();
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
