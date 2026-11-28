"use client";

// components/admin-live/AdminLiveLinkRequestsPanel.tsx
// [2026-09-09] «계정 연결 요청» 목록 — 손님이 카톡을 바꿔 계정이 갈라졌을 때 (1단계)
// [2026-11-26] 주소 자동 감지 폐지(같은 집 가족이 잘못 올라옴). 회원 상세 «예전 계정 합치기»가 주 경로.
// [2026-09-11 사장님 결정(폐기)] 손님한테 안 묻는다. 시스템이 «주소»로 알아내서 여기 올린다(자동 감지).
//
//   줄이 생기는 길 두 가지
//     · 자동 감지(source='auto')  DB 트리거 ruru_detect_split_account — 상세주소까지 같은 «다른 카톡·다른 번호» 회원이
//                                 생기면(카카오 배송지 동기화든 손님 직접 입력이든) 한 줄 올린다. 이름도 같으면 배지 추가.
//     · 손님 요청(source='customer') 예전 화면(09-09)에서 접수된 것. 지금 손님 화면은 접수 단계가 없어 새로 생기진 않는다.
//   사장님은 양쪽 주소·이름·마지막 주문을 보고 «같은 사람 맞다» 싶으면 [🔗 합치기] 한 번.
//
//   1단계에서 이 화면이 하는 일
//     · 요청 보여주기 (예전 계정에 주문 몇 건 · 포인트 얼마가 들어 있는지 같이)
//     · [병합 SQL 복사] — 오늘(용서린) 실제로 검증한 순서 그대로 만들어 준다. 실행은 사장님이 SQL Editor 에서.
//     · [처리함] / [아님] 표시
//   2단계에서 붙일 것: [합치기] 버튼 하나로 자동 병합 (돈이 움직이므로 그때 위험분석 다시)
//
//   ⚠ 이 파일은 포인트·주문·입금·정산·배송을 «쓰지» 않는다. customer_link_requests 상태만 바꾼다.

import { useCallback, useEffect, useState } from "react";
import { showAdminToast } from "@/lib/adminToast";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { formatKoreanPhone } from "@/lib/order/phone";

type LinkRequestRow = {
  id: string;
  nickname: string;
  claimed_phone: string;
  target_customer_id: number | null;
  target_customer_phone: string | null;
  target_customer_name: string | null;
  new_kakao_id: string | null;
  new_kakao_nickname: string | null;
  new_customer_phone: string | null;
  temp_nickname: string | null;
  status: string;
  admin_memo: string;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
  old_order_count?: number;
  old_points?: number;
  // [2026-09-11] 자동 감지
  source?: string;                 // 'auto' | 'customer'
  match_reasons?: string[];        // ['상세주소 같음', '이름 같음']
  new_customer_id?: number | null;
  old_address?: string;
  old_detail_address?: string;
  old_nickname?: string;
  new_address?: string;
  new_detail_address?: string;
  new_customer_name?: string;
  new_nickname?: string;
  old_last_order_at?: string;
  old_last_order_product?: string;
};

const isAuto = (row: LinkRequestRow) => String(row.source || "customer") === "auto";
// [2026-09-11] 대기 건수가 바뀌면(합침·아님·되돌림) 회원 탭 배지가 바로 따라오게 — 부모(AdminLiveCustomersPanel)가 듣는다
export const LINK_REQUESTS_CHANGED_EVENT = "ruru-link-requests-changed";
const notifyChanged = () => { try { window.dispatchEvent(new Event(LINK_REQUESTS_CHANGED_EVENT)); } catch {} };
const joinAddress = (base?: string, detail?: string) => [String(base || "").trim(), String(detail || "").trim()].filter(Boolean).join(" ");

