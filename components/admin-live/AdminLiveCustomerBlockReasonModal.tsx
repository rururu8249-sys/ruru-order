"use client";

// components/admin-live/AdminLiveCustomerBlockReasonModal.tsx
// 목적: 고객 차단사유 입력 패널 팝업
// 주의: 브라우저 alert/confirm/prompt 사용 금지. 주문/입금/배송/정산 로직 없음.

import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  nickname: string;
  name: string;
  phone: string;
  defaultReason?: string;
  saving?: boolean;
  errorMessage?: string;
  onClose: () => void;
  onSubmit: (reason: string) => void;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function digitsOnly(value: unknown) {
  return clean(value).replace(/\D/g, "");
}

function formatPhone(value: unknown) {
  const digits = digitsOnly(value);

  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;

  return clean(value) || "-";
}

export default function AdminLiveCustomerBlockReasonModal({
  open,
  nickname,
  name,
  phone,
  defaultReason = "",
  saving = false,
  errorMessage = "",
  onClose,
  onSubmit,
}: Props) {
  const [reason, setReason] = useState(defaultReason);

  useEffect(() => {
    if (open) setReason(defaultReason || "");
  }, [defaultReason, open]);

  if (!open) return null;

  const reasonText = clean(reason);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 px-4">
      <section className="w-full max-w-[520px] rounded-[28px] border border-danger-tx bg-surface p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-black tracking-[0.18em] text-red-500">BLOCK REASON</div>
            <h2 className="mt-1 text-2xl font-black tracking-[-0.04em] text-ink">차단사유 입력</h2>
            <p className="mt-2 text-sm font-bold text-ink-soft">
              차단은 사유를 남겨야 나중에 고객 응대할 때 헷갈리지 않습니다.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-black text-ink-soft hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-ink-mute"
          >
            닫기
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-surface-2 p-4 text-sm font-bold text-ink-soft">
          <div>닉네임: <span className="font-black text-ink">{nickname || "-"}</span></div>
          <div>이름: <span className="font-black text-ink">{name || "-"}</span></div>
          <div>전화번호: <span className="font-black text-ink">{formatPhone(phone)}</span></div>
        </div>

        <label className="mt-4 block">
          <span className="text-sm font-black text-ink">차단사유</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="예: 환불 악용, 반복 미입금, 악성 문의 등"
            className="mt-2 min-h-[120px] w-full resize-none rounded-2xl border border-line bg-surface p-3 text-sm font-bold text-ink outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100"
          />
        </label>

        {errorMessage ? (
          <div className="mt-3 rounded-2xl bg-danger-bg px-3 py-2 text-sm font-black text-danger-tx">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-11 rounded-xl border border-line bg-surface px-5 text-sm font-black text-ink-soft hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-ink-mute"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onSubmit(reasonText)}
            disabled={saving || !reasonText}
            className="h-11 rounded-xl bg-red-600 px-5 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-200"
          >
            {saving ? "저장중..." : "차단 저장"}
          </button>
        </div>
      </section>
    </div>
  );
}
