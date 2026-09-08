"use client";

// components/admin-live/MissionPayoutButton.tsx
// [2026-09-08 4단계-B] 방송 종료 요약창의 「구매자 전원 지급」 버튼.
//   흐름은 이벤트 › 미션 탭의 지급과 동일: payout_preview(대상 확인) → 확인창 → payout_confirm(서버 가드) → 기존 일괄지급 훅.
//   중복지급 차단은 서버(customer_point_ledger 의 MISSION_PAYOUT_MEMO 기준)가 한다. 여기서 새 돈 로직은 없다.

import { useState } from "react";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";
import { MISSION_PAYOUT_MEMO } from "@/lib/mission";
import { useBulkPointGrant } from "./useBulkPointGrant";

type Props = {
  reward: number;
  onDone?: () => void;
};

type Preview = {
  ok?: boolean;
  message?: string;
  count?: number;
  reward?: number;
  total?: number;
  alreadyPaidCount?: number;
  totalBuyers?: number;
  buyers?: Array<{ phone: string; nickname?: string }>;
};

export default function MissionPayoutButton({ reward, onDone }: Props) {
  const { running, grant } = useBulkPointGrant();
  const [busy, setBusy] = useState(false);
  const [doneText, setDoneText] = useState("");

  const run = async () => {
    if (busy || running) return;
    setBusy(true);
    try {
      const preRes = await fetch("/api/admin-live/mission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "payout_preview", allowDup: false }),
      });
      const pre = (await preRes.json().catch(() => null)) as Preview | null;
      if (!preRes.ok || !pre?.ok) {
        showAdminToast("지급 대상 확인 실패\n\n" + (pre?.message || `HTTP ${preRes.status}`), "error");
        return;
      }
      const count = Number(pre.count || 0);
      const already = Number(pre.alreadyPaidCount || 0);
      if (count <= 0) {
        showAdminToast(already > 0 ? `이미 구매자 전원(${already}명)에게 지급됐어요.` : "지급 대상(결제완료 구매자)이 없어요.", already > 0 ? "info" : "warning");
        return;
      }
      const ok = await showAdminConfirm(
        `결제완료 구매자 ${count}명에게 ${Number(pre.reward || reward).toLocaleString("ko-KR")}P씩, 총 ${Number(pre.total || 0).toLocaleString("ko-KR")}P를 지급합니다.` +
          (already > 0 ? `\n(이미 받은 ${already}명은 자동 제외)` : "") +
          "\n\n되돌리려면 한 명씩 회수해야 합니다. 진행할까요?",
        { title: "미션 달성 — 구매자 전원 지급", confirmText: `${count}명에게 지급`, cancelText: "취소", tone: "warning" },
      );
      if (!ok) return;

      const cfRes = await fetch("/api/admin-live/mission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "payout_confirm", allowDup: false }),
      });
      const cf = (await cfRes.json().catch(() => null)) as (Preview & { title?: string }) | null;
      if (!cfRes.ok || !cf?.ok) {
        showAdminToast("지급 시작 실패\n\n" + (cf?.message || `HTTP ${cfRes.status}`), "error");
        return;
      }
      const targets = (cf.buyers || []).map((b) => ({ phone: b.phone, label: b.nickname || b.phone }));
      const r = await grant(targets, {
        amount: Number(cf.reward || reward),
        reason: cf.title || "미션 목표 달성 - 구매자 전원 지급",
        adminMemo: MISSION_PAYOUT_MEMO,
        customerVisible: true,
      });
      const text = `✅ ${r.success}명 지급 완료` + (r.failed.length ? ` · ❌ ${r.failed.length}명 실패(${r.failed[0]?.reason || ""})` : "");
      setDoneText(text);
      showAdminToast(text, r.failed.length ? "warning" : "success");
      onDone?.();
    } catch (error) {
      showAdminToast("지급 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setBusy(false);
    }
  };

  if (doneText) {
    return <div className="text-sm font-black text-ok-tx">{doneText} · 자세한 기록은 이벤트 › 미션 탭</div>;
  }

  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={busy || running}
      className="rounded-2xl bg-ok-tx px-4 py-3 text-sm font-black text-white shadow-sm transition hover:opacity-90 disabled:cursor-wait disabled:opacity-50"
    >
      {busy || running ? "지급 중..." : `🎁 구매자 전원에게 ${Number(reward).toLocaleString("ko-KR")}P 지급하기`}
    </button>
  );
}
