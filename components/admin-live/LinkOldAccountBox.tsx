"use client";

// [2026-11-26] 회원 상세 «예전 계정 합치기» — 손님이 «카톡 바꿨어요» 할 때만 쓴다.
//   예전 전화번호 → 요청 줄 생성(돈 무접촉) → runLinkMerge(미리보기 → 승인 → 한 번에 처리).
import { useState } from "react";
import { showAdminToast } from "@/lib/adminToast";
import { runLinkMerge } from "./AdminLiveLinkRequestsPanel";

export default function LinkOldAccountBox({ kakaoId, label, onMerged }: { kakaoId: string; label: string; onMerged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  if (!kakaoId) return null;

  const start = async () => {
    const digits = phone.replace(/[^0-9]/g, "");
    if (digits.length < 9) { showAdminToast("예전 전화번호를 적어 주세요.", "warning"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/admin-live/customer-link-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", newKakaoId: kakaoId, oldPhone: digits }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        const why = String(json?.reason || "");
        showAdminToast(why === "old_not_found" ? "그 번호로 가입한 예전 계정이 없어요." : why === "same_row" ? "이미 같은 계정이에요." : "예전 계정을 못 찾았어요.", "warning");
        return;
      }
      const merged = await runLinkMerge(String(json.id), label);
      if (merged) { setOpen(false); setPhone(""); onMerged?.(); }
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="min-h-11 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-2 sm:min-h-9">
        예전 계정 합치기
      </button>
    );
  }
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        inputMode="numeric"
        placeholder="예전 계정 전화번호"
        className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ink sm:h-9 sm:text-sm"
      />
      <button type="button" disabled={busy} onClick={() => void start()}
        className="min-h-11 rounded-lg bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50 sm:min-h-9">
        {busy ? "확인 중…" : "찾아서 합치기"}
      </button>
      <button type="button" onClick={() => { setOpen(false); setPhone(""); }}
        className="min-h-11 rounded-lg border border-line px-3 text-sm font-semibold text-ink-soft sm:min-h-9">
        닫기
      </button>
    </div>
  );
}