const when = (value: unknown) => {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

// [2026-11-26] 합치기 실행 — 계정 잇기 목록·회원 상세 «예전 계정 합치기»가 같이 쓴다.
//   ① 미리보기(아무것도 안 바뀜) → ② 숫자 보여주고 승인 → ③ 실행. 실제 이동은 Postgres 함수 한 트랜잭션.
export async function runLinkMerge(requestId: string, label: string): Promise<boolean> {
  try {
    const res = await fetch("/api/admin-live/customer-link-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: requestId }),
    });
    const json = await res.json().catch(() => null);
    const p = json?.result as Record<string, any> | undefined;
    if (!json?.ok || !p?.ok) {
      const why = String(p?.reason || json?.reason || "");
      if (why === "new_side_has_money") {
        showAdminToast(`지금 계정에도 주문 ${Number(p?.new_orders || 0)}건이 있어서 자동으로 못 합쳐요.`, "warning");
        return false;
      }
      if (why === "old_not_found") { showAdminToast("예전 계정을 못 찾았어요.", "error"); return false; }
      if (why === "same_row") { showAdminToast("이미 같은 계정이에요.", "warning"); return false; }
      if (why === "not_pending") { showAdminToast("이미 처리된 요청이에요.", "warning"); return false; }
      showAdminToast("합치기 확인 실패" + (why ? ` (${why})` : ""), "error");
      return false;
    }
    const oldPts = Number(p.old_points || 0);
    const newPts = Number(p.new_points || 0);
    const lines = [
      `${label ? `「${label}」님 ` : ""}예전 계정을 지금 카톡 계정으로 합칩니다.`,
      ``,
      `예전 계정: ${formatKoreanPhone(p.old_phone)} ${p.old_name || ""} · 주문 ${Number(p.old_orders || 0).toLocaleString("ko-KR")}건`.trim(),
      `포인트: ${oldPts.toLocaleString("ko-KR")}P + 지금 계정 ${newPts.toLocaleString("ko-KR")}P = ${(oldPts + newPts).toLocaleString("ko-KR")}P`,
      p.will_change_phone ? `전화번호는 지금 계정 번호 ${formatKoreanPhone(p.new_phone)} 로 바뀝니다.` : null,
      ``,
      `백업을 남기고 한 번에 처리해요.`,
    ].filter((line): line is string => line !== null).join("\n");
    const ok = await showAdminConfirm(lines, { title: "계정 합치기", confirmText: "합치기", cancelText: "취소", tone: "warning" });
    if (!ok) return false;
    const res2 = await fetch("/api/admin-live/customer-link-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: requestId, confirm: true }),
    });
    const json2 = await res2.json().catch(() => null);
    const d = json2?.result as Record<string, any> | undefined;
    if (!json2?.ok || !d?.ok) {
      showAdminToast("합치기 실패 — 아무것도 바뀌지 않았어요." + (d?.reason ? ` (${d.reason})` : ""), "error");
      return false;
    }
    showAdminToast(`합쳤어요. 주문 ${Number(d.kept_orders || 0).toLocaleString("ko-KR")}건 · 포인트가 지금 계정으로 옮겨졌어요.`, "success");
    notifyChanged();
    return true;
  } catch {
    showAdminToast("합치기 중 문제가 생겼어요. 새로고침해 확인해 주세요.", "error");
    return false;
  }
}

