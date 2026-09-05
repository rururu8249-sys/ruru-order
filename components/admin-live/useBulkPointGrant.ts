"use client";

// 목적: 선택한 여러 고객에게 같은 금액의 포인트를 "일괄 지급".
//   - 새 돈 로직 0. 기존 단건 API(/api/admin-live/customer-points, action:"grant")를
//     선택 고객마다 순차 호출하고 성공/실패만 집계한다.
//   - 회수(subtract)는 위험하므로 일괄에서 제외 — 지급(grant)만.

import { useState } from "react";

export type BulkGrantTarget = { phone: string; label: string };

export type BulkGrantResult = {
  total: number;
  success: number;
  failed: { label: string; reason: string }[];
};

export function useBulkPointGrant() {
  const [running, setRunning] = useState(false);

  const grant = async (
    targets: BulkGrantTarget[],
    opts: {
      amount: number;
      reason: string;
      adminMemo: string;
      customerVisible: boolean;
      // [2026-09-06] 건별 고유키 생성기 — 서버가 같은 키면 다시 지급하지 않는다(응답 유실 후 재시도 이중 안전).
      sourceKey?: (t: BulkGrantTarget) => string;
      // [2026-09-06] 진행 표시용 — 몇 명째 끝났는지 화면에 보여준다.
      onProgress?: (done: number, total: number) => void;
      // [2026-09-06] 한 건 응답이 이만큼 안 오면 포기하고 다음으로 넘어간다(화면이 영영 안 멈추게).
      perRequestTimeoutMs?: number;
    }
  ): Promise<BulkGrantResult> => {
    const failed: { label: string; reason: string }[] = [];
    let success = 0;
    const timeoutMs = opts.perRequestTimeoutMs ?? 25000;

    setRunning(true);
    try {
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch("/api/admin-live/customer-points", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              phone: t.phone,
              action: "grant",
              amount: opts.amount,
              reason: opts.reason,
              admin_memo: opts.adminMemo,
              customer_visible: opts.customerVisible,
              youtube_nickname: t.label, // 지급 명단에 닉네임 남기기(표시용, 돈 로직 무관)
              // 서버 중복지급 차단 키 — 같은 키면 두 번째부터 지급 안 함(duplicate 응답)
              ...(opts.sourceKey ? { source_key: opts.sourceKey(t) } : {}),
            }),
          });
          const json = await res.json().catch(() => ({} as any));
          if (res.ok && json?.ok) success += 1;
          else failed.push({ label: t.label, reason: String(json?.message || `오류(HTTP ${res.status})`) });
        } catch (e: any) {
          // 시간초과(abort)·네트워크 끊김: 서버엔 지급됐을 수 있으나 응답을 못 받음.
          //   source_key 가 있으면 재시도해도 중복지급 안 되므로, 여기서는 실패로만 집계하고 계속 진행한다.
          const aborted = e?.name === "AbortError";
          failed.push({ label: t.label, reason: aborted ? "응답 지연(넘어감) — source_key로 재발송 시 중복 안 됨" : String(e?.message || e) });
        } finally {
          clearTimeout(timer);
        }
        opts.onProgress?.(i + 1, targets.length);
      }
    } finally {
      setRunning(false);
    }

    return { total: targets.length, success, failed };
  };

  return { running, grant };
}
