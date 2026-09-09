"use client";

// components/admin-live/AdminLiveLinkRequestsPanel.tsx
// [2026-09-09] «계정 연결 요청» 목록 — 손님이 카톡을 바꿔 계정이 갈라졌을 때 (1단계)
//
//   손님 쪽에서 «예전 번호»로 본인 확인을 마친 요청만 여기 쌓인다(번호가 틀리면 접수 자체가 안 됨).
//   사장님은 한 줄을 보고 «같은 사람 맞다» 싶으면 합치면 된다.
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
};

const when = (value: unknown) => {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

// 오늘(2026-09-09 용서린) 실제로 돌려서 검증한 순서 그대로. 안전핀(where 조건)이 들어 있어
// 상태가 다르면 0건으로 지나간다. 반드시 [0] 결과를 눈으로 본 뒤 아래를 돌릴 것.
function buildMergeSql(row: LinkRequestRow) {
  const oldPhone = String(row.target_customer_phone || "").replace(/[^0-9]/g, "");
  const newPhone = String(row.new_customer_phone || "").replace(/[^0-9]/g, "");
  const kakao = String(row.new_kakao_id || "");
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return [
    `-- [${stamp}] 「${row.nickname}」 계정 합치기 (관리자 화면에서 생성)`,
    `--   옛 줄: ${oldPhone} (${row.target_customer_name || "이름없음"}) · 주문 ${row.old_order_count ?? "?"}건 · 포인트 ${(row.old_points ?? 0).toLocaleString("ko-KR")}`,
    `--   새 줄: ${newPhone || "(번호없음)"} · 카톡 ${kakao || "(없음)"}`,
    `--   방향: 옛 줄을 살리고 카톡ID·번호를 그쪽으로 옮긴다 (포인트 ledger 가 옛 줄에 묶여 있어 이동이 최소)`,
    `--   ★ 순서 중요: 카톡ID 를 «먼저» 넣어야 번호를 바꿀 때 트리거가 orders.kakao_id 에 도장을 찍는다`,
    ``,
    `-- [0] 실행 전 상태 확인 — 여기부터 «먼저» 돌려보고 예상과 같은지 눈으로 볼 것`,
    `select id, customer_phone, customer_name, youtube_nickname, kakao_id`,
    `from customers where customer_phone in ('${oldPhone}','${newPhone}') order by id;`,
    ``,
    `-- [1] 백업`,
    `create table if not exists customers_backup_${stamp}_${oldPhone} as`,
    `select * from customers where customer_phone in ('${oldPhone}','${newPhone}');`,
    ``,
    `-- [2] 옛 줄에 카톡ID «먼저» (번호는 아직 그대로라 트리거는 안 돈다)`,
    `update customers set kakao_id = '${kakao}'`,
    `where customer_phone = '${oldPhone}' and coalesce(trim(kakao_id),'') = '';`,
    ``,
    `-- [3] 새 줄 삭제 — 번호를 비워줘야 [4] 에서 옛 줄이 그 번호를 가져갈 수 있다`,
    `delete from customers where customer_phone = '${newPhone}' and kakao_id = '${kakao}';`,
    ``,
    `-- [4] 옛 줄의 번호를 새 번호로 → 여기서 트리거가 포인트·차단·orders.kakao_id 를 옮긴다`,
    `update customers set customer_phone = '${newPhone}' where customer_phone = '${oldPhone}';`,
    ``,
    `-- [5] 주문의 전화번호도 새 번호로 (트리거는 주문 번호를 안 바꾼다)`,
    `update orders set customer_phone = '${newPhone}' where customer_phone = '${oldPhone}';`,
    `update orders set phone = '${newPhone}' where phone = '${oldPhone}';`,
    ``,
    `-- [6] 받는사람 번호는 «주문자와 같았던 것»만 (선물 배송지 보호)`,
    `update orders set recipient_phone = '${newPhone}' where recipient_phone = '${oldPhone}';`,
    ``,
    `-- [7] 확인`,
    `select id, customer_phone, customer_name, youtube_nickname, kakao_id from customers where customer_phone = '${newPhone}';`,
    `select count(*) as "주문수", count(*) filter (where coalesce(trim(kakao_id),'') <> '') as "카톡ID찍힘"`,
    `from orders where customer_phone = '${newPhone}';`,
  ].join("\n");
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
      showAdminToast(status === "done" ? "처리함으로 표시했습니다." : status === "rejected" ? "«아님»으로 표시했습니다." : "대기중으로 되돌렸습니다.", "success");
    } catch {
      showAdminToast("표시를 저장하지 못했습니다.", "error");
    }
  };

  // [2026-09-09 2단계] [합치기] — 먼저 «미리보기»로 무슨 일이 일어날지 숫자로 보여주고, 승인해야 실행한다.
  //   ⚠ 여기가 «돈»이다. 실제 이동은 전부 Postgres 함수 한 트랜잭션 안에서 일어난다(반쪽 병합 불가).
  const mergeRow = async (row: LinkRequestRow) => {
    setMerging(row.id);
    try {
      // ① 미리보기 (아무것도 안 바꾼다)
      const res = await fetch("/api/admin-live/customer-link-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id }),
      });
      const json = await res.json().catch(() => null);
      const p = json?.result as Record<string, any> | undefined;

      if (!json?.ok || !p?.ok) {
        const why = String(p?.reason || json?.reason || "");
        if (why === "new_side_has_money") {
          showAdminToast(
            `새 계정에도 주문 ${p?.new_orders ?? 0}건 · 포인트 ${(p?.new_points ?? 0).toLocaleString("ko-KR")}P 가 있어 자동 합치기를 멈췄습니다.\n\n양쪽 돈을 합치는 판단이 필요해요 — [병합 SQL 복사]로 직접 확인해 주세요.`,
            "warning",
          );
          return;
        }
        if (why === "old_not_found") { showAdminToast("예전 계정을 못 찾았습니다. 번호가 이미 바뀌었을 수 있어요.", "error"); return; }
        if (why === "not_pending") { showAdminToast("이미 처리된 요청입니다.", "warning"); void load(); return; }
        showAdminToast("합치기 미리보기 실패" + (why ? `\n\n${why}` : ""), "error");
        return;
      }

      // ② 사장님 승인 — 실제 숫자를 그대로 보여준다
      const lines = [
        `「${row.nickname}」님 계정을 합칩니다.`,
        ``,
        `남길 계정 : ${formatKoreanPhone(p.old_phone)} ${p.old_name || ""}`.trim(),
        `  · 주문 ${Number(p.old_orders || 0).toLocaleString("ko-KR")}건`,
        `  · 포인트 ${Number(p.old_points || 0).toLocaleString("ko-KR")}P`,
        ``,
        p.will_change_phone ? `번호를 ${formatKoreanPhone(p.old_phone)} → ${formatKoreanPhone(p.new_phone)} 로 바꿉니다.` : `번호는 그대로 둡니다.`,
        p.will_delete_new_row ? `지금 쓰는 빈 계정 줄은 지웁니다(주문·포인트 0).` : `지울 계정 줄은 없습니다.`,
        ``,
        `포인트와 주문은 «없어지지 않고» 이 계정으로 따라갑니다.`,
        `되돌릴 수 있게 백업을 먼저 남깁니다.`,
      ].join("\n");

      const ok = await showAdminConfirm(lines, { title: "계정 합치기", confirmText: "합치기", cancelText: "취소", tone: "warning" });
      if (!ok) return;

      // ③ 실행
      const res2 = await fetch("/api/admin-live/customer-link-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, confirm: true }),
      });
      const json2 = await res2.json().catch(() => null);
      const d = json2?.result as Record<string, any> | undefined;
      if (!json2?.ok || !d?.ok) {
        showAdminToast("합치기 실패 — 아무것도 바뀌지 않았습니다." + (d?.reason ? `\n\n${d.reason}` : ""), "error");
        return;
      }
      showAdminToast(
        `합쳤습니다. ${formatKoreanPhone(d.final_phone)} 한 줄로 · 주문 ${Number(d.kept_orders || 0).toLocaleString("ko-KR")}건 · 포인트 ${Number(d.kept_points || 0).toLocaleString("ko-KR")}P`,
        "success",
      );
      void load();
    } catch {
      showAdminToast("합치기 중 문제가 생겼습니다. 목록을 새로고침해 확인해 주세요.", "error");
    } finally {
      setMerging("");
    }
  };

  const copySql = async (row: LinkRequestRow) => {
    try {
      await navigator.clipboard.writeText(buildMergeSql(row));
      showAdminToast("병합 SQL 을 복사했습니다. Supabase SQL Editor 에 붙여넣고 «[0] 확인»부터 돌려보세요.", "success");
    } catch {
      showAdminToast("복사에 실패했습니다.", "error");
    }
  };

  const pending = rows.filter((row) => row.status === "pending");
  const handled = rows.filter((row) => row.status !== "pending");
  const visible = showDone ? handled : pending;

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[14px] font-black text-ink">🔗 계정 연결 요청</div>
          <p className="mt-1 text-[12px] font-bold leading-relaxed text-ink-soft">
            손님이 카톡을 바꿔 회원이 갈라졌을 때, 손님이 «예전 번호»로 본인 확인을 마친 요청만 여기 쌓입니다.
            <br />
            번호가 틀리면 접수 자체가 안 되니, 여기 뜬 줄은 «같은 사람일 가능성이 높은» 줄입니다.
          </p>
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
                <span className="rounded-full bg-rose-deep px-2 py-0.5 text-[12px] font-black text-white">{row.nickname}</span>
                <span className="text-[12px] font-bold text-ink-mute">{when(row.created_at)} 요청</span>
                {row.status !== "pending" ? (
                  <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-black text-ink-soft">
                    {row.status === "done" ? "처리함" : "아님"}
                  </span>
                ) : null}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-line bg-surface p-3">
                  <div className="text-[11px] font-black text-ink-mute">예전 계정 (합칠 대상)</div>
                  <div className="mt-1 text-[13px] font-black text-ink">
                    {formatKoreanPhone(row.target_customer_phone)} · {row.target_customer_name || "이름없음"}
                  </div>
                  <div className="mt-1 text-[12px] font-bold text-ink-soft">
                    주문 <span className="text-rose-deep">{(row.old_order_count ?? 0).toLocaleString("ko-KR")}건</span>
                    {" · "}
                    포인트 <span className="text-rose-deep">{(row.old_points ?? 0).toLocaleString("ko-KR")}P</span>
                  </div>
                </div>

                <div className="rounded-lg border border-line bg-surface p-3">
                  <div className="text-[11px] font-black text-ink-mute">지금 쓰는 계정 (새 카톡)</div>
                  <div className="mt-1 text-[13px] font-black text-ink">
                    {row.new_customer_phone ? formatKoreanPhone(row.new_customer_phone) : "번호 아직 없음"}
                  </div>
                  <div className="mt-1 text-[12px] font-bold text-ink-soft">
                    카톡 {row.new_kakao_id || "-"}
                    {row.temp_nickname ? <> · 지금 이름 <span className="text-rose-deep">{row.temp_nickname}</span></> : null}
                  </div>
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
                    {merging === row.id ? "확인 중…" : "🔗 합치기"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void copySql(row)}
                  className="rounded-lg border border-line px-3 py-2 text-[12px] font-black text-ink-soft hover:text-rose-deep"
                >
                  병합 SQL 복사
                </button>
                {row.status === "pending" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void mark(row.id, "done")}
                      className="rounded-lg border border-line px-3 py-2 text-[12px] font-black text-ink-soft hover:text-rose-deep"
                    >
                      합쳤음 (처리함)
                    </button>
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

              <p className="mt-2 text-[11px] font-bold leading-relaxed text-ink-mute">
                <b>[🔗 합치기]</b>를 누르면 먼저 «무엇이 어떻게 바뀌는지» 숫자로 보여주고, 사장님이 승인해야 실행됩니다.
                실행은 한 번에(중간에 멈추지 않게) 처리되고 되돌릴 수 있게 백업이 남습니다.
                새 계정에도 주문·포인트가 있으면 자동으로 멈추니, 그때만 «병합 SQL 복사»로 직접 확인하세요.
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