export default function AdminLiveLinkRequestsPanel() {
  const [rows, setRows] = useState<LinkRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [merging, setMerging] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin-live/customer-link-requests", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (json?.ok) setRows((json.rows || []) as LinkRequestRow[]);
      else showAdminToast("계정 연결 요청을 못 불러왔습니다.", "error");
    } catch {
      showAdminToast("계정 연결 요청을 못 불러왔습니다.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const mark = async (id: string, status: "done" | "rejected" | "pending") => {
    try {
      const res = await fetch("/api/admin-live/customer-link-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error("fail");
      setRows((prev) => prev.map((row) => (row.id === id ? { ...row, status } : row)));
      notifyChanged();
      showAdminToast(status === "done" ? "처리함으로 표시했습니다." : status === "rejected" ? "«아님»으로 표시했습니다." : "대기중으로 되돌렸습니다.", "success");
    } catch {
      showAdminToast("표시를 저장하지 못했습니다.", "error");
    }
  };

  const mergeRow = async (row: LinkRequestRow) => {
    setMerging(row.id);
    try {
      const merged = await runLinkMerge(row.id, row.nickname || row.new_nickname || row.old_nickname || "");
      if (merged) void load();
    } finally {
      setMerging("");
    }
  };

  const pending = rows.filter((row) => row.status === "pending");
  const handled = rows.filter((row) => row.status !== "pending");
  const visible = showDone ? handled : pending;

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[14px] font-black text-ink">계정 잇기</div>
          <p className="mt-1 text-[12px] font-bold text-ink-soft">손님이 «예전 계정이에요» 하고 요청한 것만 올라와요.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-black text-ink-soft hover:text-rose-deep"
          >
            {showDone ? `대기중 ${pending.length}건 보기` : `처리한 것 ${handled.length}건 보기`}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-black text-ink-soft hover:text-rose-deep"
          >
            새로고침
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 rounded-xl bg-surface-2 px-4 py-8 text-center text-[13px] font-black text-ink-mute">불러오는 중…</div>
      ) : visible.length === 0 ? (
        <div className="mt-4 rounded-xl bg-surface-2 px-4 py-8 text-center text-[13px] font-black text-ink-mute">
          {showDone ? "처리한 요청이 없습니다." : "대기중인 요청이 없습니다."}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {visible.map((row) => (
            <div key={row.id} className="rounded-xl border border-line bg-surface-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-rose-deep px-2 py-0.5 text-[12px] font-black text-white">{row.nickname || row.new_nickname || row.old_nickname || "이름없음"}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${isAuto(row) ? "bg-warn-bg text-warn-tx" : "border border-line text-ink-soft"}`}>
                  {isAuto(row) ? "자동 감지" : "손님 요청"}
                </span>
                {(row.match_reasons || []).map((reason) => (
                  <span key={reason} className="rounded-full bg-ok-bg px-2 py-0.5 text-[11px] font-black text-ok-tx">{reason}</span>
                ))}
                <span className="text-[12px] font-bold text-ink-mute">{when(row.created_at)}</span>
                {row.status !== "pending" ? (
                  <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-black text-ink-soft">
                    {row.status === "done" ? "처리함" : "아님"}
                  </span>
                ) : null}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-line bg-surface p-3">
                  <div className="text-[12px] font-black text-ink-mute">예전 계정 (합칠 대상)</div>
                  <div className="mt-1 text-[13px] font-black text-ink">
                    {formatKoreanPhone(row.target_customer_phone)} · {row.target_customer_name || "이름없음"}
                  </div>
                  <div className="mt-1 text-[12px] font-bold text-ink-soft">
                    주문 <span className="text-rose-deep">{(row.old_order_count ?? 0).toLocaleString("ko-KR")}건</span>
                    {" · "}
                    포인트 <span className="text-rose-deep">{(row.old_points ?? 0).toLocaleString("ko-KR")}P</span>
                  </div>
                  {joinAddress(row.old_address, row.old_detail_address) ? (
                    <div className="mt-1 break-keep text-[12px] font-bold text-ink-soft">{joinAddress(row.old_address, row.old_detail_address)}</div>
                  ) : null}
                  {row.old_last_order_at ? (
                    <div className="mt-1 text-[12px] font-bold text-ink-mute">
                      마지막 주문 {when(row.old_last_order_at)}{row.old_last_order_product ? ` · ${row.old_last_order_product}` : ""}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-lg border border-line bg-surface p-3">
                  <div className="text-[12px] font-black text-ink-mute">지금 쓰는 계정 (새 카톡)</div>
                  <div className="mt-1 text-[13px] font-black text-ink">
                    {row.new_customer_phone ? formatKoreanPhone(row.new_customer_phone) : "번호 아직 없음"}
                    {row.new_customer_name ? ` · ${row.new_customer_name}` : ""}
                  </div>
                  <div className="mt-1 text-[12px] font-bold text-ink-soft">
                    카톡 {row.new_kakao_nickname || row.new_kakao_id || "-"}
                    {row.temp_nickname ? <> · 지금 이름 <span className="text-rose-deep">{row.temp_nickname}</span></> : null}
                  </div>
                  {joinAddress(row.new_address, row.new_detail_address) ? (
                    <div className="mt-1 break-keep text-[12px] font-bold text-ink-soft">{joinAddress(row.new_address, row.new_detail_address)}</div>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {row.status === "pending" ? (
                  <button
                    type="button"
                    disabled={merging === row.id}
                    onClick={() => void mergeRow(row)}
                    className="rounded-lg bg-rose-deep px-3 py-2 text-[12px] font-black text-white disabled:opacity-50"
                  >
                    {merging === row.id ? "확인 중…" : "합치기"}
                  </button>
                ) : null}
                {row.status === "pending" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void mark(row.id, "rejected")}
                      className="rounded-lg border border-line px-3 py-2 text-[12px] font-black text-ink-soft hover:text-danger-tx"
                    >
                      같은 사람 아님
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => void mark(row.id, "pending")}
                    className="rounded-lg border border-line px-3 py-2 text-[12px] font-black text-ink-soft hover:text-rose-deep"
                  >
                    대기중으로 되돌리기
                  </button>
                )}
              </div>


            </div>
          ))}
        </div>
      )}
    </div>
  );
}
