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
    opts: { amount: number; reason: string; adminMemo: string; customerVisible: boolean }
  ): Promise<BulkGrantResult> => {
    const failed: { label: string; reason: string }[] = [];
    let success = 0;

    setRunning(true);
    try {
      for (const t of targets) {
        try {
          const res = await fetch("/api/admin-live/customer-points", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phone: t.phone,
              action: "grant",
              amount: opts.amount,
              reason: opts.reason,
              admin_memo: opts.adminMemo,
              customer_visible: opts.customerVisible,
              youtube_nickname: t.label, // 지급 명단에 닉네임 남기기(표시용, 돈 로직 무관)
            }),
          });
          const json = await res.json().catch(() => ({} as any));
          if (res.ok && json?.ok) success += 1;
          else failed.push({ label: t.label, reason: String(json?.message || `오류(HTTP ${res.status})`) });
        } catch (e: any) {
          failed.push({ label: t.label, reason: String(e?.message || e) });
        }
      }
    } finally {
      setRunning(false);
    }

    return { total: targets.length, success, failed };
  };

  return { running, grant };
}
