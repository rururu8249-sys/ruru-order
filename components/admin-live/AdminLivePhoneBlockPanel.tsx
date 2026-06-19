"use client";

// components/admin-live/AdminLivePhoneBlockPanel.tsx
// 목적: 고객관리에서 전화번호만 입력해 기존 고객 차단/차단해제
// 주의: 브라우저 alert/confirm/prompt 사용 금지. 주문/입금/배송/정산 로직 없음.

import { useState } from "react";

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

  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;

  return String(value ?? "").trim();
}

export default function AdminLivePhoneBlockPanel({ onSaved }: Props) {
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const submit = async (blocked: boolean) => {
    const phoneDigits = digitsOnly(phone);
    const finalReason = blocked ? reason.trim() : "";

    setMessage("");
    setErrorMessage("");

    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      setErrorMessage("전화번호는 숫자 기준 10~11자리로 입력해주세요.");
      return;
    }

    if (blocked && !finalReason) {
      setErrorMessage("차단사유를 입력해주세요.");
      return;
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

      setMessage(
        `${formatPhone(phoneDigits)} · ${blocked ? "차단" : "차단해제"} 완료 · ${
          Number(payload.matchedCount || 0) > 0
            ? `${Number(payload.matchedCount || 0).toLocaleString("ko-KR")}명 반영`
            : "전화번호 전용 차단 저장"
        }`
      );

      if (!blocked) setReason("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "전화번호 차단 처리 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-[24px] border border-danger-tx bg-danger-bg p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-black tracking-[0.16em] text-red-500">PHONE BLOCK</div>
          <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-ink">전화번호 직접 차단</h2>
          <p className="mt-1 text-[12px] font-bold text-red-600">
            주문 이력이 없는 번호도 전화번호 전용 차단으로 저장합니다.
          </p>
        </div>

        {message ? (
          <div className="rounded-xl bg-surface px-3 py-2 text-[12px] font-black text-danger-tx ring-1 ring-red-100">
            {message}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="01012345678"
          inputMode="numeric"
          className="h-11 w-full min-w-0 rounded-xl border border-danger-tx bg-surface px-3 text-[13px] font-black text-ink outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100 sm:w-44"
        />

        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="차단사유 입력"
          className="h-11 min-w-[150px] flex-1 rounded-xl border border-danger-tx bg-surface px-3 text-[13px] font-bold text-ink outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100"
        />

        <button
          type="button"
          disabled={saving}
          onClick={() => submit(true)}
          className="h-11 shrink-0 rounded-xl bg-red-600 px-4 text-[13px] font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-200"
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
        <div className="mt-3 rounded-2xl bg-surface px-3 py-2 text-[12px] font-black text-danger-tx ring-1 ring-red-100">
          {errorMessage}
        </div>
      ) : null}
    </section>
  );
}
