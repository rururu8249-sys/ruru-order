"use client";

// [2026-10-22 사장님] 텔레그램 결산 보내기 전 작은 창 — 포인트 사용금액을 직접 넣을 수 있다(비우면 실제 사용금액).
//   방송 종료 뒤 자동 발송·숫자 띠 「텔레그램」 버튼 둘 다 이 창을 거친다. 보내기는 부모(onSend)가.
import { useState } from "react";
import { parseManualPoint } from "@/lib/telegramReportFormat";

type Props = {
  title: string;
  /** 실제 포인트 사용금액(결제완료 기준) */
  pointUsedActual: number;
  /** 범위 설명 한 줄(예: 남녀공용의류 · 방송 시작~종료) */
  scopeLabel?: string;
  sending?: boolean;
  onSend: (pointUsedManual: number | null) => void | Promise<void>;
  onClose: () => void;
};

export default function TelegramReportSendModal({ title, pointUsedActual, scopeLabel, sending = false, onSend, onClose }: Props) {
  const [manual, setManual] = useState("");
  const manualValue = parseManualPoint(manual);
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="w-full max-w-[420px] rounded-xl bg-surface p-4" style={{ boxShadow: "0 8px 24px rgba(0,0,0,.08)" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-[20px] font-bold text-ink">{title}</h2>
            {scopeLabel ? <p className="mt-0.5 text-[13px] text-ink-soft">{scopeLabel}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="h-9 w-9 rounded-lg text-[18px] text-ink-mute hover:bg-surface-2">×</button>
        </div>
        <label className="mt-4 block text-[13px] font-semibold text-ink-mute">포인트 사용금액
          <input
            inputMode="numeric"
            value={manual}
            onChange={(e) => setManual(e.target.value.replace(/[^0-9]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ","))}
            placeholder={`비우면 실제 ${pointUsedActual.toLocaleString("ko-KR")}원`}
            className="mt-1.5 h-11 w-full rounded-lg border border-line bg-surface px-3 text-right text-[16px] font-bold text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
          />
        </label>
        <p className="mt-1.5 text-[12px] text-ink-mute">{manualValue == null ? `실제 사용금액 ${pointUsedActual.toLocaleString("ko-KR")}원으로 보내요` : `직접 입력한 ${manualValue.toLocaleString("ko-KR")}원으로 보내요`}</p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={sending} className="h-9 rounded-lg border border-line bg-surface px-4 text-[13px] font-semibold text-ink hover:bg-surface-2 disabled:opacity-50">안 보냄</button>
          <button type="button" onClick={() => void onSend(manualValue)} disabled={sending} className="h-10 rounded-lg bg-ink px-5 text-[14px] font-bold text-white disabled:opacity-50">{sending ? "보내는 중…" : "텔레그램 보내기"}</button>
        </div>
      </div>
    </div>
  );
}
