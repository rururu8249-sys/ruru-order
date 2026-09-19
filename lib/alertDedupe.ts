// [2026-09-20 사장님 제보] 「입금 알림음이 두 번 연속 울린다」
//
// 실측한 원인 두 가지 (lib/adminVoice.ts · AdminLiveDashboard.tsx 실제 블록 확인):
//   ① 띵동 파일을 재생하고 **950ms 뒤에 음성 「입금!」을 또** 재생했다 → 사람 귀엔 «두 번».
//      → 음성 덧붙이기를 없앴다. (파일 재생이 실패했을 때만 음성으로 폴백)
//   ② 한 번의 입금이 주문 여러 건을 동시에 확인시키는데(합배송·여러 건 한꺼번에 입금),
//      폴링이 그 사이를 끊어 읽으면 «주문 A → 소리», 잠시 뒤 «주문 B → 소리» 로 두 번 울렸다.
//      주문 id 가 달라서 기존 «같은 건 3초 가드»를 그대로 통과했다.
//      → 종류별 «연달아 울림 금지» 시간을 둔다(입금 4초).
//
// ⚠️ 소리 재생 판단만 한다. 입금 확인·매칭·금액 로직과 무관.

export const ALERT_SAME_KEY_WINDOW_MS = 3000; // 같은 건(같은 id)을 탭 2개가 각각 울리는 것 차단
export const DEPOSIT_KIND_COOLDOWN_MS = 4000; // 한 입금이 여러 주문을 확인시킬 때 연달아 울리는 것 차단

export type AlertGuardInput = {
  now: number;
  /** 같은 id 를 마지막으로 울린 시각(없으면 null) */
  lastSameKeyAt: number | null;
  /** 같은 종류(입금/주문)를 마지막으로 울린 시각(없으면 null) */
  lastKindAt: number | null;
  sameKeyWindowMs?: number;
  /** 0 이면 종류 가드를 쓰지 않는다(주문 알림은 손님마다 따로 울려야 하므로 0) */
  kindCooldownMs?: number;
};

/** 지금 울려도 되는지 판단한다. 시계가 거꾸로 간 기록(미래 값)은 무시한다. */
export function shouldPlayAlert(input: AlertGuardInput): boolean {
  const now = Number(input.now) || 0;
  const sameKeyWindowMs = Math.max(0, Number(input.sameKeyWindowMs ?? ALERT_SAME_KEY_WINDOW_MS) || 0);
  const kindCooldownMs = Math.max(0, Number(input.kindCooldownMs ?? 0) || 0);

  const fresh = (at: number | null, windowMs: number) => {
    if (windowMs <= 0) return false;
    if (at === null || !Number.isFinite(at)) return false;
    const gap = now - at;
    if (gap < 0) return false; // 미래 기록 = 시계 오차 → 막지 않는다
    return gap < windowMs;
  };

  if (fresh(input.lastSameKeyAt, sameKeyWindowMs)) return false;
  if (fresh(input.lastKindAt, kindCooldownMs)) return false;
  return true;
}
