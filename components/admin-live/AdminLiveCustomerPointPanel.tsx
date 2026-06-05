"use client";

import { useEffect, useMemo, useState } from "react";

type PointPanelCustomer = {
  phone: string;
  nickname: string;
  name: string;
};

type PointLedgerRow = {
  id?: string;
  created_at?: string | null;
  change_type?: string | null;
  amount?: number | null;
  balance_after?: number | null;
  reason?: string | null;
  admin_memo?: string | null;
  customer_visible?: boolean | null;
};

type PointActionMode = "grant" | "deduct";

type PointFormState = {
  mode: PointActionMode;
  amount: string;
  reason: string;
  adminMemo: string;
  customerVisible: boolean;
};

type PointState = {
  loading: boolean;
  saving: boolean;
  errorMessage: string;
  statusMessage: string;
  currentPoints: number;
  currentPointsText: string;
  ledger: PointLedgerRow[];
};

const EMPTY_POINT_STATE: PointState = {
  loading: false,
  saving: false,
  errorMessage: "",
  statusMessage: "",
  currentPoints: 0,
  currentPointsText: "0원",
  ledger: [],
};

function digitsOnly(value: unknown) {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function money(value: unknown) {
  const amount = Math.floor(Number(value || 0));

  if (!Number.isFinite(amount)) {
    return "0원";
  }

  return `${amount.toLocaleString("ko-KR")}원`;
}

function commaNumberText(value: unknown) {
  const digits = digitsOnly(value).replace(/^0+(?=\d)/, "");

  if (!digits) return "";

  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function signedMoney(value: unknown) {
  const amount = Math.floor(Number(value || 0));

  if (!Number.isFinite(amount) || amount === 0) {
    return "0원";
  }

  return `${amount > 0 ? "+" : "-"}${Math.abs(amount).toLocaleString("ko-KR")}원`;
}

function formatPhone(value: unknown) {
  const phone = digitsOnly(value);

  if (phone.length === 11) {
    return `${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`;
  }

  if (phone.length === 10) {
    return `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
  }

  return clean(value) || "-";
}

function ledgerLabel(row: PointLedgerRow) {
  const amount = Number(row.amount || 0);

  if (row.change_type === "grant" || amount > 0) return "지급";
  if (row.change_type === "use") return "사용";
  if (row.change_type === "cancel") return "취소";
  if (row.change_type === "expire") return "만료";
  return "회수";
}

function dateLabel(value: unknown) {
  const raw = clean(value);

  if (!raw) return "-";

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return raw.slice(0, 16);
  }

  return date.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ledgerKey(row: PointLedgerRow, index: number) {
  return row.id || `${row.created_at || "point"}-${index}`;
}

function CustomerPointActionModal({
  customer,
  form,
  setForm,
  saving,
  errorMessage,
  onClose,
  onSubmit,
}: {
  customer: PointPanelCustomer;
  form: PointFormState;
  setForm: (value: PointFormState | ((current: PointFormState) => PointFormState)) => void;
  saving: boolean;
  errorMessage: string;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
}) {
  const isGrant = form.mode === "grant";
  const title = isGrant ? "포인트 지급" : "포인트 회수";
  const actionLabel = isGrant ? "지급" : "회수";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 px-4 py-6">
      <div className="w-full max-w-[520px] overflow-hidden rounded-[28px] bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
          <div className="text-lg font-black text-slate-950">{title}</div>
          <div className="mt-1 text-xs font-bold text-slate-500">
            {customer.nickname} · {customer.name} · {formatPhone(customer.phone)}
          </div>
        </div>

        <div className="space-y-4 p-5">
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500">{actionLabel} 포인트</span>
            <input
              value={commaNumberText(form.amount)}
              onChange={(event) => setForm((current) => ({ ...current, amount: commaNumberText(event.target.value) }))}
              inputMode="numeric"
              placeholder="예: 10,000"
              className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-lg font-black text-slate-950 outline-none focus:border-rose-line"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500">{actionLabel} 사유</span>
            <input
              value={form.reason}
              onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
              placeholder={isGrant ? "예: 방송 이벤트 당첨" : "예: 오지급 정정"}
              className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-bold text-slate-900 outline-none focus:border-rose-line"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500">관리자 메모</span>
            <textarea
              value={form.adminMemo}
              onChange={(event) => setForm((current) => ({ ...current, adminMemo: event.target.value }))}
              placeholder="관리자만 참고할 내용을 적어주세요."
              rows={3}
              className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-rose-line"
            />
          </label>

          <label className="flex items-center gap-3 rounded-2xl bg-rose-soft px-4 py-3 text-sm font-black text-rose-deep ring-1 ring-rose-line">
            <input
              type="checkbox"
              checked={form.customerVisible}
              onChange={(event) => setForm((current) => ({ ...current, customerVisible: event.target.checked }))}
              className="h-4 w-4"
            />
            고객 화면 포인트 알림에 표시
          </label>

          {errorMessage ? (
            <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-700 ring-1 ring-red-100">
              {errorMessage}
            </div>
          ) : null}

          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-xs font-bold leading-relaxed text-amber-800 ring-1 ring-amber-100">
            관리자 지급/회수 포인트는 정산에 바로 반영되지 않습니다. 고객이 주문서에서 실제 사용하는 단계는 나중에 별도 작업합니다.
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving}
            className={[
              "rounded-2xl px-5 py-2 text-sm font-black text-white shadow-sm disabled:opacity-50",
              isGrant ? "bg-rose-deep hover:bg-rose-deep" : "bg-slate-900 hover:bg-slate-700",
            ].join(" ")}
          >
            {saving ? "처리중..." : title}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminLiveCustomerPointPanel({ customer }: { customer: PointPanelCustomer }) {
  const phoneKey = useMemo(() => digitsOnly(customer.phone), [customer.phone]);
  const [pointState, setPointState] = useState<PointState>(EMPTY_POINT_STATE);
  const [form, setForm] = useState<PointFormState>({
    mode: "grant",
    amount: "",
    reason: "",
    adminMemo: "",
    customerVisible: true,
  });
  const [modalOpen, setModalOpen] = useState(false);

  const recentLedger = pointState.ledger.slice(0, 8);

  const loadPoints = async () => {
    if (!phoneKey) {
      setPointState({
        ...EMPTY_POINT_STATE,
        errorMessage: "전화번호가 없어 포인트를 조회할 수 없습니다.",
      });
      return;
    }

    setPointState((current) => ({
      ...current,
      loading: true,
      errorMessage: "",
    }));

    try {
      const response = await fetch(`/api/admin-live/customer-points?phone=${encodeURIComponent(phoneKey)}&limit=20`, {
        method: "GET",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || "포인트 조회 실패");
      }

      setPointState({
        loading: false,
        saving: false,
        errorMessage: "",
        statusMessage: "",
        currentPoints: Number(payload.current_points || 0),
        currentPointsText: clean(payload.current_points_text) || money(payload.current_points),
        ledger: Array.isArray(payload.ledger) ? payload.ledger : [],
      });
    } catch (error) {
      setPointState((current) => ({
        ...current,
        loading: false,
        saving: false,
        errorMessage: error instanceof Error ? error.message : "포인트 조회 실패",
      }));
    }
  };

  useEffect(() => {
    void loadPoints();
  }, [phoneKey]);

  const openModal = (mode: PointActionMode) => {
    setForm({
      mode,
      amount: "",
      reason: "",
      adminMemo: "",
      customerVisible: true,
    });
    setPointState((current) => ({
      ...current,
      errorMessage: "",
      statusMessage: "",
    }));
    setModalOpen(true);
  };

  const closeModal = () => {
    if (pointState.saving) return;
    setModalOpen(false);
  };

  const submitPointAction = async () => {
    if (!phoneKey) {
      setPointState((current) => ({
        ...current,
        errorMessage: "전화번호가 없어 포인트를 처리할 수 없습니다.",
      }));
      return;
    }

    setPointState((current) => ({
      ...current,
      saving: true,
      errorMessage: "",
      statusMessage: "",
    }));

    try {
      const response = await fetch("/api/admin-live/customer-points", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone: phoneKey,
          action: form.mode,
          amount: digitsOnly(form.amount),
          reason: form.reason,
          admin_memo: form.adminMemo,
          youtube_nickname: customer.nickname,
          customer_name: customer.name,
          customer_visible: form.customerVisible,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || "포인트 처리 실패");
      }

      setModalOpen(false);
      setPointState((current) => ({
        ...current,
        saving: false,
        statusMessage: payload.message || "포인트 처리가 완료되었습니다.",
        errorMessage: "",
      }));

      await loadPoints();
    } catch (error) {
      setPointState((current) => ({
        ...current,
        saving: false,
        errorMessage: error instanceof Error ? error.message : "포인트 처리 실패",
      }));
    }
  };

  return (
    <section className="mt-5 rounded-[24px] border border-rose-line bg-rose-soft/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-950">🪙 포인트</h3>
          <p className="mt-1 text-xs font-bold text-slate-500">
            회원별 포인트 지급/회수와 최근 이력을 확인합니다.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadPoints()}
          disabled={pointState.loading || pointState.saving}
          className="rounded-xl border border-rose-line bg-white px-3 py-2 text-xs font-black text-rose-deep hover:bg-rose-soft disabled:opacity-50"
        >
          새로고침
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr]">
        <div className="rounded-[22px] bg-white p-4 ring-1 ring-rose-line">
          <div className="text-xs font-black text-slate-500">현재 포인트</div>
          <div className="mt-2 text-[30px] font-black tracking-[-0.06em] text-rose-deep">
            {pointState.loading ? "불러오는중..." : pointState.currentPointsText}
          </div>
          <div className="mt-2 text-xs font-bold leading-relaxed text-slate-500">
            지급/회수는 포인트 잔액과 이력만 변경합니다. 정산·입금·주문금액에는 아직 반영하지 않습니다.
          </div>
        </div>

        <div className="grid content-start gap-2 rounded-[22px] bg-white p-4 ring-1 ring-rose-line">
          <button
            type="button"
            onClick={() => openModal("grant")}
            disabled={pointState.loading || pointState.saving || !phoneKey}
            className="rounded-2xl bg-rose-deep px-4 py-3 text-sm font-black text-white hover:bg-rose-deep disabled:opacity-50"
          >
            포인트 지급
          </button>
          <button
            type="button"
            onClick={() => openModal("deduct")}
            disabled={pointState.loading || pointState.saving || !phoneKey}
            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white hover:bg-slate-700 disabled:opacity-50"
          >
            포인트 회수
          </button>
        </div>
      </div>

      {pointState.statusMessage ? (
        <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700 ring-1 ring-emerald-100">
          {pointState.statusMessage}
        </div>
      ) : null}

      {pointState.errorMessage ? (
        <div className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-700 ring-1 ring-red-100">
          {pointState.errorMessage}
        </div>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-2xl border border-rose-line bg-white">
        <div className="flex items-center justify-between border-b border-rose-line px-4 py-3">
          <div className="text-sm font-black text-slate-900">최근 포인트 이력</div>
          <div className="text-xs font-bold text-slate-400">{recentLedger.length.toLocaleString("ko-KR")}건 표시</div>
        </div>

        {recentLedger.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm font-bold text-slate-400">
            아직 포인트 이력이 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentLedger.map((item, index) => (
              <div key={ledgerKey(item, index)} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[96px_72px_150px_minmax(0,1fr)]">
                <div className="font-bold text-slate-500">{dateLabel(item.created_at)}</div>
                <div className="font-black text-slate-900">{ledgerLabel(item)}</div>
                <div className={Number(item.amount || 0) >= 0 ? "whitespace-nowrap text-right font-black tabular-nums text-rose-deep" : "whitespace-nowrap text-right font-black tabular-nums text-red-600"}>
                  {signedMoney(item.amount)}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-bold text-slate-700">
                    처리 후 {money(item.balance_after)}
                  </div>
                  <div className="mt-1 truncate text-xs font-bold text-slate-400">
                    {item.reason || item.admin_memo || "사유 없음"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen ? (
        <CustomerPointActionModal
          customer={customer}
          form={form}
          setForm={setForm}
          saving={pointState.saving}
          errorMessage={pointState.errorMessage}
          onClose={closeModal}
          onSubmit={submitPointAction}
        />
      ) : null}
    </section>
  );
}
