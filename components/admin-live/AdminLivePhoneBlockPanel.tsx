"use client";

// components/admin-live/AdminLivePhoneBlockPanel.tsx
// 목적: 고객관리에서 전화번호만 입력해 기존 고객 차단/차단해제
// 주의: 브라우저 alert/confirm/prompt 사용 금지. 주문/입금/배송/정산 로직 없음.

import { useState } from "react";
import { formatKoreanPhone } from "@/lib/order/phone";
import { showAdminToast } from "@/lib/adminToast";
import { showAdminConfirm } from "@/lib/adminConfirm";

type BlockResult = {
  phone: string;
  blocked: boolean;
  reason: string;
  matchedCount?: number;
  directBlockSaved?: boolean;
};

type Props = {
  onSaved: (result: BlockResult) => void;
};

function digitsOnly(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function formatPhone(value: unknown) {
  const digits = digitsOnly(value);

  if (digits) return formatKoreanPhone(digits);   // [2026-08-30] 표기 통일 (02-6490-6376)

  return String(value ?? "").trim();
}

export default function AdminLivePhoneBlockPanel({ onSaved }: Props) {
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const submit = async (blocked: boolean) => {
    const phoneDigits = digitsOnly(phone);
    const finalReason = blocked ? reason.trim() : "";

    setErrorMessage("");

    if (phoneDigits.length < 9 || phoneDigits.length > 11) {
      setErrorMessage("전화번호는 숫자 기준 9~11자리로 입력해주세요.");
      return;
    }

    if (blocked && !finalReason) {
      setErrorMessage("차단사유를 입력해주세요.");
      return;
    }

    // [2026-09-08 전수감사 수정] 예전엔 «차단해제만» 확인창이었다(차단은 사유 입력이 확인 역할이라고 봤다).
    //   그런데 차단은 번호를 «직접 타이핑»해서 넣는다 → 한 자리만 틀려도 엉뚱한 손님이 즉시
    //   주문서를 못 쓰게 되고, 그 손님은 아무 안내도 못 받는다. 사유 입력은 오타를 못 막는다.
    //   → 차단도 «번호를 다시 보여주는» 확인창을 거친다.
    if (blocked) {
      const ok = await showAdminConfirm(
        [
          `${formatPhone(phoneDigits)} 번호를 차단할까요?`,
          "",
          "· 이 번호로는 주문서를 쓸 수 없게 됩니다.",
          "· 손님에게는 따로 안내가 가지 않습니다.",
          "· 번호가 맞는지 한 번만 더 봐주세요.",
        ].join("\n"),
        { title: "전화번호 차단", confirmText: "차단", cancelText: "취소", tone: "danger" },
      );
      if (!ok) return;
    } else {
      const ok = await showAdminConfirm(
        `${formatPhone(phoneDigits)} 번호의 차단을 해제합니다.\n해제 즉시 이 번호로 주문서 작성이 다시 가능해집니다.`,
        { title: "차단 해제", confirmText: "차단 해제", cancelText: "취소", tone: "warning" },
      );
      if (!ok) return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/admin-live/customer-block", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone: phoneDigits,
          blocked,
          reason: finalReason,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || "전화번호 차단 처리 실패");
      }

      onSaved({
        phone: phoneDigits,
        blocked,
        reason: finalReason,
        matchedCount: Number(payload.matchedCount || 0),
        directBlockSaved: Boolean(payload.directBlockSaved),
      });

      showAdminToast(
        `${formatPhone(phoneDigits)} · ${blocked ? "차단" : "차단해제"} 완료 · ${
          Number(payload.matchedCount || 0) > 0
            ? `${Number(payload.matchedCount || 0).toLocaleString("ko-KR")}명 반영`
            : "전화번호 전용 차단 저장"
        }`,
        "success",
      );

      if (!blocked) setReason("");
    } catch (error) {
      showAdminToast(error instanceof Error ? error.message : "전화번호 차단 처리 실패", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-danger-tx bg-danger-bg p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-black tracking-[0.16em] text-danger-tx">PHONE BLOCK</div>
          <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-ink">전화번호 직접 차단</h2>
          <p className="mt-1 text-[12px] font-bold text-danger-tx">
            주문 이력이 없는 번호도 전화번호 전용 차단으로 저장합니다.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="01012345678"
          inputMode="numeric"
          className="h-11 w-full min-w-0 rounded-xl border border-danger-tx bg-surface px-3 text-[13px] font-black text-ink outline-none focus:border-danger-tx/35 focus:ring-4 focus:ring-[var(--color-danger-tx)]/25 sm:w-44"
        />

        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="차단사유 입력"
          className="h-11 min-w-[150px] flex-1 rounded-xl border border-danger-tx bg-surface px-3 text-[13px] font-bold text-ink outline-none focus:border-danger-tx/35 focus:ring-4 focus:ring-[var(--color-danger-tx)]/25"
        />

        <button
          type="button"
          disabled={saving}
          onClick={() => submit(true)}
          className="h-11 shrink-0 rounded-xl bg-[var(--color-danger-tx)] px-4 text-[13px] font-black text-white hover:bg-[var(--color-danger-tx)] disabled:cursor-not-allowed disabled:bg-danger-bg"
        >
          차단
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={() => submit(false)}
          className="h-11 shrink-0 rounded-xl border border-line bg-surface px-4 text-[13px] font-black text-ink hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-ink-mute"
        >
          차단해제
        </button>
      </div>

      {errorMessage ? (
        <div className="mt-3 rounded-2xl bg-surface px-3 py-2 text-[12px] font-black text-danger-tx ring-1 ring-[var(--color-danger-tx)]/25">
          {errorMessage}
        </div>
      ) : null}
    </section>
  );
}
