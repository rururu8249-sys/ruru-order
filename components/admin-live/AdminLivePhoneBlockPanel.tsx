"use client";

// components/admin-live/AdminLivePhoneBlockPanel.tsx
// 목적: 고객관리에서 전화번호만 입력해 기존 고객 차단/차단해제
// 주의: customers 테이블의 기존 고객만 처리. 주문/입금/배송/정산 로직 없음.

import { useState } from "react";

type BlockResult = {
  phone: string;
  blocked: boolean;
  reason: string;
  matchedCount?: number;
};

type Props = {
  onSaved: (result: BlockResult) => void;
};

function digitsOnly(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function formatPhone(value: unknown) {
  const digits = digitsOnly(value);

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return String(value ?? "").trim();
}

export default function AdminLivePhoneBlockPanel({ onSaved }: Props) {
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastMessage, setLastMessage] = useState("");

  const submit = async (blocked: boolean) => {
    const phoneDigits = digitsOnly(phone);

    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      alert("전화번호는 숫자 기준 10~11자리로 입력해주세요.");
      return;
    }

    const finalReason = blocked ? reason.trim() || "전화번호 직접 차단" : "";

    if (blocked && !confirm(`${formatPhone(phoneDigits)} 번호를 차단할까요?`)) return;
    if (!blocked && !confirm(`${formatPhone(phoneDigits)} 번호를 차단해제할까요?`)) return;

    setSaving(true);
    setLastMessage("");

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
      });

      setLastMessage(
        `${formatPhone(phoneDigits)} · ${blocked ? "차단" : "차단해제"} 완료 · ${Number(payload.matchedCount || 0).toLocaleString("ko-KR")}명 반영`
      );

      if (!blocked) setReason("");
    } catch (error) {
      alert(error instanceof Error ? error.message : "전화번호 차단 처리 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-[24px] border border-red-100 bg-red-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-black tracking-[0.16em] text-red-500">PHONE BLOCK</div>
          <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-slate-950">전화번호 직접 차단</h2>
          <p className="mt-1 text-[12px] font-bold text-red-600">
            기존 customers 테이블에 등록된 고객 전화번호만 차단/차단해제합니다.
          </p>
        </div>

        {lastMessage ? (
          <div className="rounded-xl bg-white px-3 py-2 text-[12px] font-black text-red-700 ring-1 ring-red-100">
            {lastMessage}
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 lg:grid-cols-[180px_1fr_110px_110px]">
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="01012345678"
          inputMode="numeric"
          className="h-11 rounded-xl border border-red-100 bg-white px-3 text-[13px] font-black text-slate-800 outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100"
        />

        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="차단사유 입력"
          className="h-11 rounded-xl border border-red-100 bg-white px-3 text-[13px] font-bold text-slate-800 outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100"
        />

        <button
          type="button"
          disabled={saving}
          onClick={() => submit(true)}
          className="h-11 rounded-xl bg-red-600 px-3 text-[13px] font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-200"
        >
          차단
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={() => submit(false)}
          className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          차단해제
        </button>
      </div>
    </section>
  );
}
